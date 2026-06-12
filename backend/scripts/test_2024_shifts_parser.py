import os
import re
import fitz
import hashlib

def clean_text(text):
    text = text.replace('\u200b', '').replace('\u200e', '').replace('\u200f', '').replace('\ufeff', '')
    return text.strip()

def normalize_text(text):
    return re.sub(r'[^a-z0-9]', '', text.lower().strip())

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

def parse_shift_pdf(path, shift_label):
    doc = fitz.open(path)
    
    # 1. Pre-scan images
    image_hashes_counts = {}
    all_diagrams = []
    
    for page in doc:
        for img in page.get_images(full=True):
            xref = img[0]
            try:
                base_image = doc.extract_image(xref)
                h = hashlib.md5(base_image["image"]).hexdigest()
                image_hashes_counts[h] = image_hashes_counts.get(h, 0) + 1
            except:
                pass
                
    for p_idx in range(len(doc)):
        page = doc[p_idx]
        page_num = p_idx + 1
        for img in page.get_images(full=True):
            xref = img[0]
            try:
                base_image = doc.extract_image(xref)
                h = hashlib.md5(base_image["image"]).hexdigest()
                if image_hashes_counts.get(h, 0) < 5:
                    rects = page.get_image_rects(xref)
                    if rects:
                        all_diagrams.append({
                            'page': page_num,
                            'rect': rects[0],
                            'bytes': base_image["image"],
                            'ext': base_image["ext"]
                        })
            except:
                pass
                
    # 2. Extract lines block-by-block
    lines = []
    for p_idx in range(len(doc)):
        page_num = p_idx + 1
        blocks = doc[p_idx].get_text("blocks")
        blocks.sort(key=lambda b: (b[1], b[0]))
        for b in blocks:
            text = b[4].strip()
            if text:
                for line in text.split("\n"):
                    line_clean = clean_text(line)
                    if line_clean:
                        lines.append({
                            'text': line_clean,
                            'page': page_num,
                            'bbox': (b[0], b[1], b[2], b[3])
                        })
                        
    questions = []
    q = None
    
    SUBJECTS = list(SUBJECT_MAPPING.values()) + ["Skin", "Ortho", "OBG", "Derma", "Anaesthesia", "PSM"]
    current_subject = "General/Other"
    
    for line_info in lines:
        text = line_info['text']
        page = line_info['page']
        y0, y1 = line_info['bbox'][1], line_info['bbox'][3]
        
        # Check if line matches a subject name (often preceded by dash or at end of line like "Sour taste is mediated by: - PHYSIOLOGY")
        subj_match = None
        for s in SUBJECTS:
            if re.search(r'\b' + re.escape(s) + r'\b', text, re.IGNORECASE):
                subj_match = SUBJECT_MAPPING.get(s.lower(), s)
                break
        if subj_match and len(text) < 40:
            current_subject = subj_match
            continue
            
        # Start of question: Ques \d+\. or Q\.\d+\. or Q\d+\.
        q_match = re.match(r'^(?:Ques|Q)\.?\s*(\d+)\.\s*(.*)', text, re.IGNORECASE)
        if q_match:
            if q:
                questions.append(q)
            q_num = int(q_match.group(1))
            rest = q_match.group(2)
            q = {
                'pdf_id': q_num,
                'start_page': page,
                'end_page': page,
                'year': 2024,
                'subject': current_subject,
                'question_text': [rest] if rest else [],
                'opa': [],
                'opb': [],
                'opc': [],
                'opd': [],
                'correctOption': None,
                'y_start': y0,
                'y_end': y1,
                'image': None,
                'current_option': None,
                'shift': shift_label
            }
            continue
            
        if q:
            q['end_page'] = page
            q['y_end'] = y1
            
            # Normalize potential Cyrillic OCR characters to Latin equivalent
            normalized_line = text.replace('а', 'a').replace('б', 'b').replace('с', 'c').replace('д', 'd')
            normalized_line = normalized_line.replace('А', 'A').replace('Б', 'B').replace('С', 'C').replace('Д', 'D')
            
            # Check for option prefix: A. or a. or 1.
            opt_match = re.match(r'^([A-Da-d])\.\s*(.*)', normalized_line)
            opt_num_match = re.match(r'^([1-4])\.\s*(.*)', normalized_line)
            
            if opt_match:
                opt = opt_match.group(1).upper()
                rest = opt_match.group(2)
                q['current_option'] = opt
                if rest:
                    q[f'op{opt.lower()}'].append(rest)
                continue
            elif opt_num_match:
                num = int(opt_num_match.group(1))
                opt = chr(ord('A') + num - 1)
                rest = opt_num_match.group(2)
                q['current_option'] = opt
                if rest:
                    q[f'op{opt.lower()}'].append(rest)
                continue
                
            # Check for Answer line: Ans. A or Ans A or Answer: A
            ans_match = re.match(r'^(?:Ans|Answer)\.?\s*:?\s*([A-Da-d])', normalized_line, re.IGNORECASE)
            if ans_match:
                ans_letter = ans_match.group(1).upper()
                q['correctOption'] = ord(ans_letter) - ord('A')
                q['current_option'] = None
                continue
                
            if q['current_option']:
                q[f'op{q["current_option"].lower()}'].append(text)
            else:
                # Filter out pure headers/footers
                if not any(header in text for header in ["NEET PG 2024", "Shift I", "Shift 2", "Question Paper"]):
                    q['question_text'].append(text)
                    
    if q:
        questions.append(q)
        
    # Associate images
    for diag in all_diagrams:
        img_page = diag['page']
        img_y = (diag['rect'].y0 + diag['rect'].y1) / 2
        
        best_q = None
        min_dist = 999999
        
        for pq in questions:
            if not (pq['start_page'] <= img_page <= pq['end_page']):
                continue
                
            if pq['start_page'] == pq['end_page']:
                y_start = pq['y_start']
                y_end = pq['y_end']
            elif img_page == pq['start_page']:
                y_start = pq['y_start']
                y_end = 99999
            elif img_page == pq['end_page']:
                y_start = 0
                y_end = pq['y_end']
            else:
                y_start = 0
                y_end = 99999
                
            if y_start <= img_y <= y_end:
                dist = 0
            else:
                dist = min(abs(img_y - y_start), abs(img_y - y_end))
                
            if dist < min_dist:
                min_dist = dist
                best_q = pq
                
        if best_q and min_dist < 200:
            best_q['image'] = diag
            
    # Format questions
    formatted_questions = []
    for q in questions:
        q_text = " ".join(q['question_text']).strip()
        opa = " ".join(q['opa']).strip()
        opb = " ".join(q['opb']).strip()
        opc = " ".join(q['opc']).strip()
        opd = " ".join(q['opd']).strip()
        
        # Pad Option D if missing but A/B/C are present
        if not opd and opa and opb and opc:
            opd = "None of the above"
            
        q_text = re.sub(r'\s+', ' ', q_text)
        opa = re.sub(r'\s+', ' ', opa)
        opb = re.sub(r'\s+', ' ', opb)
        opc = re.sub(r'\s+', ' ', opc)
        opd = re.sub(r'\s+', ' ', opd)
        
        if not q_text or not opa or not opb or not opc or not opd or q['correctOption'] is None:
            continue
            
        formatted_questions.append({
            'pdf_id': q['pdf_id'],
            'page': q['start_page'],
            'year': 2024,
            'subject': q['subject'],
            'topic': "General Practice",
            'questionText': q_text,
            'opa': opa,
            'opb': opb,
            'opc': opc,
            'opd': opd,
            'correctOption': q['correctOption'],
            'explanation': f"Sourced from NEET PG 2024 {shift_label} recall key.",
            'image': q['image']
        })
        
    return formatted_questions

