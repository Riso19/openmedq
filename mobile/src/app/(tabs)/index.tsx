import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  ScrollView, 
  Pressable, 
  StyleSheet, 
  ActivityIndicator, 
  Alert, 
  RefreshControl,
  Image 
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth, useUser } from '@clerk/expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { 
  Play, 
  Sliders, 
  Download, 
  RefreshCw, 
  BookOpen,
  AlertTriangle,
  Settings
} from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';
import { 
  getSpacedRepetitionCounts, 
  getDB,
  getActiveLeechesDetails,
  getQuestionsSolvedToday,
  type LeechDetail
} from '@/lib/db';
import { checkDailyStreakAndReset } from '@/lib/gamification';
import { SyllabusModal } from '@/components/SyllabusModal';
import { LevelUpModal } from '@/components/LevelUpModal';
import { LevelResetModal } from '@/components/LevelResetModal';
import { FSRSSettingsModal } from '@/components/FSRSSettingsModal';
import { SyncManager } from '@/lib/SyncManager';
import { 
  getLevelInfo, 
  getNextLevelInfo, 
  getCurrentMonthStr, 
  subjectsList,
  PYQ_PAPERS,
  NEET_PG_PYQ_SUBJECT,
  allSubjectsList
} from '@openmedq/shared';

const getBadgeSource = (badgeUrl: string) => {
  if (badgeUrl.includes('seeker-badge-1')) return require('../../../assets/images/badge/seeker-badge-1.png');
  if (badgeUrl.includes('scribe-badge-2')) return require('../../../assets/images/badge/scribe-badge-2.png');
  if (badgeUrl.includes('medic-badge-3')) return require('../../../assets/images/badge/medic-badge-3.png');
  if (badgeUrl.includes('scholar-badge-4')) return require('../../../assets/images/badge/scholar-badge-4.png');
  if (badgeUrl.includes('savant-badge-5')) return require('../../../assets/images/badge/savant-badge-5.png');
  if (badgeUrl.includes('prodigy-6') || badgeUrl.includes('prodigy')) return require('../../../assets/images/badge/prodigy-6.png');
  return require('../../../assets/images/badge/seeker-badge-1.png');
};

