import os
import re
import fitz

data_dir = "/Users/sain/development/openmedq/data"
pdf_files = [
    "NEET-PG-2018-PYQS..pdf",
    "Neet-pg-2019-PYQS.pdf",
    "Neet-PG-2020-PYQs.pdf",
    "NEET-PG-2021-PYQs.pdf",
    "NEET-PG-2022-PYQs.pdf",
    "Neet-PG-2023-previous-year-question-pdf.pdf"
]

for filename in pdf_files:
    path = os.path.join(data_dir, filename)
    if not os.path.exists(path):
        print(f"Skipping missing file: {filename}")
        continue
        
    doc = fitz.open(path)
    all_lines = []
    for p_idx in range(len(doc)):
        page = doc[p_idx]
        page_num = p_idx + 1
        blocks = page.get_text("blocks")
        blocks.sort(key=lambda b: (b[1], b[0]))
        for b in blocks:
            text = b[4]
            for line in text.split("\n"):
                stripped = line.strip()
                if stripped:
                    all_lines.append((stripped, page_num))

    questions = []
    q = None
    current_field = None

    Q_START_RE = re.compile(r'^Ques\s*No\s*:\s*(\d+)', re.IGNORECASE)
    SUBJECT_RE = re.compile(r'Subject\s*:\s*(.*)', re.IGNORECASE)
    TOPIC_RE = re.compile(r'Topic\s*:\s*(.*)', re.IGNORECASE)
    SUBTOPIC_RE = re.compile(r'Sub-Topic\s*:\s*(.*)', re.IGNORECASE)

    for line, page in all_lines:
        if Q_START_RE.match(line):
            if q:
                questions.append(q)
            q = {
                'id_in_pdf': Q_START_RE.match(line).group(1),
                'page': page,
                'subject': '',
                'topic': '',
                'subtopic': '',
                'question_text': [],
                'opa': [],
                'opb': [],
                'opc': [],
                'opd': [],
                'correctOption': None,
                'explanation': []
            }
            current_field = 'metadata'
            
        if q:
            if current_field == 'metadata':
                if 'subject:' in line.lower():
                    parts = re.split(r'subject\s*:\s*', line, flags=re.IGNORECASE)
                    sub_part = parts[1]
                    if 'topic:' in sub_part.lower():
                        sub_val, rest = re.split(r'topic\s*:\s*', sub_part, flags=re.IGNORECASE, maxsplit=1)
                        q['subject'] = sub_val.strip()
                        if 'sub-topic:' in rest.lower():
                            top_val, subtop_val = re.split(r'sub-topic\s*:\s*', rest, flags=re.IGNORECASE, maxsplit=1)
                            q['topic'] = top_val.strip()
                            q['subtopic'] = subtop_val.strip()
                        else:
                            q['topic'] = rest.strip()
                    else:
                        q['subject'] = sub_part.strip()
                elif 'topic:' in line.lower():
                    parts = re.split(r'topic\s*:\s*', line, flags=re.IGNORECASE)
                    top_part = parts[1]
                    if 'sub-topic:' in top_part.lower():
                        top_val, subtop_val = re.split(r'sub-topic\s*:\s*', top_part, flags=re.IGNORECASE, maxsplit=1)
                        q['topic'] = top_val.strip()
                        q['subtopic'] = subtop_val.strip()
                    else:
                        q['topic'] = top_part.strip()
                elif 'sub-topic:' in line.lower():
                    parts = re.split(r'sub-topic\s*:\s*', line, flags=re.IGNORECASE)
                    q['subtopic'] = parts[1].strip()
                    
                if 'sub-topic:' in line.lower() or ('topic:' in line.lower() and 'sub-topic' not in line.lower()):
                    current_field = 'question_text'
            else:
                if re.match(r'^O1\s*:', line, re.IGNORECASE):
                    current_field = 'o1'
                    content = re.sub(r'^O1\s*:\s*', '', line, flags=re.IGNORECASE)
                    if content: q['opa'].append(content)
                elif re.match(r'^O2\s*:', line, re.IGNORECASE):
                    current_field = 'o2'
                    content = re.sub(r'^O2\s*:\s*', '', line, flags=re.IGNORECASE)
                    if content: q['opb'].append(content)
                elif re.match(r'^O3\s*:', line, re.IGNORECASE):
                    current_field = 'o3'
                    content = re.sub(r'^O3\s*:\s*', '', line, flags=re.IGNORECASE)
                    if content: q['opc'].append(content)
                elif re.match(r'^O4\s*:', line, re.IGNORECASE):
                    current_field = 'o4'
                    content = re.sub(r'^O4\s*:\s*', '', line, flags=re.IGNORECASE)
                    if content: q['opd'].append(content)
                elif re.match(r'^Ans\s*:', line, re.IGNORECASE):
                    current_field = 'explanation'
                    ans_match = re.match(r'^Ans\s*:\s*(\d+)(.*)', line, re.IGNORECASE)
                    if ans_match:
                        q['correctOption'] = int(ans_match.group(1)) - 1
                        rest = ans_match.group(2).strip()
                        if rest: q['explanation'].append(rest)
                else:
                    if current_field == 'question_text':
                        if not any(header in line for header in ["PrepLadder", "NEET PG", "PYQS", "PYQs", "Paper =>"]):
                            q['question_text'].append(line)
                    elif current_field == 'o1':
                        q['opa'].append(line)
                    elif current_field == 'o2':
                        q['opb'].append(line)
                    elif current_field == 'o3':
                        q['opc'].append(line)
                    elif current_field == 'o4':
                        q['opd'].append(line)
                    elif current_field == 'explanation':
                        if not any(header in line for header in ["PrepLadder", "NEET PG", "PYQS", "PYQs", "Paper =>"]):
                            q['explanation'].append(line)

    if q:
        questions.append(q)

    succeeded = 0
    omitted = []
    for idx, q in enumerate(questions):
        q_text = " ".join(q['question_text']).strip()
        opa = " ".join(q['opa']).strip()
        opb = " ".join(q['opb']).strip()
        opc = " ".join(q['opc']).strip()
        opd = " ".join(q['opd']).strip()
        
        if not q_text or not opa or not opb or not opc or not opd or q['correctOption'] is None:
            omitted.append((q['id_in_pdf'], q['page'], q['subject'], q_text, [opa, opb, opc, opd], q['correctOption']))
        else:
            succeeded += 1

    print(f"File: {filename} | Total: {len(questions)} | Succeeded: {succeeded} | Omitted: {len(omitted)}")
    if omitted:
        print("Sample omitted:")
        for id_in_pdf, page, sub, text, opts, ans in omitted[:2]:
            print(f"  Q #{id_in_pdf} on Page {page} | Subject: {sub}")
            print(f"    Text: {text[:100]}...")
            print(f"    Options: {opts}")
            print(f"    Ans: {ans}")
    print("-" * 50)
