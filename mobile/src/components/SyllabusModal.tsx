import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Modal, 
  Pressable, 
  ScrollView, 
  ActivityIndicator 
} from 'react-native';
import { useRouter } from 'expo-router';
import { 
  X, 
  Play, 
  ChevronDown, 
  ChevronRight, 
  Download, 
  CheckCircle,
  BookOpen
} from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';
import { Fonts } from '@/constants/theme';
import { getDB, getSyllabusProgress } from '@/lib/db';
import { getSubjectHierarchy, type TopicNode } from '@/lib/hierarchy';
import { subjectsList, PYQ_PAPERS, NEET_PG_PYQ_SUBJECT } from '@openmedq/shared';
import { api } from '@/lib/api';

interface SyllabusModalProps {
  subjectId: number | null;
  onClose: () => void;
  onProgressChange?: () => void;
}

export function SyllabusModal({ subjectId, onClose, onProgressChange }: SyllabusModalProps) {
  const theme = useTheme();
  const router = useRouter();

  const [expandedTopics, setExpandedTopics] = useState<Record<string, boolean>>({});
  const [downloadingIds, setDownloadingIds] = useState<Set<number>>(new Set());
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);
  const [solvedProgress, setSolvedProgress] = useState<Record<number, number>>({});
  const [cachedCounts, setCachedCounts] = useState<Record<number, number>>({});
  const [isLoading, setIsLoading] = useState(false);

  // Find subject details
  const subject = subjectId === NEET_PG_PYQ_SUBJECT.id 
    ? NEET_PG_PYQ_SUBJECT
    : subjectsList.find(s => s.id === subjectId);
  // Retrieve subject hierarchy
  const hierarchy = subjectId === NEET_PG_PYQ_SUBJECT.id 
    ? {
        subjectId: NEET_PG_PYQ_SUBJECT.id,
        topics: [
          {
            name: 'NEET PG PYQs by Year',
            count: NEET_PG_PYQ_SUBJECT.count,
            subTopics: PYQ_PAPERS.map(p => ({
              id: -p.year,
              subjectId: NEET_PG_PYQ_SUBJECT.id,
              name: p.name,
              count: p.count
            }))
          }
        ]
      }
    : (subjectId ? getSubjectHierarchy(subjectId) : null);

  // Load progress and cache data from SQLite
  const loadProgressData = useCallback(async () => {
    if (!subjectId) return;
    try {
      if (subjectId === NEET_PG_PYQ_SUBJECT.id) {
        const sqlite = await getDB();
        const solvedProgress: Record<number, number> = {};
        const cachedCounts: Record<number, number> = {};
        
        for (const p of PYQ_PAPERS) {
          const seededRow = await sqlite.getFirstAsync<{ count: number }>(
            "SELECT COUNT(id) as count FROM questions WHERE examType = 'NEET PG' AND examYear = ?",
            [p.year]
          );
          const solvedRow = await sqlite.getFirstAsync<{ count: number }>(
            `SELECT COUNT(p.questionId) as count 
             FROM progress p 
             JOIN questions q ON p.questionId = q.id 
             WHERE q.examType = 'NEET PG' AND q.examYear = ? AND p.status IN ('CORRECT', 'INCORRECT') AND p.isDeleted = 0`,
            [p.year]
          );
          
          cachedCounts[-p.year] = seededRow?.count || 0;
          solvedProgress[-p.year] = solvedRow?.count || 0;
        }
        
        setSolvedProgress(solvedProgress);
        setCachedCounts(cachedCounts);
        return;
      }
      
      const data = await getSyllabusProgress(subjectId);
      setSolvedProgress(data.solvedProgress);
      setCachedCounts(data.cachedCounts);
    } catch (err) {
      console.warn('Failed to load syllabus progress.');
    }
  }, [subjectId]);

  useEffect(() => {
    if (subjectId) {
      Promise.resolve().then(() => {
        setIsLoading(true);
        loadProgressData().finally(() => setIsLoading(false));
      });
    }
  }, [subjectId, loadProgressData]);

  if (!subjectId || !subject || !hierarchy) return null;

  const toggleTopic = (topicName: string) => {
    setExpandedTopics(prev => ({
      ...prev,
      [topicName]: !prev[topicName]
    }));
  };

  // Download a single subtopic
  const downloadSubTopic = async (subId: number, silent = false) => {
    if (downloadingIds.has(subId)) return;

    setDownloadingIds(prev => {
      const next = new Set(prev);
      next.add(subId);
      return next;
    });

    try {
      if (subjectId === NEET_PG_PYQ_SUBJECT.id) {
        const year = -subId;
        const cdnUrl = process.env.EXPO_PUBLIC_CDN_URL || 'https://assets.openmedq.com';
        const res = await fetch(`${cdnUrl}/packs/neet_pg_${year}.json`);
        if (res.ok) {
          const rawQuestions = await res.json();
          if (Array.isArray(rawQuestions) && rawQuestions.length > 0) {
            const formattedQuestions = rawQuestions.map((q: any) => ({
              ...q,
              correctOption: typeof q.correctOption === 'number' && q.correctOption >= 0 && q.correctOption <= 3
                ? q.correctOption + 1
                : q.correctOption,
            }));
            const sqlite = await getDB();
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
            if (!silent) {
              await loadProgressData();
              onProgressChange?.();
            }
          }
        }
        return;
      }

      const cdnUrl = process.env.EXPO_PUBLIC_CDN_URL || 'https://pub-9cffcd4fe5774485889f8d5ce5999219.r2.dev';
      const res = await fetch(`${cdnUrl}/packs/subject_${subjectId}_topic_${subId}.json`);

      if (res.ok) {
        const rawQuestions = await res.json();
        if (Array.isArray(rawQuestions) && rawQuestions.length > 0) {
          const formattedQuestions = rawQuestions.map((q: any) => ({
            ...q,
            correctOption: typeof q.correctOption === 'number' && q.correctOption >= 0 && q.correctOption <= 3
              ? q.correctOption + 1
              : q.correctOption,
          }));
          const sqlite = await getDB();
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
          if (!silent) {
            await loadProgressData();
            onProgressChange?.();
          }
        }
      }
    } catch (err) {
      console.warn('Failed to cache subtopic.');
    } finally {
      setDownloadingIds(prev => {
        const next = new Set(prev);
        next.delete(subId);
        return next;
      });
    }
  };

  // Download all subtopics under a category
  const downloadTopic = async (topicName: string, subTopics: { id: number; count: number }[]) => {
    setDownloadStatus(`Downloading ${topicName}...`);
    try {
      const uncached = subTopics.filter(sub => {
        const cached = cachedCounts[sub.id] || 0;
        return cached < sub.count && cached < Math.floor(sub.count * 0.95);
      });
      if (uncached.length === 0) {
        setDownloadStatus('Topic already offline!');
        setTimeout(() => setDownloadStatus(null), 1500);
        return;
      }

      // Download sequential batch
      for (const sub of uncached) {
        await downloadSubTopic(sub.id, true);
      }
      
      setDownloadStatus('Topic cached successfully!');
      await loadProgressData();
      onProgressChange?.();
    } catch {
      setDownloadStatus('Download failed');
    } finally {
      setTimeout(() => setDownloadStatus(null), 1500);
    }
  };

  // Download the entire subject pack
  const downloadSubject = async () => {
    setDownloadStatus('Downloading complete subject...');
    try {
      if (subjectId === NEET_PG_PYQ_SUBJECT.id) {
        const cdnUrl = process.env.EXPO_PUBLIC_CDN_URL || 'https://assets.openmedq.com';
        const sqlite = await getDB();
        
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
          setDownloadStatus(`Caching ${formattedQuestions.length} questions...`);
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
          setDownloadStatus('Subject cached successfully!');
          await loadProgressData();
          onProgressChange?.();
        } else {
          setDownloadStatus('No questions found');
        }
        return;
      }

      const res = await api.api.questions['subject-pack'].$get({
        query: {
          subjectId: String(subjectId),
        },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.questions && data.questions.length > 0) {
          setDownloadStatus(`Caching ${data.questions.length} questions...`);
          const sqlite = await getDB();
          await sqlite.withTransactionAsync(async () => {
            for (const q of data.questions) {
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
          setDownloadStatus('Subject cached successfully!');
          await loadProgressData();
          onProgressChange?.();
        } else {
          setDownloadStatus('No questions found');
        }
      } else {
        setDownloadStatus('Server error');
      }
    } catch (err) {
      console.warn('Failed to download subject pack.');
      setDownloadStatus('Error downloading');
    } finally {
      setTimeout(() => setDownloadStatus(null), 1500);
    }
  };

  // Progress computations
  const totalSubtopicSolved = Object.values(solvedProgress).reduce((sum, count) => sum + count, 0);
  const overallSolvedPercent = Math.min(100, Math.round((totalSubtopicSolved / subject.count) * 100));

  // Use 95% tolerance — minor count drift between hierarchy and actual R2 packs should not block cached status
  const isSubTopicCached = (subId: number, count: number) => {
    const cached = cachedCounts[subId] || 0;
    return cached >= count || cached >= Math.floor(count * 0.95);
  };
  const isSubjectFullyCached = hierarchy.topics.every(t => 
    t.subTopics.every(sub => isSubTopicCached(sub.id, sub.count))
  );

  const getTopicSolvedCount = (topic: TopicNode) => {
    return topic.subTopics.reduce((sum, sub) => sum + (solvedProgress[sub.id] || 0), 0);
  };

  const handleStartPractice = (subtopicIds?: number[], limit = 10) => {
    onClose();
    if (subjectId === NEET_PG_PYQ_SUBJECT.id) {
      router.push({
        pathname: '/practice-suite',
        params: {
          subjectIds: '',
          status: 'ALL',
          timerMode: 'STOPWATCH',
          timerValue: 0,
          limit,
          examType: 'NEET PG',
          examYear: subtopicIds && subtopicIds.length === 1 ? String(-subtopicIds[0]) : '',
          isStandard: 'true'
        }
      });
      return;
    }
    router.push({
      pathname: '/practice-suite',
      params: {
        subjectIds: String(subjectId),
        topicIds: subtopicIds ? subtopicIds.join(',') : '',
        status: 'ALL',
        timerMode: 'STOPWATCH',
        timerValue: 0,
        limit,
        isStandard: 'true'
      }
    });
  };

  return (
    <Modal
      visible={true}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        {/* Backdrop dismiss helper */}
        <Pressable style={styles.backdrop} onPress={onClose} />

        {/* Slide-up sheet */}
        <View style={[styles.sheetContainer, { backgroundColor: theme.background, borderColor: theme.hairline }]}>
          
          {/* Header Panel */}
          <View style={[styles.header, { borderBottomColor: theme.hairline }]}>
            <View style={styles.headerLeft}>
              <BookOpen size={20} color={theme.pink} style={styles.headerIcon} />
              <Text numberOfLines={1} style={[styles.headerTitle, { color: theme.text }]}>
                Syllabus: {subject.name}
              </Text>
            </View>
            <Pressable onPress={onClose} style={[styles.closeButton, { borderColor: theme.hairline }]}>
              <X size={16} color={theme.textSecondary} />
            </Pressable>
          </View>

          {isLoading ? (
            <View style={styles.loaderContainer}>
              <ActivityIndicator size="large" color={theme.pink} />
              <Text style={[styles.loaderText, { color: theme.textSecondary }]}>Loading syllabus info...</Text>
            </View>
          ) : (
            <ScrollView 
              style={styles.scrollContent}
              contentContainerStyle={styles.scrollInner}
              showsVerticalScrollIndicator={false}
            >
              {/* Subject level progress bar */}
              <View style={[styles.progressCard, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
                <View style={styles.progressTextRow}>
                  <Text style={[styles.progressLabel, { color: theme.text }]}>Completion Progress</Text>
                  <Text style={[styles.progressPercent, { color: theme.text }]}>
                    {overallSolvedPercent}% ({totalSubtopicSolved} / {subject.count} Qs)
                  </Text>
                </View>
                <View style={[styles.progressBarBg, { backgroundColor: theme.background }]}>
                  <View style={[styles.progressBarFill, { width: `${overallSolvedPercent}%`, backgroundColor: theme.teal }]} />
                </View>
              </View>

              {downloadStatus && (
                <View style={[styles.statusBanner, { backgroundColor: theme.lavender }]}>
                  <ActivityIndicator size="small" color="#0a0a0a" style={{ marginRight: 6 }} />
                  <Text style={styles.statusBannerText}>{downloadStatus}</Text>
                </View>
              )}

              {/* Action Buttons */}
              <View style={styles.actionRow}>
                <Pressable
                  onPress={() => handleStartPractice(undefined, 20)}
                  style={({ pressed }) => [
                    styles.practiceAllButton,
                    { backgroundColor: theme.text, opacity: pressed ? 0.9 : 1 }
                  ]}
                >
                  <Play size={14} color={theme.background} fill={theme.background} />
                  <Text style={[styles.practiceAllText, { color: theme.background }]}>
                    Practice Entire Subject
                  </Text>
                </Pressable>

                {isSubjectFullyCached ? (
                  <View style={[styles.cachedBadge, { borderColor: 'rgba(34, 197, 94, 0.2)', backgroundColor: 'rgba(34, 197, 94, 0.05)' }]}>
                    <CheckCircle size={14} color={theme.success} />
                    <Text style={[styles.cachedBadgeText, { color: theme.success }]}>Fully Cached</Text>
                  </View>
                ) : (
                  <Pressable
                    onPress={downloadSubject}
                    style={({ pressed }) => [
                      styles.downloadButton,
                      { borderColor: theme.pink, opacity: pressed ? 0.8 : 1 }
                    ]}
                  >
                    <Download size={14} color={theme.pink} />
                    <Text style={[styles.downloadButtonText, { color: theme.pink }]}>Download All</Text>
                  </Pressable>
                )}
              </View>

              <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
                CURRICULUM TOPICS
              </Text>

              {/* Topics list */}
              <View style={styles.topicsContainer}>
                {hierarchy.topics.map(topic => {
                  const isExpanded = expandedTopics[topic.name] === true;
                  const topicSolved = getTopicSolvedCount(topic);
                  const topicPct = Math.min(100, Math.round((topicSolved / topic.count) * 100));
                  const subTopicIds = topic.subTopics.map(sub => sub.id);

                  const isTopicFullyCached = topic.subTopics.every(sub => isSubTopicCached(sub.id, sub.count));
                  const isTopicDownloading = topic.subTopics.some(sub => downloadingIds.has(sub.id));

                  return (
                    <View 
                      key={topic.name}
                      style={[styles.topicCard, { borderColor: theme.hairline }]}
                    >
                      {/* Accordion header */}
                      <Pressable 
                        onPress={() => toggleTopic(topic.name)}
                        style={[styles.topicHeader, { backgroundColor: theme.backgroundElement }]}
                      >
                        <View style={styles.topicHeaderLeft}>
                          <View style={styles.topicTitleRow}>
                            <Text numberOfLines={1} style={[styles.topicName, { color: theme.text }]}>
                              {topic.name}
                            </Text>
                            <View style={[styles.pillBadge, { backgroundColor: theme.background }]}>
                              <Text style={[styles.pillText, { color: theme.textSecondary }]}>
                                {topic.count} Qs
                              </Text>
                            </View>
                          </View>
                          
                          {/* Mini progress bar */}
                          <View style={styles.miniProgressRow}>
                            <View style={[styles.miniProgressBarBg, { backgroundColor: theme.background }]}>
                              <View style={[styles.miniProgressBarFill, { width: `${topicPct}%`, backgroundColor: theme.teal }]} />
                            </View>
                            <Text style={[styles.miniProgressPercent, { color: theme.textSecondary }]}>
                              {topicPct}%
                            </Text>
                          </View>
                        </View>

                        <View style={styles.topicHeaderRight}>
                          <Pressable
                            onPress={() => handleStartPractice(subTopicIds, 15)}
                            style={styles.miniPracticeButton}
                          >
                            <Play size={10} color={theme.text} fill={theme.text} />
                          </Pressable>

                          {isTopicFullyCached ? (
                            <CheckCircle size={14} color={theme.success} />
                          ) : isTopicDownloading ? (
                            <ActivityIndicator size="small" color={theme.pink} />
                          ) : (
                            <Pressable 
                              onPress={() => downloadTopic(topic.name, topic.subTopics)}
                              style={styles.iconAction}
                            >
                              <Download size={14} color={theme.textSecondary} />
                            </Pressable>
                          )}

                          {isExpanded ? (
                            <ChevronDown size={16} color={theme.textSecondary} style={{ transform: [{ rotate: '180deg' }] }} />
                          ) : (
                            <ChevronRight size={16} color={theme.textSecondary} />
                          )}
                        </View>
                      </Pressable>

                      {/* Accordion body (Subtopics list) */}
                      {isExpanded && (
                        <View style={[styles.subtopicsList, { backgroundColor: theme.background, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline }]}>
                          {topic.subTopics.map(sub => {
                            const subSolved = solvedProgress[sub.id] || 0;
                            const subPct = Math.min(100, Math.round((subSolved / sub.count) * 100));
                            const isSubCached = isSubTopicCached(sub.id, sub.count);
                            const isSubDownloading = downloadingIds.has(sub.id);

                            return (
                              <View 
                                key={sub.id}
                                style={[styles.subtopicRow, { borderBottomColor: theme.hairline }]}
                              >
                                <View style={styles.subtopicLeft}>
                                  <Text numberOfLines={1} style={[styles.subtopicName, { color: theme.text }]}>
                                    {sub.name === 'General Practice' ? `${subject.name} - General` : sub.name}
                                  </Text>
                                  <View style={styles.subtopicMeta}>
                                    <Text style={[styles.subtopicCount, { color: theme.textSecondary }]}>
                                      {sub.count} Qs
                                    </Text>
                                    {subSolved > 0 && (
                                      <Text style={[styles.subtopicSolved, { color: theme.success }]}>
                                        • {subSolved} solved ({subPct}%)
                                      </Text>
                                    )}
                                  </View>
                                </View>

                                <View style={styles.subtopicRight}>
                                  {subjectId === NEET_PG_PYQ_SUBJECT.id ? (
                                    <View style={{ flexDirection: 'row', gap: 6 }}>
                                      <Pressable
                                        onPress={() => {
                                          onClose();
                                          router.push({
                                            pathname: '/practice-suite',
                                            params: {
                                              subjectIds: '',
                                              status: 'ALL',
                                              timerMode: 'STOPWATCH',
                                              timerValue: 0,
                                              limit: sub.count,
                                              examType: 'NEET PG',
                                              examYear: String(-sub.id),
                                              isStandard: 'true'
                                            }
                                          });
                                        }}
                                        style={({ pressed }) => [
                                          styles.subtopicPracticeBtn,
                                          { backgroundColor: theme.teal, opacity: pressed ? 0.9 : 1 }
                                        ]}
                                      >
                                        <Text style={[styles.subtopicPracticeText, { color: theme.background }]}>Study</Text>
                                      </Pressable>

                                      <Pressable
                                        onPress={() => {
                                          onClose();
                                          router.push({
                                            pathname: '/practice-suite',
                                            params: {
                                              subjectIds: '',
                                              status: 'ALL',
                                              timerMode: 'TOTAL_LIMIT',
                                              timerValue: String(Math.max(10, Math.round(sub.count * 0.75))),
                                              limit: sub.count,
                                              isMockTest: 'true',
                                              examType: 'NEET PG',
                                              examYear: String(-sub.id),
                                              isStandard: 'true'
                                            }
                                          });
                                        }}
                                        style={({ pressed }) => [
                                          styles.subtopicPracticeBtn,
                                          { backgroundColor: theme.pink, opacity: pressed ? 0.9 : 1 }
                                        ]}
                                      >
                                        <Text style={[styles.subtopicPracticeText, { color: '#ffffff' }]}>Mock</Text>
                                      </Pressable>
                                    </View>
                                  ) : (
                                    <Pressable
                                      onPress={() => handleStartPractice([sub.id], 10)}
                                      style={({ pressed }) => [
                                        styles.subtopicPracticeBtn,
                                        { backgroundColor: theme.text, opacity: pressed ? 0.9 : 1 }
                                      ]}
                                    >
                                      <Text style={[styles.subtopicPracticeText, { color: theme.background }]}>Solve</Text>
                                    </Pressable>
                                  )}

                                  {isSubCached ? (
                                    <CheckCircle size={14} color={theme.success} />
                                  ) : isSubDownloading ? (
                                    <ActivityIndicator size="small" color={theme.pink} />
                                  ) : (
                                    <Pressable 
                                      onPress={() => downloadSubTopic(sub.id)}
                                      style={[styles.subtopicDownloadBtn, { borderColor: theme.hairline }]}
                                    >
                                      <Download size={11} color={theme.textSecondary} />
                                    </Pressable>
                                  )}
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          )}

          {/* Footer bar */}
          <View style={[styles.footer, { backgroundColor: theme.backgroundElement, borderTopColor: theme.hairline }]}>
            <Text style={[styles.footerText, { color: theme.textSecondary }]}>
              Seed chapters offline to practice during clinical rounds.
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(10, 10, 10, 0.25)',
  },
  sheetContainer: {
    height: '85%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    elevation: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 12,
  },
  headerIcon: {
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: Fonts.sans,
    letterSpacing: -0.5,
  },
  closeButton: {
    borderWidth: 1,
    padding: 6,
    borderRadius: 8,
  },
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loaderText: {
    fontSize: 13,
  },
  scrollContent: {
    flex: 1,
  },
  scrollInner: {
    padding: 16,
    gap: 16,
  },
  progressCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  progressTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  progressPercent: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  progressBarBg: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  statusBannerText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0a0a0a',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  practiceAllButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  practiceAllText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  cachedBadge: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cachedBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  downloadButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  downloadButtonText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1.5,
    marginTop: 8,
  },
  topicsContainer: {
    gap: 10,
  },
  topicCard: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  topicHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
  },
  topicHeaderLeft: {
    flex: 1,
    paddingRight: 8,
    gap: 6,
  },
  topicTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  topicName: {
    fontSize: 13,
    fontWeight: 'bold',
    maxWidth: '75%',
  },
  pillBadge: {
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  pillText: {
    fontSize: 9,
    fontWeight: 'bold',
  },
  miniProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  miniProgressBarBg: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  miniProgressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  miniProgressPercent: {
    fontSize: 9,
    fontWeight: 'bold',
  },
  topicHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  miniPracticeButton: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    padding: 6,
    borderRadius: 6,
  },
  iconAction: {
    padding: 4,
  },
  subtopicsList: {
  },
  subtopicRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  subtopicLeft: {
    flex: 1,
    paddingRight: 8,
    gap: 2,
  },
  subtopicName: {
    fontSize: 12,
    fontWeight: '500',
  },
  subtopicMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  subtopicCount: {
    fontSize: 10,
  },
  subtopicSolved: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  subtopicRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subtopicPracticeBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  subtopicPracticeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  subtopicDownloadBtn: {
    borderWidth: 1,
    padding: 4,
    borderRadius: 6,
  },
  footer: {
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 10,
    fontWeight: '500',
  },
});