const MBBS_PHASES = [
  {
    name: 'First Year (Pre-Clinical)',
    description: 'Anatomy, Physiology, and Biochemistry.',
    subjectIds: [1, 2, 3], // Anatomy, Biochemistry, Physiology
  },
  {
    name: 'Second & Third Year (Para-Clinical)',
    description: 'Pathology, Pharmacology, Microbiology, Forensic Medicine, and SPM.',
    subjectIds: [4, 5, 6, 7, 8], // Pharmacology, Pathology, Microbiology, Forensic Medicine, SPM
  },
  {
    name: 'Short Subjects & Specialties',
    description: 'Ophthalmology, ENT, Pediatrics, Orthopedics, Dermatology, Psychiatry, Radiology, and Anesthesia.',
    subjectIds: [9, 10, 14, 15, 16, 17, 18, 19], // Ophtha, ENT, Peds, Ortho, Derm, Psych, Radio, Anesthesia
  },
  {
    name: 'Final Year (Core Clinicals)',
    description: 'General Medicine, General Surgery, and Obstetrics & Gynecology.',
    subjectIds: [11, 12, 13], // Medicine, Surgery, OBG
  },
  {
    name: 'Official Exam Archives',
    description: 'NEET PG Previous Year Papers (2018–2025).',
    subjectIds: [NEET_PG_PYQ_SUBJECT.id], // Virtual NEET PG subject ID
  },
];

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const router = useRouter();

  const { getToken, isSignedIn: isClerkSignedIn } = useAuth();
  const { user } = useUser();

  const [dopa, setDopa] = useState<number>(0);
  const [streak, setStreak] = useState<number>(0);
  const [username, setUsername] = useState<string>('Aspirant');
  const [isSignedIn, setIsSignedIn] = useState<boolean>(false);
  
  const [srCounts, setSrCounts] = useState<{ due: number; new: number }>({ due: 0, new: 0 });
  const [dueCount, setDueCount] = useState<number>(0);
  const [bookmarkedCount, setBookmarkedCount] = useState<number>(0);
  const [incorrectCount, setIncorrectCount] = useState<number>(0);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [subjectProgress, setSubjectProgress] = useState<Record<number, { attempted: number; seeded: number }>>({});
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'unsynced' | 'error'>('synced');
  const [leeches, setLeeches] = useState<LeechDetail[]>([]);
  
  const [refreshing, setRefreshing] = useState(false);
  const [downloadingSubjectId, setDownloadingSubjectId] = useState<number | null>(null);

  // Solved today, Daily goal, Target exam, and Modal states
  const [solvedToday, setSolvedToday] = useState<number>(0);
  const [dailyTarget, setDailyTarget] = useState<number>(50);
  const [targetExam, setTargetExam] = useState<'NEET PG' | 'INI-CET' | 'FMGE'>('NEET PG');
  const [activeSyllabusSubjectId, setActiveSyllabusSubjectId] = useState<number | null>(null);
  const [lastMonthStats, setLastMonthStats] = useState<any | null>(null);
  const [pendingLevelUp, setPendingLevelUp] = useState<any | null>(null);
  const [activeSession, setActiveSession] = useState<any | null>(null);

  // Load local user stats, settings, and progress counts
  const loadDashboardData = useCallback(async () => {
    try {
      // 0. Run daily streak and rollover checks on startup
      try {
        await checkDailyStreakAndReset();
        
        const pendingRollover = await AsyncStorage.getItem('openmedq_last_month_stats');
        if (pendingRollover) {
          setLastMonthStats(JSON.parse(pendingRollover));
        }
        
        const pendingLevel = await AsyncStorage.getItem('openmedq_pending_levelup');
        if (pendingLevel) {
          setPendingLevelUp(JSON.parse(pendingLevel));
        }
      } catch (err) {
        console.warn("Failed to check daily streak & reset on load:", err);
      }

      // Check active practice session
      const savedSession = await AsyncStorage.getItem('openmedq_active_practice_session');
      if (savedSession) {
        setActiveSession(JSON.parse(savedSession));
      } else {
        setActiveSession(null);
      }

      // 1. Get logged-in state and username
      setIsSignedIn(!!isClerkSignedIn);
      if (isClerkSignedIn && user) {
        setUsername(user.fullName || user.username || user.primaryEmailAddress?.emailAddress || 'Aspirant');
      } else {
        setUsername('Guest');
      }

      // 2. Fetch current month's userStats from SQLite
      const currentMonth = getCurrentMonthStr();
      const sqlite = await getDB();
      const statsRow = await sqlite.getFirstAsync<any>(
        'SELECT * FROM userStats WHERE month = ?',
        [currentMonth]
      );

      if (statsRow) {
        setDopa(statsRow.dopa);
        setStreak(statsRow.streakDays);
      } else {
        setDopa(0);
        setStreak(0);
      }

      // 2b. Fetch daily targets, target exam, and solved today counts
      const storedTarget = await AsyncStorage.getItem('openmedq_daily_target');
      setDailyTarget(storedTarget ? parseInt(storedTarget, 10) : 50);

      const storedExam = await AsyncStorage.getItem('openmedq_target_exam');
      setTargetExam((storedExam as any) || 'NEET PG');

      const solved = await getQuestionsSolvedToday();
      setSolvedToday(solved);

      // 3. Spaced repetition and other stats counts
      const counts = await getSpacedRepetitionCounts({ subjectIds: [] });
      setSrCounts(counts);
      setDueCount(counts.due);

      const bookmarkedRow = await sqlite.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) as count FROM progress WHERE status = 'BOOKMARKED' AND isDeleted = 0 AND questionId != -999"
      );
      setBookmarkedCount(bookmarkedRow?.count || 0);

      const incorrectRow = await sqlite.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) as count FROM progress WHERE status = 'INCORRECT' AND isDeleted = 0 AND questionId != -999"
      );
      setIncorrectCount(incorrectRow?.count || 0);

      // Fetch active leeches details
      const activeLeeches = await getActiveLeechesDetails(3);
      setLeeches(activeLeeches);

      // 4. Subject local counts and attempted progress
      // Count local questions per subject
      const seededRows = await sqlite.getAllAsync<{ subjectId: number; count: number }>(
        'SELECT subjectId, COUNT(id) as count FROM questions GROUP BY subjectId'
      );
      
      // Count attempted questions per subject
      const attemptedRows = await sqlite.getAllAsync<{ subjectId: number; count: number }>(
        `SELECT q.subjectId, COUNT(p.questionId) as count 
         FROM progress p 
         JOIN questions q ON p.questionId = q.id 
         WHERE p.status IN ('CORRECT', 'INCORRECT') AND p.isDeleted = 0 
         GROUP BY q.subjectId`
      );

      const progressMap: Record<number, { attempted: number; seeded: number }> = {};
      
      // Initialize with 0s
      allSubjectsList.forEach(s => {
        progressMap[s.id] = { attempted: 0, seeded: 0 };
      });

      seededRows.forEach(row => {
        if (progressMap[row.subjectId]) {
          progressMap[row.subjectId].seeded = row.count;
        }
      });

      attemptedRows.forEach(row => {
        if (progressMap[row.subjectId]) {
          progressMap[row.subjectId].attempted = row.count;
        }
      });

      // Calculate progress for NEET PG PYQs (subjectId = 99)
      const seededYearRow = await sqlite.getFirstAsync<{ count: number }>(
        "SELECT COUNT(id) as count FROM questions WHERE examType = 'NEET PG' AND examYear IS NOT NULL"
      );
      const attemptedYearRow = await sqlite.getFirstAsync<{ count: number }>(
        `SELECT COUNT(p.questionId) as count 
         FROM progress p 
         JOIN questions q ON p.questionId = q.id 
         WHERE q.examType = 'NEET PG' AND q.examYear IS NOT NULL AND p.status IN ('CORRECT', 'INCORRECT') AND p.isDeleted = 0`
      );
      
      progressMap[NEET_PG_PYQ_SUBJECT.id] = {
        seeded: seededYearRow?.count || 0,
        attempted: attemptedYearRow?.count || 0
      };

      setSubjectProgress(progressMap);
    } catch (err) {
      console.warn('Failed to load dashboard statistics:', err);
    }
  }, [isClerkSignedIn, user]);

  const handleUpdateDailyTarget = async (newGoal: number) => {
    if (newGoal < 5) return;
    if (newGoal > 500) return;
    try {
      setDailyTarget(newGoal);
      await AsyncStorage.setItem('openmedq_daily_target', String(newGoal));
      await SyncManager.saveSettingsToSQLite();
      handleSync();
    } catch (err) {
      console.warn('Failed to save daily goal:', err);
    }
  };

  const handleUpdateTargetExam = async (exam: 'NEET PG' | 'INI-CET' | 'FMGE') => {
    try {
      setTargetExam(exam);
      await AsyncStorage.setItem('openmedq_target_exam', exam);
      await SyncManager.saveSettingsToSQLite();
      handleSync();
    } catch (err) {
      console.warn('Failed to save target exam:', err);
    }
  };

  const handleResumeSession = () => {
    router.push({
      pathname: '/practice-suite',
      params: {
        resume: 'true'
      }
    });
  };

  const handleDiscardSession = () => {
    Alert.alert(
      'Discard Session',
      'Are you sure you want to discard this practice session? Your progress in this unfinished block will be lost.',
      [
        {
          text: 'Discard',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.removeItem('openmedq_active_practice_session');
              setActiveSession(null);
            } catch (err) {
              console.warn('Failed to discard active session:', err);
            }
          }
        },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  // Fetch token function helper for SyncManager
  const getSyncToken = useCallback(async (options?: { skipCache?: boolean }) => {
    return await getToken(options);
  }, [getToken]);

  // Trigger sync loop
  const handleSync = useCallback(async (showNotification = false) => {
    const token = await getSyncToken();
    if (!token) {
      if (showNotification) {
        Alert.alert('Sign In Required', 'Sign In on your Profile tab to synchronize your progress.', [
          { text: 'Go to Profile', onPress: () => router.push('/profile') },
          { text: 'Cancel', style: 'cancel' }
        ]);
      }
      return;
    }

    try {
      setSyncStatus('syncing');
      
      let profile = undefined;
      if (user) {
        profile = {
          displayName: user.fullName || user.username || undefined,
          email: user.primaryEmailAddress?.emailAddress || undefined,
        };
      }

      const success = await SyncManager.syncWithD1(getSyncToken, setSyncStatus, profile, showNotification);
      if (success) {
        await loadDashboardData();
        if (showNotification) {
          Alert.alert('Sync Successful', 'Your offline database has synced successfully!');
        }
      } else {
        setSyncStatus('error');
        if (showNotification) {
          Alert.alert('Sync Error', 'Failed to synchronize progress. Please try again.');
        }
      }
    } catch (err) {
      setSyncStatus('error');
      console.error(err);
    }
  }, [getSyncToken, loadDashboardData, router, user]);

  // Initial load and auto-sync on auth change
  useEffect(() => {
    Promise.resolve().then(() => {
      loadDashboardData();
    });
  }, [loadDashboardData]);

  useEffect(() => {
    if (isClerkSignedIn && user) {
      Promise.resolve().then(() => {
        handleSync();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClerkSignedIn, user]);

  useEffect(() => {
    // Subscribe to sync events
    const unsubscribe = SyncManager.addSyncListener((event, data) => {
      if (event === 'openmedq_dopa_updated') {
        if (data) {
          setDopa(data.dopa);
          setStreak(data.streakDays);
        }
      }
    });

    return () => unsubscribe();
  }, []);


  // Handle pull to refresh
  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    await handleSync();
    setRefreshing(false);
  };

  // Download question pack from CDN
  const downloadSubjectPack = async (subjectId: number, subjectName: string) => {
    try {
      setDownloadingSubjectId(subjectId);
      console.log(`Downloading ${subjectName} questions pack from CDN...`);
      
      const cdnUrl = process.env.EXPO_PUBLIC_CDN_URL || 'https://assets.openmedq.com';
      const sqlite = await getDB();

      if (subjectId === NEET_PG_PYQ_SUBJECT.id) {
        // Download all NEET PG PYQ years in parallel
        const promises = PYQ_PAPERS.map(async (paper) => {
          const res = await fetch(`${cdnUrl}/packs/neet_pg_${paper.year}.json`);
          if (res.ok) {
            const rawQuestions = await res.json();
            if (Array.isArray(rawQuestions)) {
              return rawQuestions.map((q: any) => ({
                ...q,
                correctOption: typeof q.correctOption === 'number' && q.correctOption >= 0 && q.correctOption <= 3
                  ? q.correctOption + 1
                  : q.correctOption,
              }));
            }
          }
          return [];
        });
        
        const allPacksQuestions = await Promise.all(promises);
        const formattedQuestions = allPacksQuestions.flat();
        
        if (formattedQuestions.length > 0) {
          await sqlite.withTransactionAsync(async () => {
            for (const q of formattedQuestions) {
              await sqlite.runAsync(
                `INSERT INTO questions (
                  id, subjectId, topicId, examType, examYear, questionText, opa, opb, opc, opd, correctOption, explanation,
                  imageUrl, explanationImageUrl, opaImageUrl, opbImageUrl, opcImageUrl, opdImageUrl
                ) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(id) DO UPDATE SET
                   subjectId=excluded.subjectId,
                   topicId=excluded.topicId,
                   examType=excluded.examType,
                   examYear=excluded.examYear,
                   questionText=excluded.questionText,
                   opa=excluded.opa,
                   opb=excluded.opb,
                   opc=excluded.opc,
                   opd=excluded.opd,
                   correctOption=excluded.correctOption,
                   explanation=excluded.explanation,
                   imageUrl=excluded.imageUrl,
                   explanationImageUrl=excluded.explanationImageUrl,
                   opaImageUrl=excluded.opaImageUrl,
                   opbImageUrl=excluded.opbImageUrl,
                   opcImageUrl=excluded.opcImageUrl,
                   opdImageUrl=excluded.opdImageUrl`,
                [
                  q.id,
                  q.subjectId,
                  q.topicId,
                  q.examType || null,
                  q.examYear || null,
                  q.questionText,
                  q.opa,
                  q.opb,
                  q.opc,
                  q.opd,
                  q.correctOption,
                  q.explanation || null,
                  q.imageUrl || null,
                  q.explanationImageUrl || null,
                  q.opaImageUrl || null,
                  q.opbImageUrl || null,
                  q.opcImageUrl || null,
                  q.opdImageUrl || null
                ]
              );
            }
          });
          console.log(`Successfully cached ${formattedQuestions.length} NEET PG PYQs`);
          await loadDashboardData();
        } else {
          Alert.alert('Download Failed', 'Failed to retrieve questions from CDN.');
        }
        return;
      }

      const res = await fetch(`${cdnUrl}/packs/subject_${subjectId}.json`);

      if (res.ok) {
        const rawQuestions = await res.json();
        if (Array.isArray(rawQuestions) && rawQuestions.length > 0) {
          // Map correctOption to 1-indexed locally for frontend compatibility (0=A => 1, 1=B => 2, etc.)
          const formattedQuestions = rawQuestions.map((q: any) => ({
            ...q,
            correctOption: typeof q.correctOption === 'number' && q.correctOption >= 0 && q.correctOption <= 3
              ? q.correctOption + 1
              : q.correctOption,
          }));

          await sqlite.withTransactionAsync(async () => {
            for (const q of formattedQuestions) {
              await sqlite.runAsync(
                `INSERT INTO questions (
                  id, subjectId, topicId, examType, examYear, questionText, opa, opb, opc, opd, correctOption, explanation,
                  imageUrl, explanationImageUrl, opaImageUrl, opbImageUrl, opcImageUrl, opdImageUrl
                ) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(id) DO UPDATE SET
                   subjectId=excluded.subjectId,
                   topicId=excluded.topicId,
                   examType=excluded.examType,
                   examYear=excluded.examYear,
                   questionText=excluded.questionText,
                   opa=excluded.opa,
                   opb=excluded.opb,
                   opc=excluded.opc,
                   opd=excluded.opd,
                   correctOption=excluded.correctOption,
                   explanation=excluded.explanation,
                   imageUrl=excluded.imageUrl,
                   explanationImageUrl=excluded.explanationImageUrl,
                   opaImageUrl=excluded.opaImageUrl,
                   opbImageUrl=excluded.opbImageUrl,
                   opcImageUrl=excluded.opcImageUrl,
                   opdImageUrl=excluded.opdImageUrl`,
                [
                  q.id,
                  q.subjectId,
                  q.topicId,
                  q.examType || null,
                  q.examYear || null,
                  q.questionText,
                  q.opa,
                  q.opb,
                  q.opc,
                  q.opd,
                  q.correctOption,
                  q.explanation || null,
                  q.imageUrl || null,
                  q.explanationImageUrl || null,
                  q.opaImageUrl || null,
                  q.opbImageUrl || null,
                  q.opcImageUrl || null,
                  q.opdImageUrl || null
                ]
              );
            }
          });

          console.log(`Successfully cached ${formattedQuestions.length} questions for subject ${subjectName}`);
          await loadDashboardData();
        } else {
          Alert.alert('Empty Pack', 'No questions found for this subject.');
        }
      } else {
        throw new Error(`Failed to retrieve question pack from CDN. Status: ${res.status}`);
      }
    } catch (err) {
      console.warn(`CDN Download failed for subject ${subjectId}:`, err);
      Alert.alert('Download Failed', 'Check your network connection and try again.');
    } finally {
      setDownloadingSubjectId(null);
    }
  };

  // Gamification helpers
  const levelInfo = getLevelInfo(dopa);
  const nextLvl = getNextLevelInfo(dopa);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView 
        style={[styles.container, { backgroundColor: theme.background }]}
        contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 32) }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.pink} />
        }
      >
        {/* Header bar */}
        <View style={styles.header}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={[styles.brandText, { color: theme.text }]}>OpenMedQ</Text>
            <Text style={[styles.welcomeText, { color: theme.textSecondary }]}>
              Hello, {username} {isSignedIn ? '✓' : '(Guest)'}
            </Text>
          </View>
          <Pressable 
            onPress={() => handleSync(true)} 
            style={({ pressed }) => [
              styles.syncButton, 
              { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 }
            ]}
          >
            {syncStatus === 'syncing' ? (
              <ActivityIndicator size="small" color={theme.pink} />
            ) : (
              <RefreshCw size={16} color={syncStatus === 'error' ? theme.error : theme.text} />
            )}
            <Text style={[styles.syncButtonText, { color: theme.text }]}>
              {syncStatus === 'syncing' ? 'Syncing...' : 'Sync'}
            </Text>
          </Pressable>
        </View>

        {/* Target Exam Focus Selection */}
        <View style={[styles.examCard, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
          <Text style={[styles.examCardTitle, { color: theme.textSecondary }]}>TARGET EXAM FOCUS</Text>
          <View style={[styles.examToggleContainer, { backgroundColor: theme.background }]}>
            {(['NEET PG', 'INI-CET', 'FMGE'] as const).map((exam) => (
              <Pressable
                key={exam}
                onPress={() => handleUpdateTargetExam(exam)}
                style={({ pressed }) => [
                  styles.examToggleBtn,
                  targetExam === exam && { backgroundColor: theme.text },
                  { opacity: pressed ? 0.9 : 1 }
                ]}
              >
                <Text style={[
                  styles.examToggleText,
                  { color: targetExam === exam ? theme.background : theme.textSecondary }
                ]}>
                  {exam}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Guest Warning Banner if signed out */}
        {!isSignedIn && (
          <View style={[styles.guestAlertCard, { backgroundColor: theme.pink }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.guestAlertTitle}>Save Your Progress</Text>
              <Text style={styles.guestAlertDesc}>
                You are studying offline. Create a free account to back up your progress and study on any device.
              </Text>
            </View>
            <Pressable
              onPress={() => router.push('/signup' as any)}
              style={({ pressed }) => [
                styles.guestAlertBtn,
                { backgroundColor: theme.background, opacity: pressed ? 0.95 : 1 }
              ]}
            >
              <Text style={[styles.guestAlertBtnText, { color: theme.text }]}>Sign Up</Text>
            </Pressable>
          </View>
        )}

        {/* Active Session Resume Card */}
        {activeSession && (
          <View style={[styles.resumeCard, { backgroundColor: theme.mint }]}>
            <View style={styles.resumeHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.resumeSubtitle}>{"UNFINISHED STUDY SESSION"}</Text>
                <Text style={styles.resumeTitle}>
                  {activeSession.config?.status === 'SPACED_REPETITION' ? 'Spaced Repetition' : 'Custom Practice'}
                </Text>
              </View>
            </View>
            <Text style={styles.resumeDesc}>
              You have an unfinished session with {activeSession.questions?.length || 0} questions ({Object.keys(activeSession.firstAttempts || {}).length} answered).
            </Text>
            <View style={styles.resumeActions}>
              <Pressable
                onPress={handleDiscardSession}
                style={[styles.resumeDiscardBtn, { borderColor: 'rgba(10, 10, 10, 0.2)' }]}
              >
                <Text style={styles.resumeDiscardText}>Discard</Text>
              </Pressable>
              <Pressable
                onPress={handleResumeSession}
                style={styles.resumeActiveBtn}
              >
                <Text style={[styles.resumeActiveText, { color: theme.mint }]}>Resume Session</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Today's Study Goal Card (Solid Pink, White Text) */}
        {dailyTarget > 0 && (
          <View style={[styles.goalCard, { backgroundColor: theme.pink }]}>
            <View style={styles.goalHeader}>
              <View>
                <Text style={styles.goalSubtitle}>{"TODAY'S STUDY GOAL"}</Text>
                <Text style={styles.goalTitle}>{solvedToday} of {dailyTarget} Done</Text>
              </View>
            </View>

            {/* Custom progress bar */}
            <View style={styles.goalProgressContainer}>
              <View style={styles.goalProgressBg}>
                <View 
                  style={[
                    styles.goalProgressFill, 
                    { width: `${Math.min(100, Math.max(0, (solvedToday / dailyTarget) * 100))}%` }
                  ]} 
                />
              </View>
              <View style={styles.goalInfoRow}>
                <Text style={styles.goalProgressText}>
                  {Math.round(Math.min(100, (solvedToday / dailyTarget) * 100))}% completed
                </Text>
                
                {/* Adjuster controls */}
                <View style={styles.adjusterControls}>
                  <Text style={styles.goalAdjustLabel}>Target:</Text>
                  <Pressable 
                    onPress={() => handleUpdateDailyTarget(dailyTarget - 10)} 
                    style={styles.adjustBtn}
                  >
                    <Text style={styles.adjustBtnText}>-10</Text>
                  </Pressable>
                  <Text style={styles.adjustValue}>{dailyTarget}</Text>
                  <Pressable 
                    onPress={() => handleUpdateDailyTarget(dailyTarget + 10)} 
                    style={styles.adjustBtn}
                  >
                    <Text style={styles.adjustBtnText}>+10</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Gamification Stats Card */}
        <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={{ fontSize: 28 }}>🔥</Text>
              <Text style={[styles.statValue, { color: theme.text }]}>{streak}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Day Streak</Text>
            </View>
            
            <View style={styles.statBox}>
              <Image 
                source={require('../../../assets/images/badge/dopa-xp.png')} 
                style={{ width: 28, height: 28 }} 
                resizeMode="contain" 
              />
              <Text style={[styles.statValue, { color: theme.text }]}>{dopa}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Monthly DOPA</Text>
            </View>

            <View style={styles.statBox}>
              <Image 
                source={getBadgeSource(levelInfo.badgeUrl)} 
                style={{ width: 28, height: 28 }} 
                resizeMode="contain" 
              />
              <Text style={[styles.statValue, { color: theme.text }]}>{levelInfo.name}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Level {levelInfo.level}</Text>
            </View>
          </View>

          {/* Level progress bar */}
          {nextLvl.nextLevel && (
            <View style={styles.progressBarWrapper}>
              <View style={styles.progressBarHeader}>
                <Text style={[styles.progressBarLabel, { color: theme.textSecondary }]}>
                  Next: {nextLvl.nextLevel.name}
                </Text>
                <Text style={[styles.progressBarLabel, { color: theme.textSecondary }]}>
                  {nextLvl.remaining} DOPA to go
                </Text>
              </View>
              <View style={[styles.progressBarBg, { backgroundColor: theme.background }]}>
                <View style={[styles.progressBarFill, { width: `${nextLvl.pct}%`, backgroundColor: theme.pink }]} />
              </View>
            </View>
          )}
        </View>

        {/* Revision Queue Card (Lavender, Dark text) */}
        <View 
          style={[
            styles.revCard,
            { backgroundColor: theme.lavender }
          ]}
        >
          <View style={styles.revHeader}>
            <View>
              <Text style={styles.revSubtitle}>SMART REVISION</Text>
              <Text style={styles.revTitle}>Revision Queue</Text>
            </View>
            <Pressable 
              onPress={() => setShowSettingsModal(true)}
              style={({ pressed }) => [
                { opacity: pressed ? 0.6 : 1, padding: 4 }
              ]}
            >
              <Settings size={18} color="#0a0a0a" />
            </Pressable>
          </View>

          {/* Stats rows */}
          <View style={styles.revStatsContainer}>
            <View style={styles.revStatRow}>
              <Text style={[styles.revStatLabel, { color: theme.pink }]}>Ready to Revise:</Text>
              <Text style={[styles.revStatVal, { color: theme.pink }]}>{dueCount} questions</Text>
            </View>
            <View style={styles.revStatRow}>
              <Text style={styles.revStatLabel}>Saved Questions:</Text>
              <Text style={styles.revStatVal}>{bookmarkedCount}</Text>
            </View>
            <View style={styles.revStatRow}>
              <Text style={styles.revStatLabel}>Mistakes to Fix:</Text>
              <Text style={styles.revStatVal}>{incorrectCount}</Text>
            </View>
          </View>

          {/* Action buttons */}
          <View style={{ gap: 8 }}>
            <Pressable
              disabled={dueCount === 0}
              onPress={() => {
                router.push({
                  pathname: '/practice-suite',
                  params: {
                    subjectIds: '',
                    status: 'SPACED_REPETITION',
                    timerMode: 'STOPWATCH',
                    timerValue: 0,
                    limit: 20,
                  }
                });
              }}
              style={({ pressed }) => [
                styles.revCtaBtn,
                { backgroundColor: '#0a0a0a', opacity: dueCount === 0 ? 0.45 : pressed ? 0.85 : 1 }
              ]}
            >
              <Text style={[styles.revCtaText, { color: theme.lavender }]}>Start Revision ({dueCount})</Text>
            </Pressable>
            <View style={styles.revSubActions}>
              <Pressable
                disabled={bookmarkedCount === 0}
                onPress={() => {
                  router.push({
                    pathname: '/practice-suite',
                    params: {
                      subjectIds: '',
                      status: 'BOOKMARKED',
                      timerMode: 'STOPWATCH',
                      timerValue: 0,
                      limit: Math.min(10, bookmarkedCount),
                    }
                  });
                }}
                style={({ pressed }) => [
                  styles.revSubBtn,
                  { opacity: bookmarkedCount === 0 ? 0.45 : pressed ? 0.8 : 1 }
                ]}
              >
                <Text style={styles.revSubBtnText}>Study Saved</Text>
              </Pressable>
              <Pressable
                disabled={incorrectCount === 0}
                onPress={() => {
                  router.push({
                    pathname: '/practice-suite',
                    params: {
                      subjectIds: '',
                      status: 'INCORRECT',
                      timerMode: 'STOPWATCH',
                      timerValue: 0,
                      limit: Math.min(10, incorrectCount),
                    }
                  });
                }}
                style={({ pressed }) => [
                  styles.revSubBtn,
                  { opacity: incorrectCount === 0 ? 0.45 : pressed ? 0.8 : 1 }
                ]}
              >
                <Text style={styles.revSubBtnText}>Fix Mistakes</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Leech Alerts Warning Card */}
        {leeches.length > 0 && (
          <View style={[styles.leechCard, { backgroundColor: theme.backgroundElement, borderColor: theme.error }]}>
            <View style={styles.leechHeader}>
              <View style={styles.leechHeaderLeft}>
                <AlertTriangle size={16} color={theme.error} />
                <Text style={[styles.leechCardTitle, { color: theme.text }]}>Memory Leeches Alert</Text>
              </View>
              <View style={[styles.leechCountBadge, { backgroundColor: theme.error + '15' }]}>
                <Text style={[styles.leechCountText, { color: theme.error }]}>{leeches.length} Critical</Text>
              </View>
            </View>
            <Text style={[styles.leechDesc, { color: theme.textSecondary }]}>
              {"These high-failure concepts are cluttering your review loop. Let's solve them now to reset parameters."}
            </Text>

            <View style={styles.leechList}>
              {leeches.map(leech => {
                const subj = subjectsList.find(s => s.id === leech.subjectId);
                return (
                  <View key={leech.questionId} style={[styles.leechItem, { borderColor: theme.hairline }]}>
                    <View style={styles.leechItemLeft}>
                      <Text numberOfLines={1} style={[styles.leechText, { color: theme.text }]}>
                        {leech.questionText}
                      </Text>
                      <Text style={[styles.leechMeta, { color: theme.textSecondary }]}>
                        {subj ? subj.name : 'Medical Concept'} • Lapses: {leech.lapses}
                      </Text>
                    </View>
                    <View style={[styles.difficultyBadge, { backgroundColor: theme.ochre + '15' }]}>
                      <Text style={[styles.difficultyText, { color: theme.ochre }]}>D {leech.difficulty.toFixed(1)}</Text>
                    </View>
                  </View>
                );
              })}
            </View>

            <Pressable 
              onPress={() => {
                router.push({
                  pathname: '/practice-suite',
                  params: {
                    subjectIds: '',
                    status: 'LEECHES',
                    timerMode: 'STOPWATCH',
                    timerValue: 0,
                    limit: 10,
                  }
                });
              }}
              style={({ pressed }) => [
                styles.leechCta,
                { backgroundColor: theme.error, opacity: pressed ? 0.8 : 1 }
              ]}
            >
              <Text style={styles.leechCtaText}>Start Quick Leech Review</Text>
            </Pressable>
          </View>
        )}

        {/* Custom Module Creator Link */}
        <Pressable 
          onPress={() => router.push('/custom-creator')}
          style={({ pressed }) => [
            styles.actionCard,
            { backgroundColor: theme.peach, opacity: pressed ? 0.9 : 1 }
          ]}
        >
          <View style={styles.actionCardHeader}>
            <Text style={[styles.actionCardTitle, { color: '#0a0a0a' }]}>Custom Test Creator</Text>
            <Sliders size={18} color="#0a0a0a" />
          </View>
          <Text style={[styles.actionCardDesc, { color: '#0a0a0a' }]}>
            Build bespoke question blocks, toggle timed countdown exams, and practice NEET PG patterns.
          </Text>
        </Pressable>

        {/* Subject Masteries List grouped by MBBS Professional Phase */}
        <View style={styles.sectionHeaderWrapper}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>MBBS Syllabus & Subjects</Text>
          <BookOpen size={16} color={theme.textSecondary} />
        </View>

        {MBBS_PHASES.map(phase => {
          const phaseSubjects = allSubjectsList.filter(s => phase.subjectIds.includes(s.id));
          return (
            <View key={phase.name} style={styles.phaseContainer}>
              <View style={styles.phaseHeader}>
                <Text style={[styles.phaseTitle, { color: theme.pink }]}>{phase.name}</Text>
                <Text style={[styles.phaseDesc, { color: theme.textSecondary }]}>{phase.description}</Text>
              </View>

              <View style={styles.subjectsList}>
                {phaseSubjects.map(subject => {
                  const prog = subjectProgress[subject.id] || { attempted: 0, seeded: 0 };
                  const isSeeded = prog.seeded > 0;
                  const totalQs = subject.count;
                  const completionPct = totalQs > 0 ? Math.min(100, (prog.attempted / totalQs) * 100) : 0;

                  return (
                    <Pressable 
                      key={subject.id} 
                      onPress={() => setActiveSyllabusSubjectId(subject.id)}
                      style={({ pressed }) => [
                        styles.subjectRow, 
                        { backgroundColor: theme.backgroundElement, borderColor: theme.hairline, opacity: pressed ? 0.95 : 1 }
                      ]}
                    >
                      <View style={styles.subjectRowLeft}>
                        <Text style={[styles.subjectName, { color: theme.text }]}>{subject.name}</Text>
                        
                        {isSeeded ? (
                          <Text style={[styles.subjectCount, { color: theme.textSecondary }]}>
                            {prog.attempted} / {totalQs} Qs ({completionPct.toFixed(1)}%)
                          </Text>
                        ) : (
                          <Text style={[styles.subjectCount, { color: theme.pink, fontWeight: 'bold' }]}>
                            Download required ({totalQs} Qs)
                          </Text>
                        )}
                      </View>

                      <View style={styles.subjectRowRight}>
                        {downloadingSubjectId === subject.id ? (
                          <ActivityIndicator size="small" color={theme.pink} />
                        ) : isSeeded ? (
                          <Pressable
                            onPress={() => {
                              if (subject.id === NEET_PG_PYQ_SUBJECT.id) {
                                setActiveSyllabusSubjectId(NEET_PG_PYQ_SUBJECT.id);
                              } else {
                                router.push({
                                  pathname: '/practice-suite',
                                  params: {
                                    subjectIds: String(subject.id),
                                    status: 'ALL',
                                    timerMode: 'STOPWATCH',
                                    timerValue: 0,
                                    limit: 10,
                                    isStandard: 'true'
                                  }
                                });
                              }
                            }}
                            style={({ pressed }) => [
                              styles.practiceButton,
                              { backgroundColor: theme.teal, opacity: pressed ? 0.8 : 1 }
                            ]}
                          >
                            <Text style={styles.practiceButtonText}>
                              {subject.id === NEET_PG_PYQ_SUBJECT.id ? 'Papers' : 'Practice'}
                            </Text>
                          </Pressable>
                        ) : (
                          <Pressable
                            onPress={() => downloadSubjectPack(subject.id, subject.name)}
                            style={({ pressed }) => [
                              styles.downloadButton,
                              { borderColor: theme.pink, opacity: pressed ? 0.8 : 1 }
                            ]}
                          >
                            <Download size={14} color={theme.pink} />
                          </Pressable>
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Syllabus Drawer Modal */}
      {activeSyllabusSubjectId !== null && (
        <SyllabusModal
          subjectId={activeSyllabusSubjectId}
          onClose={() => setActiveSyllabusSubjectId(null)}
          onProgressChange={loadDashboardData}
        />
      )}

      {/* Level-Up Celebration Overlay */}
      {pendingLevelUp !== null && (
        <LevelUpModal
          levelInfo={pendingLevelUp}
          onClose={async () => {
            await AsyncStorage.removeItem('openmedq_pending_levelup');
            setPendingLevelUp(null);
          }}
        />
      )}

      {/* Monthly Rollover Congratulations Overlay */}
      {lastMonthStats !== null && (
        <LevelResetModal
          lastMonthStats={lastMonthStats}
          onClose={async () => {
            await AsyncStorage.removeItem('openmedq_last_month_stats');
            setLastMonthStats(null);
          }}
        />
      )}

      <FSRSSettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        onSave={() => handleSync()}
      />
    </View>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 12,
  },
  brandText: {
    fontFamily: 'Plain Black, Inter, sans-serif',
    fontSize: 24,
    fontWeight: 'bold',
    letterSpacing: -0.8,
  },
  welcomeText: {
    fontSize: 13,
    marginTop: 2,
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: 6,
  },
  syncButtonText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  card: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  statBox: {
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 4,
  },
  statLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  progressBarWrapper: {
    marginTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
    paddingTop: 12,
  },
  progressBarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressBarLabel: {
    fontSize: 10,
    fontWeight: '500',
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  actionCard: {
    padding: 16,
    borderRadius: 20,
    gap: 8,
  },
  actionCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionCardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: -0.4,
  },
  actionCardDesc: {
    fontSize: 12,
    lineHeight: 16,
    opacity: 0.85,
  },
  queueStats: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  queuePill: {
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  queuePillText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0a0a0a',
  },
  sectionHeaderWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: -0.5,
  },
  subjectsList: {
    gap: 8,
  },
  subjectRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  subjectRowLeft: {
    flex: 1,
    gap: 2,
  },
  subjectName: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  subjectCount: {
    fontSize: 11,
  },
  subjectRowRight: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 70,
  },
  practiceButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  practiceButtonText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  downloadButton: {
    borderWidth: 1,
    padding: 6,
    borderRadius: 8,
  },
  // Leech Card styles
  leechCard: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    gap: 10,
  },
  leechHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  leechHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  leechCardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: -0.4,
  },
  leechCountBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  leechCountText: {
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  leechDesc: {
    fontSize: 11,
    lineHeight: 15,
  },
  leechList: {
    gap: 6,
  },
  leechItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  leechItemLeft: {
    flex: 1,
    paddingRight: 8,
    gap: 2,
  },
  leechText: {
    fontSize: 12,
    fontWeight: '500',
  },
  leechMeta: {
    fontSize: 10,
  },
  difficultyBadge: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  difficultyText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  leechCta: {
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  leechCtaText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  // Exam card
  examCard: {
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
  },
  examCardTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1.0,
  },
  examToggleContainer: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
    gap: 4,
  },
  examToggleBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  examToggleText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  // Guest Warning
  guestAlertCard: {
    padding: 16,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  guestAlertTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  guestAlertDesc: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    lineHeight: 15,
  },
  guestAlertBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  guestAlertBtnText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  // Goal Card
  goalCard: {
    padding: 16,
    borderRadius: 20,
    gap: 12,
  },
  goalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  goalSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1.0,
  },
  goalTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: 'bold',
    fontFamily: 'Plain Black, Inter, sans-serif',
    letterSpacing: -0.6,
  },
  goalProgressContainer: {
    gap: 8,
  },
  goalProgressBg: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  goalProgressFill: {
    height: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 4,
  },
  goalInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  goalProgressText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 10,
    fontWeight: '500',
  },
  adjusterControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  goalAdjustLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 10,
    fontWeight: 'bold',
    marginRight: 2,
  },
  adjustBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  adjustBtnText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  adjustValue: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
    minWidth: 24,
    textAlign: 'center',
  },
  // Resume Card styles
  resumeCard: {
    padding: 16,
    borderRadius: 20,
    gap: 10,
  },
  resumeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resumeSubtitle: {
    color: 'rgba(10, 10, 10, 0.6)',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1.0,
  },
  resumeTitle: {
    color: '#0a0a0a',
    fontSize: 20,
    fontWeight: 'bold',
    fontFamily: 'Plain Black, Inter, sans-serif',
    letterSpacing: -0.6,
    marginTop: 2,
  },
  resumeDesc: {
    color: 'rgba(10, 10, 10, 0.8)',
    fontSize: 12,
    lineHeight: 16,
  },
  resumeActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  resumeDiscardBtn: {
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resumeDiscardText: {
    color: '#0a0a0a',
    fontSize: 11,
    fontWeight: 'bold',
  },
  resumeActiveBtn: {
    backgroundColor: '#0a0a0a',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resumeActiveText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  phaseContainer: {
    marginBottom: 20,
    gap: 8,
  },
  phaseHeader: {
    marginBottom: 2,
    paddingHorizontal: 4,
  },
  phaseTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  phaseDesc: {
    fontSize: 10,
    marginTop: 1,
  },
  revCard: {
    padding: 16,
    borderRadius: 20,
    gap: 12,
  },
  revHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  revTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: -0.4,
    color: '#0a0a0a',
  },
  revSubtitle: {
    fontSize: 10,
    fontWeight: 'bold',
    opacity: 0.6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#0a0a0a',
  },
  revStatsContainer: {
    gap: 6,
  },
  revStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(10, 10, 10, 0.05)',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  revStatLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0a0a0a',
  },
  revStatVal: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0a0a0a',
  },
  revCtaBtn: {
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  revCtaText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  revSubActions: {
    flexDirection: 'row',
    gap: 8,
  },
  revSubBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(10, 10, 10, 0.15)',
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  revSubBtnText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0a0a0a',
  },
});
