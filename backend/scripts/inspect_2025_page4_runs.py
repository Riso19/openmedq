import os
from pypdf import PdfReader

path = "/Users/sain/development/openmedq/data/NEET-PG-Recall-Questions-2025.pdf"
reader = PdfReader(path)
page = reader.pages[3] # Page 4

text_runs = []
def visitor_body(text, cm, tm, fontDict, fontSize):
    if text.strip():
        font_name = fontDict.get('/BaseFont', 'Unknown') if fontDict else 'Unknown'
        text_runs.append((text, font_name))

page.extract_text(visitor_text=visitor_body)

for text, font in text_runs:
    print(f"Font: {font} | Text: {repr(text)}")
