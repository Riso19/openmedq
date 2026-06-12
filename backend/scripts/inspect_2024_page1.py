import os
import fitz

path = "/Users/sain/development/openmedq/data/NEET-PG-PYQs-2024.pdf"
doc = fitz.open(path)
page = doc[0]

for b in page.get_text("blocks"):
    print(b[4].strip())
    print("-" * 20)
