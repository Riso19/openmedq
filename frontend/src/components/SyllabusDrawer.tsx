import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type LocalQuestion } from '../lib/db';
import { getSubjectHierarchy, type TopicNode } from '../lib/hierarchy';
import { subjectsList, PYQ_PAPERS, NEET_PG_PYQ_SUBJECT } from '../lib/subjects';
import { X, Play, ChevronDown, ChevronUp, BookOpen, CheckCircle2, CloudDownload, RefreshCw } from 'lucide-react';

interface RawQuestion {
  id: number;
  questionText: string;
  opa: string;
  opb: string;
  opc: string;
  opd: string;
  correctOption: number;
  subjectId: number;
  topicId: number;
  examType?: string;
  examYear?: number;
  explanation?: string;
  imageUrl?: string;
  explanationImageUrl?: string;
  opaImageUrl?: string;
  opbImageUrl?: string;
  opcImageUrl?: string;
  opdImageUrl?: string;
}

async function cacheQuestionImages(questions: LocalQuestion[], onProgress?: (msg: string) => void) {
  const imageUrls = new Set<string>();
  questions.forEach(q => {
    if (q.imageUrl) imageUrls.add(q.imageUrl);
    if (q.explanationImageUrl) imageUrls.add(q.explanationImageUrl);
    if (q.opaImageUrl) imageUrls.add(q.opaImageUrl);
    if (q.opbImageUrl) imageUrls.add(q.opbImageUrl);
    if (q.opcImageUrl) imageUrls.add(q.opcImageUrl);
    if (q.opdImageUrl) imageUrls.add(q.opdImageUrl);
  });

  const urls = Array.from(imageUrls);
  if (urls.length === 0) return;

  const total = urls.length;
  let cachedCount = 0;
  const cdnUrl = import.meta.env.VITE_CDN_URL || `${import.meta.env.VITE_API_URL || ''}/api/assets`;

  // Download queue with concurrency limit of 5
  const queue = [...urls];
  const concurrency = 5;

  const downloadNext = async (): Promise<void> => {
    if (queue.length === 0) return;
    const urlPath = queue.shift()!;
    
    try {
      // Check if already cached
      const alreadyCached = await db.cachedImages.get(urlPath);
      if (!alreadyCached) {
        const cleanPath = urlPath.startsWith('/') ? urlPath : `/${urlPath}`;
        const res = await fetch(`${cdnUrl}${cleanPath}`);
        if (res.ok) {
          const blob = await res.blob();
          await db.cachedImages.put({
            url: urlPath,
            blob,
            cachedAt: Date.now()
          });
        }
      }
    } catch (err) {
      console.warn("Failed to cache media asset.");
    } finally {
      cachedCount++;
      if (onProgress) {
        onProgress(`Caching images (${cachedCount}/${total})...`);
      }
    }
    
    // Stagger slightly
    await new Promise(resolve => setTimeout(resolve, 80));
    return downloadNext();
  };

  const workers = [];
  for (let i = 0; i < Math.min(concurrency, queue.length); i++) {
    workers.push(downloadNext());
  }
  await Promise.all(workers);
}


interface SyllabusDrawerProps {
  subjectId: number | null;
  onClose: () => void;
  onPractice: (config: { 
    subjectIds: number[]; 
    topicIds?: number[]; 
    limit: number;
    examType?: string;
    examYear?: number;
    isMockTest?: boolean;
    timerMode?: 'STOPWATCH' | 'TOTAL_LIMIT';
    timerValue?: number;
  }) => void;
}

