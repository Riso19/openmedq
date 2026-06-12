import os
import re
from pypdf import PdfReader

data_dir = "/Users/sain/development/openmedq/data"
pdf_files = sorted([f for f in os.listdir(data_dir) if f.endswith(".pdf")])

for f in pdf_files:
    path = os.path.join(data_dir, f)
    reader = PdfReader(path)
    text = ""
    for page in reader.pages:
        t = page.extract_text()
        if t:
            text += t + "\n"
    
    # Check for "Ques No:" or "Q." or "Ques"
    ques_no_matches = len(re.findall(r'Ques\s*No:', text, re.IGNORECASE))
    q_dots = len(re.findall(r'Q\.', text))
    ans_matches = len(re.findall(r'Ans:', text, re.IGNORECASE))
    correct_ans_matches = len(re.findall(r'Correct\s*Answer:', text, re.IGNORECASE))
    
    print(f"File: {f}")
    print(f"  Pages: {len(reader.pages)}")
    print(f"  Approx Characters: {len(text)}")
    print(f"  'Ques No:' count: {ques_no_matches}")
    print(f"  'Q.' count: {q_dots}")
    print(f"  'Ans:' count: {ans_matches}")
    print(f"  'Correct Answer:' count: {correct_ans_matches}")
    print("-" * 50)
