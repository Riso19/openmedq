import os
from pypdf import PdfReader

path = "/Users/sain/development/openmedq/data/NEET-PG-Recall-Questions-2025.pdf"
reader = PdfReader(path)

def visitor_body(text, cm, tm, fontDict, fontSize):
    if text.strip():
        font_name = fontDict.get('/BaseFont', 'Unknown') if fontDict else 'Unknown'
        print(f"[{font_name}]: {repr(text)}")

for p_idx in [1, 2]:
    print(f"\n--- Page {p_idx+1} ---")
    reader.pages[p_idx].extract_text(visitor_text=visitor_body)
