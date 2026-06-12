import os
from pypdf import PdfReader

path = "/Users/sain/development/openmedq/data/NEET-PG-Recall-Questions-2025.pdf"
reader = PdfReader(path)
print("Printing first 4 pages text of 2025 PDF:")
for idx in range(4):
    print(f"\n--- PAGE {idx+1} ---")
    print(reader.pages[idx].extract_text())
