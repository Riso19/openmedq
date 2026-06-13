import React, { useState, useCallback } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  StyleSheet, 
  ActivityIndicator, 
  Pressable,
  Image
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth, useUser } from '@clerk/expo';
import { useFocusEffect } from 'expo-router';
import { Flame, RefreshCw } from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';
import { API_URL } from '@/lib/api';
import { SyncManager } from '@/lib/SyncManager';
import { getCurrentMonthStr, getMonthStr, getLevelInfo } from '@openmedq/shared';

interface LeaderboardItem {
  rank: number;
  userId: string;
  displayName: string;
  dopa: number;
  lifetimeDopa: number;
  streakDays: number;
}

let localLeaderboardCache: Record<string, { timestamp: number; data: any }> = {};

const getBadgeSource = (badgeUrl: string) => {
  if (badgeUrl.includes('seeker-badge-1')) return require('../../../assets/images/badge/seeker-badge-1.png');
  if (badgeUrl.includes('scribe-badge-2')) return require('../../../assets/images/badge/scribe-badge-2.png');
  if (badgeUrl.includes('medic-badge-3')) return require('../../../assets/images/badge/medic-badge-3.png');
  if (badgeUrl.includes('scholar-badge-4')) return require('../../../assets/images/badge/scholar-badge-4.png');
  if (badgeUrl.includes('savant-badge-5')) return require('../../../assets/images/badge/savant-badge-5.png');
  if (badgeUrl.includes('prodigy-6') || badgeUrl.includes('prodigy')) return require('../../../assets/images/badge/prodigy-6.png');
  return require('../../../assets/images/badge/seeker-badge-1.png');
};

