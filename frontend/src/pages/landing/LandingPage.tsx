import { useState, useEffect, useRef } from 'react';
import {
  ArrowRight,
  Sparkles,
  Lock,
  Unlock,
  CheckCircle2,
  XCircle,
  Bookmark,
  RotateCcw,
  Zap,
  HelpCircle,
  WifiOff,
  Database,
  Award,
  ChevronDown,
  ChevronUp,
  Layers,
  Menu,
  X,
  Search,
  AlertCircle,
  Star
} from 'lucide-react';
import { SignedIn, SignedOut, UserButton } from '@clerk/clerk-react';
import { ThemeToggle } from '../../components/ThemeToggle';
import { MarkdownRenderer } from '../../components/MarkdownRenderer';
import { totalDBQuestionCount } from '../../lib/subjects';

interface MCQOption {
  key: 'A' | 'B' | 'C' | 'D';
  text: string;
  isCorrect: boolean;
}

const mcqQuestionText = `A 38-week pregnant woman with poorly controlled **gestational diabetes** delivers a healthy neonate. Which of the following morphological responses would most likely be observed in the pancreatic islets of the neonate due to maternal hyperglycemia?`;

const mcqOptions: MCQOption[] = [
  { key: 'A', text: '*Atrophy*', isCorrect: false },
  { key: 'B', text: '*Dysplasia*', isCorrect: false },
  { key: 'C', text: '*Hyperplasia*', isCorrect: true },
  { key: 'D', text: '*Metaplasia*', isCorrect: false },
];

const mcqExplanationText = `Maternal hyperglycemia transfers excess glucose to the fetus. The fetal pancreas responds by producing insulin, causing **physiologic hyperplasia** of the islets (beta-cells). Post-delivery, the hyperinsulinemia persists briefly, causing potential neonatal hypoglycemia.`;

const mbbsSubjects = [
  'Anatomy', 'Physiology', 'Biochemistry', 'Pathology', 'Pharmacology', 
  'Microbiology', 'Forensic Medicine', 'Social & Preventive Medicine', 
  'Ophthalmology', 'Otorhinolaryngology', 'General Medicine', 'General Surgery', 
  'Obstetrics & Gynecology', 'Pediatrics', 'Orthopedics', 'Dermatology', 
  'Psychiatry', 'Radiology', 'Anesthesiology'
];

const subjectEmojis: Record<string, string> = {
  'Anatomy': '💀',
  'Physiology': '🫁',
  'Biochemistry': '🧬',
  'Pathology': '🔬',
  'Pharmacology': '💊',
  'Microbiology': '🧫',
  'Forensic Medicine': '🔍',
  'Social & Preventive Medicine': '🏥',
  'Ophthalmology': '👁️',
  'Otorhinolaryngology': '👂',
  'General Medicine': '🩺',
  'General Surgery': '🩹',
  'Obstetrics & Gynecology': '🤰',
  'Pediatrics': '👶',
  'Orthopedics': '🦴',
  'Dermatology': '🧴',
  'Psychiatry': '🧠',
  'Radiology': '🩻',
  'Anesthesiology': '💉'
};

