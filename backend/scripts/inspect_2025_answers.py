import os
from pypdf import PdfReader

path = "/Users/sain/development/openmedq/data/NEET-PG-Recall-Questions-2025.pdf"
reader = PdfReader(path)
print(f"Total Pages: {len(reader.pages)}")

# Print pages 100-111 (near the end) to see if there is an answer key
for p_idx in range(max(0, len(reader.pages) - 15), len(reader.pages)):
    text = reader.pages[p_idx].extract_text()
    print(f"--- Page {p_idx+1} ---")
    lines = text.split("\n")
    print("\n".join(lines[:30]))
    print("\n" + "="*30 + "\n")
