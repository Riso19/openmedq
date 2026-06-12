import os
import re
import fitz
import json

path = "/Users/sain/development/openmedq/data/NEET_2025_Questions_with_Answers-final.pdf"
doc = fitz.open(path)

# Extract all text across pages
all_text = ""
for page in doc:
    all_text += page.get_text() + "\n"

# Split by Q<num>.
# We use a regex split that keeps the numbers
parts = re.split(r'\nQ(\d+)\.', all_text)

header = parts[0]
questions_raw = []
for i in range(1, len(parts), 2):
    q_num = int(parts[i])
    q_content = parts[i+1] if i+1 < len(parts) else ""
    questions_raw.append((q_num, q_content))

print(f"Total splits: {len(questions_raw)}")

SUBJECTS = [
    "Anatomy", "Physiology", "Biochemistry", "Pharmacology", "Pathology", 
    "Microbiology", "Forensic Medicine", "Social & Preventive Medicine", "PSM", 
    "Ophthalmology", "ENT", "General Medicine", "Medicine", "General Surgery", 
    "Surgery", "Obstetrics & Gynecology", "OBG", "Pediatrics", "Orthopedics", 
    "Ortho", "Dermatology", "Derma", "Skin", "Psychiatry", "Radiology", 
    "Anesthesia", "Anaesthesia", "Dental"
]

SUBJECT_MAPPING = {
    'anatomy': 'Anatomy',
    'biochemistry': 'Biochemistry',
    'physiology': 'Physiology',
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
    'medicine': 'General Medicine',
    'general medicine': 'General Medicine',
    'surgery': 'General Surgery',
    'general surgery': 'General Surgery',
    'obstetrics & gynecology': 'Obstetrics & Gynecology',
    'obstetrics and gynecology': 'Obstetrics & Gynecology',
    'gynaecology & obstetrics': 'Obstetrics & Gynecology',
    'gynecology': 'Obstetrics & Gynecology',
    'obstetrics': 'Obstetrics & Gynecology',
    'obg': 'Obstetrics & Gynecology',
    'pediatrics': 'Pediatrics',
    'orthopedics': 'Orthopedics',
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

# Find the subject headings in the header to set initial subject
current_subject = "General/Other"
for line in header.split("\n"):
    clean_line = line.strip()
    if clean_line in SUBJECTS:
        current_subject = SUBJECT_MAPPING.get(clean_line.lower(), clean_line)

parsed_questions = []

for q_num, q_content in questions_raw:
    # Separate the question content into subject changes, question text, options, and answer
    lines = [l.strip() for l in q_content.split("\n") if l.strip()]
    
    q_text_lines = []
    options = {'A': [], 'B': [], 'C': [], 'D': []}
    current_option = None
    answer_option = None
    
    # Process lines
    for line in lines:
        # Check if line is a subject heading
        if line in SUBJECTS:
            current_subject = SUBJECT_MAPPING.get(line.lower(), line)
            continue
            
        # Check if it starts an option
        opt_match = re.match(r'^([A-D])\.\s*(.*)', line)
        if opt_match:
            current_option = opt_match.group(1)
            rest = opt_match.group(2)
            if rest:
                options[current_option].append(rest)
            continue
            
        # Check if it is an Answer line
        ans_match = re.match(r'^Answer\s*:\s*([A-D])', line, re.IGNORECASE)
        ans_match_2 = re.match(r'^Answer\s*:\s*$', line, re.IGNORECASE) # empty answer
        ans_match_3 = re.match(r'^Answer\s*:\s*([A-D])\s*$', line, re.IGNORECASE)
        ans_match_4 = re.match(r'^Answer\s*([A-D])', line, re.IGNORECASE)
        
        # General check for "Answer" or "Answer:"
        if line.lower().startswith("answer"):
            # Extract letter
            letters = re.findall(r'[A-D]', line[6:])
            if letters:
                answer_option = letters[0].upper()
            else:
                answer_option = None # Empty
            continue
            
        if current_option:
            options[current_option].append(line)
        else:
            q_text_lines.append(line)
            
    q_text = " ".join(q_text_lines).strip()
    opa = " ".join(options['A']).strip()
    opb = " ".join(options['B']).strip()
    opc = " ".join(options['C']).strip()
    opd = " ".join(options['D']).strip()
    
    correct_idx = None
    if answer_option in ['A', 'B', 'C', 'D']:
        correct_idx = ord(answer_option) - ord('A')
        
    parsed_questions.append({
        'pdf_id': q_num,
        'subject': current_subject,
        'questionText': q_text,
        'opa': opa,
        'opb': opb,
        'opc': opc,
        'opd': opd,
        'correctOption': correct_idx
    })

print(f"Parsed {len(parsed_questions)} questions.")
omitted = []
for q in parsed_questions:
    if not q['questionText'] or not q['opa'] or not q['opb'] or not q['opc'] or not q['opd'] or q['correctOption'] is None:
        omitted.append(q)

print(f"Omitted: {len(omitted)}")
for o in omitted:
    print(f"Q{o['pdf_id']}: subject: {o['subject']}, text: {o['questionText'][:80]}... | A: {o['opa'][:30]} | B: {o['opb'][:30]} | C: {o['opc'][:30]} | D: {o['opd'][:30]} | Answer: {o['correctOption']}")