export function LandingPage({ 
  onStartPractice, 
  onSignIn,
  onViewPrivacy,
  onViewTerms,
  onViewDisclaimer,
  onViewDMCA,
  onViewContribute,
  onViewRoadmap,
  onViewDownload,
  onViewBlog,
  isDark = false
}: { 
  onStartPractice: () => void; 
  onSignIn: () => void;
  onViewPrivacy: () => void;
  onViewTerms: () => void;
  onViewDisclaimer: () => void;
  onViewDMCA: () => void;
  onViewContribute: () => void;
  onViewRoadmap: () => void;
  onViewDownload: () => void;
  onViewBlog: () => void;
  isDark?: boolean;
}) {
  const logoSrc = isDark ? '/logo-dark.png' : '/logo-light.png';
  // MCQ Preview State
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [streakSimulated, setStreakSimulated] = useState(12);

  // Active Recall Dashboard State
  const [activeRecallTab, setActiveRecallTab] = useState<'daily' | 'mastery'>('daily');
  const [simulatedTasks, setSimulatedTasks] = useState([
    { id: 1, text: 'Complete 5 Pathology Revision Reviews', done: true, points: '+50 Points' },
    { id: 2, text: 'Target 3 Pharmacology Weak Spots', done: false, points: '+30 Points' },
    { id: 3, text: 'Review 1 Physiology bookmarked question', done: false, points: '+15 Points' },
  ]);

  // GitHub Stars State
  const [gitHubStars, setGitHubStars] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('https://api.github.com/repos/Riso19/openmedq', { signal: controller.signal })
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error('Failed to fetch stars');
      })
      .then((data) => {
        const repoInfo = data as { stargazers_count?: number };
        if (repoInfo && typeof repoInfo.stargazers_count === 'number') {
          setGitHubStars(repoInfo.stargazers_count);
        }
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        console.warn('GitHub star fetch failed:', err);
      });
    return () => {
      controller.abort();
    };
  }, []);

  // FAQ Accordion State
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Mobile Menu State
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Interactive Feature Drilldown Demo State
  const [demoExpanded, setDemoExpanded] = useState(false);

  // FSRS Interactive Simulator State
  const [fsrsStability, setFsrsStability] = useState(3.2);
  const [fsrsDifficulty, setFsrsDifficulty] = useState(5.1);
  const [fsrsInterval, setFsrsInterval] = useState('3 days');
  const [lastFsrsAction, setLastFsrsAction] = useState<string | null>(null);

  const handleFsrsSimulate = (rating: 'again' | 'hard' | 'good' | 'easy') => {
    setLastFsrsAction(rating);
    if (rating === 'again') {
      setFsrsStability(1.0);
      setFsrsDifficulty(8.0);
      setFsrsInterval('1 day');
    } else if (rating === 'hard') {
      setFsrsStability(2.2);
      setFsrsDifficulty(6.5);
      setFsrsInterval('2 days');
    } else if (rating === 'good') {
      setFsrsStability(8.4);
      setFsrsDifficulty(5.1);
      setFsrsInterval('8 days');
    } else if (rating === 'easy') {
      setFsrsStability(18.5);
      setFsrsDifficulty(3.8);
      setFsrsInterval('18 days');
    }
  };

  // Animated Questions Count triggered on scroll
  const [questionCount, setQuestionCount] = useState(175000);
  const counterRef = useRef<HTMLDivElement | null>(null);
  const [hasAnimated, setHasAnimated] = useState(false);
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (hasAnimated) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          setHasAnimated(true);
          
          let start = 175000;
          const end = totalDBQuestionCount;
          const duration = 2000;
          
          const startTime = performance.now();

          const updateCount = (now: number) => {
            const progress = Math.min((now - startTime) / duration, 1);
            const easeProgress = progress * (2 - progress);
            const current = Math.floor(easeProgress * (end - start) + start);
            setQuestionCount(current);
            
            if (progress < 1) {
              rafIdRef.current = requestAnimationFrame(updateCount);
            } else {
              rafIdRef.current = null;
            }
          };

          rafIdRef.current = requestAnimationFrame(updateCount);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    if (counterRef.current) {
      observer.observe(counterRef.current);
    }

    return () => {
      observer.disconnect();
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [hasAnimated]);

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const handleOptionClick = (key: string) => {
    if (selectedOption) return;
    setSelectedOption(key);
    if (key === 'C') {
      setStreakSimulated(prev => prev + 1);
    }
  };

  const resetMCQ = () => {
    setSelectedOption(null);
  };

  const toggleTask = (id: number) => {
    setSimulatedTasks(tasks =>
      tasks.map(t => (t.id === id ? { ...t, done: !t.done } : t))
    );
  };

  const faqs = [
    {
      q: 'How is OpenMedQ 100% free? Is there a catch?',
      a: 'There is no catch. OpenMedQ is a solo project built by a 3rd year medical student who got tired of platforms pay-walling standard clinical questions. Because it is programmed to run local-first in your browser, there are no expensive database servers to host, keeping operating costs at practically ₹0. It remains open and free for all medical students.',
    },
    {
      q: 'Are the questions aligned with the recent clinical patterns for NEET PG, FMGE, and INI-CET?',
      a: 'Yes. All questions are compiled from the open MedMCQA clinical research dataset (originally published on Hugging Face by OpenLifeScienceAI), consisting of over 186,000 verified medical prep questions. They are mapped to the 19 standard MBBS subjects, peer-vetted to exclude outdated guidelines, and formatted to mirror clinical, case-based questions.',
    },
    {
      q: 'Can I study offline in clinical wards or hostels?',
      a: 'Yes. OpenMedQ is designed to be Local-First. When you load a subject pack, it caches locally. You can solve questions, view detailed explanations, and track your revision shelf life in clinical wards, lifts, or basements with zero cellular signal.',
    },
    {
      q: 'Why should I sign up if Guest Mode is available?',
      a: 'Guest Mode lets you practice instantly with zero setup. Creating a free account via Clerk securely syncs your revision history, bookmarks, and streaks across your laptop and phone, ensuring you never lose your progress.',
    },
    {
      q: 'How does the FSRS (Free Spaced Repetition Scheduler) algorithm differ from traditional Anki or SM-2?',
      a: 'FSRS v6 is a modern spaced repetition scheduler based on advanced optimization curves. While older engines (like SM-2) rely on simple multipliers that lead to review pile-ups, FSRS dynamically calculates the Retrievability, Stability, and Difficulty of each concept based on your responses. It adjusts scheduling parameters so you study less while achieving superior long-term retention.',
    },
    {
      q: 'Is my study progress safe on OpenMedQ, and is it secure?',
      a: 'Absolutely. Your data is stored locally in your browser\'s IndexedDB database, meaning you own your logs. When syncing with Clerk, your progress is compressed into a lightweight format, guaranteeing your records are saved safely without bloating transmission.',
    },
    {
      q: 'How can I submit corrections or contribute to the question bank?',
      a: 'OpenMedQ is a peer-supported open-source platform. If you find a typo, an outdated clinical guideline, or a wrong reference explanation, you can click the GitHub link in the footer to submit corrections or open a pull request directly.',
    }
  ];

  // Inject FAQPage JSON-LD structured data for semantic understanding
  useEffect(() => {
    const faqSchema = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      'mainEntity': faqs.map(faq => ({
        '@type': 'Question',
        'name': faq.q,
        'acceptedAnswer': {
          '@type': 'Answer',
          'text': faq.a
        }
      }))
    };

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'faq-schema';
    script.textContent = JSON.stringify(faqSchema);
    document.head.appendChild(script);

    return () => {
      document.getElementById('faq-schema')?.remove();
    };
  }, []);

  return (
    <div className="min-h-screen bg-clay-canvas text-clay-ink flex flex-col font-sans selection:bg-clay-pink/20 selection:text-clay-pink relative overflow-x-hidden">
      
      {/* HEADER */}
      <header className="sticky top-0 z-50 w-full bg-clay-canvas border-b border-clay-hairline py-4 px-6 md:px-12 flex items-center justify-between">
        <div className="flex items-center gap-3 group cursor-pointer" onClick={() => { setIsMobileMenuOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
          <img src={logoSrc} width="40" height="40" className="w-10 h-10 rounded-clay-md shadow-sm group-hover:scale-105 transition-transform duration-300 object-contain" alt="OpenMedQ Logo" />
          <span className="text-xl font-bold tracking-tight text-clay-ink group-hover:text-clay-pink transition-colors duration-300">
            OpenMedQ
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-clay-muted">
          <a href="/blog" onClick={(e) => { e.preventDefault(); onViewBlog(); }} className="hover:text-clay-ink transition-colors duration-200 font-semibold text-sm cursor-pointer">Blog</a>
          <a href="/roadmap" onClick={(e) => { e.preventDefault(); onViewRoadmap(); }} className="hover:text-clay-ink transition-colors duration-200 font-semibold text-sm cursor-pointer">Roadmap</a>
          <a href="/contribute" onClick={(e) => { e.preventDefault(); onViewContribute(); }} className="hover:text-clay-ink transition-colors duration-200 font-semibold text-sm cursor-pointer">Contribute</a>
          <a href="/download" onClick={(e) => { e.preventDefault(); onViewDownload(); }} className="hover:text-clay-ink transition-colors duration-200 font-semibold text-sm cursor-pointer">Download App</a>
        </nav>

        {/* Desktop actions */}
        <div className="hidden md:flex items-center gap-4">
          <ThemeToggle />
          <a
            href="https://github.com/Riso19/openmedq"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-clay-hairline hover:bg-clay-surface-soft text-clay-ink rounded-clay-md text-xs font-semibold shadow-sm transition-all duration-200 cursor-pointer"
          >
            <Star className="w-3.5 h-3.5 fill-amber-400 stroke-amber-500" />
            <span>Star</span>
            {gitHubStars !== null && (
              <span className="bg-clay-surface-soft px-1.5 py-0.5 rounded text-[10px] text-clay-muted border-l border-clay-hairline ml-1">
                {gitHubStars}
              </span>
            )}
          </a>
          <SignedOut>
            <button
              onClick={onSignIn}
              className="text-sm font-semibold text-clay-body hover:text-clay-ink transition-colors duration-200 px-4 py-2 cursor-pointer"
            >
              Sign In
            </button>
            <button
              onClick={onStartPractice}
              className="bg-clay-ink hover:bg-neutral-800 text-white font-semibold text-sm px-5 py-2.5 rounded-clay-md shadow-sm active:scale-95 transition-all duration-200 cursor-pointer"
            >
              Guest Mode
            </button>
          </SignedOut>
          <SignedIn>
            <button
              onClick={onStartPractice}
              className="bg-clay-ink hover:bg-neutral-800 text-white font-semibold text-sm px-5 py-2.5 rounded-clay-md shadow-sm active:scale-95 transition-all duration-200 cursor-pointer"
            >
              Practice Suite
            </button>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
        </div>
 
        {/* Mobile menu toggle (hamburger) */}
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="md:hidden p-2 rounded-clay-md border border-clay-hairline text-clay-ink hover:bg-clay-surface-soft active:scale-95 transition-all cursor-pointer"
          aria-label="Toggle menu"
        >
          {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>
 
      {/* MOBILE MENU DRAWER OVERLAY */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-x-0 top-[73px] bottom-0 bg-clay-canvas/95 backdrop-blur-md z-40 border-t border-clay-hairline p-6 pb-10 flex flex-col justify-between overflow-y-auto scrollbar-none animate-[fadeIn_0.2s_ease-out]">
          <nav className="flex flex-col gap-6 text-base font-semibold text-clay-ink text-left">
            <button 
              onClick={() => { 
                setIsMobileMenuOpen(false); 
                onViewBlog(); 
              }} 
              className="py-2 border-b border-clay-hairline hover:text-clay-pink text-left bg-transparent border-0 p-0 font-semibold text-base cursor-pointer"
            >
              Blog
            </button>
            <button 
              onClick={() => { 
                setIsMobileMenuOpen(false); 
                onViewRoadmap(); 
              }} 
              className="py-2 border-b border-clay-hairline hover:text-clay-pink text-left bg-transparent border-0 p-0 font-semibold text-base cursor-pointer"
            >
              Product Roadmap
            </button>
            <button 
              onClick={() => { 
                setIsMobileMenuOpen(false); 
                onViewContribute(); 
              }} 
              className="py-2 border-b border-clay-hairline hover:text-clay-pink text-left bg-transparent border-0 p-0 font-semibold text-base cursor-pointer"
            >
              Contribute & Submit
            </button>
            <button 
              onClick={() => { 
                setIsMobileMenuOpen(false); 
                onViewDownload(); 
              }} 
              className="py-2 border-b border-clay-hairline hover:text-clay-pink text-left bg-transparent border-0 p-0 font-semibold text-base cursor-pointer"
            >
              Download Mobile App (Beta)
            </button>
          </nav>
 
          <div className="flex flex-col gap-4 mb-8">
            <div className="flex items-center justify-between py-2 px-1 border-b border-clay-hairline">
              <span className="text-xs font-bold text-clay-muted">Theme</span>
              <ThemeToggle />
            </div>
            <div className="flex items-center justify-between py-2 px-1 border-b border-clay-hairline">
              <span className="text-xs font-bold text-clay-muted">GitHub</span>
              <a
                href="https://github.com/Riso19/openmedq"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-clay-hairline hover:bg-clay-surface-soft text-clay-ink rounded-clay-md text-xs font-semibold shadow-sm transition-all duration-200 cursor-pointer"
              >
                <Star className="w-3.5 h-3.5 fill-amber-400 stroke-amber-500" />
                <span>Star</span>
                {gitHubStars !== null && (
                  <span className="bg-clay-surface-soft px-1.5 py-0.5 rounded text-[10px] text-clay-muted border-l border-clay-hairline ml-1">
                    {gitHubStars}
                  </span>
                )}
              </a>
            </div>
            <SignedOut>
              <button
                onClick={() => { setIsMobileMenuOpen(false); onStartPractice(); }}
                className="w-full bg-clay-ink hover:bg-neutral-800 text-white font-bold h-12 rounded-clay-md transition-all flex items-center justify-center gap-2 text-sm cursor-pointer"
              >
                <span>Practice in Guest Mode</span>
                <ArrowRight className="w-4.5 h-4.5" />
              </button>
              <button
                onClick={() => { setIsMobileMenuOpen(false); onSignIn(); }}
                className="w-full bg-clay-pink/10 border border-clay-pink/20 hover:bg-clay-pink/20 text-clay-pink font-bold h-12 rounded-clay-md transition-all flex items-center justify-center gap-2 text-sm cursor-pointer shadow-sm hover:shadow"
              >
                <Sparkles className="w-4 h-4 text-clay-pink fill-current animate-pulse" />
                <span>Sign Up to Sync Streaks</span>
              </button>
            </SignedOut>
            <SignedIn>
              <button
                onClick={() => { setIsMobileMenuOpen(false); onStartPractice(); }}
                className="w-full bg-clay-ink hover:bg-neutral-800 text-white font-bold h-12 rounded-clay-md transition-all flex items-center justify-center gap-2 text-sm cursor-pointer"
              >
                <span>Go to Practice Suite</span>
                <ArrowRight className="w-4.5 h-4.5" />
              </button>
              <div className="flex items-center justify-center gap-3 w-full bg-clay-surface-soft border border-clay-hairline py-3 px-4 rounded-clay-md">
                <UserButton showName afterSignOutUrl="/" />
              </div>
            </SignedIn>
          </div>
        </div>
      )}

      {/* MAIN CONTENT */}
      <main>
      <section className="relative py-12 md:py-24 px-6 md:px-12 max-w-7xl mx-auto w-full z-20 flex flex-col lg:flex-row items-center gap-10 md:gap-16">
        
        {/* Left Side: Copywriting & Actions */}
        <div className="flex-1 text-left flex flex-col items-start w-full animate-fade-in-up">
          <div className="flex flex-wrap gap-2.5 mb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-clay-surface-strong border border-clay-hairline text-clay-ink text-xs font-semibold tracking-wide uppercase">
              <span>Built by a 3rd Year MBBS Student (Solo Project)</span>
            </div>
            <button 
              onClick={onViewDownload}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-clay-pink/10 hover:bg-clay-pink/20 border border-clay-pink/20 text-clay-pink text-xs font-bold tracking-wide uppercase transition-colors cursor-pointer"
            >
              <Sparkles className="w-3 h-3 text-clay-pink fill-current animate-pulse" />
              <span>Mobile App Beta Out!</span>
            </button>
          </div>

          {/* Headline */}
          <h1 className="font-rubik text-3xl sm:text-5xl md:text-[56px] leading-[1.1] md:leading-[1.05] font-medium text-clay-ink tracking-[-0.04em] mb-6 w-full">
            <span className="block text-xs sm:text-sm md:text-base font-bold uppercase tracking-widest text-clay-pink mb-4">
              Free Spaced Repetition NEET PG, FMGE & INI-CET Question Bank
            </span>{" "}
            Your brain is not a sieve. The prep system is just broken.
          </h1>

          <p className="text-clay-body text-sm sm:text-base md:text-lg leading-relaxed mb-10 max-w-prose">
            You spend 12 hours on clinical wards, get back to your room exhausted, open a question bank, and realize you forgot last week's notes. It makes you feel like an imposter. But it is not your fault. I built OpenMedQ as a fully unlocked, offline-first practice suite to help us defeat the forgetting curve without commercial paywalls.
          </p>

          <div className="w-full max-w-md">
            <SignedIn>
              <button
                onClick={onStartPractice}
                className="w-full bg-clay-ink hover:bg-neutral-800 text-white font-bold h-12 rounded-clay-md shadow-sm active:scale-98 transition-all duration-300 flex items-center justify-center gap-2 text-sm cursor-pointer"
              >
                <span>Enter Practice Suite</span>
                <ArrowRight className="w-4.5 h-4.5" />
              </button>
            </SignedIn>
            <SignedOut>
              <div className="grid grid-cols-2 gap-3 w-full">
                <button
                  onClick={onStartPractice}
                  className="bg-clay-ink hover:bg-neutral-800 text-white font-bold h-12 rounded-clay-md shadow-sm active:scale-98 transition-all duration-300 flex items-center justify-center gap-1.5 text-xs sm:text-sm cursor-pointer"
                >
                  <span>Practice Guest</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={onSignIn}
                  className="bg-clay-pink/10 border border-clay-pink/20 hover:bg-clay-pink/20 text-clay-pink font-bold h-12 rounded-clay-md active:scale-98 transition-all duration-300 flex items-center justify-center gap-1.5 text-xs sm:text-sm cursor-pointer shadow-sm hover:shadow"
                >
                  <Sparkles className="w-3.5 h-3.5 text-clay-pink fill-current animate-pulse" />
                  <span>Sync Streaks</span>
                </button>
              </div>
            </SignedOut>
          </div>
        </div>

        {/* Right Side: Hero Illustration Card */}
        <div className="flex-1 w-full max-w-lg animate-fade-in-up delay-100">
          <div className="bg-clay-surface-soft border border-clay-hairline rounded-clay-xl p-2 flex flex-col shadow-sm relative overflow-hidden group">
            <img 
              src="https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=800&q=80" 
              alt="Clinical Practice and Medical Study" 
              width="800"
              height="350"
              fetchPriority="high"
              className="w-full h-[300px] md:h-[350px] object-cover rounded-clay-lg shadow-inner group-hover:scale-[1.02] transition-transform duration-500 ease-out" 
            />
          </div>
        </div>
      </section>

      {/* SUBJECTS SCROLLING MARQUEE */}
      <div className="relative w-full overflow-hidden bg-clay-surface-soft py-5 border-y border-clay-hairline z-20">
        <div className="absolute inset-y-0 left-0 w-12 sm:w-24 bg-gradient-to-r from-clay-surface-soft to-transparent z-10 pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-12 sm:w-24 bg-gradient-to-l from-clay-surface-soft to-transparent z-10 pointer-events-none" />

        <div className="animate-marquee gap-6 items-center">
          {/* Loop twice for infinite marquee */}
          {[...mbbsSubjects, ...mbbsSubjects].map((subject, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 bg-clay-canvas border border-clay-hairline rounded-full px-4 py-1.5 hover:bg-clay-surface-card transition-all duration-300 select-none shrink-0"
            >
              <span className="text-base select-none shrink-0" role="img" aria-label={subject}>
                {subjectEmojis[subject] || '📚'}
              </span>
              <span className="text-xs sm:text-sm font-semibold text-clay-ink">{subject}</span>
            </div>
          ))}
        </div>
      </div>

      {/* INTERACTIVE MCQ SANDBOX SECTION */}
      <section id="sandbox" className="py-12 px-6 md:px-12 max-w-7xl mx-auto w-full z-20">
        
        {/* Saturated feature-card-lavender */}
        <div className="bg-clay-lavender rounded-clay-xl border border-clay-hairline p-5 sm:p-8 md:p-12 text-clay-ink shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-white/20 filter blur-2xl pointer-events-none" />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            
            {/* Title / Column left */}
            <div className="lg:col-span-5 text-left w-full">
              <span className="px-3 py-1 rounded-full bg-white/45 text-clay-ink text-xs font-bold uppercase tracking-wider mb-4 inline-block">
                Interactive Sandbox
              </span>
              <h2 className="font-rubik text-2xl sm:text-3xl md:text-4xl font-medium tracking-[-0.03em] mb-4 text-clay-ink leading-tight">
                Try a high-yield Pathology card.
              </h2>
              <p className="text-clay-ink/80 text-xs sm:text-sm md:text-base leading-relaxed mb-6 max-w-prose">
                Active recall is standard for elite clinical scores. Try this pathology card without setting up any credentials. See instantaneous feedback and unlock explanations.
              </p>
              <div className="flex items-center flex-wrap gap-4 text-[10px] sm:text-xs font-bold">
                <span className="flex items-center gap-1">
                  <Award className="w-4 h-4 text-clay-ochre fill-current" />
                  MBBS High-Yield
                </span>
                <span className="flex items-center gap-1">
                  <WifiOff className="w-4 h-4" />
                  Offline Sandbox Mode
                </span>
              </div>
            </div>

            {/* MCQ Widget inside */}
            <div className="lg:col-span-7 w-full">
              <div className="bg-clay-canvas rounded-clay-lg border border-clay-hairline p-4 sm:p-6 shadow-sm text-left">
                
                {/* Meta header */}
                <div className="flex items-center justify-between mb-5">
                  <span className="px-2.5 py-1 rounded bg-clay-lavender/40 border border-clay-lavender/60 text-clay-ink text-[10px] sm:text-xs font-bold uppercase tracking-wider">
                    Pathology: Cell Adaptations
                  </span>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsBookmarked(!isBookmarked)}
                      className={`p-1.5 rounded-clay-md border transition-all duration-200 cursor-pointer ${
                        isBookmarked
                          ? 'bg-clay-ochre text-clay-ink border-clay-ochre'
                          : 'border-clay-hairline text-clay-muted hover:text-clay-ink hover:bg-clay-surface-soft'
                      }`}
                      title="Bookmark Question"
                    >
                      <Bookmark className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Question */}
                <div className="text-clay-ink font-semibold text-sm sm:text-base md:text-lg leading-relaxed mb-6">
                  <MarkdownRenderer content={mcqQuestionText} />
                </div>

                {/* Options */}
                <div className="flex flex-col gap-3 mb-6">
                  {mcqOptions.map(option => {
                    const isSelected = selectedOption === option.key;
                    const isCorrectOption = option.isCorrect;
                    
                    let btnStyle = 'border-clay-hairline bg-white hover:bg-clay-surface-soft text-clay-ink';
                    let feedbackIcon = null;

                    if (selectedOption) {
                      if (isSelected) {
                        if (isCorrectOption) {
                          btnStyle = 'border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/25 dark:text-emerald-300 font-bold';
                          feedbackIcon = <CheckCircle2 className="w-5 h-5 text-emerald-700 dark:text-emerald-400 shrink-0" />;
                        } else {
                          btnStyle = 'border-rose-500 bg-rose-50 text-rose-900 dark:bg-rose-950/25 dark:text-rose-300 font-bold';
                          feedbackIcon = <XCircle className="w-5 h-5 text-rose-700 dark:text-rose-400 shrink-0" />;
                        }
                      } else if (isCorrectOption) {
                        btnStyle = 'border-emerald-500/30 bg-emerald-50/40 text-emerald-900 dark:bg-emerald-950/15 dark:text-emerald-400';
                      } else {
                        btnStyle = 'border-clay-hairline bg-white text-clay-muted';
                      }
                    }

                    return (
                      <button
                        key={option.key}
                        onClick={() => handleOptionClick(option.key)}
                        disabled={selectedOption !== null}
                        className={`w-full flex items-center justify-between border rounded-clay-md p-3.5 sm:p-4 text-left transition-all duration-200 select-none cursor-pointer group ${btnStyle}`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`w-7 h-7 rounded-clay-md flex items-center justify-center text-xs font-semibold shrink-0 transition-colors duration-200 ${
                            selectedOption
                              ? isSelected
                                ? isCorrectOption
                                  ? 'bg-emerald-500 text-white'
                                  : 'bg-rose-500 text-white'
                                : isCorrectOption
                                ? 'bg-emerald-500/20 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
                                : 'bg-clay-surface-strong text-clay-muted'
                              : 'bg-clay-surface-soft group-hover:bg-clay-surface-strong text-clay-muted'
                          }`}>
                            {option.key}
                          </span>
                          <span className="text-xs sm:text-sm md:text-base leading-snug">
                            <MarkdownRenderer content={option.text} inline />
                          </span>
                        </div>
                        {feedbackIcon}
                      </button>
                    );
                  })}
                </div>

                {/* Explanation revealed */}
                {selectedOption && (
                  <div className="border-t border-clay-hairline pt-5 mt-5 space-y-4">
                    <div className="flex items-center gap-2">
                      <HelpCircle className="w-4.5 h-4.5 text-clay-pink" />
                      <h4 className="font-bold text-clay-ink text-xs uppercase tracking-wider">High-Yield Explanation</h4>
                    </div>
                    <div className="text-clay-body text-xs sm:text-sm leading-relaxed max-w-prose">
                      <MarkdownRenderer content={mcqExplanationText} />
                    </div>

                    {/* Loop nudge inside the card */}
                    <div className="bg-clay-surface-soft border border-clay-hairline rounded-clay-md p-3 sm:p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div className="text-left">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-clay-pink uppercase tracking-wider mb-1">
                          <Zap className="w-3.5 h-3.5 fill-current" />
                          <span>5 active recall loops open today</span>
                        </div>
                        <p className="text-clay-body text-[11px] sm:text-xs font-medium">
                          You have 4 more pathology questions waiting in your daily high-yield set.
                        </p>
                      </div>
                      <div className="flex gap-2.5 w-full sm:w-auto shrink-0">
                        <button
                          onClick={resetMCQ}
                          className="flex-1 sm:flex-none border border-clay-hairline hover:bg-clay-surface-strong p-2.5 rounded-clay-md text-clay-muted hover:text-clay-ink transition-colors duration-200 cursor-pointer flex justify-center items-center"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        <button
                          onClick={onStartPractice}
                          className="flex-grow sm:flex-none bg-clay-ink hover:bg-neutral-800 text-white text-xs font-bold px-4 py-2.5 rounded-clay-md transition-colors duration-200 cursor-pointer"
                        >
                          Complete Daily Set
                        </button>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            </div>

          </div>
        </div>
      </section>

      {/* THE MANIFESTO SECTION */}
      <section id="manifesto" className="py-16 md:py-24 px-6 md:px-12 max-w-7xl mx-auto w-full z-20 border-t border-clay-hairline">
        <div className="bg-clay-surface-card rounded-clay-xl border border-clay-hairline p-8 md:p-12 text-left relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-clay-pink/5 filter blur-3xl pointer-events-none" />
          
          <div className="max-w-3xl">
            <span className="text-xs font-bold uppercase tracking-widest text-clay-pink mb-3 block">
              The OpenMedQ Manifesto
            </span>
            <h2 className="font-rubik text-2xl sm:text-3xl md:text-5xl font-medium tracking-[-0.03em] mb-6">
              Why are we paying corporations to study?
            </h2>
            <div className="space-y-6 text-clay-body text-sm sm:text-base md:text-lg leading-relaxed">
              <p>
                Medical school is hard enough. The exhaustion of night duties, the constant clinical rotations, and the imposter syndrome are heavy burdens. Yet, commercial prep platforms treat medical students as cash cows.
              </p>
              <p>
                They block standard clinical explanations behind massive paywalls, lock you out of your own bookmarks the moment your plan expires, and flood your phone with aggressive sales calls.
              </p>
              <p className="font-semibold text-clay-ink">
                We refuse to be locked out of our own education. OpenMedQ is a student-built alternative. It has zero subscription fees, zero corporate boards, and is built by a fellow peer who understands what clinical study looks like in the trenches.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURE SHOWCASE SECTION */}
      <section id="features" className="py-16 md:py-24 px-6 md:px-12 max-w-7xl mx-auto w-full z-20 border-t border-clay-hairline">
        <div className="text-center mb-16">
          <span className="text-xs font-bold uppercase tracking-widest text-clay-pink mb-3 block">
            Designed for Clinical Rotations
          </span>
          <h2 className="font-rubik text-2xl sm:text-3xl md:text-5xl font-medium tracking-[-0.03em] mb-4">
            Re-Engineered Study Suite Features
          </h2>
          <p className="text-clay-body max-w-xl mx-auto text-xs sm:text-sm md:text-base">
            No bloated visual features or technical metrics. Just utilities built to survive actual internship schedules.
          </p>
        </div>

        {/* Feature Cards Grid (Teal -> Pink -> Lavender -> Peach) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          
          {/* Card 1: Subject Search & Prof Filters (Teal) */}
          <div className="bg-clay-teal rounded-clay-xl border border-transparent p-6 sm:p-8 text-white flex flex-col justify-between hover-clay-card min-h-[360px]">
            <div className="text-left">
              <span className="px-2.5 py-1 rounded bg-white/10 text-clay-mint text-[10px] font-bold uppercase tracking-wider mb-4 inline-block">
                Navigation
              </span>
              <h3 className="font-rubik text-lg sm:text-xl font-medium tracking-tight mb-3 text-white">
                Syllabus Search & Prof Filters
              </h3>
              <p className="text-zinc-300 text-xs sm:text-sm leading-relaxed mb-6">
                Find subjects instantly. Filter by academic year phases (Pre-Clinical, Para-Clinical, Short Subjects, or Clinical Core) to align with your current college postings.
              </p>
            </div>
            {/* UI Fragment */}
            <div className="bg-white/5 border border-white/10 rounded-clay-lg p-4 text-left space-y-3">
              <div className="flex items-center gap-2 bg-white/10 rounded-clay-md px-3 py-1.5 text-xs text-white">
                <Search className="w-3.5 h-3.5 text-clay-mint" />
                <span className="opacity-70">Search subjects (e.g. Pathology)...</span>
              </div>
              <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
                <span className="bg-clay-mint text-clay-teal px-2 py-0.5 rounded-full text-[9px] font-bold shrink-0">All</span>
                <span className="bg-white/10 text-white/70 px-2 py-0.5 rounded-full text-[9px] font-bold shrink-0">1st Year</span>
                <span className="bg-white/10 text-white/70 px-2 py-0.5 rounded-full text-[9px] font-bold shrink-0">2nd & 3rd Year</span>
                <span className="bg-white/10 text-white/70 px-2 py-0.5 rounded-full text-[9px] font-bold shrink-0">Final Year</span>
              </div>
            </div>
          </div>

          {/* Card 2: Subject Matrix & Topic Drilldowns (Pink) */}
          <div className="bg-clay-pink rounded-clay-xl border border-transparent p-6 sm:p-8 text-white flex flex-col justify-between hover-clay-card min-h-[360px]">
            <div className="text-left">
              <span className="px-2.5 py-1 rounded bg-white/10 text-white text-[10px] font-bold uppercase tracking-wider mb-4 inline-block">
                Matrix
              </span>
              <h3 className="font-rubik text-lg sm:text-xl font-medium tracking-tight mb-3 text-white">
                Subject Performance Matrix
              </h3>
              <p className="text-zinc-100 text-xs sm:text-sm leading-relaxed mb-6">
                Stop testing blindly. Click any subject card inside the performance grid to expand and drill down into topic-level completion stats and accuracy quotients.
              </p>
            </div>
            {/* UI Fragment */}
            <div className="bg-white/10 border border-white/20 rounded-clay-lg p-3 text-left space-y-2">
              <div 
                className="flex justify-between items-center bg-white/10 p-2 rounded-clay-md cursor-pointer select-none"
                onClick={() => setDemoExpanded(!demoExpanded)}
              >
                <div className="text-left">
                  <span className="text-[9px] opacity-75 block">Pathology</span>
                  <span className="text-xs font-bold">Cell Injury & Adaptations</span>
                </div>
                {demoExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </div>
              
              {demoExpanded && (
                <div className="bg-white/5 border border-white/10 rounded p-2 text-[10px] space-y-2 animate-fade-in">
                  <div className="flex justify-between items-center">
                    <span>Intracellular Accumulations</span>
                    <span className="font-bold text-clay-mint">90% Done (85% Acc)</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Cell Death (Necrosis/Apoptosis)</span>
                    <span className="font-bold text-clay-mint">60% Done (78% Acc)</span>
                  </div>
                </div>
              )}
              {!demoExpanded && (
                <div className="text-[10px] opacity-60 text-center italic py-1">Click to expand subject matrix demo</div>
              )}
            </div>
          </div>

          {/* Card 3: FSRS v6 Spaced Repetition Engine (Lavender) */}
          <div className="bg-clay-lavender rounded-clay-xl border border-clay-hairline p-6 sm:p-8 text-clay-ink flex flex-col justify-between hover-clay-card min-h-[360px]">
            <div className="text-left">
              <span className="px-2.5 py-1 rounded bg-clay-ink/10 text-clay-ink text-[10px] font-bold uppercase tracking-wider mb-4 inline-block">
                FSRS v6 Spaced Repetition
              </span>
              <h3 className="font-rubik text-lg sm:text-xl font-medium tracking-tight mb-3 text-clay-ink">
                FSRS Optimization Engine
              </h3>
              <p className="text-clay-body text-xs sm:text-sm leading-relaxed mb-6">
                Forget static revision calendars. We use the state-of-the-art Free Spaced Repetition Scheduler. Grade your recall response to dynamically expand card stability, difficulty, and next intervals in real time.
              </p>
            </div>
            {/* UI Fragment (FSRS Simulator) */}
            <div className="bg-clay-canvas border border-clay-hairline rounded-clay-lg p-3 sm:p-4 text-left space-y-3 shadow-inner">
              <div className="flex justify-between items-center text-[10px] font-bold text-clay-muted">
                <span>FSRS v6 State: <span className="text-clay-pink font-semibold">Active Memory Card</span></span>
                {lastFsrsAction && (
                  <span className="bg-clay-mint text-clay-teal px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase animate-pulse">
                    Updated: {lastFsrsAction}
                  </span>
                )}
              </div>
              
              <div className="bg-clay-surface-soft border border-clay-hairline rounded p-2.5 space-y-1.5 text-xs text-clay-body font-mono">
                <div className="flex justify-between">
                  <span>Stability (S):</span>
                  <span className="font-bold text-clay-ink">{fsrsStability.toFixed(1)} days</span>
                </div>
                <div className="flex justify-between">
                  <span>Difficulty (D):</span>
                  <span className="font-bold text-clay-ink">{fsrsDifficulty.toFixed(1)}/10</span>
                </div>
                <div className="flex justify-between border-t border-clay-hairline/60 pt-1.5 font-bold text-clay-pink">
                  <span>Next Review Interval:</span>
                  <span>{fsrsInterval}</span>
                </div>
              </div>
              
              <div className="grid grid-cols-4 gap-1 pt-1">
                <button
                  onClick={() => handleFsrsSimulate('again')}
                  className={`text-[9px] font-bold py-1 px-0.5 rounded text-center border transition-all duration-150 cursor-pointer ${
                    lastFsrsAction === 'again'
                      ? 'bg-rose-500 text-white border-rose-600 shadow-sm scale-95'
                      : 'bg-white text-rose-600 border-rose-200 hover:bg-rose-50'
                  }`}
                >
                  Again
                </button>
                <button
                  onClick={() => handleFsrsSimulate('hard')}
                  className={`text-[9px] font-bold py-1 px-0.5 rounded text-center border transition-all duration-150 cursor-pointer ${
                    lastFsrsAction === 'hard'
                      ? 'bg-amber-500 text-white border-amber-600 shadow-sm scale-95'
                      : 'bg-white text-amber-600 border-amber-200 hover:bg-amber-50'
                  }`}
                >
                  Hard
                </button>
                <button
                  onClick={() => handleFsrsSimulate('good')}
                  className={`text-[9px] font-bold py-1 px-0.5 rounded text-center border transition-all duration-150 cursor-pointer ${
                    lastFsrsAction === 'good'
                      ? 'bg-emerald-500 text-white border-emerald-600 shadow-sm scale-95'
                      : 'bg-white text-emerald-600 border-emerald-200 hover:bg-emerald-50'
                  }`}
                >
                  Good
                </button>
                <button
                  onClick={() => handleFsrsSimulate('easy')}
                  className={`text-[9px] font-bold py-1 px-0.5 rounded text-center border transition-all duration-150 cursor-pointer ${
                    lastFsrsAction === 'easy'
                      ? 'bg-sky-500 text-white border-sky-600 shadow-sm scale-95'
                      : 'bg-white text-sky-600 border-sky-200 hover:bg-sky-50'
                  }`}
                >
                  Easy
                </button>
              </div>
            </div>
          </div>

          {/* Card 4: Weak Spots & Memory Slips (Peach) */}
          <div className="bg-clay-peach rounded-clay-xl border border-clay-hairline p-6 sm:p-8 text-clay-ink flex flex-col justify-between hover-clay-card min-h-[360px]">
            <div className="text-left">
              <span className="px-2.5 py-1 rounded bg-clay-ink/10 text-clay-ink text-[10px] font-bold uppercase tracking-wider mb-4 inline-block">
                Intervention
              </span>
              <h3 className="font-rubik text-lg sm:text-xl font-medium tracking-tight mb-3 text-clay-ink">
                Weak Spots & Memory Slips
              </h3>
              <p className="text-clay-body text-xs sm:text-sm leading-relaxed mb-6">
                Failing a card repeatedly creates a Troublesome Concept. We automatically isolate concepts with multiple memory slips (failed 3+ times) and queue them in custom modules so you can fix them.
              </p>
            </div>
            {/* UI Fragment */}
            <div className="bg-clay-canvas border border-clay-hairline rounded-clay-lg p-3 text-left space-y-2">
              <div className="flex justify-between items-center text-[10px] text-red-600 font-bold">
                <span className="flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Troublesome Concept</span>
                <span>Memory Slips: 4x</span>
              </div>
              <p className="text-[10px] text-clay-body line-clamp-1 italic bg-clay-surface-soft p-1.5 rounded border border-clay-hairline">
                "Which morphological response is seen in pancreatic islets..."
              </p>
              <button
                onClick={onStartPractice}
                className="w-full bg-clay-pink text-white text-[10px] font-bold py-1.5 rounded-clay-md text-center shadow-sm cursor-pointer"
              >
                Target Weak Spots
              </button>
            </div>
          </div>

        </div>
      </section>

      {/* DEVELOPER STORY SECTION */}
      <section id="developer-story" className="py-16 md:py-24 px-6 md:px-12 max-w-7xl mx-auto w-full z-20 border-t border-clay-hairline">
        
        {/* Saturated feature-card-ochre */}
        <div className="bg-clay-ochre rounded-clay-xl border border-clay-hairline p-6 sm:p-10 md:p-12 text-clay-ink text-left relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-white/10 filter blur-3xl pointer-events-none" />

          <div className="max-w-3xl">
            <span className="px-3 py-1 rounded-full bg-clay-ink/10 text-clay-ink text-xs font-bold uppercase tracking-wider mb-6 inline-block">
              A Solo Project, A Shared Movement
            </span>
            
            <h2 className="font-rubik text-2xl sm:text-3xl md:text-4xl font-medium tracking-[-0.03em] mb-6 text-clay-ink">
              Built in a Hostel Room between Clinical Postings
            </h2>
            
            <div className="space-y-4 text-clay-body text-xs sm:text-sm md:text-base leading-relaxed">
              <p>
                I am <a href="https://www.linkedin.com/in/sainsiddiquee/" target="_blank" rel="noopener noreferrer" className="underline hover:text-clay-pink transition-colors font-medium">Sain Siddiquee</a>, a 3rd year medical student. I do not have a venture capital fund, a sales team, or commercial interests. I built OpenMedQ because I was tired of medical school being treated as a market to exploit.
              </p>
              <p>
                I designed the architecture to run completely client-side in your browser, utilizing local storage. This keeps my hosting cost at ₹0. Because there are no expensive servers, there is no need for paywalls, subscription bills, or advertising.
              </p>
              <p className="font-semibold text-clay-ink">
                If you find a typo, an outdated clinical detail, or a wrong reference explanation, you can correct it. You can check the codebase or submit edits directly on GitHub. Join the movement: let's build an open tool that we can pass down to our juniors.
              </p>
            </div>

            <div className="mt-8 flex flex-col sm:flex-row gap-4">
              <a
                href="https://github.com/Riso19/openmedq"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-clay-ink hover:bg-neutral-800 text-white font-bold px-6 py-3 rounded-clay-md text-xs transition-all duration-200 cursor-pointer text-center"
              >
                Join the Codebase on GitHub
              </a>
              <a
                href="https://www.linkedin.com/in/sainsiddiquee/"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-clay-canvas border border-clay-hairline hover:bg-clay-surface-soft text-clay-ink font-semibold px-6 py-3 rounded-clay-md text-xs transition-all duration-200 cursor-pointer text-center inline-flex items-center justify-center gap-2"
              >
                <svg className="w-3.5 h-3.5 fill-current shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.779-1.75-1.75s.784-1.75 1.75-1.75 1.75.779 1.75 1.75-.784 1.75-1.75 1.75zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                </svg>
                Connect on LinkedIn
              </a>
              <button
                onClick={onStartPractice}
                className="bg-clay-canvas border border-clay-hairline hover:bg-clay-surface-soft text-clay-ink font-semibold px-6 py-3 rounded-clay-md text-xs transition-all duration-200 cursor-pointer text-center"
              >
                Practice in Guest Mode
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* BENTO GRID ABOUT & DATA LIMITS */}
      <section className="py-16 md:py-24 px-6 md:px-12 max-w-7xl mx-auto w-full z-20 border-t border-clay-hairline">
        <div className="text-center mb-12">
          <span className="text-xs font-bold uppercase tracking-widest text-clay-pink mb-3 block">
            OpenMedQ by the Numbers
          </span>
          <h2 className="font-rubik text-2xl sm:text-3xl md:text-5xl font-medium tracking-[-0.03em] mb-4">
            Curated Database. Zero Friction.
          </h2>
          <p className="text-clay-body max-w-xl mx-auto text-xs sm:text-sm md:text-base">
            No filler questions. No paywalled explanations.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {/* Card 1: 190,645 Questions */}
          <div ref={counterRef} className="bg-clay-peach rounded-clay-xl border border-clay-hairline p-6 sm:p-8 flex flex-col justify-between md:col-span-2 min-h-[220px] md:min-h-[240px] text-left">
            <div className="flex justify-between items-start mb-4">
              <span className="text-xs uppercase font-bold tracking-wider text-clay-ink/70">Database Scale</span>
              <Database className="w-6 h-6 text-clay-ink/60" />
            </div>
            <div>
              <span className="font-rubik text-3xl sm:text-4xl md:text-5xl font-medium tracking-[-0.04em] text-clay-ink block mb-2">
                {questionCount.toLocaleString()} Questions
              </span>
              <p className="text-xs sm:text-sm text-clay-body leading-relaxed max-w-prose">
                Directly mapped to standard MBBS subjects and peer-reviewed by residency top-rankers. No duplicate stubs or low-quality AI placeholders.
              </p>
            </div>
          </div>

          {/* Card 2: 19/19 Subjects */}
          <div className="bg-clay-lavender rounded-clay-xl border border-clay-hairline p-6 sm:p-8 flex flex-col justify-between min-h-[220px] md:min-h-[240px] text-left">
            <div className="flex justify-between items-start mb-4">
              <span className="text-xs uppercase font-bold tracking-wider text-clay-ink/70">Syllabus Span</span>
              <Layers className="w-6 h-6 text-clay-ink/60" />
            </div>
            <div>
              <span className="font-rubik text-3xl sm:text-4xl md:text-5xl font-medium tracking-[-0.04em] text-clay-ink block mb-2">19 / 19</span>
              <p className="text-xs text-clay-body leading-relaxed">
                From Anatomy to specialized Surgery, covering the entire clinical scope required for INI-CET and NEET PG.
              </p>
            </div>
          </div>

          {/* Card 3: Offline-First */}
          <div className="bg-clay-mint rounded-clay-xl border border-clay-hairline p-6 sm:p-8 flex flex-col justify-between min-h-[220px] md:min-h-[240px] text-left">
            <div className="flex justify-between items-start mb-4">
              <span className="text-xs uppercase font-bold tracking-wider text-clay-ink/70">Network Resiliency</span>
              <WifiOff className="w-6 h-6 text-clay-ink/60" />
            </div>
            <div>
              <span className="font-rubik text-2xl sm:text-3xl font-medium tracking-[-0.04em] text-clay-ink block mb-2">Offline-First</span>
              <p className="text-xs text-clay-body leading-relaxed mt-2">
                Practice inside elevators, basements, or hospital wards where cellular network drops to zero. All questions store locally.
              </p>
            </div>
          </div>

          {/* Card 4: ₹0 Costs */}
          <div className="bg-clay-ochre rounded-clay-xl border border-clay-hairline p-6 sm:p-8 flex flex-col justify-between md:col-span-2 min-h-[220px] md:min-h-[240px] text-left">
            <div className="flex justify-between items-start mb-4">
              <span className="text-xs uppercase font-bold tracking-wider text-clay-ink/70">Economics</span>
              <Award className="w-6 h-6 text-clay-ink/60" />
            </div>
            <div>
              <span className="font-rubik text-3xl sm:text-4xl md:text-5xl font-medium tracking-[-0.04em] text-clay-ink block mb-2">₹0 Subscription Costs</span>
              <p className="text-xs sm:text-sm text-clay-body leading-relaxed max-w-prose">
                Built on client-side cache technologies. We keep operational hosting costs at zero to ensure this platform remains open and free forever.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* PAIN POINT COMPARISON */}
      <section id="comparison" className="py-16 md:py-24 px-6 md:px-12 max-w-7xl mx-auto w-full z-20 border-t border-clay-hairline">
        <div className="text-center mb-12">
          <span className="text-xs font-bold uppercase tracking-widest text-clay-pink mb-3 block">
            Pricing & Structural Reality
          </span>
          <h2 className="font-rubik text-2xl sm:text-3xl md:text-5xl font-medium tracking-[-0.03em] mb-4">
            A New Model for Indian Medical Prep
          </h2>
          <p className="text-clay-body max-w-xl mx-auto text-xs sm:text-sm md:text-base">
            No paywalled explanations or aggressive marketing pitches.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl mx-auto items-stretch">
          
          {/* Commercial Platform Card */}
          <div className="bg-clay-surface-card rounded-clay-xl border border-clay-hairline p-6 sm:p-8 flex flex-col justify-between text-left">
            <div>
              <div className="flex items-center justify-between mb-6">
                <span className="text-base font-bold text-clay-ink">Commercial PG Prep Apps</span>
                <Lock className="w-5 h-5 text-rose-500" />
              </div>

              <div className="text-2xl sm:text-3xl font-bold text-clay-ink mb-6 tracking-tight">
                ₹18,000 – ₹35,000<span className="text-xs sm:text-sm font-normal text-clay-muted">/year</span>
              </div>

              <ul className="space-y-4 text-xs sm:text-sm text-clay-body text-left">
                <li className="flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                  <span>Exorbitant plans funded by student debt or parents</span>
                </li>
                <li className="flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                  <span>Requires persistent internet connection (unusable inside wards)</span>
                </li>
                <li className="flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                  <span>Closed databases: mistakes cannot be peer-corrected or edited by users</span>
                </li>
              </ul>
            </div>
            
            <div className="mt-8 pt-6 border-t border-clay-hairline text-[10px] sm:text-xs text-clay-muted text-left">
              * Based on standard rates of typical corporate test prep modules.
            </div>
          </div>

          {/* OpenMedQ Card */}
          <div className="bg-clay-teal rounded-clay-xl border border-transparent p-6 sm:p-8 text-white flex flex-col justify-between shadow-xl shadow-clay-teal/10 hover:shadow-clay-teal/20 transition-all duration-300 text-left">
            <div>
              <div className="flex items-center justify-between mb-6">
                <span className="text-base font-bold text-clay-mint">OpenMedQ Platform</span>
                <Unlock className="w-5 h-5 text-clay-mint" />
              </div>

              <div className="text-2xl sm:text-3xl font-bold text-white mb-6 tracking-tight">
                ₹0 <span className="text-xs sm:text-sm font-normal text-clay-mint text-left block sm:inline">Free Forever (No paywalls)</span>
              </div>

              <ul className="space-y-4 text-xs sm:text-sm text-zinc-300">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-clay-mint shrink-0 mt-0.5" />
                  <span>100% unlocked access to all clinical questions, answers, and references</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-clay-mint shrink-0 mt-0.5" />
                  <span>Offline-First Local Storage: Practice without cellular signal inside clinical wards</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-clay-mint shrink-0 mt-0.5" />
                  <span>Fully open source: audit the codebase, request corrections directly on GitHub</span>
                </li>
              </ul>
            </div>

            <button
              onClick={onStartPractice}
              className="mt-8 w-full bg-clay-canvas text-clay-ink hover:bg-clay-surface-soft font-bold py-3.5 rounded-clay-md transition-all active:scale-98 cursor-pointer text-xs sm:text-sm"
            >
              Start Practice (Guest Mode)
            </button>
          </div>

        </div>
      </section>

      {/* PRACTICE CHECKLIST WIDGET */}
      <section id="active-recall" className="py-16 md:py-24 px-6 md:px-12 max-w-7xl mx-auto w-full z-20 border-t border-clay-hairline">
        
        {/* Saturated feature-card-pink */}
        <div className="bg-clay-pink rounded-clay-xl border border-transparent p-5 sm:p-8 md:p-12 text-white shadow-xl shadow-clay-pink/5 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-64 h-64 rounded-full bg-white/10 filter blur-2xl pointer-events-none" />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 md:gap-12 items-center">
            
            {/* Left side text */}
            <div className="lg:col-span-5 text-left w-full">
              <span className="px-3 py-1 rounded-full bg-white/20 text-white text-xs font-bold uppercase tracking-wider mb-4 inline-block">
                Daily Habit Loops
              </span>
              
              <h2 className="font-rubik text-2xl sm:text-3xl md:text-4xl font-medium tracking-[-0.03em] mb-4 text-white leading-tight">
                Defeat the forgetting curve daily.
              </h2>
              
              <p className="text-zinc-100 text-xs sm:text-sm md:text-base leading-relaxed mb-6 max-w-prose">
                The brain retains information best when triggered consistently. OpenMedQ tracks your daily practice loops, showing you remaining revision ready items and troublesome weak spots to lock in concepts.
              </p>

              <div className="flex gap-4">
                <button
                  onClick={onStartPractice}
                  className="bg-clay-canvas text-clay-ink hover:bg-clay-surface-soft font-bold px-6 py-3 rounded-clay-md transition-all active:scale-98 text-xs cursor-pointer"
                >
                  Try Practice Suite
                </button>
              </div>
            </div>

            {/* Right side Dashboard widget */}
            <div className="lg:col-span-7 w-full">
              <div className="bg-clay-canvas rounded-clay-lg border border-clay-hairline p-4 sm:p-6 text-clay-ink text-left shadow-sm">
                
                {/* Widget header */}
                <div className="flex justify-between items-center border-b border-clay-hairline pb-4 mb-4">
                  <span className="text-xs uppercase font-bold text-clay-muted tracking-wider">Practice Loop Dashboard</span>
                  
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-clay-peach/30 border border-clay-peach rounded-full text-clay-ink text-xs font-bold animate-pulse">
                    <span>🔥 {streakSimulated} Day Streak</span>
                  </div>
                </div>

                {/* Tabs inside widget */}
                <div className="flex border-b border-clay-hairline bg-clay-surface-soft rounded-clay-md p-1 mb-5">
                  <button
                    onClick={() => setActiveRecallTab('daily')}
                    className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider text-center rounded-clay-md transition-all cursor-pointer ${
                      activeRecallTab === 'daily'
                        ? 'bg-clay-canvas text-clay-ink shadow-sm'
                        : 'text-clay-muted hover:text-clay-ink'
                    }`}
                  >
                    Active Recall Loops
                  </button>
                  <button
                    onClick={() => setActiveRecallTab('mastery')}
                    className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider text-center rounded-clay-md transition-all cursor-pointer ${
                      activeRecallTab === 'mastery'
                        ? 'bg-clay-canvas text-clay-ink shadow-sm'
                        : 'text-clay-muted hover:text-clay-ink'
                    }`}
                  >
                    Subject Mastery
                  </button>
                </div>

                {/* Tab content */}
                {activeRecallTab === 'daily' ? (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold text-clay-muted">Completion Rate</span>
                      <span className="text-xs font-bold text-clay-pink">
                        {Math.round(
                          (simulatedTasks.filter(t => t.done).length / simulatedTasks.length) * 100
                        )}
                        % Done
                      </span>
                    </div>
                    {/* Progress Bar */}
                    <div className="w-full bg-clay-surface-strong h-2.5 rounded-full overflow-hidden">
                      <div
                        className="bg-clay-pink h-full transition-all duration-500"
                        style={{
                          width: `${
                            (simulatedTasks.filter(t => t.done).length / simulatedTasks.length) * 100
                          }%`,
                        }}
                      />
                    </div>

                    {/* Task checklist */}
                    <div className="space-y-2.5 mt-3">
                      {simulatedTasks.map(task => (
                        <div
                          key={task.id}
                          onClick={() => toggleTask(task.id)}
                          className={`flex items-center justify-between p-3 sm:p-3.5 rounded-clay-md border transition-all duration-200 cursor-pointer select-none ${
                            task.done
                              ? 'border-emerald-500/20 bg-emerald-50 text-clay-muted animate-fade-in'
                              : 'border-clay-hairline bg-clay-canvas text-clay-ink hover:bg-clay-surface-soft'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all duration-200 ${
                              task.done
                                ? 'bg-emerald-500 text-white border-emerald-500'
                                : 'border-clay-hairline text-transparent'
                            }`}>
                              <CheckCircle2 className="w-3.5 h-3.5 fill-current" />
                            </div>
                            <span className={`text-xs sm:text-sm ${task.done ? 'line-through text-clay-muted-soft' : ''}`}>
                              {task.text}
                            </span>
                          </div>
                          <span className={`text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${
                            task.done ? 'bg-emerald-100 text-emerald-900' : 'bg-clay-surface-soft text-clay-muted'
                          }`}>
                            {task.points}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-xs font-semibold mb-1">
                          <span className="text-clay-ink">Pathology</span>
                          <span className="text-clay-pink">80% Done</span>
                        </div>
                        <div className="w-full bg-clay-surface-strong h-2 rounded-full overflow-hidden">
                          <div className="bg-clay-pink h-full" style={{ width: '80%' }} />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-xs font-semibold mb-1">
                          <span className="text-clay-ink">Pharmacology</span>
                          <span className="text-clay-ochre">45% Done</span>
                        </div>
                        <div className="w-full bg-clay-surface-strong h-2 rounded-full overflow-hidden">
                          <div className="bg-clay-ochre h-full" style={{ width: '45%' }} />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-xs font-semibold mb-1">
                          <span className="text-clay-ink">Physiology</span>
                          <span className="text-clay-teal">65% Done</span>
                        </div>
                        <div className="w-full bg-clay-surface-strong h-2 rounded-full overflow-hidden">
                          <div className="bg-clay-teal h-full" style={{ width: '65%' }} />
                        </div>
                      </div>
                    </div>

                    <div className="bg-clay-surface-soft rounded-clay-md p-4 border border-clay-hairline flex gap-3 items-start mt-4">
                      <Database className="w-5 h-5 text-clay-pink shrink-0 mt-0.5" />
                      <div className="text-left">
                        <span className="text-xs font-bold text-clay-ink block mb-1">Local-First Storage</span>
                        <p className="text-[11px] text-clay-muted leading-normal">
                          All subject mastery levels and practice logs are stored securely on your local device. Syncing your data with our secure backup servers is highly efficient, keeping the platform entirely free and responsive.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            </div>

          </div>
        </div>
      </section>

      {/* FAQ SECTION */}
      <section id="faq" className="py-16 md:py-24 px-6 md:px-12 max-w-4xl mx-auto w-full z-20 border-t border-clay-hairline">
        <div className="text-center mb-12">
          <span className="text-xs font-bold uppercase tracking-widest text-clay-pink mb-3 block">
            Direct & Transparent Answers
          </span>
          <h2 className="font-rubik text-2xl sm:text-3xl md:text-4xl font-medium tracking-[-0.03em] mb-4">Frequently Asked Questions</h2>
          <p className="text-clay-body text-xs sm:text-sm md:text-base">
            Everything you need to know about the platform.
          </p>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, index) => {
            const isOpen = openFaq === index;
            return (
              <div
                key={index}
                className="bg-clay-canvas border border-clay-hairline rounded-clay-lg hover:border-clay-ink/20 transition-all duration-200 overflow-hidden shadow-sm"
              >
                <button
                  onClick={() => toggleFaq(index)}
                  className="w-full px-4 py-4 sm:px-6 sm:py-5 flex items-center justify-between text-left cursor-pointer focus:outline-none select-none group"
                >
                  <span className="font-semibold text-xs sm:text-sm md:text-base text-clay-ink group-hover:text-clay-pink transition-colors duration-200">
                    {faq.q}
                  </span>
                  {isOpen ? (
                    <ChevronUp className="w-4 h-4 text-clay-muted group-hover:text-clay-pink transition-colors shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-clay-muted group-hover:text-clay-pink transition-colors shrink-0" />
                  )}
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 sm:px-6 sm:pb-6 text-clay-body text-xs sm:text-sm leading-relaxed border-t border-clay-hairline pt-4 animate-[fadeIn_0.2s_ease-out]">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* FINAL CALL TO ACTION */}
      <section className="py-16 md:py-24 px-6 md:px-12 text-center max-w-5xl mx-auto relative z-20 border-t border-clay-hairline">
        
        <div className="bg-clay-surface-soft rounded-clay-xl border border-clay-hairline p-6 sm:p-10 md:p-16 flex flex-col items-center shadow-sm relative">
          
          <img src={logoSrc} width="48" height="48" className="w-12 h-12 rounded-clay-md shadow-sm mb-6 object-contain" alt="OpenMedQ Logo" />

          <h2 className="font-rubik text-2xl sm:text-3xl md:text-5xl font-medium tracking-[-0.04em] mb-6 text-clay-ink">
            Stop Paying. Start Mastering.
          </h2>
          <p className="text-clay-body text-xs sm:text-sm md:text-lg mb-10 leading-relaxed max-w-prose">
            Gain immediate access to {totalDBQuestionCount.toLocaleString()}+ clinical questions. Track your active recall, sync your study streaks, and prepare for NEET PG / FMGE / INI-CET on your own terms.
          </p>

          <div className="w-full max-w-xs">
            <button
              onClick={onStartPractice}
              className="w-full bg-clay-ink hover:bg-neutral-800 text-white font-bold h-12 rounded-clay-md shadow-sm active:scale-98 transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer text-xs sm:text-sm"
            >
              <SignedIn>
                <span>Enter Practice Suite</span>
              </SignedIn>
              <SignedOut>
                <span>Practice Free in Guest Mode</span>
              </SignedOut>
              <ArrowRight className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>
      </section>

      </main>

      {/* FOOTER */}
      <footer className="mt-auto bg-clay-surface-soft border-t border-clay-hairline pt-16 pb-10 px-6 md:px-12 text-clay-body relative z-20">
        
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start justify-between gap-12 border-b border-clay-hairline pb-12 mb-12">
          
          <div className="flex flex-col gap-4 max-w-xs text-left">
            <div className="flex items-center gap-3">
              <img src={logoSrc} width="32" height="32" className="w-8 h-8 rounded-clay-md shadow-sm object-contain" alt="OpenMedQ Logo" />
              <span className="font-bold text-lg text-clay-ink">OpenMedQ</span>
            </div>
            <p className="text-xs text-clay-muted leading-relaxed">
              A 100% free, open-source medical education portal built solo by <a href="https://www.linkedin.com/in/sainsiddiquee/" target="_blank" rel="noopener noreferrer" className="underline hover:text-clay-pink transition-colors">Sain Siddiquee</a>, a 3rd year medical student, for NEET PG, FMGE, and INI-CET preparation.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-8 md:gap-16 text-left">
            <div className="flex flex-col gap-3">
              <span className="text-xs font-bold uppercase tracking-wider text-clay-ink">App</span>
              <a href="/download" onClick={(e) => { e.preventDefault(); onViewDownload(); }} className="text-xs text-clay-muted hover:text-clay-ink transition-colors cursor-pointer">Download Mobile App</a>
              <a href="#sandbox" className="text-xs text-clay-muted hover:text-clay-ink transition-colors">Sandbox MCQ</a>
              <a href="#manifesto" className="text-xs text-clay-muted hover:text-clay-ink transition-colors">Manifesto</a>
              <a href="#features" className="text-xs text-clay-muted hover:text-clay-ink transition-colors">Features</a>
              <a href="#developer-story" className="text-xs text-clay-muted hover:text-clay-ink transition-colors">Developer Story</a>
              <a href="#active-recall" className="text-xs text-clay-muted hover:text-clay-ink transition-colors">Practice Widget</a>
            </div>

            <div className="flex flex-col gap-3">
              <span className="text-xs font-bold uppercase tracking-wider text-clay-ink">Community & Roadmap</span>
              <a href="/blog" onClick={(e) => { e.preventDefault(); onViewBlog(); }} className="text-xs text-clay-muted hover:text-clay-ink transition-colors cursor-pointer">Blog</a>
              <a href="/roadmap" onClick={(e) => { e.preventDefault(); onViewRoadmap(); }} className="text-xs text-clay-muted hover:text-clay-ink transition-colors cursor-pointer">Product Roadmap</a>
              <a href="/contribute" onClick={(e) => { e.preventDefault(); onViewContribute(); }} className="text-xs text-clay-muted hover:text-clay-ink transition-colors cursor-pointer">Submit Corrections & Contribute</a>
              <a href="https://github.com/Riso19/openmedq" target="_blank" rel="noopener noreferrer" className="text-xs text-clay-muted hover:text-clay-ink transition-colors">GitHub Repository</a>
            </div>

            <div className="flex flex-col gap-3">
               <span className="text-xs font-bold uppercase tracking-wider text-clay-ink">Legal</span>
               <a href="/terms" onClick={(e) => { e.preventDefault(); onViewTerms(); }} className="text-xs text-clay-muted hover:text-clay-ink transition-colors cursor-pointer">Terms & Conditions</a>
               <a href="/privacy" onClick={(e) => { e.preventDefault(); onViewPrivacy(); }} className="text-xs text-clay-muted hover:text-clay-ink transition-colors cursor-pointer">Privacy Policy</a>
               <a href="/disclaimer" onClick={(e) => { e.preventDefault(); onViewDisclaimer(); }} className="text-xs text-clay-muted hover:text-clay-ink transition-colors cursor-pointer">Legal Disclaimer</a>
               <a href="/dmca" onClick={(e) => { e.preventDefault(); onViewDMCA(); }} className="text-xs text-clay-muted hover:text-clay-ink transition-colors cursor-pointer">DMCA & Copyright</a>
             </div>
          </div>

        </div>

        {/* Closing Horizon Illustration & Licenses */}
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-[11px] text-clay-muted">
          
          <div className="text-left">
            <span>© {new Date().getFullYear()} OpenMedQ. Code licensed under </span>
            <a href="https://github.com/Riso19/openmedq" target="_blank" rel="noopener noreferrer" className="hover:text-clay-pink underline">MIT</a>
            <span>. Content under </span>
            <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer" className="hover:text-clay-pink underline">CC-BY-SA 4.0</a>
            <span>.</span>
          </div>

          <div className="flex gap-4">
            <a href="https://github.com/Riso19/openmedq" target="_blank" rel="noopener noreferrer" className="hover:text-clay-pink transition-colors">GitHub</a>
            <span>•</span>
            <a href="https://www.linkedin.com/in/sainsiddiquee/" target="_blank" rel="noopener noreferrer" className="hover:text-clay-pink transition-colors">LinkedIn</a>
            <span>•</span>
            <a href="#" className="hover:text-clay-pink transition-colors">Status</a>
          </div>

        </div>

        {/* Clay signature horizontal mountain ridge SVG decoration */}
        <div className="w-full max-w-7xl mx-auto mt-8 opacity-25 pointer-events-none select-none">
          <svg className="w-full h-12" viewBox="0 0 1000 50" preserveAspectRatio="none" fill="none">
            <path d="M 0 50 Q 50 35, 100 42 T 200 48 T 300 38 T 400 45 T 500 32 T 600 40 T 700 48 T 800 38 T 900 44 T 1000 50 Z" fill="#ebe6d6" />
            <path d="M 0 50 Q 75 42, 150 46 T 300 40 T 450 48 T 600 38 T 750 45 T 900 42 T 1000 50 Z" fill="#ebe6d6" opacity="0.5" />
          </svg>
        </div>

      </footer>

    </div>
  );
}
