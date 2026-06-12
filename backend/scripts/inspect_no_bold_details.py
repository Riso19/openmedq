import os
from pypdf import PdfReader

path = "/Users/sain/development/openmedq/data/NEET-PG-Recall-Questions-2025.pdf"
reader = PdfReader(path)

# Let's inspect the entire text of pages containing Index 2, 8, 10
# From our previous scan:
# Index 2 is on page 3.
# Let's check where Index 8 and Index 10 are. We'll search for the text "Effect of pulmonary embolism" and "At point c what is the length" in the PDF.

for idx, page in enumerate(reader.pages):
    text = page.extract_text()
    if "Effect of pulmonary embolism" in text or "At point c what is the length" in text or "During a neck dissection" in text:
        print(f"\n================ PAGE {idx+1} ================")
        runs = []
        def visitor(text, cm, tm, fontDict, fontSize):
            if text.strip():
                font_name = fontDict.get('/BaseFont', 'Unknown') if fontDict else 'Unknown'
                runs.append((text, font_name))
        page.extract_text(visitor_text=visitor)
        for t, f in runs:
            print(f"[{f}]: {repr(t)}")
