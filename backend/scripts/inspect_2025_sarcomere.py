import os
import fitz

path = "/Users/sain/development/openmedq/data/NEET-PG-Recall-Questions-2025.pdf"
doc = fitz.open(path)

for idx, page in enumerate(doc):
    text = page.get_text()
    if "relationship of sarcomere" in text:
        print(f"--- PAGE {idx+1} ---")
        print(text)
        print("-" * 50)
        # print next page too
        if idx + 1 < len(doc):
            print(f"--- PAGE {idx+2} ---")
            print(doc[idx+1].get_text())
            print("-" * 50)
