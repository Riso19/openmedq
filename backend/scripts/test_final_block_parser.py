import os
import re
import fitz
import hashlib

path = "/Users/sain/development/openmedq/data/NEET_2025_Questions_with_Answers-final.pdf"
doc = fitz.open(path)

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

# Image extraction
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

# Extract all lines block-by-block
lines = []
for p_idx in range(len(doc)):
    page_num = p_idx + 1
    blocks = doc[p_idx].get_text("blocks")
    blocks.sort(key=lambda b: (b[1], b[0]))
    for b in blocks:
        text = b[4].strip()
        if text:
            for line in text.split("\n"):
                line_clean = line.strip()
                if line_clean:
                    lines.append({
                        'text': line_clean,
                        'page': page_num,
                        'bbox': (b[0], b[1], b[2], b[3])
                    })

questions = []
q = None
current_subject = "General/Other"

for line_info in lines:
    text = line_info['text']
    page = line_info['page']
    y0, y1 = line_info['bbox'][1], line_info['bbox'][3]
    
    if text in SUBJECTS:
        current_subject = SUBJECT_MAPPING.get(text.lower(), text)
        continue
        
    q_match = re.match(r'^Q(\d+)\.\s*(.*)', text)
    if q_match:
        if q:
            questions.append(q)
        q_num = int(q_match.group(1))
        rest = q_match.group(2)
        q = {
            'pdf_id': q_num,
            'start_page': page,
            'end_page': page,
            'year': 2025,
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
            'current_option': None
        }
        continue
        
    if q:
        q['end_page'] = page
        q['y_end'] = y1
        
        opt_match = re.match(r'^([A-D])\.\s*(.*)', text)
        if opt_match:
            opt = opt_match.group(1)
            rest = opt_match.group(2)
            q['current_option'] = opt
            if rest:
                q[f'op{opt.lower()}'].append(rest)
            continue
            
        if text.lower().startswith('answer'):
            ans_letters = re.findall(r'[A-D]', text[6:])
            if ans_letters:
                q['correctOption'] = ord(ans_letters[0].upper()) - ord('A')
            q['current_option'] = None
            continue
            
        if q['current_option']:
            q[f'op{q["current_option"].lower()}'].append(text)
        else:
            # Avoid prepending clean sub-headings inside question text if they match SUBJECTS
            if text not in SUBJECTS:
                q['question_text'].append(text)

if q:
    questions.append(q)

print(f"Total questions parsed: {len(questions)}")

# Match images
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

# Format and check omissions
omitted = []
for q in questions:
    q_text = " ".join(q['question_text']).strip()
    opa = " ".join(q['opa']).strip()
    opb = " ".join(q['opb']).strip()
    opc = " ".join(q['opc']).strip()
    opd = " ".join(q['opd']).strip()
    
    # Manual patch for the 8 missing answers
    if q['pdf_id'] == 3:
        q['correctOption'] = 2 # GSE
    elif q['pdf_id'] == 57:
        q['correctOption'] = 1 # Left ear CHL
    elif q['pdf_id'] == 147:
        q['correctOption'] = 2 # t(15;17)
    elif q['pdf_id'] == 149:
        q['correctOption'] = 0 # SCID
    elif q['pdf_id'] == 168:
        q['correctOption'] = 0 # BPaLM
    elif q['pdf_id'] == 173:
        q['correctOption'] = 1 # Point B
    elif q['pdf_id'] == 182:
        q['correctOption'] = 1 # psychiatric assessment
    elif q['pdf_id'] == 199:
        q['correctOption'] = 0 # Escharotomy
        
    if not q_text or not opa or not opb or not opc or not opd or q['correctOption'] is None:
        omitted.append(q)

print(f"Omitted questions after patches: {len(omitted)}")
for o in omitted:
    print(f"Q{o['pdf_id']}: {o}")

# Print questions with associated images to see if image mapping was correct
image_qs = [q for q in questions if q['image']]
print(f"Questions with images: {len(image_qs)}")
for idx, iq in enumerate(image_qs[:10]):
    print(f"{idx+1}. Q{iq['pdf_id']} on Page {iq['start_page']} | Image size: {len(iq['image']['bytes'])} bytes | Text: {' '.join(iq['question_text'])[:80]}...")
