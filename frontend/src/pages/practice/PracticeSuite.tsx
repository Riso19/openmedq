import { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, Bookmark, CheckCircle2, XCircle, Timer, AlertTriangle, 
  Award, Trophy, ChevronRight, ChevronLeft, RefreshCw, Clock, Eye, EyeOff
} from 'lucide-react';
import { MarkdownRenderer } from '../../components/MarkdownRenderer';
import { db, type LocalQuestion } from '../../lib/db';
import { getRandomQuestionsFiltered } from '../../lib/db';
import { subjectsList } from '../../lib/subjects';
import rawTopics from '../../lib/topics.json';
import { Rating } from 'ts-fsrs';
import { getScheduler, progressToCard, cardToProgressFields, formatFSRSInterval } from '../../lib/fsrs';
import { useAuth } from '@clerk/clerk-react';
import { earnDopaLocal } from '../../lib/gamification';
import { ThemeToggle } from '../../components/ThemeToggle';
import { LocalImage } from '../../components/LocalImage';

interface CustomModuleConfig {
  subjectIds: number[];
  topicIds?: number[];
  status: 'ALL' | 'UNATTEMPTED' | 'INCORRECT' | 'CORRECT' | 'BOOKMARKED' | 'SPACED_REPETITION' | 'LEECHES';
  timerMode: 'STOPWATCH' | 'COUNTDOWN_Q' | 'TOTAL_LIMIT';
  timerValue: number;
  limit: number;
  isStandard?: boolean;
  isMockTest?: boolean;
  marksPerQuestion?: number;
  negativeMarking?: number;
  newCardsLimit?: number;
  examType?: string;
  examYear?: number;
  examYears?: number[];
}

interface PracticeSuiteProps {
  config: CustomModuleConfig;
  onExit: () => void;
  onProgressUpdate?: (unsyncedCountIncrement: number) => void;
  resumeActiveSession?: boolean;
}

