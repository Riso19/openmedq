import { useState, useEffect } from 'react';
import { ArrowLeft, Trophy, RefreshCw, Zap } from 'lucide-react';
import { useAuth } from '@clerk/clerk-react';
import { db } from '../../lib/db';
import { getLevelInfo, getCurrentMonthStr, getMonthStr } from '../../lib/gamification';
import { ThemeToggle } from '../../components/ThemeToggle';

interface LeaderboardUser {
  rank: number;
  userId: string;
  displayName: string;
  dopa: number;
  lifetimeDopa: number;
  streakDays: number;
}

interface LeaderboardPageProps {
  onBack: () => void;
}

export function LeaderboardPage({ onBack }: LeaderboardPageProps) {
  const { getToken, userId: currentUserId } = useAuth();
  const [loading, setLoading] = useState<boolean>(true);
  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);
  const [userRank, setUserRank] = useState<LeaderboardUser | null>(null);
  const [month, setMonth] = useState<string>(getCurrentMonthStr());
  const [localStreak, setLocalStreak] = useState<number | null>(null);

  useEffect(() => {
    const loadLocalStreak = async () => {
      try {
        const stats = await db.userStats.get(getCurrentMonthStr());
        if (stats) {
          setLocalStreak(stats.streakDays);
        }
      } catch (err) {
        console.warn("Failed to load local streak for leaderboard.");
      }
    };
    loadLocalStreak();
  }, []);

  const fetchLeaderboard = async (force = false) => {
    const cacheKey = `openmedq_leaderboard_cache_${month}`;
    if (!force) {
      try {
        const cachedStr = sessionStorage.getItem(cacheKey);
        if (cachedStr) {
          const cached = JSON.parse(cachedStr);
          const now = Date.now();
          if (now - cached.timestamp < 300000) { // 5 minutes stale time
            setLeaderboard(cached.data.leaderboard || []);
            setUserRank(cached.data.userRank || null);
            setLoading(false);
            return;
          }
        }
      } catch (err) {
        console.warn("Leaderboard cache parse failed.");
      }
    }

    setLoading(true);
    try {
      const token = await getToken();
      const baseUrl = import.meta.env.VITE_API_URL || '';
      
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`${baseUrl}/api/leaderboard?month=${month}`, {
        method: 'GET',
        headers
      });

      if (res.ok) {
        const data = (await res.json()) as any;
        if (data && data.success) {
          const fetchedData = {
            leaderboard: data.leaderboard || [],
            userRank: data.userRank || null
          };
          setLeaderboard(fetchedData.leaderboard);
          setUserRank(fetchedData.userRank);

          try {
            sessionStorage.setItem(cacheKey, JSON.stringify({
              timestamp: Date.now(),
              data: fetchedData
            }));
          } catch (e) {
            console.warn("Leaderboard cache write failed.");
          }
        }
      }
    } catch (err) {
      console.error("Failed to fetch leaderboard.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard(false);
  }, [month]);

  // Split top 3 podium from the rest
  const topThree = leaderboard.slice(0, 3);
  const others = leaderboard.slice(3);

  // Position order for podium: [2nd, 1st, 3rd]
  const podiumOrder = [];
  if (topThree[1]) podiumOrder.push(topThree[1]); // 2nd place
  if (topThree[0]) podiumOrder.push(topThree[0]); // 1st place
  if (topThree[2]) podiumOrder.push(topThree[2]); // 3rd place

  // Helper to format month name
  const formatMonthName = (monthStr: string) => {
    const [year, m] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(m) - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  return (
    <div className="min-h-screen bg-clay-canvas text-clay-ink flex flex-col font-sans relative pb-24 selection:bg-clay-pink/20">
      {/* Background gradients */}
      <div className="absolute top-0 left-0 w-[40%] h-[40%] bg-clay-lavender/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[40%] h-[40%] bg-clay-peach/5 rounded-full blur-[100px] pointer-events-none" />

      {/* Header bar */}
      <header className="sticky top-0 z-40 w-full bg-clay-canvas/80 backdrop-blur-md border-b border-clay-hairline py-4 px-6 md:px-12 flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-xs font-bold text-clay-muted hover:text-clay-ink transition-colors cursor-pointer group"
        >
          <ArrowLeft className="w-4 h-4 transform group-hover:-translate-x-1 transition-transform" />
          <span>Back to Dashboard</span>
        </button>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="bg-clay-canvas border border-clay-hairline rounded-clay-md text-xs font-bold px-3 py-1.5 focus:outline-none focus:border-clay-ink cursor-pointer shadow-sm"
          >
            <option value={getCurrentMonthStr()}>{formatMonthName(getCurrentMonthStr())} (Current)</option>
            {(() => {
              const prev = new Date();
              prev.setMonth(prev.getMonth() - 1);
              const prevStr = getMonthStr(prev);
              return <option value={prevStr}>{formatMonthName(prevStr)}</option>;
            })()}
          </select>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-12 flex flex-col gap-10 text-left relative z-10">
        
        {/* Title and Intro */}
        <div className="flex flex-col gap-2">
          <h1 className="font-rubik text-3xl md:text-4xl font-medium tracking-[-0.04em] text-clay-ink flex items-center gap-3">
            <Trophy className="w-8 h-8 text-clay-ochre fill-current shrink-0" />
            <span>Leaderboard</span>
          </h1>
          <p className="text-clay-body text-xs md:text-sm max-w-md">
            Study consistently to earn Dopa XP and claim the top rank. Ranks reset on the 1st of every month.
          </p>
        </div>

        {/* Content Body */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 gap-3">
            <RefreshCw className="w-8 h-8 text-clay-pink animate-spin" />
            <p className="text-xs text-clay-muted font-medium">Loading rankings...</p>
          </div>
        ) : leaderboard.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center border border-clay-hairline border-dashed rounded-clay-xl bg-clay-surface-soft/35">
            <Trophy className="w-12 h-12 text-clay-muted-soft mb-2" />
            <p className="text-sm font-bold text-clay-ink">No Rankings Yet</p>
            <p className="text-xs text-clay-muted max-w-xs mt-1">
              Be the first to solve questions this month and claim the top of the leaderboard!
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-10">
            {/* Minimal Podium (Top 3 Grid) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
              {podiumOrder.map((user) => {
                const isGold = user.rank === 1;
                const isSilver = user.rank === 2;
                const isBronze = user.rank === 3;
                const level = getLevelInfo(user.dopa);

                let cardStyle = "bg-clay-canvas border-clay-hairline text-clay-ink";
                let medalBadge = "bg-slate-300 text-neutral-900 border border-slate-400";
                
                if (isGold) {
                  cardStyle = "bg-clay-teal text-white border-clay-ochre border-2";
                  medalBadge = "bg-clay-ochre text-neutral-900 border border-amber-400";
                } else if (isSilver) {
                  cardStyle = "bg-clay-surface-card border-clay-hairline text-clay-ink";
                  medalBadge = "bg-slate-200 text-neutral-900 border border-slate-300";
                } else if (isBronze) {
                  cardStyle = "bg-clay-surface-card border-clay-hairline text-clay-ink";
                  medalBadge = "bg-amber-700 text-white border border-amber-600";
                }

                const isCurrentUser = user.userId === currentUserId;

                return (
                  <div 
                    key={user.userId} 
                    className={`flex items-center gap-4 p-5 rounded-clay-xl border shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md cursor-pointer ${cardStyle} ${
                      isCurrentUser ? "ring-2 ring-clay-pink" : ""
                    }`}
                  >
                    {/* Rank Circle */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 shadow-sm ${medalBadge}`}>
                      {user.rank}
                    </div>

                    {/* Badge Icon */}
                    <img 
                      src={level.badgeUrl} 
                      alt={level.name} 
                      className={`w-10 h-10 object-contain shrink-0 ${isGold ? 'drop-shadow-[0_0_8px_rgba(232,185,74,0.3)]' : ''}`}
                    />
                    
                    {/* User info */}
                    <div className="flex-1 min-w-0 text-left">
                      <div className="font-semibold text-xs truncate leading-tight flex items-center gap-1.5">
                        {user.displayName}
                        {isCurrentUser && <span className="text-[8px] bg-clay-pink text-white px-1 py-0.2 rounded font-bold uppercase shrink-0">You</span>}
                      </div>
                      <div className="text-[9px] opacity-80 mt-0.5">
                        {level.name}
                      </div>
                      <div className="font-rubik text-sm font-medium tracking-[-0.03em] mt-1.5">
                        {user.dopa} Dopa
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Ranks 4-50 Sleek List */}
            {others.length > 0 && (
              <div className="flex flex-col gap-3">
                <span className="text-[10px] font-bold text-clay-muted uppercase tracking-wider block">
                  Rankings
                </span>
                
                <div className="flex flex-col gap-2.5">
                  {others.map((user) => {
                    const level = getLevelInfo(user.dopa);
                    const isCurrentUser = user.userId === currentUserId;

                    return (
                      <div 
                        key={user.userId}
                        className={`flex items-center justify-between p-4 border rounded-clay-lg transition-colors ${
                          isCurrentUser 
                            ? 'bg-clay-peach/20 border-clay-peach text-clay-ink font-semibold' 
                            : 'bg-clay-canvas border-clay-hairline hover:bg-clay-surface-soft text-clay-body'
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          {/* Rank Number */}
                          <span className="w-6 font-rubik text-xs font-bold text-clay-muted">
                            #{user.rank}
                          </span>
                          
                          {/* Level Badge Icon */}
                          <img 
                            src={level.badgeUrl} 
                            alt={level.name} 
                            className="w-7 h-7 object-contain shrink-0"
                          />

                          {/* Name & Level Details */}
                          <div className="flex flex-col text-left">
                            <span className="text-xs font-bold text-clay-ink flex items-center gap-1.5">
                              {user.displayName}
                              {isCurrentUser && (
                                <span className="text-[8px] font-bold bg-clay-pink text-white px-1.5 py-0.2 rounded uppercase">YOU</span>
                              )}
                            </span>
                            <span className="text-[9px] text-clay-muted mt-0.5">
                              Level {level.level} • {level.name}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-5">
                          {/* Streak */}
                          {((isCurrentUser && localStreak !== null) ? localStreak : user.streakDays) > 0 && (
                            <div className="flex items-center gap-0.5 text-clay-coral font-bold text-xs" title="Daily Streak">
                              <Zap className="w-3.5 h-3.5 fill-current text-clay-ochre" />
                              <span>{(isCurrentUser && localStreak !== null) ? localStreak : user.streakDays}d</span>
                            </div>
                          )}

                          {/* XP Score */}
                          <span className="font-rubik text-xs font-medium tracking-[-0.03em] text-clay-ink bg-clay-surface-soft border border-clay-hairline px-2.5 py-1 rounded-clay-md shrink-0">
                            {user.dopa} Dopa
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Sticky User Summary Row (Peach Highlight) */}
      {!loading && userRank && (
        <div className="fixed bottom-0 left-0 right-0 border-t border-clay-hairline bg-clay-canvas/90 backdrop-blur-md text-clay-ink py-4 px-6 md:px-12 flex items-center justify-between shadow-[0_-8px_24px_rgba(10,10,10,0.04)] z-30">
          <div className="max-w-4xl mx-auto w-full flex items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="flex flex-col items-center">
                <span className="font-rubik text-[9px] font-bold text-clay-pink uppercase tracking-wider">Your Rank</span>
                <span className="font-rubik text-sm font-medium tracking-[-0.03em] mt-0.5">#{userRank.rank}</span>
              </div>
              <div className="w-[1px] h-6 bg-clay-hairline mx-1" />
              
              <img 
                src={getLevelInfo(userRank.dopa).badgeUrl} 
                alt="Your badge" 
                className="w-8 h-8 object-contain shrink-0"
              />

              <div className="flex flex-col text-left">
                <span className="text-xs font-bold text-clay-ink truncate max-w-[150px] md:max-w-none">
                  Dr. {userRank.displayName}
                </span>
                <span className="text-[9px] text-clay-muted mt-0.5">
                  Level {getLevelInfo(userRank.dopa).level} • {getLevelInfo(userRank.dopa).name}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4 md:gap-6">
              {(localStreak !== null ? localStreak : userRank.streakDays) > 0 && (
                <div className="flex items-center gap-1 text-clay-coral font-bold text-xs" title="Your Daily Streak">
                  <Zap className="w-4 h-4 fill-current text-clay-ochre animate-pulse shrink-0" />
                  <span className="hidden sm:inline">{(localStreak !== null ? localStreak : userRank.streakDays)} day streak</span>
                  <span className="sm:hidden">{(localStreak !== null ? localStreak : userRank.streakDays)}d</span>
                </div>
              )}
              
              <div className="bg-clay-canvas border border-clay-peach px-3 py-1.5 rounded-clay-md flex items-center gap-1.5 shadow-sm">
                <img src="/badge/dopa-xp.png" alt="Dopa Icon" className="w-4 h-4 object-contain shrink-0" />
                <span className="font-rubik text-xs font-medium tracking-[-0.03em]">{userRank.dopa} Dopa</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
