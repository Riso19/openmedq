import { useEffect } from 'react';
import { Award, Sparkles } from 'lucide-react';
import { getCurrentMonthStr } from '../lib/gamification';

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-clay-ink/30 backdrop-blur-md transition-opacity" 
        onClick={onClose} 
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-md bg-clay-canvas border border-clay-hairline rounded-clay-xl shadow-lg p-8 flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-300 z-10">
        
        {/* Celebration sparkles */}
        <div className="absolute -top-6 bg-clay-peach border border-clay-hairline w-12 h-12 rounded-full flex items-center justify-center shadow-sm text-clay-ink">
          <Sparkles className="w-6 h-6 animate-pulse" />
        </div>

        <span className="text-[10px] font-bold text-clay-pink uppercase tracking-widest block mt-4 mb-1">
          Monthly Rollover Complete
        </span>

        <h3 className="font-rubik text-2xl font-medium tracking-[-0.04em] text-clay-ink mb-6">
          Congratulations, Doctor!
        </h3>

        {/* Badge Spotlight */}
        <div className="relative bg-clay-surface-soft border border-clay-hairline rounded-clay-xl p-8 mb-6 w-full flex flex-col items-center group">
          <div className="absolute top-2 right-2 flex items-center gap-1 bg-clay-canvas border border-clay-hairline px-2 py-0.5 rounded text-[8px] font-bold text-clay-muted uppercase">
            <Award className="w-3 h-3 text-clay-ochre" /> Final Badge
          </div>

          <img 
            src={lastMonthStats.badgeUrl} 
            alt={lastMonthStats.levelName} 
            className="w-28 h-28 object-contain mb-4 filter drop-shadow-[0_8px_16px_rgba(10,10,10,0.08)] transform group-hover:scale-105 transition-transform duration-300"
          />

          <span className="text-xs font-bold text-clay-muted uppercase tracking-wider">
            Reached in {formatMonthName(lastMonthStats.month)}
          </span>
          <span className="font-rubik text-xl font-medium text-clay-ink tracking-[-0.04em] mt-1">
            Level {lastMonthStats.level}: {lastMonthStats.levelName}
          </span>
          <span className="text-xs bg-clay-canvas border border-clay-hairline text-clay-body font-rubik font-medium tracking-[-0.04em] px-3 py-1 rounded-clay-md mt-3 flex items-center gap-1">
            <img src="/badge/dopa-xp.png" alt="Dopa XP" className="w-3.5 h-3.5 object-contain" />
            <span>{lastMonthStats.dopa} Dopa Earned</span>
          </span>
        </div>

        <p className="text-clay-body text-xs leading-relaxed max-w-sm mb-6 text-center">
          A new month has officially started! Your monthly level and leaderboard ranks have been reset, allowing you to start fresh, build a new daily streak, and climb back to the top.
        </p>

        {/* CTA Button */}
        <button
          onClick={onClose}
          className="w-full py-3 bg-clay-ink hover:bg-neutral-800 text-white font-bold rounded-clay-md text-xs tracking-wide transition-all duration-200 cursor-pointer shadow-sm active:scale-98"
        >
          Begin {formatMonthName(getCurrentMonthStr())} Study Cycle
        </button>
      </div>
    </div>
  );
}
