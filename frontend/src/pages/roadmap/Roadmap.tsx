import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, CheckCircle, Clock, Zap, Users, ThumbsUp } from 'lucide-react';

interface RoadmapProps {
  onBack: () => void;
}

export function Roadmap({ onBack }: RoadmapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activePathRef = useRef<SVGPathElement>(null);
  const trackPathRef = useRef<SVGPathElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const runnerRef = useRef<HTMLDivElement>(null);
  const runnerPulseRef = useRef<HTMLDivElement>(null);

  // Keep ALL measurements in refs to avoid re-renders during scroll
  const measureRef = useRef({
    isMobile: true,
    nodeYs: [100, 300, 500] as number[],
    containerHeight: 600,
    containerWidth: 600,
    totalLength: 0,
  });
  const rafId = useRef(0);
  const prevActiveNodes = useRef<boolean[]>([false, false, false]);

  // Only activeNodes needs React state (drives card CSS classes)
  const [activeNodes, setActiveNodes] = useState<boolean[]>([false, false, false]);

  // Computed path coordinates (derived from refs, not state)
  const buildPathD = useCallback(() => {
    const m = measureRef.current;
    const midX = m.isMobile ? 20 : m.containerWidth / 2;
    const leftX = m.isMobile ? 14 : midX - 48;
    const rightX = m.isMobile ? 26 : midX + 48;
    const nodeY = m.nodeYs;
    const h = m.containerHeight;

    if (nodeY.length >= 3) {
      return `M ${midX} 0 
       C ${midX} ${nodeY[0] / 2}, ${rightX} ${nodeY[0] / 2}, ${rightX} ${nodeY[0]} 
       C ${rightX} ${(nodeY[0] + nodeY[1]) / 2}, ${leftX} ${(nodeY[0] + nodeY[1]) / 2}, ${leftX} ${nodeY[1]} 
       C ${leftX} ${(nodeY[1] + nodeY[2]) / 2}, ${rightX} ${(nodeY[1] + nodeY[2]) / 2}, ${rightX} ${nodeY[2]} 
       C ${rightX} ${(nodeY[2] + h) / 2}, ${midX} ${(nodeY[2] + h) / 2}, ${midX} ${h}`;
    }
    return `M ${midX} 0 L ${midX} ${h}`;
  }, []);

  // Binary search to find coordinates along the curved path for a given Y position
  const getPointForY = (pathElement: SVGPathElement, targetY: number, totalLen: number) => {
    let low = 0;
    let high = totalLen;
    let bestLength = 0;
    let bestPoint = { x: 0, y: 0 };
    
    for (let i = 0; i < 8; i++) {
      const mid = (low + high) / 2;
      const pt = pathElement.getPointAtLength(mid);
      if (pt.y < targetY) {
        low = mid;
      } else {
        high = mid;
      }
      bestLength = mid;
      bestPoint = pt;
    }
    return { point: bestPoint, length: bestLength };
  };

  // Measure DOM and update SVG path (no React state updates here)
  const measureAndUpdatePath = useCallback(() => {
    if (!containerRef.current || !trackPathRef.current || !activePathRef.current) return;
    
    const m = measureRef.current;
    m.isMobile = window.innerWidth < 768;
    m.containerWidth = containerRef.current.offsetWidth;

    // Batch-read all node positions before any writes
    const nodes = containerRef.current.querySelectorAll('.timeline-node');
    m.nodeYs = Array.from(nodes).map((node) => (node as HTMLElement).offsetTop + 20);
    m.containerHeight = containerRef.current.offsetHeight;

    // Write: update SVG path d attribute directly (no re-render)
    const newPathD = buildPathD();
    trackPathRef.current.setAttribute('d', newPathD);
    activePathRef.current.setAttribute('d', newPathD);

    // Cache total length
    m.totalLength = trackPathRef.current.getTotalLength();
    activePathRef.current.setAttribute('stroke-dasharray', String(m.totalLength));
    activePathRef.current.setAttribute('stroke-dashoffset', String(m.totalLength));

    // Also update the marker positions via inline left style
    const midX = m.isMobile ? 20 : m.containerWidth / 2;
    const leftX = m.isMobile ? 14 : midX - 48;
    const rightX = m.isMobile ? 26 : midX + 48;
    
    const markers = containerRef.current.querySelectorAll<HTMLElement>('.timeline-marker');
    markers.forEach((marker, i) => {
      // Nodes 0,2 on right curve peak, node 1 on left curve valley
      marker.style.left = `${i === 1 ? leftX : rightX}px`;
    });

    // Also position radar ping element behind node 1 marker
    const pings = containerRef.current.querySelectorAll<HTMLElement>('.timeline-marker-ping');
    pings.forEach((ping) => {
      ping.style.left = `${leftX}px`;
    });
  }, [buildPathD]);

  // Scroll handler: runs inside rAF for frame-perfect alignment
  const handleScrollFrame = useCallback(() => {
    const container = containerRef.current;
    const activePath = activePathRef.current;
    const trackPath = trackPathRef.current;
    if (!container || !activePath || !trackPath) return;

    const m = measureRef.current;
    const rect = container.getBoundingClientRect();
    const triggerY = window.innerHeight * 0.60;
    const relativeScroll = triggerY - rect.top;

    const startY = 16;
    const endY = m.containerHeight - 16;

    let travelerY = relativeScroll;
    if (travelerY < startY) travelerY = 0;
    else if (travelerY > endY) travelerY = endY;

    const totalLen = m.totalLength;

    // Update SVG path + runner position directly in DOM (zero React)
    if (travelerY === 0) {
      if (runnerRef.current) runnerRef.current.style.opacity = '0';
      if (runnerPulseRef.current) runnerPulseRef.current.style.opacity = '0';
      activePath.setAttribute('stroke-dashoffset', String(totalLen));
    } else {
      const { point, length } = getPointForY(trackPath, travelerY, totalLen);
      activePath.setAttribute('stroke-dashoffset', String(totalLen - length));
      
      if (runnerRef.current) {
        runnerRef.current.style.opacity = '1';
        runnerRef.current.style.transform = `translate(${point.x}px, ${point.y}px) translate(-50%, -50%)`;
      }
      if (runnerPulseRef.current) {
        runnerPulseRef.current.style.opacity = '1';
        runnerPulseRef.current.style.transform = `translate(${point.x}px, ${point.y}px) translate(-50%, -50%)`;
      }
    }

    // Check node activation (only setState when changed)
    const updatedActive = m.nodeYs.map((ny) => travelerY >= ny);
    let changed = false;
    for (let i = 0; i < updatedActive.length; i++) {
      if (updatedActive[i] !== prevActiveNodes.current[i]) {
        changed = true;
        break;
      }
    }
    if (changed) {
      prevActiveNodes.current = updatedActive;
      setActiveNodes(updatedActive);
    }
  }, []);

  // Scroll listener: deduplicates via single rAF
  const onScroll = useCallback(() => {
    cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(handleScrollFrame);
  }, [handleScrollFrame]);

  // Mount: measure, attach listeners, initial scroll check
  useEffect(() => {
    // Initial measure after DOM paint
    const initialTimer = requestAnimationFrame(() => {
      measureAndUpdatePath();
      handleScrollFrame();
    });

    // Delayed re-measure to catch late layout shifts (fonts, images)
    const settleTimer = setTimeout(() => {
      measureAndUpdatePath();
      handleScrollFrame();
    }, 200);

    // ResizeObserver is more efficient than window resize
    const ro = new ResizeObserver(() => {
      measureAndUpdatePath();
      handleScrollFrame();
    });
    if (containerRef.current) ro.observe(containerRef.current);

    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      cancelAnimationFrame(initialTimer);
      clearTimeout(settleTimer);
      cancelAnimationFrame(rafId.current);
      ro.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, [measureAndUpdatePath, handleScrollFrame, onScroll]);

  // IntersectionObserver for card reveal fade-in
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('reveal-visible');
          }
        });
      },
      { threshold: 0.05, rootMargin: '0px 0px -80px 0px' }
    );

    const elements = document.querySelectorAll('.reveal-on-scroll');
    elements.forEach((el) => observer.observe(el));

    return () => {
      elements.forEach((el) => observer.unobserve(el));
    };
  }, []);

  return (
    <div className="min-h-screen bg-clay-canvas text-clay-ink flex flex-col font-sans selection:bg-clay-pink/20 selection:text-clay-pink relative overflow-x-hidden p-4 sm:p-6 md:p-12 text-left">
      {/* Decorative ambient background blur */}
      <div className="absolute top-0 left-0 w-[50%] h-[50%] bg-clay-lavender/5 rounded-full blur-[120px] pointer-events-none animate-ambient-drift" />
      <div className="absolute bottom-0 right-0 w-[50%] h-[50%] bg-clay-peach/5 rounded-full blur-[120px] pointer-events-none animate-ambient-drift" style={{ animationDelay: '-10s' }} />
      
      <div className="max-w-4xl mx-auto w-full relative z-10 text-left">
        {/* Back navigation */}
        <button 
          onClick={onBack}
          className="inline-flex items-center gap-2 text-clay-muted hover:text-clay-ink font-semibold text-sm mb-8 transition-colors duration-200 cursor-pointer animate-fade-in-up"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </button>

        {/* Header */}
        <div className="border-b border-clay-hairline pb-6 mb-8 animate-fade-in-up delay-75">
          <span className="text-xs font-bold uppercase tracking-wider text-clay-pink mb-2 block">Our Vision</span>
          <h1 className="font-rubik text-3xl md:text-5xl font-medium tracking-[-0.04em] text-clay-ink mb-4">
            Product Roadmap & Priority
          </h1>
          <p className="text-clay-muted text-xs md:text-sm leading-relaxed">
            OpenMedQ is a non-commercial, 100% free project. Our roadmap isn't dictated by boardrooms, monetization goals, or venture capitalists. We prioritize what helps medical students study efficiently and score higher. Below is where we have been, what we are building now, and where we are heading next—ranked by your priority.
          </p>
        </div>

        {/* Psychological Trigger Card: Community voice & voting */}
        <section className="bg-clay-surface-soft border border-clay-hairline rounded-clay-lg sm:rounded-clay-xl p-5 sm:p-6 md:p-8 mb-10 relative overflow-hidden animate-fade-in-up delay-100">
          <div className="flex flex-col sm:flex-row gap-5 items-start">
            <div className="w-12 h-12 rounded-clay-md bg-clay-pink/10 text-clay-pink flex items-center justify-center shrink-0">
              <Users className="w-6 h-6 animate-pulse" />
            </div>
            <div className="flex-1 min-w-0 w-full text-left">
              <h2 className="font-rubik text-lg sm:text-xl font-semibold text-clay-ink tracking-tight mb-2">
                This is Your Project. You Vote the Priorities.
              </h2>
              <p className="text-clay-body text-xs sm:text-sm leading-relaxed mb-4">
                We use the <strong>IKEA Effect</strong> of product design—we believe you should help shape the tools you rely on daily. We pull feature suggestions directly from the student community and rearrange our building queue based on peer votes. If you want a future feature moved to "Immediate Priority," make your voice heard!
              </p>
              
              <a 
                href="https://t.me/openmedq" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-clay-ink hover:bg-neutral-800 text-white font-bold text-xs sm:text-sm rounded-clay-md transition-colors cursor-pointer"
              >
                <ThumbsUp className="w-4 h-4 fill-current" />
                <span>Vote & Suggest in Telegram</span>
              </a>
            </div>
          </div>
        </section>

        {/* TIMELINE SECTION CONTAINER */}
        <div ref={containerRef} className="relative ml-2 md:ml-0 space-y-16 pb-8 w-full">
          
          {/* Curved Timeline Track and Active Path */}
          <svg ref={svgRef} className="absolute left-0 top-0 h-full pointer-events-none w-full z-0">
            {/* Background Snake Path (d set via DOM in measureAndUpdatePath) */}
            <path
              ref={trackPathRef}
              d="M 20 0 L 20 600"
              fill="none"
              stroke="var(--clay-hairline)"
              strokeWidth="2"
              strokeLinecap="round"
            />
            {/* Active Pink Overlay Path (NO CSS transition — tracks scroll position instantly) */}
            <path
              ref={activePathRef}
              d="M 20 0 L 20 600"
              fill="none"
              stroke="var(--clay-pink)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={2000}
              strokeDashoffset={2000}
            />
          </svg>

          {/* Traveling glow dot (Runner) & outer pulse — GPU-promoted with will-change */}
          <div 
            ref={runnerPulseRef}
            className="absolute left-0 top-0 w-6 h-6 sm:w-7 sm:h-7 bg-clay-pink/20 rounded-full z-10 animate-ping pointer-events-none opacity-0"
            style={{ 
              transform: 'translate(-50%, -50%)',
              animationDuration: '1.8s',
              willChange: 'transform, opacity',
            }}
          />
          <div 
            ref={runnerRef}
            className="absolute left-0 top-0 w-3.5 h-3.5 sm:w-4 sm:h-4 bg-clay-pink rounded-full z-20 shadow-[0_0_15px_#ff4d8b,0_0_6px_#ff4d8b] pointer-events-none opacity-0 border border-white/40"
            style={{ 
              transform: 'translate(-50%, -50%)',
              willChange: 'transform, opacity',
            }}
          />

          {/* Timeline Node 1: Completed / Shipped (Left side on Desktop) */}
          <div className="relative timeline-node reveal-on-scroll pl-14 md:pl-0 grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16 items-start">
            {/* Timeline Marker Icon - positioned programmatically via timeline-marker class */}
            <div 
              className={`timeline-marker absolute -translate-x-1/2 top-1 w-7 h-7 sm:w-9 sm:h-9 rounded-full border-4 border-clay-canvas flex items-center justify-center shadow-sm shrink-0 z-10 transition-colors transition-shadow duration-500 transform ${
                activeNodes[0] 
                  ? 'bg-clay-mint text-clay-teal scale-110 shadow-md ring-4 ring-clay-mint/20 border-clay-mint/10' 
                  : 'bg-clay-surface-strong text-clay-muted scale-100'
              }`}
            >
              <CheckCircle className="w-4 h-4 sm:w-5 h-5" />
            </div>
            
            {/* Left Column content */}
            <div className="space-y-4 md:text-right pr-0 md:pr-12">
              <div className="text-left md:text-right">
                <span className="px-2.5 py-0.5 rounded bg-clay-mint/15 text-clay-teal text-[10px] font-bold uppercase tracking-wider mb-2 inline-block border border-clay-mint/30">
                  Phase 1: Completed & Shipped
                </span>
                <h3 className="font-rubik text-lg sm:text-xl font-semibold text-clay-ink tracking-tight">
                  The Foundations of Active Recall
                </h3>
              </div>
              
              <div className="grid grid-cols-1 gap-4 text-left">
                <div className={`bg-white border rounded-clay-lg p-4 transition-all duration-500 hover:shadow-md ${
                  activeNodes[0] 
                    ? 'border-clay-mint bg-clay-mint/5 shadow-sm translate-y-0 opacity-100' 
                    : 'border-clay-hairline opacity-60 translate-y-2'
                }`}>
                  <span className={`text-xs font-bold block mb-1 transition-colors duration-500 ${activeNodes[0] ? 'text-clay-teal' : 'text-clay-muted'}`}>100% Offline Practice Engine</span>
                  <span className="text-xs text-clay-body">Solve clinical MCQs anywhere (hospital wards, library corners, or commutes) without needing an active internet connection. Features Study Mode for instant answers and Test Mode for full mock configuration.</span>
                </div>
                <div className={`bg-white border rounded-clay-lg p-4 transition-all duration-500 hover:shadow-md ${
                  activeNodes[0] 
                    ? 'border-clay-mint bg-clay-mint/5 shadow-sm translate-y-0 opacity-100' 
                    : 'border-clay-hairline opacity-60 translate-y-2'
                }`} style={{ transitionDelay: activeNodes[0] ? '100ms' : '0ms' }}>
                  <span className={`text-xs font-bold block mb-1 transition-colors duration-500 ${activeNodes[0] ? 'text-clay-teal' : 'text-clay-muted'}`}>Custom Exam Creator</span>
                  <span className="text-xs text-clay-body">Build your own custom practice blocks. Select specific medical subjects, choose timed settings (countdown per question or stopwatch), and filter by question history (incorrect, bookmarked, or unattempted).</span>
                </div>
                <div className={`bg-white border rounded-clay-lg p-4 transition-all duration-500 hover:shadow-md ${
                  activeNodes[0] 
                    ? 'border-clay-mint bg-clay-mint/5 shadow-sm translate-y-0 opacity-100' 
                    : 'border-clay-hairline opacity-60 translate-y-2'
                }`} style={{ transitionDelay: activeNodes[0] ? '200ms' : '0ms' }}>
                  <span className={`text-xs font-bold block mb-1 transition-colors duration-500 ${activeNodes[0] ? 'text-clay-teal' : 'text-clay-muted'}`}>Scientific Spaced Repetition (FSRS)</span>
                  <span className="text-xs text-clay-body">Built-in scheduler that tracks how well you remember each clinical question and calculates the optimal revision time to ensure long-term retention.</span>
                </div>
                <div className={`bg-white border rounded-clay-lg p-4 transition-all duration-500 hover:shadow-md ${
                  activeNodes[0] 
                    ? 'border-clay-mint bg-clay-mint/5 shadow-sm translate-y-0 opacity-100' 
                    : 'border-clay-hairline opacity-60 translate-y-2'
                }`} style={{ transitionDelay: activeNodes[0] ? '300ms' : '0ms' }}>
                  <span className={`text-xs font-bold block mb-1 transition-colors duration-500 ${activeNodes[0] ? 'text-clay-teal' : 'text-clay-muted'}`}>Clinical Vignette Formatting</span>
                  <span className="text-xs text-clay-body">Displays complex medical case reports cleanly with bold key symptoms, standard option layouts, and fully optimized dark mode styling.</span>
                </div>
              </div>
            </div>

            {/* Right Column (Empty space on desktop, hidden on mobile) */}
            <div className="hidden md:block" />
          </div>

          {/* Timeline Node 2: Active / In Progress (Right side on Desktop) */}
          <div className="relative timeline-node reveal-on-scroll pl-14 md:pl-0 grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16 items-start">
            {/* Timeline Marker Icon - positioned programmatically via timeline-marker class */}
            <div 
              className={`timeline-marker absolute -translate-x-1/2 top-1 w-7 h-7 sm:w-9 sm:h-9 rounded-full border-4 border-clay-canvas flex items-center justify-center shadow-sm shrink-0 z-10 transition-colors transition-shadow duration-500 transform ${
                activeNodes[1] 
                  ? 'bg-clay-pink text-white scale-110 shadow-md ring-4 ring-clay-pink/20 border-clay-pink/10' 
                  : 'bg-clay-surface-strong text-clay-muted scale-100'
              }`}
            >
              <Zap className={`w-4 h-4 sm:w-5 h-5 ${activeNodes[1] ? 'animate-pulse' : ''}`} />
            </div>
            {activeNodes[1] && (
              <div 
                className="timeline-marker-ping absolute -translate-x-1/2 top-1 w-7 h-7 sm:w-9 sm:h-9 rounded-full bg-clay-pink/20 animate-ping border border-clay-pink/30 pointer-events-none z-0" 
                style={{ animationDuration: '2s' }} 
              />
            )}
            
            {/* Left Column (Empty space on desktop, hidden on mobile) */}
            <div className="hidden md:block" />

            {/* Right Column content */}
            <div className="space-y-4 pl-0 md:pl-12 text-left">
              <div className="text-left">
                <span className="px-2.5 py-0.5 rounded bg-clay-pink/10 text-clay-pink text-[10px] font-bold uppercase tracking-wider mb-2 inline-block border border-clay-pink/20 animate-pulse">
                  Now Building
                </span>
                <h3 className="font-rubik text-lg sm:text-xl font-semibold text-clay-ink tracking-tight">
                  Polishing & Community Expansion
                </h3>
              </div>
              
              <div className="grid grid-cols-1 gap-4">
                <div className={`bg-white border rounded-clay-lg p-4 transition-all duration-500 hover:shadow-md ${
                  activeNodes[1] 
                    ? 'border-clay-pink bg-clay-pink/5 shadow-sm translate-y-0 opacity-100' 
                    : 'border-clay-hairline opacity-60 translate-y-2'
                }`}>
                  <span className={`text-xs font-bold block mb-1 transition-colors duration-500 ${activeNodes[1] ? 'text-clay-pink' : 'text-clay-muted'}`}>Bugs & Performance Polish</span>
                  <span className="text-xs text-clay-body">Reviewing initial user feedback, squash minor layout glitches, adjust mobile responsiveness, and keep the interactive mock system running fast and distraction-free.</span>
                </div>
                <div className={`bg-white border rounded-clay-lg p-4 transition-all duration-500 hover:shadow-md ${
                  activeNodes[1] 
                    ? 'border-clay-pink bg-clay-pink/5 shadow-sm translate-y-0 opacity-100' 
                    : 'border-clay-hairline opacity-60 translate-y-2'
                }`} style={{ transitionDelay: activeNodes[1] ? '100ms' : '0ms' }}>
                  <span className={`text-xs font-bold block mb-1 transition-colors duration-500 ${activeNodes[1] ? 'text-clay-pink' : 'text-clay-muted'}`}>Live Launch Adjustments</span>
                  <span className="text-xs text-clay-body">Tuning small CSS styling quirks and resolving minor issues reported as the web platform goes live.</span>
                </div>
                <div className={`bg-white border rounded-clay-lg p-4 transition-all duration-500 hover:shadow-md ${
                  activeNodes[1] 
                    ? 'border-clay-pink bg-clay-pink/5 shadow-sm translate-y-0 opacity-100' 
                    : 'border-clay-hairline opacity-60 translate-y-2'
                }`} style={{ transitionDelay: activeNodes[1] ? '200ms' : '0ms' }}>
                  <span className={`text-xs font-bold block mb-1 transition-colors duration-500 ${activeNodes[1] ? 'text-clay-pink' : 'text-clay-muted'}`}>Community QBanks & Corrections</span>
                  <span className="text-xs text-clay-body">Welcoming and merging new clinical question packs and peer-submitted database corrections (manually verified against standard textbooks like Robbins, Harrison's, etc.) to expand our free resource database.</span>
                </div>
              </div>
            </div>
          </div>

          {/* Timeline Node 3: Future Tiers (Left side on Desktop) */}
          <div className="relative timeline-node reveal-on-scroll pl-14 md:pl-0 grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16 items-start">
            {/* Timeline Marker Icon - positioned programmatically via timeline-marker class */}
            <div 
              className={`timeline-marker absolute -translate-x-1/2 top-1 w-7 h-7 sm:w-9 sm:h-9 rounded-full border-4 border-clay-canvas flex items-center justify-center shadow-sm shrink-0 z-10 transition-colors transition-shadow duration-500 transform ${
                activeNodes[2] 
                  ? 'bg-clay-ochre text-white scale-110 shadow-md ring-4 ring-clay-ochre/20 border-clay-ochre/10' 
                  : 'bg-clay-surface-strong text-clay-muted scale-100'
              }`}
            >
              <Clock className="w-4 h-4 sm:w-5 h-5" />
            </div>
            
            {/* Left Column content */}
            <div className="space-y-6 md:text-right pr-0 md:pr-12">
              <div className="text-left md:text-right">
                <span className="px-2.5 py-0.5 rounded bg-clay-ochre/15 text-clay-ochre text-[10px] font-bold uppercase tracking-wider mb-2 inline-block border border-clay-ochre/30">
                  Future Pipeline
                </span>
                <h3 className="font-rubik text-lg sm:text-xl font-semibold text-clay-ink tracking-tight">
                  Planned Scopes (Priority Tiers)
                </h3>
                <p className="text-clay-muted text-xs sm:text-sm mt-1">
                  Features below are prioritized based on user feedback. Help us reshuffle them by upvoting in our community channels!
                </p>
              </div>
              
              <div className="space-y-6 text-left">
                
                {/* Priority Tier 1 */}
                <div 
                  className={`border rounded-clay-lg p-4 text-left transition-all duration-500 ${
                    activeNodes[2] 
                      ? 'border-clay-peach bg-clay-peach/5 opacity-100 translate-y-0 shadow-sm' 
                      : 'border-clay-hairline bg-clay-surface-soft/20 opacity-60 translate-y-2'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className="px-2 py-0.5 rounded bg-clay-peach text-clay-ink text-[9px] font-bold uppercase tracking-wider">
                      Tier 1: Immediate Priority
                    </span>
                    <span className="text-[10px] text-clay-muted font-medium">Scheduled next in pipeline</span>
                  </div>
                  <div className="grid grid-cols-1 gap-4 text-xs text-clay-body">
                    <div className="p-3 bg-clay-canvas/50 border border-clay-hairline/60 rounded">
                      <strong>📂 Peer-to-Peer QBank Sharing Portal</strong>
                      <p className="text-clay-muted mt-1 text-[11px]">A shared community section to upload your custom question packs and download blocks created by other students. Includes strict moderation and community quality ratings to ensure clean, high-yield content.</p>
                    </div>
                  </div>
                </div>

                {/* Priority Tier 2 */}
                <div 
                  className={`border rounded-clay-lg p-4 text-left transition-all duration-500 ${
                    activeNodes[2] 
                      ? 'border-clay-lavender bg-clay-lavender/5 opacity-100 translate-y-0 shadow-sm' 
                      : 'border-clay-hairline bg-clay-surface-soft/20 opacity-60 translate-y-2'
                  }`}
                  style={{ transitionDelay: activeNodes[2] ? '100ms' : '0ms' }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className="px-2 py-0.5 rounded bg-clay-lavender text-clay-ink text-[9px] font-bold uppercase tracking-wider">
                      Tier 2: Planned for Future
                    </span>
                    <span className="text-[10px] text-clay-muted font-medium">Mid-term roadmap pipeline</span>
                  </div>
                  <div className="grid grid-cols-1 gap-4 text-xs text-clay-body">
                    <div className="p-3 bg-clay-canvas/50 border border-clay-hairline/60 rounded">
                      <strong>📊 Daily NEET PG Grand Test & Analytics</strong>
                      <p className="text-clay-muted mt-1 text-[11px]">A unified global mock test offered every day with the same set of questions for all users. Get your relative rank, percentile, speed comparison against top scorers, subject-wise weak-spot metrics, and high-demand features decided by community vote.</p>
                    </div>
                  </div>
                </div>

                {/* Priority Tier 3 */}
                <div 
                  className={`border rounded-clay-lg p-4 text-left transition-all duration-500 ${
                    activeNodes[2] 
                      ? 'border-clay-hairline-strong bg-clay-surface-soft/40 opacity-100 translate-y-0 shadow-sm' 
                      : 'border-clay-hairline bg-clay-surface-soft/20 opacity-60 translate-y-2'
                  }`}
                  style={{ transitionDelay: activeNodes[2] ? '200ms' : '0ms' }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className="px-2 py-0.5 rounded bg-clay-surface-strong text-clay-ink text-[9px] font-bold uppercase tracking-wider border border-clay-hairline">
                      Tier 3: Long-Term / Wishlist
                    </span>
                    <span className="text-[10px] text-clay-muted font-medium">Not planned soon unless highly requested</span>
                  </div>
                  <div className="grid grid-cols-1 gap-4 text-xs text-clay-body">
                    <div className="p-3 bg-clay-canvas/50 border border-clay-hairline/60 rounded opacity-75">
                      <strong>🧠 AI-Powered Personalized Tutor</strong>
                      <p className="text-clay-muted mt-1 text-[11px]">Integrating AI tools for predictive weak-spot modeling (analyzing mistakes to map conceptual gaps across medical subjects) and delivering custom, on-demand clinical case explanations.</p>
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* Right Column (Empty space on desktop, hidden on mobile) */}
            <div className="hidden md:block" />
          </div>

        </div>

        {/* Footer info */}
        <div className="mt-16 pt-6 border-t border-clay-hairline flex flex-col sm:flex-row justify-between items-center gap-2 sm:gap-0 text-xs text-clay-muted">
          <span>© {new Date().getFullYear()} OpenMedQ</span>
          <span>Community Driven • Peer Verified</span>
        </div>
      </div>
    </div>
  );
}
