import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  View, 
  Text, 
  Pressable, 
  StyleSheet, 
  ScrollView, 
  ActivityIndicator, 
  Alert,
  Modal
} from 'react-native';
import { Image } from 'expo-image';
import { FormattedText } from '@/components/FormattedText';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { triggerHaptic, triggerNotificationHaptic } from '@/lib/haptics';
import { useAuth } from '@clerk/expo';
import { SyncManager } from '@/lib/SyncManager';
import { 
  ArrowLeft, 
  Timer, 
  Bookmark, 
  ChevronLeft, 
  ChevronRight, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Eye,
  EyeOff,
  Award,
  Clock,
  Flag
} from 'lucide-react-native';
import { subjectsList } from '@openmedq/shared';
import rawTopics from '@/lib/topics.json';

import { useTheme } from '@/hooks/use-theme';
import { 
  getDB, 
  getRandomQuestionsFiltered, 
  saveProgressRecord, 
  saveReviewLog,
  type LocalQuestion
} from '@/lib/db';
import { earnDopaLocal } from '@/lib/gamification';
import { API_URL } from '@/lib/api';
import { 
  getScheduler, 
  progressToCard, 
  cardToProgressFields, 
  formatFSRSInterval 
} from '@/lib/fsrs';
import { Rating } from 'ts-fsrs';

// Helper to get current timestamp satisfying React compiler purity rule
const getTimestamp = () => new Date().getTime();

const resolveCdnUrl = (path?: string) => {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const cdnUrl = process.env.EXPO_PUBLIC_CDN_URL || 'https://pub-9cffcd4fe5774485889f8d5ce5999219.r2.dev';
  const cleanPath = path.startsWith('/') ? path.substring(1) : path;
  return `${cdnUrl}/${cleanPath}`;
};

const stripMarkdownImages = (text: string): string => {
  return text.replace(/!\[.*?\]\(.*?\)/g, '').trim();
};

const extractMarkdownImages = (text?: string): string[] => {
  if (!text) return [];
  const regex = /!\[.*?\]\((.*?)\)/g;
  const urls: string[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    urls.push(match[1]);
  }
  return urls;
};

