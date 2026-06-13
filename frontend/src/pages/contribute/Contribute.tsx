import { useState, useMemo } from 'react';
import { 
  ArrowLeft, 
  Send, 
  Code, 
  CheckCircle, 
  GitPullRequest, 
  FileText, 
  AlertTriangle, 
  Download, 
  ChevronLeft, 
  ChevronRight,
  Eye
} from 'lucide-react';
import { MarkdownRenderer } from '../../components/MarkdownRenderer';
import { LocalImage } from '../../components/LocalImage';

interface ContributeProps {
  onBack: () => void;
}

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

interface SchemaError {
  index: number;
  field: string;
  message: string;
}

const DEFAULT_SAMPLE_JSON = `[
  {
    "id": 10001,
    "questionText": "A 45-year-old male presents with high fever, jaundice, and right upper quadrant pain (**Charcot's triad**). Which of the following is the most likely diagnosis?",
    "opa": "Acute Cholecystitis",
    "opb": "Acute Cholangitis",
    "opc": "Choledocholithiasis",
    "opd": "Biliary Colic",
    "correctOption": 1,
    "subjectId": 7,
    "topicId": 245,
    "examType": "NEET_PG",
    "examYear": 2025,
    "explanation": "**Charcot's triad** (fever, jaundice, RUQ pain) is highly specific for **acute cholangitis**, typically caused by biliary tract obstruction and bacterial infection. If altered mental status and hypotension are added, it becomes *Reynolds' pentad*.",
    "imageUrl": "https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=600&q=80"
  },
  {
    "id": 10002,
    "questionText": "An ECG shows ST-segment elevation in leads II, III, and aVF with reciprocal changes in I and aVL. Which coronary artery is most likely occluded?",
    "opa": "Left Anterior Descending (LAD)",
    "opb": "Right Coronary Artery (RCA)",
    "opc": "Left Circumflex (LCX)",
    "opd": "Left Main Coronary Artery",
    "correctOption": 1,
    "subjectId": 3,
    "topicId": 89,
    "examType": "INICET",
    "examYear": 2024,
    "explanation": "ST-segment elevation in inferior leads (II, III, aVF) is diagnostic of an inferior wall MI, most commonly caused by occlusion of the **Right Coronary Artery (RCA)**. Reciprocal ST depression is seen in lateral leads I and aVL.",
    "imageUrl": "https://images.unsplash.com/photo-1628348068343-c6a848d2b6dd?auto=format&fit=crop&w=600&q=80"
  },
  {
    "id": 10003,
    "questionText": "A patient presents with weakness in wrist extension ('wrist drop') after sleeping with their arm over the back of a chair. Which nerve structure is injured, and what is its typical cross-sectional anatomy?",
    "opa": "Radial nerve in the spiral groove",
    "opb": "Ulnar nerve at the medial epicondyle",
    "opc": "Median nerve in the carpal tunnel",
    "opd": "Axillary nerve at the surgical neck of the humerus",
    "correctOption": 0,
    "subjectId": 1,
    "topicId": 42,
    "examType": "NEET_PG",
    "examYear": 2024,
    "explanation": "Wrist drop is classic for **radial nerve compression** in the spiral groove (also known as 'Saturday night palsy'). The radial nerve arises from the posterior cord of the brachial plexus and innervates the triceps and wrist extensors.",
    "imageUrl": "https://images.unsplash.com/photo-1530210124550-912dc1381cb8?auto=format&fit=crop&w=600&q=80",
    "explanationImageUrl": "https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=600&q=80",
    "opaImageUrl": "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=300&q=80"
  }
]`;

