import { useState, useEffect } from 'react';
import { X, Settings, HelpCircle, Save, Award } from 'lucide-react';
import { getFSRSSettings, saveFSRSSettings, rescheduleAllCards } from '../lib/fsrs';
import { SyncManager } from '../lib/SyncManager';
import { db } from '../lib/db';
import { optimizeFSRSParameters } from '../lib/fsrsOptimizer';

interface FSRSSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: () => void;
}

export function FSRSSettingsModal({ isOpen, onClose, onSave }: FSRSSettingsModalProps) {
  const [retention, setRetention] = useState<number>(0.9);
  const [maxInterval, setMaxInterval] = useState<number>(36500);
  const [fuzz, setFuzz] = useState<boolean>(true);
  const [isRescheduling, setIsRescheduling] = useState<boolean>(false);

  // Parameter calibration states
  const [logsCount, setLogsCount] = useState<number>(0);
  const [optimizeStatus, setOptimizeStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [optimizerProgress, setOptimizerProgress] = useState<string>('');
  const [optimizeErrorMsg, setOptimizeErrorMsg] = useState<string>('');
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [cachedQuestionsCount, setCachedQuestionsCount] = useState<number>(0);

  useEffect(() => {
    if (isOpen) {
      const current = getFSRSSettings();
      setRetention(current.request_retention);
      setMaxInterval(current.maximum_interval);
      setFuzz(current.enable_fuzz);

      // Reset optimizer status and query IndexedDB logs count
      setOptimizeStatus('idle');
      setOptimizerProgress('');
      setRescheduleError(null);
      db.reviewLogs.count().then(setLogsCount).catch(() => console.error("Database query failed."));
      db.questions.count().then(setCachedQuestionsCount).catch(() => console.error("Database query failed."));
    }
  }, [isOpen]);

  // Listen for settings changes synced from other devices
  useEffect(() => {
    const handleSettingsUpdate = () => {
      const current = getFSRSSettings();
      setRetention(current.request_retention);
      setMaxInterval(current.maximum_interval);
      setFuzz(current.enable_fuzz);
    };
    window.addEventListener('openmedq_settings_updated', handleSettingsUpdate);
    return () => window.removeEventListener('openmedq_settings_updated', handleSettingsUpdate);
  }, []);

  if (!isOpen) return null;

  const handleSave = async () => {
    setIsRescheduling(true);
    setRescheduleError(null);
    try {
      saveFSRSSettings({
        request_retention: retention,
        maximum_interval: maxInterval,
        enable_fuzz: fuzz,
      });
      await SyncManager.saveSettingsToIndexedDB();
      await rescheduleAllCards(retention, maxInterval);
      if (onSave) onSave();
      onClose();
    } catch (err: any) {
      console.error("Rescheduling failed.");
      setRescheduleError("Failed to reschedule cards. Please try again.");
    } finally {
      setIsRescheduling(false);
    }
  };

  const handleOptimize = async () => {
    setOptimizeStatus('running');
    setOptimizerProgress('Gathering logs...');
    try {
      const optimizedW = await optimizeFSRSParameters((progress, loss) => {
        setOptimizerProgress(`Tuning weights... ${Math.round(progress * 100)}% (Loss: ${loss.toFixed(4)})`);
      });

      if (optimizedW) {
        // Apply optimized weights
        saveFSRSSettings({
          request_retention: retention,
          maximum_interval: maxInterval,
          enable_fuzz: fuzz,
          w: optimizedW
        });

        // Sync settings to IndexedDB Settings Record
        await SyncManager.saveSettingsToIndexedDB();

        // Reschedule all card intervals based on new optimized weights
        await rescheduleAllCards(retention, maxInterval);

        setOptimizeStatus('success');
        const newCount = await db.reviewLogs.count();
        setLogsCount(newCount);
        if (onSave) onSave();
      }
    } catch (err: any) {
      console.error("Calibration failed.");
      setOptimizeStatus('error');
      setOptimizeErrorMsg('Calibration failed. Please try again.');
    }
  };

  const handleClearCache = async () => {
    if (window.confirm("Are you sure you want to clear all locally cached questions? Your learning history and stats will NOT be affected. Questions will download fresh from CDN when you next practice.")) {
      try {
        await db.questions.clear();
        setCachedQuestionsCount(0);
        alert("Local question cache cleared successfully!");
      } catch (err: any) {
        console.error("Failed to clear cache.");
        alert("Failed to clear cache. Please try again.");
      }
    }
  };

  // Helper to convert days to readable format
  const formatInterval = (days: number) => {
    if (days >= 365) {
      const yrs = Math.round((days / 365) * 10) / 10;
      return `${yrs} year${yrs !== 1 ? 's' : ''}`;
    }
    return `${days} day${days !== 1 ? 's' : ''}`;
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/45 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-clay-canvas border border-clay-hairline rounded-clay-xl p-6 max-w-md w-full text-left shadow-lg relative animate-[fadeIn_0.2s_ease-out]">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-clay-hairline pb-4 mb-5">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-clay-pink" />
            <h3 className="font-rubik text-lg font-medium tracking-[-0.04em] text-clay-ink">
              Revision Schedule Settings
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-clay-md border border-clay-hairline text-clay-muted hover:text-clay-ink hover:bg-clay-surface-soft transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-5">
          
          {/* Desired Retention */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs font-bold text-clay-ink">
              <span>Memory Target Rate</span>
              <span className="text-clay-pink font-extrabold">{Math.round(retention * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.70"
              max="0.97"
              step="0.01"
              value={retention}
              onChange={(e) => setRetention(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-clay-surface-strong rounded-lg appearance-none cursor-pointer accent-clay-ink"
            />
            <div className="text-[10px] text-clay-muted leading-relaxed flex items-start gap-1">
              <HelpCircle className="w-3.5 h-3.5 shrink-0 text-clay-pink mt-0.5" />
              <span>
                A higher target (90-95%) helps you remember more, but requires you to revise more often. Default: 90%.
              </span>
            </div>
          </div>

          {/* Maximum Interval */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs font-bold text-clay-ink">
              <span>Maximum Revision Gap</span>
              <span className="text-clay-pink font-extrabold">{formatInterval(maxInterval)}</span>
            </div>
            <input
              type="range"
              min="30"
              max="36500"
              step="30"
              value={maxInterval}
              onChange={(e) => setMaxInterval(parseInt(e.target.value, 10))}
              className="w-full h-1.5 bg-clay-surface-strong rounded-lg appearance-none cursor-pointer accent-clay-ink"
            />
            <div className="text-[10px] text-clay-muted leading-relaxed flex items-start gap-1">
              <HelpCircle className="w-3.5 h-3.5 shrink-0 text-clay-pink mt-0.5" />
              <span>
                The longest time to wait before reviewing a question again.
              </span>
            </div>
          </div>

          {/* Enable Fuzz (Jitter) */}
          <div className="flex items-center justify-between border-t border-clay-hairline pt-4 pb-1">
            <div className="text-xs">
              <span className="block font-bold text-clay-ink">Spread Out Reviews</span>
              <span className="block text-[10px] text-clay-muted max-w-[280px]">
                Slightly varies when questions show up so you don't get overwhelmed with too many questions on a single day.
              </span>
            </div>
            <button
              onClick={() => setFuzz(!fuzz)}
              className={`w-10 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200 ${
                fuzz ? 'bg-clay-teal' : 'bg-clay-surface-strong'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform duration-200 ${
                  fuzz ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Personal Memory Calibration */}
          <div className="border-t border-clay-hairline pt-4 space-y-3">
            <div>
              <span className="block text-xs font-bold text-clay-ink flex items-center gap-1.5">
                <Award className="w-4 h-4 text-clay-ochre" />
                Personal Study Gap Tuning
              </span>
              <span className="block text-[10px] text-clay-muted max-w-[340px] mt-0.5 leading-relaxed">
                Tuning study gaps adapts the revision scheduling directly to your practice history to make reviews highly efficient.
              </span>
            </div>

            {optimizeStatus === 'running' && (
              <div className="bg-clay-surface-soft border border-clay-hairline rounded-clay-md p-3 text-center space-y-2 animate-pulse">
                <div className="w-4 h-4 border-2 border-clay-pink border-t-transparent rounded-full animate-spin mx-auto" />
                <span className="text-[10px] font-bold text-clay-ink block">{optimizerProgress}</span>
              </div>
            )}

            {optimizeStatus === 'success' && (
              <div className="bg-clay-mint/20 border border-clay-mint text-clay-teal rounded-clay-md p-3 text-center text-[10px] font-bold animate-[fadeIn_0.2s_ease-out]">
                ✓ Revision scheduler successfully calibrated!
              </div>
            )}

            {optimizeStatus === 'error' && (
              <div className="bg-clay-coral/15 border border-clay-coral/45 text-clay-coral rounded-clay-md p-3 text-center text-[10px] leading-relaxed font-bold animate-[fadeIn_0.2s_ease-out]">
                ⚠ {optimizeErrorMsg}
              </div>
            )}

            {optimizeStatus === 'idle' && (
              <div className="flex items-center justify-between bg-clay-surface-soft border border-clay-hairline rounded-clay-md p-3">
                <div className="text-[10px] text-clay-muted">
                  <span className="block font-bold text-clay-ink">History Logs: {logsCount} / 50</span>
                  <span>Requires 50 review logs minimum to tune.</span>
                </div>
                <button
                  disabled={logsCount < 50}
                  onClick={handleOptimize}
                  className="px-3 py-1.5 bg-clay-teal hover:bg-clay-teal/90 disabled:opacity-50 disabled:hover:bg-clay-teal text-white text-[10px] font-bold rounded-clay-md transition-all active:scale-95 cursor-pointer shadow-sm"
                >
                  Calibrate
                </button>
              </div>
            )}
          </div>

          {/* Cache Management */}
          <div className="border-t border-clay-hairline pt-4 space-y-3">
            <div>
              <span className="block text-xs font-bold text-clay-ink flex items-center gap-1.5">
                Local Cache Management
              </span>
              <span className="block text-[10px] text-clay-muted max-w-[340px] mt-0.5 leading-relaxed">
                If question text or images are loading incorrectly, clearing your local question cache will trigger them to download fresh from our content servers. This will not delete your learning progress.
              </span>
            </div>
            
            <div className="flex items-center justify-between bg-clay-surface-soft border border-clay-hairline rounded-clay-md p-3">
              <div className="text-[10px] text-clay-muted">
                <span className="block font-bold text-clay-ink">Question Cache: {cachedQuestionsCount}</span>
                <span>locally cached questions</span>
              </div>
              <button
                onClick={handleClearCache}
                className="px-3 py-1.5 bg-clay-coral hover:bg-clay-coral/95 text-white text-[10px] font-bold rounded-clay-md transition-all active:scale-95 cursor-pointer shadow-sm animate-all duration-200"
              >
                Clear Cache
              </button>
            </div>
          </div>

          {rescheduleError && (
            <div className="bg-clay-coral/15 border border-clay-coral/45 text-clay-coral rounded-clay-md p-3 text-center text-[10px] leading-relaxed font-bold animate-[fadeIn_0.2s_ease-out]">
              ⚠ {rescheduleError}
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="flex gap-3 mt-6 border-t border-clay-hairline pt-4">
          <button
            onClick={onClose}
            disabled={isRescheduling || optimizeStatus === 'running'}
            className="flex-1 py-2.5 border border-clay-hairline hover:bg-clay-surface-soft disabled:opacity-50 text-clay-muted hover:text-clay-ink text-xs font-bold rounded-clay-md cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isRescheduling || optimizeStatus === 'running'}
            className="flex-1 py-2.5 bg-clay-ink hover:bg-neutral-800 disabled:opacity-50 text-white text-xs font-bold rounded-clay-md shadow-sm active:scale-95 transition-all duration-200 cursor-pointer flex justify-center items-center gap-1.5"
          >
            {isRescheduling ? (
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>{isRescheduling ? 'Rescheduling...' : 'Save Settings'}</span>
          </button>
        </div>

      </div>
    </div>
  );
}
