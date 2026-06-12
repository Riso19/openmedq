import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '@clerk/clerk-react';
import { db } from '../../lib/db';
import { subjectsList } from '../../lib/subjects';
import { getCurrentMonthStr } from '../../lib/gamification';
import { ThemeToggle } from '../../components/ThemeToggle';
import { 
  ArrowLeft, 
  BarChart3, 
  BrainCircuit, 
  Calendar, 
  Trophy, 
  Zap, 
  TrendingUp,
  Sparkles,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { type CustomModuleConfig } from '../practice/CustomModuleCreator';

interface AnalyticsProps {
  onBack: () => void;
  onStartCustomModule: (config: CustomModuleConfig) => void;
  onPracticeSubject: (subjectId: number, topicIds?: number[]) => void;
  syncStatus?: 'synced' | 'syncing' | 'unsynced' | 'error';
  onSyncForce?: () => Promise<void>;
}

// Groupings matching MBBS Professional Phases
const PHASES = [
  { name: 'Pre-Clinical', subjectIds: [1, 2, 3], color: 'var(--clay-peach)' },
  { name: 'Para-Clinical', subjectIds: [4, 5, 6, 7, 8], color: 'var(--clay-lavender)' },
  { name: 'Short Subjects', subjectIds: [9, 10, 14, 15, 16, 17, 18, 19], color: 'var(--clay-mint)' },
  { name: 'Core Clinicals', subjectIds: [11, 12, 13], color: 'var(--clay-pink)' }
];

export function Analytics({ 
  onBack, 
  onStartCustomModule, 
  onPracticeSubject,
  syncStatus = 'synced',
  onSyncForce
}: AnalyticsProps) {
  const { isSignedIn } = useAuth();
  const [hoveredHistoryIdx, setHoveredHistoryIdx] = useState<number | null>(null);
  const [subjectSortBy, setSubjectSortBy] = useState<'name' | 'solved' | 'accuracy'>('accuracy');
  const [subjectSortOrder, setSubjectSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedForecastDay, setSelectedForecastDay] = useState<string | null>(null);

  // Read real data from IndexedDB
  const stats = useLiveQuery(async () => {
    try {
      const allProgressRaw = await db.progress.toArray();
      const allProgress = allProgressRaw.filter(p => !p.isDeleted);
      const questions = await db.questions.toArray();

      const solvedCount = allProgress.filter(p => p.questionId !== -999 && (p.status === 'CORRECT' || p.status === 'INCORRECT')).length;
      const correctCount = allProgress.filter(p => p.questionId !== -999 && p.status === 'CORRECT').length;
      const incorrectCount = allProgress.filter(p => p.questionId !== -999 && p.status === 'INCORRECT').length;
      const bookmarkedCount = allProgress.filter(p => p.questionId !== -999 && p.status === 'BOOKMARKED').length;

      // FSRS metrics
      const now = Date.now();
      const dueCount = allProgress.filter(p => p.questionId !== -999 && p.due !== undefined && p.due <= now).length;

      // Group progress by subject
      const progressMap = new Map(allProgress.map(p => [p.questionId, p]));
      const subjectSolved: Record<number, number> = {};
      const subjectCorrect: Record<number, number> = {};

      questions.forEach(q => {
        const p = progressMap.get(q.id);
        if (p && (p.status === 'CORRECT' || p.status === 'INCORRECT')) {
          subjectSolved[q.subjectId] = (subjectSolved[q.subjectId] || 0) + 1;
          if (p.status === 'CORRECT') {
            subjectCorrect[q.subjectId] = (subjectCorrect[q.subjectId] || 0) + 1;
          }
        }
      });

      // Group by answered day (last 14 days)
      const oneDay = 24 * 60 * 60 * 1000;
      const historyMap: Record<string, { solved: number; correct: number; incorrect: number }> = {};
      
      // Initialize last 14 days
      for (let i = 0; i < 14; i++) {
        const d = new Date(now - (13 - i) * oneDay);
        const key = d.toDateString();
        historyMap[key] = { solved: 0, correct: 0, incorrect: 0 };
      }

      allProgress.forEach(p => {
        if (p.status === 'CORRECT' || p.status === 'INCORRECT') {
          const dateKey = new Date(p.answeredAt).toDateString();
          if (historyMap[dateKey]) {
            historyMap[dateKey].solved += 1;
            if (p.status === 'CORRECT') {
              historyMap[dateKey].correct += 1;
            } else {
              historyMap[dateKey].incorrect += 1;
            }
          }
        }
      });

      const history14Days = Object.entries(historyMap).map(([key, data]) => {
        const dateObj = new Date(key);
        const accuracy = data.solved > 0 ? Math.round((data.correct / data.solved) * 100) : 100;
        return {
          dateStr: dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
          solved: data.solved,
          correct: data.correct,
          incorrect: data.incorrect,
          accuracy
        };
      });

      // FSRS forecast (next 7 days)
      const forecastMap: Record<string, number> = {};
      for (let i = 0; i < 7; i++) {
        const d = new Date(now + i * oneDay);
        forecastMap[d.toDateString()] = 0;
      }

      allProgress.forEach(p => {
        if (p.due !== undefined) {
          const dueStr = new Date(p.due).toDateString();
          if (forecastMap[dueStr] !== undefined) {
            forecastMap[dueStr] += 1;
          }
        }
      });

      const forecast7Days = Object.entries(forecastMap).map(([key, count], idx) => {
        const dateObj = new Date(key);
        return {
          dateStr: idx === 0 ? 'Today' : dateObj.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' }),
          dueCount: count,
          dateKey: key
        };
      });

      // Group due cards by due date for forecast click details
      const dueDetailsMap: Record<string, { subjectId: number; subjectName: string; count: number }[]> = {};
      const questionsMapForDue = new Map(questions.map(q => [q.id, q]));
      allProgress.forEach(p => {
        if (p.due !== undefined) {
          const dueStr = new Date(p.due).toDateString();
          const q = questionsMapForDue.get(p.questionId);
          if (q) {
            const subjectId = q.subjectId;
            const subjectName = subjectsList.find(s => s.id === subjectId)?.name || 'General Medicine';
            
            if (!dueDetailsMap[dueStr]) {
              dueDetailsMap[dueStr] = [];
            }
            
            const existing = dueDetailsMap[dueStr].find(item => item.subjectId === subjectId);
            if (existing) {
              existing.count++;
            } else {
              dueDetailsMap[dueStr].push({ subjectId, subjectName, count: 1 });
            }
          }
        }
      });

      // Group solves by date string for the 112 days (16 weeks) activity heatmap
      const solvesByDate: Record<string, number> = {};
      allProgress.forEach(p => {
        if (p.status === 'CORRECT' || p.status === 'INCORRECT') {
          const dStr = new Date(p.answeredAt).toDateString();
          solvesByDate[dStr] = (solvesByDate[dStr] || 0) + 1;
        }
      });

      const today = new Date(now);
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
      const heatmapDays: { dateStr: string; count: number; level: number; dayName: string; tooltip: string }[] = [];
      const dayOfWeekOfStart = new Date(todayStart - 111 * oneDay).getDay(); // Sunday=0

      for (let i = 111; i >= 0; i--) {
        const time = todayStart - i * oneDay;
        const d = new Date(time);
        const dStr = d.toDateString();
        const count = solvesByDate[dStr] || 0;
        
        let level = 0;
        if (count > 0 && count < 5) level = 1;
        else if (count >= 5 && count < 10) level = 2;
        else if (count >= 10) level = 3;

        heatmapDays.push({
          dateStr: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
          count,
          level,
          dayName: d.toLocaleDateString('en-IN', { weekday: 'short' }),
          tooltip: `${count} questions solved on ${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
        });
      }

      // FSRS difficulty distribution (1-10)
      const diffCounts: Record<number, number> = {};
      for (let i = 1; i <= 10; i++) diffCounts[i] = 0;
      allProgress.forEach(p => {
        if (p.difficulty !== undefined) {
          const roundedDiff = Math.min(10, Math.max(1, Math.round(p.difficulty)));
          diffCounts[roundedDiff] += 1;
        }
      });
      const difficultyDistribution = Object.entries(diffCounts).map(([diff, count]) => ({
        difficulty: Number(diff),
        count
      }));

      // FSRS stability distribution
      let stabilityVeryShort = 0; // < 3d
      let stabilityShort = 0;     // 3-10d
      let stabilityMedium = 0;    // 10-30d
      let stabilityLong = 0;      // 30-90d
      let stabilityMature = 0;    // 90d+

      allProgress.forEach(p => {
        if (p.stability !== undefined) {
          const stab = p.stability;
          if (stab < 3) stabilityVeryShort++;
          else if (stab < 10) stabilityShort++;
          else if (stab < 30) stabilityMedium++;
          else if (stab < 90) stabilityLong++;
          else stabilityMature++;
        }
      });

      const stabilityDistribution = [
        { range: '< 3d', label: 'Very Short', count: stabilityVeryShort, color: '#ff6b5a' },
        { range: '3-10d', label: 'Short Term', count: stabilityShort, color: '#e8b94a' },
        { range: '10-30d', label: 'Medium Term', count: stabilityMedium, color: '#b8a4ed' },
        { range: '30-90d', label: 'Long Term', count: stabilityLong, color: '#a4d4c5' },
        { range: '90d+', label: 'Mature', count: stabilityMature, color: '#1a3a3a' }
      ];

      // FSRS card states (New = unattempted in DB)
      const totalQuestionsCount = questions.length;
       const progressQIds = new Set(allProgress.filter(p => p.questionId !== -999).map(p => p.questionId));
       const newCardsCount = Math.max(0, totalQuestionsCount - progressQIds.size);
 
       let learningCount = 0;
       let reviewCount = 0;
       let relearningCount = 0;
 
       allProgress.forEach(p => {
         if (p.questionId === -999) return;
         if (p.state === 1) learningCount++;
         else if (p.state === 2) reviewCount++;
         else if (p.state === 3) relearningCount++;
         else {
           if (p.status === 'INCORRECT') relearningCount++;
           else if (p.reps !== undefined && p.reps > 1) reviewCount++;
           else learningCount++;
         }
       });

      const stateDistribution = {
        newCards: newCardsCount,
        learning: learningCount,
        review: reviewCount,
        relearning: relearningCount
      };

      const subjectProgressMock: Record<number, { solved: number; correct: number }> = {};
      subjectsList.forEach(s => {
        subjectProgressMock[s.id] = {
          solved: subjectSolved[s.id] || 0,
          correct: subjectCorrect[s.id] || 0
        };
      });

      // Get actual streak from userStats (synced with D1 and Dashboard)
      const currentMonth = getCurrentMonthStr();
      const userStats = await db.userStats.get(currentMonth);
      const streakCount = userStats?.streakDays ?? 0;

      // Estimated Knowledge Score & Memory Retention Index using FSRS v6 power-law forgetting curve
      let totalRetrievability = 0;
      let reviewedCardsCount = 0;

      // Compute FSRS v6 decay and factor from user's current weights
      const fsrsWeightsRaw = localStorage.getItem('openmedq_fsrs_weights');
      let fsrsW20 = 0.5; // default w[20]
      if (fsrsWeightsRaw) {
        try {
          const parsed = JSON.parse(fsrsWeightsRaw);
          if (Array.isArray(parsed) && parsed.length > 20) fsrsW20 = parsed[20];
        } catch {}
      }
      const decay = -fsrsW20;
      const factor = Math.exp(Math.pow(decay, -1) * Math.log(0.9)) - 1;

      allProgress.forEach(p => {
        if (p.status === 'CORRECT' || p.status === 'INCORRECT') {
          reviewedCardsCount++;
          if (p.stability !== undefined && p.stability > 0) {
            const lastReviewTime = p.lastReview || p.answeredAt || now;
            const elapsedDays = Math.max(0, (now - lastReviewTime) / (24 * 60 * 60 * 1000));
            // FSRS v6 power-law: R = (1 + factor * t/S)^decay
            const r = Math.pow(1 + factor * elapsedDays / p.stability, decay);
            totalRetrievability += Math.max(0, Math.min(1, r));
          } else {
            totalRetrievability += 0.9;
          }
        }
      });

      const estimatedKnowledgeCount = Math.round(totalRetrievability * 10) / 10;
      const averageRetentionRate = reviewedCardsCount > 0 
        ? Math.round((totalRetrievability / reviewedCardsCount) * 100) 
        : 90;

      // Leech concept detection
      const leechProgress = allProgress.filter(p => {
        const difficulty = p.difficulty ?? 0;
        const lapses = p.lapses ?? 0;
        return (lapses >= 3 && difficulty >= 7.0) || (p.status === 'INCORRECT' && difficulty >= 7.5);
      });

      const questionsMap = new Map(questions.map(q => [q.id, q]));
      const leeches = leechProgress.map(p => {
        const q = questionsMap.get(p.questionId);
        return {
          questionId: p.questionId,
          lapses: p.lapses ?? 0,
          difficulty: p.difficulty ?? 0,
          questionText: q?.questionText || 'Unknown Question Details',
          subjectId: q?.subjectId || 0,
          subjectName: subjectsList.find(s => s.id === q?.subjectId)?.name || 'General Medicine'
        };
      }).sort((a, b) => b.lapses - a.lapses || b.difficulty - a.difficulty);

      return {
        solvedCount,
        correctCount,
        incorrectCount,
        bookmarkedCount,
        dueCount,
        streakCount,
        history14Days,
        forecast7Days,
        difficultyDistribution,
        stabilityDistribution,
        stateDistribution,
        subjectProgressMock,
        estimatedKnowledgeCount,
        averageRetentionRate,
        leeches,
        dueDetailsMap,
        heatmapDays,
        dayOfWeekOfStart
      };
    } catch (err) {
      console.warn("Query error for stats.");
      return null;
    }
  }, []);

  // Loading State
  if (stats === undefined) {
    return (
      <div className="min-h-screen bg-clay-canvas text-clay-ink flex flex-col font-sans relative selection:bg-clay-pink/20">
        <header className="sticky top-0 z-50 w-full bg-clay-canvas border-b border-clay-hairline py-4 px-6 md:px-12 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-1.5 rounded-clay-md border border-clay-hairline text-clay-muted hover:text-clay-ink hover:bg-clay-surface-soft transition-all cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-bold tracking-tight text-clay-ink">Dr. Performance Insights</span>
          </div>
        </header>
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="w-8 h-8 border-2 border-clay-pink border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-xs text-clay-muted font-bold">Querying local practice database...</p>
        </div>
      </div>
    );
  }

  // Onboarding/Empty State (no questions solved yet)
  if (stats === null || stats.solvedCount === 0) {
    return (
      <div className="min-h-screen bg-clay-canvas text-clay-ink flex flex-col font-sans relative selection:bg-clay-pink/20">
        <div className="absolute top-0 left-0 w-[50%] h-[50%] bg-clay-lavender/5 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-[50%] h-[50%] bg-clay-peach/5 rounded-full blur-[140px] pointer-events-none" />
        
        {/* Header bar */}
        <header className="sticky top-0 z-50 w-full bg-clay-canvas border-b border-clay-hairline py-4 px-6 md:px-12 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-1.5 rounded-clay-md border border-clay-hairline text-clay-muted hover:text-clay-ink hover:bg-clay-surface-soft transition-all cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-bold tracking-tight text-clay-ink">Dr. Performance Insights</span>
          </div>
        </header>

        {/* Empty State Body */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-xl mx-auto z-10 relative">
          <div className="w-16 h-16 bg-clay-peach rounded-clay-xl border border-clay-hairline flex items-center justify-center mb-6 shadow-sm">
            <BrainCircuit className="w-8 h-8 text-clay-ink" />
          </div>
          <h2 className="font-rubik text-2xl font-medium tracking-[-0.04em] text-clay-ink mb-3">
            No Practice Insights Available Yet
          </h2>
          <p className="text-clay-body text-sm leading-relaxed mb-8">
            Once you begin solving questions in the practice suite or create custom testing modules, this dashboard will visualize your 14-day study history, revision memory queues, and subject-wise accuracy breakdowns.
          </p>
          
          <button
            onClick={onBack}
            className="px-6 py-3 bg-clay-ink hover:bg-neutral-800 text-white text-sm font-bold rounded-clay-md transition-all duration-200 cursor-pointer shadow-sm"
          >
            Go to Dashboard & Start Practice
          </button>
        </div>
      </div>
    );
  }

  // Streak calculations
  const streakText = stats.streakCount > 0 
    ? `${stats.streakCount} Day Streak` 
    : 'No Active Streak';

  // Overall accuracy
  const overallAccuracy = stats.solvedCount > 0 
    ? Math.round((stats.correctCount / stats.solvedCount) * 100) 
    : 100;

  // Process Phase Solved / Correct stats
  const phaseStats = PHASES.map(phase => {
    let totalQuestionsInPhase = 0;
    let solvedInPhase = 0;
    let correctInPhase = 0;

    phase.subjectIds.forEach(subId => {
      const sub = subjectsList.find(s => s.id === subId);
      if (sub) {
        totalQuestionsInPhase += sub.count;
      }
      const prog = stats.subjectProgressMock[subId];
      if (prog) {
        solvedInPhase += prog.solved;
        correctInPhase += prog.correct;
      }
    });

    const completionPct = totalQuestionsInPhase > 0 
      ? Math.min(100, Math.round((solvedInPhase / totalQuestionsInPhase) * 1000) / 10) 
      : 0;

    const accuracyPct = solvedInPhase > 0 
      ? Math.round((correctInPhase / solvedInPhase) * 100) 
      : 100;

    return {
      ...phase,
      totalInPhase: totalQuestionsInPhase,
      solved: solvedInPhase,
      correct: correctInPhase,
      completionPct,
      accuracyPct
    };
  });

  // Sortable subjects data
  const sortedSubjects = (() => {
    const subjects = subjectsList.map(subject => {
      const prog = stats.subjectProgressMock[subject.id] || { solved: 0, correct: 0 };
      const completionPct = Math.min(100, Math.round((prog.solved / subject.count) * 1000) / 10);
      const accuracyPct = prog.solved > 0 ? Math.round((prog.correct / prog.solved) * 100) : 100;
      
      let phaseName = 'Specialty';
      if (PHASES[0].subjectIds.includes(subject.id)) phaseName = 'Pre-Clinical';
      else if (PHASES[1].subjectIds.includes(subject.id)) phaseName = 'Para-Clinical';
      else if (PHASES[3].subjectIds.includes(subject.id)) phaseName = 'Clinical Core';

      return {
        ...subject,
        phaseName,
        solved: prog.solved,
        correct: prog.correct,
        completionPct,
        accuracyPct
      };
    });

    return [...subjects].sort((a, b) => {
      let comparison = 0;
      if (subjectSortBy === 'name') {
        comparison = a.name.localeCompare(b.name);
      } else if (subjectSortBy === 'solved') {
        comparison = a.solved - b.solved;
      } else if (subjectSortBy === 'accuracy') {
        comparison = a.accuracyPct - b.accuracyPct;
      }

      return subjectSortOrder === 'asc' ? comparison : -comparison;
    });
  })();

  const toggleSort = (field: 'name' | 'solved' | 'accuracy') => {
    if (subjectSortBy === field) {
      setSubjectSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSubjectSortBy(field);
      setSubjectSortOrder('desc');
    }
  };

  // SVG Chart Calculations - 14-Day History Chart
  const historyChartDimensions = { width: 680, height: 260 };
  const historyChartPadding = { top: 20, right: 40, bottom: 40, left: 40 };

  const historyMaxSolved = Math.max(10, ...stats.history14Days.map(d => d.solved));

  // Points for 14-day history SVG
  const historyChartPoints = (() => {
    const { width, height } = historyChartDimensions;
    const { top, right, bottom, left } = historyChartPadding;
    const chartWidth = width - left - right;
    const chartHeight = height - top - bottom;

    const dataLength = stats.history14Days.length;
    const stepX = chartWidth / (dataLength - 1);

    return stats.history14Days.map((d, index) => {
      const x = left + index * stepX;
      
      const barHeightSolved = historyMaxSolved > 0 ? (d.solved / historyMaxSolved) * chartHeight : 0;
      const barHeightCorrect = historyMaxSolved > 0 ? (d.correct / historyMaxSolved) * chartHeight : 0;
      const ySolved = top + chartHeight - barHeightSolved;
      const yCorrect = top + chartHeight - barHeightCorrect;

      const yAccuracy = top + chartHeight - (d.accuracy / 100) * chartHeight;

      return {
        x,
        ySolved,
        yCorrect,
        yAccuracy,
        barWidth: Math.max(12, Math.min(24, stepX * 0.45)),
        ...d
      };
    });
  })();

  const historyAccuracyPath = historyChartPoints.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.yAccuracy}`).join(' ');

  // FSRS Forecast Chart calculations
  const forecastChartDimensions = { width: 420, height: 180 };
  const forecastChartPadding = { top: 15, right: 15, bottom: 35, left: 30 };

  const forecastMax = Math.max(10, ...stats.forecast7Days.map(d => d.dueCount));

  const forecastChartPoints = (() => {
    const { width, height } = forecastChartDimensions;
    const { top, right, bottom, left } = forecastChartPadding;
    const chartWidth = width - left - right;
    const chartHeight = height - top - bottom;

    const dataLength = stats.forecast7Days.length;
    const stepX = chartWidth / (dataLength - 1);

    return stats.forecast7Days.map((d, index) => {
      const x = left + index * stepX;
      const barHeight = forecastMax > 0 ? (d.dueCount / forecastMax) * chartHeight : 0;
      const y = top + chartHeight - barHeight;

      return {
        x,
        y,
        barHeight,
        barWidth: Math.max(12, Math.min(30, stepX * 0.4)),
        ...d
      };
    });
  })();

  // FSRS Difficulty Histogram Calculations
  const diffChartDimensions = { width: 420, height: 180 };
  const diffChartPadding = { top: 15, right: 15, bottom: 35, left: 30 };

  const diffMax = Math.max(5, ...stats.difficultyDistribution.map(d => d.count));

  const diffChartPoints = (() => {
    const { width, height } = diffChartDimensions;
    const { top, right, bottom, left } = diffChartPadding;
    const chartWidth = width - left - right;
    const chartHeight = height - top - bottom;

    const dataLength = stats.difficultyDistribution.length;
    const stepX = chartWidth / dataLength;

    return stats.difficultyDistribution.map((d, index) => {
      const x = left + index * stepX + stepX / 2;
      const barHeight = diffMax > 0 ? (d.count / diffMax) * chartHeight : 0;
      const y = top + chartHeight - barHeight;

      return {
        x,
        y,
        barHeight,
        barWidth: Math.max(10, stepX * 0.7),
        ...d
      };
    });
  })();

  // FSRS State Ring calculation
  const fsrsStatesTotal = stats.stateDistribution.newCards + 
                           stats.stateDistribution.learning + 
                           stats.stateDistribution.review + 
                           stats.stateDistribution.relearning;

  const cardStates = (() => {
    const states = [
      { name: 'Review (Scheduled)', count: stats.stateDistribution.review, color: 'bg-clay-teal text-white' },
      { name: 'Learning (Active)', count: stats.stateDistribution.learning, color: 'bg-clay-lavender text-clay-ink border border-clay-hairline' },
      { name: 'Relearning (Lapsed)', count: stats.stateDistribution.relearning, color: 'bg-clay-pink text-white' },
      { name: 'New (Unattempted)', count: stats.stateDistribution.newCards, color: 'bg-clay-surface-card text-clay-muted border border-clay-hairline' },
    ];
    
    return states.map(s => {
      const pct = fsrsStatesTotal > 0 ? (s.count / fsrsStatesTotal) * 100 : 0;
      return { ...s, pct };
    });
  })();

  return (
    <div className="min-h-screen bg-clay-canvas text-clay-ink flex flex-col font-sans relative selection:bg-clay-pink/20 pb-16">
      
      {/* Decorative Blur Orbs */}
      <div className="absolute top-0 left-0 w-[50%] h-[40%] bg-clay-lavender/5 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-[20%] right-0 w-[40%] h-[40%] bg-clay-pink/5 rounded-full blur-[140px] pointer-events-none" />

      {/* Header bar */}
      <header className="sticky top-0 z-50 w-full bg-clay-canvas border-b border-clay-hairline py-4 px-6 md:px-12 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 rounded-clay-md border border-clay-hairline text-clay-muted hover:text-clay-ink hover:bg-clay-surface-soft transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-clay-ink flex items-center gap-1.5">
              <span>Dr. Performance Insights</span>
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-clay-ochre/25 text-clay-ink text-[10px] font-bold border border-clay-ochre/40">
                <Sparkles className="w-2.5 h-2.5 text-clay-ochre" /> Advanced Analytics
              </span>
            </h1>
          </div>
        </div>

        {/* Sync Status Badge */}
        <div className="flex items-center gap-4">
          <ThemeToggle />
          {!isSignedIn ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-clay-md bg-clay-canvas border border-clay-hairline text-[10px] font-bold text-clay-muted select-none">
              <span className="w-1.5 h-1.5 rounded-full bg-clay-ochre" />
              <span>Offline (Saved locally)</span>
            </div>
          ) : (
            <button
              onClick={onSyncForce}
              disabled={syncStatus === 'syncing'}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-clay-md bg-clay-canvas border border-clay-hairline text-[10px] font-bold transition-all ${
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
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-8 flex flex-col gap-8 text-left z-10 relative">
        
        {/* Row 1: High Level KPI Cards (Clay Bento Style) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          
          {/* Solved Count Card - Lavender */}
          <div className="bg-clay-lavender text-clay-ink rounded-clay-xl border border-clay-hairline p-5 flex flex-col justify-between min-h-[120px] transition-transform duration-300 hover:scale-[1.01]">
            <div>
              <span className="text-[10px] font-bold text-clay-muted uppercase tracking-wider block mb-1">Total Solved</span>
              <h2 className="font-rubik text-3xl font-medium tracking-[-0.04em]">
                {stats.solvedCount} <span className="text-xs font-sans text-clay-muted font-normal">Questions</span>
              </h2>
            </div>
            <div className="text-[10px] text-clay-muted border-t border-clay-ink/10 pt-2 flex justify-between">
              <span>Correct: {stats.correctCount}</span>
              <span>Incorrect: {stats.incorrectCount}</span>
            </div>
          </div>

          {/* Memory Retention Index Card - Peach */}
          <div className="bg-clay-peach text-clay-ink rounded-clay-xl border border-clay-hairline p-5 flex flex-col justify-between min-h-[120px] transition-transform duration-300 hover:scale-[1.01]">
            <div>
              <span className="text-[10px] font-bold text-clay-muted uppercase tracking-wider block mb-1">Memory Retention Index</span>
              <h2 className="font-rubik text-3xl font-medium tracking-[-0.04em]">
                {stats.averageRetentionRate}%
              </h2>
            </div>
            <div className="text-[10px] text-clay-muted border-t border-clay-ink/10 pt-2 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-clay-coral" />
                <span>Accuracy: {overallAccuracy}%</span>
              </span>
              <span>Active recall rate</span>
            </div>
          </div>

          {/* Daily Streak Card - Pink (White Text) */}
          <div className="bg-clay-pink text-white rounded-clay-xl border border-transparent p-5 flex flex-col justify-between min-h-[120px] transition-transform duration-300 hover:scale-[1.01]">
            <div>
              <span className="text-[10px] font-bold text-white/80 uppercase tracking-wider block mb-1">Preparation Habit</span>
              <h2 className="font-rubik text-3xl font-medium tracking-[-0.04em] flex items-center gap-2">
                <Zap className="w-6 h-6 fill-current text-clay-ochre animate-pulse" />
                <span>{streakText}</span>
              </h2>
            </div>
            <div className="text-[10px] text-white/70 border-t border-white/20 pt-2">
              Keep solving 5+ daily to retain information
            </div>
          </div>

          {/* Estimated Knowledge Card - Mint */}
          <div className="bg-clay-mint text-clay-ink rounded-clay-xl border border-clay-hairline p-5 flex flex-col justify-between min-h-[120px] transition-transform duration-300 hover:scale-[1.01]">
            <div>
              <span className="text-[10px] font-bold text-clay-muted uppercase tracking-wider block mb-1">Estimated Knowledge</span>
              <h2 className="font-rubik text-3xl font-medium tracking-[-0.04em]">
                {stats.estimatedKnowledgeCount} <span className="text-xs font-sans text-clay-muted font-normal">Concepts</span>
              </h2>
            </div>
            <div className="text-[10px] text-clay-muted border-t border-clay-ink/10 pt-2 flex justify-between">
              <span>Due for Revision: {stats.dueCount}</span>
              <span>Saved Bookmarks: {stats.bookmarkedCount}</span>
            </div>
          </div>
        </div>

        {/* Row 2: Interactive 14-Day History Volume & Accuracy (Wide Block) */}
        <div className="bg-clay-canvas border border-clay-hairline rounded-clay-xl p-6 md:p-8 flex flex-col gap-6 shadow-sm text-left">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h3 className="font-rubik text-lg md:text-xl font-medium tracking-[-0.03em] text-clay-ink flex items-center gap-2">
                <Calendar className="w-5 h-5 text-clay-pink" />
                <span>14-Day Practice Volume & Accuracy Trend</span>
              </h3>
              <p className="text-clay-muted text-xs mt-0.5">
                Observe the quantity of questions solved (bars) overlaid with your running accuracy (line).
              </p>
            </div>

            {/* Custom chart legend */}
            <div className="flex items-center gap-4 text-[10px] font-bold text-clay-muted">
              <div className="flex items-center gap-1">
                <span className="w-3 h-3 bg-clay-teal rounded-sm" />
                <span>Correct Solves</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-3 h-3 bg-clay-pink/30 rounded-sm border border-clay-pink/50" />
                <span>Incorrect Solves</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-6 h-0.5 bg-clay-pink block relative after:content-[''] after:w-1.5 after:h-1.5 after:bg-clay-pink after:absolute after:left-1/2 after:-top-0.5 after:-translate-x-1/2 after:rounded-full" />
                <span>Accuracy % (Right Axis)</span>
              </div>
            </div>
          </div>

          {/* SVG Chart Floor */}
          <div className="w-full overflow-x-auto scrollbar-none py-2 relative">
            <svg 
              viewBox={`0 0 ${historyChartDimensions.width} ${historyChartDimensions.height}`}
              className="w-full min-w-[620px] overflow-visible"
              height={historyChartDimensions.height}
            >
              {/* Horizontal Gridlines */}
              {Array.from({ length: 5 }).map((_, idx) => {
                const { top, right, bottom, left } = historyChartPadding;
                const chartHeight = historyChartDimensions.height - top - bottom;
                const y = top + (idx * chartHeight) / 4;
                const value = Math.round(historyMaxSolved - (idx * historyMaxSolved) / 4);
                const pct = Math.round(100 - (idx * 100) / 4);

                return (
                  <g key={idx}>
                    <line 
                      x1={left} 
                      y1={y} 
                      x2={historyChartDimensions.width - right} 
                      y2={y} 
                      stroke="var(--clay-hairline)" 
                      strokeDasharray="4 4"
                    />
                    {/* Left Axis: Volume */}
                    <text 
                      x={left - 8} 
                      y={y + 4} 
                      className="text-[9px] fill-clay-muted text-right font-bold" 
                      textAnchor="end"
                    >
                      {value}
                    </text>
                    {/* Right Axis: Accuracy % */}
                    <text 
                      x={historyChartDimensions.width - right + 8} 
                      y={y + 4} 
                      className="text-[9px] fill-clay-pink font-bold" 
                      textAnchor="start"
                    >
                      {pct}%
                    </text>
                  </g>
                );
              })}

              {/* Data rendering */}
              {historyChartPoints.map((pt, idx) => {
                const { top, bottom } = historyChartPadding;
                const chartHeight = historyChartDimensions.height - top - bottom;
                const barYBase = top + chartHeight;

                const isHovered = hoveredHistoryIdx === idx;

                return (
                  <g key={idx} 
                     onMouseEnter={() => setHoveredHistoryIdx(idx)}
                     onMouseLeave={() => setHoveredHistoryIdx(null)}
                     className="cursor-pointer"
                  >
                    {/* Background hover guide line */}
                    {isHovered && (
                      <line 
                        x1={pt.x} 
                        y1={top} 
                        x2={pt.x} 
                        y2={barYBase} 
                        stroke="var(--clay-pink)" 
                        strokeWidth="1" 
                        strokeDasharray="2 2"
                      />
                    )}

                    {/* Stacked Bar: Correct solves (Teal) */}
                    {pt.correct > 0 && (
                      <rect 
                        x={pt.x - pt.barWidth / 2}
                        y={pt.yCorrect}
                        width={pt.barWidth}
                        height={barYBase - pt.yCorrect}
                        fill="var(--clay-teal)"
                        rx={2}
                      />
                    )}

                    {/* Stacked Bar: Incorrect solves (Pink outline/fill) */}
                    {pt.incorrect > 0 && (
                      <rect 
                        x={pt.x - pt.barWidth / 2}
                        y={pt.ySolved}
                        width={pt.barWidth}
                        height={pt.yCorrect - pt.ySolved}
                        fill="var(--clay-pink)"
                        fillOpacity={0.25}
                        stroke="var(--clay-pink)"
                        strokeWidth={1}
                        rx={2}
                      />
                    )}

                    {/* X-Axis labels */}
                    <text 
                      x={pt.x} 
                      y={historyChartDimensions.height - 18} 
                      className="text-[9px] fill-clay-muted font-bold"
                      textAnchor="middle"
                    >
                      {pt.dateStr}
                    </text>
                  </g>
                );
              })}

              {/* Line graph for Accuracy trend */}
              <path 
                d={historyAccuracyPath}
                fill="none"
                stroke="var(--clay-pink)"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Data dots on accuracy line */}
              {historyChartPoints.map((pt, idx) => (
                <circle 
                  key={idx}
                  cx={pt.x}
                  cy={pt.yAccuracy}
                  r={hoveredHistoryIdx === idx ? 6 : 4}
                  fill="var(--clay-canvas)"
                  stroke="var(--clay-pink)"
                  strokeWidth={hoveredHistoryIdx === idx ? 3 : 2}
                  onMouseEnter={() => setHoveredHistoryIdx(idx)}
                  onMouseLeave={() => setHoveredHistoryIdx(null)}
                  className="cursor-pointer transition-all duration-150"
                />
              ))}
            </svg>

            {/* Hover Tooltip Overlay */}
            {hoveredHistoryIdx !== null && (
              <div 
                className="absolute z-20 bg-clay-canvas border border-clay-hairline rounded-clay-lg p-3 shadow-md text-xs w-48 text-left transition-all duration-200"
                style={{
                  left: `${Math.min(
                    historyChartDimensions.width - 210, 
                    Math.max(20, historyChartPoints[hoveredHistoryIdx].x - 96)
                  )}px`,
                  top: '10px'
                }}
              >
                <div className="font-bold border-b border-clay-hairline pb-1 mb-1.5 text-clay-ink flex justify-between items-center">
                  <span>{historyChartPoints[hoveredHistoryIdx].dateStr}</span>
                  <span className="text-[10px] text-clay-muted font-normal">Practice Session</span>
                </div>
                <div className="space-y-1 text-clay-body">
                  <div className="flex justify-between">
                    <span>Solved:</span>
                    <span className="font-bold text-clay-ink">{historyChartPoints[hoveredHistoryIdx].solved} Qs</span>
                  </div>
                  <div className="flex justify-between text-clay-teal">
                    <span>Correct:</span>
                    <span className="font-bold">{historyChartPoints[hoveredHistoryIdx].correct}</span>
                  </div>
                  <div className="flex justify-between text-clay-coral">
                    <span>Incorrect:</span>
                    <span className="font-bold">{historyChartPoints[hoveredHistoryIdx].incorrect}</span>
                  </div>
                  <div className="flex justify-between border-t border-clay-hairline pt-1 mt-1 font-bold text-clay-pink">
                    <span>Accuracy:</span>
                    <span>{historyChartPoints[hoveredHistoryIdx].accuracy}%</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Streak & Consistency Heatmap Card */}
        <div className="bg-clay-canvas border border-clay-hairline rounded-clay-xl p-6 md:p-8 flex flex-col gap-6 shadow-sm text-left">
          <div>
            <h3 className="font-rubik text-lg md:text-xl font-medium tracking-[-0.03em] text-clay-ink flex items-center gap-2">
              <Calendar className="w-5 h-5 text-clay-teal" />
              <span>Preparation Consistency Heatmap</span>
            </h3>
            <p className="text-clay-muted text-xs mt-0.5">
              Your daily active recalls over the past 16 weeks (112 days). Consistency is key to long-term memory stability.
            </p>
          </div>

          <div className="w-full overflow-x-auto scrollbar-none py-2">
            <div className="flex flex-col gap-3 min-w-[500px]">
              {/* Heatmap Grid SVG */}
              <svg 
                viewBox="0 0 270 115"
                className="w-[270px] overflow-visible select-none"
                height={115}
              >
                {/* Y-axis labels: Weekday names */}
                <text x="0" y="22" className="text-[8px] fill-clay-muted font-bold" textAnchor="start">Mon</text>
                <text x="0" y="52" className="text-[8px] fill-clay-muted font-bold" textAnchor="start">Wed</text>
                <text x="0" y="82" className="text-[8px] fill-clay-muted font-bold" textAnchor="start">Fri</text>

                {/* Monthly label approximations */}
                <text x="25" y="8" className="text-[8px] fill-clay-muted font-bold" textAnchor="start">16w ago</text>
                <text x="90" y="8" className="text-[8px] fill-clay-muted font-bold" textAnchor="start">10w ago</text>
                <text x="160" y="8" className="text-[8px] fill-clay-muted font-bold" textAnchor="start">5w ago</text>
                <text x="225" y="8" className="text-[8px] fill-clay-muted font-bold" textAnchor="start">Today</text>

                <g transform="translate(25, 12)">
                  {stats.heatmapDays.map((day, idx) => {
                    const row = (idx + stats.dayOfWeekOfStart) % 7;
                    const col = Math.floor((idx + stats.dayOfWeekOfStart) / 7);
                    const x = col * 14;
                    const y = row * 14;

                    let fill = 'var(--clay-surface-card)';
                    let border = 'var(--clay-hairline)';
                    if (day.level === 1) {
                      fill = 'var(--clay-mint)';
                      border = 'transparent';
                    } else if (day.level === 2) {
                      fill = 'var(--clay-ochre)';
                      border = 'transparent';
                    } else if (day.level === 3) {
                      fill = 'var(--clay-pink)';
                      border = 'transparent';
                    }

                    return (
                      <rect
                        key={idx}
                        x={x}
                        y={y}
                        width={11}
                        height={11}
                        fill={fill}
                        stroke={border}
                        strokeWidth={day.level === 0 ? 1 : 0}
                        rx={2}
                        className="transition-all duration-200 hover:scale-[1.12] origin-center cursor-help"
                      >
                        <title>{day.tooltip}</title>
                      </rect>
                    );
                  })}
                </g>
              </svg>

              {/* Heatmap Legend */}
              <div className="flex items-center gap-2 text-[10px] font-bold text-clay-muted mt-2 pl-6">
                <span>Less</span>
                <span className="w-3.5 h-3.5 rounded-sm bg-clay-surface-card border border-clay-hairline" title="0 solved" />
                <span className="w-3.5 h-3.5 rounded-sm bg-clay-mint" title="1-4 solved" />
                <span className="w-3.5 h-3.5 rounded-sm bg-clay-ochre" title="5-9 solved" />
                <span className="w-3.5 h-3.5 rounded-sm bg-clay-pink" title="10+ solved" />
                <span>More</span>
                <span className="text-[9px] font-normal ml-auto italic">Hover over squares to see solved counts.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Row 3: Split Section: FSRS Memory Insights (Left) & MBBS Phases Progress (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* FSRS Memory Insights Panel */}
          <div className="bg-clay-canvas border border-clay-hairline rounded-clay-xl p-6 flex flex-col gap-6 shadow-sm">
            <div>
              <h3 className="font-rubik text-lg font-medium tracking-[-0.03em] text-clay-ink flex items-center gap-2">
                <BrainCircuit className="w-5 h-5 text-clay-lavender fill-current text-opacity-40" />
                <span>Revision Scheduler Analytics</span>
              </h3>
              <p className="text-clay-muted text-xs mt-0.5">
                Understand how the algorithm schedules questions based on your estimated memory retention.
              </p>
            </div>

            {/* FSRS Card State Distribution (Segmented Progress Bar) */}
            <div className="space-y-2.5">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-clay-ink">Memory Queue Composition</span>
                <span className="text-[11px] text-clay-muted">Total: {fsrsStatesTotal} Cards</span>
              </div>
              
              {/* Stacked horizontal bar */}
              <div className="w-full h-4 rounded-full overflow-hidden flex bg-clay-surface-soft border border-clay-hairline">
                {cardStates.map((state, idx) => (
                  <div 
                    key={idx}
                    className={`${state.color.split(' ')[0]} h-full transition-all`}
                    style={{ width: `${state.pct}%` }}
                    title={`${state.name}: ${state.count} cards (${Math.round(state.pct)}%)`}
                  />
                ))}
              </div>

              {/* Legends of states */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                {cardStates.map((state, idx) => (
                  <div key={idx} className="flex flex-col p-1.5 rounded-clay-md bg-clay-surface-soft/60 border border-clay-hairline text-left">
                    <span className="text-[9px] font-bold text-clay-muted leading-tight truncate">{state.name.split(' ')[0]}</span>
                    <span className="text-xs font-bold text-clay-ink mt-0.5">{state.count} <span className="text-[9px] font-normal text-clay-muted">({Math.round(state.pct)}%)</span></span>
                  </div>
                ))}
              </div>
            </div>

            {/* Two Side-By-Side SVG Charts: Difficulty Spectrum & Memory Stability */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-clay-hairline pt-5">
              
              {/* Difficulty Spectrum */}
              <div className="flex flex-col gap-2 text-left">
                <span className="text-[10px] font-bold text-clay-muted uppercase tracking-wider">Difficulty distribution (1-10)</span>
                <div className="bg-clay-surface-soft/50 border border-clay-hairline rounded-clay-lg p-2 flex items-center justify-center">
                  <svg 
                    viewBox={`0 0 ${diffChartDimensions.width} ${diffChartDimensions.height}`}
                    className="w-full overflow-visible"
                    height={diffChartDimensions.height}
                  >
                    {/* Gridlines */}
                    {Array.from({ length: 4 }).map((_, idx) => {
                      const { top, right, bottom, left } = diffChartPadding;
                      const chartHeight = diffChartDimensions.height - top - bottom;
                      const y = top + (idx * chartHeight) / 3;
                      return (
                        <line 
                          key={idx}
                          x1={left}
                          y1={y}
                          x2={diffChartDimensions.width - right}
                          y2={y}
                          stroke="var(--clay-hairline)"
                          strokeDasharray="2 2"
                        />
                      );
                    })}

                    {/* Bars */}
                    {diffChartPoints.map((pt, idx) => {
                      return (
                        <g key={idx} className="group/diff">
                          <rect 
                            x={pt.x - pt.barWidth / 2}
                            y={pt.y}
                            width={pt.barWidth}
                            height={pt.barHeight}
                            fill="var(--clay-peach)"
                            className="hover:fill-clay-pink transition-colors duration-150"
                            rx={1.5}
                          />
                          {/* X labels */}
                          <text 
                            x={pt.x}
                            y={diffChartDimensions.height - 18}
                            className="text-[8px] fill-clay-muted font-bold"
                            textAnchor="middle"
                          >
                            D{pt.difficulty}
                          </text>
                          {/* Value tooltip on hover */}
                          <title>Difficulty {pt.difficulty}: {pt.count} cards</title>
                        </g>
                      );
                    })}
                  </svg>
                </div>
                <span className="text-[9px] text-clay-muted">Peaks represent content difficulty density.</span>
              </div>

              {/* Memory Stability Spectrum */}
              <div className="flex flex-col gap-2 text-left">
                <span className="text-[10px] font-bold text-clay-muted uppercase tracking-wider">Estimated Retention stability</span>
                
                <div className="space-y-1.5 flex-1 flex flex-col justify-center">
                  {stats.stabilityDistribution.map((range, idx) => {
                    const totalStab = stats.stabilityDistribution.reduce((a, b) => a + b.count, 0);
                    const pct = totalStab > 0 ? (range.count / totalStab) * 100 : 0;
                    
                    return (
                      <div key={idx} className="flex items-center gap-2 text-xs">
                        <span className="w-16 text-[10px] font-semibold text-clay-muted text-right truncate" title={range.label}>
                          {range.range}
                        </span>
                        
                        <div className="flex-1 bg-clay-surface-soft h-3 rounded-full overflow-hidden border border-clay-hairline/60">
                          <div 
                            className="h-full rounded-full transition-all duration-500"
                            style={{ 
                              width: `${pct}%`,
                              backgroundColor: range.color
                            }}
                          />
                        </div>
                        
                        <span className="w-8 text-[10px] font-bold text-clay-ink text-left">
                          {range.count}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <span className="text-[9px] text-clay-muted">Stability is the expected memory lifetime in days.</span>
              </div>
            </div>

            {/* Upcoming Spaced Repetition Due Load (7-Day Forecast) */}
            <div className="border-t border-clay-hairline pt-5 flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-clay-muted uppercase tracking-wider">7-Day Review Forecast</span>
                <span className="text-[10px] font-bold text-clay-pink">Next 7 days due load</span>
              </div>

              <div className="bg-clay-surface-soft/50 border border-clay-hairline rounded-clay-lg p-2.5">
                <svg 
                  viewBox={`0 0 ${forecastChartDimensions.width} ${forecastChartDimensions.height}`}
                  className="w-full overflow-visible"
                  height={forecastChartDimensions.height}
                >
                  {/* Gridlines */}
                  {Array.from({ length: 4 }).map((_, idx) => {
                    const { top, right, bottom, left } = forecastChartPadding;
                    const chartHeight = forecastChartDimensions.height - top - bottom;
                    const y = top + (idx * chartHeight) / 3;
                    return (
                      <line 
                        key={idx}
                        x1={left}
                        y1={y}
                        x2={forecastChartDimensions.width - right}
                        y2={y}
                        stroke="var(--clay-hairline)"
                        strokeDasharray="2 2"
                      />
                    );
                  })}

                  {/* Bars */}
                  {forecastChartPoints.map((pt, idx) => {
                    const isSelected = selectedForecastDay === pt.dateKey;
                    return (
                      <g key={idx}>
                        <rect 
                          x={pt.x - pt.barWidth / 2}
                          y={pt.y}
                          width={pt.barWidth}
                          height={pt.barHeight}
                          fill={isSelected ? "var(--clay-pink)" : "var(--clay-teal)"}
                          rx={1.5}
                          onClick={() => {
                            setSelectedForecastDay(prev => prev === pt.dateKey ? null : (pt.dateKey || null));
                          }}
                          className="hover:fill-clay-pink transition-colors duration-150 cursor-pointer"
                        />
                        {/* Values atop bars */}
                        {pt.dueCount > 0 && (
                          <text 
                            x={pt.x}
                            y={pt.y - 4}
                            className={`text-[8px] font-bold text-center ${isSelected ? 'fill-clay-pink' : 'fill-clay-ink'}`}
                            textAnchor="middle"
                          >
                            {pt.dueCount}
                          </text>
                        )}
                        {/* X labels */}
                        <text 
                          x={pt.x}
                          y={forecastChartDimensions.height - 18}
                          className={`text-[8px] font-bold ${isSelected ? 'fill-clay-pink font-extrabold' : 'fill-clay-muted'}`}
                          textAnchor="middle"
                        >
                          {pt.dateStr}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* Interactive Forecast Day Detail List */}
              {selectedForecastDay && (
                <div className="bg-clay-canvas border border-clay-hairline rounded-clay-lg p-4 text-xs text-left animate-[fadeIn_0.2s_ease-out] mt-3">
                  <div className="flex justify-between items-center border-b border-clay-hairline pb-2 mb-2">
                    <span className="font-bold text-clay-ink">
                      Due on {new Date(selectedForecastDay).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}:
                    </span>
                    <button 
                      onClick={() => setSelectedForecastDay(null)}
                      className="text-[10px] text-clay-muted hover:text-clay-ink hover:underline font-bold cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                  
                  {stats.dueDetailsMap[selectedForecastDay] && stats.dueDetailsMap[selectedForecastDay].length > 0 ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        {stats.dueDetailsMap[selectedForecastDay].map((item, idx) => (
                          <div key={idx} className="bg-clay-surface-soft border border-clay-hairline rounded-clay-md px-2.5 py-1.5 flex items-center gap-1.5">
                            <span className="font-bold text-clay-ink">{item.subjectName}</span>
                            <span className="text-[10px] bg-clay-pink/15 text-clay-pink px-1.5 py-0.5 rounded font-extrabold">{item.count} due</span>
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-end pt-1">
                        <button
                          onClick={() => {
                            const subIds = stats.dueDetailsMap[selectedForecastDay!].map(item => item.subjectId);
                            onStartCustomModule({
                              subjectIds: subIds,
                              status: 'SPACED_REPETITION',
                              timerMode: 'STOPWATCH',
                              timerValue: 0,
                              limit: 20
                            });
                          }}
                          className="bg-clay-ink hover:bg-neutral-800 text-white font-bold px-3 py-1.5 rounded-clay-md text-[10px] shadow-sm transition-all duration-200 cursor-pointer flex items-center gap-1"
                        >
                          <Zap className="w-3 h-3 fill-current text-clay-ochre" />
                          <span>Revise Day's Due Qs</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-clay-muted text-[10px]">No spaced repetition reviews scheduled for this calendar date.</p>
                  )}
                </div>
              )}
            </div>

          </div>

          {/* MBBS Professional Phases Breakdown */}
          <div className="bg-clay-canvas border border-clay-hairline rounded-clay-xl p-6 flex flex-col justify-between shadow-sm">
            <div>
              <h3 className="font-rubik text-lg font-medium tracking-[-0.03em] text-clay-ink flex items-center gap-2">
                <Trophy className="w-5 h-5 text-clay-ochre fill-current" />
                <span>Syllabus Phases Performance Breakdown</span>
              </h3>
              <p className="text-clay-muted text-xs mt-0.5">
                Understand your accuracy vs completion across the professional years of your medical curriculum.
              </p>
            </div>

            <div className="space-y-6 my-6 flex-1 flex flex-col justify-center">
              {phaseStats.map(phase => {
                return (
                  <div key={phase.name} className="flex flex-col gap-2 p-4 bg-clay-surface-soft/60 border border-clay-hairline rounded-clay-lg">
                    
                    {/* Phase Header */}
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span 
                          className="w-2.5 h-2.5 rounded-full" 
                          style={{ backgroundColor: phase.color }}
                        />
                        <span className="font-bold text-xs text-clay-ink">{phase.name}</span>
                      </div>
                      <span className="text-[10px] font-bold text-clay-muted">
                        {phase.solved} Solved / {phase.totalInPhase} Available
                      </span>
                    </div>

                    {/* Progress indicators: Completion & Accuracy */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-1.5">
                      
                      {/* Completion Rate */}
                      <div className="flex flex-col text-left">
                        <div className="flex justify-between text-[10px] text-clay-muted mb-1">
                          <span>Syllabus Completion</span>
                          <span className="font-bold text-clay-ink">{phase.completionPct}%</span>
                        </div>
                        <div className="w-full bg-clay-canvas h-2 rounded-full overflow-hidden border border-clay-hairline">
                          <div 
                            className="h-full rounded-full transition-all duration-500"
                            style={{ 
                              width: `${phase.completionPct}%`,
                              backgroundColor: phase.color
                            }}
                          />
                        </div>
                      </div>

                      {/* Accuracy Quotient */}
                      <div className="flex flex-col text-left">
                        <div className="flex justify-between text-[10px] text-clay-muted mb-1">
                          <span>Accuracy Quotient</span>
                          <span className="font-bold text-clay-pink">{phase.accuracyPct}%</span>
                        </div>
                        <div className="w-full bg-clay-canvas h-2 rounded-full overflow-hidden border border-clay-hairline">
                          <div 
                            className="h-full rounded-full transition-all duration-500 bg-clay-pink"
                            style={{ width: `${phase.accuracyPct}%` }}
                          />
                        </div>
                      </div>

                    </div>
                  </div>
                );
              })}
            </div>

            {/* Quick Summary Recommendation Box */}
            <div className="bg-clay-surface-soft border border-clay-hairline rounded-clay-lg p-4 text-xs text-clay-body text-left">
              <span className="font-bold text-clay-ink flex items-center gap-1 mb-1">
                <Zap className="w-4 h-4 text-clay-ochre fill-current" />
                <span>AI Study Recommendation</span>
              </span>
              <span>
                {overallAccuracy > 80 
                  ? 'Excellent progress! Your habit is consistent. Focus on resolving remaining Bookmarks to locked-in concepts.' 
                  : 'Analyze subject-wise scores below. Sort by "Accuracy" to find your weakest subjects and start quick custom review tests.'
                }
              </span>
            </div>

          </div>
        </div>

        {/* Leeches & Difficult Concepts Warning Section */}
        {stats.leeches && stats.leeches.length > 0 && (
          <div className="bg-clay-canvas border border-clay-pink rounded-clay-xl p-6 md:p-8 flex flex-col gap-6 shadow-sm">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="font-rubik text-lg md:text-xl font-medium tracking-[-0.03em] text-clay-ink flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-clay-pink" />
                  <span>Leeches & Difficult Concepts Warning</span>
                </h3>
                <p className="text-clay-muted text-xs mt-0.5">
                  These are questions you have failed repeatedly (lapses &ge; 3) or have high difficulty. Revise them to prevent memory decay.
                </p>
              </div>

              <button
                onClick={() => {
                  onStartCustomModule({
                    subjectIds: Array.from(new Set(stats.leeches.map(l => l.subjectId))),
                    status: 'LEECHES',
                    timerMode: 'STOPWATCH',
                    timerValue: 0,
                    limit: Math.min(20, stats.leeches.length)
                  });
                }}
                className="px-4 py-2 bg-clay-pink hover:bg-rose-600 text-white text-xs font-bold rounded-clay-md transition-all duration-200 cursor-pointer shadow-sm flex items-center gap-1.5"
              >
                <Zap className="w-3.5 h-3.5 fill-current text-clay-ochre" />
                <span>Practice {Math.min(20, stats.leeches.length)} Leeches</span>
              </button>
            </div>

            {/* List of leeches */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {stats.leeches.slice(0, 4).map((leech) => (
                <div 
                  key={leech.questionId}
                  className="bg-clay-surface-soft/60 border border-clay-hairline rounded-clay-lg p-4 flex flex-col justify-between hover:border-clay-pink/50 transition-all duration-200"
                >
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-clay-muted bg-clay-canvas border border-clay-hairline px-2 py-0.5 rounded">
                        {leech.subjectName}
                      </span>
                      <div className="flex items-center gap-2 text-[10px] font-bold text-rose-600">
                        <span>Lapses: {leech.lapses}</span>
                        <span className="text-clay-muted">•</span>
                        <span>Diff: {leech.difficulty.toFixed(1)}</span>
                      </div>
                    </div>
                    
                    <p className="text-xs text-clay-body line-clamp-2 italic mb-3">
                      "{leech.questionText}"
                    </p>
                  </div>

                  <div className="border-t border-clay-hairline pt-2.5 flex justify-end">
                    <button
                      onClick={() => {
                        onStartCustomModule({
                          subjectIds: [leech.subjectId],
                          topicIds: undefined,
                          status: 'LEECHES',
                          timerMode: 'STOPWATCH',
                          timerValue: 0,
                          limit: 5
                        });
                      }}
                      className="text-[10px] font-bold text-clay-pink hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <span>Practice Subject Leeches &rarr;</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Row 4: Subject Performance Matrix */}
        <div className="bg-clay-canvas border border-clay-hairline rounded-clay-xl p-6 md:p-8 flex flex-col gap-6 shadow-sm">
          
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h3 className="font-rubik text-lg md:text-xl font-medium tracking-[-0.03em] text-clay-ink flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-clay-teal" />
                <span>MBBS Subjects Performance Matrix</span>
              </h3>
              <p className="text-clay-muted text-xs mt-0.5">
                Sort, search, and target specific subjects for active recall practice sessions.
              </p>
            </div>

            {/* Sort Controls */}
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="text-clay-muted">Sort By:</span>
              <button 
                onClick={() => toggleSort('name')}
                className={`px-3 py-1.5 rounded-clay-md border font-bold cursor-pointer transition-all ${
                  subjectSortBy === 'name' 
                    ? 'bg-clay-surface-card text-clay-ink border-clay-muted' 
                    : 'bg-clay-canvas text-clay-muted border-clay-hairline hover:bg-clay-surface-soft'
                }`}
              >
                Subject Name {subjectSortBy === 'name' ? (subjectSortOrder === 'asc' ? '↑' : '↓') : ''}
              </button>
              <button 
                onClick={() => toggleSort('solved')}
                className={`px-3 py-1.5 rounded-clay-md border font-bold cursor-pointer transition-all ${
                  subjectSortBy === 'solved' 
                    ? 'bg-clay-surface-card text-clay-ink border-clay-muted' 
                    : 'bg-clay-canvas text-clay-muted border-clay-hairline hover:bg-clay-surface-soft'
                }`}
              >
                Volume Solved {subjectSortBy === 'solved' ? (subjectSortOrder === 'asc' ? '↑' : '↓') : ''}
              </button>
              <button 
                onClick={() => toggleSort('accuracy')}
                className={`px-3 py-1.5 rounded-clay-md border font-bold cursor-pointer transition-all ${
                  subjectSortBy === 'accuracy' 
                    ? 'bg-clay-surface-card text-clay-ink border-clay-muted' 
                    : 'bg-clay-canvas text-clay-muted border-clay-hairline hover:bg-clay-surface-soft'
                }`}
              >
                Accuracy Quotient {subjectSortBy === 'accuracy' ? (subjectSortOrder === 'asc' ? '↑' : '↓') : ''}
              </button>
            </div>
          </div>

          {/* Subjects Table / Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedSubjects.map(subject => {
              const wrongCount = subject.solved - subject.correct;
              const hasSolved = subject.solved > 0;

              return (
                <div 
                  key={subject.id}
                  className="bg-clay-canvas border border-clay-hairline rounded-clay-lg p-4 flex flex-col justify-between hover:border-clay-muted transition-all duration-200"
                >
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <div>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-clay-muted block">
                        {subject.phaseName}
                      </span>
                      <h4 className="font-bold text-sm text-clay-ink leading-tight">
                        {subject.name}
                      </h4>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-bold text-clay-muted bg-clay-surface-soft border border-clay-hairline px-2 py-0.5 rounded">
                        {subject.count} Qs
                      </span>
                    </div>
                  </div>

                  {/* Sparkline & Details */}
                  <div className="flex gap-4 items-center my-3">
                    {/* Miniature SVG Donut/Pie Sparkline */}
                    <svg viewBox="0 0 36 36" className="w-10 h-10 shrink-0">
                      {/* Background grey circle */}
                      <circle cx="18" cy="18" r="15.915" fill="none" stroke="var(--clay-hairline)" strokeWidth="4" />
                      
                      {/* Solved correct segment - teal */}
                      {hasSolved && (
                        <circle 
                          cx="18" cy="18" r="15.915" fill="none" 
                          stroke="var(--clay-teal)" 
                          strokeWidth="4" 
                          strokeDasharray={`${(subject.correct / subject.count) * 100} ${100 - (subject.correct / subject.count) * 100}`}
                          strokeDashoffset="25"
                        />
                      )}
                      
                      {/* Solved incorrect segment - pink */}
                      {hasSolved && wrongCount > 0 && (
                        <circle 
                          cx="18" cy="18" r="15.915" fill="none" 
                          stroke="var(--clay-pink)" 
                          strokeWidth="4" 
                          strokeDasharray={`${(wrongCount / subject.count) * 100} ${100 - (wrongCount / subject.count) * 100}`}
                          strokeDashoffset={`${25 - (subject.correct / subject.count) * 100}`}
                        />
                      )}
                    </svg>

                    <div className="flex-1 space-y-1 text-xs text-clay-body">
                      <div className="flex justify-between">
                        <span>Solved:</span>
                        <span className="font-bold text-clay-ink">
                          {subject.solved} <span className="text-[10px] font-normal text-clay-muted">({Math.round(subject.completionPct)}%)</span>
                        </span>
                      </div>
                      
                      <div className="flex justify-between">
                        <span>Accuracy:</span>
                        <span className={`font-bold ${hasSolved ? 'text-clay-pink' : 'text-clay-muted'}`}>
                          {hasSolved ? `${subject.accuracyPct}%` : 'Unsolved'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Quick strengthen options */}
                  <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-clay-hairline">
                    <button
                      onClick={() => onPracticeSubject(subject.id)}
                      className="bg-clay-surface-soft hover:bg-clay-surface-strong text-clay-ink text-[10px] font-bold py-1.5 rounded-clay-md cursor-pointer transition-colors text-center"
                    >
                      Practice Subject
                    </button>
                    
                    <button
                      onClick={() => {
                        onStartCustomModule({
                          subjectIds: [subject.id],
                          status: 'INCORRECT',
                          timerMode: 'STOPWATCH',
                          timerValue: 0,
                          limit: 10
                        });
                      }}
                      disabled={!hasSolved || wrongCount === 0}
                      className="bg-clay-canvas border border-clay-hairline hover:bg-clay-surface-soft disabled:opacity-45 disabled:hover:bg-clay-canvas text-clay-muted hover:text-clay-ink text-[10px] font-bold py-1.5 rounded-clay-md cursor-pointer transition-colors text-center"
                    >
                      Fix {wrongCount > 0 ? wrongCount : ''} Mistakes
                    </button>
                  </div>

                </div>
              );
            })}
          </div>

        </div>

      </main>
    </div>
  );
}
