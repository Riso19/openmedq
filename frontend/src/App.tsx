import { useState, useEffect, useCallback, useRef } from 'react';
import { LandingPage } from './pages/landing/LandingPage';
import { useAuth, SignIn, SignUp, useUser } from '@clerk/clerk-react';
import { CustomModuleCreator, type CustomModuleConfig } from './pages/practice/CustomModuleCreator';
import { PracticeSuite } from './pages/practice/PracticeSuite';
import { Dashboard } from './pages/dashboard/Dashboard';
import { Analytics } from './pages/dashboard/Analytics';
import { SyncManager } from './lib/SyncManager';
import { checkDailyStreakAndReset } from './lib/gamification';
import { LevelResetModal } from './components/LevelResetModal';
import { LeaderboardPage } from './pages/leaderboard/LeaderboardPage';
import { LevelUpCelebrationModal } from './components/LevelUpCelebrationModal';
import { PrivacyPolicy } from './pages/legal/PrivacyPolicy';
import { TermsConditions } from './pages/legal/TermsConditions';
import { Disclaimer } from './pages/legal/Disclaimer';
import { DMCAPolicy } from './pages/legal/DMCAPolicy';
import { Contribute } from './pages/contribute/Contribute';
import { Roadmap } from './pages/roadmap/Roadmap';

import { useTheme } from './components/theme-provider';

const getInitialView = (): 'landing' | 'auth' | 'custom_creator' | 'custom_practice' | 'dashboard' | 'stats' | 'leaderboard' | 'privacy_policy' | 'terms_conditions' | 'disclaimer' | 'dmca_policy' | 'contribute' | 'roadmap' => {
  const path = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase();
  
  if (path === '/privacy' || path === '/privacy-policy' || hash === '#privacy' || hash === '#privacy-policy') {
    return 'privacy_policy';
  }
  if (path === '/terms' || path === '/terms-conditions' || hash === '#terms' || hash === '#terms-conditions') {
    return 'terms_conditions';
  }
  if (path === '/disclaimer' || hash === '#disclaimer') {
    return 'disclaimer';
  }
  if (path === '/dmca' || path === '/dmca-policy' || hash === '#dmca' || hash === '#dmca-policy') {
    return 'dmca_policy';
  }
  if (path === '/contribute' || hash === '#contribute') {
    return 'contribute';
  }
  if (path === '/roadmap' || hash === '#roadmap') {
    return 'roadmap';
  }
  return 'landing';
};

