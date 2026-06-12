import os
from pypdf import PdfReader

path = "/Users/sain/development/openmedq/data/NEET-PG-Recall-Questions-2025.pdf"
reader = PdfReader(path)
page = reader.pages[1] # Page 2

def visitor_body(text, cm, tm, fontDict, fontSize):
    if text.strip():
        font_name = fontDict.get('/BaseFont', 'Unknown') if fontDict else 'Unknown'
        print(f"[{font_name} @ {fontSize}]: {repr(text)}")

page.extract_text(visitor_text=visitor_body)
