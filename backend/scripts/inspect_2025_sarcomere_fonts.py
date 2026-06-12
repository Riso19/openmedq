import os
import fitz

path = "/Users/sain/development/openmedq/data/NEET-PG-Recall-Questions-2025.pdf"
doc = fitz.open(path)

# Page 8 is index 7, Page 9 is index 8
for p_idx in [7, 8]:
    print(f"\n================ PAGE {p_idx+1} ================")
    page = doc[p_idx]
    
    # We can get text runs with font properties
    blocks = page.get_text("dict")["blocks"]
    for b in blocks:
        if "lines" in b:
            for l in b["lines"]:
                for s in l["spans"]:
                    text = s["text"]
                    font = s["font"]
                    if text.strip() in ["A.", "B.", "C.", "D.", "relationship of sarcomere"]:
                        print(f"Text: {repr(text)} | Font: {font}")
