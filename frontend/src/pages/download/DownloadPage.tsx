import { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Download, ShieldCheck, Smartphone, Check, Copy, HelpCircle, Info } from 'lucide-react';

interface DownloadPageProps {
  onBack: () => void;
}

export function DownloadPage({ onBack }: DownloadPageProps) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const copyTimeoutRef = useRef<any>(null);
  const hash = "3a6886756b41567a97be20e52f4999c52658fa21e4ec3b2e04db3ee2e289ce21"; // SHA-256 checksum of openmedq-latest.apk

  const handleCopyHash = () => {
    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current);
    }
    setCopyError(null);

    navigator.clipboard.writeText(hash)
      .then(() => {
        setCopied(true);
        copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
      })
      .catch((err) => {
        console.error('Failed to copy hash to clipboard:', err);
        setCopyError('Failed to copy checksum.');
        copyTimeoutRef.current = setTimeout(() => setCopyError(null), 3000);
      });
  };

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
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

        {/* Header - Honest Note */}
        <div className="border-b border-clay-hairline pb-6 mb-8 animate-fade-in-up delay-75">
          <span className="text-xs font-bold uppercase tracking-wider text-clay-pink mb-2 block">Developer Note from a Fellow Med Student</span>
          <h1 className="font-rubik text-3xl md:text-5xl font-medium tracking-[-0.04em] text-clay-ink mb-4">
            Why is this a direct APK download?
          </h1>
          <p className="text-clay-muted text-xs md:text-sm leading-relaxed max-w-2xl">
            Let's be completely transparent: OpenMedQ is a 100% free project built in my spare time. I do not have the funds to publish this to the Google Play Store or Apple App Store right now, nor do I have the time to jump through their administrative hurdles while preparing for my upcoming professional exams.
          </p>
        </div>

        {/* The Reality Board (Play Store vs App Store vs Sideloading) */}
        <section className="bg-clay-surface-soft border border-clay-hairline rounded-clay-lg sm:rounded-clay-xl p-5 sm:p-6 md:p-8 mb-8 animate-fade-in-up delay-100">
          <h2 className="font-rubik text-base sm:text-lg font-semibold text-clay-ink tracking-tight mb-4 flex items-center gap-2">
            <Info className="w-5 h-5 text-clay-pink" />
            The Reality of App Store Publishing
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs sm:text-sm text-clay-body">
            <div className="space-y-2">
              <span className="font-bold text-clay-ink block">🤖 Google Play Store (Android)</span>
              <ul className="list-disc pl-4 space-y-1 text-clay-muted text-[11px] sm:text-xs">
                <li>Requires a <strong>$25 (approx ₹2,100)</strong> developer registration fee.</li>
                <li>Google now strictly mandates that new developers recruit <strong>20 independent testers</strong> to run the app continuously for <strong>14 days</strong> before it can be published.</li>
                <li>I don't have the time to organize a testing cohort while studying for exams.</li>
              </ul>
            </div>
            <div className="space-y-2">
              <span className="font-bold text-clay-ink block">🍏 Apple App Store (iOS/iPhone)</span>
              <ul className="list-disc pl-4 space-y-1 text-clay-muted text-[11px] sm:text-xs">
                <li>Requires a recurring fee of <strong>$99 🥲 (approx ₹8,200) every single year</strong>.</li>
                <li>Requires validating strict medical review guidelines and dedicated packaging hardware.</li>
                <li>As a student with zero income, paying over ₹8,000 yearly for a completely free app is simply not possible for me right now.</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Core Options Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10 animate-fade-in-up delay-150">

          {/* Android (APK) */}
          <div className="bg-clay-surface-soft border border-clay-hairline rounded-clay-xl p-6 flex flex-col justify-between hover:shadow-md transition-shadow duration-300">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-clay-md bg-clay-mint/15 text-clay-teal flex items-center justify-center">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-clay-teal uppercase tracking-wider block">Android Phone</span>
                  <h3 className="font-rubik font-semibold text-clay-ink text-base sm:text-lg">Install APK Directly</h3>
                </div>
              </div>
              <p className="text-xs text-clay-body leading-relaxed mb-6">
                You can download the app package directly and install it. It is 100% safe, clean, contains no tracking, and uses the exact same code as our website.
              </p>

              {/* SHA-256 Checksum block */}
              <div className="bg-clay-canvas border border-clay-hairline rounded-clay-md p-3 mb-6 relative">
                <span className="text-[9px] font-bold text-clay-muted uppercase tracking-wider block mb-1">
                  {copyError ? <span className="text-clay-coral font-semibold">{copyError}</span> : "File Integrity Hash (SHA-256)"}
                </span>
                <div className="flex items-center justify-between gap-2">
                  <code className="text-[10px] font-mono text-clay-ink break-all select-all block pr-8 line-clamp-1">
                    {hash}
                  </code>
                  <button
                    onClick={handleCopyHash}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-clay-muted hover:text-clay-ink transition-colors cursor-pointer"
                    title="Copy Checksum"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-clay-mint" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            <a
              href="https://cdn.openmedq.com/builds/openmedq-latest.apk"
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-clay-ink text-white hover:bg-neutral-800 dark:hover:bg-neutral-200 font-bold text-xs sm:text-sm rounded-clay-md transition-colors cursor-pointer text-center"
            >
              <Download className="w-4 h-4" />
              <span>Download Android APK</span>
            </a>
          </div>

          {/* iOS (iPhone/iPad) */}
          <div className="bg-clay-surface-soft border border-clay-hairline rounded-clay-xl p-6 flex flex-col justify-between hover:shadow-md transition-shadow duration-300">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-clay-md bg-clay-pink/10 text-clay-pink flex items-center justify-center">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-clay-pink uppercase tracking-wider block">iPhone / iPad</span>
                  <h3 className="font-rubik font-semibold text-clay-ink text-base sm:text-lg">Add to Home Screen (PWA)</h3>
                </div>
              </div>
              <p className="text-xs text-clay-body leading-relaxed mb-6">
                iOS does not permit direct file downloads without expensive profiles. Instead, you can add our Web App to your home screen. It works offline, syncs stats, and runs just like a normal app!
              </p>

              <div className="border border-clay-hairline bg-clay-canvas rounded-clay-md p-4 mb-6">
                <ol className="text-[11px] text-clay-body list-decimal pl-4 space-y-1.5 text-left">
                  <li>Open <strong>Safari</strong> on your iPhone and go to <code>openmedq.com</code></li>
                  <li>Tap the <strong>Share</strong> button (box with an arrow pointing up) at the bottom.</li>
                  <li>Scroll down and tap <strong>"Add to Home Screen"</strong>.</li>
                </ol>
              </div>
            </div>

            <button
              onClick={onBack}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-clay-canvas hover:bg-clay-surface-strong border border-clay-hairline text-clay-ink font-bold text-xs sm:text-sm rounded-clay-md transition-colors cursor-pointer"
            >
              <span>Back to Web Version</span>
            </button>
          </div>

        </div>

        {/* Installation Guide */}
        <section className="bg-clay-surface-soft border border-clay-hairline rounded-clay-lg sm:rounded-clay-xl p-6 mb-10 animate-fade-in-up delay-200">
          <div className="flex items-center gap-2 mb-6">
            <ShieldCheck className="w-5 h-5 text-clay-teal" />
            <h2 className="font-rubik text-base sm:text-lg font-semibold text-clay-ink tracking-tight">
              Android APK Sideloading Steps
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-clay-canvas border border-clay-hairline rounded-clay-md p-4">
              <span className="w-6 h-6 rounded-full bg-clay-surface-strong text-clay-ink text-[10px] font-bold flex items-center justify-center mb-3">1</span>
              <span className="text-xs font-semibold block mb-1">Download APK</span>
              <p className="text-[11px] text-clay-muted leading-relaxed">
                Click the download button above to get the installer file.
              </p>
            </div>

            <div className="bg-clay-canvas border border-clay-hairline rounded-clay-md p-4">
              <span className="w-6 h-6 rounded-full bg-clay-surface-strong text-clay-ink text-[10px] font-bold flex items-center justify-center mb-3">2</span>
              <span className="text-xs font-semibold block mb-1">Open File</span>
              <p className="text-[11px] text-clay-muted leading-relaxed">
                Open the downloaded file from your browser's history or Files app.
              </p>
            </div>

            <div className="bg-clay-canvas border border-clay-hairline rounded-clay-md p-4">
              <span className="w-6 h-6 rounded-full bg-clay-surface-strong text-clay-ink text-[10px] font-bold flex items-center justify-center mb-3">3</span>
              <span className="text-xs font-semibold block mb-1">Allow Settings</span>
              <p className="text-[11px] text-clay-muted leading-relaxed">
                If prompted, click Settings and toggle "Allow from this source" for Chrome/Files.
              </p>
            </div>

            <div className="bg-clay-canvas border border-clay-hairline rounded-clay-md p-4">
              <span className="w-6 h-6 rounded-full bg-clay-surface-strong text-clay-ink text-[10px] font-bold flex items-center justify-center mb-3">4</span>
              <span className="text-xs font-semibold block mb-1">Install & Practice</span>
              <p className="text-[11px] text-clay-muted leading-relaxed">
                Confirm the installation. Open the app, sign in, and study offline!
              </p>
            </div>
          </div>
        </section>

        {/* Security / FAQ Section */}
        <section className="border-t border-clay-hairline pt-10 animate-fade-in-up delay-250">
          <div className="flex items-center gap-2 mb-6">
            <HelpCircle className="w-5 h-5 text-clay-pink" />
            <h2 className="font-rubik text-base sm:text-lg font-semibold text-clay-ink tracking-tight">
              Security & Safety FAQ
            </h2>
          </div>

          <div className="space-y-6 text-xs sm:text-sm">
            <div className="bg-clay-surface-soft/40 border border-clay-hairline rounded-clay-md p-4 text-left">
              <span className="font-bold text-clay-ink block mb-1.5">🔒 Is this APK file safe for my device?</span>
              <p className="text-clay-body leading-relaxed">
                Yes, absolutely. The code is completely open-source (you can check the GitHub repo yourself). It contains no ads, no trackers, and no background processes. We provide the file hash above so you can double check the integrity of the downloaded file.
              </p>
            </div>

            <div className="bg-clay-surface-soft/40 border border-clay-hairline rounded-clay-md p-4 text-left">
              <span className="font-bold text-clay-ink block mb-1.5">⚠️ Why does Google show an "Unsafe App Blocked" or "Unknown Developer" warning?</span>
              <p className="text-clay-body leading-relaxed">
                Because the app is self-signed and distributed directly instead of through the Play Store, Android shows this alert by default. Click on "More details" and select <strong>"Install anyway"</strong> to bypass it.
              </p>
            </div>

            <div className="bg-clay-surface-soft/40 border border-clay-hairline rounded-clay-md p-4 text-left">
              <span className="font-bold text-clay-ink block mb-1.5">🔄 How do I update the app?</span>
              <p className="text-clay-body leading-relaxed">
                Whenever a new version is out, simply come back to this page and download the new APK. Install it directly over the old app. All your stats, offline database records, and streaks are safely preserved.
              </p>
            </div>
          </div>
        </section>

        {/* Footer info */}
        <div className="mt-16 pt-6 border-t border-clay-hairline flex flex-col sm:flex-row justify-between items-center gap-2 sm:gap-0 text-xs text-clay-muted">
          <span>© {new Date().getFullYear()} OpenMedQ</span>
          <span>Verified Student Distribution</span>
        </div>
      </div>
    </div>
  );
}