export function PracticeSuite({ config, onExit, onProgressUpdate, resumeActiveSession }: PracticeSuiteProps) {
  const { isSignedIn, getToken } = useAuth();
  const [questions, setQuestions] = useState<LocalQuestion[]>([]);
  const [sessionQueue, setSessionQueue] = useState<number[]>([]);
  const [currentQueueIdx, setCurrentQueueIdx] = useState<number>(0);
  const [firstAttempts, setFirstAttempts] = useState<Record<number, { selectedOption: number; isCorrect: boolean }>>({});
  const currentIdx = sessionQueue[currentQueueIdx] !== undefined ? sessionQueue[currentQueueIdx] : 0;
  const [loading, setLoading] = useState<boolean>(true);
  
  // Track selected answers per question ID (1-based option index: 1=A, 2=B, 3=C, 4=D)
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  
  // For Study Mode: track which questions have been answered to show immediate explanation
  const [revealedQuestions, setRevealedQuestions] = useState<Record<number, boolean>>({});
  
  const [bookmarkedIds, setBookmarkedIds] = useState<number[]>([]);
  const [testStatus, setTestStatus] = useState<'PRACTICING' | 'COMPLETED'>('PRACTICING');
  const [showExitConfirm, setShowExitConfirm] = useState<boolean>(false);
  const [hideTags, setHideTags] = useState<boolean>(false);

  // Mock Exam states
  const [markedForReview, setMarkedForReview] = useState<Record<number, boolean>>({});
  const [visitedQuestions, setVisitedQuestions] = useState<Record<number, boolean>>({});
  const [showNavGrid, setShowNavGrid] = useState<boolean>(false);
  const [answerSwitches, setAnswerSwitches] = useState<Record<number, { first: number; last: number; count: number }>>({});

  // Time tracking states
  const [secondsRemaining, setSecondsRemaining] = useState<number>(0);
  const [secondsTaken, setSecondsTaken] = useState<Record<number, number>>({}); // questionId -> seconds
  const [totalElapsedSeconds, setTotalElapsedSeconds] = useState<number>(0);

  // Lightbox Zoom State
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);
  const lightboxRef = useRef<HTMLDialogElement>(null);

  const handleImageZoom = (url: string) => {
    setZoomImageUrl(url);
    lightboxRef.current?.showModal();
  };

  const handleDialogClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target !== lightboxRef.current) return;
    const rect = lightboxRef.current.getBoundingClientRect();
    const isInDialog = (
      rect.top <= e.clientY &&
      e.clientY <= rect.top + rect.height &&
      rect.left <= e.clientX &&
      e.clientX <= rect.left + rect.width
    );
    if (!isInDialog) {
      lightboxRef.current.close();
    }
  };

  const timerRef = useRef<any>(null);
  const timeoutRef = useRef<any>(null);

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if confirmation modal, completed status, or loading is active
      if (showExitConfirm || testStatus === 'COMPLETED' || loading || !questions[currentIdx]) return;

      const activeQ = questions[currentIdx];
      const userChoice = selectedAnswers[activeQ.id];
      const hasChosen = userChoice !== undefined;
      const isFSRSMode = config.status === 'SPACED_REPETITION';
      const isExplanationRevealed = revealedQuestions[activeQ.id] === true;

      const key = e.key.toLowerCase();
      if (!hasChosen) {
        if (key === '1' || key === 'a') {
          handleOptionSelect(1);
        } else if (key === '2' || key === 'b') {
          handleOptionSelect(2);
        } else if (key === '3' || key === 'c') {
          handleOptionSelect(3);
        } else if (key === '4' || key === 'd') {
          handleOptionSelect(4);
        }
      } else {
        // Option is already selected
        if (isFSRSMode && isExplanationRevealed) {
          if (key === '1' || key === 'a') {
            handleFSRSRate(Rating.Again);
          } else if (key === '2' || key === 'b') {
            handleFSRSRate(Rating.Hard);
          } else if (key === '3' || key === 'c') {
            handleFSRSRate(Rating.Good);
          } else if (key === '4' || key === 'd') {
            handleFSRSRate(Rating.Easy);
          }
        } else {
          // Non-FSRS or FSRS without explanation: advance on Enter or Space
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (currentIdx === questions.length - 1) {
              finishTest();
            } else {
              nextQuestion();
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [questions, currentIdx, selectedAnswers, revealedQuestions, showExitConfirm, testStatus, loading]);

  // Track visited questions automatically when current index changes
  useEffect(() => {
    if (questions && questions[currentIdx]) {
      const qId = questions[currentIdx].id;
      setVisitedQuestions(prev => {
        if (prev[qId]) return prev;
        return { ...prev, [qId]: true };
      });
    }
  }, [currentIdx, questions]);

  const handleClearResponse = () => {
    setSelectedAnswers(prev => {
      const next = { ...prev };
      delete next[activeQuestion.id];
      return next;
    });
  };

  // Load questions and bookmarks on mount
  useEffect(() => {
    const initializeTest = async () => {
      setLoading(true);
      try {
        if (resumeActiveSession) {
          const saved = localStorage.getItem('openmedq_active_practice_session');
          if (saved) {
            const parsed = JSON.parse(saved);
            setQuestions(parsed.questions || []);
            setSessionQueue(parsed.sessionQueue || []);
            setCurrentQueueIdx(parsed.currentQueueIdx || 0);
            setFirstAttempts(parsed.firstAttempts || {});
            setSelectedAnswers(parsed.selectedAnswers || {});
            setRevealedQuestions(parsed.revealedQuestions || {});
            setSecondsTaken(parsed.secondsTaken || {});
            setTotalElapsedSeconds(parsed.totalElapsedSeconds || 0);
            setSecondsRemaining(parsed.secondsRemaining || 0);
            setBookmarkedIds(parsed.bookmarkedIds || []);
            setLoading(false);
            return;
          }
        }

        let filteredQs: LocalQuestion[] = [];
        let fetchedOnline = false;

        // Check if we have local questions cached for these subjects/topics first
        let localCount = 0;
        try {
          if (config.topicIds && config.topicIds.length > 0) {
            localCount = await db.questions.where('topicId').anyOf(config.topicIds).count();
          } else {
            localCount = await db.questions.where('subjectId').anyOf(config.subjectIds).count();
          }
        } catch (err) {
          console.warn("Failed to check local questions count.");
        }

        // Try fetching filtered questions from the backend only if not cached locally
        if (localCount === 0 && isSignedIn && typeof navigator !== 'undefined' && navigator.onLine) {
          try {
            const token = await getToken();
            if (token) {
              const res = await fetch((import.meta.env.VITE_API_URL || '') + '/api/questions/custom-practice', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                  subjectIds: config.subjectIds,
                  topicIds: config.topicIds,
                  status: config.status,
                  limit: config.limit,
                  newCardsLimit: config.newCardsLimit,
                })
              });
              if (res.ok) {
                const data = (await res.json()) as any;
                if (data.success && data.questions && data.questions.length > 0) {
                  filteredQs = data.questions;
                  fetchedOnline = true;
                  // Cache online custom test questions in IndexedDB so the dashboard can map progress records to their subjects
                  await db.transaction('rw', db.questions, async () => {
                    for (const q of filteredQs) {
                      await db.questions.put(q);
                    }
                  });
                }
              }
            }
          } catch (err) {
            console.warn("Failed to fetch custom practice questions.");
          }
        }

        // Fallback to local IndexedDB if offline or signed out or online fetch returned empty/failed
        if (!fetchedOnline) {
          filteredQs = await getRandomQuestionsFiltered({
            subjectIds: config.subjectIds,
            topicIds: config.topicIds,
            status: config.status,
            limit: config.limit,
            newCardsLimit: config.newCardsLimit,
            examType: config.examType,
            examYear: config.examYear,
            examYears: config.examYears,
          });

          // Dynamic online fetch if local questions are 0 and config specifies topicIds
          if (filteredQs.length === 0 && config.topicIds && config.topicIds.length > 0 && typeof navigator !== 'undefined' && navigator.onLine) {
            const subId = config.subjectIds[0] || 1;
            
            await Promise.all(
              config.topicIds.map(async (tId) => {
                try {
                  const cdnUrl = import.meta.env.VITE_CDN_URL || `${import.meta.env.VITE_API_URL || ''}/api/assets`;
                  const res = await fetch(`${cdnUrl}/packs/subject_${subId}_topic_${tId}.json`);
                  if (res.ok) {
                    const rawQuestions = await res.json();
                    if (Array.isArray(rawQuestions) && rawQuestions.length > 0) {
                      const formatted = rawQuestions.map((q: any) => ({
                        id: q.id,
                        questionText: q.questionText,
                        opa: q.opa,
                        opb: q.opb,
                        opc: q.opc,
                        opd: q.opd,
                        correctOption: typeof q.correctOption === 'number' && q.correctOption >= 0 && q.correctOption <= 3
                          ? q.correctOption + 1
                          : q.correctOption,
                        subjectId: q.subjectId,
                        topicId: q.topicId,
                        examType: q.examType || undefined,
                        examYear: q.examYear || undefined,
                        explanation: q.explanation || 'This high-yield question pack was fetched dynamically from OpenMedQ CDN servers.',
                        imageUrl: q.imageUrl || undefined,
                        explanationImageUrl: q.explanationImageUrl || undefined,
                        opaImageUrl: q.opaImageUrl || undefined,
                        opbImageUrl: q.opbImageUrl || undefined,
                        opcImageUrl: q.opcImageUrl || undefined,
                        opdImageUrl: q.opdImageUrl || undefined,
                      }));
                      for (const q of formatted) {
                        await db.questions.put(q);
                      }
                    }
                  }
                } catch (err) {
                  console.warn(`Failed to seed topic ${tId}.`);
                }
              })
            );

            // Re-query local database after dynamic seeding
            filteredQs = await getRandomQuestionsFiltered({
              subjectIds: config.subjectIds,
              topicIds: config.topicIds,
              status: config.status,
              limit: config.limit,
              newCardsLimit: config.newCardsLimit,
            });
          }

          // Dynamic online fetch for PYQ Year packs if local questions are 0 and config specifies examType/examYears
          if (filteredQs.length === 0 && config.examType && (config.examYears || config.examYear) && typeof navigator !== 'undefined' && navigator.onLine) {
            try {
              const cdnUrl = import.meta.env.VITE_CDN_URL || `${import.meta.env.VITE_API_URL || ''}/api/assets`;
              const yearsToFetch = config.examYears && config.examYears.length > 0
                ? config.examYears
                : (config.examYear ? [config.examYear] : []);

              for (const year of yearsToFetch) {
                const res = await fetch(`${cdnUrl}/packs/neet_pg_${year}.json`);
                if (res.ok) {
                  const rawQuestions = await res.json();
                  if (Array.isArray(rawQuestions) && rawQuestions.length > 0) {
                    const formatted = rawQuestions.map((q: any) => ({
                      id: q.id,
                      questionText: q.questionText,
                      opa: q.opa,
                      opb: q.opb,
                      opc: q.opc,
                      opd: q.opd,
                      correctOption: typeof q.correctOption === 'number' && q.correctOption >= 0 && q.correctOption <= 3
                        ? q.correctOption + 1
                        : q.correctOption,
                      subjectId: q.subjectId,
                      topicId: q.topicId,
                      examType: q.examType || undefined,
                      examYear: q.examYear || undefined,
                      explanation: q.explanation || 'This high-yield question pack was fetched dynamically from OpenMedQ CDN servers.',
                      imageUrl: q.imageUrl || undefined,
                      explanationImageUrl: q.explanationImageUrl || undefined,
                      opaImageUrl: q.opaImageUrl || undefined,
                      opbImageUrl: q.opbImageUrl || undefined,
                      opcImageUrl: q.opcImageUrl || undefined,
                      opdImageUrl: q.opdImageUrl || undefined,
                    }));
                    
                    await db.questions.bulkPut(formatted);
                  }
                }
              }
              
              // Re-query local database after seeding
              filteredQs = await getRandomQuestionsFiltered({
                subjectIds: config.subjectIds,
                topicIds: config.topicIds,
                status: config.status,
                limit: config.limit,
                newCardsLimit: config.newCardsLimit,
                examType: config.examType,
                examYear: config.examYear,
                examYears: config.examYears,
              });
            } catch (err) {
              console.warn(`Failed to dynamically seed exam years:`, err);
            }
          }
        }
        
        setQuestions(filteredQs);
        setSessionQueue(filteredQs.map((_, i) => i));
        setCurrentQueueIdx(0);

        // Fetch user's current bookmarked list from Dexie
        const allProgress = await db.progress.toArray();
        const bookmarked = allProgress.filter(p => p.status === 'BOOKMARKED').map(p => p.questionId);
        setBookmarkedIds(bookmarked);

        // Setup timer initial value
        if (config.timerMode === 'COUNTDOWN_Q') {
          setSecondsRemaining(config.timerValue);
        } else if (config.timerMode === 'TOTAL_LIMIT') {
          setSecondsRemaining(config.timerValue * 60);
        }

        // Initialize seconds taken for each question
        const initialSeconds: Record<number, number> = {};
        filteredQs.forEach(q => {
          initialSeconds[q.id] = 0;
        });
        setSecondsTaken(initialSeconds);

      } catch (err) {
        console.error("Failed to initialize custom practice queue.");
      } finally {
        setLoading(false);
      }
    };
    initializeTest();
  }, [config, isSignedIn, resumeActiveSession]);

  const activeQuestion = questions[currentIdx];

  const [fsrsPreviews, setFsrsPreviews] = useState<Record<number, { card: any; intervalText: string }> | null>(null);

  // Load FSRS previews when question is answered in Spaced Repetition mode
  useEffect(() => {
    if (config.status !== 'SPACED_REPETITION' || !activeQuestion) {
      setFsrsPreviews(null);
      return;
    }

    const loadFsrsPreview = async () => {
      try {
        const p = await db.progress.get(activeQuestion.id);
        const card = progressToCard(p);
        const now = new Date();
        const scheduler = getScheduler();
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
        console.warn("Error calculating previews.");
        setFsrsPreviews(null);
      }
    };

    if (revealedQuestions[activeQuestion.id]) {
      loadFsrsPreview();
    } else {
      setFsrsPreviews(null);
    }
  }, [currentIdx, revealedQuestions, activeQuestion, config.status]);

  // Core Timer Interval Loop
  useEffect(() => {
    if (loading || testStatus === 'COMPLETED' || questions.length === 0 || !activeQuestion) return;

    timerRef.current = setInterval(() => {
      setTotalElapsedSeconds(prev => prev + 1);

      // Record time spent on current question
      setSecondsTaken(prev => ({
        ...prev,
        [activeQuestion.id]: (prev[activeQuestion.id] || 0) + 1,
      }));

      // Countdown logic
      if (config.timerMode === 'COUNTDOWN_Q' || config.timerMode === 'TOTAL_LIMIT') {
        setSecondsRemaining(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            
            if (config.timerMode === 'COUNTDOWN_Q') {
              // Time ran out for this specific question
              handleQuestionTimeOut();
            } else {
              // Time ran out for the entire test
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
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [loading, testStatus, currentIdx, questions, activeQuestion]);

  // Active session persistence loop
  useEffect(() => {
    if (loading) return;

    if (testStatus === 'COMPLETED') {
      localStorage.removeItem('openmedq_active_practice_session');
      return;
    }

    try {
      const sessionState = {
        questions,
        sessionQueue,
        currentQueueIdx,
        firstAttempts,
        selectedAnswers,
        revealedQuestions,
        secondsTaken,
        totalElapsedSeconds,
        secondsRemaining,
        config,
        bookmarkedIds
      };
      localStorage.setItem('openmedq_active_practice_session', JSON.stringify(sessionState));
    } catch (err) {
      console.warn("Failed to serialize active session.");
    }
  }, [
    questions,
    sessionQueue,
    currentQueueIdx,
    firstAttempts,
    selectedAnswers,
    revealedQuestions,
    secondsTaken,
    totalElapsedSeconds,
    secondsRemaining,
    config,
    bookmarkedIds,
    loading,
    testStatus
  ]);

  // Handle countdown timeout per single question
  const handleQuestionTimeOut = () => {
    setSelectedAnswers(prev => {
      if (prev[activeQuestion.id] !== undefined) return prev;
      return { ...prev, [activeQuestion.id]: -1 }; // -1 indicates timed out
    });
    setRevealedQuestions(prev => ({ ...prev, [activeQuestion.id]: true }));

    if (config.status === 'SPACED_REPETITION') {
      handleFSRSRate(Rating.Again);
      return;
    }

    // Move to next or complete
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (currentQueueIdx < sessionQueue.length - 1) {
        setCurrentQueueIdx(c => c + 1);
        setSecondsRemaining(config.timerValue);
      } else {
        finishTest();
      }
    }, 1500);
  };

  // Handle total test time timeout
  const handleTestTimeOut = () => {
    alert("Time limit reached! Finishing test.");
    finishTest();
  };

  const handleOptionSelect = async (optionIndex: number) => {
    const qId = activeQuestion.id;
    const isMock = config.isMockTest;
    const previousSelection = selectedAnswers[qId];

    if (!isMock && previousSelection !== undefined) return; // In standard mode, once answered it is locked

    setSelectedAnswers(prev => ({
      ...prev,
      [qId]: optionIndex
    }));

    // Switch tracking for mock test
    if (isMock) {
      setAnswerSwitches(prev => {
        const existing = prev[qId];
        if (!existing) {
          return {
            ...prev,
            [qId]: { first: optionIndex, last: optionIndex, count: 0 }
          };
        } else {
          if (existing.last === optionIndex) return prev;
          return {
            ...prev,
            [qId]: {
              first: existing.first,
              last: optionIndex,
              count: existing.count + 1
            }
          };
        }
      });
      return; // Skip immediate progress logging in mock mode
    }

    const isStudyMode = config.timerMode === 'STOPWATCH' || config.status === 'SPACED_REPETITION';
    const isFSRSMode = config.status === 'SPACED_REPETITION';
    const isCorrect = optionIndex === activeQuestion.correctOption;
    const isFirstAttempt = firstAttempts[qId] === undefined;

    if (isFirstAttempt) {
      setFirstAttempts(prev => ({
        ...prev,
        [qId]: { selectedOption: optionIndex, isCorrect }
      }));

      if (!isFSRSMode) {
        const amount = isCorrect ? 10 : 2;
        earnDopaLocal(amount, isCorrect ? 'Correct MCQ' : 'Attempted MCQ');
      }
    }

    if (isStudyMode) {
      setRevealedQuestions(prev => ({ ...prev, [qId]: true }));
      
      if (!isFSRSMode) {
        try {
          const p = await db.progress.get(qId);
          const card = progressToCard(p);
          const priorState = card.state;
          const now = new Date();
          const scheduler = getScheduler();

          const rating = isCorrect ? Rating.Good : Rating.Again;
          const { card: updatedCard } = scheduler.next(card, now, rating as any);
          const fsrsFields = cardToProgressFields(updatedCard);

          await db.progress.put({
            questionId: qId,
            status: isCorrect ? 'CORRECT' : 'INCORRECT',
            timeTaken: secondsTaken[qId] || 0,
            answeredAt: now.getTime(),
            ...fsrsFields,
            updatedAt: Date.now(),
            isDeleted: false,
          });

          await db.reviewLogs.put({
            questionId: qId,
            rating,
            state: priorState,
            reviewTime: now.getTime(),
            timeTaken: secondsTaken[qId] || 0,
            stability: updatedCard.stability,
            difficulty: updatedCard.difficulty,
          });

          onProgressUpdate?.(1);
        } catch (err) {
          console.error("Failed to log progress.");
        }
      }
    }
  };

  const handleFSRSRate = async (rating: Rating) => {
    if (!activeQuestion) return;

    try {
      const isRecallSuccess = rating === Rating.Hard || rating === Rating.Good || rating === Rating.Easy;
      const amount = isRecallSuccess ? 15 : 3;
      await earnDopaLocal(amount, isRecallSuccess ? 'FSRS Recall Review' : 'FSRS Recall Re-study');

      const p = await db.progress.get(activeQuestion.id);
      const card = progressToCard(p);
      const priorState = card.state;
      const now = new Date();

      let updatedCard: any;
      if (fsrsPreviews && fsrsPreviews[rating]) {
        updatedCard = fsrsPreviews[rating].card;
      } else {
        const scheduler = getScheduler();
        const res = scheduler.next(card, now, rating as any);
        updatedCard = res.card;
      }

      const fsrsFields = cardToProgressFields(updatedCard);

      const firstAttempt = firstAttempts[activeQuestion.id];
      const isCorrect = firstAttempt ? firstAttempt.isCorrect : (selectedAnswers[activeQuestion.id] === activeQuestion.correctOption);
      const finalStatus = isCorrect ? 'CORRECT' : 'INCORRECT';

      await db.progress.put({
        questionId: activeQuestion.id,
        status: finalStatus,
        timeTaken: secondsTaken[activeQuestion.id] || 0,
        answeredAt: now.getTime(),
        ...fsrsFields,
        updatedAt: Date.now(),
        isDeleted: false,
      });

      await db.reviewLogs.put({
        questionId: activeQuestion.id,
        rating,
        state: priorState,
        reviewTime: now.getTime(),
        timeTaken: secondsTaken[activeQuestion.id] || 0,
        stability: updatedCard.stability,
        difficulty: updatedCard.difficulty,
      });

      onProgressUpdate?.(1);

      // Re-insert failed cards into session queue for same-day learning retry
      if (rating === Rating.Again) {
        const activeQIdx = sessionQueue[currentQueueIdx];
        const stepOffset = 4;
        const insertPos = Math.min(sessionQueue.length, currentQueueIdx + stepOffset);

        const nextQueue = [...sessionQueue];
        nextQueue.splice(insertPos, 0, activeQIdx);
        setSessionQueue(nextQueue);

        // Reset response state for the re-queued question
        setRevealedQuestions(prev => ({ ...prev, [activeQuestion.id]: false }));
        setSelectedAnswers(prev => {
          const copy = { ...prev };
          delete copy[activeQuestion.id];
          return copy;
        });

        // Advance queue index
        setCurrentQueueIdx(c => c + 1);
        if (config.timerMode === 'COUNTDOWN_Q') {
          setSecondsRemaining(config.timerValue);
        }
      } else {
        // Hard/Good/Easy rates advance normally
        if (currentQueueIdx < sessionQueue.length - 1) {
          setCurrentQueueIdx(currentQueueIdx + 1);
          if (config.timerMode === 'COUNTDOWN_Q') {
            setSecondsRemaining(config.timerValue);
          }
        } else {
          finishTest();
        }
      }
    } catch (err) {
      console.error("Failed to save progress rating.");
    }
  };

  const handleBookmarkToggle = async (questionId: number) => {
    let updated;
    if (bookmarkedIds.includes(questionId)) {
      updated = bookmarkedIds.filter(id => id !== questionId);
      const existing = await db.progress.get(questionId);
      if (existing) {
        if (existing.status === 'BOOKMARKED') {
          const prevStatus = existing.previousStatus;
          if (prevStatus) {
            await db.progress.put({
              ...existing,
              status: prevStatus,
              updatedAt: Date.now(),
              isDeleted: false,
            });
          } else {
            await db.progress.put({
              ...existing,
              isDeleted: true,
              updatedAt: Date.now(),
            });
          }
        }
      }
    } else {
      updated = [...bookmarkedIds, questionId];
      const existing = await db.progress.get(questionId);
      await db.progress.put({
        questionId,
        status: 'BOOKMARKED',
        answeredAt: Date.now(),
        updatedAt: Date.now(),
        isDeleted: false,
        ...(existing ? { previousStatus: existing.status } : {}),
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
    
    // Increment progress counter so that the batch sync triggers later
    onProgressUpdate?.(1);
  };

  const nextQuestion = () => {
    if (currentQueueIdx < sessionQueue.length - 1) {
      setCurrentQueueIdx(currentQueueIdx + 1);
      if (config.timerMode === 'COUNTDOWN_Q') {
        setSecondsRemaining(config.timerValue);
      }
    }
  };

  const prevQuestion = () => {
    if (currentQueueIdx > 0) {
      setCurrentQueueIdx(currentQueueIdx - 1);
      if (config.timerMode === 'COUNTDOWN_Q') {
        setSecondsRemaining(config.timerValue);
      }
    }
  };

  const finishTest = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    
    const isTestMode = config.isMockTest || (config.timerMode !== 'STOPWATCH' && config.status !== 'SPACED_REPETITION');
    if (isTestMode) {
      let savedCount = 0;
      let mockDopaEarned = 0;
      for (const q of questions) {
        const userChoice = selectedAnswers[q.id];
        if (userChoice !== undefined) {
          const isCorrect = userChoice === -1 ? false : userChoice === q.correctOption;
          mockDopaEarned += isCorrect ? 10 : 2;
          try {
            const p = await db.progress.get(q.id);
            const card = progressToCard(p);
            const priorState = card.state;
            const now = new Date();
            const scheduler = getScheduler();

            const rating = userChoice === -1 ? Rating.Again : (isCorrect ? Rating.Good : Rating.Again);
            const { card: updatedCard } = scheduler.next(card, now, rating as any);
            const fsrsFields = cardToProgressFields(updatedCard);

            await db.progress.put({
              questionId: q.id,
              status: isCorrect ? 'CORRECT' : 'INCORRECT',
              timeTaken: secondsTaken[q.id] || 0,
              answeredAt: now.getTime(),
              ...fsrsFields,
              updatedAt: Date.now(),
              isDeleted: false,
            });

            await db.reviewLogs.put({
              questionId: q.id,
              rating,
              state: priorState,
              reviewTime: now.getTime(),
              timeTaken: secondsTaken[q.id] || 0,
              stability: updatedCard.stability,
              difficulty: updatedCard.difficulty,
            });

            savedCount++;
          } catch (err) {
            console.error("Failed to log test progress.");
          }
        }
      }
      if (mockDopaEarned > 0) {
        await earnDopaLocal(mockDopaEarned + 50, 'Mock/Timed Test Completion & Performance');
      }
      if (savedCount > 0) {
        onProgressUpdate?.(savedCount);
      }
    } else {
      // Award block completion bonus (+50 Dopa) for standard practice/review blocks
      await earnDopaLocal(50, 'Practice Session Completion Bonus');
    }

    setTestStatus('COMPLETED');
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins}:${remainingSecs < 10 ? '0' : ''}${remainingSecs}`;
  };

  const totalQuestions = questions.length;
  const answeredQuestionsCount = Object.keys(firstAttempts).length;
  const correctCount = questions.filter(q => firstAttempts[q.id]?.isCorrect === true).length;
  const incorrectCount = questions.filter(q => firstAttempts[q.id] !== undefined && firstAttempts[q.id]?.isCorrect === false).length;
  const unattemptedCount = totalQuestions - answeredQuestionsCount;
  const averageTimePerQ = totalQuestions > 0 ? Math.round(totalElapsedSeconds / totalQuestions) : 0;
  const accuracyPercentage = answeredQuestionsCount > 0 ? Math.round((correctCount / answeredQuestionsCount) * 100) : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-clay-canvas flex flex-col items-center justify-center font-sans">
        <RefreshCw className="w-8 h-8 text-clay-pink animate-spin mb-4" />
        <p className="text-clay-ink font-bold text-sm">Preparing Practice Questions...</p>
        <p className="text-clay-muted text-xs mt-1">shuffling questions...</p>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen bg-clay-canvas flex flex-col items-center justify-center p-6 text-center font-sans">
        <AlertTriangle className="w-12 h-12 text-clay-pink mb-4" />
        <h3 className="text-clay-ink font-bold text-lg mb-2">No Matching Questions Found</h3>
        <p className="text-clay-muted text-sm max-w-sm mb-6">
          Could not find questions matching your selected filters. Please select different subjects or topics.
        </p>
        <button
          onClick={onExit}
          className="bg-clay-ink hover:bg-neutral-800 text-white font-bold h-11 px-6 rounded-clay-md text-xs transition-all cursor-pointer"
        >
          Create Another Custom Test
        </button>
      </div>
    );
  }

  // --- COMPLETED VIEW (SCORECARD SUMMARY) ---
  if (testStatus === 'COMPLETED') {
    return (
      <div className="min-h-screen bg-clay-canvas text-clay-ink flex flex-col font-sans relative overflow-x-hidden">
        {/* Header */}
        <header className="sticky top-0 z-50 w-full bg-clay-canvas border-b border-clay-hairline py-4 px-6 flex items-center justify-between">
          <span className="text-sm font-bold tracking-tight text-clay-ink flex items-center gap-2">
            <Trophy className="w-4 h-4 text-clay-ochre fill-current" /> Scorecard Summary
          </span>
          <div className="flex items-center gap-2 sm:gap-4">
            <ThemeToggle />
            <button
              onClick={() => setHideTags(prev => !prev)}
              className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-clay-md transition-all text-xs font-bold cursor-pointer ${
                hideTags
                  ? 'bg-clay-ink text-white border-transparent'
                  : 'bg-clay-canvas border-clay-hairline text-clay-body hover:bg-clay-surface-soft'
              }`}
              title="Toggle Blind Mode to hide subject/topic tags"
            >
              {hideTags ? (
                <>
                  <EyeOff className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Blind Mode On</span>
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Blind Mode Off</span>
                </>
              )}
            </button>
            <button
              onClick={onExit}
              className="px-4 py-2 bg-clay-ink hover:bg-neutral-800 text-white rounded-clay-md text-xs font-bold transition-all cursor-pointer shadow-sm"
            >
              Done & Exit
            </button>
          </div>
        </header>

        {/* Dashboard Content */}
        <main className="flex-1 max-w-4xl mx-auto w-full p-4 md:p-8 flex flex-col gap-8 text-left">
          
          {/* Header Title */}
          <div>
            <h1 className="font-rubik text-3xl md:text-4xl font-medium tracking-[-0.04em] text-clay-ink mb-1">
              Performance Summary
            </h1>
            <p className="text-clay-body text-xs sm:text-sm">
              Review your accuracy rate, time spent, and check explanation details below.
            </p>
          </div>

          {/* Bento Stats */}
          {config.isMockTest ? (
            (() => {
              const marksPerQ = config.marksPerQuestion || 4;
              const penaltyPerQ = config.negativeMarking || 0;

              let mockCorrectCount = 0;
              let mockIncorrectCount = 0;
              let mockSkippedCount = 0;
              let mockScore = 0;
              
              let correctTimeSum = 0;
              let incorrectTimeSum = 0;
              let skippedTimeSum = 0;

              let markedTotal = 0;
              let markedCorrect = 0;

              let switchWtoR = 0;
              let switchRtoW = 0;
              let switchWtoW = 0;
              let switchTotal = 0;

              questions.forEach(q => {
                const userChoice = selectedAnswers[q.id];
                const isCorrect = userChoice === q.correctOption;
                const isSkipped = userChoice === undefined || userChoice === -1;
                const isMarked = markedForReview[q.id] === true;
                const timeSpent = secondsTaken[q.id] || 0;

                if (isSkipped) {
                  mockSkippedCount++;
                  skippedTimeSum += timeSpent;
                } else if (isCorrect) {
                  mockCorrectCount++;
                  mockScore += marksPerQ;
                  correctTimeSum += timeSpent;
                  if (isMarked) {
                    markedTotal++;
                    markedCorrect++;
                  }
                } else {
                  mockIncorrectCount++;
                  mockScore -= penaltyPerQ;
                  incorrectTimeSum += timeSpent;
                  if (isMarked) {
                    markedTotal++;
                  }
                }

                const sw = answerSwitches[q.id];
                if (sw && sw.count > 0) {
                  switchTotal++;
                  const wasFirstCorrect = sw.first === q.correctOption;
                  const wasLastCorrect = sw.last === q.correctOption;

                  if (!wasFirstCorrect && wasLastCorrect) {
                    switchWtoR++;
                  } else if (wasFirstCorrect && !wasLastCorrect) {
                    switchRtoW++;
                  } else if (!wasFirstCorrect && !wasLastCorrect) {
                    switchWtoW++;
                  }
                }
              });

              const mockMaxScore = totalQuestions * marksPerQ;
              const avgTimeCorrect = mockCorrectCount > 0 ? Math.round(correctTimeSum / mockCorrectCount) : 0;
              const avgTimeIncorrect = mockIncorrectCount > 0 ? Math.round(incorrectTimeSum / mockIncorrectCount) : 0;
              const wastedTime = incorrectTimeSum;

              const reviewSuccessRate = markedTotal > 0 ? Math.round((markedCorrect / markedTotal) * 100) : 0;
              const switchNetGainLoss = (switchWtoR * marksPerQ) - (switchRtoW * (marksPerQ + penaltyPerQ));

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
                  const isCorrect = userChoice === q.correctOption;
                  const isSkipped = userChoice === undefined || userChoice === -1;
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
                  if (isSkipped) {
                    stats.skipped++;
                  } else if (isCorrect) {
                    stats.correct++;
                  } else {
                    stats.incorrect++;
                  }
                });

                return Array.from(map.values()).map(item => {
                  const subjectName = subjectsList.find(s => s.id === item.subjectId)?.name || 'Medical Subject';
                  const topicName = rawTopics.find((t: any) => t.id === item.topicId)?.name || 'General';
                  const accuracy = item.correct + item.incorrect > 0
                    ? Math.round((item.correct / (item.correct + item.incorrect)) * 100)
                    : 0;
                  const avgTime = Math.round(item.timeSum / item.total);

                  return {
                    ...item,
                    subjectName,
                    topicName,
                    accuracy,
                    avgTime
                  };
                });
              })();

              return (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {/* Mock Score obtained */}
                    <div className="bg-clay-teal rounded-clay-lg p-4 text-white flex flex-col justify-between min-h-[110px]">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-clay-mint">Obtained Score</span>
                      <div>
                        <span className="text-3xl font-bold font-rubik tracking-tight block">{mockScore} / {mockMaxScore}</span>
                        <span className="text-[10px] text-zinc-300">
                          {mockCorrectCount} correct · {mockIncorrectCount} wrong (penalty: -{mockIncorrectCount * penaltyPerQ})
                        </span>
                      </div>
                    </div>

                    {/* Pacing Speed */}
                    <div className="bg-clay-lavender rounded-clay-lg p-4 text-clay-ink flex flex-col justify-between min-h-[110px]">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-clay-ink/60">Pacing (Correct vs Wrong)</span>
                      <div>
                        <span className="text-xl font-bold font-rubik tracking-tight block">✓ {avgTimeCorrect}s · ✗ {avgTimeIncorrect}s</span>
                        <span className="text-[10px] text-clay-muted">Average time spent per question type</span>
                      </div>
                    </div>

                    {/* Review Success */}
                    <div className="bg-clay-peach rounded-clay-lg p-4 text-clay-ink flex flex-col justify-between min-h-[110px]">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-clay-ink/60">Review Success Rate</span>
                      <div>
                        <span className="text-3xl font-bold font-rubik tracking-tight block">{reviewSuccessRate}%</span>
                        <span className="text-[10px] text-clay-muted">
                          {markedCorrect} / {markedTotal} marked questions answered correctly
                        </span>
                      </div>
                    </div>

                    {/* Wasted Time */}
                    <div className="bg-clay-ochre rounded-clay-lg p-4 text-clay-ink flex flex-col justify-between min-h-[110px]">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-clay-ink/60">Wasted Time</span>
                      <div>
                        <span className="text-3xl font-bold font-rubik tracking-tight block">{formatTime(wastedTime)}</span>
                        <span className="text-[10px] text-clay-muted">Total time spent on incorrect questions</span>
                      </div>
                    </div>
                  </div>

                  {/* Answer Revision Analytics */}
                  <div className="bg-clay-canvas border border-clay-hairline rounded-clay-lg p-5 flex flex-col gap-4 shadow-sm text-left">
                    <h3 className="font-rubik text-base font-bold text-clay-ink tracking-tight border-b border-clay-hairline pb-2">
                      Answer Revision (Switching) Analysis
                    </h3>
                    {switchTotal > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                        <div className="grid grid-cols-3 gap-3">
                          <div className="bg-[#ecfdf5] dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 p-3 rounded-clay-md text-center">
                            <span className="block text-[10px] font-bold text-emerald-900 dark:text-emerald-300 uppercase tracking-wider">Incorrect ➔ Correct</span>
                            <span className="block text-2xl font-bold text-emerald-800 dark:text-emerald-400 mt-1">+{switchWtoR}</span>
                            <span className="block text-[9px] text-emerald-700 dark:text-emerald-500 mt-0.5">Score Gained</span>
                          </div>
                          <div className="bg-[#fff1f2] dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/40 p-3 rounded-clay-md text-center">
                            <span className="block text-[10px] font-bold text-rose-900 dark:text-rose-300 uppercase tracking-wider">Correct ➔ Incorrect</span>
                            <span className="block text-2xl font-bold text-rose-800 dark:text-rose-400 mt-1">-{switchRtoW}</span>
                            <span className="block text-[9px] text-rose-700 dark:text-rose-500 mt-0.5">Score Lost</span>
                          </div>
                          <div className="bg-clay-surface-soft border border-clay-hairline p-3 rounded-clay-md text-center">
                            <span className="block text-[10px] font-bold text-clay-muted uppercase tracking-wider">Incorrect ➔ Incorrect</span>
                            <span className="block text-2xl font-bold text-clay-ink mt-1">{switchWtoW}</span>
                            <span className="block text-[9px] text-clay-muted mt-0.5">No Change</span>
                          </div>
                        </div>
 
                        <div className="bg-clay-surface-soft/40 border border-clay-hairline rounded-clay-md p-4 flex flex-col gap-2 text-left">
                          <span className="text-[10px] font-bold text-clay-muted uppercase tracking-wider block">Net Switching Impact</span>
                          <span className={`text-2xl font-bold font-rubik ${switchNetGainLoss >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                            {switchNetGainLoss >= 0 ? `+${switchNetGainLoss}` : switchNetGainLoss} Marks
                          </span>
                          <p className="text-xs text-clay-body leading-relaxed mt-1">
                            {switchNetGainLoss > 0
                              ? "Congratulations! Reconsidering your responses led to a net increase in marks. Your secondary analysis was reliable."
                              : switchNetGainLoss < 0
                              ? "You lost marks due to second-guessing. Statistically, your first instinct was correct more often. Trust your initial response."
                              : "Your answer revisions had a neutral net impact on your score."}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-clay-muted text-xs">
                        No answers were modified during this mock exam.
                      </p>
                    )}
                  </div>

                  {/* Subject & Topic Performance Matrix */}
                  <div className="bg-clay-canvas border border-clay-hairline rounded-clay-lg p-5 flex flex-col gap-4 shadow-sm text-left overflow-x-auto">
                    <h3 className="font-rubik text-base font-bold text-clay-ink tracking-tight border-b border-clay-hairline pb-2">
                      Subject & Topic Performance Matrix
                    </h3>
                    
                    <table className="w-full text-xs text-left border-collapse min-w-[500px]">
                      <thead>
                        <tr className="border-b border-clay-hairline text-clay-muted font-bold text-[10px] uppercase tracking-wider">
                          <th className="py-2.5 pr-4">Subject & Topic</th>
                          <th className="py-2.5 px-4 text-center">Attempted / Total</th>
                          <th className="py-2.5 px-4 text-center">Correct / Wrong</th>
                          <th className="py-2.5 px-4 text-right">Accuracy</th>
                          <th className="py-2.5 pl-4 text-right">Avg Speed</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-clay-hairline/50">
                        {matrixData.map((row) => (
                          <tr key={`${row.subjectId}-${row.topicId}`} className="text-clay-ink font-medium">
                            <td className="py-3 pr-4 text-left">
                              <span className="block font-bold">{row.subjectName}</span>
                              <span className="block text-[10px] text-clay-muted">{row.topicName}</span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              {row.total - row.skipped} / {row.total}
                            </td>
                            <td className="py-3 px-4 text-center text-clay-body">
                              <span className="text-emerald-700 font-bold">{row.correct}</span> · <span className="text-rose-700 font-bold">{row.incorrect}</span>
                            </td>
                            <td className={`py-3 px-4 text-right font-bold ${
                              row.accuracy >= 70 ? 'text-emerald-700' : row.accuracy >= 45 ? 'text-clay-ochre' : 'text-rose-700'
                            }`}>
                              {row.accuracy}%
                            </td>
                            <td className="py-3 pl-4 text-right text-clay-muted font-mono">
                              {row.avgTime}s
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              );
            })()
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Accuracy */}
              <div className="bg-clay-teal rounded-clay-lg p-4 text-white flex flex-col justify-between min-h-[110px]">
                <span className="text-[10px] font-bold uppercase tracking-wider text-clay-mint">Accuracy Rate</span>
                <div>
                  <span className="text-3xl font-bold font-rubik tracking-tight block">{accuracyPercentage}%</span>
                  <span className="text-[10px] text-zinc-300">Of attempted questions</span>
                </div>
              </div>

              {/* Score */}
              <div className="bg-clay-lavender rounded-clay-lg p-4 text-clay-ink flex flex-col justify-between min-h-[110px]">
                <span className="text-[10px] font-bold uppercase tracking-wider text-clay-ink/60">Questions Solved</span>
                <div>
                  <span className="text-3xl font-bold font-rubik tracking-tight block">{correctCount} / {totalQuestions}</span>
                  <span className="text-[10px] text-clay-muted">{incorrectCount} incorrect · {unattemptedCount} skipped</span>
                </div>
              </div>

              {/* Total Time */}
              <div className="bg-clay-peach rounded-clay-lg p-4 text-clay-ink flex flex-col justify-between min-h-[110px]">
                <span className="text-[10px] font-bold uppercase tracking-wider text-clay-ink/60">Time Elapsed</span>
                <div>
                  <span className="text-3xl font-bold font-rubik tracking-tight block">{formatTime(totalElapsedSeconds)}</span>
                  <span className="text-[10px] text-clay-muted">Total test session time</span>
                </div>
              </div>

              {/* Avg Speed */}
              <div className="bg-clay-ochre rounded-clay-lg p-4 text-clay-ink flex flex-col justify-between min-h-[110px]">
                <span className="text-[10px] font-bold uppercase tracking-wider text-clay-ink/60">Avg. Speed</span>
                <div>
                  <span className="text-3xl font-bold font-rubik tracking-tight block">{averageTimePerQ}s / Q</span>
                  <span className="text-[10px] text-clay-muted">Target speed: under 50 seconds</span>
                </div>
              </div>
            </div>
          )}

          {/* Detailed Question Review List */}
          <div className="flex flex-col gap-6">
            <h2 className="font-rubik text-xl font-medium text-clay-ink tracking-tight border-b border-clay-hairline pb-2">
              Detailed Question Review
            </h2>

            {questions.map((q, idx) => {
              const userChoice = selectedAnswers[q.id];
              const isCorrect = userChoice === q.correctOption;
              const isUnattempted = userChoice === undefined || userChoice === -1;
              
              const subjectName = subjectsList.find(s => s.id === q.subjectId)?.name || 'Medical Subject';
              const qTopicName = rawTopics.find((t: any) => t.id === q.topicId)?.name;

              return (
                <div key={q.id} className="bg-clay-canvas border border-clay-hairline rounded-clay-lg p-5 flex flex-col gap-4 shadow-sm text-left">
                  {/* Review Item Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-clay-hairline pb-3">
                    <span className="text-xs font-bold text-clay-pink uppercase tracking-wider">
                      Question {idx + 1}
                    </span>
                    <div className="flex items-center gap-2">
                      {!hideTags && (
                        <>
                          <span className="px-2 py-0.5 bg-clay-surface-soft border border-clay-hairline text-clay-muted text-[10px] font-bold rounded">
                            {subjectName}
                          </span>
                          {qTopicName && (
                            <span className="px-2 py-0.5 bg-clay-surface-soft border border-clay-hairline text-clay-muted text-[10px] font-bold rounded">
                              {qTopicName}
                            </span>
                          )}
                          {(q.examType || q.examYear) && (
                            <span className="px-2 py-0.5 bg-clay-surface-soft border border-clay-hairline text-clay-muted text-[10px] font-bold rounded">
                              {[q.examType, q.examYear].filter(Boolean).join(' ')}
                            </span>
                          )}
                        </>
                      )}
                      {isUnattempted ? (
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 dark:bg-clay-surface-strong dark:text-clay-muted text-[10px] font-bold rounded">
                          Skipped
                        </span>
                      ) : isCorrect ? (
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300 text-[10px] font-bold rounded flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-700 dark:text-emerald-400" /> Correct
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-rose-100 text-rose-900 dark:bg-rose-950/30 dark:text-rose-300 text-[10px] font-bold rounded flex items-center gap-1">
                          <XCircle className="w-3 h-3 text-rose-700 dark:text-rose-400" /> Incorrect
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Question Text */}
                  <div className="text-clay-ink font-semibold text-sm leading-relaxed mb-4">
                    <MarkdownRenderer content={q.questionText} />
                  </div>

                  {q.imageUrl && (
                    <div className="mb-4 rounded-clay-lg overflow-hidden border border-clay-hairline bg-clay-surface-soft max-h-[300px] flex justify-center items-center">
                      <LocalImage 
                        srcPath={q.imageUrl} 
                        alt="Question illustration" 
                        className="max-h-[300px] object-contain cursor-zoom-in" 
                        onClick={() => handleImageZoom(q.imageUrl!)} 
                      />
                    </div>
                  )}

                  {/* Options List Review */}
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { key: 1, text: q.opa, opt: 'A' },
                      { key: 2, text: q.opb, opt: 'B' },
                      { key: 3, text: q.opc, opt: 'C' },
                      { key: 4, text: q.opd, opt: 'D' },
                    ].map(option => {
                      const isCorrectOpt = option.key === q.correctOption;
                      const isChosenOpt = option.key === userChoice;

                      let rowStyle = 'border-clay-hairline bg-white text-clay-body';
                      let badgeStyle = 'bg-clay-surface-soft text-clay-muted';

                      if (isCorrectOpt) {
                        rowStyle = 'border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-300 font-medium';
                        badgeStyle = 'bg-emerald-500 text-white';
                      } else if (isChosenOpt) {
                        rowStyle = 'border-rose-500 bg-rose-50 text-rose-900 dark:bg-rose-950/20 dark:text-rose-300 font-medium';
                        badgeStyle = 'bg-rose-500 text-white';
                      }

                      return (
                        <div
                          key={option.key}
                          className={`flex flex-col gap-3 border rounded-clay-md p-3 text-xs leading-normal ${rowStyle}`}
                        >
                          <div className="flex items-center gap-3">
                            <span className={`w-6 h-6 rounded-clay-md flex items-center justify-center font-bold text-[10px] shrink-0 ${badgeStyle}`}>
                              {option.opt}
                            </span>
                            <span className="flex-1"><MarkdownRenderer content={option.text} inline /></span>
                          </div>
                          {option.key === 1 && q.opaImageUrl && (
                            <div className="ml-9 rounded-clay-md overflow-hidden border border-clay-hairline max-h-[150px] flex justify-start bg-clay-surface-soft max-w-[250px]">
                              <LocalImage srcPath={q.opaImageUrl} alt="Option A illustration" className="max-h-[150px] object-contain cursor-zoom-in" onClick={() => handleImageZoom(q.opaImageUrl!)} />
                            </div>
                          )}
                          {option.key === 2 && q.opbImageUrl && (
                            <div className="ml-9 rounded-clay-md overflow-hidden border border-clay-hairline max-h-[150px] flex justify-start bg-clay-surface-soft max-w-[250px]">
                              <LocalImage srcPath={q.opbImageUrl} alt="Option B illustration" className="max-h-[150px] object-contain cursor-zoom-in" onClick={() => handleImageZoom(q.opbImageUrl!)} />
                            </div>
                          )}
                          {option.key === 3 && q.opcImageUrl && (
                            <div className="ml-9 rounded-clay-md overflow-hidden border border-clay-hairline max-h-[150px] flex justify-start bg-clay-surface-soft max-w-[250px]">
                              <LocalImage srcPath={q.opcImageUrl} alt="Option C illustration" className="max-h-[150px] object-contain cursor-zoom-in" onClick={() => handleImageZoom(q.opcImageUrl!)} />
                            </div>
                          )}
                          {option.key === 4 && q.opdImageUrl && (
                            <div className="ml-9 rounded-clay-md overflow-hidden border border-clay-hairline max-h-[150px] flex justify-start bg-clay-surface-soft max-w-[250px]">
                              <LocalImage srcPath={q.opdImageUrl} alt="Option D illustration" className="max-h-[150px] object-contain cursor-zoom-in" onClick={() => handleImageZoom(q.opdImageUrl!)} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Explanation Block */}
                  <div className="bg-clay-surface-soft border border-clay-hairline rounded-clay-md p-4 mt-1">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Award className="w-4 h-4 text-clay-pink" />
                      <h4 className="font-bold text-clay-ink text-[11px] uppercase tracking-wider">Explanation</h4>
                    </div>
                    <div className="text-clay-body text-xs leading-relaxed mb-3">
                      <MarkdownRenderer content={q.explanation || "No explanation provided for this question."} />
                    </div>
                    {q.explanationImageUrl && (
                      <div className="mb-3 rounded-clay-md overflow-hidden border border-clay-hairline bg-clay-surface-soft max-h-[250px] flex justify-start max-w-[350px]">
                        <LocalImage 
                          srcPath={q.explanationImageUrl} 
                          alt="Explanation illustration" 
                          className="max-h-[250px] object-contain cursor-zoom-in" 
                          onClick={() => handleImageZoom(q.explanationImageUrl!)} 
                        />
                      </div>
                    )}
                    
                    {/* Time Spent */}
                    <div className="flex items-center gap-1.5 text-[10px] text-clay-muted font-semibold">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Time spent: {secondsTaken[q.id] || 0}s</span>
                    </div>
                  </div>

                </div>
              );
            })}
          </div>

          {/* Back Action */}
          <button
            onClick={onExit}
            className="w-full bg-clay-ink hover:bg-neutral-800 text-white font-bold h-12 rounded-clay-md shadow-sm transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer text-sm mb-12"
          >
            Go to Dashboard
          </button>

        </main>
      </div>
    );
  }

  // --- ACTIVE PRACTICING VIEW ---
  const subjectName = subjectsList.find(s => s.id === activeQuestion.subjectId)?.name || 'Medical Subject';
  const topicName = rawTopics.find((t: any) => t.id === activeQuestion.topicId)?.name;
  const isExplanationRevealed = revealedQuestions[activeQuestion.id] === true;
  const timerStyleColor = secondsRemaining < 15 && config.timerMode !== 'STOPWATCH' ? 'text-rose-600 animate-pulse font-bold' : 'text-clay-ink';

  return (
    <div className="min-h-screen bg-clay-canvas text-clay-ink flex flex-col font-sans relative">
      
      {/* Header bar */}
      <header className="sticky top-0 z-50 w-full bg-clay-canvas border-b border-clay-hairline py-4 px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowExitConfirm(true)}
            className="p-1.5 rounded-clay-md border border-clay-hairline text-clay-muted hover:text-clay-ink hover:bg-clay-surface-soft transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="text-xs sm:text-sm font-bold tracking-tight text-clay-ink">
            Custom Practice Queue
          </span>
        </div>

        {/* Dynamic Controls Display */}
        <div className="flex items-center gap-2 sm:gap-4 text-xs font-bold">
          <ThemeToggle />
          <button
            onClick={() => setHideTags(prev => !prev)}
            className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-clay-md transition-all text-xs font-bold cursor-pointer ${
              hideTags
                ? 'bg-clay-ink text-white border-transparent'
                : 'bg-clay-canvas border-clay-hairline text-clay-body hover:bg-clay-surface-soft'
            }`}
            title="Toggle Blind Mode to hide subject/topic tags during practice"
          >
            {hideTags ? (
              <>
                <EyeOff className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Blind Mode On</span>
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Blind Mode Off</span>
              </>
            )}
          </button>

          <div className={`flex items-center gap-1.5 px-3 py-1.5 bg-clay-surface-soft border border-clay-hairline rounded-clay-md ${timerStyleColor}`}>
            <Timer className="w-4 h-4 text-clay-pink" />
            {config.timerMode === 'STOPWATCH' && (
              <span>Untimed: {formatTime(totalElapsedSeconds)}</span>
            )}
            {config.timerMode === 'COUNTDOWN_Q' && (
              <span>Time per question: {secondsRemaining}s</span>
            )}
            {config.timerMode === 'TOTAL_LIMIT' && (
              <span>Total Remaining: {formatTime(secondsRemaining)}</span>
            )}
          </div>

          <button
            onClick={finishTest}
            className="hidden sm:inline-block px-3.5 py-1.5 bg-clay-peach border border-clay-hairline rounded-clay-md hover:bg-orange-200 transition-all text-clay-ink cursor-pointer"
          >
            Finish Test
          </button>
        </div>
      </header>

      {/* Question Navigation Palette */}
      <div className="w-full max-w-4xl mx-auto px-4 md:px-6 mt-4">
        <div className="bg-clay-canvas border border-clay-hairline rounded-clay-lg p-3 flex items-center justify-between gap-3 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-clay-muted shrink-0 hidden xs:inline">
            CBT Palette:
          </span>
          
          {/* Scrollable tracker */}
          <div className="flex-1 flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none">
            {questions.map((q, idx) => {
              const isCurrent = idx === currentIdx;
              const hasAnswered = selectedAnswers[q.id] !== undefined;
              const isMarked = markedForReview[q.id] === true;
              const isVisited = visitedQuestions[q.id] === true;

              let statusStyle = 'border-clay-hairline border-dashed bg-transparent text-clay-muted'; // Unvisited
              
              if (isVisited) {
                if (hasAnswered) {
                  if (isMarked) {
                    statusStyle = 'bg-purple-600 border border-purple-600 text-white relative after:content-[\'\'] after:absolute after:bottom-0.5 after:right-0.5 after:w-1.5 after:h-1.5 after:bg-teal-400 after:rounded-full';
                  } else {
                    statusStyle = 'bg-[#0f766e] border border-[#0f766e] text-white';
                  }
                } else {
                  if (isMarked) {
                    statusStyle = 'bg-[#f3e8ff] border border-[#d8b4fe] text-[#7e22ce] font-bold';
                  } else {
                    statusStyle = 'bg-[#fff0f0] border border-[#fecdd3] text-[#be123c] font-bold';
                  }
                }
              }

              return (
                <button
                  key={q.id}
                  onClick={() => {
                    const qQueueIdx = sessionQueue.indexOf(idx);
                    if (qQueueIdx !== -1) {
                      setCurrentQueueIdx(qQueueIdx);
                    }
                  }}
                  className={`w-7 h-7 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 transition-all cursor-pointer ${statusStyle} ${
                    isCurrent ? 'ring-2 ring-clay-ink ring-offset-1 scale-105' : 'hover:opacity-85'
                  }`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setShowNavGrid(true)}
            className="flex items-center gap-1 px-3 py-1.5 border border-clay-hairline hover:bg-clay-surface-soft rounded-clay-md text-xs font-bold text-clay-ink cursor-pointer shrink-0 transition-all"
          >
            <span>Overview</span>
          </button>
        </div>
      </div>

      {/* Main Layout */}
      <div className="flex-1 flex flex-col w-full max-w-4xl mx-auto p-4 md:p-6 gap-6 relative z-10 text-left">
        
        {/* Solve Box Card */}
        <div className="bg-clay-canvas border border-clay-hairline rounded-clay-lg p-5 md:p-8 flex flex-col shadow-sm">
          
          {/* Question Meta Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-clay-hairline pb-4 mb-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-clay-pink">
                Question {currentQueueIdx + 1} of {sessionQueue.length}
              </span>
              {!hideTags && (
                <>
                  <span className="px-2.5 py-0.5 bg-clay-lavender/40 border border-clay-lavender/60 text-clay-ink text-[10px] font-bold rounded">
                    {subjectName}
                  </span>
                  {topicName && (
                    <span className="px-2.5 py-0.5 bg-clay-mint/40 border border-clay-mint/60 text-clay-ink text-[10px] font-bold rounded">
                      {topicName}
                    </span>
                  )}
                  {(activeQuestion.examType || activeQuestion.examYear) && (
                    <span className="px-2 py-0.5 bg-clay-peach/40 border border-clay-peach/60 text-clay-ink text-[10px] font-bold rounded">
                      {[activeQuestion.examType, activeQuestion.examYear].filter(Boolean).join(' ')}
                    </span>
                  )}
                </>
              )}
            </div>

            <button
              onClick={() => handleBookmarkToggle(activeQuestion.id)}
              className={`p-1.5 rounded-clay-md border transition-all duration-200 cursor-pointer ${
                bookmarkedIds.includes(activeQuestion.id)
                  ? 'bg-clay-ochre text-clay-ink border-clay-ochre'
                  : 'border-clay-hairline text-clay-muted hover:text-clay-ink hover:bg-clay-surface-soft'
              }`}
            >
              <Bookmark className="w-4 h-4" />
            </button>
          </div>

          {/* Question Text */}
          <div className="text-clay-ink text-base md:text-lg font-semibold leading-relaxed mb-6">
            <MarkdownRenderer content={activeQuestion.questionText} />
          </div>

          {activeQuestion.imageUrl && (
            <div className="mb-6 rounded-clay-lg overflow-hidden border border-clay-hairline bg-clay-surface-soft max-h-[350px] flex justify-center items-center">
              <LocalImage 
                srcPath={activeQuestion.imageUrl} 
                alt="Question illustration" 
                className="max-h-[350px] object-contain cursor-zoom-in" 
                onClick={() => handleImageZoom(activeQuestion.imageUrl!)} 
              />
            </div>
          )}

          {/* Question Options */}
          <div className="grid grid-cols-1 gap-3">
            {[
              { key: 1, text: activeQuestion.opa, opt: 'A' },
              { key: 2, text: activeQuestion.opb, opt: 'B' },
              { key: 3, text: activeQuestion.opc, opt: 'C' },
              { key: 4, text: activeQuestion.opd, opt: 'D' },
            ].map(option => {
              const userChoice = selectedAnswers[activeQuestion.id];
              const isSelected = userChoice === option.key;
              const isCorrect = option.key === activeQuestion.correctOption;

              let btnStyle = 'border-clay-hairline bg-white hover:bg-clay-surface-soft text-clay-ink';
              let feedbackIcon = null;

              if (isExplanationRevealed) {
                if (isSelected) {
                  if (isCorrect) {
                    btnStyle = 'border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/25 dark:text-emerald-300 font-bold';
                    feedbackIcon = <CheckCircle2 className="w-5 h-5 text-emerald-700 dark:text-emerald-400 shrink-0" />;
                  } else {
                    btnStyle = 'border-rose-500 bg-rose-50 text-rose-900 dark:bg-rose-950/25 dark:text-rose-300 font-bold';
                    feedbackIcon = <XCircle className="w-5 h-5 text-rose-700 dark:text-rose-400 shrink-0" />;
                  }
                } else if (isCorrect) {
                  btnStyle = 'border-emerald-500/30 bg-emerald-50/40 text-emerald-900 dark:bg-emerald-950/15 dark:text-emerald-400';
                } else {
                  btnStyle = 'border-clay-hairline bg-white text-clay-muted';
                }
              } else if (userChoice !== undefined) {
                if (isSelected) {
                  btnStyle = 'border-clay-teal bg-white text-clay-ink ring-2 ring-clay-teal ring-offset-1 font-bold';
                } else {
                  btnStyle = 'border-clay-hairline/80 bg-white text-clay-muted';
                }
              }

              return (
                <button
                  key={option.key}
                  onClick={() => handleOptionSelect(option.key)}
                  disabled={!config.isMockTest && userChoice !== undefined}
                  className={`w-full flex flex-col gap-3 border rounded-clay-md p-4 text-left transition-all duration-200 select-none cursor-pointer group ${btnStyle}`}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-3">
                      <span className={`w-7 h-7 rounded-clay-md flex items-center justify-center text-xs font-semibold shrink-0 transition-colors duration-200 ${
                        userChoice !== undefined
                          ? isSelected
                            ? isExplanationRevealed
                              ? isCorrect
                                ? 'bg-emerald-500 text-white'
                                : 'bg-rose-500 text-white'
                              : 'bg-clay-teal text-white'
                            : isExplanationRevealed && isCorrect
                            ? 'bg-emerald-500/20 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : 'bg-clay-surface-strong text-clay-muted'
                          : 'bg-clay-surface-soft group-hover:bg-clay-surface-strong text-clay-muted'
                      }`}>
                        {option.opt}
                      </span>
                      <span className="text-sm md:text-base leading-snug"><MarkdownRenderer content={option.text} inline /></span>
                    </div>
                    {feedbackIcon}
                  </div>
                  {option.key === 1 && activeQuestion.opaImageUrl && (
                    <div className="ml-10 rounded-clay-md overflow-hidden border border-clay-hairline max-h-[150px] flex justify-start bg-clay-surface-soft max-w-[250px]">
                      <LocalImage srcPath={activeQuestion.opaImageUrl} alt="Option A illustration" className="max-h-[150px] object-contain cursor-zoom-in" onClick={(e) => { e.stopPropagation(); handleImageZoom(activeQuestion.opaImageUrl!); }} />
                    </div>
                  )}
                  {option.key === 2 && activeQuestion.opbImageUrl && (
                    <div className="ml-10 rounded-clay-md overflow-hidden border border-clay-hairline max-h-[150px] flex justify-start bg-clay-surface-soft max-w-[250px]">
                      <LocalImage srcPath={activeQuestion.opbImageUrl} alt="Option B illustration" className="max-h-[150px] object-contain cursor-zoom-in" onClick={(e) => { e.stopPropagation(); handleImageZoom(activeQuestion.opbImageUrl!); }} />
                    </div>
                  )}
                  {option.key === 3 && activeQuestion.opcImageUrl && (
                    <div className="ml-10 rounded-clay-md overflow-hidden border border-clay-hairline max-h-[150px] flex justify-start bg-clay-surface-soft max-w-[250px]">
                      <LocalImage srcPath={activeQuestion.opcImageUrl} alt="Option C illustration" className="max-h-[150px] object-contain cursor-zoom-in" onClick={(e) => { e.stopPropagation(); handleImageZoom(activeQuestion.opcImageUrl!); }} />
                    </div>
                  )}
                  {option.key === 4 && activeQuestion.opdImageUrl && (
                    <div className="ml-10 rounded-clay-md overflow-hidden border border-clay-hairline max-h-[150px] flex justify-start bg-clay-surface-soft max-w-[250px]">
                      <LocalImage srcPath={activeQuestion.opdImageUrl} alt="Option D illustration" className="max-h-[150px] object-contain cursor-zoom-in" onClick={(e) => { e.stopPropagation(); handleImageZoom(activeQuestion.opdImageUrl!); }} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Explanation revealed */}
          {isExplanationRevealed && (
            <div className="mt-8 border-t border-clay-hairline pt-6 animate-[fadeIn_0.3s_ease-out]">
              <div className="flex items-center gap-2 mb-3">
                <Award className="w-4.5 h-4.5 text-clay-pink" />
                <h4 className="font-bold text-clay-ink text-xs uppercase tracking-wider">Explanation</h4>
              </div>
              <div className="text-clay-body text-sm leading-relaxed mb-3">
                <MarkdownRenderer content={activeQuestion.explanation || "Explanations loaded directly from CDN question pack caches."} />
              </div>
              {activeQuestion.explanationImageUrl && (
                <div className="mb-4 rounded-clay-md overflow-hidden border border-clay-hairline bg-clay-surface-soft max-h-[300px] flex justify-start max-w-[400px]">
                  <LocalImage 
                    srcPath={activeQuestion.explanationImageUrl} 
                    alt="Explanation illustration" 
                    className="max-h-[300px] object-contain cursor-zoom-in" 
                    onClick={() => handleImageZoom(activeQuestion.explanationImageUrl!)} 
                  />
                </div>
              )}
              
              <div className="flex items-center gap-1 text-[10px] text-clay-muted font-semibold">
                <Clock className="w-3.5 h-3.5" />
                <span>Time spent: {secondsTaken[activeQuestion.id] || 0}s</span>
              </div>
            </div>
          )}

          {/* Navigation controls */}
          <div className="flex items-center justify-between border-t border-clay-hairline pt-6 mt-8 gap-4 flex-wrap">
            <button
              onClick={prevQuestion}
              disabled={currentIdx === 0}
              className="px-4 py-2 border border-clay-hairline hover:bg-clay-surface-soft disabled:opacity-35 disabled:hover:bg-transparent rounded-clay-md text-clay-muted hover:text-clay-ink text-xs font-bold transition-all duration-200 cursor-pointer flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" /> Previous
            </button>

            {config.isMockTest ? (
              <>
                <div className="flex items-center gap-2">
                  {selectedAnswers[activeQuestion.id] !== undefined && (
                    <button
                      onClick={handleClearResponse}
                      className="px-3.5 py-2 border border-clay-hairline hover:bg-clay-surface-soft rounded-clay-md text-clay-muted hover:text-clay-ink text-[10px] font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer"
                    >
                      Clear Response
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setMarkedForReview(prev => ({
                        ...prev,
                        [activeQuestion.id]: !prev[activeQuestion.id]
                      }));
                    }}
                    className={`px-3.5 py-2 border rounded-clay-md text-[10px] font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${
                      markedForReview[activeQuestion.id]
                        ? 'bg-[#f3e8ff] border-[#d8b4fe] text-[#7e22ce] hover:bg-purple-100'
                        : 'border-clay-hairline text-clay-muted hover:text-clay-ink hover:bg-clay-surface-soft'
                    }`}
                  >
                    <Bookmark className={`w-3.5 h-3.5 ${markedForReview[activeQuestion.id] ? 'fill-purple-600 text-purple-600' : ''}`} />
                    <span>{markedForReview[activeQuestion.id] ? 'Marked' : 'Mark for Review'}</span>
                  </button>
                </div>

                {currentIdx === questions.length - 1 ? (
                  <button
                    onClick={finishTest}
                    className="px-6 py-2 bg-clay-ink hover:bg-neutral-800 text-white rounded-clay-md text-xs font-bold transition-all duration-200 cursor-pointer flex items-center gap-1.5 shadow-sm"
                  >
                    Submit Exam
                  </button>
                ) : (
                  <button
                    onClick={nextQuestion}
                    className="px-4 py-2 bg-clay-ink hover:bg-neutral-800 text-white rounded-clay-md text-xs font-bold transition-all duration-200 cursor-pointer flex items-center gap-1 shadow-sm"
                  >
                    Save & Next <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </>
            ) : (
              config.status === 'SPACED_REPETITION' && isExplanationRevealed && fsrsPreviews ? (
                <div className="w-full sm:w-auto flex-1 flex gap-1.5 sm:gap-2 justify-between sm:justify-end sm:pl-4">
                  {[
                    { rating: Rating.Again, label: 'Forgot', color: 'bg-clay-pink text-white hover:opacity-90' },
                    { rating: Rating.Hard, label: 'Hard', color: 'bg-clay-peach text-clay-ink hover:opacity-90' },
                    { rating: Rating.Good, label: 'Good', color: 'bg-clay-teal text-white hover:opacity-90' },
                    { rating: Rating.Easy, label: 'Easy', color: 'bg-clay-lavender text-clay-ink hover:opacity-90' },
                  ].map(item => {
                    const preview = fsrsPreviews[item.rating];
                    return (
                      <button
                        key={item.rating}
                        onClick={() => handleFSRSRate(item.rating)}
                        className={`flex-1 sm:flex-initial flex flex-col items-center justify-center rounded-clay-md py-1.5 px-2 sm:px-3 sm:min-w-[70px] transition-all cursor-pointer text-center duration-200 active:scale-95 shadow-sm ${item.color}`}
                      >
                        <span className="text-[11px] font-bold leading-tight">{item.label}</span>
                        <span className="text-[9px] opacity-90 font-medium">
                          {preview ? preview.intervalText : '...'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                currentIdx === questions.length - 1 ? (
                  <button
                    onClick={finishTest}
                    className="px-6 py-2 bg-clay-ink hover:bg-neutral-800 text-white rounded-clay-md text-xs font-bold transition-all duration-200 cursor-pointer flex items-center gap-1.5 shadow-sm"
                  >
                    Finish Test
                  </button>
                ) : (
                  <button
                    onClick={nextQuestion}
                    className="px-4 py-2 bg-clay-ink hover:bg-neutral-800 text-white rounded-clay-md text-xs font-bold transition-all duration-200 cursor-pointer flex items-center gap-1 shadow-sm"
                  >
                    Next <ChevronRight className="w-4 h-4" />
                  </button>
                )
              )
            )}
          </div>

        </div>
      </div>

      {/* Confirmation Modal */}
      {showExitConfirm && (
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-clay-canvas border border-clay-hairline rounded-clay-xl p-6 max-w-sm w-full text-left shadow-lg">
            <h4 className="font-rubik text-lg font-bold text-clay-ink mb-2">Exit Test Module?</h4>
            <p className="text-clay-body text-xs mb-6 leading-relaxed">
              Are you sure you want to exit? Your answers for this custom block will not be fully logged to the global sync statistics database.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowExitConfirm(false)}
                className="flex-1 py-2.5 border border-clay-hairline hover:bg-clay-surface-soft text-clay-muted hover:text-clay-ink text-xs font-bold rounded-clay-md cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={onExit}
                className="flex-1 py-2.5 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold rounded-clay-md cursor-pointer"
              >
                Exit Test
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Collapsible Question Grid Modal */}
      {showNavGrid && (
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-clay-canvas border border-clay-hairline rounded-clay-xl p-6 max-w-md w-full text-left shadow-lg flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center border-b border-clay-hairline pb-3 mb-4">
              <h4 className="font-rubik text-base font-bold text-clay-ink">Question Board Overview</h4>
              <button
                onClick={() => setShowNavGrid(false)}
                className="text-xs font-bold text-clay-muted hover:text-clay-ink cursor-pointer"
              >
                Close
              </button>
            </div>

            {/* Status Legend */}
            <div className="grid grid-cols-2 gap-2 mb-4 text-[10px] font-bold text-clay-muted border-b border-clay-hairline pb-4">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded bg-[#0f766e] border border-[#0f766e]" />
                <span>Answered</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded bg-[#fff0f0] border border-[#fecdd3]" />
                <span>Unanswered</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded bg-[#f3e8ff] border border-[#d8b4fe]" />
                <span>Marked</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded bg-purple-600 border border-purple-600" />
                <span>Answered & Marked</span>
              </div>
              <div className="flex items-center gap-2 col-span-2">
                <span className="w-4 h-4 rounded border border-dashed border-clay-hairline bg-transparent" />
                <span>Not Visited</span>
              </div>
            </div>

            {/* Scrollable grid of numbers */}
            <div className="flex-1 overflow-y-auto pr-2 grid grid-cols-6 sm:grid-cols-8 gap-2 pb-2">
              {questions.map((q, idx) => {
                const isCurrent = idx === currentIdx;
                const hasAnswered = selectedAnswers[q.id] !== undefined;
                const isMarked = markedForReview[q.id] === true;
                const isVisited = visitedQuestions[q.id] === true;

                let statusStyle = 'border-clay-hairline border-dashed bg-transparent text-clay-muted'; // Unvisited
                
                if (isVisited) {
                  if (hasAnswered) {
                    if (isMarked) {
                      statusStyle = 'bg-purple-600 border border-purple-600 text-white relative after:content-[\'\'] after:absolute after:bottom-0.5 after:right-0.5 after:w-1.5 after:h-1.5 after:bg-teal-400 after:rounded-full';
                    } else {
                      statusStyle = 'bg-[#0f766e] border border-[#0f766e] text-white';
                    }
                  } else {
                    if (isMarked) {
                      statusStyle = 'bg-[#f3e8ff] border border-[#d8b4fe] text-[#7e22ce] font-bold';
                    } else {
                      statusStyle = 'bg-[#fff0f0] border border-[#fecdd3] text-[#be123c] font-bold';
                    }
                  }
                }

                return (
                  <button
                    key={q.id}
                    onClick={() => {
                      const qQueueIdx = sessionQueue.indexOf(idx);
                      if (qQueueIdx !== -1) {
                        setCurrentQueueIdx(qQueueIdx);
                      }
                      setShowNavGrid(false);
                    }}
                    className={`h-9 rounded-clay-md text-xs font-bold flex items-center justify-center cursor-pointer transition-all ${statusStyle} ${
                      isCurrent ? 'ring-2 ring-clay-ink ring-offset-1 scale-105' : 'hover:opacity-85'
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Dialog */}
      <dialog 
        ref={lightboxRef} 
        className="lightbox-dialog" 
        onClick={handleDialogClick}
      >
        {zoomImageUrl && (
          <div className="relative max-w-full max-h-full flex justify-center items-center">
            <LocalImage 
              srcPath={zoomImageUrl} 
              alt="Zoomed clinical illustration" 
              className="max-w-[90vw] max-h-[90vh] object-contain rounded-clay-lg border border-clay-hairline shadow-2xl bg-clay-canvas"
            />
            <button 
              onClick={() => lightboxRef.current?.close()}
              className="absolute top-4 right-4 p-2 rounded-full bg-clay-ink/80 text-white hover:bg-clay-ink backdrop-blur-sm transition-all cursor-pointer shadow-md"
              title="Close Zoom"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        )}
      </dialog>
    </div>
  );
}
