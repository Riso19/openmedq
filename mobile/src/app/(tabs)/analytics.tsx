import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  ScrollView, 
  StyleSheet, 
  ActivityIndicator,
  Pressable
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BarChart3, AlertTriangle, Brain, Zap } from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';
import { Fonts } from '@/constants/theme';
import { getDB } from '@/lib/db';
import { subjectsList } from '@openmedq/shared';
import {
  QueueCompositionChart,
  DifficultySpectrumChart,
  MemoryStabilityChart,
  ReviewForecastChart,
  PracticeVolumeChart
} from '@/components/analytics-charts';
import { ConsistencyHeatmap } from '@/components/ConsistencyHeatmap';

interface SubjectMastery {
  id: number;
  name: string;
  attempted: number;
  correct: number;
  accuracy: number;
  totalQuestions: number;
}

interface LeechDetail {
  questionId: number;
  questionText: string;
  lapses: number;
  difficulty: number;
  subjectId: number;
}

const PHASES = [
  { name: 'Pre-Clinical', subjectIds: [1, 2, 3], color: '#ffb084' }, // peach
  { name: 'Para-Clinical', subjectIds: [4, 5, 6, 7, 8], color: '#b8a4ed' }, // lavender
  { name: 'Short Subjects', subjectIds: [9, 10, 14, 15, 16, 17, 18, 19], color: '#a4d4c5' }, // mint
  { name: 'Core Clinicals', subjectIds: [11, 12, 13], color: '#ff4d8b' } // pink
];

