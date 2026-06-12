import { useState, useEffect } from 'react';
import { useAuth, SignedIn, SignedOut, UserButton, useUser } from '@clerk/clerk-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import { allSubjectsList, NEET_PG_PYQ_SUBJECT } from '../../lib/subjects';
import { Settings, ChevronRight, RefreshCw, AlertCircle, Trophy, Zap } from 'lucide-react';
import { type CustomModuleConfig } from '../practice/CustomModuleCreator';
import { FSRSSettingsModal } from '../../components/FSRSSettingsModal';
import { SyllabusDrawer } from '../../components/SyllabusDrawer';
import { SyncManager } from '../../lib/SyncManager';
import { getLevelInfo, getNextLevelInfo, getCurrentMonthStr } from '../../lib/gamification';
import { ThemeToggle } from '../../components/ThemeToggle';

interface DashboardProps {
  onStartPractice: () => void;
  onSignIn: () => void;
  onPracticeSubject: (subjectId: number, topicIds?: number[]) => void;
  onStartCustomModule: (config: CustomModuleConfig, resume?: boolean) => void;
  onManageCustomModules: () => void;
  onStartFSRSReview: () => void;
  onSyncForce?: () => Promise<void>;
  syncStatus?: 'synced' | 'syncing' | 'unsynced' | 'error';
  onViewStats: () => void;
  onViewLeaderboard: () => void;
}

// Subject grouping by MBBS Professional Phases
const MBBS_PHASES = [
  {
    name: 'First Year (Pre-Clinical)',
    description: 'Anatomy, Physiology, and Biochemistry.',
    subjectIds: [1, 2, 3], // Anatomy, Biochemistry, Physiology
  },
  {
    name: 'Second & Third Year (Para-Clinical)',
    description: 'Pathology, Pharmacology, Microbiology, Forensic Medicine, and Social & Preventive Medicine (SPM).',
    subjectIds: [4, 5, 6, 7, 8], // Pharmacology, Pathology, Microbiology, Forensic Medicine, SPM
  },
  {
    name: 'Short Subjects & Specialties',
    description: 'Ophthalmology, ENT, Pediatrics, Orthopedics, Dermatology, Psychiatry, Radiology, and Anesthesia.',
    subjectIds: [9, 10, 14, 15, 16, 17, 18, 19], // Ophtha, ENT, Peds, Ortho, Derm, Psych, Radio, Anesthesia
  },
  {
    name: 'Final Year (Core Clinicals)',
    description: 'General Medicine, General Surgery, and Obstetrics & Gynecology (OBG).',
    subjectIds: [11, 12, 13], // Medicine, Surgery, OBG
  },
  {
    name: 'Official Exam Archives',
    description: 'NEET PG Previous Year Papers (2018–2025).',
    subjectIds: [NEET_PG_PYQ_SUBJECT.id], // Virtual NEET PG subject ID
  },
];


