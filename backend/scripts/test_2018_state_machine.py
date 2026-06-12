import os
import re
import fitz

data_dir = "/Users/sain/development/openmedq/data"
filename = "NEET-PG-2018-PYQS..pdf"
path = os.path.join(data_dir, filename)
doc = fitz.open(path)

# Let's extract all lines across all pages, keeping track of page number
all_lines = []
for p_idx in range(len(doc)):
    page = doc[p_idx]
    page_num = p_idx + 1
    blocks = page.get_text("blocks")
    # Sort blocks top-to-bottom, left-to-right
    blocks.sort(key=lambda b: (b[1], b[0]))
    for b in blocks:
        text = b[4]
        for line in text.split("\n"):
            stripped = line.strip()
            if stripped:
                all_lines.append((stripped, page_num))

print(f"Total lines: {len(all_lines)}")

questions = []
q = None
current_field = None # 'question_text', 'o1', 'o2', 'o3', 'o4', 'explanation'

Q_START_RE = re.compile(r'^Ques\s*No\s*:\s*(\d+)', re.IGNORECASE)
SUBJECT_RE = re.compile(r'Subject\s*:\s*(.*)', re.IGNORECASE)
TOPIC_RE = re.compile(r'Topic\s*:\s*(.*)', re.IGNORECASE)
SUBTOPIC_RE = re.compile(r'Sub-Topic\s*:\s*(.*)', re.IGNORECASE)

for line, page in all_lines:
    # Check if this line starts a new question metadata block
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
            # Check for metadata keys in the line
            sub_m = SUBJECT_RE.search(line)
            top_m = TOPIC_RE.search(line)
            subtop_m = SUBTOPIC_RE.search(line)
            
            # If the line contains these, extract them
            # Note that a single line might contain multiple, e.g. "Ques No: 1Subject: Anatomy..."
            # Let's handle inline keys:
            if 'subject:' in line.lower():
                parts = re.split(r'subject\s*:\s*', line, flags=re.IGNORECASE)
                # Next part might contain Topic
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
                
            # If we see the subtopic (which is the last metadata field), transition to question_text
            if 'sub-topic:' in line.lower() or ('topic:' in line.lower() and 'sub-topic' not in line.lower()):
                current_field = 'question_text'
        else:
            # Check for option or answer markers
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
                # Append to current field
                if current_field == 'question_text':
                    # Skip if it is decorative like "PrepLadder" or "NEET PG 2018 PYQS"
                    if line.strip() not in ["PrepLadder", "NEET PG 2018 PYQS", "NEET PG 2018 PYQs"]:
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
                    if line.strip() not in ["PrepLadder", "NEET PG 2018 PYQS", "NEET PG 2018 PYQs"]:
                        q['explanation'].append(line)

if q:
    questions.append(q)

print(f"Total questions parsed: {len(questions)}")
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

print(f"Succeeded: {succeeded}")
print(f"Omitted: {len(omitted)}")
for id_in_pdf, page, sub, text, opts, ans in omitted[:10]:
    print(f"Omitted Q #{id_in_pdf} on Page {page} | Subject: {sub}")
    print(f"  Text: {text[:150]}...")
    print(f"  Options: {opts}")
    print(f"  Correct Option: {ans}")
