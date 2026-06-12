import os
import re
import fitz

path = "/Users/sain/development/openmedq/data/NEET-PG-PYQs-2024.pdf"
doc = fitz.open(path)

# Let's extract all lines
all_lines = []
for p_idx in range(len(doc)):
    page = doc[p_idx]
    page_num = p_idx + 1
    blocks = page.get_text("blocks")
    blocks.sort(key=lambda b: (b[1], b[0]))
    for b in blocks:
        text = b[4]
        for line in text.split("\n"):
            # Replace zero-width spaces and other weird characters
            cleaned_line = line.replace('\u200b', '').replace('\u200e', '').replace('\u200f', '').replace('\ufeff', '').strip()
            if cleaned_line:
                all_lines.append((cleaned_line, page_num))

print(f"Total lines: {len(all_lines)}")

questions = []
q = None
current_field = None
current_subject = "General/Other"
current_topic = "General Practice"

SUBJECT_MAP_2024 = {
    'anatomy': 'Anatomy',
    'physiology': 'Physiology',
    'biochemistry': 'Biochemistry',
    'pharmacology': 'Pharmacology',
    'pathology': 'Pathology',
    'microbiology': 'Microbiology',
    'forensic medicine': 'Forensic Medicine',
    'preventive & social medicine': 'Social & Preventive Medicine',
    'preventive and social medicine': 'Social & Preventive Medicine',
    'social & preventive medicine': 'Social & Preventive Medicine',
    'psm': 'Social & Preventive Medicine',
    'ophthalmology': 'Ophthalmology',
    'ent': 'ENT',
    'ear': 'ENT',
    'medicine': 'General Medicine',
    'general medicine': 'General Medicine',
    'surgery': 'General Surgery',
    'general surgery': 'General Surgery',
    'obstetrics & gynecology': 'Obstetrics & Gynecology',
    'obstetrics and gynecology': 'Obstetrics & Gynecology',
    'gynaecology & obstetrics': 'Obstetrics & Gynecology',
    'gynecology': 'Obstetrics & Gynecology',
    'obstetrics': 'Obstetrics & Gynecology',
    'o&g': 'Obstetrics & Gynecology',
    'pediatrics': 'Pediatrics',
    'orthopedics': 'Orthopedics',
    'orthopaedics': 'Orthopedics',
    'ortho': 'Orthopedics',
    'dermatology': 'Dermatology',
    'derma': 'Dermatology',
    'skin': 'Dermatology',
    'psychiatry': 'Psychiatry',
    'radiology': 'Radiology',
    'anesthesia': 'Anesthesia',
    'anaesthesia': 'Anesthesia',
    'dental': 'Dental'
}

Q_START_RE = re.compile(r'^Q\.\s*(\d+)\.', re.IGNORECASE)

for line, page in all_lines:
    stripped = line.strip()
    
    # Check if line is a subject heading
    if len(stripped) < 40 and stripped.lower() in SUBJECT_MAP_2024:
        current_subject = SUBJECT_MAP_2024[stripped.lower()]
        continue
        
    # Check if line is a topic heading
    if stripped.lower().startswith("topic:"):
        current_topic = stripped[6:].strip()
        continue
        
    # Check if a new question starts
    q_match = Q_START_RE.match(stripped)
    if q_match:
        if q:
            questions.append(q)
        q = {
            'id_in_pdf': q_match.group(1),
            'page': page,
            'subject': current_subject,
            'topic': current_topic,
            'question_text': [],
            'opa': [],
            'opb': [],
            'opc': [],
            'opd': [],
            'correct_answer_text': None,
            'correctOption': None
        }
        current_field = 'question_text'
        content = stripped[len(q_match.group(0)):].strip()
        if content:
            q['question_text'].append(content)
        continue
        
    if q:
        # Check for option prefix: 1., 2., 3., 4.
        # Now that ZWSP is removed, \s* or \s+ should work
        if re.search(r'^[1-4]\.\s*', stripped) or re.search(r'\s+[1-4]\.\s*', stripped):
            # Split line by option prefixes
            parts = re.split(r'([1-4]\.\s*)', stripped)
            # parts will be like: ['', '1. ', 'Option A text', '2. ', 'Option B text']
            i = 1
            while i < len(parts):
                prefix = parts[i].strip()
                val = parts[i+1].strip() if i+1 < len(parts) else ""
                opt_idx = int(prefix[0])
                field_map = {1: 'opa', 2: 'opb', 3: 'opc', 4: 'opd'}
                q[field_map[opt_idx]].append(val)
                current_field = field_map[opt_idx]
                i += 2
        elif stripped.lower().startswith("correct answer:"):
            current_field = 'correct_answer_text'
            q['correct_answer_text'] = stripped[15:].strip()
        else:
            if current_field == 'question_text':
                if not any(header in stripped for header in ["PrepLadder", "NEET", "PYQS", "2024"]):
                    q['question_text'].append(stripped)
            elif current_field in ['opa', 'opb', 'opc', 'opd']:
                q[current_field].append(stripped)
            elif current_field == 'correct_answer_text':
                q['correct_answer_text'] += " " + stripped

if q:
    questions.append(q)

print(f"Total questions parsed: {len(questions)}")

succeeded = 0
omitted = []

def find_best_match(correct_text, options):
    if not correct_text:
        return None
    
    # Strip any ending text like "PrepLadder" or "(Incorrect Statement)"
    c_clean = correct_text.lower()
    for word in ["prepladder", "incorrect statement", "download prepladder's", "android", "ios", "if you wish to access"]:
        c_clean = c_clean.split(word)[0]
    
    c_clean = re.sub(r'[^a-zA-Z0-9]', '', c_clean).strip()
    
    # Try exact match first
    for idx, opt in enumerate(options):
        opt_clean = re.sub(r'[^a-zA-Z0-9]', '', opt).lower()
        if opt_clean == c_clean or c_clean in opt_clean or opt_clean in c_clean:
            return idx
            
    # Try word overlap
    best_idx = None
    max_overlap = 0
    c_words = set(re.findall(r'\w+', correct_text.lower()))
    for idx, opt in enumerate(options):
        opt_words = set(re.findall(r'\w+', opt.lower()))
        overlap = len(c_words.intersection(opt_words))
        if overlap > max_overlap:
            max_overlap = overlap
            best_idx = idx
            
    if max_overlap > 0:
        return best_idx
        
    return None

for idx, q in enumerate(questions):
    q_text = " ".join(q['question_text']).strip()
    opa = " ".join(q['opa']).strip()
    opb = " ".join(q['opb']).strip()
    opc = " ".join(q['opc']).strip()
    opd = " ".join(q['opd']).strip()
    
    # Map correctOption
    correct_idx = find_best_match(q['correct_answer_text'], [opa, opb, opc, opd])
    q['correctOption'] = correct_idx
    
    if not q_text or not opa or not opb or not opc or not opd or correct_idx is None:
        omitted.append((q['id_in_pdf'], q['page'], q['subject'], q_text, [opa, opb, opc, opd], q['correct_answer_text'], correct_idx))
    else:
        succeeded += 1

print(f"Succeeded: {succeeded}")
print(f"Omitted: {len(omitted)}")
for id_in_pdf, page, sub, text, opts, ans_txt, ans in omitted:
    print(f"\nOmitted Q #{id_in_pdf} on Page {page} | Subject: {sub}")
    print(f"  Text: {text[:150]}...")
    print(f"  Options: {opts}")
    print(f"  Correct Answer Text: {repr(ans_txt)}")
    print(f"  Correct Option Index: {ans}")
