import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  ScrollView, 
  Pressable, 
  StyleSheet, 
  TextInput, 
  Alert, 
  ActivityIndicator,
  Switch
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Timer, Play, CheckSquare, Square, ChevronDown, ChevronRight, MinusSquare } from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';
import { getDB, getFilteredQuestionsCount, getSpacedRepetitionCounts } from '@/lib/db';
import { allSubjectsList, PYQ_PAPERS, NEET_PG_PYQ_SUBJECT } from '@openmedq/shared';
import { getSubjectHierarchy } from '@/lib/hierarchy';

export default function CustomCreatorScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const router = useRouter();

  // Selections
  const [selectedSubjects, setSelectedSubjects] = useState<number[]>([5]); // Pathology default
  const [selectedTopicIds, setSelectedTopicIds] = useState<number[]>([]);
  const [expandedSubjects, setExpandedSubjects] = useState<Record<number, boolean>>({ 5: true }); // Pathology expanded by default
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UNATTEMPTED' | 'INCORRECT' | 'CORRECT' | 'BOOKMARKED' | 'SPACED_REPETITION' | 'LEECHES'>('ALL');
  const [timerMode, setTimerMode] = useState<'STOPWATCH' | 'COUNTDOWN_Q' | 'TOTAL_LIMIT'>('STOPWATCH');
  const [timerValue, setTimerValue] = useState<number>(60);
  const [customTimerText, setCustomTimerText] = useState('');

  // Mock Mode States
  const [isMockTest, setIsMockTest] = useState(false);
  const [positiveMarks, setPositiveMarks] = useState('4');
  const [negativeMarks, setNegativeMarks] = useState('1');
  const [enablePenalty, setEnablePenalty] = useState(true);
  
  const [questionLimit, setQuestionLimit] = useState<number>(10);
  const [customLimitText, setCustomLimitText] = useState('');
  const [newCardsLimit, setNewCardsLimit] = useState<number>(10);

  // States queried from db
  const [availableCount, setAvailableCount] = useState(0);
  const [srCounts, setSrCounts] = useState<{ due: number; new: number }>({ due: 0, new: 0 });
  const [isLoadingCount, setIsLoadingCount] = useState(false);
  const [subjectSeededCounts, setSubjectSeededCounts] = useState<Record<number, number>>({});
  const [isDownloadingInline, setIsDownloadingInline] = useState(false);

  // Query seeded questions count per subject on mount
  useEffect(() => {
    async function loadSeededInfo() {
      try {
        const sqlite = await getDB();
        const rows = await sqlite.getAllAsync<{ subjectId: number; count: number }>(
          'SELECT subjectId, COUNT(id) as count FROM questions GROUP BY subjectId'
        );
        const map: Record<number, number> = {};
        allSubjectsList.forEach(s => map[s.id] = 0);
        rows.forEach(r => map[r.subjectId] = r.count);
        
        // Count NEET PG questions in sqlite
        const pyqRow = await sqlite.getFirstAsync<{ count: number }>(
          "SELECT COUNT(id) as count FROM questions WHERE examType = 'NEET PG'"
        );
        map[NEET_PG_PYQ_SUBJECT.id] = pyqRow?.count || 0;
        
        setSubjectSeededCounts(map);
      } catch (err) {
        console.warn("Failed to load local pack info.");
      }
    }
    loadSeededInfo();
  }, []);

  // Get all subtopic IDs for a subject (maps years to negative IDs for virtual subject 99)
  const getSubjectSubtopicIds = (subjectId: number): number[] => {
    if (subjectId === NEET_PG_PYQ_SUBJECT.id) {
      return PYQ_PAPERS.map(p => -p.year);
    }
    try {
      const hierarchy = getSubjectHierarchy(subjectId);
      const ids: number[] = [];
      hierarchy.topics.forEach(t => {
        t.subTopics.forEach(st => {
          ids.push(st.id);
        });
      });
      return ids;
    } catch {
      return [];
    }
  };

  // Get all subtopic IDs for a specific category inside a subject
  const getCategorySubtopicIds = (subjectId: number, categoryName: string): number[] => {
    if (subjectId === NEET_PG_PYQ_SUBJECT.id) {
      return PYQ_PAPERS.map(p => -p.year);
    }
    try {
      const hierarchy = getSubjectHierarchy(subjectId);
      const category = hierarchy.topics.find(t => t.name === categoryName);
      return category ? category.subTopics.map(st => st.id) : [];
    } catch {
      return [];
    }
  };

  const getMetadataQuestionsCount = (subjIds: number[], topicIds?: number[]): number => {
    let total = 0;
    subjIds.forEach(sId => {
      const isSeeded = (subjectSeededCounts[sId] || 0) > 0;
      if (!isSeeded) {
        const subtopicIds = getSubjectSubtopicIds(sId);
        if (subtopicIds.length > 0 && topicIds && topicIds.length > 0) {
          if (sId === NEET_PG_PYQ_SUBJECT.id) {
            PYQ_PAPERS.forEach(p => {
              if (topicIds.includes(-p.year)) {
                total += p.count || 0;
              }
            });
          } else {
            try {
              const hierarchy = getSubjectHierarchy(sId);
              hierarchy.topics.forEach(t => {
                t.subTopics.forEach(st => {
                  if (topicIds.includes(st.id)) {
                    total += st.count || 0;
                  }
                });
              });
            } catch (err) {
              console.warn("Error retrieving subject categories.");
            }
          }
        } else {
          const subject = allSubjectsList.find(s => s.id === sId);
          if (subject) {
            total += subject.count || 0;
          }
        }
      }
    });
    return total;
  };

  // Update matched questions count reactively
  useEffect(() => {
    async function updateMatchCount() {
      if (selectedSubjects.length === 0) {
        setAvailableCount(0);
        return;
      }
      setIsLoadingCount(true);
      try {
        let count = 0;
        const topicIdsParam = selectedTopicIds.length > 0 ? selectedTopicIds : undefined;
        const pyqSelected = selectedSubjects.includes(NEET_PG_PYQ_SUBJECT.id);
        const selectedYears = selectedTopicIds.filter(id => id < 0).map(id => -id);
        const effectiveYears = selectedYears.length > 0 ? selectedYears : undefined;
        
        if (statusFilter === 'SPACED_REPETITION') {
          const counts = await getSpacedRepetitionCounts({ 
            subjectIds: selectedSubjects,
            topicIds: topicIdsParam,
            examType: pyqSelected ? 'NEET PG' : undefined,
            examYears: pyqSelected ? effectiveYears : undefined,
          });
          const unseededCount = getMetadataQuestionsCount(selectedSubjects, topicIdsParam);
          setSrCounts({
            due: counts.due,
            new: counts.new + unseededCount
          });
          count = counts.due + counts.new + unseededCount;
        } else if (statusFilter === 'ALL' || statusFilter === 'UNATTEMPTED') {
          const localCount = await getFilteredQuestionsCount({
            subjectIds: selectedSubjects,
            topicIds: topicIdsParam,
            status: statusFilter,
            examType: pyqSelected ? 'NEET PG' : undefined,
            examYears: pyqSelected ? effectiveYears : undefined,
          });
          count = localCount + getMetadataQuestionsCount(selectedSubjects, topicIdsParam);
        } else {
          count = await getFilteredQuestionsCount({
            subjectIds: selectedSubjects,
            topicIds: topicIdsParam,
            status: statusFilter,
            examType: pyqSelected ? 'NEET PG' : undefined,
            examYears: pyqSelected ? effectiveYears : undefined,
          });
        }
        setAvailableCount(count);
      } catch (err) {
        console.warn('Count update failed:', err);
      } finally {
        setIsLoadingCount(false);
      }
    }
    updateMatchCount();
  }, [selectedSubjects, selectedTopicIds, statusFilter, subjectSeededCounts]);

  const getReadyCount = (): number => {
    if (statusFilter === 'SPACED_REPETITION') {
      return Math.min(questionLimit, srCounts.due + Math.min(newCardsLimit, srCounts.new));
    }
    return Math.min(questionLimit, availableCount);
  };

  const handleSubjectToggle = (subjectId: number) => {
    const subtopicIds = getSubjectSubtopicIds(subjectId);
    if (subtopicIds.length === 0) {
      setSelectedSubjects(prev => {
        if (prev.includes(subjectId)) {
          if (prev.length === 1) return prev;
          return prev.filter(id => id !== subjectId);
        }
        return [...prev, subjectId];
      });
      return;
    }

    const isAllSelected = subtopicIds.every(id => selectedTopicIds.includes(id));
    
    if (isAllSelected) {
      setSelectedTopicIds(prev => prev.filter(id => !subtopicIds.includes(id)));
      setSelectedSubjects(prev => {
        if (prev.length === 1) return prev;
        return prev.filter(id => id !== subjectId);
      });
    } else {
      setSelectedTopicIds(prev => {
        const next = [...prev];
        subtopicIds.forEach(id => {
          if (!next.includes(id)) next.push(id);
        });
        return next;
      });
      setSelectedSubjects(prev => {
        if (prev.includes(subjectId)) return prev;
        return [...prev, subjectId];
      });
    }
  };

  const handleCategoryToggle = (subjectId: number, categoryName: string) => {
    const subtopicIds = getCategorySubtopicIds(subjectId, categoryName);
    if (subtopicIds.length === 0) return;

    const isAllSelected = subtopicIds.every(id => selectedTopicIds.includes(id));
    
    if (isAllSelected) {
      setSelectedTopicIds(prev => {
        const next = prev.filter(id => !subtopicIds.includes(id));
        const subjectSubtopicIds = getSubjectSubtopicIds(subjectId);
        const hasAnyLeft = subjectSubtopicIds.some(id => next.includes(id));
        if (!hasAnyLeft) {
          setSelectedSubjects(prevSubj => {
            if (prevSubj.length === 1) return prevSubj;
            return prevSubj.filter(id => id !== subjectId);
          });
        }
        return next;
      });
    } else {
      setSelectedTopicIds(prev => {
        const next = [...prev];
        subtopicIds.forEach(id => {
          if (!next.includes(id)) next.push(id);
        });
        return next;
      });
      setSelectedSubjects(prevSubj => {
        if (prevSubj.includes(subjectId)) return prevSubj;
        return [...prevSubj, subjectId];
      });
    }
  };

  const handleSubtopicToggle = (subjectId: number, subtopicId: number) => {
    setSelectedTopicIds(prev => {
      let next;
      if (prev.includes(subtopicId)) {
        next = prev.filter(id => id !== subtopicId);
      } else {
        next = [...prev, subtopicId];
      }

      const subjectSubtopicIds = getSubjectSubtopicIds(subjectId);
      const hasAny = subjectSubtopicIds.some(id => next.includes(id));
      if (hasAny) {
        setSelectedSubjects(prevSubj => {
          if (prevSubj.includes(subjectId)) return prevSubj;
          return [...prevSubj, subjectId];
        });
      } else {
        setSelectedSubjects(prevSubj => {
          if (prevSubj.length === 1) return prevSubj;
          return prevSubj.filter(id => id !== subjectId);
        });
      }

      return next;
    });
  };

  const toggleSubjectExpand = (subjectId: number) => {
    setExpandedSubjects(prev => ({ ...prev, [subjectId]: !prev[subjectId] }));
  };

  const toggleCategoryExpand = (subjectId: number, categoryName: string) => {
    const key = `${subjectId}-${categoryName}`;
    setExpandedCategories(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handlePresetLimit = (limit: number) => {
    setQuestionLimit(limit);
    setCustomLimitText('');
  };

  const handleCustomLimit = (text: string) => {
    setCustomLimitText(text);
    if (!text.trim()) return;
    const val = parseInt(text, 10);
    if (!isNaN(val) && val > 0 && val <= 200) {
      setQuestionLimit(val);
    }
  };

  const handleCustomTimer = (text: string) => {
    setCustomTimerText(text);
    if (!text.trim()) return;
    const val = parseInt(text, 10);
    if (!isNaN(val) && val > 0) {
      setTimerValue(val);
    }
  };

  const performInlineDownloads = async (unseeded: { id: number; name: string }[]) => {
    setIsDownloadingInline(true);
    try {
      const cdnUrl = process.env.EXPO_PUBLIC_CDN_URL || 'https://assets.openmedq.com';
      const sqlite = await getDB();

      for (const subj of unseeded) {
        if (subj.id === NEET_PG_PYQ_SUBJECT.id) {
          const selectedYears = selectedTopicIds.filter(id => id < 0).map(id => -id);
          const yearsToSync = selectedYears.length > 0 ? selectedYears : [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018];
          
          for (const year of yearsToSync) {
            console.log(`Inline downloading NEET PG ${year} from CDN...`);
            const res = await fetch(`${cdnUrl}/packs/neet_pg_${year}.json`);

            if (res.ok) {
              const rawQuestions = await res.json();
              if (Array.isArray(rawQuestions) && rawQuestions.length > 0) {
                // Map correctOption to 1-indexed locally for frontend compatibility (0=A => 1, etc.)
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
        } else {
          console.log(`Inline downloading subject ${subj.name} from CDN...`);
          const res = await fetch(`${cdnUrl}/packs/subject_${subj.id}.json`);

          if (!res.ok) {
            throw new Error(`Failed to download ${subj.name} pack (HTTP ${res.status})`);
          }

          const rawQuestions = await res.json();
          if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
            throw new Error(`Empty or invalid question pack for ${subj.name}`);
          }

          // Map correctOption to 1-indexed locally for frontend compatibility (0=A => 1, etc.)
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
        
        // Update local state count
        setSubjectSeededCounts(prev => ({
          ...prev,
          [subj.id]: subj.id === NEET_PG_PYQ_SUBJECT.id ? NEET_PG_PYQ_SUBJECT.count : (subjectSeededCounts[subj.id] || 0) // rough estimation for state
        }));
      }

      // Recheck actual seeded counts from database
      const sqliteRefresh = await getDB();
      const rows = await sqliteRefresh.getAllAsync<{ subjectId: number; count: number }>(
        'SELECT subjectId, COUNT(id) as count FROM questions GROUP BY subjectId'
      );
      const newSeededCounts: Record<number, number> = {};
      allSubjectsList.forEach(s => newSeededCounts[s.id] = 0);
      rows.forEach(r => newSeededCounts[r.subjectId] = r.count);
      const pyqRow = await sqliteRefresh.getFirstAsync<{ count: number }>(
        "SELECT COUNT(id) as count FROM questions WHERE examType = 'NEET PG'"
      );
      newSeededCounts[NEET_PG_PYQ_SUBJECT.id] = pyqRow?.count || 0;
      setSubjectSeededCounts(newSeededCounts);

      // Refresh matched questions count before starting
      let newCount = 0;
      let finalLimit = 0;
      const topicIdsParam = selectedTopicIds.length > 0 ? selectedTopicIds : undefined;
      const pyqSelected = selectedSubjects.includes(NEET_PG_PYQ_SUBJECT.id);
      const selectedYears = selectedTopicIds.filter(id => id < 0).map(id => -id);
      const effectiveYears = selectedYears.length > 0 ? selectedYears : undefined;
      
      if (statusFilter === 'SPACED_REPETITION') {
        const counts = await getSpacedRepetitionCounts({ 
          subjectIds: selectedSubjects,
          topicIds: topicIdsParam,
          examType: pyqSelected ? 'NEET PG' : undefined,
          examYears: pyqSelected ? effectiveYears : undefined,
        });
        newCount = counts.due + counts.new;
        finalLimit = Math.min(questionLimit, counts.due + Math.min(newCardsLimit, counts.new));
      } else {
        newCount = await getFilteredQuestionsCount({
          subjectIds: selectedSubjects,
          topicIds: topicIdsParam,
          status: statusFilter,
          examType: pyqSelected ? 'NEET PG' : undefined,
          examYears: pyqSelected ? effectiveYears : undefined,
        });
        finalLimit = Math.min(questionLimit, newCount);
      }
      setAvailableCount(newCount);

      if (finalLimit === 0) {
        Alert.alert('No Matching Questions', 'No questions match the current filters. Please change your progress filters.');
        return;
      }

      // Proceed to start test!
      router.push({
        pathname: '/practice-suite',
        params: {
          subjectIds: selectedSubjects.join(','),
          topicIds: selectedTopicIds.join(','),
          status: statusFilter,
          timerMode,
          timerValue: timerMode === 'STOPWATCH' ? 0 : timerValue,
          limit: finalLimit,
          newCardsLimit: statusFilter === 'SPACED_REPETITION' ? newCardsLimit : undefined,
          isMockTest: isMockTest ? 'true' : 'false',
          positiveMarks: Number(positiveMarks) || 4,
          negativeMarks: enablePenalty ? (Number(negativeMarks) || 1) : 0,
          examType: pyqSelected ? 'NEET PG' : undefined,
          examYears: pyqSelected && effectiveYears ? effectiveYears.join(',') : undefined,
        }
      });

    } catch (err: any) {
      console.warn('Inline download failed:', err);
      Alert.alert('Download Failed', 'Failed to retrieve question pack. Check your network connection and try again.');
    } finally {
      setIsDownloadingInline(false);
    }
  };

  const handleStartPractice = () => {
    // 1. Validate subject downloads
    const unseededSubjects: { id: number; name: string }[] = [];
    selectedSubjects.forEach(sId => {
      const seeded = subjectSeededCounts[sId] || 0;
      if (seeded === 0) {
        const subject = allSubjectsList.find(s => s.id === sId);
        if (subject) unseededSubjects.push({ id: sId, name: subject.name });
      }
    });

    if (unseededSubjects.length > 0) {
      Alert.alert(
        'Downloads Required',
        `The following subjects need to be downloaded from the CDN before starting the test:\n\n• ${unseededSubjects.map(s => s.name).join('\n• ')}\n\nWould you like to download them now and start your test?`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Download & Start',
            onPress: () => performInlineDownloads(unseededSubjects),
          }
        ]
      );
      return;
    }

    const effectiveLimit = statusFilter === 'SPACED_REPETITION'
      ? srCounts.due + Math.min(newCardsLimit, srCounts.new)
      : availableCount;
    const finalLimit = Math.min(questionLimit, effectiveLimit);

    if (finalLimit === 0) {
      Alert.alert('No Matching Questions', 'No questions match the current filters. Download more subject packs or change your progress filters.');
      return;
    }
    
    const pyqSelected = selectedSubjects.includes(NEET_PG_PYQ_SUBJECT.id);
    const selectedYears = selectedTopicIds.filter(id => id < 0).map(id => -id);
    const effectiveYears = selectedYears.length > 0 ? selectedYears : undefined;

    // Route to practice suite with parameters
    router.push({
      pathname: '/practice-suite',
      params: {
        subjectIds: selectedSubjects.join(','),
        topicIds: selectedTopicIds.join(','),
        status: statusFilter,
        timerMode,
        timerValue: timerMode === 'STOPWATCH' ? 0 : timerValue,
        limit: finalLimit,
        newCardsLimit: statusFilter === 'SPACED_REPETITION' ? newCardsLimit : undefined,
        isMockTest: isMockTest ? 'true' : 'false',
        positiveMarks: Number(positiveMarks) || 4,
        negativeMarks: enablePenalty ? (Number(negativeMarks) || 1) : 0,
        examType: pyqSelected ? 'NEET PG' : undefined,
        examYears: pyqSelected && effectiveYears ? effectiveYears.join(',') : undefined,
      }
    });
  };

  const readyCount = getReadyCount();
  const hasUnseededSelection = selectedSubjects.some(sId => (subjectSeededCounts[sId] || 0) === 0);
  const isStartDisabled = isLoadingCount || isDownloadingInline || (readyCount === 0 && !hasUnseededSelection);

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 32) }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable 
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.backButton,
            { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 }
          ]}
        >
          <ArrowLeft size={16} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Custom Creator</Text>
      </View>

      {/* Step 1: Syllabus Topic Tree */}
      <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
        <Text style={[styles.stepTitle, { color: theme.text }]}>Step 1: Select Syllabus & Topics</Text>
        
        <View style={styles.treeContainer}>
          {allSubjectsList.map(subj => {
            const isExpanded = expandedSubjects[subj.id] === true;
            const subtopicIds = getSubjectSubtopicIds(subj.id);
            const isAllSelected = subtopicIds.length > 0 && subtopicIds.every(id => selectedTopicIds.includes(id));
            const isSomeSelected = subtopicIds.length > 0 && subtopicIds.some(id => selectedTopicIds.includes(id)) && !isAllSelected;
            const isSeeded = (subjectSeededCounts[subj.id] || 0) > 0;
            
            // Get hierarchy for topics if expanded
            let hierarchy: any = null;
            if (isExpanded) {
              if (subj.id === NEET_PG_PYQ_SUBJECT.id) {
                hierarchy = {
                  subjectId: NEET_PG_PYQ_SUBJECT.id,
                  topics: [
                    {
                      name: 'NEET PG PYQs by Year',
                      count: NEET_PG_PYQ_SUBJECT.count,
                      subTopics: PYQ_PAPERS.map(p => ({
                        id: -p.year,
                        name: p.name,
                        count: p.count,
                      })),
                    },
                  ],
                };
              } else {
                try {
                  hierarchy = getSubjectHierarchy(subj.id);
                } catch (err) {
                  console.warn("Failed to load subject hierarchy.");
                }
              }
            }

            return (
              <View key={subj.id} style={styles.subjectNode}>
                {/* Subject Header Row */}
                <View style={styles.treeRow}>
                  <Pressable 
                    onPress={() => toggleSubjectExpand(subj.id)} 
                    style={styles.expandToggle}
                  >
                    {subtopicIds.length > 0 ? (
                      isExpanded ? (
                        <ChevronDown size={16} color={theme.textSecondary} />
                      ) : (
                        <ChevronRight size={16} color={theme.textSecondary} />
                      )
                    ) : (
                      <View style={{ width: 16 }} />
                    )}
                  </Pressable>

                  <Pressable 
                    onPress={() => handleSubjectToggle(subj.id)} 
                    style={styles.checkboxWrapper}
                  >
                    {isAllSelected ? (
                      <CheckSquare size={16} color={theme.teal} />
                    ) : isSomeSelected ? (
                      <MinusSquare size={16} color={theme.teal} />
                    ) : (
                      <Square size={16} color={theme.textSecondary} />
                    )}
                  </Pressable>

                  <Pressable 
                    onPress={() => toggleSubjectExpand(subj.id)}
                    style={styles.subjectNameWrapper}
                  >
                    <Text style={[styles.subjectNameText, { color: theme.text }]}>
                      {subj.name} {!isSeeded ? '☁' : ''}
                    </Text>
                    <Text style={[styles.subjectCountBadge, { color: theme.textSecondary }]}>
                      ({subjectSeededCounts[subj.id] || 0} / {subj.count} Qs)
                    </Text>
                  </Pressable>
                </View>

                {/* Level 2: Topic Categories */}
                {isExpanded && hierarchy && (
                  <View style={styles.categoriesContainer}>
                    {hierarchy.topics.map((cat: any) => {
                      const catKey = `${subj.id}-${cat.name}`;
                      const isCatExpanded = expandedCategories[catKey] === true;
                      const catSubtopicIds = getCategorySubtopicIds(subj.id, cat.name);
                      const isCatAllSelected = catSubtopicIds.every(id => selectedTopicIds.includes(id));
                      const isCatSomeSelected = catSubtopicIds.some(id => selectedTopicIds.includes(id)) && !isCatAllSelected;

                      return (
                        <View key={cat.name} style={styles.categoryNode}>
                          {/* Category Header Row */}
                          <View style={styles.treeRow}>
                            <Pressable 
                              onPress={() => toggleCategoryExpand(subj.id, cat.name)} 
                              style={styles.expandToggleCategory}
                            >
                              {isCatExpanded ? (
                                <ChevronDown size={14} color={theme.textSecondary} />
                              ) : (
                                <ChevronRight size={14} color={theme.textSecondary} />
                              )}
                            </Pressable>

                            <Pressable 
                              onPress={() => handleCategoryToggle(subj.id, cat.name)} 
                              style={styles.checkboxWrapper}
                            >
                              {isCatAllSelected ? (
                                <CheckSquare size={14} color={theme.teal} />
                              ) : isCatSomeSelected ? (
                                <MinusSquare size={14} color={theme.teal} />
                              ) : (
                                <Square size={14} color={theme.textSecondary} />
                              )}
                            </Pressable>

                            <Pressable 
                              onPress={() => toggleCategoryExpand(subj.id, cat.name)}
                              style={styles.categoryNameWrapper}
                            >
                              <Text style={[styles.categoryNameText, { color: theme.text }]}>
                                {cat.name}
                              </Text>
                              <Text style={[styles.categoryCountBadge, { color: theme.textSecondary }]}>
                                ({cat.count} Qs)
                              </Text>
                            </Pressable>
                          </View>

                          {/* Level 3: Subtopics */}
                          {isCatExpanded && (
                            <View style={styles.subtopicsContainer}>
                              {cat.subTopics.map((subtopic: any) => {
                                const isSubtopicSelected = selectedTopicIds.includes(subtopic.id);
                                return (
                                  <Pressable
                                    key={subtopic.id}
                                    onPress={() => handleSubtopicToggle(subj.id, subtopic.id)}
                                    style={styles.subtopicRow}
                                  >
                                    <View style={styles.checkboxWrapperSubtopic}>
                                      {isSubtopicSelected ? (
                                        <CheckSquare size={12} color={theme.teal} />
                                      ) : (
                                        <Square size={12} color={theme.textSecondary} />
                                      )}
                                    </View>
                                    <Text style={[styles.subtopicText, { color: theme.text }]}>
                                      {subtopic.name}
                                    </Text>
                                    <Text style={[styles.subtopicCount, { color: theme.textSecondary }]}>
                                      ({subtopic.count} Qs)
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </View>

      {/* Step 2: Progress Filters */}
      <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
        <Text style={[styles.stepTitle, { color: theme.text }]}>Step 2: Progress Filter</Text>
        <View style={styles.filtersList}>
          {[
            { id: 'ALL', name: 'All Questions', color: 'primary' },
            { id: 'UNATTEMPTED', name: 'Unattempted', color: theme.lavender },
            { id: 'SPACED_REPETITION', name: 'Revision Queue (FSRS)', color: theme.mint },
            { id: 'INCORRECT', name: 'Mistakes', color: theme.peach },
            { id: 'BOOKMARKED', name: 'Saved', color: theme.ochre },
          ].map(filter => {
            const isActive = statusFilter === filter.id;
            let btnBg = theme.backgroundElement;
            let btnBorder = theme.hairline;
            let btnTextCol = theme.textSecondary;

            if (isActive) {
              if (filter.id === 'ALL') {
                btnBg = theme.primary;
                btnBorder = theme.primary;
                btnTextCol = theme.background;
              } else {
                btnBg = filter.color;
                btnBorder = filter.color;
                btnTextCol = '#0a0a0a';
              }
            }

            return (
              <Pressable
                key={filter.id}
                onPress={() => setStatusFilter(filter.id as any)}
                style={({ pressed }) => [
                  styles.filterBtn,
                  { 
                    backgroundColor: btnBg,
                    borderColor: btnBorder,
                    opacity: pressed ? 0.8 : 1
                  }
                ]}
              >
                <Text style={[styles.filterBtnText, { color: btnTextCol, fontWeight: isActive ? 'bold' : 'normal' }]}>
                  {filter.name}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {statusFilter === 'SPACED_REPETITION' && (
          <View style={styles.newQsSection}>
            <Text style={[styles.newQsLabel, { color: theme.textSecondary }]}>
              New cards limit in review block:
            </Text>
            <View style={styles.newQsGrid}>
              {[0, 5, 10, 20].map(val => (
                <Pressable
                  key={val}
                  onPress={() => setNewCardsLimit(val)}
                  style={({ pressed }) => [
                    styles.newQsBtn,
                    { 
                      backgroundColor: newCardsLimit === val ? theme.teal : theme.background,
                      borderColor: theme.hairline,
                      opacity: pressed ? 0.8 : 1
                    }
                  ]}
                >
                  <Text style={{ color: newCardsLimit === val ? theme.background : theme.text, fontSize: 11, fontWeight: 'bold' }}>
                    {val === 0 ? 'Review Only' : `+${val}`}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </View>

      {/* Exam Mode Toggle Card */}
      <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
        <View style={styles.cardHeader}>
          <CheckSquare size={16} color={theme.pink} />
          <Text style={[styles.stepTitle, { color: theme.text }]}>Exam Mode Options</Text>
        </View>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.settingLabel, { color: theme.text }]}>Mock Exam Simulation</Text>
            <Text style={[styles.settingDesc, { color: theme.textSecondary }]}>
              Simulates standard exam console rules. Hides validation badges, disables per-Q timers, and calculates penalty scores.
            </Text>
          </View>
          <Switch
            value={isMockTest}
            onValueChange={(val) => {
              setIsMockTest(val);
              if (val) {
                setTimerMode('TOTAL_LIMIT');
                setTimerValue(15);
              } else {
                setTimerMode('STOPWATCH');
              }
            }}
            trackColor={{ false: theme.background, true: theme.pink }}
            thumbColor={isMockTest ? '#ffffff' : theme.textSecondary}
          />
        </View>

        {isMockTest && (
          <View style={styles.mockMarksContainer}>
            <View style={styles.markInputRow}>
              <Text style={[styles.timerDesc, { color: theme.textSecondary }]}>Correct answer reward (marks):</Text>
              <TextInput
                value={positiveMarks}
                onChangeText={setPositiveMarks}
                keyboardType="numeric"
                style={[
                  styles.numericInput,
                  { backgroundColor: theme.background, borderColor: theme.hairline, color: theme.text }
                ]}
              />
            </View>

            <View style={[styles.toggleRow, { marginTop: 8 }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.settingLabel, { color: theme.text, fontSize: 13 }]}>Negative Marking Penalty</Text>
              </View>
              <Switch
                value={enablePenalty}
                onValueChange={setEnablePenalty}
                trackColor={{ false: theme.background, true: theme.pink }}
                thumbColor={enablePenalty ? '#ffffff' : theme.textSecondary}
              />
            </View>

            {enablePenalty && (
              <View style={[styles.markInputRow, { marginTop: 8 }]}>
                <Text style={[styles.timerDesc, { color: theme.textSecondary }]}>Incorrect answer penalty (marks):</Text>
                <TextInput
                  value={negativeMarks}
                  onChangeText={setNegativeMarks}
                  keyboardType="numeric"
                  style={[
                    styles.numericInput,
                    { backgroundColor: theme.background, borderColor: theme.hairline, color: theme.text }
                  ]}
                />
              </View>
            )}
          </View>
        )}
      </View>

      {/* Step 3: Timer mode */}
      <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
        <View style={styles.cardHeader}>
          <Timer size={16} color={theme.pink} />
          <Text style={[styles.stepTitle, { color: theme.text }]}>Step 3: Timing Option</Text>
        </View>

        {isMockTest ? (
          <View style={{ paddingVertical: 4 }}>
            <Text style={{ color: theme.textSecondary, fontSize: 12, lineHeight: 16 }}>
              ⏱️ Mock Exam is active. The timer is locked to a **Total Test Limit** to simulate standard examination pacing.
            </Text>
            <View style={[styles.timerValRow, { marginTop: 12 }]}>
              <Text style={[styles.timerDesc, { color: theme.textSecondary }]}>Total test duration (minutes):</Text>
              <TextInput
                value={customTimerText || String(timerValue)}
                onChangeText={handleCustomTimer}
                keyboardType="numeric"
                style={[
                  styles.numericInput,
                  { backgroundColor: theme.background, borderColor: theme.hairline, color: theme.text }
                ]}
              />
            </View>
          </View>
        ) : (
          <>
            <View style={styles.timerGrid}>
              {[
                { id: 'STOPWATCH', name: 'Untimed' },
                { id: 'COUNTDOWN_Q', name: 'Per Q (sec)' },
                { id: 'TOTAL_LIMIT', name: 'Total (min)' },
              ].map(mode => {
                const isActive = timerMode === mode.id;
                return (
                  <Pressable
                    key={mode.id}
                    onPress={() => {
                      setTimerMode(mode.id as any);
                      setTimerValue(mode.id === 'COUNTDOWN_Q' ? 60 : 15);
                      setCustomTimerText('');
                    }}
                    style={({ pressed }) => [
                      styles.timerBtn,
                      { 
                        backgroundColor: isActive ? theme.primary : theme.background,
                        borderColor: theme.hairline,
                        opacity: pressed ? 0.8 : 1
                      }
                    ]}
                  >
                    <Text style={[styles.timerBtnText, { color: isActive ? theme.background : theme.text }]}>
                      {mode.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {timerMode === 'COUNTDOWN_Q' && (
              <View style={styles.timerValRow}>
                <Text style={[styles.timerDesc, { color: theme.textSecondary }]}>Time limit per question:</Text>
                <View style={styles.timerInputs}>
                  {[30, 45, 60, 90].map(val => (
                    <Pressable
                      key={val}
                      onPress={() => setTimerValue(val)}
                      style={[
                        styles.timerValPill,
                        { backgroundColor: timerValue === val ? theme.pink : theme.background, borderColor: theme.hairline }
                      ]}
                    >
                      <Text style={{ color: timerValue === val ? '#ffffff' : theme.text, fontSize: 11, fontWeight: 'bold' }}>{val}s</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {timerMode === 'TOTAL_LIMIT' && (
              <View style={styles.timerValRow}>
                <Text style={[styles.timerDesc, { color: theme.textSecondary }]}>Total test duration (minutes):</Text>
                <TextInput
                  value={customTimerText || String(timerValue)}
                  onChangeText={handleCustomTimer}
                  keyboardType="numeric"
                  style={[
                    styles.numericInput,
                    { backgroundColor: theme.background, borderColor: theme.hairline, color: theme.text }
                  ]}
                />
              </View>
            )}
          </>
        )}
      </View>

      {/* Step 4: Question Count */}
      <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
        <Text style={[styles.stepTitle, { color: theme.text }]}>Step 4: Question Limit</Text>
        <View style={styles.presetsGrid}>
          {[5, 10, 20, 50].map(val => (
            <Pressable
              key={val}
              onPress={() => handlePresetLimit(val)}
              style={({ pressed }) => [
                styles.presetBtn,
                { 
                  backgroundColor: questionLimit === val && !customLimitText ? theme.primary : theme.background,
                  borderColor: theme.hairline,
                  opacity: pressed ? 0.8 : 1
                }
              ]}
            >
              <Text style={{ color: (questionLimit === val && !customLimitText) ? theme.background : theme.text, fontSize: 12, fontWeight: 'bold' }}>
                {val} Qs
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.customCountRow}>
          <Text style={[styles.timerDesc, { color: theme.textSecondary }]}>Or enter custom limit (max 200):</Text>
          <TextInput
            value={customLimitText}
            onChangeText={handleCustomLimit}
            keyboardType="numeric"
            placeholder="e.g. 15"
            placeholderTextColor={theme.textSecondary}
            style={[
              styles.numericInput,
              { backgroundColor: theme.background, borderColor: theme.hairline, color: theme.text }
            ]}
          />
        </View>
      </View>

      {/* Matches summary and action */}
      <View style={[styles.summaryBox, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>MATCHING QUESTIONS</Text>
          {isLoadingCount ? (
            <ActivityIndicator size="small" color={theme.pink} style={{ alignSelf: 'flex-start', marginTop: 4 }} />
          ) : (
            <View style={{ marginTop: 2 }}>
              <Text style={[styles.summaryVal, { color: theme.text }]}>
                {readyCount} Qs ready
              </Text>
              {statusFilter === 'SPACED_REPETITION' ? (
                <Text style={{ fontSize: 10, color: theme.textSecondary, marginTop: 2 }}>
                  ({srCounts.due} due • +{Math.min(newCardsLimit, srCounts.new)} new)
                </Text>
              ) : (
                availableCount > readyCount && (
                  <Text style={{ fontSize: 10, color: theme.textSecondary, marginTop: 2 }}>
                    (out of {availableCount} total)
                  </Text>
                )
              )}
            </View>
          )}
        </View>

        <Pressable
          onPress={handleStartPractice}
          disabled={isStartDisabled}
          style={({ pressed }) => [
            styles.startButton,
            { 
              backgroundColor: theme.pink,
              opacity: pressed || isStartDisabled ? 0.8 : 1 
            }
          ]}
        >
          {isDownloadingInline ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Play size={14} color="#ffffff" />
          )}
          <Text style={styles.startButtonText}>
            {isDownloadingInline ? 'Downloading...' : 'Start Test'}
          </Text>
        </Pressable>
      </View>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 12,
  },
  backButton: {
    padding: 8,
    borderRadius: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  card: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  subjectsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  subjectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    width: '48%',
    flexGrow: 1,
  },
  subjectBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    flex: 1,
  },
  filtersList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  filterBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    flexGrow: 1,
  },
  filterBtnText: {
    fontSize: 12,
    textAlign: 'center',
  },
  newQsSection: {
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
    paddingTop: 8,
    gap: 6,
  },
  newQsLabel: {
    fontSize: 11,
  },
  newQsGrid: {
    flexDirection: 'row',
    gap: 6,
  },
  newQsBtn: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
  },
  timerGrid: {
    flexDirection: 'row',
    gap: 6,
  },
  timerBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  timerBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  timerValRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  timerDesc: {
    fontSize: 12,
    flex: 1,
  },
  timerInputs: {
    flexDirection: 'row',
    gap: 4,
  },
  timerValPill: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  numericInput: {
    borderWidth: 1,
    borderRadius: 8,
    width: 70,
    paddingVertical: 6,
    paddingHorizontal: 10,
    fontSize: 13,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  presetsGrid: {
    flexDirection: 'row',
    gap: 6,
  },
  presetBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  customCountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  summaryBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 8,
  },
  summaryLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  summaryVal: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 2,
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    gap: 8,
  },
  startButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 12,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  settingDesc: {
    fontSize: 11,
    marginTop: 2,
    maxWidth: 220,
  },
  mockMarksContainer: {
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
    paddingTop: 8,
    gap: 8,
  },
  markInputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  // Syllabus Tree styles
  treeContainer: {
    marginTop: 4,
    gap: 8,
  },
  subjectNode: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.06)',
    paddingBottom: 4,
  },
  treeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  expandToggle: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  expandToggleCategory: {
    padding: 6,
    marginLeft: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxWrapper: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxWrapperSubtopic: {
    padding: 6,
    marginLeft: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  subjectNameWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 4,
  },
  subjectNameText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  subjectCountBadge: {
    fontSize: 10,
  },
  categoriesContainer: {
    paddingLeft: 6,
    backgroundColor: 'rgba(0,0,0,0.01)',
  },
  categoryNode: {
    marginBottom: 2,
  },
  categoryNameWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 4,
  },
  categoryNameText: {
    fontSize: 12,
    fontWeight: '600',
  },
  categoryCountBadge: {
    fontSize: 9,
  },
  subtopicsContainer: {
    paddingBottom: 4,
  },
  subtopicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  subtopicText: {
    fontSize: 11,
    flex: 1,
    paddingLeft: 4,
  },
  subtopicCount: {
    fontSize: 9,
    paddingRight: 8,
  },
});