function App() {
  const { theme } = useTheme();
  const [isDark, setIsDark] = useState<boolean>(false);

  useEffect(() => {
    const checkDark = () => {
      if (theme === 'system') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
      }
      return theme === 'dark';
    };
    setIsDark(checkDark());

    if (theme === 'system') {
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = (e: MediaQueryListEvent) => {
        setIsDark(e.matches);
      };
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    }
  }, [theme]);

  const clerkAppearance = {
    variables: {
      colorPrimary: '#ff4d8b', // OpenMedQ Clay Pink accent
      colorBackground: isDark ? '#000000' : '#fffaf0', // Matches theme canvas exactly
      colorText: isDark ? '#fffaf0' : '#0a0a0a', // Matches theme ink
      colorTextSecondary: isDark ? '#8a8a8a' : '#6a6a6a', // Matches theme muted
      colorInputBackground: isDark ? '#0c0c0c' : '#faf5e8', // Matches theme surface-soft
      colorInputText: isDark ? '#fffaf0' : '#0a0a0a', // Matches theme ink
      colorBorder: isDark ? '#222222' : '#e5e5e5', // Matches theme hairline
      borderRadius: '12px',
      fontFamily: 'Inter, sans-serif',
    },
    elements: {
      card: 'shadow-none border-0 p-0 bg-transparent w-full',
      headerTitle: 'font-rubik font-medium text-xl tracking-tight text-clay-ink text-center',
      headerSubtitle: 'text-clay-muted text-xs text-center',
      socialButtonsBlockButton: 'border border-clay-hairline bg-clay-canvas hover:bg-clay-surface-soft text-clay-ink rounded-clay-md shadow-none h-11',
      socialButtonsBlockButtonText: 'text-clay-ink font-semibold',
      formButtonPrimary: 'bg-clay-ink text-clay-canvas hover:bg-neutral-800 dark:hover:bg-neutral-200 font-bold h-11 rounded-clay-md transition-colors shadow-none',
      formFieldInput: 'bg-clay-canvas border border-clay-hairline rounded-clay-md h-11 focus:border-clay-ink focus:ring-0',
      footerActionLink: 'text-clay-pink hover:text-rose-600',
      footerAction: 'text-clay-muted text-xs',
      dividerLine: 'bg-clay-hairline',
      dividerText: 'text-clay-muted text-[10px] uppercase font-bold tracking-wider',
    }
  };

  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const [view, setView] = useState<'landing' | 'auth' | 'custom_creator' | 'custom_practice' | 'dashboard' | 'stats' | 'leaderboard' | 'privacy_policy' | 'terms_conditions' | 'disclaimer' | 'dmca_policy' | 'contribute' | 'roadmap'>(getInitialView);

  const [customModuleConfig, setCustomModuleConfig] = useState<CustomModuleConfig | null>(null);
  const [authTab, setAuthTab] = useState<'signin' | 'signup'>('signin');
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'unsynced' | 'error'>('synced');
  const [resumeActiveSession, setResumeActiveSession] = useState<boolean>(false);
  const [lastMonthStats, setLastMonthStats] = useState<any | null>(null);
  const [pendingLevelUp, setPendingLevelUp] = useState<any | null>(null);

  // Run daily streak and month rollover checks on app load
  useEffect(() => {
    const runStreakCheck = async () => {
      try {
        await checkDailyStreakAndReset();
        const pending = localStorage.getItem('openmedq_last_month_stats');
        if (pending) {
          setLastMonthStats(JSON.parse(pending));
        }
      } catch (err) {
        console.warn("Failed to check daily streak.");
      }
    };
    if (isLoaded) {
      runStreakCheck();
    }
  }, [isLoaded]);

  // Listen for pathname or hash-based routing to support legal deep links (e.g. /privacy, /terms)
  useEffect(() => {
    const handleRouting = () => {
      const path = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      
      if (path === '/privacy-policy' || path === '/privacy' || hash === '#privacy-policy' || hash === '#privacy') {
        setView('privacy_policy');
      } else if (path === '/terms-conditions' || path === '/terms' || hash === '#terms-conditions' || hash === '#terms') {
        setView('terms_conditions');
      } else if (path === '/disclaimer' || hash === '#disclaimer') {
        setView('disclaimer');
      } else if (path === '/dmca-policy' || path === '/dmca' || hash === '#dmca-policy' || hash === '#dmca') {
        setView('dmca_policy');
      } else if (path === '/contribute' || hash === '#contribute') {
        setView('contribute');
      } else if (path === '/roadmap' || hash === '#roadmap') {
        setView('roadmap');
      } else if (path === '/' && (view === 'privacy_policy' || view === 'terms_conditions' || view === 'disclaimer' || view === 'dmca_policy' || view === 'contribute' || view === 'roadmap')) {
        setView('landing');
      }
    };
    handleRouting();
    window.addEventListener('hashchange', handleRouting);
    window.addEventListener('popstate', handleRouting);
    return () => {
      window.removeEventListener('hashchange', handleRouting);
      window.removeEventListener('popstate', handleRouting);
    };
  }, [view]);

  // Dynamic canonical and social preview meta tag updater
  useEffect(() => {
    const canonicalUrl = `${window.location.origin}${window.location.pathname}${window.location.search}${window.location.hash}`;
    
    // Update or create canonical link tag
    let canonicalLink = document.querySelector("link[rel='canonical']");
    if (!canonicalLink) {
      canonicalLink = document.createElement('link');
      canonicalLink.setAttribute('rel', 'canonical');
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.setAttribute('href', canonicalUrl);

    // Update or create OG URL tag
    let ogUrl = document.querySelector("meta[property='og:url']");
    if (!ogUrl) {
      ogUrl = document.createElement('meta');
      ogUrl.setAttribute('property', 'og:url');
      document.head.appendChild(ogUrl);
    }
    ogUrl.setAttribute('content', canonicalUrl);

    // Update or create Twitter URL tag
    let twitterUrl = document.querySelector("meta[property='twitter:url']") || document.querySelector("meta[name='twitter:url']");
    if (!twitterUrl) {
      twitterUrl = document.createElement('meta');
      twitterUrl.setAttribute('name', 'twitter:url');
      document.head.appendChild(twitterUrl);
    }
    twitterUrl.setAttribute('content', canonicalUrl);

    // Update preview images
    const ogImage = document.querySelector("meta[property='og:image']");
    if (ogImage) {
      ogImage.setAttribute('content', `${window.location.origin}/logo.png`);
    }
    const twitterImage = document.querySelector("meta[property='twitter:image']") || document.querySelector("meta[name='twitter:image']");
    if (twitterImage) {
      twitterImage.setAttribute('content', `${window.location.origin}/logo.png`);
    }
  }, [view]);

  const handleBackToLanding = () => {
    window.location.hash = '';
    if (window.location.pathname !== '/') {
      window.history.pushState(null, '', '/');
    }
    setView('landing');
  };

  // Automatically transition to dashboard once authenticated (if in auth view)
  useEffect(() => {
    if (isLoaded && isSignedIn && view === 'auth') {
      setView('dashboard');
    }
  }, [isLoaded, isSignedIn, view]);

  // Handle cleaning up IndexedDB and localStorage on sign out
  const prevSignedInRef = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    if (isLoaded) {
      if (prevSignedInRef.current === true && !isSignedIn) {
        SyncManager.logoutCleanup();
      }
      prevSignedInRef.current = isSignedIn;
    }
  }, [isSignedIn, isLoaded]);

  // Check for pending level-up celebration when returning to dashboard
  useEffect(() => {
    if (view === 'dashboard') {
      const pending = sessionStorage.getItem('openmedq_pending_levelup');
      if (pending) {
        setPendingLevelUp(JSON.parse(pending));
      }
    }
  }, [view]);

  const unsyncedCountRef = useRef<number>(0);

  // Synchronize IndexedDB progress with Cloudflare D1 Backend via Clerk JWT
  const triggerSync = useCallback(async () => {
    if (isLoaded && isSignedIn) {
      const displayName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username || 'Aspirant' : 'Aspirant';
      const email = user?.primaryEmailAddress?.emailAddress || '';
      const profile = { displayName, email };
      await SyncManager.syncWithD1(getToken, setSyncStatus, profile);
    }
  }, [isSignedIn, isLoaded, getToken, user]);

  // Sync on page load
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      triggerSync();
    }
  }, [isSignedIn, isLoaded, triggerSync]);

  // Sync periodically every 10 minutes if there are pending changes
  useEffect(() => {
    if (!isSignedIn) return;
    const interval = setInterval(() => {
      if (unsyncedCountRef.current > 0) {
        triggerSync();
        unsyncedCountRef.current = 0;
      }
    }, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [isSignedIn, triggerSync]);

  // Sync when the page is hidden or backgrounded (user minimizes browser)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && unsyncedCountRef.current > 0) {
        triggerSync();
        unsyncedCountRef.current = 0;
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [triggerSync]);

  const startPracticeView = useCallback(() => {
    setView('dashboard');
  }, []);

  const triggerAuthSimulate = useCallback(() => {
    setView('auth');
  }, []);

  const handleViewPrivacy = useCallback(() => {
    window.history.pushState(null, '', '/privacy');
    setView('privacy_policy');
  }, []);

  const handleViewTerms = useCallback(() => {
    window.history.pushState(null, '', '/terms');
    setView('terms_conditions');
  }, []);

  const handleViewDisclaimer = useCallback(() => {
    window.history.pushState(null, '', '/disclaimer');
    setView('disclaimer');
  }, []);

  const handleViewDMCA = useCallback(() => {
    window.history.pushState(null, '', '/dmca');
    setView('dmca_policy');
  }, []);

  const handleViewContribute = useCallback(() => {
    window.history.pushState(null, '', '/contribute');
    setView('contribute');
  }, []);

  const handleViewRoadmap = useCallback(() => {
    window.history.pushState(null, '', '/roadmap');
    setView('roadmap');
  }, []);

  if (view === 'landing') {
    return (
      <LandingPage 
        onStartPractice={startPracticeView} 
        onSignIn={triggerAuthSimulate} 
        onViewPrivacy={handleViewPrivacy}
        onViewTerms={handleViewTerms}
        onViewDisclaimer={handleViewDisclaimer}
        onViewDMCA={handleViewDMCA}
        onViewContribute={handleViewContribute}
        onViewRoadmap={handleViewRoadmap}
        isDark={isDark}
      />
    );
  }

  if (view === 'privacy_policy') {
    return <PrivacyPolicy onBack={handleBackToLanding} />;
  }

  if (view === 'terms_conditions') {
    return <TermsConditions onBack={handleBackToLanding} />;
  }

  if (view === 'disclaimer') {
    return <Disclaimer onBack={handleBackToLanding} />;
  }

  if (view === 'dmca_policy') {
    return <DMCAPolicy onBack={handleBackToLanding} />;
  }

  if (view === 'contribute') {
    return <Contribute onBack={handleBackToLanding} />;
  }

  if (view === 'roadmap') {
    return <Roadmap onBack={handleBackToLanding} />;
  }

  if (view === 'auth') {
    return (
      <div className="min-h-screen bg-clay-canvas text-clay-ink flex flex-col items-center justify-center p-6 font-sans relative">
        <div className="absolute top-0 left-0 w-[50%] h-[50%] bg-clay-lavender/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-[50%] h-[50%] bg-clay-peach/10 rounded-full blur-[120px] pointer-events-none" />

        <div className="w-full max-w-md flex flex-col items-center relative z-10">
          <div className="flex items-center gap-3 mb-6 cursor-pointer group" onClick={() => setView('landing')}>
            <img src={isDark ? '/logo-dark.png' : '/logo-light.png'} className="w-10 h-10 rounded-clay-md shadow-sm group-hover:scale-105 transition-transform duration-300 object-contain" alt="OpenMedQ Logo" />
            <span className="text-xl font-bold tracking-tight text-clay-ink">OpenMedQ</span>
          </div>

          <div className="w-full bg-clay-canvas border border-clay-hairline rounded-clay-xl p-6 shadow-sm">
            <div className="flex border-b border-clay-hairline bg-clay-surface-soft rounded-clay-md p-1 mb-6">
              <button
                onClick={() => setAuthTab('signin')}
                className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider text-center rounded-clay-md transition-all cursor-pointer ${
                  authTab === 'signin' ? 'bg-clay-canvas text-clay-ink shadow-sm' : 'text-clay-muted hover:text-clay-ink'
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => setAuthTab('signup')}
                className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider text-center rounded-clay-md transition-all cursor-pointer ${
                  authTab === 'signup' ? 'bg-clay-canvas text-clay-ink shadow-sm' : 'text-clay-muted hover:text-clay-ink'
                }`}
              >
                Create Account
              </button>
            </div>

            {authTab === 'signin' ? (
              <SignIn
                routing="virtual"
                signUpUrl="#"
                appearance={clerkAppearance}
              />
            ) : (
              <SignUp
                routing="virtual"
                signInUrl="#"
                appearance={clerkAppearance}
              />
            )}

            <button
              onClick={() => setView('landing')}
              className="w-full text-clay-muted hover:text-clay-ink text-xs font-bold mt-4 pt-4 border-t border-clay-hairline transition-colors duration-200 cursor-pointer"
            >
              Cancel and Return Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'stats') {
    return (
      <Analytics
        onBack={() => setView('dashboard')}
        onStartCustomModule={(config) => {
          setCustomModuleConfig(config);
          setView('custom_practice');
        }}
        onPracticeSubject={(subjectId, topicIds) => {
          if (topicIds && topicIds.length > 0) {
            setCustomModuleConfig({
              subjectIds: [subjectId],
              topicIds: topicIds,
              status: 'ALL',
              timerMode: 'STOPWATCH',
              timerValue: 0,
              limit: topicIds.length === 1 ? 10 : 15,
            });
          } else {
            setCustomModuleConfig({
              subjectIds: [subjectId],
              status: 'ALL',
              timerMode: 'STOPWATCH',
              timerValue: 0,
              limit: 20,
              isStandard: true
            });
          }
          setView('custom_practice');
        }}
        syncStatus={syncStatus}
        onSyncForce={triggerSync}
      />
    );
  }

  if (view === 'dashboard') {
    return (
      <>
      <Dashboard
        onStartPractice={() => {
          setCustomModuleConfig({
            subjectIds: [5], // Pathology default
            status: 'ALL',
            timerMode: 'STOPWATCH',
            timerValue: 0,
            limit: 20,
            isStandard: true
          });
          setView('custom_practice');
        }}
        onSignIn={triggerAuthSimulate}
        onPracticeSubject={(subjectId, topicIds) => {
          if (topicIds && topicIds.length > 0) {
            setCustomModuleConfig({
              subjectIds: [subjectId],
              topicIds: topicIds,
              status: 'ALL',
              timerMode: 'STOPWATCH',
              timerValue: 0,
              limit: topicIds.length === 1 ? 10 : 15,
            });
          } else {
            setCustomModuleConfig({
              subjectIds: [subjectId],
              status: 'ALL',
              timerMode: 'STOPWATCH',
              timerValue: 0,
              limit: 20,
              isStandard: true
            });
          }
          setView('custom_practice');
        }}
        onStartCustomModule={(config, resume) => {
          setCustomModuleConfig(config);
          setResumeActiveSession(!!resume);
          setView('custom_practice');
        }}
        onManageCustomModules={() => {
          setView('custom_creator');
        }}
        onStartFSRSReview={() => {
          setCustomModuleConfig({
            subjectIds: [],
            status: 'SPACED_REPETITION',
            timerMode: 'STOPWATCH',
            timerValue: 0,
            limit: 20,
          });
          setView('custom_practice');
        }}
        onSyncForce={triggerSync}
        syncStatus={syncStatus}
        onViewStats={() => setView('stats')}
        onViewLeaderboard={() => setView('leaderboard')}
      />
      <LevelResetModal
        lastMonthStats={lastMonthStats}
        onClose={() => {
          localStorage.removeItem('openmedq_last_month_stats');
          setLastMonthStats(null);
        }}
      />
      <LevelUpCelebrationModal
        levelInfo={pendingLevelUp}
        onClose={() => {
          sessionStorage.removeItem('openmedq_pending_levelup');
          setPendingLevelUp(null);
        }}
      />
      </>
    );
  }

  if (view === 'leaderboard') {
    return (
      <LeaderboardPage
        onBack={() => setView('dashboard')}
      />
    );
  }

  if (view === 'custom_creator') {
    return (
      <CustomModuleCreator
        onBack={() => setView('dashboard')}
        onStart={(config) => {
          setCustomModuleConfig(config);
          setView('custom_practice');
        }}
      />
    );
  }

  if (view === 'custom_practice' && customModuleConfig) {
    return (
      <PracticeSuite
        config={customModuleConfig}
        resumeActiveSession={resumeActiveSession}
        onExit={() => {
          setResumeActiveSession(false);
          setView('dashboard');
          if (unsyncedCountRef.current > 0) {
            triggerSync();
            unsyncedCountRef.current = 0;
          }
        }}
        onProgressUpdate={(count) => {
          unsyncedCountRef.current += count;
          if (unsyncedCountRef.current >= 10) {
            triggerSync();
            unsyncedCountRef.current = 0;
          }
        }}
      />
    );
  }

  return null;
}

export default App;