# Run Shift 1 & Shift 2 parsers
shift1_qs = parse_shift_pdf("/Users/sain/development/openmedq/data/NEET_PG_2024_Shift_I.pdf", "Shift 1")
shift2_qs = parse_shift_pdf("/Users/sain/development/openmedq/data/NEET_PG_2024 SHIFT 2.pdf", "Shift 2")

print(f"Shift 1: Parsed {len(shift1_qs)} fully formatted questions.")
print(f"Shift 2: Parsed {len(shift2_qs)} fully formatted questions.")

# Let's read the old 40 questions of 2024
import sys
sys.path.append("/Users/sain/development/openmedq/backend/scripts")
from parse_pyqs import parse_2024_pyqs
old_qs = parse_2024_pyqs()

print(f"Old 2024: Parsed {len(old_qs)} questions.")

seen_texts = {}
merged_qs = []

# Add Old 2024 questions first
for q in old_qs:
    norm = normalize_text(q['questionText'])
    if norm not in seen_texts:
        seen_texts[norm] = q
        merged_qs.append(q)

# Add Shift 1
for q in shift1_qs:
    norm = normalize_text(q['questionText'])
    if norm not in seen_texts:
        seen_texts[norm] = q
        merged_qs.append(q)

# Add Shift 2
for q in shift2_qs:
    norm = normalize_text(q['questionText'])
    if norm not in seen_texts:
        seen_texts[norm] = q
        merged_qs.append(q)

print(f"After combining Old 2024, Shift 1, and Shift 2: {len(merged_qs)} unique questions.")
