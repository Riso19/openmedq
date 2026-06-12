import React from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Modal, 
  Pressable, 
  Image 
} from 'react-native';
import { Award, Sparkles } from 'lucide-react-native';
import { getCurrentMonthStr } from '@openmedq/shared';

import { useTheme } from '@/hooks/use-theme';
import { Fonts } from '@/constants/theme';

interface LevelResetModalProps {
  lastMonthStats: {
    month: string;
    dopa: number;
    level: number;
    levelName: string;
    badgeUrl: string;
  } | null;
  onClose: () => void;
}

export function LevelResetModal({ lastMonthStats, onClose }: LevelResetModalProps) {
  const theme = useTheme();

  if (!lastMonthStats) return null;

  // Format month label: "2026-05" -> "May 2026"
  const formatMonthName = (monthStr: string) => {
    try {
      const [year, m] = monthStr.split('-');
      const date = new Date(parseInt(year), parseInt(m) - 1, 1);
      return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } catch {
      return monthStr;
    }
  };

  // Local badge mapping
  const getBadgeSource = (badgeUrl: string) => {
    if (badgeUrl.includes('seeker-badge-1')) return require('../../assets/images/badge/seeker-badge-1.png');
    if (badgeUrl.includes('scribe-badge-2')) return require('../../assets/images/badge/scribe-badge-2.png');
    if (badgeUrl.includes('medic-badge-3')) return require('../../assets/images/badge/medic-badge-3.png');
    if (badgeUrl.includes('scholar-badge-4')) return require('../../assets/images/badge/scholar-badge-4.png');
    if (badgeUrl.includes('savant-badge-5')) return require('../../assets/images/badge/savant-badge-5.png');
    if (badgeUrl.includes('prodigy-6') || badgeUrl.includes('prodigy')) return require('../../assets/images/badge/prodigy-6.png');
    return require('../../assets/images/badge/seeker-badge-1.png');
  };

  return (
    <Modal
      visible={true}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        {/* Backdrop overlay */}
        <Pressable style={styles.backdrop} onPress={onClose} />

        {/* Modal Card */}
        <View style={[styles.card, { backgroundColor: theme.background, borderColor: theme.hairline }]}>
          {/* Top Sparkle icon */}
          <View style={[styles.sparkleBadge, { backgroundColor: theme.peach, borderColor: theme.hairline }]}>
            <Sparkles size={20} color={theme.text} />
          </View>

          <Text style={[styles.modalSubtitle, { color: theme.pink }]}>MONTHLY ROLLOVER COMPLETE</Text>
          <Text style={[styles.modalTitle, { color: theme.text }]}>Congratulations, Doctor!</Text>

          {/* Badge Showcase Card */}
          <View style={[styles.badgeSpotlight, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
            <View style={[styles.newStatusBadge, { backgroundColor: theme.background, borderColor: theme.hairline }]}>
              <Award size={12} color={theme.ochre} />
              <Text style={[styles.newStatusText, { color: theme.textSecondary }]}>Final Badge</Text>
            </View>

            <Image 
              source={getBadgeSource(lastMonthStats.badgeUrl)}
              style={styles.badgeImage}
              resizeMode="contain"
            />

            <Text style={[styles.oldLevelText, { color: theme.textSecondary }]}>
              Reached in {formatMonthName(lastMonthStats.month)}
            </Text>
            <Text style={[styles.newLevelName, { color: theme.text }]}>
              Level {lastMonthStats.level}: {lastMonthStats.levelName}
            </Text>
            
            <View style={[styles.dopaPill, { backgroundColor: theme.background, borderColor: theme.hairline }]}>
              <Text style={[styles.dopaPillText, { color: theme.text }]}>{lastMonthStats.dopa} Dopa Earned</Text>
            </View>
          </View>

          <Text style={[styles.descriptionText, { color: theme.textSecondary }]}>
            A new month has officially started! Your monthly level and leaderboard ranks have been reset, allowing you to start fresh, build a new daily streak, and climb back to the top.
          </Text>

          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.ctaButton,
              { backgroundColor: theme.text, opacity: pressed ? 0.9 : 1 }
            ]}
          >
            <Text style={[styles.ctaText, { color: theme.background }]}>
              Begin {formatMonthName(getCurrentMonthStr())} Study Cycle
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(10, 10, 10, 0.4)',
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  sparkleBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    top: -22,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  modalSubtitle: {
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1.5,
    marginTop: 16,
    marginBottom: 4,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    fontFamily: Fonts.sans,
    letterSpacing: -0.6,
    marginBottom: 16,
    textAlign: 'center',
  },
  badgeSpotlight: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 24,
    alignItems: 'center',
    position: 'relative',
    marginBottom: 16,
  },
  newStatusBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  newStatusText: {
    fontSize: 8,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  badgeImage: {
    width: 96,
    height: 96,
    marginBottom: 12,
  },
  oldLevelText: {
    fontSize: 9,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  newLevelName: {
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: Fonts.sans,
    letterSpacing: -0.4,
    marginTop: 2,
  },
  dopaPill: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 12,
    marginTop: 12,
  },
  dopaPillText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  descriptionText: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 20,
  },
  ctaButton: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
});
