import { useState, useEffect } from 'react';
import { ArrowLeft, Timer, Play, CheckSquare, Square, RefreshCw, HelpCircle } from 'lucide-react';
import { allSubjectsList, PYQ_PAPERS } from '../../lib/subjects';
import { db, getFilteredQuestionsCount, getSpacedRepetitionCounts } from '../../lib/db';
import { ThemeToggle } from '../../components/ThemeToggle';
import { getSubjectHierarchy } from '../../lib/hierarchy';
import rawTopics from '../../lib/topics.json';

export interface CustomModuleConfig {
  subjectIds: number[];
  topicIds?: number[];
  status: 'ALL' | 'UNATTEMPTED' | 'INCORRECT' | 'CORRECT' | 'BOOKMARKED' | 'SPACED_REPETITION' | 'LEECHES';
  timerMode: 'STOPWATCH' | 'COUNTDOWN_Q' | 'TOTAL_LIMIT';
  timerValue: number; // seconds for COUNTDOWN_Q, minutes for TOTAL_LIMIT
  limit: number;
  isStandard?: boolean;
  // Mock Mode settings
  isMockTest?: boolean;
  marksPerQuestion?: number;
  negativeMarking?: number;
  newCardsLimit?: number;
  examType?: string;
  examYear?: number;
  examYears?: number[];
}

interface CustomModuleCreatorProps {
  onBack: () => void;
  onStart: (config: CustomModuleConfig) => void;
}