export default function PracticeSuiteScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams();
  const { isSignedIn, getToken } = useAuth();

  // Selections
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);
  const [hideTags, setHideTags] = useState(false);
  const [markedForReview, setMarkedForReview] = useState<Record<number, boolean>>({});
  
  // Parse parameters
  const subjectIds = useMemo(() => {
    return params.subjectIds ? (params.subjectIds as string).split(',').map(Number) : [];
  }, [params.subjectIds]);

  const topicIds = useMemo(() => {
    return params.topicIds ? (params.topicIds as string).split(',').map(Number) : [];
  }, [params.topicIds]);
  const status = (params.status as any) || 'ALL';
  const timerMode = (params.timerMode as 'STOPWATCH' | 'COUNTDOWN_Q' | 'TOTAL_LIMIT') || 'STOPWATCH';
  const timerValue = Number(params.timerValue) || 0;
  const limit = Number(params.limit) || 10;
  const newCardsLimit = params.newCardsLimit ? Number(params.newCardsLimit) : undefined;
  const isMock = params.isMockTest === 'true';
  const positiveMarks = Number(params.positiveMarks) || 4;
  const negativeMarks = Number(params.negativeMarks) || 0;
  const examType = params.examType ? String(params.examType) : undefined;
  const examYear = params.examYear ? Number(params.examYear) : undefined;
  const examYears = useMemo(() => {
    return params.examYears ? (params.examYears as string).split(',').map(Number) : undefined;
  }, [params.examYears]);

  // Game states
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<LocalQuestion[]>([]);
  const [sessionQueue, setSessionQueue] = useState<number[]>([]); // Array of indices mapping to questions array
  const [currentQueueIdx, setCurrentQueueIdx] = useState(0);

  // User responses
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({}); // questionId -> chosenOption (1-4)
  const [revealedQuestions, setRevealedQuestions] = useState<Record<number, boolean>>({}); // questionId -> boolean
  const [bookmarkedIds, setBookmarkedIds] = useState<number[]>([]);

  // CBT States
  const [visitedQuestions, setVisitedQuestions] = useState<Record<number, boolean>>({}); // questionId -> boolean
  const [firstSelections, setFirstSelections] = useState<Record<number, number>>({}); // questionId -> first chosen option


  // Timer states
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [secondsTaken, setSecondsTaken] = useState<Record<number, number>>({}); // questionId -> seconds
  const timerRef = useRef<any>(null);
  const timeoutRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // Performance tracking
  const [firstAttempts, setFirstAttempts] = useState<Record<number, { selectedOption: number; isCorrect: boolean }>>({});
  const [testStatus, setTestStatus] = useState<'PRACTICING' | 'COMPLETED'>('PRACTICING');
  
  // FSRS preview intervals
  const [fsrsPreviews, setFsrsPreviews] = useState<Record<number, { card: any; intervalText: string }> | null>(null);

  const currentIdx = sessionQueue[currentQueueIdx] ?? 0;
  const activeQuestion = questions[currentIdx];

  // Load questions and bookmarks
  useEffect(() => {
    async function initSuite() {
      try {
        setLoading(true);
        const sqlite = await getDB();

        // Check if we are resuming a saved session
        const isResume = params.resume === 'true';
        if (isResume) {
          const savedStr = await AsyncStorage.getItem('openmedq_active_practice_session');
          if (savedStr) {
            const saved = JSON.parse(savedStr);
            setQuestions(saved.questions || []);
            setSessionQueue(saved.sessionQueue || []);
            setCurrentQueueIdx(saved.currentQueueIdx || 0);
            setSelectedAnswers(saved.selectedAnswers || {});
            setRevealedQuestions(saved.revealedQuestions || {});
            setBookmarkedIds(saved.bookmarkedIds || []);
            setVisitedQuestions(saved.visitedQuestions || {});
            setFirstSelections(saved.firstSelections || {});
            setSecondsRemaining(saved.secondsRemaining || 0);
            setSecondsTaken(saved.secondsTaken || {});
            setFirstAttempts(saved.firstAttempts || {});
            setTestStatus(saved.testStatus || 'PRACTICING');
            setMarkedForReview(saved.markedForReview || {});
            setHideTags(saved.hideTags || false);
            setLoading(false);
            return;
          }
        }
        
        // Fetch matching questions
        let filteredQs = await getRandomQuestionsFiltered({
          subjectIds,
          topicIds,
          status,
          limit,
          newCardsLimit,
          examType,
          examYear,
          examYears,
        });

        // Dynamic online fetch for PYQ Year packs if local questions are 0 and params specify examType/examYears
        if (filteredQs.length === 0 && examType && (examYears || examYear)) {
          try {
            const cdnUrl = process.env.EXPO_PUBLIC_CDN_URL || 'https://pub-9cffcd4fe5774485889f8d5ce5999219.r2.dev';
            const yearsToFetch = examYears && examYears.length > 0
              ? examYears
              : (examYear ? [examYear] : []);

            for (const year of yearsToFetch) {
              const response = await fetch(`${cdnUrl}/packs/neet_pg_${year}.json`);
              if (response.ok) {
                const rawQuestions = await response.json();
                if (Array.isArray(rawQuestions) && rawQuestions.length > 0) {
                  // Map correctOption to 1-indexed locally for mobile app compatibility
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
                }
              }
            }

            // Re-query local database after dynamic seeding
            filteredQs = await getRandomQuestionsFiltered({
              subjectIds,
              topicIds,
              status,
              limit,
              newCardsLimit,
              examType,
              examYear,
              examYears,
            });
          } catch (err) {
            console.warn('Failed to seed exam years:', err);
          }
        }

        // Online fallback fetch: if we are signed in and have fewer than limit questions, try fetching from backend custom-practice
        if (filteredQs.length < limit && isSignedIn) {
          try {
            const token = await getToken();
            if (token) {
              const response = await fetch(`${API_URL}/api/questions/custom-practice`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                  subjectIds,
                  topicIds,
                  status,
                  limit,
                  newCardsLimit,
                })
              });
              if (response.ok) {
                const data = await response.json();
                if (data.success && data.questions && data.questions.length > 0) {
                  const onlineQs = data.questions;
                  
                  // Cache these questions in SQLite questions table
                  await sqlite.withTransactionAsync(async () => {
                    for (const q of onlineQs) {
                      const correctOpt = typeof q.correctOption === 'number' && q.correctOption >= 0 && q.correctOption <= 3
                        ? q.correctOption + 1
                        : q.correctOption;

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
                          correctOpt,
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

                  // Re-run the local filter query to get the newly inserted questions sorted/shuffled properly
                  filteredQs = await getRandomQuestionsFiltered({
                    subjectIds,
                    topicIds,
                    status,
                    limit,
                    newCardsLimit
                  });
                }
              }
            }
          } catch (err) {
            console.warn("Failed to fetch custom practice questions from backend, falling back to local database.");
          }
        }

        setQuestions(filteredQs);
        setSessionQueue(filteredQs.map((_, i) => i));

        // Fetch user bookmarks from SQLite
        const bookmarkRows = await sqlite.getAllAsync<{ questionId: number }>(
          "SELECT questionId FROM progress WHERE status = 'BOOKMARKED' AND isDeleted = 0"
        );
        setBookmarkedIds(bookmarkRows.map(r => r.questionId));

        // Setup timer
        if (timerMode === 'COUNTDOWN_Q') {
          setSecondsRemaining(timerValue);
        } else if (timerMode === 'TOTAL_LIMIT') {
          setSecondsRemaining(timerValue * 60);
        }

        // Initialize seconds taken
        const initialSeconds: Record<number, number> = {};
        filteredQs.forEach(q => {
          initialSeconds[q.id] = 0;
        });
        setSecondsTaken(initialSeconds);
      } catch (err) {
        console.warn('Practice initial setup failed.');
      } finally {
        setLoading(false);
      }
    }
    initSuite();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Caching the active session state to AsyncStorage
  useEffect(() => {
    if (loading) return;

    const saveSession = async () => {
      try {
        if (testStatus === 'COMPLETED') {
          await AsyncStorage.removeItem('openmedq_active_practice_session');
        } else {
          const sessionState = {
            questions,
            sessionQueue,
            currentQueueIdx,
            firstAttempts,
            selectedAnswers,
            revealedQuestions,
            secondsTaken,
            secondsRemaining,
            bookmarkedIds,
            visitedQuestions,
            firstSelections,
            testStatus,
            markedForReview,
            hideTags,
            config: {
              subjectIds,
              topicIds,
              status,
              timerMode,
              timerValue,
              limit,
              newCardsLimit,
              isMockTest: isMock,
              positiveMarks,
              negativeMarks,
            }
          };
          await AsyncStorage.setItem('openmedq_active_practice_session', JSON.stringify(sessionState));
        }
      } catch (err) {
        console.warn('Failed to serialize active practice session.');
      }
    };

    saveSession();
  }, [
    loading,
    testStatus,
    questions,
    sessionQueue,
    currentQueueIdx,
    firstAttempts,
    selectedAnswers,
    revealedQuestions,
    secondsTaken,
    secondsRemaining,
    bookmarkedIds,
    visitedQuestions,
    firstSelections,
    subjectIds,
    topicIds,
    status,
    timerMode,
    timerValue,
    limit,
    newCardsLimit,
    isMock,
    positiveMarks,
    negativeMarks,
    markedForReview,
    hideTags
  ]);

  // Update FSRS previews when question is answered in Spaced Repetition mode
  useEffect(() => {
    if (status !== 'SPACED_REPETITION' || !activeQuestion) {
      Promise.resolve().then(() => {
        if (fsrsPreviews !== null) {
          setFsrsPreviews(null);
        }
      });
      return;
    }

    async function loadFsrsPreview() {
      try {
        const sqlite = await getDB();
        const row = await sqlite.getFirstAsync<any>(
          'SELECT * FROM progress WHERE questionId = ?',
          [activeQuestion.id]
        );
        const card = progressToCard(row);
        const now = new Date();
        const scheduler = await getScheduler();
        const preview = scheduler.repeat(card, now) as any;
        
        const previewsObj: Record<number, { card: any; intervalText: string }> = {};
        const ratingKeys = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];
        ratingKeys.forEach(r => {
          previewsObj[r] = {
            card: preview[r].card,
            intervalText: formatFSRSInterval(preview[r].card.due, now),
          };
        });
        setFsrsPreviews(previewsObj);
      } catch (err) {
        console.warn('FSRS preview calculation failed.');
        Promise.resolve().then(() => {
          if (fsrsPreviews !== null) {
            setFsrsPreviews(null);
          }
        });
      }
    }

    if (revealedQuestions[activeQuestion.id]) {
      loadFsrsPreview();
    } else {
      Promise.resolve().then(() => {
        if (fsrsPreviews !== null) {
          setFsrsPreviews(null);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQueueIdx, revealedQuestions, activeQuestion, status]);

  // Track visited questions
  useEffect(() => {
    if (activeQuestion) {
      Promise.resolve().then(() => {
        setVisitedQuestions(prev => {
          if (prev[activeQuestion.id]) return prev;
          return { ...prev, [activeQuestion.id]: true };
        });
      });
    }
  }, [activeQuestion]);

  const finishTest = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    
    const isTestMode = isMock || (timerMode !== 'STOPWATCH' && status !== 'SPACED_REPETITION');
    
    if (isTestMode) {
      let mockDopaEarned = 0;
      
      for (const q of questions) {
        const userChoice = selectedAnswers[q.id];
        if (userChoice !== undefined && userChoice !== -1) {
          const isCorrect = userChoice === q.correctOption;
          mockDopaEarned += isCorrect ? 10 : 2;
          
          try {
            const sqlite = await getDB();
            const row = await sqlite.getFirstAsync<any>(
              'SELECT * FROM progress WHERE questionId = ?',
              [q.id]
            );
            const card = progressToCard(row);
            const priorState = card.state;
            const now = new Date();
            const scheduler = await getScheduler();

            const rating = isCorrect ? Rating.Good : Rating.Again;
            const { card: updatedCard } = scheduler.next(card, now, rating as any);
            const fsrsFields = cardToProgressFields(updatedCard);

            await saveProgressRecord({
              questionId: q.id,
              status: isCorrect ? 'CORRECT' : 'INCORRECT',
              timeTaken: secondsTaken[q.id] || 0,
              answeredAt: now.getTime(),
              ...fsrsFields,
              updatedAt: getTimestamp(),
              isDeleted: false,
            });

            await saveReviewLog({
              questionId: q.id,
              rating,
              state: priorState,
              reviewTime: now.getTime(),
              timeTaken: secondsTaken[q.id] || 0,
              stability: updatedCard.stability,
              difficulty: updatedCard.difficulty,
            });
          } catch (err) {
            console.error('Failed to log test progress.');
          }
        }
      }
      
      if (mockDopaEarned > 0) {
        await earnDopaLocal(mockDopaEarned + 50, 'Mock Test Performance');
      }
    } else {
      await earnDopaLocal(50, 'Practice Session Completion Bonus');
    }

    setTestStatus('COMPLETED');

    if (isSignedIn) {
      SyncManager.syncWithD1(getToken, undefined, undefined, true).catch(err => {
        console.warn('Sync on test finish failed.');
      });
    }
  };

  const handleFSRSRate = async (rating: Rating) => {
    if (!activeQuestion) return;

    triggerHaptic(Haptics.ImpactFeedbackStyle.Light);

    try {
      const isRecallSuccess = rating === Rating.Hard || rating === Rating.Good || rating === Rating.Easy;
      const amount = isRecallSuccess ? 15 : 3;
      await earnDopaLocal(amount, isRecallSuccess ? 'FSRS Recall Review' : 'FSRS Recall Re-study');

      const sqlite = await getDB();
      const row = await sqlite.getFirstAsync<any>(
        'SELECT * FROM progress WHERE questionId = ?',
        [activeQuestion.id]
      );
      const card = progressToCard(row);
      const priorState = card.state;
      const now = new Date();

      let updatedCard: any;
      if (fsrsPreviews && fsrsPreviews[rating]) {
        updatedCard = fsrsPreviews[rating].card;
      } else {
        const scheduler = await getScheduler();
        const res = scheduler.next(card, now, rating as any);
        updatedCard = res.card;
      }

      const fsrsFields = cardToProgressFields(updatedCard);
      const firstAttempt = firstAttempts[activeQuestion.id];
      const isCorrect = firstAttempt ? firstAttempt.isCorrect : (selectedAnswers[activeQuestion.id] === activeQuestion.correctOption);
      const finalStatus = isCorrect ? 'CORRECT' : 'INCORRECT';

      await saveProgressRecord({
        questionId: activeQuestion.id,
        status: finalStatus,
        timeTaken: secondsTaken[activeQuestion.id] || 0,
        answeredAt: now.getTime(),
        ...fsrsFields,
        updatedAt: getTimestamp(),
        isDeleted: false,
      });

      await saveReviewLog({
        questionId: activeQuestion.id,
        rating,
        state: priorState,
        reviewTime: now.getTime(),
        timeTaken: secondsTaken[activeQuestion.id] || 0,
        stability: updatedCard.stability,
        difficulty: updatedCard.difficulty,
      });

      if (rating === Rating.Again) {
        // Re-queue card for same-day learning loop (inject 4 slots later)
        const activeQIdx = sessionQueue[currentQueueIdx];
        const stepOffset = 4;
        const insertPos = Math.min(sessionQueue.length, currentQueueIdx + stepOffset);

        const nextQueue = [...sessionQueue];
        nextQueue.splice(insertPos, 0, activeQIdx);
        setSessionQueue(nextQueue);

        setRevealedQuestions(prev => ({ ...prev, [activeQuestion.id]: false }));
        setSelectedAnswers(prev => {
          const copy = { ...prev };
          delete copy[activeQuestion.id];
          return copy;
        });

        setCurrentQueueIdx(c => c + 1);
        if (timerMode === 'COUNTDOWN_Q') {
          setSecondsRemaining(timerValue);
        }
      } else {
        // Normal card advancement
        if (currentQueueIdx < sessionQueue.length - 1) {
          setCurrentQueueIdx(currentQueueIdx + 1);
          if (timerMode === 'COUNTDOWN_Q') {
            setSecondsRemaining(timerValue);
          }
        } else {
          finishTest();
        }
      }
    } catch (err) {
      console.warn("Failed to rate card.");
    }
  };

  const handleQuestionTimeOut = () => {
    setSelectedAnswers(prev => {
      if (prev[activeQuestion.id] !== undefined) return prev;
      return { ...prev, [activeQuestion.id]: -1 }; // -1 stands for timed out
    });
    setRevealedQuestions(prev => ({ ...prev, [activeQuestion.id]: true }));

    if (status === 'SPACED_REPETITION') {
      handleFSRSRate(Rating.Again);
      return;
    }

    // Auto advance after short delay
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (currentQueueIdx < sessionQueue.length - 1) {
        setCurrentQueueIdx(c => c + 1);
        setSecondsRemaining(timerValue);
      } else {
        finishTest();
      }
    }, 1500);
  };

  const handleTestTimeOut = () => {
    Alert.alert('Time Up', 'Total test duration limit reached! Submitting scorecard.');
    finishTest();
  };

  const handleOptionSelect = async (optionIndex: number) => {
    const qId = activeQuestion.id;
    const previousSelection = selectedAnswers[qId];

    if (!isMock && previousSelection !== undefined) return; // locked after selection

    // Track first selection for answer-switching metrics
    if (firstSelections[qId] === undefined) {
      setFirstSelections(prev => ({
        ...prev,
        [qId]: optionIndex
      }));
    }

    setSelectedAnswers(prev => ({
      ...prev,
      [qId]: optionIndex
    }));

    if (isMock) {
      triggerHaptic(Haptics.ImpactFeedbackStyle.Light);
      return;
    }

    const isStudyMode = timerMode === 'STOPWATCH' || status === 'SPACED_REPETITION';
    const isFSRSMode = status === 'SPACED_REPETITION';
    const isCorrect = optionIndex === activeQuestion.correctOption;

    if (isCorrect) {
      triggerNotificationHaptic(Haptics.NotificationFeedbackType.Success);
    } else {
      triggerNotificationHaptic(Haptics.NotificationFeedbackType.Error);
    }
    const isFirstAttempt = firstAttempts[qId] === undefined;

    if (isFirstAttempt) {
      setFirstAttempts(prev => ({
        ...prev,
        [qId]: { selectedOption: optionIndex, isCorrect }
      }));

      if (!isFSRSMode) {
        const amount = isCorrect ? 10 : 2;
        await earnDopaLocal(amount, isCorrect ? 'Correct MCQ' : 'Attempted MCQ');
      }
    }

    if (isStudyMode) {
      setRevealedQuestions(prev => ({ ...prev, [qId]: true }));
      
      if (!isFSRSMode) {
        try {
          const sqlite = await getDB();
          const row = await sqlite.getFirstAsync<any>(
            'SELECT * FROM progress WHERE questionId = ?',
            [qId]
          );
          const card = progressToCard(row);
          const priorState = card.state;
          const now = new Date();
          const scheduler = await getScheduler();

          const rating = isCorrect ? Rating.Good : Rating.Again;
          const { card: updatedCard } = scheduler.next(card, now, rating as any);
          const fsrsFields = cardToProgressFields(updatedCard);

          await saveProgressRecord({
            questionId: qId,
            status: isCorrect ? 'CORRECT' : 'INCORRECT',
            timeTaken: secondsTaken[qId] || 0,
            answeredAt: now.getTime(),
            ...fsrsFields,
            updatedAt: getTimestamp(),
            isDeleted: false,
          });

          await saveReviewLog({
            questionId: qId,
            rating,
            state: priorState,
            reviewTime: now.getTime(),
            timeTaken: secondsTaken[qId] || 0,
            stability: updatedCard.stability,
            difficulty: updatedCard.difficulty,
          });
        } catch (err) {
          console.error('Failed to log progress:', err);
        }
      }
    }
  };

  const prevQuestion = () => {
    if (currentQueueIdx > 0) {
      setCurrentQueueIdx(currentQueueIdx - 1);
      if (timerMode === 'COUNTDOWN_Q') {
        setSecondsRemaining(timerValue);
      }
    }
  };

  const nextQuestion = () => {
    if (currentQueueIdx < sessionQueue.length - 1) {
      setCurrentQueueIdx(currentQueueIdx + 1);
      if (timerMode === 'COUNTDOWN_Q') {
        setSecondsRemaining(timerValue);
      }
    }
  };

  const handleBookmarkToggle = async (questionId: number) => {
    let updated;
    const isBookmarked = bookmarkedIds.includes(questionId);
    const sqlite = await getDB();
    
    if (isBookmarked) {
      updated = bookmarkedIds.filter(id => id !== questionId);
      const existing = await sqlite.getFirstAsync<any>(
        'SELECT * FROM progress WHERE questionId = ?',
        [questionId]
      );
      if (existing) {
        if (existing.status === 'BOOKMARKED') {
          const prevStatus = existing.previousStatus;
          if (prevStatus) {
            await saveProgressRecord({
              ...existing,
              status: prevStatus,
              updatedAt: getTimestamp(),
              isDeleted: false,
            });
          } else {
            // Revert or delete
            await sqlite.runAsync(
              `UPDATE progress SET isDeleted = 1, updatedAt = ? WHERE questionId = ?`,
              [getTimestamp(), questionId]
            );
          }
        }
      }
    } else {
      updated = [...bookmarkedIds, questionId];
      const existing = await sqlite.getFirstAsync<any>(
        'SELECT * FROM progress WHERE questionId = ?',
        [questionId]
      );
      
      await saveProgressRecord({
        questionId,
        status: 'BOOKMARKED',
        answeredAt: getTimestamp(),
        updatedAt: getTimestamp(),
        isDeleted: false,
        previousStatus: existing ? existing.status : undefined,
        ...(existing ? {
          due: existing.due,
          stability: existing.stability,
          difficulty: existing.difficulty,
          elapsedDays: existing.elapsedDays,
          scheduledDays: existing.scheduledDays,
          reps: existing.reps,
          lapses: existing.lapses,
          state: existing.state,
          lastReview: existing.lastReview,
        } : {})
      });
    }
    setBookmarkedIds(updated);
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins}:${remainingSecs < 10 ? '0' : ''}${remainingSecs}`;
  };

  // Main Timer Interval Loop
  useEffect(() => {
    if (loading || testStatus === 'COMPLETED' || questions.length === 0 || !activeQuestion) return;

    timerRef.current = setInterval(() => {
      // Log time on current question
      setSecondsTaken(prev => ({
        ...prev,
        [activeQuestion.id]: (prev[activeQuestion.id] || 0) + 1,
      }));

      // Countdown timer logic
      if (timerMode === 'COUNTDOWN_Q' || timerMode === 'TOTAL_LIMIT') {
        setSecondsRemaining(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            if (timerMode === 'COUNTDOWN_Q') {
              handleQuestionTimeOut();
            } else {
              handleTestTimeOut();
            }
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, testStatus, currentQueueIdx, questions, activeQuestion]);

  // Exit practice with warning
  const handleExitPress = () => {
    if (testStatus === 'COMPLETED') {
      if (isSignedIn) {
        SyncManager.syncWithD1(getToken, undefined, undefined, true).catch(err => {
          console.warn('Sync on exit completed test failed:', err);
        });
      }
      router.back();
      return;
    }

    Alert.alert(
      'Exit Practice',
      'Are you sure you want to exit? Your progress for completed questions will be saved locally.',
      [
        { text: 'Exit and Submit', onPress: () => finishTest() },
        { 
          text: 'Exit Without Saving', 
          onPress: async () => {
            try {
              await AsyncStorage.removeItem('openmedq_active_practice_session');
            } catch (e) {
              console.warn(e);
            }
            if (isSignedIn) {
              SyncManager.syncWithD1(getToken, undefined, undefined, true).catch(err => {
                console.warn('Sync on exit without saving failed:', err);
              });
            }
            router.back();
          }, 
          style: 'destructive' 
        },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.pink} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Shuffling questions...</Text>
      </View>
    );
  }

  if (questions.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: theme.background }]}>
        <AlertTriangle size={32} color={theme.pink} />
        <Text style={[styles.emptyTitle, { color: theme.text }]}>No questions found</Text>
        <Pressable 
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.doneButton,
            { backgroundColor: theme.pink, opacity: pressed ? 0.8 : 1, marginTop: 12 }
          ]}
        >
          <Text style={styles.doneButtonText}>Exit</Text>
        </Pressable>
      </View>
    );
  }

  // --- SCORECARD COMPLETED VIEW ---
  if (testStatus === 'COMPLETED') {
    const totalQuestions = questions.length;
    const answeredCount = Object.keys(selectedAnswers).filter(id => selectedAnswers[Number(id)] !== undefined && selectedAnswers[Number(id)] !== -1).length;
    
    let correctCount = 0;
    let incorrectCount = 0;
    questions.forEach(q => {
      const choice = selectedAnswers[q.id];
      if (choice !== undefined && choice !== -1) {
        if (choice === q.correctOption) {
          correctCount++;
        } else {
          incorrectCount++;
        }
      }
    });
    
    const accuracy = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;

    // Advanced Mock Exam Metrics
    const obtainedScore = (correctCount * positiveMarks) - (incorrectCount * negativeMarks);
    const maxPossibleScore = totalQuestions * positiveMarks;

    let totalTimeTaken = 0;
    let correctTimeTaken = 0;
    let incorrectTimeTaken = 0;
    questions.forEach(q => {
      const t = secondsTaken[q.id] || 0;
      totalTimeTaken += t;
      const choice = selectedAnswers[q.id];
      if (choice !== undefined && choice !== -1) {
        if (choice === q.correctOption) {
          correctTimeTaken += t;
        } else {
          incorrectTimeTaken += t;
        }
      }
    });

    const avgCorrectTime = correctCount > 0 ? Math.round(correctTimeTaken / correctCount) : 0;
    const avgIncorrectTime = incorrectCount > 0 ? Math.round(incorrectTimeTaken / incorrectCount) : 0;
    const wastedTime = incorrectTimeTaken; // Time spent on incorrect answers

    let flaggedAnswered = 0;
    let flaggedCorrect = 0;
    questions.forEach(q => {
      if (markedForReview[q.id]) {
        const choice = selectedAnswers[q.id];
        if (choice !== undefined && choice !== -1) {
          flaggedAnswered++;
          if (choice === q.correctOption) {
            flaggedCorrect++;
          }
        }
      }
    });
    const flaggedSuccessRate = flaggedAnswered > 0 ? Math.round((flaggedCorrect / flaggedAnswered) * 100) : 0;

    let switchedToCorrect = 0;
    let switchedToIncorrect = 0;
    let switchedToIncorrectIncorrect = 0;
    let totalSwitched = 0;
    questions.forEach(q => {
      const first = firstSelections[q.id];
      const final = selectedAnswers[q.id];
      if (first !== undefined && final !== undefined && first !== -1 && final !== -1 && first !== final) {
        totalSwitched++;
        const firstWasCorrect = first === q.correctOption;
        const finalIsCorrect = final === q.correctOption;
        if (!firstWasCorrect && finalIsCorrect) {
          switchedToCorrect++;
        } else if (firstWasCorrect && !finalIsCorrect) {
          switchedToIncorrect++;
        } else {
          switchedToIncorrectIncorrect++;
        }
      }
    });

    // Performance matrix data (grouped by subject-topic)
    const matrixData = (() => {
      const map = new Map<string, {
        subjectId: number;
        topicId: number;
        total: number;
        correct: number;
        incorrect: number;
        skipped: number;
        timeSum: number;
      }>();

      questions.forEach(q => {
        const userChoice = selectedAnswers[q.id];
        const isCorrectQ = userChoice === q.correctOption;
        const isSkippedQ = userChoice === undefined || userChoice === -1;
        const timeSpent = secondsTaken[q.id] || 0;

        const key = `${q.subjectId}-${q.topicId}`;
        if (!map.has(key)) {
          map.set(key, {
            subjectId: q.subjectId,
            topicId: q.topicId,
            total: 0,
            correct: 0,
            incorrect: 0,
            skipped: 0,
            timeSum: 0
          });
        }

        const stats = map.get(key)!;
        stats.total++;
        stats.timeSum += timeSpent;
        if (isSkippedQ) {
          stats.skipped++;
        } else if (isCorrectQ) {
          stats.correct++;
        } else {
          stats.incorrect++;
        }
      });

      return Array.from(map.values()).map(item => {
        const sName = subjectsList.find(s => s.id === item.subjectId)?.name || 'Subject';
        const tName = (rawTopics as { id: number; name: string; subjectId: number }[]).find(t => t.id === item.topicId)?.name || 'General';
        const acc = item.correct + item.incorrect > 0
          ? Math.round((item.correct / (item.correct + item.incorrect)) * 100)
          : 0;
        const avgTime = Math.round(item.timeSum / item.total);

        return { ...item, subjectName: sName, topicName: tName, accuracy: acc, avgTime };
      });
    })();

    const avgTimePerQ = totalQuestions > 0 ? Math.round(totalTimeTaken / totalQuestions) : 0;

    return (
      <View style={[styles.container, { backgroundColor: theme.background, paddingTop: Math.max(insets.top, 16) }]}>
        <View style={styles.scorecardHeader}>
          <Text style={[styles.scorecardTitle, { color: theme.text }]}>
            {isMock ? 'Mock Exam Scorecard' : 'Scorecard'}
          </Text>
          <Pressable 
            onPress={() => {
              if (isSignedIn) {
                SyncManager.syncWithD1(getToken, undefined, undefined, true).catch(err => {
                  console.warn('Sync on scorecard exit failed:', err);
                });
              }
              router.replace('/');
            }}
            style={({ pressed }) => [
              styles.doneButton,
              { backgroundColor: theme.pink, opacity: pressed ? 0.8 : 1 }
            ]}
          >
            <Text style={styles.doneButtonText}>Exit</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scorecardContent} showsVerticalScrollIndicator={false}>
          {isMock ? (
            <>
              {/* Mock Exam Summary Card */}
              <View style={[styles.mockScoreSection, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
                <Text style={[styles.mockScoreTitle, { color: theme.textSecondary }]}>OBTAINED SCORE</Text>
                <View style={styles.obtainedScoreBox}>
                  <Text style={[styles.obtainedScoreVal, { color: theme.success }]}>{obtainedScore}</Text>
                  <Text style={[styles.obtainedScoreMax, { color: theme.textSecondary }]}>/ {maxPossibleScore}</Text>
                </View>
                <Text style={[styles.mockScoreSub, { color: theme.textSecondary }]}>
                  {correctCount} Correct (+{correctCount * positiveMarks}) • {incorrectCount} Incorrect (-{incorrectCount * negativeMarks})
                </Text>
              </View>

              {/* Bento Grid with Advanced Analytics */}
              <View style={styles.scoreGrid}>
                <View style={[styles.scoreItem, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
                  <Text style={[styles.scoreVal, { color: theme.text }]}>{totalQuestions}</Text>
                  <Text style={[styles.scoreLabel, { color: theme.textSecondary }]}>Total Qs</Text>
                </View>

                <View style={[styles.scoreItem, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
                  <Text style={[styles.scoreVal, { color: theme.text }]}>{answeredCount}</Text>
                  <Text style={[styles.scoreLabel, { color: theme.textSecondary }]}>Solved</Text>
                </View>

                <View style={[styles.scoreItem, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
                  <Text style={[styles.scoreVal, { color: theme.pink }]}>{accuracy}%</Text>
                  <Text style={[styles.scoreLabel, { color: theme.textSecondary }]}>Accuracy</Text>
                </View>

                <View style={[styles.scoreItem, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
                  <Text style={[styles.scoreVal, { color: theme.text }]}>{formatTime(totalTimeTaken)}</Text>
                  <Text style={[styles.scoreLabel, { color: theme.textSecondary }]}>Total Time</Text>
                </View>
              </View>

              {/* Pacing Analysis */}
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Pacing & Time Analysis</Text>
              <View style={[styles.mockScoreSection, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline, gap: 12 }]}>
                <View style={styles.metricsRow}>
                  <Text style={[styles.metricLabel, { color: theme.text }]}>Avg Time (Correct Qs)</Text>
                  <Text style={[styles.metricValue, { color: theme.success }]}>{avgCorrectTime}s</Text>
                </View>
                <View style={styles.metricsRow}>
                  <Text style={[styles.metricLabel, { color: theme.text }]}>Avg Time (Incorrect Qs)</Text>
                  <Text style={[styles.metricValue, { color: theme.error }]}>{avgIncorrectTime}s</Text>
                </View>
                <View style={styles.metricsRow}>
                  <Text style={[styles.metricLabel, { color: theme.text }]}>Wasted Time (On Wrong Qs)</Text>
                  <Text style={[styles.metricValue, { color: theme.error }]}>{formatTime(wastedTime)}</Text>
                </View>
              </View>

              {/* Revision & Flagged Success */}
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Marked for Review & Answer Switching</Text>
              <View style={[styles.mockScoreSection, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline, gap: 12 }]}>
                <View style={styles.metricsRow}>
                  <Text style={[styles.metricLabel, { color: theme.text }]}>Review Success Rate</Text>
                  <Text style={[styles.metricValue, { color: theme.lavender }]}>
                    {flaggedSuccessRate}% ({flaggedCorrect}/{flaggedAnswered})
                  </Text>
                </View>
                <View style={styles.metricsRow}>
                  <Text style={[styles.metricLabel, { color: theme.text }]}>Total Switched Answers</Text>
                  <Text style={[styles.metricValue, { color: theme.text }]}>{totalSwitched}</Text>
                </View>
                <View style={styles.metricsRow}>
                  <Text style={[styles.metricLabel, { color: theme.text }]}>Incorrect to Correct Gains</Text>
                  <Text style={[styles.metricValue, { color: theme.success }]}>+{switchedToCorrect}</Text>
                </View>
                <View style={styles.metricsRow}>
                  <Text style={[styles.metricLabel, { color: theme.text }]}>Correct to Incorrect Losses</Text>
                  <Text style={[styles.metricValue, { color: theme.error }]}>-{switchedToIncorrect}</Text>
                </View>
                <View style={styles.metricsRow}>
                  <Text style={[styles.metricLabel, { color: theme.text }]}>Incorrect to Incorrect Revisions</Text>
                  <Text style={[styles.metricValue, { color: theme.textSecondary }]}>{switchedToIncorrectIncorrect}</Text>
                </View>
                <View style={styles.metricsRow}>
                  <Text style={[styles.metricLabel, { color: theme.text, fontWeight: 'bold' }]}>Net Marks Gain/Loss</Text>
                  <Text style={[styles.metricValue, { color: ((switchedToCorrect * positiveMarks) - (switchedToIncorrect * negativeMarks)) >= 0 ? theme.success : theme.error, fontWeight: 'bold' }]}>
                    {(switchedToCorrect * positiveMarks) - (switchedToIncorrect * negativeMarks)} Marks
                  </Text>
                </View>
              </View>

              {/* Subject & Topic Performance Matrix */}
              {matrixData.length > 0 && (
                <>
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>Subject & Topic Performance</Text>
                  <View style={{ gap: 8 }}>
                    {matrixData.map((row) => {
                      const accColor = row.accuracy >= 70 ? theme.success : row.accuracy >= 45 ? theme.peach : theme.error;
                      return (
                        <View key={`${row.subjectId}-${row.topicId}`} style={[styles.matrixCard, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
                          <View style={{ marginBottom: 8 }}>
                            <Text style={{ fontSize: 13, fontWeight: 'bold', color: theme.text }}>{row.subjectName}</Text>
                            <Text style={{ fontSize: 10, color: theme.textSecondary, marginTop: 1 }}>{row.topicName}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <View style={{ alignItems: 'center' }}>
                              <Text style={{ fontSize: 14, fontWeight: 'bold', color: theme.text }}>{row.total - row.skipped}/{row.total}</Text>
                              <Text style={{ fontSize: 9, color: theme.textSecondary, fontWeight: '600' }}>ATTEMPTED</Text>
                            </View>
                            <View style={{ alignItems: 'center' }}>
                              <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
                                <Text style={{ fontSize: 14, fontWeight: 'bold', color: theme.success }}>{row.correct}</Text>
                                <Text style={{ fontSize: 10, color: theme.textSecondary }}>·</Text>
                                <Text style={{ fontSize: 14, fontWeight: 'bold', color: theme.error }}>{row.incorrect}</Text>
                              </View>
                              <Text style={{ fontSize: 9, color: theme.textSecondary, fontWeight: '600' }}>C · W</Text>
                            </View>
                            <View style={{ alignItems: 'center' }}>
                              <Text style={{ fontSize: 14, fontWeight: 'bold', color: accColor }}>{row.accuracy}%</Text>
                              <Text style={{ fontSize: 9, color: theme.textSecondary, fontWeight: '600' }}>ACCURACY</Text>
                            </View>
                            <View style={{ alignItems: 'center' }}>
                              <Text style={{ fontSize: 14, fontWeight: 'bold', color: theme.textSecondary }}>{row.avgTime}s</Text>
                              <Text style={{ fontSize: 9, color: theme.textSecondary, fontWeight: '600' }}>AVG SPEED</Text>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </>
              )}
            </>
          ) : (
            <View style={styles.scoreGrid}>
              <View style={[styles.scoreItem, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
                <Text style={[styles.scoreVal, { color: theme.text }]}>{totalQuestions}</Text>
                <Text style={[styles.scoreLabel, { color: theme.textSecondary }]}>Total Qs</Text>
              </View>

              <View style={[styles.scoreItem, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
                <Text style={[styles.scoreVal, { color: theme.success }]}>{correctCount}</Text>
                <Text style={[styles.scoreLabel, { color: theme.textSecondary }]}>Correct</Text>
              </View>

              <View style={[styles.scoreItem, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
                <Text style={[styles.scoreVal, { color: theme.pink }]}>{accuracy}%</Text>
                <Text style={[styles.scoreLabel, { color: theme.textSecondary }]}>Accuracy</Text>
              </View>

              <View style={[styles.scoreItem, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
                <Text style={[styles.scoreVal, { color: theme.text }]}>{formatTime(totalTimeTaken)}</Text>
                <Text style={[styles.scoreLabel, { color: theme.textSecondary }]}>Total Time</Text>
              </View>

              <View style={[styles.scoreItem, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
                <Text style={[styles.scoreVal, { color: theme.text }]}>{avgTimePerQ}s</Text>
                <Text style={[styles.scoreLabel, { color: theme.textSecondary }]}>Avg / Q</Text>
              </View>

              <View style={[styles.scoreItem, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
                <Text style={[styles.scoreVal, { color: theme.text }]}>{answeredCount}</Text>
                <Text style={[styles.scoreLabel, { color: theme.textSecondary }]}>Solved</Text>
              </View>
            </View>
          )}

          {/* Question breakdown list - Enhanced with tags, explanation, options */}
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Question Review</Text>
          <View style={styles.reviewList}>
            {questions.map((q, idx) => {
              const userChoice = selectedAnswers[q.id];
              const isCorrect = userChoice === q.correctOption;
              const isUnattempted = userChoice === undefined || userChoice === -1;

              const qSubjectName = subjectsList.find(s => s.id === q.subjectId)?.name || 'Subject';
              const qTopicName = (rawTopics as { id: number; name: string; subjectId: number }[]).find(t => t.id === q.topicId)?.name;
              const qTimeTaken = secondsTaken[q.id] || 0;

              return (
                <View 
                  key={q.id} 
                  style={[
                    styles.reviewRow, 
                    { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }
                  ]}
                >
                  {/* Header with Q number, status, tags */}
                  <View style={styles.reviewRowHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.reviewNumber, { color: theme.pink }]}>Q{idx + 1}</Text>
                      {isUnattempted ? (
                        <Text style={{ color: theme.textSecondary, fontSize: 10, fontWeight: 'bold' }}>Skipped</Text>
                      ) : isCorrect ? (
                        <CheckCircle size={14} color={theme.success} />
                      ) : (
                        <XCircle size={14} color={theme.error} />
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Clock size={10} color={theme.textSecondary} />
                      <Text style={{ fontSize: 10, color: theme.textSecondary, fontWeight: '600' }}>{qTimeTaken}s</Text>
                    </View>
                  </View>

                  {/* Tags */}
                  {!hideTags && (
                    <View style={[styles.tagRow, { marginBottom: 6 }]}>
                      <View style={[styles.tagPill, { backgroundColor: theme.lavender + '30', borderColor: theme.lavender + '60' }]}>
                        <Text style={[styles.tagText, { color: theme.text }]}>{qSubjectName}</Text>
                      </View>
                      {qTopicName && (
                        <View style={[styles.tagPill, { backgroundColor: theme.mint + '30', borderColor: theme.mint + '60' }]}>
                          <Text style={[styles.tagText, { color: theme.text }]}>{qTopicName}</Text>
                        </View>
                      )}
                      {(q.examType || q.examYear) && (
                        <View style={[styles.tagPill, { backgroundColor: theme.peach + '30', borderColor: theme.peach + '60' }]}>
                          <Text style={[styles.tagText, { color: theme.text }]}>{[q.examType, q.examYear].filter(Boolean).join(' ')}</Text>
                        </View>
                      )}
                    </View>
                  )}

                  {/* Question text */}
                  <FormattedText style={[styles.reviewText, { color: theme.text }]}>{q.questionText}</FormattedText>

                  {/* Question image */}
                  {q.imageUrl && (
                    <Image
                      source={{ uri: resolveCdnUrl(q.imageUrl) }}
                      style={{ width: '100%', height: 140, marginTop: 8, borderRadius: 8, backgroundColor: '#ffffff' }}
                      contentFit="contain"
                    />
                  )}

                  {/* Options with highlighting */}
                  <View style={{ gap: 6, marginTop: 10 }}>
                    {[
                      { label: 'A', text: q.opa, idx: 1 },
                      { label: 'B', text: q.opb, idx: 2 },
                      { label: 'C', text: q.opc, idx: 3 },
                      { label: 'D', text: q.opd, idx: 4 },
                    ].map(opt => {
                      const isSelectedOpt = userChoice === opt.idx;
                      const isCorrectOpt = q.correctOption === opt.idx;
                      let optBg = 'transparent';
                      let optBorderCol: string = theme.hairline;
                      let optTextColor = theme.text;

                      if (isCorrectOpt) {
                        optBg = theme.success + '18';
                        optBorderCol = theme.success;
                        optTextColor = theme.text;
                      } else if (isSelectedOpt && !isCorrectOpt) {
                        optBg = theme.error + '18';
                        optBorderCol = theme.error;
                        optTextColor = theme.text;
                      }

                      return (
                        <View key={opt.idx} style={{ flexDirection: 'row', alignItems: 'flex-start', padding: 8, borderRadius: 8, borderWidth: 1, backgroundColor: optBg, borderColor: optBorderCol, gap: 8 }}>
                          <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 1, backgroundColor: isCorrectOpt ? theme.success : (isSelectedOpt ? theme.error : theme.background), borderColor: isCorrectOpt ? theme.success : (isSelectedOpt ? theme.error : theme.hairline), justifyContent: 'center', alignItems: 'center' }}>
                            <Text style={{ fontSize: 9, fontWeight: 'bold', color: (isCorrectOpt || isSelectedOpt) ? '#ffffff' : theme.text }}>{opt.label}</Text>
                          </View>
                          <FormattedText style={{ fontSize: 11, color: optTextColor, flex: 1 }}>{opt.text}</FormattedText>
                        </View>
                      );
                    })}
                  </View>

                  {/* Explanation */}
                  <View style={{ backgroundColor: theme.background, borderRadius: 10, padding: 12, marginTop: 10, gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Award size={12} color={theme.pink} />
                      <Text style={{ fontSize: 10, fontWeight: 'bold', color: theme.text, textTransform: 'uppercase', letterSpacing: 0.5 }}>Explanation</Text>
                    </View>
                    <FormattedText style={{ fontSize: 11, lineHeight: 16, color: theme.textSecondary }}>
                      {stripMarkdownImages(q.explanation || 'No explanation provided.')}
                    </FormattedText>
                    {q.explanationImageUrl && (
                      <Pressable onPress={() => setZoomImageUrl(resolveCdnUrl(q.explanationImageUrl))}>
                        <Image
                          source={{ uri: resolveCdnUrl(q.explanationImageUrl) }}
                          style={{ width: '100%', height: 150, marginTop: 6, borderRadius: 8, backgroundColor: '#ffffff' }}
                          contentFit="contain"
                        />
                      </Pressable>
                    )}
                    {extractMarkdownImages(q.explanation).map((imgUrl, imgIdx) => {
                      if (q.explanationImageUrl && resolveCdnUrl(imgUrl) === resolveCdnUrl(q.explanationImageUrl)) {
                        return null;
                      }
                      return (
                        <Pressable key={imgIdx} onPress={() => setZoomImageUrl(resolveCdnUrl(imgUrl))}>
                          <Image
                            source={{ uri: resolveCdnUrl(imgUrl) }}
                            style={{ width: '100%', height: 150, marginTop: 6, borderRadius: 8, backgroundColor: '#ffffff' }}
                            contentFit="contain"
                          />
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>
    );
  }

  // --- SOLVING VIEW ---
  const isQuestionAnswered = selectedAnswers[activeQuestion.id] !== undefined;
  const isStudyMode = !isMock && (timerMode === 'STOPWATCH' || status === 'SPACED_REPETITION');
  const showExplanation = isQuestionAnswered && revealedQuestions[activeQuestion.id];

  const activeSubjectName = subjectsList.find(s => s.id === activeQuestion.subjectId)?.name || 'Subject';
  const activeTopicName = (rawTopics as { id: number; name: string; subjectId: number }[]).find(t => t.id === activeQuestion.topicId)?.name;

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: Math.max(insets.top, 16) }]}>
      {/* Header */}
      <View style={styles.practiceHeader}>
        <Pressable onPress={handleExitPress} style={styles.backButton}>
          <ArrowLeft size={18} color={theme.text} />
        </Pressable>
        
        <View style={styles.progressBox}>
          <Text style={[styles.progressText, { color: theme.text }]}>
            {currentQueueIdx + 1} / {sessionQueue.length}
          </Text>
        </View>

        {timerMode !== 'STOPWATCH' && (
          <View style={styles.timerWrapper}>
            <Timer size={14} color={theme.pink} />
            <Text style={[styles.timerText, { color: theme.text }]}>{formatTime(secondsRemaining)}</Text>
          </View>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {isMock ? (
            <>
              <Pressable onPress={() => handleBookmarkToggle(activeQuestion.id)} style={styles.backButton}>
                <Bookmark 
                  size={18} 
                  color={bookmarkedIds.includes(activeQuestion.id) ? theme.pink : theme.text}
                  fill={bookmarkedIds.includes(activeQuestion.id) ? theme.pink : 'none'} 
                />
              </Pressable>
              <Pressable 
                onPress={finishTest}
                style={({ pressed }) => [
                  styles.headerSubmitBtn,
                  { backgroundColor: theme.pink, opacity: pressed ? 0.8 : 1 }
                ]}
              >
                <Text style={styles.headerSubmitBtnText}>Submit</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable onPress={() => setHideTags(prev => !prev)} style={styles.backButton}>
                {hideTags ? <EyeOff size={16} color={theme.textSecondary} /> : <Eye size={16} color={theme.textSecondary} />}
              </Pressable>
              <Pressable onPress={() => handleBookmarkToggle(activeQuestion.id)} style={styles.backButton}>
                <Bookmark 
                  size={18} 
                  color={bookmarkedIds.includes(activeQuestion.id) ? theme.pink : theme.text}
                  fill={bookmarkedIds.includes(activeQuestion.id) ? theme.pink : 'none'} 
                />
              </Pressable>
            </>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Question Area */}
        <Animated.View 
          key={`question-${currentQueueIdx}`}
          entering={FadeIn.duration(250)}
          exiting={FadeOut.duration(150)}
          style={[styles.questionBox, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}
        >
          {/* Question Meta Header */}
          <View style={styles.questionMeta}>
            <Text style={[styles.questionMetaLabel, { color: theme.pink }]}>
              Q{currentQueueIdx + 1}
            </Text>
            {!hideTags && (
              <View style={styles.tagRow}>
                <View style={[styles.tagPill, { backgroundColor: theme.lavender + '40', borderColor: theme.lavender + '80' }]}>
                  <Text style={[styles.tagText, { color: theme.text }]}>{activeSubjectName}</Text>
                </View>
                {activeTopicName && (
                  <View style={[styles.tagPill, { backgroundColor: theme.mint + '40', borderColor: theme.mint + '80' }]}>
                    <Text style={[styles.tagText, { color: theme.text }]}>{activeTopicName}</Text>
                  </View>
                )}
                {(activeQuestion.examType || activeQuestion.examYear) && (
                  <View style={[styles.tagPill, { backgroundColor: theme.peach + '40', borderColor: theme.peach + '80' }]}>
                    <Text style={[styles.tagText, { color: theme.text }]}>
                      {[activeQuestion.examType, activeQuestion.examYear].filter(Boolean).join(' ')}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>

          <FormattedText style={[styles.questionText, { color: theme.text }]}>
            {activeQuestion.questionText}
          </FormattedText>
          {activeQuestion.imageUrl && (
            <Pressable onPress={() => setZoomImageUrl(resolveCdnUrl(activeQuestion.imageUrl))}>
              <Image
                source={{ uri: resolveCdnUrl(activeQuestion.imageUrl) }}
                style={styles.questionImage}
                contentFit="contain"
              />
            </Pressable>
          )}
        </Animated.View>

        {/* Options */}
        <Animated.View
          key={`options-${currentQueueIdx}`}
          entering={FadeIn.delay(80).duration(250)}
          style={styles.optionsList}
        >
          {[activeQuestion.opa, activeQuestion.opb, activeQuestion.opc, activeQuestion.opd].map((opt, idx) => {
            const optionIdx = idx + 1; // 1-indexed (A=1, B=2, C=3, D=4)
            const isSelected = selectedAnswers[activeQuestion.id] === optionIdx;
            const isCorrectOption = activeQuestion.correctOption === optionIdx;
            const isChecked = revealedQuestions[activeQuestion.id];

            let cardBg: string = theme.backgroundElement;
            let textCol: string = theme.text;
            let borderCol: string = theme.hairline;

            if (isSelected) {
              if (isStudyMode && isChecked) {
                cardBg = isCorrectOption ? theme.success + '20' : theme.error + '20';
                borderCol = isCorrectOption ? theme.success : theme.error;
              } else {
                cardBg = theme.primary;
                textCol = theme.background;
                borderCol = theme.primary;
              }
            } else if (isStudyMode && isChecked && isCorrectOption) {
              cardBg = theme.success + '20';
              borderCol = theme.success;
            }

            const optImages = [
              activeQuestion.opaImageUrl,
              activeQuestion.opbImageUrl,
              activeQuestion.opcImageUrl,
              activeQuestion.opdImageUrl
            ];
            const optImgUrl = optImages[idx];

            return (
              <Pressable
                key={optionIdx}
                onPress={() => handleOptionSelect(optionIdx)}
                style={[
                  styles.optionCard,
                  { backgroundColor: cardBg, borderColor: borderCol }
                ]}
              >
                <View 
                  style={[
                    styles.optionCircle, 
                    { 
                      backgroundColor: isSelected && !(isStudyMode && isChecked) 
                        ? theme.background 
                        : (isStudyMode && isChecked && isCorrectOption)
                        ? theme.success
                        : (isStudyMode && isChecked && isSelected && !isCorrectOption)
                        ? theme.error
                        : theme.background,
                      borderColor: theme.hairline
                    }
                  ]}
                >
                  <Text 
                    style={{ 
                      color: isSelected && !(isStudyMode && isChecked) 
                        ? theme.primary 
                        : (isStudyMode && isChecked && (isCorrectOption || isSelected))
                        ? '#ffffff'
                        : theme.text, 
                      fontWeight: 'bold', 
                      fontSize: 10 
                    }}
                  >
                    {['A', 'B', 'C', 'D'][idx]}
                  </Text>
                </View>
                <View style={{ flex: 1, gap: 8 }}>
                  <FormattedText style={[styles.optionText, { color: textCol }]}>{opt}</FormattedText>
                  {optImgUrl && (
                    <Pressable onPress={() => setZoomImageUrl(resolveCdnUrl(optImgUrl))}>
                      <Image
                        source={{ uri: resolveCdnUrl(optImgUrl) }}
                        style={styles.optionImage}
                        contentFit="contain"
                      />
                    </Pressable>
                  )}
                </View>
              </Pressable>
            );
          })}
        </Animated.View>

        {/* FSRS Rating Buttons (Spaced Repetition mode, shown after selection) */}
        {status === 'SPACED_REPETITION' && showExplanation && fsrsPreviews && (
          <View style={[styles.fsrsBox, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
            <Text style={[styles.fsrsTitle, { color: theme.text }]}>Rate Recall Memory Difficulty:</Text>
            
            <View style={styles.fsrsButtons}>
              <Pressable 
                onPress={() => handleFSRSRate(Rating.Again)}
                style={({ pressed }) => [styles.fsrsBtn, { backgroundColor: theme.pink, opacity: pressed ? 0.8 : 1 }]}
              >
                <Text style={styles.fsrsBtnText}>Forgot</Text>
                <Text style={styles.fsrsBtnSub}>{fsrsPreviews[Rating.Again]?.intervalText}</Text>
              </Pressable>

              <Pressable 
                onPress={() => handleFSRSRate(Rating.Hard)}
                style={({ pressed }) => [styles.fsrsBtn, { backgroundColor: theme.peach, opacity: pressed ? 0.8 : 1 }]}
              >
                <Text style={[styles.fsrsBtnText, { color: '#0a0a0a' }]}>Hard</Text>
                <Text style={[styles.fsrsBtnSub, { color: 'rgba(10,10,10,0.6)' }]}>{fsrsPreviews[Rating.Hard]?.intervalText}</Text>
              </Pressable>

              <Pressable 
                onPress={() => handleFSRSRate(Rating.Good)}
                style={({ pressed }) => [styles.fsrsBtn, { backgroundColor: theme.lavender, opacity: pressed ? 0.8 : 1 }]}
              >
                <Text style={[styles.fsrsBtnText, { color: '#0a0a0a' }]}>Good</Text>
                <Text style={[styles.fsrsBtnSub, { color: 'rgba(10,10,10,0.6)' }]}>{fsrsPreviews[Rating.Good]?.intervalText}</Text>
              </Pressable>

              <Pressable 
                onPress={() => handleFSRSRate(Rating.Easy)}
                style={({ pressed }) => [styles.fsrsBtn, { backgroundColor: theme.mint, opacity: pressed ? 0.8 : 1 }]}
              >
                <Text style={[styles.fsrsBtnText, { color: '#0a0a0a' }]}>Easy</Text>
                <Text style={[styles.fsrsBtnSub, { color: 'rgba(10,10,10,0.6)' }]}>{fsrsPreviews[Rating.Easy]?.intervalText}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Explanation Block (Study mode, shown after selection) */}
        {showExplanation && (
          <View style={[styles.explanationBox, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
            <Text style={[styles.explanationTitle, { color: theme.text }]}>High-Yield Explanation</Text>
            <FormattedText style={[styles.explanationText, { color: theme.textSecondary }]}>
              {stripMarkdownImages(activeQuestion.explanation || 'No explanation available for this question pack.')}
            </FormattedText>

            {/* Explicit explanation image */}
            {activeQuestion.explanationImageUrl && (
              <Pressable onPress={() => setZoomImageUrl(resolveCdnUrl(activeQuestion.explanationImageUrl))}>
                <Image
                  source={{ uri: resolveCdnUrl(activeQuestion.explanationImageUrl) }}
                  style={styles.explanationImage}
                  contentFit="contain"
                />
              </Pressable>
            )}

            {/* Extracted markdown inline images */}
            {extractMarkdownImages(activeQuestion.explanation).map((imgUrl, imgIdx) => {
              if (activeQuestion.explanationImageUrl && resolveCdnUrl(imgUrl) === resolveCdnUrl(activeQuestion.explanationImageUrl)) {
                return null;
              }
              return (
                <Pressable key={imgIdx} onPress={() => setZoomImageUrl(resolveCdnUrl(imgUrl))}>
                  <Image
                    source={{ uri: resolveCdnUrl(imgUrl) }}
                    style={styles.explanationImage}
                    contentFit="contain"
                  />
                </Pressable>
              );
            })}

            {/* Time spent indicator */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
              <Clock size={12} color={theme.textSecondary} />
              <Text style={{ fontSize: 10, color: theme.textSecondary, fontWeight: '600' }}>
                Time spent: {secondsTaken[activeQuestion.id] || 0}s
              </Text>
            </View>
            
            {status !== 'SPACED_REPETITION' && (
              <Pressable 
                onPress={() => {
                  if (currentQueueIdx < sessionQueue.length - 1) {
                    setCurrentQueueIdx(c => c + 1);
                    setSecondsRemaining(timerValue);
                  } else {
                    finishTest();
                  }
                }}
                style={({ pressed }) => [
                  styles.nextBtn, 
                  { backgroundColor: theme.primary, opacity: pressed ? 0.8 : 1 }
                ]}
              >
                <Text style={[styles.nextBtnText, { color: theme.background }]}>Next Question</Text>
              </Pressable>
            )}
          </View>
        )}
        {/* CBT Navigation Palette */}
        {isMock && (
          <View style={[styles.paletteContainer, { borderColor: theme.hairline, backgroundColor: theme.backgroundElement }]}>
            <Text style={[styles.paletteTitle, { color: theme.text }]}>Question Palette</Text>
            <View style={styles.paletteLegend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendBadge, { borderColor: theme.hairline, borderStyle: 'dashed', borderWidth: 1 }]} />
                <Text style={[styles.legendText, { color: theme.textSecondary }]}>Unvisited</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendBadge, { borderColor: theme.error, borderWidth: 1, backgroundColor: theme.error + '15' }]} />
                <Text style={[styles.legendText, { color: theme.textSecondary }]}>Skipped</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendBadge, { backgroundColor: theme.success }]} />
                <Text style={[styles.legendText, { color: theme.textSecondary }]}>Solved</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendBadge, { borderColor: theme.lavender, borderWidth: 1 }]} />
                <Text style={[styles.legendText, { color: theme.textSecondary }]}>Review</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendBadge, { backgroundColor: theme.lavender, justifyContent: 'center', alignItems: 'center' }]}>
                  <View style={[styles.greenDot, { backgroundColor: theme.success }]} />
                </View>
                <Text style={[styles.legendText, { color: theme.textSecondary }]}>Solved & Rev</Text>
              </View>
            </View>

            <View style={styles.paletteGrid}>
              {sessionQueue.map((qIdx, index) => {
                const q = questions[qIdx];
                const qId = q.id;
                const isVisited = visitedQuestions[qId] === true;
                const isAnswered = selectedAnswers[qId] !== undefined && selectedAnswers[qId] !== -1;
                const isFlagged = markedForReview[qId] === true;
                const isActive = index === currentQueueIdx;

                let pillBg: string = 'transparent';
                let pillBorder: string = theme.hairline;
                let pillTextCol: string = theme.text;
                let borderStyle: 'solid' | 'dashed' = 'solid';
                let hasInnerDot = false;

                if (!isVisited) {
                  borderStyle = 'dashed';
                } else if (isVisited && !isAnswered && !isFlagged) {
                  pillBorder = theme.error;
                  pillBg = theme.error + '15';
                  pillTextCol = theme.error;
                } else if (isAnswered && !isFlagged) {
                  pillBg = theme.success;
                  pillBorder = theme.success;
                  pillTextCol = '#ffffff';
                } else if (!isAnswered && isFlagged) {
                  pillBorder = theme.lavender;
                  pillTextCol = theme.text;
                } else if (isAnswered && isFlagged) {
                  pillBg = theme.lavender;
                  pillBorder = theme.lavender;
                  pillTextCol = '#ffffff';
                  hasInnerDot = true;
                }

                return (
                  <Pressable
                    key={qId}
                    onPress={() => {
                      setCurrentQueueIdx(index);
                      if (timerMode === 'COUNTDOWN_Q') {
                        setSecondsRemaining(timerValue);
                      }
                    }}
                    style={[
                      styles.palettePill,
                      {
                        backgroundColor: pillBg,
                        borderColor: isActive ? theme.text : pillBorder,
                        borderStyle,
                        borderWidth: isActive ? 2 : 1,
                        transform: isActive ? [{ scale: 1.1 }] : [{ scale: 1 }]
                      }
                    ]}
                  >
                    <Text
                      style={[
                        styles.palettePillText,
                        {
                          color: isActive ? theme.text : pillTextCol,
                          fontWeight: isActive ? 'bold' : 'normal'
                        }
                      ]}
                    >
                      {index + 1}
                    </Text>
                    {hasInnerDot && <View style={[styles.innerGreenDot, { backgroundColor: theme.success }]} />}
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Footer Navigation (Mock mode, user can navigate freely) */}
      {!isStudyMode && (
        <View style={[styles.footerNav, { paddingBottom: Math.max(insets.bottom, 12), borderTopColor: theme.hairline }]}>
          <Pressable 
            disabled={currentQueueIdx === 0} 
            onPress={prevQuestion}
            style={[styles.navBtn, { opacity: currentQueueIdx === 0 ? 0.3 : 1 }]}
          >
            <ChevronLeft size={20} color={theme.text} />
            <Text style={[styles.navBtnText, { color: theme.text }]}>Prev</Text>
          </Pressable>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {/* Clear Response */}
            {selectedAnswers[activeQuestion.id] !== undefined && (
              <Pressable 
                onPress={() => {
                  setSelectedAnswers(prev => {
                    const copy = { ...prev };
                    delete copy[activeQuestion.id];
                    return copy;
                  });
                  triggerHaptic(Haptics.ImpactFeedbackStyle.Light);
                }}
                style={({ pressed }) => [
                  styles.clearBtn,
                  { borderColor: theme.hairline, opacity: pressed ? 0.7 : 1 }
                ]}
              >
                <Text style={[styles.clearBtnText, { color: theme.textSecondary }]}>Clear</Text>
              </Pressable>
            )}

            {/* Mark for Review */}
            <Pressable 
              onPress={() => {
                setMarkedForReview(prev => ({
                  ...prev,
                  [activeQuestion.id]: !prev[activeQuestion.id]
                }));
                triggerHaptic(Haptics.ImpactFeedbackStyle.Light);
              }}
              style={({ pressed }) => [
                styles.reviewBtn,
                { 
                  backgroundColor: markedForReview[activeQuestion.id] ? theme.lavender : 'transparent',
                  borderColor: markedForReview[activeQuestion.id] ? theme.lavender : theme.hairline,
                  opacity: pressed ? 0.7 : 1 
                }
              ]}
            >
              <Flag size={12} color={markedForReview[activeQuestion.id] ? '#ffffff' : theme.textSecondary} />
              <Text style={[styles.reviewBtnText, { color: markedForReview[activeQuestion.id] ? '#ffffff' : theme.textSecondary }]}>
                {markedForReview[activeQuestion.id] ? 'Flagged' : 'Review'}
              </Text>
            </Pressable>

            {/* Submit */}
            {!isMock && (
              <Pressable 
                onPress={finishTest}
                style={({ pressed }) => [
                  styles.submitBtn,
                  { backgroundColor: theme.pink, opacity: pressed ? 0.8 : 1 }
                ]}
              >
                <Text style={styles.submitBtnText}>Submit</Text>
              </Pressable>
            )}
          </View>

          <Pressable 
            disabled={currentQueueIdx === sessionQueue.length - 1} 
            onPress={nextQuestion}
            style={[styles.navBtn, { opacity: currentQueueIdx === sessionQueue.length - 1 ? 0.3 : 1 }]}
          >
            <Text style={[styles.navBtnText, { color: theme.text }]}>Next</Text>
            <ChevronRight size={20} color={theme.text} />
          </Pressable>
        </View>
      )}
      {/* Lightbox Zoom Modal */}
      <Modal
        visible={zoomImageUrl !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setZoomImageUrl(null)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.modalCloseArea} onPress={() => setZoomImageUrl(null)} />
          {zoomImageUrl && (
            <Image
              source={{ uri: zoomImageUrl }}
              style={styles.modalImage}
              contentFit="contain"
            />
          )}
          <Pressable 
            onPress={() => setZoomImageUrl(null)} 
            style={[styles.modalCloseButton, { backgroundColor: 'rgba(255, 255, 255, 0.2)' }]}
          >
            <Text style={styles.modalCloseText}>Close</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 8,
  },
  practiceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  backButton: {
    padding: 8,
  },
  headerSubmitBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSubmitBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  progressBox: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  progressText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  timerWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timerText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  questionBox: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  questionText: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
  },
  questionImage: {
    width: '100%',
    height: 200,
    marginTop: 12,
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  optionImage: {
    width: '100%',
    height: 120,
    marginTop: 6,
    borderRadius: 6,
    backgroundColor: '#ffffff',
  },
  explanationImage: {
    width: '100%',
    height: 180,
    marginTop: 10,
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseArea: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  modalImage: {
    width: '95%',
    height: '80%',
  },
  modalCloseButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  modalCloseText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  optionsList: {
    gap: 10,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  optionCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionText: {
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  fsrsBox: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  fsrsTitle: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  fsrsButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  fsrsBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  fsrsBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  fsrsBtnSub: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 9,
    fontWeight: '600',
  },
  explanationBox: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
  },
  explanationTitle: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  explanationText: {
    fontSize: 12,
    lineHeight: 18,
  },
  nextBtn: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  nextBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  footerNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 8,
  },
  navBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  submitBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  // Scorecard styles
  scorecardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  scorecardTitle: {
    fontFamily: 'Plain Black, Inter, sans-serif',
    fontSize: 18,
    fontWeight: 'bold',
  },
  doneButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  doneButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  scorecardContent: {
    padding: 16,
    gap: 16,
  },
  scoreGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  scoreItem: {
    width: '48%',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
    flexGrow: 1,
  },
  scoreVal: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  scoreLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: -0.4,
    marginTop: 8,
  },
  reviewList: {
    gap: 8,
  },
  reviewRow: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  reviewRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reviewNumber: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  reviewText: {
    fontSize: 12,
    lineHeight: 16,
  },
  correctAnswerLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    marginTop: 2,
  },
  // CBT Palette styles
  paletteContainer: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 16,
    gap: 12,
  },
  paletteTitle: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  paletteLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    rowGap: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendBadge: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    fontSize: 10,
    fontWeight: '500',
  },
  paletteGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  palettePill: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  palettePillText: {
    fontSize: 11,
  },
  greenDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  innerGreenDot: {
    position: 'absolute',
    bottom: 3,
    right: 3,
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#ffffff',
  },
  // Advanced Scorecard styles
  mockScoreSection: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mockScoreTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  obtainedScoreBox: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 4,
  },
  obtainedScoreVal: {
    fontSize: 36,
    fontWeight: 'bold',
  },
  obtainedScoreMax: {
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 4,
  },
  mockScoreSub: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 4,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  metricValue: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  // Question meta header with tags
  questionMeta: {
    marginBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
    paddingBottom: 10,
    gap: 6,
  },
  questionMetaLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  tagPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  tagText: {
    fontSize: 9,
    fontWeight: 'bold',
  },
  // Mock footer buttons
  clearBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
  },
  clearBtnText: {
    fontSize: 11,
    fontWeight: '600',
  },
  reviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
  },
  reviewBtnText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  // Performance matrix card
  matrixCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
});
