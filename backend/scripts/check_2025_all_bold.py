import os
import re
from pypdf import PdfReader

path = "/Users/sain/development/openmedq/data/NEET-PG-Recall-Questions-2025.pdf"
reader = PdfReader(path)

# Let's extract text and font info for all pages
questions_with_bold = []
questions_without_bold = []
current_subject = "Unknown"

# Regex to detect subjects
SUBJECT_RE = re.compile(r'^(Anatomy|Physiology|Biochemistry|Pharmacology|Pathology|Microbiology|Forensic Medicine|Social & Preventive Medicine|PSM|Ophthalmology|ENT|General Medicine|General Surgery|Obstetrics & Gynecology|Pediatrics|Orthopedics|Orthopaedics|Dermatology|Skin|Psychiatry|Radiology|Anesthesia|Anaesthesia|Dental|Ortho|Derma|Obstetrics|Ophthal|Gynaecology & Obstetrics)$', re.IGNORECASE)

class QuestionBuilder:
    def __init__(self, subject):
        self.subject = subject
        self.text_runs = []

builder = None
all_builders = []

def visitor(text, cm, tm, fontDict, fontSize):
    global builder, current_subject
    if not text.strip():
        return
    
    font_name = fontDict.get('/BaseFont', 'Unknown') if fontDict else 'Unknown'
    is_bold = "bold" in font_name.lower()
    
    stripped = text.strip()
    
    # Check if this line is a subject heading
    if len(stripped) < 40 and SUBJECT_RE.match(stripped):
        current_subject = stripped
        return
        
    # Check if a new question starts
    # Usually starts with "Q. " or "Ques No:" or similar. In 2025 PDF, it starts with "Q." or "Ques"
    if stripped.startswith("Q.") or stripped.startswith("Q "):
        if builder:
            all_builders.append(builder)
        builder = QuestionBuilder(current_subject)
        
    if builder:
        builder.text_runs.append((text, is_bold))

for page in reader.pages:
    page.extract_text(visitor_text=visitor)

if builder:
    all_builders.append(builder)

print(f"Total parsed question structures: {len(all_builders)}")

bold_counts = 0
no_bold_counts = 0

for idx, qb in enumerate(all_builders):
    # Let's inspect the text runs to identify options (usually start with A., B., C., D. or 1., 2., 3., 4.)
    # and whether they are bold
    options = []
    bold_options = []
    
    # Simple option detector
    full_text = "".join([r[0] for r in qb.text_runs])
    
    # Find option prefixes
    # We can walk the runs
    current_option_label = None
    current_option_text = []
    current_option_bold = False
    
    for text, is_bold in qb.text_runs:
        stripped = text.strip()
        # Check if it looks like an option label: A., B., C., D. or 1., 2., 3., 4.
        if len(stripped) <= 3 and (re.match(r'^[A-D]\.$', stripped) or re.match(r'^[1-4]\.$', stripped)):
            if current_option_label:
                options.append((current_option_label, "".join(current_option_text).strip(), current_option_bold))
            current_option_label = stripped[0]
            current_option_text = []
            current_option_bold = is_bold
        elif current_option_label:
            current_option_text.append(text)
            if is_bold:
                current_option_bold = True
                
    if current_option_label:
        options.append((current_option_label, "".join(current_option_text).strip(), current_option_bold))
        
    # Check if any option is bold
    bold_opts = [opt for opt in options if opt[2]]
    if bold_opts:
        bold_counts += 1
        questions_with_bold.append((idx, qb, options, bold_opts))
    else:
        no_bold_counts += 1
        questions_without_bold.append((idx, qb, options))

print(f"Questions with bold options: {bold_counts}")
print(f"Questions without bold options: {no_bold_counts}")

print("\nSample questions WITHOUT bold options:")
for idx, qb, options in questions_without_bold[:5]:
    text_preview = "".join([r[0] for r in qb.text_runs[:10]])
    print(f"Index {idx} | Subject: {qb.subject}")
    print(f"Text: {text_preview[:200]}...")
    print(f"Options detected: {options}")
    print("-" * 30)
