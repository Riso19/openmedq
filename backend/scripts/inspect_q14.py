import os
import fitz

path = "/Users/sain/development/openmedq/data/NEET-PG-Recall-Questions-2025.pdf"
doc = fitz.open(path)
page = doc[9] # Page 10 (0-indexed)

blocks = page.get_text("dict")["blocks"]
for b in blocks:
    if "lines" in b:
        for l in b["lines"]:
            for s in l["spans"]:
                print(f"Font: {s['font']} | Text: {repr(s['text'])}")
