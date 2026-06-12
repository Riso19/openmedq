import os
import re
import fitz

path = "/Users/sain/development/openmedq/data/NEET-PG-Recall-Questions-2025.pdf"
doc = fitz.open(path)

questions = []
current_subject = "General/Other"

SUBJECT_RE = re.compile(r'^(Anatomy|Physiology|Biochemistry|Pharmacology|Pathology|Microbiology|Forensic Medicine|Social & Preventive Medicine|PSM|Ophthalmology|ENT|General Medicine|General Surgery|Obstetrics & Gynecology|Pediatrics|Orthopedics|Orthopaedics|Dermatology|Skin|Psychiatry|Radiology|Anesthesia|Anaesthesia|Dental|Ortho|Derma|Obstetrics|Ophthal|Gynaecology & Obstetrics|Medicine|OBG|Surgery|Peds|PMR|FMT)$', re.IGNORECASE)

class Question:
    def __init__(self, subject, page_num):
        self.subject = subject
        self.page_num = page_num
        self.question_text_runs = []
        self.options = {
            'A': [],
            'B': [],
            'C': [],
            'D': []
        }
        self.option_bold = {
            'A': False,
            'B': False,
            'C': False,
            'D': False
        }
        self.current_option = None

q = None

# Regex to match: Q. or Q1. or Q.1. or Q. 1.
Q_START_RE = re.compile(r'^(Q\.\s*|Q\d+\.\s*|Q\.\s*\d+\.\s*)')

for p_idx in range(1, len(doc)): # Start from page 2 (index 1)
    page = doc[p_idx]
    page_num = p_idx + 1
    
    # Get spans on the page
    blocks = page.get_text("dict")["blocks"]
    for b in blocks:
        if "lines" in b:
            for l in b["lines"]:
                for s in l["spans"]:
                    text = s["text"]
                    font = s["font"]
                    is_bold = "bold" in font.lower()
                    
                    stripped = text.strip()
                    if not stripped:
                        continue
                        
                    # Check for subject heading
                    if len(stripped) < 40 and SUBJECT_RE.match(stripped):
                        current_subject = stripped
                        continue
                        
                    # Check for question start
                    q_match = Q_START_RE.match(stripped)
                    if q_match:
                        if q:
                            questions.append(q)
                        q = Question(current_subject, page_num)
                        q.current_option = None
                        
                        # Extract content after prefix
                        prefix = q_match.group(0)
                        content = stripped[len(prefix):].strip()
                        if content:
                            q.question_text_runs.append((content, is_bold))
                        continue
                        
                    if q:
                        # Check for option prefix: A., B., C., D. or 1., 2., 3., 4.
                        opt_match = re.match(r'^([A-D])\.\s*(.*)', stripped)
                        opt_num_match = re.match(r'^([1-4])\.\s*(.*)', stripped)
                        
                        if opt_match:
                            opt_label = opt_match.group(1)
                            rest = opt_match.group(2)
                            q.current_option = opt_label
                            if rest:
                                q.options[opt_label].append(rest)
                            if is_bold:
                                q.option_bold[opt_label] = True
                        elif opt_num_match:
                            num = int(opt_num_match.group(1))
                            opt_label = chr(ord('A') + num - 1)
                            rest = opt_num_match.group(2)
                            q.current_option = opt_label
                            if rest:
                                q.options[opt_label].append(rest)
                            if is_bold:
                                q.option_bold[opt_label] = True
                        elif q.current_option:
                            q.options[q.current_option].append(stripped)
                            if is_bold:
                                q.option_bold[q.current_option] = True
                        else:
                            q.question_text_runs.append((stripped, is_bold))

if q:
    questions.append(q)

print(f"Total parsed: {len(questions)}")
succeeded = 0
omitted = []

for idx, q in enumerate(questions):
    q_text = " ".join([r[0] for r in q.question_text_runs]).strip()
    opa = " ".join(q.options['A']).strip()
    opb = " ".join(q.options['B']).strip()
    opc = " ".join(q.options['C']).strip()
    opd = " ".join(q.options['D']).strip()
    
    # Identify correct option
    correct_option = None
    bold_labels = [label for label, bold in q.option_bold.items() if bold]
    if len(bold_labels) == 1:
        correct_option = bold_labels[0]
        
    # Validation
    if not q_text or not opa or not opb or not opc or not opd or correct_option is None:
        omitted.append((idx + 1, q.page_num, q.subject, q_text, bold_labels, [opa, opb, opc, opd]))
    else:
        succeeded += 1

print(f"Succeeded: {succeeded}")
print(f"Omitted: {len(omitted)}")
for num, page, sub, text, bolds, opts in omitted[:15]:
    print(f"\nOmitted Q #{num} on Page {page} | Subject: {sub}")
    print(f"  Text: {text[:150]}...")
    print(f"  Bolds detected: {bolds}")
    print(f"  Options: {opts}")