export function Dashboard({
  onStartPractice,
  onSignIn,
  onPracticeSubject,
  onStartCustomModule,
  onManageCustomModules,
  onStartFSRSReview,
  onSyncForce,
  syncStatus = 'synced',
  onViewStats,
  onViewLeaderboard,
}: DashboardProps) {
  const { isSignedIn } = useAuth();
  const { user } = useUser();

  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [activeSyllabusSubjectId, setActiveSyllabusSubjectId] = useState<number | null>(null);
  const [activeSession, setActiveSession] = useState<any>(null);

  const currentMonth = getCurrentMonthStr();
  const userStats = useLiveQuery(() => db.userStats.get(currentMonth), [currentMonth]);

  const monthlyDopa = userStats?.dopa ?? 0;
  const lifetimeDopa = userStats?.lifetimeDopa ?? 0;
  const streakDays = userStats?.streakDays ?? 0;

  const levelInfo = getLevelInfo(monthlyDopa);
  const { nextLevel, remaining, pct } = getNextLevelInfo(monthlyDopa);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('openmedq_active_practice_session');
      if (saved) {
        setActiveSession(JSON.parse(saved));
      }
    } catch (err) {
      console.warn("Failed to check active session:", err);
    }
  }, []);

  const handleResumeSession = () => {
    if (activeSession && activeSession.config) {
      onStartCustomModule(activeSession.config, true);
    }
  };

  const handleDiscardSession = () => {
    if (window.confirm("Are you sure you want to discard this practice session? Your progress in this unfinished block will be lost.")) {
      localStorage.removeItem('openmedq_active_practice_session');
      setActiveSession(null);
    }
  };

  // Target Exam state (NEET PG by default)
  const [targetExam, setTargetExam] = useState<'NEET PG' | 'INI-CET' | 'FMGE'>(() => {
    return (localStorage.getItem('openmedq_target_exam') as any) || 'NEET PG';
  });

  const handleExamChange = async (exam: 'NEET PG' | 'INI-CET' | 'FMGE') => {
    setTargetExam(exam);
    localStorage.setItem('openmedq_target_exam', exam);
    await SyncManager.saveSettingsToIndexedDB();
    onSyncForce?.();
  };

  // Daily target MCQs count (customizable by user, default 50)
  const [dailyTarget, setDailyTarget] = useState<number>(() => {
    return parseInt(localStorage.getItem('openmedq_daily_target') || '50', 10);
  });

  const handleTargetChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val > 0) {
      setDailyTarget(val);
      localStorage.setItem('openmedq_daily_target', String(val));
      await SyncManager.saveSettingsToIndexedDB();
      onSyncForce?.();
    }
  };

  // Listen for background settings updates from the sync loops
  useEffect(() => {
    const handleSettingsUpdate = () => {
      setTargetExam((localStorage.getItem('openmedq_target_exam') as any) || 'NEET PG');
      setDailyTarget(parseInt(localStorage.getItem('openmedq_daily_target') || '50', 10));
    };
    window.addEventListener('openmedq_settings_updated', handleSettingsUpdate);
    return () => window.removeEventListener('openmedq_settings_updated', handleSettingsUpdate);
  }, []);

  // Live Query from IndexedDB for overall and subject progress
  const stats = useLiveQuery(async () => {
    try {
      const allProgressRaw = await db.progress.toArray();
      const allProgress = allProgressRaw.filter((p) => !p.isDeleted);
      const questions = await db.questions.toArray();

      const solvedCount = allProgress.filter((p) => p.questionId !== -999 && (p.status === 'CORRECT' || p.status === 'INCORRECT')).length;
      const correctCount = allProgress.filter((p) => p.questionId !== -999 && p.status === 'CORRECT').length;
      const incorrectCount = allProgress.filter((p) => p.questionId !== -999 && p.status === 'INCORRECT').length;
      const bookmarkedCount = allProgress.filter((p) => p.questionId !== -999 && p.status === 'BOOKMARKED').length;

      // Count FSRS due questions
      const now = Date.now();
      const dueCount = allProgress.filter((p) => p.questionId !== -999 && p.due !== undefined && p.due <= now).length;

      // Group progress by subject
      const progressMap = new Map(allProgress.map((p) => [p.questionId, p.status]));
      const subjectSolved: Record<number, number> = {};
      const subjectCorrect: Record<number, number> = {};
      let pyqSolvedCount = 0;
      let pyqCorrectCount = 0;

      questions.forEach((q) => {
        const status = progressMap.get(q.id);
        if (status) {
          subjectSolved[q.subjectId] = (subjectSolved[q.subjectId] || 0) + 1;
          if (status === 'CORRECT') {
            subjectCorrect[q.subjectId] = (subjectCorrect[q.subjectId] || 0) + 1;
          }
          if (q.examType === 'NEET PG' && q.examYear) {
            pyqSolvedCount++;
            if (status === 'CORRECT') {
              pyqCorrectCount++;
            }
          }
        }
      });

      subjectSolved[NEET_PG_PYQ_SUBJECT.id] = pyqSolvedCount;
      subjectCorrect[NEET_PG_PYQ_SUBJECT.id] = pyqCorrectCount;

      return {
        solvedCount,
        correctCount,
        incorrectCount,
        bookmarkedCount,
        dueCount,
        subjectSolved,
        subjectCorrect,
      };
    } catch (err) {
      console.warn('Error querying local stats.');
      return {
        solvedCount: 0,
        correctCount: 0,
        incorrectCount: 0,
        bookmarkedCount: 0,
        dueCount: 0,
        subjectSolved: {} as Record<number, number>,
        subjectCorrect: {} as Record<number, number>,
      };
    }
  }, []);

  const solvedCount = stats?.solvedCount || 0;
  const correctCount = stats?.correctCount || 0;
  const incorrectCount = stats?.incorrectCount || 0;
  const bookmarkedCount = stats?.bookmarkedCount || 0;
  const dueCount = stats?.dueCount || 0;
  const subjectSolved = stats?.subjectSolved || {};

  const percentRaw = dailyTarget > 0 ? (solvedCount / dailyTarget) * 100 : 0;
  const percent = Math.min(100, Math.max(0, percentRaw));

  // Accuracy Rate
  const accuracy = solvedCount > 0 ? Math.round((correctCount / solvedCount) * 100) : 100;

  // Handlers for active recall quick loops
  const handleStartIncorrects = () => {
    if (incorrectCount === 0) return;
    onStartCustomModule({
      subjectIds: [],
      status: 'INCORRECT',
      timerMode: 'STOPWATCH',
      timerValue: 0,
      limit: Math.min(10, incorrectCount),
    });
  };

  const handleStartBookmarks = () => {
    if (bookmarkedCount === 0) return;
    onStartCustomModule({
      subjectIds: [],
      status: 'BOOKMARKED',
      timerMode: 'STOPWATCH',
      timerValue: 0,
      limit: Math.min(10, bookmarkedCount),
    });
  };

  return (
    <div className="min-h-screen bg-clay-canvas text-clay-ink flex flex-col font-sans relative selection:bg-clay-pink/20">
      {/* Header bar */}
      <header className="sticky top-0 z-50 w-full bg-clay-canvas border-b border-clay-hairline py-4 px-6 md:px-12 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="text-xl font-bold tracking-tight text-clay-ink">OpenMedQ</span>
          <button
            onClick={onViewStats}
            className="text-xs font-bold text-clay-muted hover:text-clay-ink transition-colors flex items-center gap-1 cursor-pointer"
          >
            <span>Analytics</span>
          </button>
        </div>

        {/* User profile / Auth Button */}
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <SignedIn>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
          <SignedOut>
            <button
              onClick={onSignIn}
              className="text-xs font-bold text-clay-muted hover:text-clay-ink border border-clay-hairline px-3 py-1.5 rounded-clay-md hover:bg-clay-surface-soft transition-colors"
            >
              Sign In
            </button>
          </SignedOut>
        </div>
      </header>

      {/* Main content body */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-8 flex flex-col gap-8 text-left">
        
        {/* Welcome and Target Exam Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-clay-surface-soft border border-clay-hairline rounded-clay-xl p-6">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1.5 flex-wrap">
              <h1 className="font-rubik text-2xl md:text-3xl font-medium tracking-[-0.04em] text-clay-ink">
                {user ? `Welcome, Dr. ${user.firstName || 'Aspirant'}` : 'Guest Aspirant Mode'}
              </h1>
              
              {/* Sync Status Badge */}
              {!isSignedIn ? (
                <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-clay-md bg-clay-canvas border border-clay-hairline text-[10px] font-bold text-clay-muted select-none">
                  <span className="w-1.5 h-1.5 rounded-full bg-clay-ochre" />
                  <span>Saved on this device only</span>
                </div>
              ) : (
                <button
                  onClick={onSyncForce}
                  disabled={syncStatus === 'syncing'}
                  className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-clay-md bg-clay-canvas border border-clay-hairline text-[10px] font-bold transition-all ${
                    syncStatus === 'unsynced' || syncStatus === 'error'
                      ? 'text-clay-ink hover:bg-clay-surface-soft cursor-pointer'
                      : 'text-clay-muted select-none'
                  }`}
                >
                  {syncStatus === 'syncing' ? (
                    <RefreshCw className="w-3 h-3 text-clay-ochre animate-spin" />
                  ) : syncStatus === 'error' ? (
                    <AlertCircle className="w-3 h-3 text-clay-coral" />
                  ) : (
                    <span className={`w-1.5 h-1.5 rounded-full ${syncStatus === 'synced' ? 'bg-clay-mint' : 'bg-clay-ochre'}`} />
                  )}
                  <span>
                    {syncStatus === 'synced' && 'Synced with cloud'}
                    {syncStatus === 'syncing' && 'Syncing progress...'}
                    {syncStatus === 'unsynced' && 'Local changes (Sync Now)'}
                    {syncStatus === 'error' && 'Sync error (Try again)'}
                  </span>
                </button>
              )}
            </div>
            <p className="text-clay-body text-xs md:text-sm">
              Keep your daily streak burning by answering questions regularly.
            </p>
          </div>

          {/* Target Exam Selection */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-bold text-clay-muted uppercase tracking-wider">Target Exam Focus</span>
            <div className="flex border border-clay-hairline bg-clay-canvas rounded-clay-md p-1">
              {(['NEET PG', 'INI-CET', 'FMGE'] as const).map((exam) => (
                <button
                  key={exam}
                  onClick={() => handleExamChange(exam)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-clay-md transition-all cursor-pointer ${
                    targetExam === exam
                      ? 'bg-clay-ink text-white dark:text-clay-canvas shadow-sm'
                      : 'text-clay-muted hover:text-clay-ink hover:bg-clay-surface-soft'
                  }`}
                >
                  {exam}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Guest Warning Banner if signed out */}
        <SignedOut>
          <div className="bg-clay-pink rounded-clay-xl border border-transparent p-5 text-white shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-sm">Save Your Progress</h3>
              <p className="text-xs text-white/80 mt-0.5">
                You are studying offline. Create a free account to back up your progress and study on any device.
              </p>
            </div>
            <button
              onClick={onSignIn}
              className="bg-white text-clay-ink hover:bg-clay-surface-soft text-xs font-bold px-4 py-2.5 rounded-clay-md shadow-sm active:scale-95 transition-all duration-200 cursor-pointer shrink-0"
            >
              Create Free Account
            </button>
          </div>
        </SignedOut>

        {/* Your Revision & Goal Summary */}
        <div>
          <h2 className="text-xs uppercase font-bold text-clay-muted tracking-wider mb-4">
            Your Revision & Goal Summary
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Dopa XP & Level Bento Card (Gold/Ochre theme) */}
            <div className="bg-clay-ochre text-clay-ink rounded-clay-xl border border-clay-hairline p-6 md:col-span-3 flex flex-col md:flex-row items-center justify-between gap-6 transition-all duration-300">
              <div className="flex items-center gap-4 flex-1 w-full text-left">
                {/* Level Badge Illustration */}
                <div className="relative shrink-0 bg-white/40 border border-white/20 p-3 rounded-clay-lg flex items-center justify-center shadow-inner">
                  <img 
                    src={levelInfo.badgeUrl} 
                    alt={levelInfo.name} 
                    className="w-16 h-16 object-contain"
                  />
                  <span className="absolute -bottom-2 bg-clay-ink text-white font-rubik font-medium text-[9px] px-2 py-0.5 rounded-clay-pill border border-clay-hairline shadow-sm uppercase tracking-wider select-none">
                    Lvl {levelInfo.level}
                  </span>
                </div>
                
                {/* Level Details */}
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-bold text-clay-muted/80 uppercase tracking-widest block mb-0.5">
                    Level Milestone
                  </span>
                  <h3 className="font-rubik text-xl font-medium tracking-[-0.03em] text-clay-ink mb-1.5 flex items-center gap-1.5">
                    {levelInfo.name}
                    {streakDays > 0 && (
                      <span className="flex items-center gap-0.5 text-clay-coral font-bold text-xs bg-white/50 border border-white/25 px-2 py-0.5 rounded-clay-md" title="Daily streak burning!">
                        <Zap className="w-3.5 h-3.5 fill-current text-clay-ochre animate-pulse" />
                        <span>{streakDays}d streak</span>
                      </span>
                    )}
                  </h3>
                  
                  {/* Progress Bar */}
                  {nextLevel ? (
                    <div className="w-full max-w-md">
                      <div className="w-full bg-white/30 h-3 rounded-full overflow-hidden border border-white/10 shadow-inner">
                        <div 
                          className="bg-clay-ink h-full transition-all duration-500 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="flex justify-between items-center text-[10px] text-clay-muted mt-1.5 font-medium">
                        <span>{monthlyDopa} / {nextLevel.threshold} Dopa</span>
                        <span>{remaining} Dopa to level up ({pct}%)</span>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full max-w-md">
                      <span className="text-[10px] bg-clay-teal text-white font-bold px-2 py-0.5 rounded">MAX LEVEL</span>
                      <p className="text-[10px] text-clay-muted mt-1 font-medium">You reached Level 6 Prodigy! Total: {monthlyDopa} Dopa</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Leaderboard Trigger Column */}
              <div className="flex flex-row md:flex-col items-center justify-between md:justify-center gap-4 w-full md:w-auto shrink-0 md:pl-6 border-t md:border-t-0 md:border-l border-white/20 pt-4 md:pt-0 md:h-20">
                <div className="text-left md:text-center">
                  <span className="text-[10px] font-bold text-clay-muted/80 uppercase tracking-widest block">Monthly Score</span>
                  <span className="font-rubik text-2xl font-medium tracking-[-0.04em] text-clay-ink flex items-center justify-start md:justify-center gap-1.5 mt-0.5">
                    <img src="/badge/dopa-xp.png" alt="Dopa XP Logo" className="w-6 h-6 object-contain" />
                    <span>{monthlyDopa} Dopa</span>
                  </span>
                  <span className="text-[9px] text-clay-muted/80 font-bold tracking-tight block">Lifetime: {lifetimeDopa} Dopa</span>
                </div>
                
                <button
                  onClick={onViewLeaderboard}
                  className="bg-clay-ink hover:bg-neutral-800 text-white text-xs font-bold px-4 py-2.5 rounded-clay-md transition-all duration-200 cursor-pointer shadow-sm flex items-center gap-1.5 shrink-0 active:scale-95"
                >
                  <Trophy className="w-4 h-4 text-clay-ochre fill-current" />
                  <span>View Leaderboard</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Active Session Resume Bento Card */}
            {activeSession && (
              <div className="bg-clay-surface-soft border border-clay-ochre rounded-clay-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 md:col-span-3 transition-all duration-300">
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold bg-clay-ochre text-clay-ink uppercase tracking-wider px-2 py-0.5 rounded">
                      In Progress
                    </span>
                    <span className="text-xs text-clay-muted font-medium">
                      Unfinished practice suite detected
                    </span>
                  </div>
                  <h3 className="font-rubik text-xl font-bold tracking-[-0.03em] text-clay-ink mb-1">
                    Resume Practice Session
                  </h3>
                  <p className="text-clay-body text-xs leading-relaxed">
                    You have an unfinished session with {activeSession.questions?.length || 0} questions ({Object.keys(activeSession.firstAttempts || {}).length} answered). 
                    Status: <span className="font-semibold text-clay-pink">{activeSession.config?.status === 'SPACED_REPETITION' ? 'Spaced Repetition' : 'Custom Timed Module'}</span>
                  </p>
                </div>
                <div className="flex gap-3 shrink-0">
                  <button
                    onClick={handleDiscardSession}
                    className="px-4 py-2 border border-clay-hairline hover:bg-clay-surface-strong text-clay-muted hover:text-clay-ink text-xs font-bold rounded-clay-md transition-all cursor-pointer"
                  >
                    Discard Session
                  </button>
                  <button
                    onClick={handleResumeSession}
                    className="px-5 py-2 bg-clay-ochre hover:bg-amber-500 text-clay-ink text-xs font-bold rounded-clay-md transition-all shadow-sm active:scale-95 cursor-pointer flex items-center gap-1"
                  >
                    <span>Resume Session</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Card 1: Today's Study Goal (Pink, White text) - 2 columns width */}
            <div className="bg-clay-pink text-white rounded-clay-xl border border-transparent p-6 flex flex-col justify-between min-h-[220px] md:col-span-2">
              <div>
                <span className="text-[10px] font-bold text-white/80 uppercase tracking-wider block mb-1">
                  Today's Study Goal
                </span>
                <span className="font-rubik text-3xl font-medium tracking-[-0.04em]">
                  {solvedCount} of {dailyTarget} Done
                </span>
              </div>

              {/* Custom styled progress bar */}
              <div className="mt-4">
                <div className="w-full bg-white/25 h-3 rounded-full overflow-hidden">
                  <div
                    className="bg-white h-full transition-all duration-500"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <div className="flex justify-between items-center text-[10px] text-white/80 mt-1.5">
                  <span>{Math.round(percent)}% of your goal completed</span>
                  <div className="flex items-center gap-1 font-bold">
                    <span>Change Goal:</span>
                    <input
                      type="number"
                      value={dailyTarget}
                      onChange={handleTargetChange}
                      className="w-12 bg-white/20 border border-white/30 rounded px-1.5 py-0.5 text-center text-white focus:outline-none text-[10px] font-bold"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-4">
                <button
                  onClick={onStartPractice}
                  className="flex-1 bg-white hover:bg-clay-surface-soft text-clay-ink text-xs font-bold py-2.5 rounded-clay-md transition-colors duration-200 cursor-pointer flex justify-center items-center gap-1"
                >
                  <span>Start Practicing</span>
                </button>
              </div>
            </div>

            {/* Card 2: Revision Queue (Lavender, Dark text) - 1 column width */}
            <div className="bg-clay-lavender text-clay-ink rounded-clay-xl border border-clay-hairline p-6 flex flex-col justify-between min-h-[220px]">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-bold text-clay-muted uppercase tracking-wider block mb-1">
                    Smart Revision
                  </span>
                  <h3 className="font-rubik text-2xl font-medium tracking-[-0.04em] flex items-center gap-1.5">
                    <span>Revision Queue</span>
                    <button
                      onClick={() => setShowSettingsModal(true)}
                      className="p-1 rounded hover:bg-white/30 text-clay-muted hover:text-clay-ink transition-colors cursor-pointer"
                      title="Revision Settings"
                    >
                      <Settings className="w-3.5 h-3.5" />
                    </button>
                  </h3>
                </div>
              </div>

              <div className="space-y-2 my-3 text-xs text-clay-body">
                <div className="flex justify-between items-center bg-white/40 border border-clay-hairline p-2 rounded-clay-md">
                  <span className="font-semibold text-clay-pink">Ready to Revise:</span>
                  <span className="font-bold text-clay-pink">{dueCount} questions</span>
                </div>
                <div className="flex justify-between items-center bg-white/40 border border-clay-hairline p-1.5 rounded-clay-md text-[11px]">
                  <span className="font-medium">Saved Questions:</span>
                  <span className="font-bold text-clay-ink">{bookmarkedCount}</span>
                </div>
                <div className="flex justify-between items-center bg-white/40 border border-clay-hairline p-1.5 rounded-clay-md text-[11px]">
                  <span className="font-medium">Mistakes to Fix:</span>
                  <span className="font-bold text-clay-ink">{incorrectCount}</span>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <button
                  onClick={onStartFSRSReview}
                  disabled={dueCount === 0}
                  className="w-full bg-clay-ink hover:bg-neutral-800 disabled:opacity-45 disabled:hover:bg-clay-ink text-white text-xs font-bold py-2 rounded-clay-md transition-all duration-200 cursor-pointer flex justify-center items-center gap-1"
                >
                  <span>Start Revision ({dueCount})</span>
                </button>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={handleStartBookmarks}
                    disabled={bookmarkedCount === 0}
                    className="bg-white hover:bg-clay-surface-soft disabled:opacity-45 disabled:hover:bg-white text-clay-ink border border-clay-hairline text-[10px] font-bold py-1.5 rounded-clay-md transition-all duration-200 cursor-pointer flex justify-center items-center"
                  >
                    Study Saved
                  </button>
                  <button
                    onClick={handleStartIncorrects}
                    disabled={incorrectCount === 0}
                    className="bg-white hover:bg-clay-surface-soft disabled:opacity-45 disabled:hover:bg-white text-clay-ink border border-clay-hairline text-[10px] font-bold py-1.5 rounded-clay-md transition-all duration-200 cursor-pointer flex justify-center items-center"
                  >
                    Fix Mistakes
                  </button>
                </div>
              </div>
            </div>

            {/* Card 3: Custom Practice Test (Mint, Dark text) - 2 columns width */}
            <div className="bg-clay-mint text-clay-ink rounded-clay-xl border border-clay-hairline p-6 flex flex-col justify-between min-h-[220px] md:col-span-2">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-bold text-clay-muted uppercase tracking-wider block mb-1">
                    Custom Testing
                  </span>
                  <h3 className="font-rubik text-2xl font-medium tracking-[-0.04em]">
                    Custom Practice Test
                  </h3>
                </div>
              </div>

              <div className="my-3 text-left">
                <p className="text-xs text-clay-body leading-relaxed max-w-xl">
                  Create a custom practice session tailored to your needs. Choose specific subjects, select focus topics, target only your mistakes or saved questions, and set custom timing modes.
                </p>
              </div>

              <div className="flex gap-3 mt-4">
                <button
                  onClick={onManageCustomModules}
                  className="flex-1 bg-clay-ink hover:bg-neutral-800 text-white text-xs font-bold py-2.5 rounded-clay-md transition-colors duration-200 cursor-pointer flex justify-center items-center gap-1"
                >
                  <span>Create Custom Test</span>
                </button>
              </div>
            </div>

            {/* Card 4: Success Rate (Peach, Dark text) - 1 column width */}
            <div className="bg-clay-peach text-clay-ink rounded-clay-xl border border-clay-hairline p-6 flex flex-col justify-between min-h-[220px]">
              <div>
                <span className="text-[10px] font-bold text-clay-muted uppercase tracking-wider block mb-1">
                  Overall Progress
                </span>
                <h3 className="font-rubik text-2xl font-medium tracking-[-0.04em]">
                  Success Rate
                </h3>
              </div>

              <div className="my-1.5 text-left">
                <span className="block text-4xl font-bold tracking-tight text-clay-ink mb-1">
                  {accuracy}%
                </span>
                <p className="text-[10px] text-clay-muted leading-relaxed">
                  Based on {solvedCount} total questions answered.
                </p>
              </div>

              <button
                onClick={onViewStats}
                className="w-full mt-3 bg-white hover:bg-clay-surface-soft text-clay-ink text-xs font-bold py-2 rounded-clay-md transition-colors cursor-pointer flex justify-center items-center gap-1 shadow-sm"
              >
                <span>View Performance Insights</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

          </div>
        </div>

        {/* MBBS Subjects & Syllabus */}
        <div>
          <div className="flex items-center justify-between mb-6 border-b border-clay-hairline pb-4 flex-wrap gap-2">
            <div>
              <h2 className="font-rubik text-xl md:text-2xl font-medium tracking-[-0.03em] text-clay-ink">
                MBBS Subjects & Syllabus
              </h2>
              <p className="text-clay-muted text-xs mt-0.5">
                Select a subject below to start practicing or view key topics.
              </p>
            </div>
            <button
              onClick={onManageCustomModules}
              className="text-xs font-bold text-clay-pink hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Create custom practice test</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-10">
            {MBBS_PHASES.map((phase) => {
              // Get subjects matching this phase
              const phaseSubjects = allSubjectsList.filter((s) => phase.subjectIds.includes(s.id));
              
              return (
                <div key={phase.name} className="space-y-4">
                  <div className="text-left">
                    <h3 className="text-xs uppercase font-bold text-clay-muted tracking-wider">
                      {phase.name}
                    </h3>
                    <p className="text-clay-muted text-[11px] mt-0.5">
                      {phase.description}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {phaseSubjects.map((subject) => {
                      const solved = subjectSolved[subject.id] || 0;
                      const pct = Math.min(100, Math.round((solved / subject.count) * 100));
                      
                      return (
                        <div
                          key={subject.id}
                          className="bg-clay-canvas border border-clay-hairline rounded-clay-lg p-5 flex flex-col justify-between hover:border-clay-muted transition-all duration-300 group"
                        >
                          <div>
                            <div className="flex justify-between items-start gap-2 mb-2">
                              <span className="font-semibold text-sm text-clay-ink leading-tight">
                                {subject.name}
                              </span>
                              <span className="text-[10px] font-bold text-clay-muted bg-clay-surface-soft border border-clay-hairline px-2 py-0.5 rounded shrink-0">
                                {subject.count} Qs
                              </span>
                            </div>

                            {/* Mini progress bar */}
                            <div className="w-full bg-clay-surface-soft h-1.5 rounded-full overflow-hidden mt-3">
                              <div
                                className="bg-clay-teal h-full transition-all duration-500"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <div className="flex justify-between items-center text-[10px] text-clay-muted mt-1.5">
                              <span>Solved: {solved} Qs</span>
                              <span>{pct}% Completed</span>
                            </div>
                          </div>

                          <div className="flex flex-col sm:flex-row gap-2 mt-4">
                            <button
                              onClick={() => {
                                if (subject.id === NEET_PG_PYQ_SUBJECT.id) {
                                  setActiveSyllabusSubjectId(NEET_PG_PYQ_SUBJECT.id);
                                } else {
                                  onPracticeSubject(subject.id);
                                }
                              }}
                              className="flex-1 bg-clay-surface-soft hover:bg-clay-surface-strong group-hover:bg-clay-ink group-hover:text-white dark:group-hover:text-clay-canvas border border-clay-hairline text-clay-ink text-xs font-bold py-2 rounded-clay-md transition-all duration-200 cursor-pointer flex justify-center items-center gap-1"
                            >
                              <span>{subject.id === NEET_PG_PYQ_SUBJECT.id ? 'View Papers' : 'Start Practice'}</span>
                            </button>
                            <button
                              onClick={() => setActiveSyllabusSubjectId(subject.id)}
                              className="flex-1 bg-clay-canvas hover:bg-clay-surface-soft border border-clay-hairline text-clay-muted hover:text-clay-ink text-xs font-bold py-2 rounded-clay-md transition-all duration-200 cursor-pointer flex justify-center items-center gap-1"
                            >
                              <span>{subject.id === NEET_PG_PYQ_SUBJECT.id ? 'View Years' : 'View Topics'}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </main>

      {/* Footer */}
      <footer className="w-full bg-clay-surface-soft border-t border-clay-hairline py-8 px-6 md:px-12 text-center text-xs text-clay-muted">
        <p className="max-w-xl mx-auto">
          OpenMedQ is a non-profit open-source QBank platform designed to keep clinical test preparation accessible. All study metrics remain secure in your local browser storage.
        </p>
        <p className="mt-2 text-[10px]">
          Created by volunteer medical graduates and developers.
        </p>
      </footer>

      <FSRSSettingsModal 
        isOpen={showSettingsModal} 
        onClose={() => setShowSettingsModal(false)} 
        onSave={() => onSyncForce?.()} 
      />

      <SyllabusDrawer
        subjectId={activeSyllabusSubjectId}
        onClose={() => setActiveSyllabusSubjectId(null)}
        onPractice={(config) => {
          setActiveSyllabusSubjectId(null);
          if (config.subjectIds[0] === NEET_PG_PYQ_SUBJECT.id) {
            onStartCustomModule({
              subjectIds: [],
              status: 'ALL',
              timerMode: config.timerMode || 'STOPWATCH',
              timerValue: config.timerValue || 0,
              limit: config.limit,
              examType: config.examType,
              examYear: config.examYear,
              isMockTest: config.isMockTest
            });
          } else {
            onPracticeSubject(config.subjectIds[0], config.topicIds);
          }
        }}
      />
    </div>
  );
}