export function Contribute({ onBack }: ContributeProps) {
  const [activeTab, setActiveTab] = useState<'validator' | 'preview'>('validator');
  const [jsonContent, setJsonContent] = useState<string>(DEFAULT_SAMPLE_JSON);
  const [previewIndex, setPreviewIndex] = useState<number>(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopyPrompt = () => {
    const promptText = `Convert the following medical multiple-choice questions (MCQs) into a raw JSON array matching this exact schema. Do not wrap the JSON in markdown code blocks or add any conversational text.

[
  {
    "id": 10001,
    "questionText": "Question text here. Use markdown like **bold** for clinical key terms.",
    "opa": "Option A text",
    "opb": "Option B text",
    "opc": "Option C text",
    "opd": "Option D text",
    "correctOption": 0,
    "subjectId": 1,
    "topicId": 1,
    "examType": "NEET_PG",
    "examYear": 2025,
    "explanation": "Detailed explanation of why the correct option is right. Use markdown like **bold**."
  }
]

Subject ID Reference Table:
1 = Anatomy
2 = Physiology
3 = Biochemistry
4 = Pathology
5 = Microbiology
6 = Pharmacology
7 = Forensic Medicine
8 = Social Preventive Medicine (SPM)
9 = Medicine
10 = Surgery
11 = OBG
12 = Pediatrics
13 = ENT
14 = Ophthalmology
15 = Dermatology
16 = Psychiatry
17 = Radiology
18 = Anesthesia
19 = Orthopedics

Here are the questions to convert:
[PASTE YOUR QUESTIONS/TEXT/PDF CONTENT HERE]`;
    navigator.clipboard.writeText(promptText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Validate the QBank JSON schema on modification
  const validationResult = useMemo(() => {
    if (!jsonContent.trim()) {
      return { isValid: false, parsedData: [], errors: [], syntaxError: "JSON content is empty." };
    }
    
    try {
      const data = JSON.parse(jsonContent);
      if (!Array.isArray(data)) {
        return { isValid: false, parsedData: [], errors: [], syntaxError: "Root must be a JSON array of questions: [ { ... } ]" };
      }
      
      const errors: SchemaError[] = [];
      data.forEach((item: any, index: number) => {
        // Validate ID
        if (typeof item.id !== 'number') {
          errors.push({ index, field: 'id', message: "Must be a unique number." });
        }
        
        // Validate questionText
        if (typeof item.questionText !== 'string' || item.questionText.trim() === '') {
          errors.push({ index, field: 'questionText', message: "Required. Must be a non-empty string." });
        }
        
        // Validate options
        ['opa', 'opb', 'opc', 'opd'].forEach((op) => {
          if (typeof item[op] !== 'string' || item[op].trim() === '') {
            errors.push({ index, field: op, message: `Option ${op.toUpperCase()} is required and must be a string.` });
          }
        });
        
        // Validate correctOption
        if (typeof item.correctOption !== 'number' || ![0, 1, 2, 3].includes(item.correctOption)) {
          errors.push({ index, field: 'correctOption', message: "Must be a number between 0 and 3 (0=A, 1=B, 2=C, 3=D)." });
        }
        
        // Validate subjectId
        if (typeof item.subjectId !== 'number') {
          errors.push({ index, field: 'subjectId', message: "Required. Must be a number corresponding to the subject." });
        }
        
        // Validate topicId
        if (typeof item.topicId !== 'number') {
          errors.push({ index, field: 'topicId', message: "Required. Must be a number corresponding to the sub-topic." });
        }
        
        // Validate explanation (optional)
        if (item.explanation !== undefined && typeof item.explanation !== 'string') {
          errors.push({ index, field: 'explanation', message: "If provided, must be a valid string." });
        }
        
        // Validate imageUrl (optional)
        if (item.imageUrl !== undefined && typeof item.imageUrl !== 'string') {
          errors.push({ index, field: 'imageUrl', message: "If provided, must be a valid string path." });
        }
        
        // Validate explanationImageUrl (optional)
        if (item.explanationImageUrl !== undefined && typeof item.explanationImageUrl !== 'string') {
          errors.push({ index, field: 'explanationImageUrl', message: "If provided, must be a valid string path." });
        }

        // Validate option image urls (optional)
        ['opaImageUrl', 'opbImageUrl', 'opcImageUrl', 'opdImageUrl'].forEach((opImg) => {
          if (item[opImg] !== undefined && typeof item[opImg] !== 'string') {
            errors.push({ index, field: opImg, message: `If provided, ${opImg} must be a valid string path.` });
          }
        });
      });
      
      return {
        isValid: errors.length === 0,
        parsedData: data as RawQuestion[],
        errors
      };
    } catch (err: any) {
      return {
        isValid: false,
        parsedData: [],
        errors: [],
        syntaxError: err.message || "Invalid JSON syntax."
      };
    }
  }, [jsonContent]);

  // Handle downloading validated JSON
  const handleDownload = () => {
    if (!validationResult.isValid) return;
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `openmedq_pack_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePrevQuestion = () => {
    setSelectedOption(null);
    setPreviewIndex((prev) => Math.max(0, prev - 1));
  };

  const handleNextQuestion = () => {
    setSelectedOption(null);
    setPreviewIndex((prev) => Math.min(validationResult.parsedData.length - 1, prev + 1));
  };

  const currentPreviewQuestion = validationResult.parsedData[previewIndex] || null;

  return (
    <div className="min-h-screen bg-clay-canvas text-clay-ink flex flex-col font-sans selection:bg-clay-pink/20 selection:text-clay-pink relative overflow-x-hidden p-4 sm:p-6 md:p-12">
      {/* Ambient background decorative blur */}
      <div className="absolute top-0 left-0 w-[50%] h-[50%] bg-clay-lavender/5 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="max-w-3xl mx-auto w-full relative z-10 text-left">
        {/* Back navigation */}
        <button 
          onClick={onBack}
          className="inline-flex items-center gap-2 text-clay-muted hover:text-clay-ink font-semibold text-sm mb-8 transition-colors duration-200 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </button>

        {/* Header */}
        <div className="border-b border-clay-hairline pb-6 mb-8">
          <span className="text-xs font-bold uppercase tracking-wider text-clay-pink mb-2 block">Built by a student, perfected by you</span>
          <h1 className="font-rubik text-3xl md:text-5xl font-medium tracking-[-0.04em] text-clay-ink mb-4">
            Let's Fix Medical Prep Together.
          </h1>
          <p className="text-clay-muted text-xs md:text-sm leading-relaxed">
            Hey, I'm a 3rd-year MBBS student. I got tired of standing on the clinical wards all day, coming back to my room exhausted, opening a question bank, and seeing paywalled questions with outdated clinical guidelines or annoying typos they never fix. I built OpenMedQ as a 100% free, open-source tool. No paywalls, no ads. But I can't keep this entire database updated on my own between my hospital rotations. If you spot a mistake or want to contribute new clinical vignettes, please join in. It keeps all of us from memorizing wrong facts at 3 AM.
          </p>
        </div>

        <div className="space-y-10">
          {/* Section 1: Telegram Submissions */}
          <section className="bg-white border border-clay-hairline rounded-clay-lg sm:rounded-clay-xl p-4 sm:p-6 md:p-8 relative overflow-hidden transition-all duration-300 hover-clay-card">
            <div className="flex flex-col sm:flex-row gap-4 items-start">
              <div className="w-10 h-10 rounded-clay-md bg-[#229ED9]/10 text-[#229ED9] flex items-center justify-center shrink-0">
                <Send className="w-5 h-5 fill-current" />
              </div>
              <div className="flex-1 min-w-0 w-full">
                <h2 className="font-rubik text-xl font-semibold text-clay-ink tracking-tight mb-2">
                  1. Report a Correction
                </h2>
                <p className="text-clay-body text-xs sm:text-sm leading-relaxed mb-4">
                  Spotted a typo, an outdated drug dose, or a wrong answer key? Reporting it takes about 15 seconds:
                </p>
                
                <div className="bg-clay-canvas border border-clay-hairline rounded-clay-md p-4 mb-6">
                  <ul className="space-y-3 text-xs sm:text-sm text-clay-body">
                    <li className="flex gap-2 items-start">
                      <CheckCircle className="w-4.5 h-4.5 text-clay-mint shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0 text-left">
                        <strong>Take a Screenshot:</strong> Just take a screenshot of the question card containing the error while you are practicing.
                      </div>
                    </li>
                    <li className="flex gap-2 items-start">
                      <CheckCircle className="w-4.5 h-4.5 text-clay-mint shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0 text-left">
                        <strong>Post it in Telegram:</strong> Click below to join our Telegram group. Send the screenshot, mention what needs to be fixed, and <MarkdownRenderer content="cite a textbook source (e.g. *Robbins Pathology 10th Ed, Page 45*) so I can double-check it." inline />
                      </div>
                    </li>
                    <li className="flex gap-2 items-start">
                      <CheckCircle className="w-4.5 h-4.5 text-clay-mint shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0 text-left">
                        <strong>Live Update:</strong> A moderator will verify the correction and update the database, pushing the fix out to everyone instantly.
                      </div>
                    </li>
                  </ul>
                </div>

                <a 
                  href="https://t.me/openmedq" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#229ED9] hover:bg-[#1e8ec3] text-white font-bold text-xs sm:text-sm rounded-clay-md transition-colors"
                >
                  <Send className="w-4 h-4 fill-current" />
                  <span>Join Telegram Group (t.me/openmedq)</span>
                </a>
              </div>
            </div>
          </section>

          {/* Section 2: Codebase Contributions */}
          <section className="bg-white border border-clay-hairline rounded-clay-lg sm:rounded-clay-xl p-4 sm:p-6 md:p-8 relative overflow-hidden transition-all duration-300 hover-clay-card">
            <div className="flex flex-col sm:flex-row gap-4 items-start">
              <div className="w-10 h-10 rounded-clay-md bg-neutral-100 text-neutral-900 flex items-center justify-center shrink-0">
                <Code className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0 w-full">
                <h2 className="font-rubik text-xl font-semibold text-clay-ink tracking-tight mb-2">
                  2. Contribute Code on GitHub
                </h2>
                <p className="text-clay-body text-xs sm:text-sm leading-relaxed mb-4">
                  If you're a medical student who writes code or an open-source dev, come help me build. You'll be credited directly as a builder in the app.
                </p>

                <div className="bg-clay-canvas border border-clay-hairline rounded-clay-md p-4 mb-6">
                  <span className="text-xs font-bold uppercase tracking-wider text-clay-ink block mb-2">GitHub Workflow:</span>
                  <ul className="space-y-2 text-xs sm:text-sm text-clay-body">
                    <li className="flex gap-2 items-start">
                      <CheckCircle className="w-4.5 h-4.5 text-clay-mint shrink-0 mt-0.5" />
                      <span>Fork the repo at <a href="https://github.com/Riso19/openmedq" target="_blank" rel="noopener noreferrer" className="text-clay-pink hover:underline font-semibold">github.com/Riso19/openmedq</a>.</span>
                    </li>
                    <li className="flex gap-2 items-start">
                      <CheckCircle className="w-4.5 h-4.5 text-clay-mint shrink-0 mt-0.5" />
                      <span>Check out open issues, make your edits on a new branch, and commit.</span>
                    </li>
                    <li className="flex gap-2 items-start">
                      <CheckCircle className="w-4.5 h-4.5 text-clay-mint shrink-0 mt-0.5" />
                      <span>Open a Pull Request. I will review and merge it.</span>
                    </li>
                  </ul>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                  <div className="border border-clay-hairline rounded-clay-md p-4 text-left">
                    <span className="text-xs font-bold uppercase tracking-wider text-clay-pink block mb-1">Frontend Stack</span>
                    <span className="text-xs text-clay-muted">Vite, React 19, TypeScript, Tailwind CSS, Dexie (IndexedDB)</span>
                  </div>
                  <div className="border border-clay-hairline rounded-clay-md p-4 text-left">
                    <span className="text-xs font-bold uppercase tracking-wider text-clay-pink block mb-1">Backend & Mobile</span>
                    <span className="text-xs text-clay-muted">Hono, Cloudflare Workers & D1, React Native, Expo SQLite</span>
                  </div>
                </div>

                <a 
                  href="https://github.com/Riso19/openmedq" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs sm:text-sm rounded-clay-md transition-colors"
                >
                  <GitPullRequest className="w-4 h-4" />
                  <span>Open GitHub Repository</span>
                </a>
              </div>
            </div>
          </section>

          {/* Section 3: Interactive MCQ Playground & Schema Validator */}
          <section className="bg-white border border-clay-hairline rounded-clay-lg sm:rounded-clay-xl p-4 sm:p-6 md:p-8 relative overflow-hidden transition-all duration-300 hover-clay-card text-left">
            <div className="flex flex-col sm:flex-row gap-4 items-start">
              <div className="w-10 h-10 rounded-clay-md bg-clay-mint/15 text-clay-mint flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0 w-full">
                <h2 className="font-rubik text-xl font-semibold text-clay-ink tracking-tight mb-2">
                  3. Create and Author Custom MCQ Packs
                </h2>
                <p className="text-clay-body text-xs sm:text-sm leading-relaxed mb-4">
                  Want to add recall question blocks from recent exams or your own clinical study notes? Use the editor below to draft and validate them.
                </p>

                <div className="bg-clay-canvas border border-clay-hairline rounded-clay-md p-4 mb-6 text-xs sm:text-sm text-clay-body">
                  <span className="text-xs font-bold uppercase tracking-wider text-clay-ink block mb-2">How to format your questions using AI:</span>
                  <ol className="space-y-2 list-decimal pl-4 mb-4">
                    <li>Click the button below to copy the AI formatting prompt.</li>
                    <li>Paste it into ChatGPT, Gemini, or Claude, and copy-paste your raw questions or upload your PDFs.</li>
                    <li>Copy the AI's generated JSON text and paste it into the <strong>JSON Schema Editor</strong> below.</li>
                    <li>Check the <strong>Live Render Preview</strong> tab to see how they render, then click <strong>Export Pack</strong> to download the validated file.</li>
                    <li>Drop the exported <code>.json</code> file in our <strong>Telegram Group (https://t.me/openmedq)</strong>.</li>
                  </ol>
                  
                  <button
                    onClick={handleCopyPrompt}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-clay-surface-soft hover:bg-clay-surface-strong border border-clay-hairline text-clay-ink rounded-clay-md text-xs font-semibold shadow-sm transition-all duration-200 cursor-pointer"
                  >
                    {copied ? (
                      <>
                        <CheckCircle className="w-3.5 h-3.5 text-clay-mint" />
                        <span>Prompt Copied!</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5" />
                        <span>Copy AI Formatting Prompt</span>
                      </>
                    )}
                  </button>

                  <div className="mt-4 pt-4 border-t border-clay-hairline text-[11px] text-clay-muted">
                    <span className="font-bold text-clay-pink block mb-1">🚀 Future Plan: Peer-to-Peer Sharing Community</span>
                    We are actively building a QBank Sharing Portal (Tier 1 of our roadmap). Once live, you will be able to upload your custom JSON packs directly to the app for immediate peer download, rating, and quality-controlled feedback. Until then, please send your exported packs to our Telegram group!
                  </div>
                </div>

                {/* Tab Switcher */}
                <div className="flex border-b border-clay-hairline mb-5 gap-4">
                  <button 
                    onClick={() => setActiveTab('validator')}
                    className={`pb-2.5 font-bold text-xs uppercase tracking-wider transition-colors duration-200 relative cursor-pointer ${
                      activeTab === 'validator' ? 'text-clay-pink border-b-2 border-clay-pink' : 'text-clay-muted hover:text-clay-ink'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <Code className="w-3.5 h-3.5" />
                      JSON Schema Editor
                    </span>
                  </button>
                  <button 
                    onClick={() => {
                      if (validationResult.parsedData.length > 0) {
                        setActiveTab('preview');
                        setPreviewIndex(0);
                        setSelectedOption(null);
                      }
                    }}
                    disabled={validationResult.parsedData.length === 0}
                    className={`pb-2.5 font-bold text-xs uppercase tracking-wider transition-colors duration-200 relative cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                      activeTab === 'preview' ? 'text-clay-pink border-b-2 border-clay-pink' : 'text-clay-muted hover:text-clay-ink'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5" />
                      Live Render Preview ({validationResult.parsedData.length})
                    </span>
                  </button>
                </div>

                {/* TAB 1: JSON Schema Editor */}
                {activeTab === 'validator' && (
                  <div className="space-y-4 animate-fade-in-up">
                    <div className="relative">
                      <textarea
                        value={jsonContent}
                        onChange={(e) => setJsonContent(e.target.value)}
                        placeholder="Paste your JSON question pack array here..."
                        spellCheck={false}
                        className="w-full h-80 bg-clay-canvas border border-clay-hairline rounded-clay-lg p-4 font-mono text-xs text-clay-ink focus:border-clay-pink focus:outline-none leading-relaxed resize-y overflow-auto"
                      />
                      
                      {/* Floating actions */}
                      <div className="absolute right-3 bottom-3 flex gap-2">
                        <button
                          onClick={() => setJsonContent(DEFAULT_SAMPLE_JSON)}
                          className="px-3 py-1.5 bg-clay-surface-strong hover:bg-neutral-200 text-clay-ink font-bold text-[10px] uppercase tracking-wider rounded-clay-md border border-clay-hairline transition-colors cursor-pointer"
                        >
                          Load Valid Example
                        </button>
                        <button
                          onClick={handleDownload}
                          disabled={!validationResult.isValid}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-clay-pink hover:bg-rose-600 disabled:bg-clay-surface-strong disabled:text-clay-muted disabled:border-transparent text-white font-bold text-[10px] uppercase tracking-wider rounded-clay-md transition-colors cursor-pointer"
                        >
                          <Download className="w-3 h-3" />
                          <span>Export Pack</span>
                        </button>
                      </div>
                    </div>

                    {/* Validation Panel */}
                    <div className="mt-4">
                      {validationResult.syntaxError && (
                        <div className="bg-clay-pink/10 border border-clay-pink/20 rounded-clay-md p-4 text-xs flex gap-2.5 items-start text-left">
                          <AlertTriangle className="w-4.5 h-4.5 text-clay-pink shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold text-clay-pink block mb-1">JSON Syntax Error</span>
                            <span className="text-clay-body font-mono block whitespace-pre-wrap">{validationResult.syntaxError}</span>
                          </div>
                        </div>
                      )}

                      {!validationResult.syntaxError && validationResult.errors.length > 0 && (
                        <div className="bg-clay-ochre/10 border border-clay-ochre/20 rounded-clay-md p-4 text-xs flex gap-2.5 items-start text-left max-h-60 overflow-y-auto">
                          <AlertTriangle className="w-4.5 h-4.5 text-clay-ochre shrink-0 mt-0.5" />
                          <div className="w-full">
                            <span className="font-bold text-clay-ochre block mb-1">Schema Validation Mismatch ({validationResult.errors.length} errors found)</span>
                            <ul className="space-y-1.5 list-disc pl-4 mt-2 font-mono text-[11px] text-clay-body">
                              {validationResult.errors.slice(0, 10).map((err, i) => (
                                <li key={i}>
                                  Question [{err.index}] field <code className="bg-clay-canvas px-1 rounded font-bold text-clay-ink">{err.field}</code>: {err.message}
                                </li>
                              ))}
                              {validationResult.errors.length > 10 && (
                                <li className="list-none italic pt-1 text-clay-muted">...and {validationResult.errors.length - 10} more errors.</li>
                              )}
                            </ul>
                          </div>
                        </div>
                      )}

                      {!validationResult.syntaxError && validationResult.errors.length === 0 && (
                        <div className="bg-clay-mint/15 border border-clay-mint/30 rounded-clay-md p-4 text-xs flex gap-2.5 items-start text-left">
                          <CheckCircle className="w-4.5 h-4.5 text-clay-teal shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold text-clay-teal block mb-1">Question Pack Verified!</span>
                            <span className="text-clay-body">0 errors detected. Feel free to preview how this renders in the <strong>Live Render Preview</strong> tab, or click <strong>Export Pack</strong> to save it as a JSON file to submit via Telegram/GitHub.</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Metadata property table */}
                    <div className="bg-clay-surface-soft border border-clay-hairline rounded-clay-lg p-4 mt-6">
                      <span className="text-xs font-bold uppercase tracking-wider text-clay-ink block mb-3">Field Dictionary & Types:</span>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-xs leading-relaxed text-clay-body">
                        <div>
                          <p>• <strong>id</strong> <code className="font-mono text-clay-ink bg-clay-canvas px-1 rounded">number</code>: Unique identifier (no collisions).</p>
                          <p>• <strong>questionText</strong> <code className="font-mono text-clay-ink bg-clay-canvas px-1 rounded">string</code>: Clinical case vignette (supports <strong>markdown</strong>).</p>
                          <p>• <strong>opa, opb, opc, opd</strong> <code className="font-mono text-clay-ink bg-clay-canvas px-1 rounded">string</code>: Core options A, B, C, and D.</p>
                          <p>• <strong>correctOption</strong> <code className="font-mono text-clay-ink bg-clay-canvas px-1 rounded">number</code>: <strong>0-indexed</strong> answer (<code className="font-mono text-clay-ink bg-clay-canvas px-1.5 py-0.5 rounded">0</code>=A, <code className="font-mono text-clay-ink bg-clay-canvas px-1.5 py-0.5 rounded">1</code>=B, etc.).</p>
                          <p>• <strong>explanation</strong> <code className="font-mono text-clay-ink bg-clay-canvas px-1 rounded">string (opt)</code>: Rationale for differential diagnosis (supports <strong>markdown</strong>).</p>
                        </div>
                        <div>
                          <p>• <strong>subjectId</strong> <code className="font-mono text-clay-ink bg-clay-canvas px-1 rounded">number</code>: Subject index (Anatomy=1, Surgery=7, etc.).</p>
                          <p>• <strong>topicId</strong> <code className="font-mono text-clay-ink bg-clay-canvas px-1 rounded">number</code>: Sub-topic category index.</p>
                          <p>• <strong>imageUrl</strong> <code className="font-mono text-clay-ink bg-clay-canvas px-1 rounded">string (opt)</code>: Vignette main illustration path.</p>
                          <p>• <strong>explanationImageUrl</strong> <code className="font-mono text-clay-ink bg-clay-canvas px-1 rounded">string (opt)</code>: Explanation illustration path.</p>
                          <p>• <strong>opaImageUrl, opbImageUrl, opcImageUrl, opdImageUrl</strong> <code className="font-mono text-clay-ink bg-clay-canvas px-1 rounded">string (opt)</code>: Option specific illustrations.</p>
                        </div>
                      </div>

                      {/* Image URL Guide / Examples */}
                      <div className="mt-4 pt-4 border-t border-clay-hairline text-xs">
                        <span className="text-xs font-bold uppercase tracking-wider text-clay-ink block mb-2 font-semibold">Image URL & Path Examples:</span>
                        <div className="space-y-3">
                          <div>
                            <span className="font-semibold text-clay-pink block mb-1">1. Absolute Remote Web URLs (Recommended for initial draft uploads):</span>
                            <p className="text-clay-muted mb-1">Direct web links from a public server or image host. Perfect for testing vignettes with external assets.</p>
                            <code className="block bg-clay-canvas border border-clay-hairline p-1.5 rounded text-[10px] text-clay-ink font-mono whitespace-pre overflow-x-auto">
                              "imageUrl": "https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=600&q=80"
                            </code>
                          </div>
                          <div>
                            <span className="font-semibold text-clay-pink block mb-1">2. Relative CDN/Storage Paths (Recommended for production integration):</span>
                            <p className="text-clay-muted mb-1">Paths within the OpenMedQ Cloudflare R2 bucket. Rebuilt automatically and downloaded for local offline caching in IndexedDB.</p>
                            <code className="block bg-clay-canvas border border-clay-hairline p-1.5 rounded text-[10px] text-clay-ink font-mono whitespace-pre overflow-x-auto">
                              "imageUrl": "images/cardio/inferior_mi_ecg.png"
                            </code>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: Live Render Preview */}
                {activeTab === 'preview' && currentPreviewQuestion && (
                  <div className="space-y-6 animate-fade-in-up">
                    {/* Index Navigator */}
                    <div className="flex justify-between items-center bg-clay-canvas border border-clay-hairline rounded-clay-md px-4 py-2 text-xs">
                      <span className="font-bold text-clay-muted">
                        PREVIEWING QUESTION {previewIndex + 1} OF {validationResult.parsedData.length}
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={handlePrevQuestion}
                          disabled={previewIndex === 0}
                          className="p-1 rounded hover:bg-clay-surface-strong disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        >
                          <ChevronLeft className="w-5 h-5" />
                        </button>
                        <button
                          onClick={handleNextQuestion}
                          disabled={previewIndex === validationResult.parsedData.length - 1}
                          className="p-1 rounded hover:bg-clay-surface-strong disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        >
                          <ChevronRight className="w-5 h-5" />
                        </button>
                      </div>
                    </div>

                    {/* Practice Suite MCQ Card Mockup */}
                    <div className="bg-clay-canvas border border-clay-hairline rounded-clay-lg p-5 sm:p-6 text-left relative">
                      {/* Meta header */}
                      <div className="flex flex-wrap items-center gap-2 mb-4">
                        <span className="px-2 py-0.5 bg-clay-surface-strong text-clay-muted rounded font-bold text-[9px] uppercase tracking-wider">
                          Subject ID: {currentPreviewQuestion.subjectId}
                        </span>
                        <span className="px-2 py-0.5 bg-clay-surface-strong text-clay-muted rounded font-bold text-[9px] uppercase tracking-wider">
                          Topic ID: {currentPreviewQuestion.topicId}
                        </span>
                        {(currentPreviewQuestion.examType || currentPreviewQuestion.examYear) && (
                          <span className="px-2 py-0.5 bg-clay-pink/10 text-clay-pink rounded font-bold text-[9px] uppercase tracking-wider border border-clay-pink/20">
                            {currentPreviewQuestion.examType || 'EXAM'} {currentPreviewQuestion.examYear || ''}
                          </span>
                        )}
                        <span className="px-2 py-0.5 bg-clay-mint/15 text-clay-teal rounded font-bold text-[9px] uppercase tracking-wider border border-clay-mint/25 ml-auto">
                          ID: #{currentPreviewQuestion.id}
                        </span>
                      </div>

                      {/* Clinical Vignette text */}
                      <div className="font-sans text-sm md:text-base leading-relaxed text-clay-ink mb-6">
                        <MarkdownRenderer content={currentPreviewQuestion.questionText} />
                      </div>

                      {/* Question image illustration if specified */}
                      {currentPreviewQuestion.imageUrl && (
                        <div className="mb-6 rounded-clay-lg overflow-hidden border border-clay-hairline bg-clay-surface-soft max-h-[300px] flex justify-center items-center">
                          <LocalImage 
                            srcPath={currentPreviewQuestion.imageUrl} 
                            alt="Question illustration" 
                            className="max-h-[300px] object-contain" 
                          />
                        </div>
                      )}

                      {/* Options */}
                      <div className="space-y-3">
                        {[
                          { key: 'a', text: currentPreviewQuestion.opa, idx: 0, img: currentPreviewQuestion.opaImageUrl },
                          { key: 'b', text: currentPreviewQuestion.opb, idx: 1, img: currentPreviewQuestion.opbImageUrl },
                          { key: 'c', text: currentPreviewQuestion.opc, idx: 2, img: currentPreviewQuestion.opcImageUrl },
                          { key: 'd', text: currentPreviewQuestion.opd, idx: 3, img: currentPreviewQuestion.opdImageUrl }
                        ].map((opt) => {
                          const isCorrect = opt.idx === currentPreviewQuestion.correctOption;
                          const isSelected = opt.idx === selectedOption;

                          let borderClass = "border-clay-hairline";
                          let bgClass = "bg-white";
                          let textClass = "text-clay-body";
                          
                          if (selectedOption === null) {
                            borderClass += " hover:bg-clay-surface-soft";
                          } else {
                            if (isCorrect) {
                              borderClass = "border-clay-mint ring-2 ring-clay-mint/10";
                              bgClass = "bg-clay-mint/15";
                              textClass = "text-clay-teal font-medium";
                            } else if (isSelected) {
                              borderClass = "border-clay-coral ring-2 ring-clay-coral/10";
                              bgClass = "bg-clay-coral/15";
                              textClass = "text-clay-coral font-medium";
                            }
                          }

                          return (
                            <button
                              key={opt.key}
                              disabled={selectedOption !== null}
                              onClick={() => {
                                if (selectedOption === null) setSelectedOption(opt.idx);
                              }}
                              className={`w-full border rounded-clay-md text-left transition-all duration-200 flex flex-col gap-2 p-3 ${
                                selectedOption === null ? 'cursor-pointer' : 'cursor-default'
                              } ${borderClass} ${bgClass}`}
                            >
                              <div className={`w-full text-left text-xs sm:text-sm flex items-center gap-3 ${textClass}`}>
                                <span className="w-5 h-5 rounded-full border border-current flex items-center justify-center shrink-0 text-[10px] font-bold font-mono">
                                  {opt.key.toUpperCase()}
                                </span>
                                <span className="flex-1">
                                  <MarkdownRenderer content={opt.text} inline />
                                </span>
                              </div>
                              {opt.img && (
                                <div className="ml-8 rounded-clay-md overflow-hidden border border-clay-hairline max-h-[120px] flex justify-start bg-clay-surface-soft max-w-[200px]">
                                  <LocalImage 
                                    srcPath={opt.img} 
                                    alt={`Option ${opt.key.toUpperCase()} illustration`} 
                                    className="max-h-[120px] object-contain" 
                                  />
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* Reset answer button */}
                      {selectedOption !== null && (
                        <button
                          onClick={() => setSelectedOption(null)}
                          className="mt-4 text-xs font-semibold text-clay-pink hover:text-rose-600 transition-colors cursor-pointer"
                        >
                          Clear selection and try again
                        </button>
                      )}

                      {/* Explanation Segment */}
                      {selectedOption !== null && currentPreviewQuestion.explanation && (
                        <div className="mt-6 pt-5 border-t border-clay-hairline animate-fade-in-up">
                          <span className="text-xs font-bold uppercase tracking-wider text-clay-pink block mb-2">Clinical Explanation:</span>
                          <div className="bg-clay-surface-soft border border-clay-hairline rounded-clay-md p-4 text-xs sm:text-sm text-clay-body leading-relaxed flex flex-col gap-3">
                            <MarkdownRenderer content={currentPreviewQuestion.explanation} />
                            
                            {currentPreviewQuestion.explanationImageUrl && (
                              <div className="mt-2 rounded-clay-md overflow-hidden border border-clay-hairline bg-clay-canvas max-h-[200px] flex justify-start max-w-[300px]">
                                <LocalImage 
                                  srcPath={currentPreviewQuestion.explanationImageUrl} 
                                  alt="Explanation illustration" 
                                  className="max-h-[200px] object-contain" 
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>



        </div>

        {/* Footer info */}
        <div className="mt-12 pt-6 border-t border-clay-hairline flex flex-col sm:flex-row justify-between items-center gap-2 sm:gap-0 text-xs text-clay-muted">
          <span>© {new Date().getFullYear()} OpenMedQ</span>
          <span>Open Source MIT License</span>
        </div>
      </div>
    </div>
  );
}