export function CustomModuleCreator({ onBack, onStart }: CustomModuleCreatorProps) {
  const [selectedSubjects, setSelectedSubjects] = useState<number[]>([5]); // Pathology default
  const [selectedTopicIds, setSelectedTopicIds] = useState<number[]>([]);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UNATTEMPTED' | 'INCORRECT' | 'CORRECT' | 'BOOKMARKED' | 'SPACED_REPETITION' | 'LEECHES'>('ALL');
  const [timerMode, setTimerMode] = useState<'STOPWATCH' | 'COUNTDOWN_Q' | 'TOTAL_LIMIT'>('STOPWATCH');
  const [timerValue, setTimerValue] = useState<number>(60); // 60 seconds / 10 minutes default
  const [questionLimit, setQuestionLimit] = useState<number>(10);
  const [customLimitText, setCustomLimitText] = useState<string>('');
  const [customTimerText, setCustomTimerText] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [timerValidationError, setTimerValidationError] = useState<string | null>(null);
  const [srCounts, setSrCounts] = useState<{ due: number; new: number }>({ due: 0, new: 0 });
  const [newCardsLimit, setNewCardsLimit] = useState<number>(10);
  
  // Mock Exam states
  const [isMockTest, setIsMockTest] = useState<boolean>(false);
  const [marksPerQuestion, setMarksPerQuestion] = useState<number>(4);
  const [marksInputText, setMarksInputText] = useState<string>('4');
  const [negativeMarkingEnabled, setNegativeMarkingEnabled] = useState<boolean>(true);
  const [negativeMarkValue, setNegativeMarkValue] = useState<number>(1);
  const [negativeMarkInputText, setNegativeMarkInputText] = useState<string>('1');

  const [availableCount, setAvailableCount] = useState<number>(0);
  const [isLoadingCount, setIsLoadingCount] = useState<boolean>(false);
  const [syncingSubjects, setSyncingSubjects] = useState<number[]>([]);

  // Background caching for unseeded subjects / years from remote R2 bucket
  useEffect(() => {
    const checkAndCache = async () => {
      const pyqSelected = selectedSubjects.includes(99);
      const standardSubjects = selectedSubjects.filter(id => id !== 99);

      if (pyqSelected) {
        const selectedYears = selectedTopicIds.filter(id => id < 0).map(id => -id);
        const effectiveYears = selectedYears.length > 0 ? selectedYears : [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018];
        const yearsToSync: number[] = [];

        for (const year of effectiveYears) {
          const paper = PYQ_PAPERS.find(p => p.year === year);
          const expectedCount = paper ? paper.count : 0;
          const localQuestions = await db.questions.where('examType').equals('NEET PG').toArray();
          const localCount = localQuestions.filter(q => q.examYear === year).length;
          if (localCount < expectedCount) {
            yearsToSync.push(year);
          }
        }

        if (yearsToSync.length > 0) {
          setSyncingSubjects(prev => [...new Set([...prev, ...yearsToSync])]);

          for (const year of yearsToSync) {
            try {
              const cdnUrl = import.meta.env.VITE_CDN_URL || `${import.meta.env.VITE_API_URL || ''}/api/assets`;
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
                    explanation: q.explanation || 'This NEET PG PYQ recall question was fetched dynamically from OpenMedQ CDN.',
                    imageUrl: q.imageUrl || undefined,
                    explanationImageUrl: q.explanationImageUrl || undefined,
                    opaImageUrl: q.opaImageUrl || undefined,
                    opbImageUrl: q.opbImageUrl || undefined,
                    opcImageUrl: q.opcImageUrl || undefined,
                    opdImageUrl: q.opdImageUrl || undefined,
                  }));

                  // Save to IndexedDB via fast bulkPut
                  await db.questions.bulkPut(formatted);
                }
              }
            } catch (err) {
              console.warn("Failed to retrieve question pack updates.");
            } finally {
              setSyncingSubjects(prev => prev.filter(y => y !== year));
            }
          }
        }
      }

      if (standardSubjects.length > 0) {
        const subjectsToSync: number[] = [];

        for (const subjId of standardSubjects) {
          const subject = allSubjectsList.find(s => s.id === subjId);
          const expectedCount = subject ? subject.count : 0;
          const localCount = await db.questions.where('subjectId').equals(subjId).count();
          if (localCount < expectedCount) {
            subjectsToSync.push(subjId);
          }
        }

        if (subjectsToSync.length === 0) return;

        // Add to syncing list
        setSyncingSubjects(prev => [...new Set([...prev, ...subjectsToSync])]);

        for (const subjId of subjectsToSync) {
          try {
            const cdnUrl = import.meta.env.VITE_CDN_URL || `${import.meta.env.VITE_API_URL || ''}/api/assets`;
            const res = await fetch(`${cdnUrl}/packs/subject_${subjId}.json`);

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

                // Save to IndexedDB via fast bulkPut
                await db.questions.bulkPut(formatted);
              }
            }
          } catch (err) {
            console.warn("Failed to retrieve question pack updates.");
          } finally {
            setSyncingSubjects(prev => prev.filter(id => id !== subjId));
          }
        }
      }

      // Refresh matched count once seeding completes
      let count = 0;
      const selectedYears = selectedTopicIds.filter(id => id < 0).map(id => -id);
      const effectiveYears = selectedYears.length > 0 ? selectedYears : undefined;

      if (statusFilter === 'SPACED_REPETITION') {
        const counts = await getSpacedRepetitionCounts({
          subjectIds: selectedSubjects,
          topicIds: selectedTopicIds.length > 0 ? selectedTopicIds : undefined,
          examType: pyqSelected ? 'NEET PG' : undefined,
          examYears: pyqSelected ? effectiveYears : undefined,
        });
        setSrCounts(counts);
        count = counts.due + counts.new;
      } else {
        count = await getFilteredQuestionsCount({
          subjectIds: selectedSubjects,
          topicIds: selectedTopicIds.length > 0 ? selectedTopicIds : undefined,
          status: statusFilter,
          examType: pyqSelected ? 'NEET PG' : undefined,
          examYears: pyqSelected ? effectiveYears : undefined,
        });
      }
      setAvailableCount(count);
    };

    checkAndCache();
  }, [selectedSubjects, selectedTopicIds, statusFilter, newCardsLimit]);

  // Update real-time matched count from Dexie
  useEffect(() => {
    const updateCount = async () => {
      setIsLoadingCount(true);
      try {
        let count = 0;
        const pyqSelected = selectedSubjects.includes(99);
        const selectedYears = selectedTopicIds.filter(id => id < 0).map(id => -id);
        const effectiveYears = selectedYears.length > 0 ? selectedYears : undefined;

        if (statusFilter === 'SPACED_REPETITION') {
          const counts = await getSpacedRepetitionCounts({
            subjectIds: selectedSubjects,
            topicIds: selectedTopicIds.length > 0 ? selectedTopicIds : undefined,
            examType: pyqSelected ? 'NEET PG' : undefined,
            examYears: pyqSelected ? effectiveYears : undefined,
          });
          setSrCounts(counts);
          count = counts.due + counts.new;
        } else {
          count = await getFilteredQuestionsCount({
            subjectIds: selectedSubjects,
            topicIds: selectedTopicIds.length > 0 ? selectedTopicIds : undefined,
            status: statusFilter,
            examType: pyqSelected ? 'NEET PG' : undefined,
            examYears: pyqSelected ? effectiveYears : undefined,
          });
        }
        setAvailableCount(count);

        // Smart re-validation of limit if count changes
        if (customLimitText.trim()) {
          const val = Number(customLimitText);
          if (!isNaN(val) && Number.isInteger(val) && val > 0) {
            if (val > count && count > 0) {
              setValidationError(`Only ${count} questions match your filters.`);
            } else if (val > 200) {
              setValidationError("You can practice a maximum of 200 questions per custom session.");
            } else {
              setValidationError(null);
            }
          }
        }
      } catch (err) {
        console.error("Failed to query question count.");
      } finally {
        setIsLoadingCount(false);
      }
    };
    updateCount();
  }, [selectedSubjects, selectedTopicIds, statusFilter, customLimitText, newCardsLimit]);

  const handleSubjectToggle = (subjectId: number) => {
    setSelectedSubjects(prev => {
      let updatedSubjects;
      if (prev.includes(subjectId)) {
        if (prev.length === 1) return prev;
        updatedSubjects = prev.filter(id => id !== subjectId);
      } else {
        updatedSubjects = [...prev, subjectId];
      }

      // Clean up selected topics that do not belong to selected subjects anymore
      setSelectedTopicIds(topicIds => {
        return topicIds.filter(tId => {
          const t = rawTopics.find((rt: any) => rt.id === tId);
          return t ? updatedSubjects.includes(t.subjectId) : false;
        });
      });

      return updatedSubjects;
    });
  };

  const handleTopicToggle = (topicId: number) => {
    setSelectedTopicIds(prev => {
      if (prev.includes(topicId)) {
        return prev.filter(id => id !== topicId);
      } else {
        return [...prev, topicId];
      }
    });
  };

  const handleSelectAllTopicsForSubject = (subjectId: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const subTopicIds = subjectId === 99
      ? PYQ_PAPERS.map(p => -p.year)
      : getSubjectHierarchy(subjectId).topics.flatMap((t) => t.subTopics.map((s) => s.id));

    setSelectedTopicIds(prev => {
      const filtered = prev.filter(id => !subTopicIds.includes(id));
      const allSelected = subTopicIds.every((id) => prev.includes(id));
      if (allSelected) {
        return filtered;
      } else {
        return [...filtered, ...subTopicIds];
      }
    });
  };

  const selectAllSubjects = () => {
    setSelectedSubjects(allSubjectsList.map((s: { id: number }) => s.id));
  };

  const clearAllSubjects = () => {
    setSelectedSubjects([5]); // default back to Pathology
    setSelectedTopicIds([]);
    setCustomLimitText('');
    setValidationError(null);
  };

  const handleCustomLimitChange = (text: string) => {
    setCustomLimitText(text);
    if (!text.trim()) {
      setValidationError(null);
      return;
    }
    const val = Number(text);
    if (isNaN(val) || !Number.isInteger(val) || val <= 0) {
      setValidationError("Please enter a positive whole number.");
      return;
    }
    if (val > 200) {
      setValidationError("You can practice a maximum of 200 questions per custom session.");
      return;
    }
    if (val > availableCount && availableCount > 0) {
      setValidationError(`Only ${availableCount} questions match your filters.`);
      return;
    }
    setValidationError(null);
    setQuestionLimit(val);
  };

  const handleSelectPresetLimit = (val: number) => {
    setQuestionLimit(val);
    setCustomLimitText('');
    setValidationError(null);
  };

  const handleCustomTimerChange = (text: string) => {
    setCustomTimerText(text);
    if (!text.trim()) {
      setTimerValidationError(null);
      return;
    }
    const val = Number(text);
    if (isNaN(val) || !Number.isInteger(val) || val <= 0) {
      setTimerValidationError("Please enter a positive whole number for time limit.");
      return;
    }
    setTimerValidationError(null);
    setTimerValue(val);
  };

  const handleMockToggle = (enabled: boolean) => {
    setIsMockTest(enabled);
    if (enabled) {
      setTimerMode('TOTAL_LIMIT');
      setTimerValue(10); // default 10 minutes total limit
      setCustomTimerText('');
      setTimerValidationError(null);
    }
  };

  const handleStart = () => {
    const effectiveLimit = statusFilter === 'SPACED_REPETITION' ? srCounts.due + Math.min(newCardsLimit, srCounts.new) : availableCount;
    if (effectiveLimit === 0 || !!validationError || !!timerValidationError) return;
    onStart({
      subjectIds: selectedSubjects,
      topicIds: selectedTopicIds.length > 0 ? selectedTopicIds : undefined,
      status: statusFilter,
      timerMode,
      timerValue: timerMode === 'COUNTDOWN_Q' ? timerValue : (timerMode === 'TOTAL_LIMIT' ? timerValue : 0),
      limit: Math.min(questionLimit, effectiveLimit),
      isMockTest,
      marksPerQuestion: isMockTest ? marksPerQuestion : undefined,
      negativeMarking: isMockTest && negativeMarkingEnabled ? negativeMarkValue : 0,
      newCardsLimit: statusFilter === 'SPACED_REPETITION' ? newCardsLimit : undefined,
      examType: selectedSubjects.includes(99) ? 'NEET PG' : undefined,
      examYears: selectedSubjects.includes(99)
        ? (selectedTopicIds.some(id => id < 0)
            ? selectedTopicIds.filter(id => id < 0).map(id => -id)
            : undefined)
        : undefined,
    });
  };

  return (
    <div className="min-h-screen bg-clay-canvas text-clay-ink flex flex-col font-sans relative overflow-x-hidden">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full bg-clay-canvas border-b border-clay-hairline py-4 px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 rounded-clay-md border border-clay-hairline text-clay-muted hover:text-clay-ink hover:bg-clay-surface-soft transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-bold tracking-tight text-clay-ink">Custom Practice Test Creator</span>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <div className="hidden sm:flex items-center gap-2 text-xs font-semibold px-3 py-1.5 bg-clay-surface-soft border border-clay-hairline rounded-clay-md text-clay-muted">
            <span>Offline Practice Mode Active</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl mx-auto w-full p-4 md:p-8 flex flex-col gap-8 text-left">
        
        {/* Title Block */}
        <div>
          <h1 className="font-rubik text-3xl md:text-4xl font-medium tracking-[-0.04em] text-clay-ink mb-2">
            Create Custom Practice Test
          </h1>
          <p className="text-clay-body text-sm max-w-xl">
            Choose subjects, select focus topics, filter by your progress, select a timing option, and practice on the go.
          </p>
        </div>

        {/* 1. Subjects Selection */}
        <div className="bg-clay-canvas border border-clay-hairline rounded-clay-lg p-5 md:p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h3 className="text-xs uppercase font-bold text-clay-muted tracking-wider">
              Step 1: Select Subjects & Topics
            </h3>
            <div className="flex gap-4 text-xs font-bold">
              <button 
                onClick={selectAllSubjects}
                className="text-clay-pink hover:underline cursor-pointer"
              >
                Select All
              </button>
              <button 
                onClick={clearAllSubjects}
                className="text-clay-muted hover:underline cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
            {allSubjectsList.map(subj => {
              const isSelected = selectedSubjects.includes(subj.id);
              return (
                <button
                  key={subj.id}
                  onClick={() => handleSubjectToggle(subj.id)}
                  className={`flex items-center gap-2 px-3 py-2.5 border rounded-clay-md text-xs font-bold text-left transition-all duration-200 cursor-pointer ${
                    isSelected
                      ? 'bg-clay-teal text-white border-transparent'
                      : 'bg-clay-canvas border-clay-hairline text-clay-body hover:bg-clay-surface-soft'
                  }`}
                >
                  <span className="shrink-0">
                    {isSelected ? (
                      <CheckSquare className="w-3.5 h-3.5" />
                    ) : (
                      <Square className="w-3.5 h-3.5 text-clay-muted" />
                    )}
                  </span>
                  <span className="truncate">{subj.name}</span>
                </button>
              );
            })}
          </div>

          {/* Collapsible Topics Accordion list */}
          {selectedSubjects.length > 0 && (
            <div className="mt-6 border-t border-clay-hairline pt-6">
              <span className="block text-[11px] font-bold text-clay-muted uppercase tracking-wider mb-2">
                Filter Specific Topics (Optional)
              </span>
              <p className="text-[10px] text-clay-muted mb-4">
                If no topics or years are selected below, the test will include all questions from the selected subjects and papers.
              </p>
              
              <div className="space-y-4">
                {selectedSubjects.map(subjectId => {
                  const subject = allSubjectsList.find(s => s.id === subjectId);
                  if (!subject) return null;
                  const hierarchy = subjectId === 99
                    ? {
                        subjectId: 99,
                        topics: [
                          {
                            name: 'NEET PG PYQs by Year',
                            count: subject.count,
                            subTopics: PYQ_PAPERS.map(p => ({
                              id: -p.year,
                              name: p.name,
                              count: p.count,
                            })),
                          },
                        ],
                      }
                    : getSubjectHierarchy(subjectId);
                  
                  return (
                    <details 
                      key={subjectId} 
                      className="border border-clay-hairline rounded-clay-md p-3.5 bg-clay-surface-soft/30 group"
                    >
                      <summary className="text-xs font-bold text-clay-ink cursor-pointer list-none flex justify-between items-center select-none">
                        <span>{subject.name} ({hierarchy.topics.reduce((acc, t) => acc + t.subTopics.length, 0)} sub-topics)</span>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={(e) => handleSelectAllTopicsForSubject(subjectId, e)}
                            className="text-[10px] text-clay-pink hover:underline font-bold"
                          >
                            Toggle All
                          </button>
                          <span className="text-[10px] text-clay-muted group-open:hidden">Show Topics</span>
                          <span className="text-[10px] text-clay-muted hidden group-open:inline">Hide Topics</span>
                        </div>
                      </summary>
                      
                      <div className="mt-4 space-y-4 border-t border-clay-hairline/45 pt-3">
                        {hierarchy.topics.map(topic => (
                          <div key={topic.name} className="space-y-1.5">
                            <span className="block text-[10px] font-bold text-clay-muted uppercase tracking-wider">
                              {topic.name}
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-2">
                              {topic.subTopics.map(sub => {
                                const isChecked = selectedTopicIds.includes(sub.id);
                                return (
                                  <button
                                    key={sub.id}
                                    type="button"
                                    onClick={() => handleTopicToggle(sub.id)}
                                    className={`flex items-center gap-2 px-2.5 py-1.5 border rounded-clay-md text-[10px] font-bold text-left transition-all cursor-pointer ${
                                      isChecked
                                        ? 'bg-clay-teal text-white border-transparent'
                                        : 'bg-clay-canvas border-clay-hairline text-clay-body hover:bg-clay-surface-soft'
                                    }`}
                                  >
                                    <span className="shrink-0">
                                      {isChecked ? (
                                        <CheckSquare className="w-3 h-3" />
                                      ) : (
                                        <Square className="w-3 h-3 text-clay-muted" />
                                      )}
                                    </span>
                                    <span className="truncate">{sub.name} ({sub.count} Qs)</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 2. Questions Status Filters */}
        <div className="bg-clay-canvas border border-clay-hairline rounded-clay-lg p-5 md:p-6 shadow-sm flex flex-col gap-4">
          <h3 className="text-xs uppercase font-bold text-clay-muted tracking-wider">
            Step 2: Filter Questions By Progress
          </h3>
          
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'ALL', name: 'All Questions', desc: 'Practice any question', color: 'bg-clay-surface-card hover:bg-clay-surface-strong text-clay-ink' },
              { id: 'UNATTEMPTED', name: 'Unattempted', desc: 'New questions only', color: 'bg-clay-lavender hover:bg-indigo-300 text-clay-ink' },
              { id: 'SPACED_REPETITION', name: 'Revision Queue', desc: 'Questions ready for review', color: 'bg-clay-mint hover:bg-teal-300 text-clay-ink' },
              { id: 'INCORRECT', name: 'Mistakes', desc: 'Questions you got wrong', color: 'bg-clay-peach hover:bg-orange-300 text-clay-ink' },
              { id: 'BOOKMARKED', name: 'Saved', desc: 'Questions you saved', color: 'bg-clay-ochre hover:bg-yellow-500 text-clay-ink' },
            ].map(filter => {
              const isActive = statusFilter === filter.id;
              return (
                <button
                  key={filter.id}
                  onClick={() => setStatusFilter(filter.id as any)}
                  className={`flex-1 min-w-[140px] p-3 border rounded-clay-md text-left transition-all duration-200 cursor-pointer ${
                    isActive 
                      ? `${filter.color} border-transparent ring-2 ring-clay-ink ring-offset-2`
                      : 'bg-clay-canvas border-clay-hairline text-clay-body hover:bg-clay-surface-soft'
                  }`}
                >
                  <span className="block text-xs font-bold">{filter.name}</span>
                  <span className={`block text-[10px] mt-0.5 ${isActive ? 'text-clay-ink/70' : 'text-clay-muted'}`}>
                    {filter.desc}
                  </span>
                </button>
              );
            })}
          </div>
          
          {statusFilter === 'SPACED_REPETITION' && (
            <div className="mt-4 border-t border-clay-hairline pt-4 space-y-3">
              <span className="block text-[11px] font-bold text-clay-muted uppercase tracking-wider">
                New Cards to Introduce:
              </span>
              <div className="flex gap-2">
                {[0, 5, 10, 20].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setNewCardsLimit(val)}
                    className={`flex-1 py-2 border text-xs font-bold rounded-clay-md cursor-pointer transition-all duration-200 ${
                      newCardsLimit === val
                        ? 'bg-clay-teal text-white border-transparent'
                        : 'bg-clay-canvas border-clay-hairline text-clay-body hover:bg-clay-surface-soft'
                    }`}
                  >
                    {val === 0 ? 'Review Only' : `+ ${val} New Qs`}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-clay-muted">
                Capping new cards prevents future review overload. Any remaining questions in the session will be cards due for review.
              </p>
            </div>
          )}
        </div>

        {/* Step 3: Choose Session Mode */}
        <div className="bg-clay-canvas border border-clay-hairline rounded-clay-lg p-5 md:p-6 shadow-sm flex flex-col gap-4">
          <h3 className="text-xs uppercase font-bold text-clay-muted tracking-wider">
            Step 3: Choose Session Mode
          </h3>
          
          <div className="flex flex-col sm:flex-row gap-4">
            <button
              type="button"
              onClick={() => handleMockToggle(false)}
              className={`flex-1 p-4 border rounded-clay-lg text-left transition-all duration-200 cursor-pointer ${
                !isMockTest
                  ? 'bg-clay-canvas border-clay-ink ring-2 ring-clay-ink ring-offset-2'
                  : 'bg-clay-canvas border-clay-hairline text-clay-body hover:bg-clay-surface-soft'
              }`}
            >
              <span className="block text-sm font-bold text-clay-ink">Practice Study Mode</span>
              <span className="block text-xs mt-1 text-clay-muted">
                Explanations shown immediately, take as much time as you want, and practice concepts offline.
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleMockToggle(true)}
              className={`flex-1 p-4 border rounded-clay-lg text-left transition-all duration-200 cursor-pointer ${
                isMockTest
                  ? 'bg-clay-canvas border-clay-ink ring-2 ring-clay-ink ring-offset-2'
                  : 'bg-clay-canvas border-clay-hairline text-clay-body hover:bg-clay-surface-soft'
              }`}
            >
              <span className="block text-sm font-bold text-clay-ink">Mock Exam Mode</span>
              <span className="block text-xs mt-1 text-clay-muted">
                Simulate standard NEET PG CBT. Explanations hidden until submission, total test limit active, flag for review, and negative marking enabled.
              </span>
            </button>
          </div>

          {isMockTest && (
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-clay-hairline pt-4 bg-clay-surface-soft/20 p-3.5 rounded-clay-md">
              {/* Positive Marks per Q */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold text-clay-muted uppercase tracking-wider">Marks per correct question:</span>
                <input
                  type="text"
                  value={marksInputText}
                  onChange={(e) => {
                    setMarksInputText(e.target.value);
                    const val = Number(e.target.value);
                    if (!isNaN(val) && Number.isInteger(val) && val > 0) {
                      setMarksPerQuestion(val);
                    }
                  }}
                  className="w-full bg-clay-canvas text-clay-ink text-xs font-bold rounded-clay-md px-3.5 py-2.5 border border-clay-hairline focus:border-clay-ink focus:outline-none"
                />
              </div>

              {/* Negative Marking Setup */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] font-bold text-clay-muted uppercase tracking-wider">Negative marking penalty:</span>
                  <label className="flex items-center gap-1 text-[10px] text-clay-pink font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={negativeMarkingEnabled}
                      onChange={(e) => setNegativeMarkingEnabled(e.target.checked)}
                      className="accent-clay-ink cursor-pointer"
                    />
                    <span>Enable Penalty</span>
                  </label>
                </div>
                <input
                  type="text"
                  disabled={!negativeMarkingEnabled}
                  value={negativeMarkInputText}
                  onChange={(e) => {
                    setNegativeMarkInputText(e.target.value);
                    const val = Number(e.target.value);
                    if (!isNaN(val) && val >= 0) {
                      setNegativeMarkValue(val);
                    }
                  }}
                  className="w-full bg-clay-canvas disabled:bg-clay-surface-strong disabled:text-clay-muted text-clay-ink text-xs font-bold rounded-clay-md px-3.5 py-2.5 border border-clay-hairline focus:border-clay-ink focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* 4. Timer Mode & Limit Column */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Timer Settings */}
          <div className="bg-clay-canvas border border-clay-hairline rounded-clay-lg p-5 md:p-6 shadow-sm flex flex-col gap-4">
            <h3 className="text-xs uppercase font-bold text-clay-muted tracking-wider flex items-center gap-1.5">
              <Timer className="w-4 h-4 text-clay-pink" />
              <span>Step 4: Timing Option</span>
            </h3>

            <div className="flex border border-clay-hairline bg-clay-surface-soft rounded-clay-md p-1">
              {[
                { id: 'STOPWATCH', name: 'Untimed' },
                { id: 'COUNTDOWN_Q', name: 'Per Question' },
                { id: 'TOTAL_LIMIT', name: 'Total Time' },
              ].map(mode => {
                const disabled = isMockTest && mode.id !== 'TOTAL_LIMIT';
                return (
                  <button
                    key={mode.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      setTimerMode(mode.id as any);
                      setTimerValue(mode.id === 'COUNTDOWN_Q' ? 60 : 10);
                    }}
                    className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider text-center rounded-clay-md transition-all ${
                      disabled
                        ? 'opacity-30 cursor-not-allowed text-clay-muted'
                        : timerMode === mode.id
                        ? 'bg-clay-canvas text-clay-ink shadow-sm cursor-pointer'
                        : 'text-clay-muted hover:text-clay-ink cursor-pointer'
                    }`}
                  >
                    {mode.name}
                  </button>
                );
              })}
            </div>

            {/* Sub-inputs depending on mode */}
            <div className="text-xs text-clay-body mt-1">
              {isMockTest && (
                <p className="text-clay-pink font-semibold text-[10px] mb-2">
                  * Mock exam mode enforces a total test time limit.
                </p>
              )}
              {timerMode === 'STOPWATCH' && (
                <p className="text-clay-muted">
                  Untimed: No time limit. Take as much time as you need to study.
                </p>
              )}
              {timerMode === 'COUNTDOWN_Q' && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span>Time per question:</span>
                    <span className="font-bold text-clay-ink">{timerValue}s</span>
                  </div>
                  <input
                    type="range"
                    min="15"
                    max="180"
                    step="15"
                    value={timerValue}
                    onChange={(e) => setTimerValue(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-clay-surface-strong rounded-lg appearance-none cursor-pointer accent-clay-ink"
                  />
                  <p className="text-clay-muted text-[10px]">
                    Strict mode: If the timer runs out, the question is marked incorrect and moves to the next one.
                  </p>
                </div>
              )}
              {timerMode === 'TOTAL_LIMIT' && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span>Total test duration:</span>
                    <span className="font-bold text-clay-ink">{timerValue} mins</span>
                  </div>
                  <input
                    type="range"
                    min="2"
                    max="60"
                    step="1"
                    value={timerValue <= 60 ? timerValue : 60}
                    onChange={(e) => {
                      setTimerValue(parseInt(e.target.value));
                      setCustomTimerText('');
                      setTimerValidationError(null);
                    }}
                    className="w-full h-1.5 bg-clay-surface-strong rounded-lg appearance-none cursor-pointer accent-clay-ink"
                  />
                  <div className="flex flex-col gap-1.5 mt-2">
                    <span className="text-[10px] font-bold text-clay-muted">Or enter a custom duration (mins):</span>
                    <input
                      type="text"
                      value={customTimerText}
                      onChange={(e) => handleCustomTimerChange(e.target.value)}
                      placeholder="e.g. 90"
                      className="w-full bg-clay-canvas text-clay-ink text-xs font-bold rounded-clay-md px-3.5 py-2.5 border border-clay-hairline focus:border-clay-ink focus:outline-none"
                    />
                    {timerValidationError && (
                      <span className="text-[10px] font-semibold text-rose-600">
                        {timerValidationError}
                      </span>
                    )}
                  </div>
                  <p className="text-clay-muted text-[10px]">
                    Practice exam mode: A total time limit to finish all questions in the test.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Limit settings */}
          <div className="bg-clay-canvas border border-clay-hairline rounded-clay-lg p-5 md:p-6 shadow-sm flex flex-col justify-between gap-4">
            <div>
              <h3 className="text-xs uppercase font-bold text-clay-muted tracking-wider mb-4">
                Step 5: Select Number of Questions
              </h3>
              
              <div className="flex gap-2">
                {[5, 10, 20, 50].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => handleSelectPresetLimit(val)}
                    className={`flex-1 py-2.5 border text-xs font-bold rounded-clay-md cursor-pointer transition-all duration-200 ${
                      questionLimit === val && !customLimitText
                        ? 'bg-clay-ink text-white border-transparent shadow-sm'
                        : 'bg-clay-canvas border-clay-hairline text-clay-body hover:bg-clay-surface-soft'
                    }`}
                  >
                    {val} Qs
                  </button>
                ))}
              </div>

              {/* Custom Questions Limit with validation */}
              <div className="mt-4 flex flex-col gap-2">
                <span className="text-[11px] font-bold text-clay-muted">Or enter a custom number (max 200):</span>
                <input
                  type="text"
                  value={customLimitText}
                  onChange={(e) => handleCustomLimitChange(e.target.value)}
                  placeholder="e.g. 15"
                  className="w-full bg-clay-canvas text-clay-ink text-xs font-bold rounded-clay-md px-3.5 py-2.5 border border-clay-hairline focus:border-clay-ink focus:outline-none"
                />
                {validationError && (
                  <span className="text-[10px] font-semibold text-rose-600">
                    {validationError}
                  </span>
                )}
              </div>
            </div>

            <div className="bg-clay-surface-soft border border-clay-hairline p-3 rounded-clay-md flex items-center gap-3">
              <HelpCircle className="w-5 h-5 text-clay-pink shrink-0" />
              <span className="text-[10px] text-clay-muted leading-snug">
                Questions will be selected based on your filters.
              </span>
            </div>
          </div>

        </div>

        {/* 4. Live Match Summary & Start Action */}
        <div className="bg-clay-surface-soft border border-clay-hairline rounded-clay-xl p-5 md:p-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-left">
            <span className="text-[10px] font-bold text-clay-pink uppercase tracking-wider block mb-1">
              Test Summary
            </span>
            <div className="text-sm font-bold text-clay-ink flex items-center gap-2">
              {isLoadingCount ? (
                <span className="flex items-center gap-1.5 text-clay-muted font-normal text-xs">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading questions...
                </span>
              ) : syncingSubjects.length > 0 ? (
                <span className="flex items-center gap-1.5 text-clay-pink font-semibold text-xs">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Preparing practice questions...
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  {statusFilter === 'SPACED_REPETITION' ? (
                    srCounts.due + srCounts.new === 0 ? (
                      "0 questions match these filters"
                    ) : (
                      <span>
                        {Math.min(questionLimit, srCounts.due + Math.min(newCardsLimit, srCounts.new))} questions ({srCounts.due} due reviews • up to {Math.min(newCardsLimit, srCounts.new)} new)
                      </span>
                    )
                  ) : (
                    <span>
                      {availableCount === 0 
                        ? "0 questions match these filters" 
                        : `${Math.min(questionLimit, availableCount)} questions ready for practice`}
                    </span>
                  )}
                </span>
              )}
              {!isLoadingCount && syncingSubjects.length === 0 && availableCount > 0 && (
                <span className="text-xs font-normal text-clay-muted">
                  (out of {availableCount} total questions)
                </span>
              )}
            </div>
          </div>

          <button
            onClick={handleStart}
            disabled={
              isLoadingCount || 
              syncingSubjects.length > 0 || 
              (statusFilter === 'SPACED_REPETITION' ? (srCounts.due + srCounts.new === 0) : availableCount === 0) || 
              selectedSubjects.length === 0 || 
              !!validationError || 
              !!timerValidationError
            }
            className="w-full md:w-auto bg-clay-ink hover:bg-neutral-800 disabled:bg-clay-surface-strong disabled:text-clay-muted disabled:cursor-not-allowed text-white font-bold h-12 px-8 rounded-clay-md shadow-sm active:scale-98 transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer text-sm"
          >
            <span>Start Practice Test</span>
            <Play className="w-4 h-4 fill-current" />
          </button>
        </div>

      </main>
    </div>
  );
}
