import { useState, useEffect, useCallback } from 'react';
import { X, Trophy, RefreshCw, Zap } from 'lucide-react';
import { useAuth } from '@clerk/clerk-react';
import { db } from '../lib/db';
import { getLevelInfo, getCurrentMonthStr, getMonthStr } from '../lib/gamification';

interface LeaderboardUser {
  rank: number;
  userId: string;
  displayName: string;
  dopa: number;
  lifetimeDopa: number;
  streakDays: number;
}

interface LeaderboardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LeaderboardModal({ isOpen, onClose }: LeaderboardModalProps) {
  const { getToken, userId: currentUserId } = useAuth();
  const [loading, setLoading] = useState<boolean>(true);
  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);
  const [userRank, setUserRank] = useState<LeaderboardUser | null>(null);
  const [month, setMonth] = useState<string>(getCurrentMonthStr());
  const [localStreak, setLocalStreak] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const loadLocalStreak = async () => {
      try {
        const stats = await db.userStats.get(getCurrentMonthStr());
        if (stats) {
          setLocalStreak(stats.streakDays);
        }
      } catch (err) {
        console.warn("Failed to load local streak for leaderboard modal.");
      }
    };
    loadLocalStreak();
  }, [isOpen]);

  const fetchLeaderboard = useCallback(async () => {
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
          setLeaderboard(data.leaderboard || []);
          setUserRank(data.userRank || null);
        }
      }
    } catch (err) {
      console.error("Failed to fetch leaderboard.");
    } finally {
      setLoading(false);
    }
  }, [getToken, month]);

  useEffect(() => {
    if (isOpen) {
      fetchLeaderboard();
    }
  }, [isOpen, fetchLeaderboard]);

  if (!isOpen) return null;

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-clay-ink/30 backdrop-blur-sm transition-opacity" 
        onClick={onClose} 
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-2xl bg-clay-canvas border border-clay-hairline rounded-clay-xl shadow-lg flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-250 z-10 text-left">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-clay-hairline bg-clay-surface-soft">
          <div>
            <h3 className="font-rubik text-lg font-medium tracking-[-0.04em] text-clay-ink flex items-center gap-2">
              <Trophy className="w-5 h-5 text-clay-ochre fill-current" />
              <span>Aspirant Leaderboard</span>
            </h3>
            <p className="text-clay-muted text-[11px]">
              Resets monthly. Study consistently to rank higher.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Month Switcher */}
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="bg-clay-canvas border border-clay-hairline rounded-clay-md text-xs font-bold px-2.5 py-1.5 focus:outline-none focus:border-clay-ink cursor-pointer"
            >
              <option value={getCurrentMonthStr()}>{formatMonthName(getCurrentMonthStr())} (Current)</option>
              {/* Add a previous month choice for reference */}
              {(() => {
                const prev = new Date();
                prev.setMonth(prev.getMonth() - 1);
                const prevStr = getMonthStr(prev);
                return <option value={prevStr}>{formatMonthName(prevStr)}</option>;
              })()}
            </select>
            
            <button 
              onClick={onClose}
              className="p-1.5 rounded-clay-md hover:bg-clay-surface-strong text-clay-muted hover:text-clay-ink transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <RefreshCw className="w-8 h-8 text-clay-pink animate-spin" />
              <p className="text-xs text-clay-muted font-medium">Loading rankings...</p>
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Trophy className="w-12 h-12 text-clay-muted-soft mb-2" />
              <p className="text-sm font-bold text-clay-ink">No Rankings Yet</p>
              <p className="text-xs text-clay-muted max-w-xs mt-1">
                Be the first to solve questions this month and claim the top of the leaderboard!
              </p>
            </div>
          ) : (
            <>
              {/* Podium (Top 3) */}
              <div className="grid grid-cols-3 gap-4 items-end pt-4 pb-2 border-b border-clay-hairline">
                {podiumOrder.map((user) => {
                  const isGold = user.rank === 1;
                  const isSilver = user.rank === 2;
                  const isBronze = user.rank === 3;
                  const level = getLevelInfo(user.dopa);

                  let cardStyle = "bg-clay-surface-card border-clay-hairline text-clay-ink";
                  let heightStyle = "h-[160px]";
                  let medalColor = "bg-slate-400";
                  
                  if (isGold) {
                    cardStyle = "bg-clay-teal text-white border-clay-ochre border-2";
                    heightStyle = "h-[200px]";
                    medalColor = "bg-amber-400 text-clay-ink";
                  } else if (isSilver) {
                    heightStyle = "h-[175px]";
                    medalColor = "bg-slate-300 text-clay-ink";
                  } else if (isBronze) {
                    heightStyle = "h-[155px]";
                    medalColor = "bg-amber-600 text-white";
                  }

                  const isCurrentUser = user.userId === currentUserId;

                  return (
                    <div 
                      key={user.userId} 
                      className={`flex flex-col items-center justify-end p-4 rounded-clay-xl border shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-md cursor-pointer ${cardStyle} ${heightStyle} ${
                        isCurrentUser ? "ring-2 ring-clay-pink" : ""
                      }`}
                    >
                      {/* Badge Icon */}
                      <img 
                        src={level.badgeUrl} 
                        alt={level.name} 
                        className={`w-10 h-10 object-contain mb-1.5 ${isGold ? 'drop-shadow-[0_0_8px_rgba(232,185,74,0.3)]' : ''}`}
                      />
                      
                      {/* Name */}
                      <span className="font-semibold text-xs text-center truncate w-full max-w-[120px] leading-tight">
                        {user.displayName}
                        {isCurrentUser && " (You)"}
                      </span>
                      
                      {/* Level Name */}
                      <span className={`text-[9px] font-medium opacity-80 mb-1`}>
                        {level.name}
                      </span>

                      {/* Score */}
                      <span className="font-rubik text-sm font-medium tracking-[-0.03em] mb-2">
                        {user.dopa} Dopa
                      </span>

                      {/* Rank Medal */}
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${medalColor} shadow-sm`}>
                        {user.rank}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Ranks 4-50 List */}
              {others.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-bold text-clay-muted uppercase tracking-wider block mb-1">
                    Rankings
                  </span>
                  
                  <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
                    {others.map((user) => {
                      const level = getLevelInfo(user.dopa);
                      const isCurrentUser = user.userId === currentUserId;

                      return (
                        <div 
                          key={user.userId}
                          className={`flex items-center justify-between p-3 border rounded-clay-lg transition-colors ${
                            isCurrentUser 
                              ? 'bg-clay-peach/20 border-clay-peach text-clay-ink font-semibold' 
                              : 'bg-clay-canvas border-clay-hairline hover:bg-clay-surface-soft text-clay-body'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {/* Rank Number */}
                            <span className="w-5 font-rubik text-xs font-bold text-clay-muted">
                              #{user.rank}
                            </span>
                            
                            {/* Level Badge Icon */}
                            <img 
                              src={level.badgeUrl} 
                              alt={level.name} 
                              className="w-7 h-7 object-contain"
                            />

                            {/* Name & Level Details */}
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-clay-ink flex items-center gap-1.5">
                                {user.displayName}
                                {isCurrentUser && (
                                  <span className="text-[9px] font-bold bg-clay-pink text-white px-1.5 py-0.2 rounded">YOU</span>
                                )}
                              </span>
                              <span className="text-[9px] text-clay-muted">
                                {level.name} • Lvl {level.level}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-4">
                             {/* Streak */}
                             {((isCurrentUser && localStreak !== null) ? localStreak : user.streakDays) > 0 && (
                               <div className="flex items-center gap-0.5 text-clay-coral font-bold text-xs" title="Daily Streak">
                                 <Zap className="w-3.5 h-3.5 fill-current text-clay-ochre" />
                                 <span>{(isCurrentUser && localStreak !== null) ? localStreak : user.streakDays}d</span>
                               </div>
                             )}

                            {/* XP Score */}
                            <span className="font-rubik text-xs font-medium tracking-[-0.03em] text-clay-ink bg-clay-surface-soft border border-clay-hairline px-2.5 py-1 rounded-clay-md">
                              {user.dopa} Dopa
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Sticky User Summary Row (Peach Highlight) */}
        {!loading && userRank && (
          <div className="px-6 py-4 border-t border-clay-hairline bg-clay-peach/20 text-clay-ink flex items-center justify-between shadow-[0_-4px_12px_rgba(10,10,10,0.02)]">
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-center">
                <span className="font-rubik text-xs font-medium tracking-[-0.03em] text-clay-pink">Rank</span>
                <span className="font-rubik text-sm font-medium tracking-[-0.03em]">#{userRank.rank}</span>
              </div>
              <div className="w-[1px] h-6 bg-clay-hairline mx-1" />
              
              <img 
                src={getLevelInfo(userRank.dopa).badgeUrl} 
                alt="Your badge" 
                className="w-8 h-8 object-contain"
              />

              <div className="flex flex-col">
                <span className="text-xs font-bold text-clay-ink flex items-center gap-1">
                  Dr. {userRank.displayName} (Your Stats)
                </span>
                <span className="text-[9px] text-clay-muted">
                  Level {getLevelInfo(userRank.dopa).level} • {getLevelInfo(userRank.dopa).name}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
               {(localStreak !== null ? localStreak : userRank.streakDays) > 0 && (
                 <div className="flex items-center gap-0.5 text-clay-coral font-bold text-xs" title="Your Daily Streak">
                   <Zap className="w-4 h-4 fill-current text-clay-ochre animate-pulse" />
                   <span>{(localStreak !== null ? localStreak : userRank.streakDays)} day streak</span>
                 </div>
               )}
              
              <div className="bg-clay-canvas border border-clay-peach px-3 py-1.5 rounded-clay-md flex items-center gap-1.5">
                <img src="/badge/dopa-xp.png" alt="Dopa Icon" className="w-4 h-4 object-contain" />
                <span className="font-rubik text-xs font-medium tracking-[-0.03em]">{userRank.dopa} Dopa</span>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
