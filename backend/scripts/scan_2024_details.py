import os
import re
import fitz

path = "/Users/sain/development/openmedq/data/NEET-PG-PYQs-2024.pdf"
doc = fitz.open(path)

full_text = ""
for page in doc:
    full_text += page.get_text() + "\n"

# Let's split by Q.X.
questions = re.split(r'Q\.\d+\.', full_text)
print(f"Split count: {len(questions)}")

for idx, q in enumerate(questions[1:10]):
    print(f"\n--- Split {idx+1} ---")
    lines = [line.strip() for line in q.split("\n") if line.strip()]
    print("\n".join(lines[:12]))
    print("-" * 30)