export default function AnalyticsScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [totalAttempted, setTotalAttempted] = useState(0);
  const [mistakeCount, setMistakeCount] = useState(0);
  const [retentionIndex, setRetentionIndex] = useState(90);
  const [estimatedKnowledge, setEstimatedKnowledge] = useState(0);
  const [subjectMasteries, setSubjectMasteries] = useState<SubjectMastery[]>([]);
  const [leeches, setLeeches] = useState<LeechDetail[]>([]);

  // FSRS and study history stats
  const [queueComp, setQueueComp] = useState({ new: 0, learn: 0, review: 0, relearn: 0 });
  const [difficultySpectrum, setDifficultySpectrum] = useState<number[]>(Array(10).fill(0));
  const [stabilityDist, setStabilityDist] = useState<number[]>(Array(5).fill(0));
  const [forecast, setForecast] = useState<{ data: number[]; labels: string[] }>({ data: Array(7).fill(0), labels: [] });
  const [practiceVolume, setPracticeVolume] = useState<{ correct: number[]; incorrect: number[]; labels: string[] }>({
    correct: Array(7).fill(0),
    incorrect: Array(7).fill(0),
    labels: []
  });
  const [consistencyData, setConsistencyData] = useState<Record<string, number>>({});

  // Interactive sorting states
  const [sortBy, setSortBy] = useState<'accuracy' | 'solved' | 'name'>('accuracy');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  useEffect(() => {
    async function loadStats() {
      try {
        setLoading(true);
        const sqlite = await getDB();

        // 1. Overall stats
        const attemptedRow = await sqlite.getFirstAsync<any>(
          "SELECT COUNT(questionId) as count FROM progress WHERE status IN ('CORRECT', 'INCORRECT') AND isDeleted = 0"
        );
        const mistakeRow = await sqlite.getFirstAsync<any>(
          "SELECT COUNT(questionId) as count FROM progress WHERE status = 'INCORRECT' AND isDeleted = 0"
        );

        const attempted = attemptedRow?.count || 0;
        
        setTotalAttempted(attempted);
        setMistakeCount(mistakeRow?.count || 0);

        // FSRS Memory Retention Index & Estimated Knowledge Score calculations
        const allProgress = await sqlite.getAllAsync<any>(
          "SELECT status, stability, lastReview, answeredAt FROM progress WHERE isDeleted = 0"
        );

        let totalRetrievability = 0;
        let reviewedCardsCount = 0;
        const nowMs = Date.now();

        // Compute FSRS v6 decay and factor from user's current weights
        const fsrsWeightsRaw = await AsyncStorage.getItem('openmedq_fsrs_weights');
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
            if (p.stability !== null && p.stability !== undefined && p.stability > 0) {
              const lastReviewTime = p.lastReview || p.answeredAt || nowMs;
              const elapsedDays = Math.max(0, (nowMs - lastReviewTime) / (24 * 60 * 60 * 1000));
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

        setRetentionIndex(averageRetentionRate);
        setEstimatedKnowledge(estimatedKnowledgeCount);

        // 2. Fetch subject-specific stats
        const seededRows = await sqlite.getAllAsync<{ subjectId: number; count: number }>(
          'SELECT subjectId, COUNT(id) as count FROM questions GROUP BY subjectId'
        );
        const seededMap = new Map<number, number>();
        seededRows.forEach(r => seededMap.set(r.subjectId, r.count));

        const progressRows = await sqlite.getAllAsync<{ subjectId: number; attempted: number; correct: number }>(
          `SELECT q.subjectId, 
                  COUNT(p.questionId) as attempted,
                  SUM(CASE WHEN p.status = 'CORRECT' THEN 1 ELSE 0 END) as correct
           FROM progress p
           JOIN questions q ON p.questionId = q.id
           WHERE p.isDeleted = 0 AND p.status IN ('CORRECT', 'INCORRECT')
           GROUP BY q.subjectId`
        );
        const progressMap = new Map<number, { attempted: number; correct: number }>();
        progressRows.forEach(r => progressMap.set(r.subjectId, { attempted: r.attempted, correct: r.correct }));

        const masteries: SubjectMastery[] = subjectsList.map(subj => {
          const prog = progressMap.get(subj.id) || { attempted: 0, correct: 0 };
          const accuracy = prog.attempted > 0 ? (prog.correct / prog.attempted) * 100 : 0;
          return {
            id: subj.id,
            name: subj.name,
            attempted: prog.attempted,
            correct: prog.correct,
            accuracy,
            totalQuestions: seededMap.get(subj.id) || 0
          };
        });

        setSubjectMasteries(masteries);

        // Fetch active leeches details (need review questions)
        const activeLeechesRows = await sqlite.getAllAsync<any>(`
          SELECT p.questionId, p.lapses, p.difficulty, q.questionText, q.subjectId
          FROM progress p
          JOIN questions q ON p.questionId = q.id
          WHERE p.isDeleted = 0 
            AND ((p.lapses >= 3 AND p.difficulty >= 7.0) OR (p.status = 'INCORRECT' AND p.difficulty >= 7.5))
          ORDER BY p.difficulty DESC, p.lapses DESC
          LIMIT 3
        `);
        const activeLeeches: LeechDetail[] = activeLeechesRows.map(r => ({
          questionId: r.questionId,
          questionText: r.questionText,
          lapses: r.lapses,
          difficulty: r.difficulty,
          subjectId: r.subjectId
        }));
        setLeeches(activeLeeches);

        // 3. FSRS Queue Composition
        let newCount = 0;
        let learnCount = 0;
        let reviewCount = 0;
        let relearnCount = 0;

        const totalQRow = await sqlite.getFirstAsync<any>('SELECT COUNT(id) as count FROM questions');
        const totalQ = totalQRow?.count || 0;

        const stateRows = await sqlite.getAllAsync<{ state: number; count: number }>(
          `SELECT state, COUNT(questionId) as count 
           FROM progress 
           WHERE isDeleted = 0 AND status IN ('CORRECT', 'INCORRECT') 
           GROUP BY state`
        );

        stateRows.forEach(r => {
          if (r.state === 1) learnCount = r.count;
          else if (r.state === 2) reviewCount = r.count;
          else if (r.state === 3) relearnCount = r.count;
          else if (r.state === 0) newCount += r.count;
        });

        const progressCountRow = await sqlite.getFirstAsync<any>(
          "SELECT COUNT(questionId) as count FROM progress WHERE isDeleted = 0 AND status IN ('CORRECT', 'INCORRECT')"
        );
        const progressCount = progressCountRow?.count || 0;
        newCount += Math.max(0, totalQ - progressCount);

        setQueueComp({ new: newCount, learn: learnCount, review: reviewCount, relearn: relearnCount });

        // 4. FSRS Difficulty Spectrum
        const diffRows = await sqlite.getAllAsync<{ difficulty: number }>(
          "SELECT difficulty FROM progress WHERE isDeleted = 0 AND status IN ('CORRECT', 'INCORRECT') AND difficulty IS NOT NULL"
        );
        const diffBins = Array(10).fill(0);
        diffRows.forEach(r => {
          const val = Math.min(10, Math.max(1, Math.round(r.difficulty)));
          diffBins[val - 1]++;
        });
        setDifficultySpectrum(diffBins);

        // 5. FSRS Memory Stability Distribution
        const stabRows = await sqlite.getAllAsync<{ stability: number }>(
          "SELECT stability FROM progress WHERE isDeleted = 0 AND status IN ('CORRECT', 'INCORRECT') AND stability IS NOT NULL"
        );
        const stabilityBins = Array(5).fill(0);
        stabRows.forEach(r => {
          const s = r.stability;
          if (s < 3) stabilityBins[0]++;
          else if (s <= 10) stabilityBins[1]++;
          else if (s <= 30) stabilityBins[2]++;
          else if (s <= 90) stabilityBins[3]++;
          else stabilityBins[4]++;
        });
        setStabilityDist(stabilityBins);

        // 6. FSRS 7-Day Review Forecast
        const forecastData = Array(7).fill(0);
        const forecastLabels: string[] = [];
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

        for (let i = 0; i < 7; i++) {
          const dayTime = startOfToday + i * 24 * 60 * 60 * 1000;
          const dayDate = new Date(dayTime);
          forecastLabels.push(i === 0 ? 'Today' : dayNames[dayDate.getDay()]);
        }

        const dueRows = await sqlite.getAllAsync<{ due: number }>(
          "SELECT due FROM progress WHERE isDeleted = 0 AND status IN ('CORRECT', 'INCORRECT') AND due IS NOT NULL"
        );
        dueRows.forEach(r => {
          const delta = r.due - startOfToday;
          if (delta <= 0) {
            forecastData[0]++;
          } else {
            const dayIdx = Math.floor(delta / (24 * 60 * 60 * 1000));
            if (dayIdx >= 0 && dayIdx < 7) {
              forecastData[dayIdx]++;
            }
          }
        });
        setForecast({ data: forecastData, labels: forecastLabels });

        // 7. Practice Volume & Accuracy (Last 7 Days)
        const volumeLabels: string[] = [];
        const correctVolume = Array(7).fill(0);
        const incorrectVolume = Array(7).fill(0);

        for (let i = 6; i >= 0; i--) {
          const dayTime = startOfToday - i * 24 * 60 * 60 * 1000;
          const dayDate = new Date(dayTime);
          volumeLabels.push(dayNames[dayDate.getDay()]);
        }

        const startOfPeriod = startOfToday - 6 * 24 * 60 * 60 * 1000;
        const logs = await sqlite.getAllAsync<{ reviewTime: number; rating: number }>(
          "SELECT reviewTime, rating FROM reviewLogs WHERE reviewTime >= ?",
          [startOfPeriod]
        );

        logs.forEach(log => {
          const delta = log.reviewTime - startOfPeriod;
          if (delta >= 0) {
            const dayIdx = Math.floor(delta / (24 * 60 * 60 * 1000));
            if (dayIdx >= 0 && dayIdx < 7) {
              if (log.rating > 1) {
                correctVolume[dayIdx]++;
              } else {
                incorrectVolume[dayIdx]++;
              }
            }
          }
        });
        setPracticeVolume({ correct: correctVolume, incorrect: incorrectVolume, labels: volumeLabels });

        // 8. Heatmap Solved Counts (Last 112 days)
        const heatmapData: Record<string, number> = {};
        const daysUntilSaturday = 6 - now.getDay();
        const endOfWeekTime = startOfToday + daysUntilSaturday * 24 * 60 * 60 * 1000;
        const startOfHeatmap = endOfWeekTime - 111 * 24 * 60 * 60 * 1000; // 112 days total

        const heatmapRows = await sqlite.getAllAsync<{ dateStr: string; count: number }>(
          `SELECT strftime('%Y-%m-%d', reviewTime / 1000, 'unixepoch', 'localtime') as dateStr,
                  COUNT(*) as count
           FROM reviewLogs
           WHERE reviewTime >= ?
           GROUP BY dateStr`,
          [startOfHeatmap]
        );

        heatmapRows.forEach(row => {
          if (row.dateStr) {
            heatmapData[row.dateStr] = row.count;
          }
        });
        setConsistencyData(heatmapData);

      } catch (err) {
        console.warn('Failed to calculate analytics stats:', err);
      } finally {
        setLoading(false);
      }
    }

    loadStats();
  }, []);

  // Compute Professional Phase Breakdowns Dynamically
  const phaseStats = PHASES.map(phase => {
    let totalInPhase = 0;
    let solvedInPhase = 0;
    let correctInPhase = 0;

    phase.subjectIds.forEach(subId => {
      const mastery = subjectMasteries.find(m => m.id === subId);
      if (mastery) {
        totalInPhase += mastery.totalQuestions;
        solvedInPhase += mastery.attempted;
        correctInPhase += mastery.correct;
      }
    });

    const completionPct = totalInPhase > 0 
      ? Math.min(100, (solvedInPhase / totalInPhase) * 100) 
      : 0;

    const accuracyPct = solvedInPhase > 0 
      ? Math.round((correctInPhase / solvedInPhase) * 100) 
      : 100;

    return {
      ...phase,
      total: totalInPhase,
      solved: solvedInPhase,
      completionPct,
      accuracyPct
    };
  });

  // Sort Subject Masteries
  const sortedMasteries = [...subjectMasteries].sort((a, b) => {
    let comparison = 0;
    if (sortBy === 'name') {
      comparison = a.name.localeCompare(b.name);
    } else if (sortBy === 'solved') {
      comparison = a.attempted - b.attempted;
    } else if (sortBy === 'accuracy') {
      comparison = a.accuracy - b.accuracy;
    }

    return sortOrder === 'desc' ? -comparison : comparison;
  });

  if (!loading && totalAttempted === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: theme.background }]}>
        <View style={[styles.emptyIconContainer, { backgroundColor: theme.peach, borderColor: theme.hairline }]}>
          <Brain size={42} color={theme.text} />
        </View>
        <Text style={[styles.emptyTitle, { color: theme.text }]}>No Practice Insights Available Yet</Text>
        <Text style={[styles.emptyDesc, { color: theme.textSecondary }]}>
          Once you begin solving questions in the practice suite or create custom testing modules, this dashboard will visualize your 14-day study history, FSRS spaced repetition memory queues, and subject-wise breakdowns.
        </Text>
        <Pressable 
          onPress={() => router.push('/')}
          style={({ pressed }) => [
            styles.emptyBtn,
            { backgroundColor: theme.text, opacity: pressed ? 0.9 : 1 }
          ]}
        >
          <Text style={[styles.emptyBtnText, { color: theme.background }]}>Go to Dashboard & Start Practice</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 32) }]}
    >
      <Text style={[styles.title, { color: theme.text }]}>Analytics</Text>

      {loading ? (
        <View style={styles.loadingWrapper}>
          <ActivityIndicator size="large" color={theme.pink} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading stats...</Text>
        </View>
      ) : (
        <>
          {/* Bento boxes - Overall Stats */}
          <View style={styles.bentoGrid}>
            <View style={[styles.bentoItem, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
              <BarChart3 size={20} color={theme.pink} />
              <Text style={[styles.bentoVal, { color: theme.text }]}>{totalAttempted}</Text>
              <Text style={[styles.bentoLabel, { color: theme.textSecondary }]}>Solved Qs</Text>
            </View>

            <View style={[styles.bentoItem, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
              <Brain size={20} color={theme.peach} />
              <Text style={[styles.bentoVal, { color: theme.text }]}>{retentionIndex}%</Text>
              <Text style={[styles.bentoLabel, { color: theme.textSecondary }]}>Retention Index</Text>
            </View>

            <View style={[styles.bentoItem, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
              <AlertTriangle size={20} color={theme.peach} />
              <Text style={[styles.bentoVal, { color: theme.text }]}>{mistakeCount}</Text>
              <Text style={[styles.bentoLabel, { color: theme.textSecondary }]}>Active Mistakes</Text>
            </View>

            <View style={[styles.bentoItem, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
              <Zap size={20} color={theme.lavender} />
              <Text style={[styles.bentoVal, { color: theme.text }]}>{estimatedKnowledge}</Text>
              <Text style={[styles.bentoLabel, { color: theme.textSecondary }]}>Knowledge Score</Text>
            </View>
          </View>

          {/* Consistency Heatmap */}
          <ConsistencyHeatmap data={consistencyData} />

          {/* Professional Phase Breakdowns */}
          <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 12 }]}>MBBS Professional Phase masteries</Text>
          <View style={styles.phaseGrid}>
            {phaseStats.map(phase => {
              return (
                <View 
                  key={phase.name} 
                  style={[
                    styles.phaseCard, 
                    { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }
                  ]}
                >
                  <Text style={[styles.phaseCardTitle, { color: phase.color }]}>{phase.name}</Text>
                  
                  <View style={styles.phaseCardProgressContainer}>
                    <View style={[styles.phaseCardProgressBg, { backgroundColor: theme.background }]}>
                      <View style={[styles.phaseCardProgressFill, { width: `${phase.completionPct}%`, backgroundColor: phase.color }]} />
                    </View>
                    <View style={styles.phaseCardMeta}>
                      <Text style={[styles.phaseCardValText, { color: theme.textSecondary }]}>
                        {phase.completionPct.toFixed(0)}% Comp
                      </Text>
                      <Text style={[styles.phaseCardValText, { color: theme.pink, fontWeight: 'bold' }]}>
                        {phase.accuracyPct}% Acc
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>

          {/* FSRS spaced repetition custom SVG charts */}
          <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 16 }]}>Spaced Repetition Analytics</Text>
          
          <QueueCompositionChart 
            newCount={queueComp.new}
            learningCount={queueComp.learn}
            reviewCount={queueComp.review}
            relearningCount={queueComp.relearn}
          />

          <PracticeVolumeChart 
            correctData={practiceVolume.correct}
            incorrectData={practiceVolume.incorrect}
            labels={practiceVolume.labels}
          />

          <ReviewForecastChart 
            data={forecast.data}
            labels={forecast.labels}
          />

          <DifficultySpectrumChart 
            data={difficultySpectrum}
          />

          <MemoryStabilityChart 
            data={stabilityDist}
          />

          {/* Leech Concepts Section */}
          {leeches.length > 0 && (
            <View style={{ marginTop: 16 }}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Leech Concepts (Needs Review)</Text>
              <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
                These questions have high failure rates. Review their details below.
              </Text>
              <View style={styles.leechContainer}>
                {leeches.map(leech => {
                  const subject = subjectsList.find(s => s.id === leech.subjectId);
                  return (
                    <View 
                      key={leech.questionId}
                      style={[
                        styles.leechCard, 
                        { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }
                      ]}
                    >
                      <View style={styles.leechHeader}>
                        <Text numberOfLines={1} style={[styles.leechSubject, { color: theme.pink }]}>
                          {subject?.name || 'General Medicine'}
                        </Text>
                        <View style={styles.leechBadges}>
                          <Text style={[styles.leechLabel, { color: theme.textSecondary }]}>
                            {leech.lapses} lapses
                          </Text>
                          <Text style={[styles.leechLabel, { color: theme.error }]}>
                            Diff: {leech.difficulty.toFixed(1)}
                          </Text>
                        </View>
                      </View>
                      <Text 
                        numberOfLines={2} 
                        ellipsizeMode="tail" 
                        style={[styles.leechText, { color: theme.text }]}
                      >
                        {leech.questionText}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* Subject breakdown */}
          <View style={{ marginTop: 16 }}>
            <View style={styles.masteryHeadingRow}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Subject Mastery</Text>
            </View>

            {/* Mastery Interactive Sorting Controls */}
            <View style={styles.sortingRow}>
              <Text style={[styles.sortLabel, { color: theme.textSecondary }]}>Sort by:</Text>
              {(['accuracy', 'solved', 'name'] as const).map(option => {
                const isActive = sortBy === option;
                return (
                  <Pressable
                    key={option}
                    onPress={() => {
                      if (sortBy === option) {
                        setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSortBy(option);
                        setSortOrder('desc');
                      }
                    }}
                    style={[
                      styles.sortBtn,
                      { 
                        backgroundColor: isActive ? theme.pink : theme.backgroundElement,
                        borderColor: theme.hairline 
                      }
                    ]}
                  >
                    <Text style={[styles.sortBtnText, { color: isActive ? '#ffffff' : theme.textSecondary }]}>
                      {option.toUpperCase()} {isActive ? (sortOrder === 'desc' ? '↓' : '↑') : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.masteryList}>
              {sortedMasteries.map(mastery => {
                const hasSolved = mastery.attempted > 0;
                const hasSeeded = mastery.totalQuestions > 0;
                
                return (
                  <View 
                    key={mastery.id} 
                    style={[
                      styles.masteryRow, 
                      { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }
                    ]}
                  >
                    <View style={styles.rowHeader}>
                      <Text style={[styles.subjectName, { color: theme.text }]}>{mastery.name}</Text>
                      {hasSolved && (
                        <Text style={[styles.accuracyBadge, { color: theme.pink, fontWeight: 'bold' }]}>
                          {mastery.accuracy.toFixed(0)}% Acc
                        </Text>
                      )}
                    </View>

                    <View style={styles.rowDetails}>
                      <Text style={[styles.countLabel, { color: theme.textSecondary }]}>
                        {hasSeeded ? `${mastery.attempted} / ${mastery.totalQuestions} cached Qs solved` : 'Not downloaded'}
                      </Text>
                    </View>

                    {/* Progress bar */}
                    {hasSeeded && (
                      <View style={[styles.progressBarBg, { backgroundColor: theme.background }]}>
                        <View 
                          style={[
                            styles.progressBarFill, 
                            { 
                              width: `${Math.min(100, (mastery.attempted / mastery.totalQuestions) * 100)}%`, 
                              backgroundColor: mastery.accuracy > 70 ? theme.success : mastery.accuracy > 50 ? theme.ochre : theme.pink 
                            }
                          ]} 
                        />
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    gap: 16,
  },
  title: {
    fontFamily: Fonts.sans,
    fontSize: 24,
    fontWeight: 'bold',
    letterSpacing: -0.8,
    marginVertical: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: -0.5,
    marginTop: 12,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 11,
    marginTop: -2,
    marginBottom: 8,
  },
  loadingWrapper: {
    flex: 1,
    paddingVertical: 100,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
  },
  bentoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  bentoItem: {
    width: '48%',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
    flexGrow: 1,
  },
  bentoVal: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 4,
  },
  bentoLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  masteryList: {
    gap: 8,
    marginTop: 10,
  },
  masteryRow: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subjectName: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  accuracyBadge: {
    fontSize: 12,
  },
  rowDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  countLabel: {
    fontSize: 11,
  },
  progressBarBg: {
    height: 5,
    borderRadius: 2.5,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2.5,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 24,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    letterSpacing: -0.5,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyDesc: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  emptyBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  phaseGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  phaseCard: {
    width: '48%',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
    flexGrow: 1,
  },
  phaseCardTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  phaseCardProgressContainer: {
    gap: 4,
  },
  phaseCardProgressBg: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  phaseCardProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
  phaseCardMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  phaseCardValText: {
    fontSize: 9,
  },
  leechContainer: {
    gap: 8,
    marginTop: 6,
  },
  leechCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  leechHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  leechSubject: {
    fontSize: 12,
    fontWeight: 'bold',
    flex: 1,
  },
  leechBadges: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  leechLabel: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  leechText: {
    fontSize: 11,
    lineHeight: 15,
  },
  masteryHeadingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sortingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  sortLabel: {
    fontSize: 11,
    marginRight: 4,
  },
  sortBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  sortBtnText: {
    fontSize: 9,
    fontWeight: 'bold',
  },
});
