import os
import re
import fitz

data_dir = "/Users/sain/development/openmedq/data"
filename = "NEET-PG-2018-PYQS..pdf"
path = os.path.join(data_dir, filename)
doc = fitz.open(path)

questions = []
for p_idx in range(len(doc)):
    page = doc[p_idx]
    blocks = page.get_text("blocks")
    
    # Let's filter blocks by text content
    text_blocks = []
    for b in blocks:
        x0, y0, x1, y1, text, block_no, block_type = b
        stripped = text.strip()
        if stripped:
            text_blocks.append(stripped)
            
    # Print the first few blocks on page 1
    if p_idx == 0:
        print("Page 1 blocks:")
        for idx, tb in enumerate(text_blocks):
            print(f"Block {idx}: {repr(tb)}")
            print("-" * 15)
            
print(f"Total pages: {len(doc)}")
