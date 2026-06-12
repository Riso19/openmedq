import { useEffect } from 'react';
import { Sparkles, Award } from 'lucide-react';
import { Confetti } from './Confetti';

interface LevelUpCelebrationModalProps {
  levelInfo: {
    oldLevel: number;
    newLevel: number;
    dopa: number;
    levelName: string;
    badgeUrl: string;
  } | null;
  onClose: () => void;
}

export function LevelUpCelebrationModal({ levelInfo, onClose }: LevelUpCelebrationModalProps) {
  if (!levelInfo) return null;

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
      {/* Confetti bursting */}
      <Confetti active={!!levelInfo} />

      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-clay-ink/35 backdrop-blur-md transition-opacity" 
        onClick={onClose} 
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-md bg-clay-canvas border border-clay-hairline rounded-clay-xl shadow-lg p-8 flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-300 z-10">
        
        {/* Celebration crown */}
        <div className="absolute -top-6 bg-clay-ochre border border-clay-hairline w-12 h-12 rounded-full flex items-center justify-center shadow-sm text-clay-ink">
          <Sparkles className="w-6 h-6 animate-pulse" />
        </div>

        <span className="text-[10px] font-bold text-clay-pink uppercase tracking-widest block mt-4 mb-1">
          Level Up!
        </span>

        <h3 className="font-rubik text-2xl font-medium tracking-[-0.04em] text-clay-ink mb-6">
          Amazing study milestone!
        </h3>

        {/* Badge Spotlight */}
        <div className="relative bg-clay-surface-soft border border-clay-hairline rounded-clay-xl p-8 mb-6 w-full flex flex-col items-center group">
          <div className="absolute top-2 right-2 flex items-center gap-1 bg-clay-canvas border border-clay-hairline px-2 py-0.5 rounded text-[8px] font-bold text-clay-muted uppercase">
            <Award className="w-3 h-3 text-clay-ochre" /> New Status
          </div>

          <img 
            src={levelInfo.badgeUrl} 
            alt={levelInfo.levelName} 
            className="w-28 h-28 object-contain mb-4 filter drop-shadow-[0_8px_16px_rgba(10,10,10,0.08)] transform group-hover:scale-105 transition-transform duration-300"
          />

          <span className="text-[9px] font-bold text-clay-muted uppercase tracking-wider">
            Promoted from Level {levelInfo.oldLevel}
          </span>
          <span className="font-rubik text-xl font-medium text-clay-ink tracking-[-0.03em] mt-1">
            Level {levelInfo.newLevel}: {levelInfo.levelName}
          </span>
        </div>

        <p className="text-clay-body text-xs leading-relaxed max-w-sm mb-6 text-center">
          You earned enough Dopa XP this session to level up. Keep practicing, maintain your daily streak, and unlock the next milestone!
        </p>

        {/* Action Button */}
        <button
          onClick={onClose}
          className="w-full py-3 bg-clay-ink hover:bg-neutral-800 text-white font-bold rounded-clay-md text-xs tracking-wide transition-all duration-200 cursor-pointer shadow-sm active:scale-98"
        >
          Excellent, Let's Continue
        </button>
      </div>
    </div>
  );
}
