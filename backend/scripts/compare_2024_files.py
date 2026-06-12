import os
import re
import fitz

def normalize(text):
    return re.sub(r'[^a-z0-9]', '', text.lower().strip())

files = [
    ("Old 2024", "NEET-PG-PYQs-2024.pdf"),
    ("Shift 1", "NEET_PG_2024_Shift_I.pdf"),
    ("Shift 2", "NEET_PG_2024 SHIFT 2.pdf")
]

parsed_texts = {}

for label, filename in files:
    path = os.path.join("/Users/sain/development/openmedq/data", filename)
    if not os.path.exists(path):
        print(f"{label} not found!")
        continue
        
    doc = fitz.open(path)
    text = "\n".join(p.get_text() for p in doc)
    
    # Let's extract question text by splitting on Ques \d+\. or Q\.\d+\. or Q\d+\.
    # We will use a simple regex split
    parts = re.split(r'\n(?:Ques|Q)\.?\s*(\d+)\.', text)
    qs = []
    for i in range(1, len(parts), 2):
        num = int(parts[i])
        content = parts[i+1].strip() if i+1 < len(parts) else ""
        lines = [l.strip() for l in content.split("\n") if l.strip()]
        
        # Take the question text (everything before options A/B/C/D or 1/2/3/4)
        q_lines = []
        for line in lines:
            if re.match(r'^(?:[A-D]|[1-4])\.', line) or line.lower().startswith("ans"):
                break
            q_lines.append(line)
        q_text = " ".join(q_lines).strip()
        if q_text:
            qs.append((num, q_text))
            
    parsed_texts[label] = qs
    print(f"{label}: Parsed {len(qs)} question texts.")

# Check overlaps
print("\n=== OVERLAPS ===")
all_unique = {}
for label, qs in parsed_texts.items():
    for num, q_text in qs:
        norm = normalize(q_text)
        if norm in all_unique:
            print(f"Overlap: {label} Q{num} matches {all_unique[norm][0]} Q{all_unique[norm][1]}")
            print(f"  Text: {q_text[:80]}...")
        else:
            all_unique[norm] = (label, num)

print(f"\nTotal unique questions across all 3 files: {len(all_unique)}")