export function SyllabusDrawer({ subjectId, onClose, onPractice }: SyllabusDrawerProps) {
  const [expandedTopics, setExpandedTopics] = useState<Record<string, boolean>>({});
  const [downloadingIds, setDownloadingIds] = useState<Set<number>>(new Set());
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);

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

  // Track progress of solved questions per sub-topic ID dynamically
  const solvedProgress = useLiveQuery(async () => {
    if (!subjectId) return {};
    try {
      const allProgress = await db.progress.toArray();
      const progressMap = new Set(allProgress.map(p => p.questionId));
      const counts: Record<number, number> = {};
      
      if (subjectId === NEET_PG_PYQ_SUBJECT.id) {
        const localQuestions = await db.questions.where('examType').equals('NEET PG').toArray();
        localQuestions.forEach(q => {
          if (q.examYear && progressMap.has(q.id)) {
            const topicId = -q.examYear;
            counts[topicId] = (counts[topicId] || 0) + 1;
          }
        });
        return counts;
      }

      const localQuestions = await db.questions.where('subjectId').equals(subjectId).toArray();
      localQuestions.forEach(q => {
        if (progressMap.has(q.id)) {
          counts[q.topicId] = (counts[q.topicId] || 0) + 1;
        }
      });
      return counts;
    } catch (err) {
      console.warn("Failed to fetch local syllabus progress.");
      return {};
    }
  }, [subjectId]) || {};

  // Track cached questions per sub-topic ID dynamically
  const cachedCounts = useLiveQuery(async () => {
    if (!subjectId) return {};
    try {
      const counts: Record<number, number> = {};

      if (subjectId === NEET_PG_PYQ_SUBJECT.id) {
        const localQuestions = await db.questions.where('examType').equals('NEET PG').toArray();
        localQuestions.forEach(q => {
          if (q.examYear) {
            const topicId = -q.examYear;
            counts[topicId] = (counts[topicId] || 0) + 1;
          }
        });
        return counts;
      }

      const localQuestions = await db.questions.where('subjectId').equals(subjectId).toArray();
      localQuestions.forEach(q => {
        counts[q.topicId] = (counts[q.topicId] || 0) + 1;
      });
      return counts;
    } catch (err) {
      console.warn("Failed to fetch local question cached counts.");
      return {};
    }
  }, [subjectId]) || {};

  // Close drawer on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!subjectId || !subject || !hierarchy) return null;

  const toggleTopic = (topicName: string) => {
    setExpandedTopics(prev => ({
      ...prev,
      [topicName]: !prev[topicName]
    }));
  };

  // Single Sub-topic Downloader
  const downloadSubTopic = async (subId: number, silent = false) => {
    if (downloadingIds.has(subId)) return;

    // Check if already cached (use 95% tolerance to handle minor count drift between hierarchy and R2 packs)
    const subNode = hierarchy.topics.flatMap(t => t.subTopics).find(s => s.id === subId);
    const targetCount = subNode?.count || 1;
    const cached = cachedCounts[subId] || 0;
    const isCached = cached >= targetCount || cached >= Math.floor(targetCount * 0.95);
    if (isCached && !silent) return;

    setDownloadingIds(prev => {
      const next = new Set(prev);
      next.add(subId);
      return next;
    });

    try {
      const cdnUrl = import.meta.env.VITE_CDN_URL || `${import.meta.env.VITE_API_URL || ''}/api/assets`;
      
      if (subjectId === NEET_PG_PYQ_SUBJECT.id) {
        const year = -subId;
        const res = await fetch(`${cdnUrl}/packs/neet_pg_${year}.json`);
        if (res.ok) {
          const rawQuestions = await res.json();
          if (Array.isArray(rawQuestions) && rawQuestions.length > 0) {
            const formatted = rawQuestions.map((q: RawQuestion) => ({
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
              explanation: q.explanation || 'This question pack was cached offline from remote servers.',
              imageUrl: q.imageUrl || undefined,
              explanationImageUrl: q.explanationImageUrl || undefined,
              opaImageUrl: q.opaImageUrl || undefined,
              opbImageUrl: q.opbImageUrl || undefined,
              opcImageUrl: q.opcImageUrl || undefined,
              opdImageUrl: q.opdImageUrl || undefined,
            }));
            await db.transaction('rw', db.questions, async () => {
              for (const q of formatted) {
                await db.questions.put(q);
              }
            });
            if (!silent) setDownloadStatus(`Caching images...`);
            await cacheQuestionImages(formatted, msg => {
              if (!silent) setDownloadStatus(msg);
            });
          }
        }
        return;
      }

      const res = await fetch(`${cdnUrl}/packs/subject_${subjectId}_topic_${subId}.json`);

      if (res.ok) {
        const rawQuestions = await res.json();
        if (Array.isArray(rawQuestions) && rawQuestions.length > 0) {
          const formatted = rawQuestions.map((q: RawQuestion) => ({
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
            explanation: q.explanation || 'This question pack was cached offline from remote servers.',
            imageUrl: q.imageUrl || undefined,
            explanationImageUrl: q.explanationImageUrl || undefined,
            opaImageUrl: q.opaImageUrl || undefined,
            opbImageUrl: q.opbImageUrl || undefined,
            opcImageUrl: q.opcImageUrl || undefined,
            opdImageUrl: q.opdImageUrl || undefined,
          }));
          await db.questions.bulkPut(formatted);
          if (!silent) setDownloadStatus(`Caching images...`);
          await cacheQuestionImages(formatted, msg => {
            if (!silent) setDownloadStatus(msg);
          });
        }
      }
    } catch (err) {
      console.warn("Failed to prepare subtopic questions.");
    } finally {
      setDownloadingIds(prev => {
        const next = new Set(prev);
        next.delete(subId);
        return next;
      });
    }
  };

  // Group Topic Downloader
  const downloadTopic = async (topicName: string, subTopics: { id: number; count: number }[]) => {
    setDownloadStatus(`Downloading ${topicName}...`);
    
    const uncached = subTopics.filter(sub => {
      const cached = cachedCounts[sub.id] || 0;
      return cached < sub.count && cached < Math.floor(sub.count * 0.95);
    });
    if (uncached.length === 0) {
      setDownloadStatus(`Topic already offline ready!`);
      setTimeout(() => setDownloadStatus(null), 1500);
      return;
    }

    // Staggered batch download
    const queue = [...uncached];
    const concurrency = 3;

    const runNext = async (): Promise<void> => {
      if (queue.length === 0) return;
      const sub = queue.shift()!;
      await downloadSubTopic(sub.id, true);
      return runNext();
    };

    const workers = [];
    for (let i = 0; i < Math.min(concurrency, queue.length); i++) {
      workers.push(runNext());
    }

    await Promise.all(workers);
    setDownloadStatus(`Topic cached successfully!`);
    setTimeout(() => setDownloadStatus(null), 1500);
  };

  // Full Subject Downloader
  const downloadSubject = async () => {
    if (!subjectId || !hierarchy) return;
    setDownloadStatus(`Downloading complete subject pack...`);
    
    try {
      const cdnUrl = import.meta.env.VITE_CDN_URL || `${import.meta.env.VITE_API_URL || ''}/api/assets`;

      if (subjectId === NEET_PG_PYQ_SUBJECT.id) {
        // Download all NEET PG PYQ years in parallel
        const promises = PYQ_PAPERS.map(async (paper) => {
          const res = await fetch(`${cdnUrl}/packs/neet_pg_${paper.year}.json`);
          if (res.ok) {
            const rawQuestions = await res.json();
            if (Array.isArray(rawQuestions)) {
              return rawQuestions.map((q: RawQuestion) => ({
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
                explanation: q.explanation || 'This question pack was cached offline from remote servers.',
                imageUrl: q.imageUrl || undefined,
                explanationImageUrl: q.explanationImageUrl || undefined,
                opaImageUrl: q.opaImageUrl || undefined,
                opbImageUrl: q.opbImageUrl || undefined,
                opcImageUrl: q.opcImageUrl || undefined,
                opdImageUrl: q.opdImageUrl || undefined,
              }));
            }
          }
          return [];
        });

        const allPacksQuestions = await Promise.all(promises);
        const formattedQuestions = allPacksQuestions.flat();

        if (formattedQuestions.length > 0) {
          setDownloadStatus(`Caching ${formattedQuestions.length} questions offline...`);
          await db.transaction('rw', db.questions, async () => {
            for (const q of formattedQuestions) {
              await db.questions.put(q);
            }
          });
          setDownloadStatus(`Caching subject images...`);
          await cacheQuestionImages(formattedQuestions, msg => setDownloadStatus(msg));
          setDownloadStatus(`Subject cached successfully!`);
        } else {
          setDownloadStatus(`No questions found`);
        }
        return;
      }

      const res = await fetch(`${cdnUrl}/packs/subject_${subjectId}.json`);

      if (res.ok) {
        const rawQuestions = await res.json();
        if (Array.isArray(rawQuestions) && rawQuestions.length > 0) {
          setDownloadStatus(`Caching ${rawQuestions.length} questions offline...`);
          
          const formatted = rawQuestions.map((q: RawQuestion) => ({
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
            explanation: q.explanation || 'This question pack was cached offline from remote servers.',
            imageUrl: q.imageUrl || undefined,
            explanationImageUrl: q.explanationImageUrl || undefined,
            opaImageUrl: q.opaImageUrl || undefined,
            opbImageUrl: q.opbImageUrl || undefined,
            opcImageUrl: q.opcImageUrl || undefined,
            opdImageUrl: q.opdImageUrl || undefined,
          }));

          // Bulk write to IndexedDB
          await db.transaction('rw', db.questions, async () => {
            for (const q of formatted) {
              await db.questions.put(q);
            }
          });
          setDownloadStatus(`Caching subject images...`);
          await cacheQuestionImages(formatted, msg => setDownloadStatus(msg));
          setDownloadStatus(`Subject cached successfully!`);
        } else {
          setDownloadStatus(`No questions found for this subject`);
        }
      } else {
        setDownloadStatus(`Failed to download subject pack`);
      }
    } catch (err) {
      console.error("Failed to download subject pack.");
      setDownloadStatus(`Error downloading subject`);
    } finally {
      setTimeout(() => setDownloadStatus(null), 2000);
    }
  };

  // Calculate overall progress
  const totalSubtopicSolved = Object.values(solvedProgress).reduce((sum, count) => sum + count, 0);
  const overallSolvedPercent = Math.min(100, Math.round((totalSubtopicSolved / subject.count) * 100));

  // Check if subject and topics are fully cached
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

  return (
    <div className="fixed inset-0 z-50 overflow-hidden font-sans">
      {/* Backdrop overlay */}
      <div 
        className="absolute inset-0 bg-clay-ink/15 backdrop-blur-[2px] transition-opacity duration-300 animate-[fadeIn_0.2s_ease-out]"
        onClick={onClose}
      />

      <div className="absolute inset-y-0 right-0 max-w-full flex pl-0 sm:pl-10">
        {/* Sliding Panel */}
        <div className="w-screen max-w-md bg-clay-canvas border-l border-clay-hairline shadow-2xl flex flex-col justify-between animate-[slideInRight_0.3s_cubic-bezier(0.16,1,0.3,1)]">
          
          {/* Header Panel */}
          <div className="p-6 border-b border-clay-hairline text-left">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-clay-pink" />
                <h2 className="font-rubik text-xl font-medium tracking-tight text-clay-ink">
                  Syllabus: {subject.name}
                </h2>
              </div>
              <button 
                onClick={onClose}
                className="p-1.5 rounded-clay-md border border-clay-hairline text-clay-muted hover:text-clay-ink hover:bg-clay-surface-soft transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Subject Level Progress */}
            <div className="bg-clay-surface-soft border border-clay-hairline p-4 rounded-clay-lg mb-4 text-left">
              <div className="flex justify-between items-center text-xs font-bold text-clay-ink mb-1.5">
                <span>Subject Practice Progress</span>
                <span>{overallSolvedPercent}% ({totalSubtopicSolved} / {subject.count} Qs)</span>
              </div>
              <div className="w-full bg-clay-surface-strong h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-clay-teal h-full transition-all duration-500" 
                  style={{ width: `${overallSolvedPercent}%` }}
                />
              </div>
            </div>

            {/* Download Status Toast in Drawer */}
            {downloadStatus && (
              <div className="mb-4 p-2 px-3 text-xs bg-clay-lavender text-clay-ink rounded-clay-md border border-clay-lavender/60 flex items-center gap-2 animate-pulse">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>{downloadStatus}</span>
              </div>
            )}

            {/* Subject Actions */}
            <div className="flex flex-col gap-2">
              <button
                onClick={() => onPractice({ 
                  subjectIds: [subject.id], 
                  limit: subject.count,
                  examType: subject.id === NEET_PG_PYQ_SUBJECT.id ? 'NEET PG' : undefined
                })}
                className="w-full bg-clay-ink hover:bg-neutral-800 text-white font-bold h-11 px-4 rounded-clay-md shadow-sm active:scale-[0.99] transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer text-xs"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Practice Entire Subject ({subject.count} Qs)</span>
              </button>

              {isSubjectFullyCached ? (
                <div className="w-full h-10 border border-emerald-500/25 bg-emerald-50/50 text-emerald-900 rounded-clay-md flex items-center justify-center gap-1.5 text-xs font-semibold select-none">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Fully Offline Cached</span>
                </div>
              ) : (
                <button
                  onClick={downloadSubject}
                  className="w-full h-10 bg-clay-canvas hover:bg-clay-surface-soft border border-clay-hairline text-clay-ink rounded-clay-md flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer transition-all"
                >
                  <CloudDownload className="w-4 h-4 text-clay-pink" />
                  <span>Download Subject for Offline</span>
                </button>
              )}
            </div>
          </div>

          {/* Topics & Subtopics List */}
          <div className="flex-1 overflow-y-auto px-6 py-4 scrollbar-none text-left">
            <h3 className="text-[10px] uppercase font-bold text-clay-muted tracking-wider mb-3 block">
              Curriculum Topics & Sub-topics
            </h3>

            <div className="space-y-3">
              {hierarchy.topics.map(topic => {
                const isExpanded = expandedTopics[topic.name];
                const topicSolved = getTopicSolvedCount(topic);
                const topicPct = Math.min(100, Math.round((topicSolved / topic.count) * 100));
                const subTopicIds = topic.subTopics.map(sub => sub.id);

                // Check Topic cache status
                const isTopicFullyCached = topic.subTopics.every(sub => isSubTopicCached(sub.id, sub.count));
                const isTopicDownloading = topic.subTopics.some(sub => downloadingIds.has(sub.id));

                return (
                  <div 
                    key={topic.name}
                    className="border border-clay-hairline rounded-clay-lg overflow-hidden bg-clay-canvas shadow-sm transition-all duration-300"
                  >
                    {/* Topic Accordion Header */}
                    <div 
                      className="p-4 flex items-center justify-between cursor-pointer select-none bg-clay-surface-soft/60 hover:bg-clay-surface-soft transition-colors"
                      onClick={() => toggleTopic(topic.name)}
                    >
                      <div className="flex-1 min-w-0 pr-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-clay-ink leading-tight truncate">
                            {topic.name}
                          </span>
                          <span className="text-[9px] font-bold text-clay-muted shrink-0 bg-clay-surface-strong px-1.5 py-0.5 rounded-full">
                            {topic.count} Qs
                          </span>
                        </div>
                        
                        {/* Topic mini progress bar */}
                        <div className="flex items-center gap-2 mt-2">
                          <div className="flex-1 bg-clay-surface-strong h-1 rounded-full overflow-hidden">
                            <div 
                              className="bg-clay-teal h-full" 
                              style={{ width: `${topicPct}%` }}
                            />
                          </div>
                          <span className="text-[8px] font-bold text-clay-muted shrink-0">
                            {topicPct}%
                          </span>
                        </div>
                      </div>

                      {/* Accordion Actions */}
                      <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => {
                            if (subjectId === NEET_PG_PYQ_SUBJECT.id) {
                              onPractice({ 
                                subjectIds: [NEET_PG_PYQ_SUBJECT.id], 
                                limit: topic.count, 
                                examType: 'NEET PG' 
                              });
                            } else {
                              onPractice({ subjectIds: [subject.id], topicIds: subTopicIds, limit: 15 });
                            }
                          }}
                          className="p-1 px-2 bg-clay-canvas border border-clay-hairline hover:bg-clay-surface-soft text-clay-ink text-[10px] font-bold rounded-clay-md shadow-sm active:scale-95 transition-all duration-200 cursor-pointer flex items-center gap-1"
                          title={`Practice ${topic.name}`}
                        >
                          <Play className="w-2.5 h-2.5 fill-current" />
                          <span>Practice</span>
                        </button>
                        
                        {isTopicFullyCached ? (
                          <div className="p-1 text-emerald-600" title="Offline Ready">
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                        ) : isTopicDownloading ? (
                          <div className="p-1 text-clay-pink">
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          </div>
                        ) : (
                          <button
                            onClick={() => downloadTopic(topic.name, topic.subTopics)}
                            className="p-1 text-clay-muted hover:text-clay-pink transition-colors cursor-pointer"
                            title="Download Topic Offline"
                          >
                            <CloudDownload className="w-4 h-4" />
                          </button>
                        )}
                        
                        <button 
                          onClick={() => toggleTopic(topic.name)}
                          className="p-1 text-clay-muted hover:text-clay-ink cursor-pointer"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Topic Accordion Body (Sub-topics list) */}
                    {isExpanded && (
                      <div className="border-t border-clay-hairline divide-y divide-clay-hairline/60 bg-clay-canvas transition-all duration-300">
                        {topic.subTopics.map(sub => {
                          const subSolved = solvedProgress[sub.id] || 0;
                          const subPct = Math.min(100, Math.round((subSolved / sub.count) * 100));

                          const isSubCached = isSubTopicCached(sub.id, sub.count);
                          const isSubDownloading = downloadingIds.has(sub.id);

                          return (
                            <div 
                              key={sub.id}
                              className="p-3.5 flex items-center justify-between hover:bg-clay-surface-soft/40 transition-colors text-left"
                            >
                              <div className="flex-1 min-w-0 pr-3">
                                <span className="block text-xs font-medium text-clay-body leading-snug truncate">
                                  {sub.name === 'General Practice' ? `${subject.name} - General` : sub.name}
                                </span>
                                
                                <div className="flex items-center gap-2 mt-1 text-[9px] text-clay-muted">
                                  <span>{sub.count} questions</span>
                                  <span>•</span>
                                  {subSolved > 0 ? (
                                    <span className="text-emerald-700 font-semibold flex items-center gap-0.5">
                                      <CheckCircle2 className="w-2.5 h-2.5" /> {subSolved} solved ({subPct}%)
                                    </span>
                                  ) : (
                                    <span>0 solved</span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                {subjectId === NEET_PG_PYQ_SUBJECT.id ? (
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => onPractice({
                                        subjectIds: [NEET_PG_PYQ_SUBJECT.id],
                                        limit: sub.count,
                                        examType: 'NEET PG',
                                        examYear: -sub.id,
                                      })}
                                      className="px-2 py-1 bg-clay-teal hover:bg-teal-700 text-white text-[9px] font-bold rounded-clay-md transition-colors cursor-pointer flex items-center gap-1 shadow-sm"
                                    >
                                      Study
                                    </button>
                                    <button
                                      onClick={() => onPractice({
                                        subjectIds: [NEET_PG_PYQ_SUBJECT.id],
                                        limit: sub.count,
                                        examType: 'NEET PG',
                                        examYear: -sub.id,
                                        isMockTest: true,
                                        timerMode: 'TOTAL_LIMIT',
                                        timerValue: Math.max(10, Math.round(sub.count * 0.75)),
                                      })}
                                      className="px-2 py-1 bg-clay-pink hover:bg-rose-600 text-white text-[9px] font-bold rounded-clay-md transition-colors cursor-pointer flex items-center gap-1 shadow-sm"
                                    >
                                      Mock
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => onPractice({ subjectIds: [subject.id], topicIds: [sub.id], limit: 10 })}
                                    className="px-2 py-1 bg-clay-ink hover:bg-neutral-800 text-white text-[9px] font-bold rounded-clay-md transition-colors cursor-pointer flex items-center gap-1 shadow-sm"
                                  >
                                    <Play className="w-2 h-2 fill-current" />
                                    <span>Practice</span>
                                  </button>
                                )}

                                {isSubCached ? (
                                  <div className="p-1 text-emerald-600" title="Offline Ready">
                                    <CheckCircle2 className="w-4 h-4" />
                                  </div>
                                ) : isSubDownloading ? (
                                  <div className="p-1 text-clay-pink">
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => downloadSubTopic(sub.id)}
                                    className="p-1 border border-clay-hairline hover:bg-clay-surface-soft text-clay-muted hover:text-clay-pink rounded transition-colors cursor-pointer"
                                    title="Download for Offline"
                                  >
                                    <CloudDownload className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer Info */}
          <div className="p-4 border-t border-clay-hairline bg-clay-surface-soft text-center text-[10px] text-clay-muted">
            Download subjects or topics to practice offline in hospital wards.
          </div>
        </div>
      </div>
    </div>
  );
}
