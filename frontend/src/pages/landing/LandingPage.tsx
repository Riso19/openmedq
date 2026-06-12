import { useState } from 'react';
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
} from 'lucide-react';
import { SignedIn, SignedOut, UserButton } from '@clerk/clerk-react';
import { ContributorMarquee } from '../../components/ui/contributor-marquee';
import { ThemeToggle } from '../../components/ThemeToggle';

interface MCQOption {
  key: 'A' | 'B' | 'C' | 'D';
  text: string;
  isCorrect: boolean;
}

const mcqOptions: MCQOption[] = [
  { key: 'A', text: 'Atrophy', isCorrect: false },
  { key: 'B', text: 'Dysplasia', isCorrect: false },
  { key: 'C', text: 'Hyperplasia', isCorrect: true },
  { key: 'D', text: 'Metaplasia', isCorrect: false },
];

export function LandingPage({ onStartPractice, onSignIn }: { onStartPractice: () => void; onSignIn: () => void }) {
  // MCQ Preview State
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [streakSimulated, setStreakSimulated] = useState(12);

  // Active Recall Dashboard State
  const [activeRecallTab, setActiveRecallTab] = useState<'daily' | 'mastery'>('daily');
  const [simulatedTasks, setSimulatedTasks] = useState([
    { id: 1, text: 'Complete 5 Daily Pathology Questions', done: true, points: '+50 XP' },
    { id: 2, text: 'Review 3 Pharmacology errors', done: false, points: '+30 XP' },
    { id: 3, text: 'Solve 1 Physiology bookmarked question', done: false, points: '+15 XP' },
  ]);

  // FAQ Accordion State
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Mobile Menu State
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const handleOptionClick = (key: string) => {
    if (selectedOption) return; // Allow answering only once in the sandbox
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
      a: 'There is zero catch. OpenMedQ is built using highly optimized serverless web infrastructure. By storing question packs on public servers and storing your progress securely on your device, we keep operational costs at literally ₹0. It is run as an open-source project by volunteer doctors and developers who believe medical education should not be locked behind a paywall.',
    },
    {
      q: 'Are the questions reliable and high-yield for NEET PG / FMGE / INI-CET?',
      a: 'Yes. All questions are crowdsourced from standard public medical repositories, peer-reviewed by top-ranking residents, and formatted strictly according to the recent clinical exam patterns. We do not use low-yield filler questions.',
    },
    {
      q: 'Can I practice offline inside hospital wards?',
      a: 'Absolutely. OpenMedQ is built as a Local-First application. When you load a question pack, it stores all questions in your browser\'s local device storage. You can practice in the clinical wards, elevators, or hostel basements with zero internet connection. Your progress automatically syncs when you go back online.',
    },
    {
      q: 'Why should I sign up if guest mode is available?',
      a: 'Guest Mode allows you to start practicing instantly with zero setup. Signing up with Clerk is completely free and allows us to back up your progress, sync your active recall schedule across multiple devices (e.g., phone and laptop), and maintain your daily practice streak.',
    },
    {
      q: 'How can I contribute to the questions or codebase?',
      a: 'We are fully open-source! You can submit question corrections, add explanation links, or write code by visiting our GitHub repository. We welcome doctors, medical students, and developers alike.',
    },
  ];

  return (
    <div className="min-h-screen bg-clay-canvas text-clay-ink flex flex-col font-sans selection:bg-clay-pink/20 selection:text-clay-pink relative overflow-x-hidden">
      
      {/* HEADER */}
      <header className="sticky top-0 z-50 w-full bg-clay-canvas border-b border-clay-hairline py-4 px-6 md:px-12 flex items-center justify-between">
        <div className="flex items-center gap-3 group cursor-pointer" onClick={() => { setIsMobileMenuOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
          <img src="/logo.png" className="w-10 h-10 rounded-clay-md shadow-sm group-hover:scale-105 transition-transform duration-300 object-cover" alt="OpenMedQ Logo" />
          <span className="text-xl font-bold tracking-tight text-clay-ink group-hover:text-clay-pink transition-colors duration-300">
            OpenMedQ
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-clay-muted">
          <a href="#sandbox" className="hover:text-clay-ink transition-colors duration-200">Interactive MCQ</a>
          <a href="#bento-stats" className="hover:text-clay-ink transition-colors duration-200">Database Bento</a>
          <a href="#comparison" className="hover:text-clay-ink transition-colors duration-200">Pain Points</a>
          <a href="#active-recall" className="hover:text-clay-ink transition-colors duration-200">Habit Loops</a>
          <a href="#faq" className="hover:text-clay-ink transition-colors duration-200">FAQ</a>
        </nav>

        {/* Desktop actions */}
        <div className="hidden md:flex items-center gap-4">
          <ThemeToggle />
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs font-semibold text-clay-muted hover:text-clay-ink bg-clay-surface-soft border border-clay-hairline px-3 py-1.5 rounded-full transition-all duration-300"
          >
            <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.577.688.479C19.138 20.164 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
            </svg>
            <span>Star on GitHub</span>
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
            <a href="#sandbox" onClick={() => setIsMobileMenuOpen(false)} className="py-2 border-b border-clay-hairline hover:text-clay-pink">Interactive MCQ</a>
            <a href="#bento-stats" onClick={() => setIsMobileMenuOpen(false)} className="py-2 border-b border-clay-hairline hover:text-clay-pink">Database Bento</a>
            <a href="#comparison" onClick={() => setIsMobileMenuOpen(false)} className="py-2 border-b border-clay-hairline hover:text-clay-pink">Pain Points</a>
            <a href="#active-recall" onClick={() => setIsMobileMenuOpen(false)} className="py-2 border-b border-clay-hairline hover:text-clay-pink">Habit Loops</a>
            <a href="#faq" onClick={() => setIsMobileMenuOpen(false)} className="py-2 border-b border-clay-hairline hover:text-clay-pink">FAQ</a>
          </nav>
 
          <div className="flex flex-col gap-4 mb-8">
            <div className="flex items-center justify-between py-2 px-1 border-b border-clay-hairline">
              <span className="text-xs font-bold text-clay-muted">Theme</span>
              <ThemeToggle />
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
                className="w-full bg-clay-surface-soft border border-clay-hairline hover:bg-clay-surface-strong text-clay-ink font-semibold h-12 rounded-clay-md transition-all flex items-center justify-center gap-2 text-sm cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-clay-pink fill-current" />
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
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full bg-clay-canvas border border-clay-hairline text-clay-muted hover:text-clay-ink font-semibold h-12 rounded-clay-md transition-all flex items-center justify-center gap-2 text-sm"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.577.688.479C19.138 20.164 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
              </svg>
              <span>Star on GitHub</span>
            </a>
          </div>
        </div>
      )}

      {/* HERO SECTION */}
      <section className="relative py-12 md:py-24 px-6 md:px-12 max-w-7xl mx-auto w-full z-20 flex flex-col lg:flex-row items-center gap-10 md:gap-16">
        
        {/* Left Side: Copywriting & Actions */}
        <div className="flex-1 text-left flex flex-col items-start w-full">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-clay-surface-strong border border-clay-hairline text-clay-ink text-xs font-semibold tracking-wide uppercase mb-6">
            <Sparkles className="w-3.5 h-3.5 text-clay-pink" />
            <span>100% Free and Open-Source PG Prep</span>
          </div>

          {/* Headline */}
          <h1 className="font-rubik text-3xl sm:text-5xl md:text-[56px] leading-[1.1] md:leading-[1.05] font-medium text-clay-ink tracking-[-0.04em] mb-6 w-full">
            Stop Paying <span className="text-clay-pink font-medium border-b-2 border-clay-pink/20">₹25,000/year</span> for Prep. OpenMedQ is Free.
          </h1>

          <p className="text-clay-body text-sm sm:text-base md:text-lg leading-relaxed mb-10 max-w-prose">
            Master NEET PG, FMGE, and INI-CET with high-yield clinical MCQs and active recall. Genuinely free (no trials, no locked-out explanations). Built by doctors, hosted on the edge.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md">
            <button
              onClick={onStartPractice}
              className="flex-1 bg-clay-ink hover:bg-neutral-800 text-white font-bold h-12 rounded-clay-md shadow-sm active:scale-98 transition-all duration-300 flex items-center justify-center gap-2 text-sm cursor-pointer"
            >
              <SignedIn>
                <span>Enter Practice Suite</span>
              </SignedIn>
              <SignedOut>
                <span>Practice in Guest Mode</span>
              </SignedOut>
              <ArrowRight className="w-4.5 h-4.5" />
            </button>
            
            <SignedOut>
              <button
                onClick={onSignIn}
                className="flex-1 bg-clay-canvas border border-clay-hairline hover:bg-clay-surface-soft text-clay-ink font-semibold h-12 rounded-clay-md active:scale-98 transition-all duration-300 flex items-center justify-center gap-2 text-sm cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-clay-pink fill-current" />
                <span>Sign Up to Sync Streaks</span>
              </button>
            </SignedOut>
          </div>
        </div>

        {/* Right Side: Hero Illustration Card */}
        <div className="flex-1 w-full max-w-lg">
          <div className="bg-clay-surface-soft border border-clay-hairline rounded-clay-xl p-6 md:p-8 flex flex-col items-center justify-center min-h-[300px] md:min-h-[350px] shadow-sm relative overflow-hidden group">
            {/* Ambient clay shape decoration */}
            <div className="absolute -top-10 -left-10 w-28 h-28 rounded-full bg-clay-lavender/30 filter blur-xl" />
            <div className="absolute -bottom-10 -right-10 w-32 h-32 rounded-full bg-clay-peach/30 filter blur-xl" />

            {/* Custom SVG Clay Brain Mascot */}
            <svg className="w-44 h-44 md:w-56 md:h-56 drop-shadow-lg group-hover:scale-105 transition-transform duration-500" viewBox="0 0 200 200" fill="none">
              <defs>
                <radialGradient id="clay-brain-grad" cx="50%" cy="40%" r="50%" fx="30%" fy="30%">
                  <stop offset="0%" stopColor="#ffb8d1" />
                  <stop offset="60%" stopColor="#ff4d8b" />
                  <stop offset="100%" stopColor="#c2255c" />
                </radialGradient>
                <filter id="clay-shadow" x="-10%" y="-10%" width="120%" height="120%">
                  <feDropShadow dx="2" dy="8" stdDeviation="5" floodColor="#0a0a0a" floodOpacity="0.12" />
                </filter>
              </defs>

              <ellipse cx="100" cy="170" rx="60" ry="12" fill="#ebe6d6" />
              <path d="M 100 60 C 70 60, 50 75, 50 100 C 50 120, 65 135, 80 135 C 80 145, 95 145, 100 135 Z" fill="url(#clay-brain-grad)" filter="url(#clay-shadow)" />
              <path d="M 100 60 C 130 60, 150 75, 150 100 C 150 120, 135 135, 120 135 C 120 145, 105 145, 100 135 Z" fill="url(#clay-brain-grad)" filter="url(#clay-shadow)" />

              <path d="M 68 85 C 75 80, 85 90, 80 98" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" opacity="0.6" />
              <path d="M 132 85 C 125 80, 115 90, 120 98" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" opacity="0.6" />
              <path d="M 62 108 C 72 108, 80 115, 76 122" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" opacity="0.6" />
              <path d="M 138 108 C 128 108, 120 115, 124 122" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" opacity="0.6" />
              <path d="M 90 75 C 95 85, 95 95, 90 105" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" opacity="0.6" />
              <path d="M 110 75 C 105 85, 105 95, 110 105" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" opacity="0.6" />

              <rect x="65" y="92" width="30" height="20" rx="8" fill="none" stroke="#0a0a0a" strokeWidth="6" />
              <rect x="105" y="92" width="30" height="20" rx="8" fill="none" stroke="#0a0a0a" strokeWidth="6" />
              <line x1="95" y1="102" x2="105" y2="102" stroke="#0a0a0a" strokeWidth="6" />
              <path d="M 50 102 C 55 98, 65 98, 65 98" stroke="#0a0a0a" strokeWidth="4" />
              <path d="M 150 102 C 145 98, 135 98, 135 98" stroke="#0a0a0a" strokeWidth="4" />

              <circle cx="80" cy="102" r="3.5" fill="#0a0a0a" />
              <circle cx="120" cy="102" r="3.5" fill="#0a0a0a" />

              <path d="M 94 120 Q 100 126 106 120" stroke="#0a0a0a" strokeWidth="3" strokeLinecap="round" fill="none" />

              <path d="M 60 135 C 60 155, 140 155, 140 135" stroke="#ff6b5a" strokeWidth="5" strokeLinecap="round" fill="none" />
              <path d="M 100 152 L 100 162" stroke="#ff6b5a" strokeWidth="5" strokeLinecap="round" />
              <circle cx="100" cy="165" r="8" fill="#ebe6d6" stroke="#ff6b5a" strokeWidth="3" />
            </svg>

            {/* Mascot description text */}
            <span className="text-xs font-bold uppercase tracking-wider text-clay-muted mt-4">
              "Dr. Sulcus" (OpenMedQ Mascot Figurine)
            </span>
          </div>
        </div>
      </section>

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
                Try a NEET PG high-yield card.
              </h2>
              <p className="text-clay-ink/80 text-xs sm:text-sm md:text-base leading-relaxed mb-6 max-w-prose">
                Active recall is standard for elite clinical scores. Try this pathology card without setting up any credentials. See instantaneous feedback and unlock explanations.
              </p>
              <div className="flex items-center flex-wrap gap-4 text-[10px] sm:text-xs font-bold">
                <span className="flex items-center gap-1">
                  <Award className="w-4 h-4 text-clay-ochre fill-current" />
                  NEET PG High-Yield
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
                <p className="text-clay-ink font-semibold text-sm sm:text-base md:text-lg leading-relaxed mb-6">
                  A 38-week pregnant woman with poorly controlled gestational diabetes delivers a healthy neonate. Which of the following morphological responses would most likely be observed in the pancreatic islets of the neonate due to maternal hyperglycemia?
                </p>

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
                          <span className="text-xs sm:text-sm md:text-base leading-snug">{option.text}</span>
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
                    <p className="text-clay-body text-xs sm:text-sm leading-relaxed max-w-prose">
                      Maternal hyperglycemia transfers excess glucose to the fetus. The fetal pancreas responds by producing insulin, causing **physiologic hyperplasia** of the islets (beta-cells). Post-delivery, the hyperinsulinemia persists briefly, causing potential neonatal hypoglycemia.
                    </p>

                    {/* Zeigarnik nudge inside the card */}
                    <div className="bg-clay-surface-soft border border-clay-hairline rounded-clay-md p-3 sm:p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div className="text-left">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-clay-pink uppercase tracking-wider mb-1">
                          <Zap className="w-3.5 h-3.5 fill-current" />
                          <span>5 high-yield loops open today</span>
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

      {/* BENTO GRID OF STATS */}
      <section id="bento-stats" className="py-16 md:py-24 px-6 md:px-12 max-w-7xl mx-auto w-full z-20 border-t border-clay-hairline">
        <div className="text-center mb-12 md:text-center">
          <span className="text-xs font-bold uppercase tracking-widest text-clay-pink mb-3 block">
            OpenMedQ by the Numbers
          </span>
          <h2 className="font-rubik text-2xl sm:text-3xl md:text-5xl font-medium tracking-[-0.03em] mb-4">
            Curated Database. Zero Friction.
          </h2>
          <p className="text-clay-body max-w-xl mx-auto text-xs sm:text-sm md:text-base">
            Engineered to run locally in your browser to maintain high reliability and eliminate licensing overheads.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {/* Card 1: 15,000+ Questions */}
          <div className="bg-clay-peach rounded-clay-xl border border-clay-hairline p-6 sm:p-8 flex flex-col justify-between md:col-span-2 min-h-[220px] md:min-h-[240px] text-left">
            <div className="flex justify-between items-start mb-4">
              <span className="text-xs uppercase font-bold tracking-wider text-clay-ink/70">Database Scale</span>
              <Database className="w-6 h-6 text-clay-ink/60" />
            </div>
            <div>
              <span className="font-rubik text-3xl sm:text-4xl md:text-5xl font-medium tracking-[-0.04em] text-clay-ink block mb-2">15,000+ Questions</span>
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
                Built on optimized edge architecture using fast content delivery and secure local caching. We keep operational costs at zero to ensure this platform remains open and free forever.
              </p>
            </div>
          </div>
        </div>

        {/* CONTRIBUTOR MARQUEE */}
        <div className="text-center mt-16 md:mt-20">
          <span className="text-xs uppercase font-bold tracking-widest text-clay-pink mb-6 block px-4">
            Open-Source Peer Reviewed & Built By Indian Medical Graduates
          </span>
          <ContributorMarquee />
        </div>
      </section>

      {/* PAIN POINT COMPARISON */}
      <section id="comparison" className="py-16 md:py-24 px-6 md:px-12 max-w-7xl mx-auto w-full z-20 border-t border-clay-hairline">
        <div className="text-center mb-12 md:text-center">
          <span className="text-xs font-bold uppercase tracking-widest text-clay-pink mb-3 block">
            Pricing & Structural Reality
          </span>
          <h2 className="font-rubik text-2xl sm:text-3xl md:text-5xl font-medium tracking-[-0.03em] mb-4">
            A New Model for Indian Medical Prep
          </h2>
          <p className="text-clay-body max-w-xl mx-auto text-xs sm:text-sm md:text-base">
            No massive bills, no aggressive upselling calls, no paywalled bookmarks.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl mx-auto items-stretch">
          
          {/* Commercial Platform Card */}
          <div className="bg-clay-surface-card rounded-clay-xl border border-clay-hairline p-6 sm:p-8 flex flex-col justify-between">
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
                  <span>Aggressive paywalls blocking explanation text and bookmarked questions</span>
                </li>
                <li className="flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                  <span>Requires persistent internet (almost impossible in clinical ward basements)</span>
                </li>
                <li className="flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                  <span>Closed ecosystem: database errors or content lapses cannot be peer-corrected</span>
                </li>
              </ul>
            </div>
            
            <div className="mt-8 pt-6 border-t border-clay-hairline text-[10px] sm:text-xs text-clay-muted text-left">
              * Based on standard rates of Marrow Plan C and PrepLadder Elite subscriptions.
            </div>
          </div>

          {/* OpenMedQ Card */}
          <div className="bg-clay-teal rounded-clay-xl border border-transparent p-6 sm:p-8 text-white flex flex-col justify-between shadow-xl shadow-clay-teal/10 hover:shadow-clay-teal/20 transition-all duration-300">
            <div className="text-left">
              <div className="flex items-center justify-between mb-6">
                <span className="text-base font-bold text-clay-mint">OpenMedQ Platform</span>
                <Unlock className="w-5 h-5 text-clay-mint" />
              </div>

              <div className="text-2xl sm:text-3xl font-bold text-white mb-6 tracking-tight">
                ₹0 <span className="text-xs sm:text-sm font-normal text-clay-mint text-left block sm:inline">Free Forever (No Trial traps)</span>
              </div>

              <ul className="space-y-4 text-xs sm:text-sm text-zinc-300">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-clay-mint shrink-0 mt-0.5" />
                  <span>100% unlocked access to all clinical questions, answers, and references</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-clay-mint shrink-0 mt-0.5" />
                  <span>Offline-First Local Storage: Practice without cellular signal inside hospital basements</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-clay-mint shrink-0 mt-0.5" />
                  <span>Fully open source: check the codebase, report correction issues on GitHub</span>
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

      {/* GAMIFICATION & HABIT LOOP */}
      <section id="active-recall" className="py-16 md:py-24 px-6 md:px-12 max-w-7xl mx-auto w-full z-20 border-t border-clay-hairline">
        
        {/* Saturated feature-card-pink */}
        <div className="bg-clay-pink rounded-clay-xl border border-transparent p-5 sm:p-8 md:p-12 text-white shadow-xl shadow-clay-pink/5 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-64 h-64 rounded-full bg-white/10 filter blur-2xl pointer-events-none" />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 md:gap-12 items-center">
            
            {/* Left side text */}
            <div className="lg:col-span-5 text-left w-full">
              <span className="px-3 py-1 rounded-full bg-white/20 text-white text-xs font-bold uppercase tracking-wider mb-4 inline-block">
                Zeigarnik Loop Mechanic
              </span>
              
              <h2 className="font-rubik text-2xl sm:text-3xl md:text-4xl font-medium tracking-[-0.03em] mb-4 text-white leading-tight">
                Defeat the forgetting curve daily.
              </h2>
              
              <p className="text-zinc-100 text-xs sm:text-sm md:text-base leading-relaxed mb-6 max-w-prose">
                Your brain hates leaving loops open. We use this behavioral mechanism to gently trigger daily practice, showing you incomplete pathology reviews or unreviewed bookmarks.
              </p>

              <div className="flex gap-4">
                <button
                  onClick={onStartPractice}
                  className="bg-clay-canvas text-clay-ink hover:bg-clay-surface-soft font-bold px-6 py-3 rounded-clay-md transition-all active:scale-98 text-xs cursor-pointer"
                >
                  Try Active Recall
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
                      <span className="text-xs font-bold text-clay-muted">Completion Quotient</span>
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
                              ? 'border-emerald-500/20 bg-emerald-50 text-clay-muted'
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
                          <span className="text-clay-pink">80% Mastered</span>
                        </div>
                        <div className="w-full bg-clay-surface-strong h-2 rounded-full overflow-hidden">
                          <div className="bg-clay-pink h-full" style={{ width: '80%' }} />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-xs font-semibold mb-1">
                          <span className="text-clay-ink">Pharmacology</span>
                          <span className="text-clay-ochre">45% Mastered</span>
                        </div>
                        <div className="w-full bg-clay-surface-strong h-2 rounded-full overflow-hidden">
                          <div className="bg-clay-ochre h-full" style={{ width: '45%' }} />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-xs font-semibold mb-1">
                          <span className="text-clay-ink">Physiology</span>
                          <span className="text-clay-teal">65% Mastered</span>
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
        <div className="text-center mb-12 md:text-center">
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
          
          <img src="/logo.png" className="w-12 h-12 rounded-clay-md shadow-sm mb-6 object-cover" alt="OpenMedQ Logo" />

          <h2 className="font-rubik text-2xl sm:text-3xl md:text-5xl font-medium tracking-[-0.04em] mb-6 text-clay-ink">
            Stop Paying. Start Mastering.
          </h2>
          <p className="text-clay-body text-xs sm:text-sm md:text-lg mb-10 leading-relaxed max-w-prose">
            Gain immediate access to 15,000+ high-yield medical MCQs. Track your active recall, sync your study streaks, and prepare for NEET PG / FMGE / INI-CET on your own terms.
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

      {/* FOOTER */}
      <footer className="mt-auto bg-clay-surface-soft border-t border-clay-hairline pt-16 pb-10 px-6 md:px-12 text-clay-body relative z-20">
        
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start justify-between gap-12 border-b border-clay-hairline pb-12 mb-12">
          
          <div className="flex flex-col gap-4 max-w-xs text-left">
            <div className="flex items-center gap-3">
              <img src="/logo.png" className="w-8 h-8 rounded-clay-md shadow-sm object-cover" alt="OpenMedQ Logo" />
              <span className="font-bold text-lg text-clay-ink">OpenMedQ</span>
            </div>
            <p className="text-xs text-clay-muted leading-relaxed">
              A 100% free, open-source medical education portal built by and for Indian medical students and graduates.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-8 md:gap-16">
            <div className="text-left flex flex-col gap-3">
              <span className="text-xs font-bold uppercase tracking-wider text-clay-ink">App</span>
              <a href="#sandbox" className="text-xs text-clay-muted hover:text-clay-ink transition-colors">Sandbox MCQ</a>
              <a href="#bento-stats" className="text-xs text-clay-muted hover:text-clay-ink transition-colors">Bento Stats</a>
              <a href="#comparison" className="text-xs text-clay-muted hover:text-clay-ink transition-colors">Comparison</a>
              <a href="#active-recall" className="text-xs text-clay-muted hover:text-clay-ink transition-colors">Active Recall</a>
            </div>

            <div className="text-left flex flex-col gap-3">
              <span className="text-xs font-bold uppercase tracking-wider text-clay-ink">Community</span>
              <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="text-xs text-clay-muted hover:text-clay-ink transition-colors">GitHub Repository</a>
              <a href="#" className="text-xs text-clay-muted hover:text-clay-ink transition-colors">Discord Server</a>
              <a href="#" className="text-xs text-clay-muted hover:text-clay-ink transition-colors">Submit Questions</a>
            </div>

            <div className="text-left flex flex-col gap-3">
              <span className="text-xs font-bold uppercase tracking-wider text-clay-ink">Legal</span>
              <a href="#" className="text-xs text-clay-muted hover:text-clay-ink transition-colors">Terms of Use</a>
              <a href="#" className="text-xs text-clay-muted hover:text-clay-ink transition-colors">Privacy Policy</a>
            </div>
          </div>

        </div>

        {/* Closing Horizon Illustration & Licenses */}
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-[11px] text-clay-muted">
          
          <div className="text-left">
            <span>© {new Date().getFullYear()} OpenMedQ. Code licensed under </span>
            <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="hover:text-clay-pink underline">MIT</a>
            <span>. Content under </span>
            <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer" className="hover:text-clay-pink underline">CC-BY-SA 4.0</a>
            <span>.</span>
          </div>

          <div className="flex gap-4">
            <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="hover:text-clay-pink transition-colors">GitHub</a>
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