export default function LeaderboardScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  
  // Clerk Auth Hook
  const { getToken, isSignedIn, userId } = useAuth();
  const { user } = useUser();

  const [leaderboard, setLeaderboard] = useState<LeaderboardItem[]>([]);
  const [currentUserRank, setCurrentUserRank] = useState<LeaderboardItem | null>(null);
  const [month, setMonth] = useState<string>(getCurrentMonthStr());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLeaderboard = useCallback(async (force = false) => {
    try {
      if (!force && localLeaderboardCache[month]) {
        const now = Date.now();
        if (now - localLeaderboardCache[month].timestamp < 300000) { // 5 minutes stale time
          const body = localLeaderboardCache[month].data;
          const list: LeaderboardItem[] = body.leaderboard || [];
          setLeaderboard(list);
          
          if (userId) {
            const userEntry = list.find(item => item.userId === userId);
            if (userEntry) {
              setCurrentUserRank(userEntry);
            } else if (body.userRankInfo) {
              setCurrentUserRank(body.userRankInfo);
            } else {
              setCurrentUserRank(null);
            }
          } else {
            setCurrentUserRank(null);
          }
          setLoading(false);
          setError(null);
          return;
        }
      }

      setLoading(true);
      setError(null);

      // Get sync token if signed in via Clerk
      const token = isSignedIn ? await getToken() : null;

      // If signed in, trigger a background D1 sync to push any offline DOPA/progress first
      if (token) {
        try {
          let profile = undefined;
          if (user) {
            profile = {
              displayName: user.fullName || user.username || undefined,
              email: user.primaryEmailAddress?.emailAddress || undefined,
            };
          }
          await SyncManager.syncWithD1(getToken, undefined, profile, force);
        } catch (syncErr) {
          console.warn('Background sync before leaderboard fetch failed:', syncErr);
        }
      }

      const baseUrl = API_URL;
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`${baseUrl}/api/leaderboard?month=${month}`, {
        method: 'GET',
        headers
      });

      if (!res.ok) {
        throw new Error('Failed to retrieve leaderboard data');
      }

      const body = await res.json();
      if (body.success && Array.isArray(body.leaderboard)) {
        localLeaderboardCache[month] = {
          timestamp: Date.now(),
          data: body
        };
        const list: LeaderboardItem[] = body.leaderboard || [];
        setLeaderboard(list);
        
        // Find if user is in leaderboard, or extract userRankInfo from body
        if (userId) {
          const userEntry = list.find(item => item.userId === userId);
          if (userEntry) {
            setCurrentUserRank(userEntry);
          } else if (body.userRankInfo) {
            setCurrentUserRank(body.userRankInfo);
          } else {
            setCurrentUserRank(null);
          }
        } else {
          setCurrentUserRank(null);
        }
      } else {
        throw new Error('Malformed API response');
      }
    } catch (err: any) {
      console.warn('Leaderboard fetch failed:', err);
      setError(err.message || 'Error pulling leaderboard rankings.');
    } finally {
      setLoading(false);
    }
  }, [isSignedIn, userId, month, user, getToken]);

  useFocusEffect(
    useCallback(() => {
      Promise.resolve().then(() => {
        fetchLeaderboard(false);
      });
    }, [fetchLeaderboard])
  );

  const topThree = leaderboard.slice(0, 3);
  const others = leaderboard.slice(3);

  // Position order for podium: [2nd, 1st, 3rd]
  const podiumOrder: LeaderboardItem[] = [];
  if (topThree[1]) podiumOrder.push(topThree[1]); // 2nd place
  if (topThree[0]) podiumOrder.push(topThree[0]); // 1st place
  if (topThree[2]) podiumOrder.push(topThree[2]); // 3rd place

  const renderPodium = () => {
    if (topThree.length === 0) return null;
    return (
      <View style={styles.podiumContainer}>
        {podiumOrder.map((user) => {
          const isGold = user.rank === 1;
          const isBronze = user.rank === 3;
          const level = getLevelInfo(user.dopa);
          const isCurrentUser = userId && user.userId === userId;

          let cardBg: string = theme.backgroundElement;
          let textColor: string = theme.text;
          let borderColor: string = theme.hairline;
          let borderWidth = 1;
          let medalBg = '#B0B0B0'; // Silver
          let medalText = '#333333';

          if (isGold) {
            cardBg = theme.teal;
            textColor = theme.background;
            borderColor = theme.ochre;
            borderWidth = 2;
            medalBg = theme.ochre;
            medalText = '#0a0a0a';
          } else if (isBronze) {
            medalBg = '#CD7F32';
            medalText = '#ffffff';
          }

          return (
            <View
              key={user.userId}
              style={[
                styles.podiumCol,
                isGold && styles.podiumCol1st,
                { 
                  backgroundColor: cardBg, 
                  borderColor: isCurrentUser ? theme.pink : borderColor,
                  borderWidth: isCurrentUser ? 2 : borderWidth 
                }
              ]}
            >
              {/* Rank Circle Medal */}
              <View style={[styles.podiumMedal, { backgroundColor: medalBg }]}>
                <Text style={[styles.podiumMedalText, { color: medalText }]}>{user.rank}</Text>
              </View>

              {/* Badge Image */}
              <Image 
                source={getBadgeSource(level.badgeUrl)}
                style={[styles.podiumBadge, isGold && { width: 44, height: 44 }]}
                resizeMode="contain"
              />

              {/* User Name */}
              <Text 
                numberOfLines={1} 
                ellipsizeMode="tail" 
                style={[styles.podiumName, { color: textColor, fontWeight: isCurrentUser ? 'bold' : 'normal' }]}
              >
                {user.displayName}
              </Text>

              {/* Level Name */}
              <Text numberOfLines={1} style={[styles.podiumLevelName, { color: isGold ? '#a4d4c5' : theme.textSecondary }]}>
                {level.name}
              </Text>

              {/* Dopa Score */}
              <Text style={[styles.podiumDopa, { color: isGold ? theme.peach : theme.pink }]}>
                {user.dopa} Dopa
              </Text>
            </View>
          );
        })}
      </View>
    );
  };

  const renderListHeader = () => {
    return (
      <View style={{ marginBottom: 12 }}>
        {renderPodium()}
        {others.length > 0 && (
          <Text style={[styles.sectionHeading, { color: theme.textSecondary }]}>
            RANKINGS
          </Text>
        )}
      </View>
    );
  };

  const renderItem = ({ item }: { item: LeaderboardItem }) => {
    const isCurrentUser = userId && item.userId === userId;
    const level = getLevelInfo(item.dopa);
    
    return (
      <View 
        style={[
          styles.row, 
          { 
            backgroundColor: theme.backgroundElement, 
            borderColor: isCurrentUser ? theme.pink : theme.hairline,
            borderWidth: isCurrentUser ? 2 : 1 
          }
        ]}
      >
        <View style={styles.leftCol}>
          <Text style={[styles.rankText, { color: theme.textSecondary }]}>#{item.rank}</Text>
          
          <Image 
            source={getBadgeSource(level.badgeUrl)}
            style={styles.listBadge}
          />
          
          <View style={styles.nameAndLevel}>
            <Text style={[styles.nameText, { color: theme.text, fontWeight: isCurrentUser ? 'bold' : 'normal' }]}>
              {item.displayName} {isCurrentUser ? '(You)' : ''}
            </Text>
            <Text style={[styles.levelLabelText, { color: theme.textSecondary }]}>
              Level {level.level} • {level.name}
            </Text>
          </View>
        </View>

        <View style={styles.rightCol}>
          <Text style={[styles.dopaText, { color: theme.text }]}>{item.dopa} DOPA</Text>
          {item.streakDays > 0 && (
            <View style={styles.streakWrapper}>
              <Flame size={12} color={theme.pink} />
              <Text style={[styles.streakText, { color: theme.textSecondary }]}>{item.streakDays}</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: Math.max(insets.top, 16) }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]}>Leaderboard</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Study consistently to earn Dopa XP. Resets monthly.
          </Text>
        </View>
        <Pressable 
          onPress={() => fetchLeaderboard(true)}
          style={({ pressed }) => [
            styles.refreshButton,
            { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 }
          ]}
        >
          <RefreshCw size={14} color={theme.text} />
        </Pressable>
      </View>

      {/* Month Selection Segmented Control */}
      <View style={styles.monthToggleRow}>
        {(() => {
          const currentMonthStr = getCurrentMonthStr();
          const prev = new Date();
          prev.setMonth(prev.getMonth() - 1);
          const prevMonthStr = getMonthStr(prev);

          const formatMonthName = (monthStr: string) => {
            const [year, m] = monthStr.split('-');
            const date = new Date(parseInt(year), parseInt(m) - 1, 1);
            return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
          };

          return [currentMonthStr, prevMonthStr].map((m) => {
            const isActive = month === m;
            return (
              <Pressable
                key={m}
                onPress={() => setMonth(m)}
                style={[
                  styles.monthTogglePill,
                  { 
                    backgroundColor: isActive ? theme.pink : theme.backgroundElement,
                    borderColor: theme.hairline,
                  }
                ]}
              >
                <Text style={[
                  styles.monthToggleText, 
                  { 
                    color: isActive ? '#ffffff' : theme.textSecondary,
                    fontWeight: isActive ? 'bold' : 'normal'
                  }
                ]}>
                  {formatMonthName(m)} {m === currentMonthStr ? '(Current)' : ''}
                </Text>
              </Pressable>
            );
          });
        })()}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.pink} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading rankings...</Text>
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text>
          <Pressable 
            onPress={() => fetchLeaderboard(true)}
            style={({ pressed }) => [
              styles.retryButton,
              { backgroundColor: theme.pink, opacity: pressed ? 0.8 : 1 }
            ]}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : leaderboard.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No stats recorded for this month yet.</Text>
        </View>
      ) : (
        <FlatList
          data={others}
          renderItem={renderItem}
          keyExtractor={item => item.userId}
          ListHeaderComponent={renderListHeader}
          contentContainerStyle={[styles.listContent, { paddingBottom: 110 + insets.bottom }]}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Sticky User Summary Row (Peach Highlight) */}
      {!loading && currentUserRank && (
        <View style={[styles.stickyFooter, { backgroundColor: theme.background + 'F0', borderTopColor: theme.hairline, bottom: 0 }]}>
          <View style={[styles.stickyCard, { backgroundColor: theme.backgroundElement, borderColor: theme.peach }]}>
            <View style={styles.stickyLeft}>
              <View style={styles.stickyRankCol}>
                <Text style={[styles.stickyRankTitle, { color: theme.pink }]}>YOUR RANK</Text>
                <Text style={[styles.stickyRankVal, { color: theme.text }]}>#{currentUserRank.rank}</Text>
              </View>
              
              <View style={[styles.stickyDivider, { backgroundColor: theme.hairline }]} />
              
              <Image 
                source={getBadgeSource(getLevelInfo(currentUserRank.dopa).badgeUrl)}
                style={styles.stickyBadge}
                resizeMode="contain"
              />

              <View style={styles.stickyUserMeta}>
                <Text numberOfLines={1} style={[styles.stickyUserName, { color: theme.text }]}>
                  Dr. {currentUserRank.displayName}
                </Text>
                <Text style={[styles.stickyUserLevel, { color: theme.textSecondary }]}>
                  Level {getLevelInfo(currentUserRank.dopa).level} • {getLevelInfo(currentUserRank.dopa).name}
                </Text>
              </View>
            </View>

            <View style={styles.stickyRight}>
              {currentUserRank.streakDays > 0 && (
                <View style={styles.stickyStreak}>
                  <Flame size={14} color={theme.pink} />
                  <Text style={[styles.stickyStreakText, { color: theme.text }]}>
                    {currentUserRank.streakDays}d streak
                  </Text>
                </View>
              )}
              <View style={[styles.stickyDopaBadge, { backgroundColor: theme.background, borderColor: theme.peach }]}>
                <Text style={[styles.stickyDopaText, { color: theme.text }]}>
                  {currentUserRank.dopa} Dopa
                </Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  title: {
    fontFamily: 'Plain Black, Inter, sans-serif',
    fontSize: 24,
    fontWeight: 'bold',
    letterSpacing: -0.8,
  },
  refreshButton: {
    padding: 8,
    borderRadius: 8,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
    marginBottom: 6,
  },
  listContent: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  leftCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  rankText: {
    width: 28,
    fontSize: 13,
    fontWeight: 'bold',
  },
  nameText: {
    fontSize: 14,
  },
  rightCol: {
    alignItems: 'flex-end',
    gap: 2,
  },
  dopaText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  streakWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  streakText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  errorText: {
    fontSize: 13,
    textAlign: 'center',
  },
  retryButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
  },
  monthToggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 10,
  },
  monthTogglePill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthToggleText: {
    fontSize: 11,
  },
  podiumContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginVertical: 14,
    gap: 8,
  },
  podiumCol: {
    flex: 1,
    alignItems: 'center',
    padding: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  podiumCol1st: {
    paddingVertical: 18,
    transform: [{ translateY: -4 }],
  },
  podiumMedal: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  podiumMedalText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  podiumBadge: {
    width: 36,
    height: 36,
    marginBottom: 6,
  },
  podiumName: {
    fontSize: 11,
    fontWeight: 'bold',
    textAlign: 'center',
    width: '100%',
  },
  podiumLevelName: {
    fontSize: 8,
    textAlign: 'center',
    marginTop: 1,
    marginBottom: 4,
  },
  podiumDopa: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  sectionHeading: {
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginTop: 12,
    marginBottom: 6,
  },
  listBadge: {
    width: 28,
    height: 28,
  },
  nameAndLevel: {
    flex: 1,
    gap: 1,
  },
  levelLabelText: {
    fontSize: 10,
  },
  stickyFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
    borderTopWidth: 1,
  },
  stickyCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  stickyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  stickyRankCol: {
    alignItems: 'center',
  },
  stickyRankTitle: {
    fontSize: 8,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  stickyRankVal: {
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 1,
  },
  stickyDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#e5e5e5',
  },
  stickyBadge: {
    width: 32,
    height: 32,
  },
  stickyUserMeta: {
    flex: 1,
    gap: 1,
  },
  stickyUserName: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  stickyUserLevel: {
    fontSize: 9,
  },
  stickyRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stickyStreak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  stickyStreakText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  stickyDopaBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  stickyDopaText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
});
