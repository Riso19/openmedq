import os
from pypdf import PdfReader

path = "/Users/sain/development/openmedq/data/NEET-PG-Recall-Questions-2025.pdf"
reader = PdfReader(path)
found = []
for p_idx, page in enumerate(reader.pages):
    text = page.extract_text()
    if any(w in text.lower() for w in ["ans:", "answer:", "correct answer", "key"]):
        found.append(p_idx + 1)

print(f"Found answers in pages: {found}")
