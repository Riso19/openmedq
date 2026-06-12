import os
import fitz

path = "/Users/sain/development/openmedq/data/NEET-PG-2018-PYQS..pdf"
doc = fitz.open(path)
page = doc[0] # Page 1

print("--- TEXT BLOCKS ---")
for b in page.get_text("blocks"):
    x0, y0, x1, y1, text, block_no, block_type = b
    print(f"Block {block_no} (Type {block_type}) | Bbox: ({x0:.1f}, {y0:.1f}, {x1:.1f}, {y1:.1f})")
    print(repr(text.strip()))
    print("-" * 20)

print("\n--- IMAGE BLOCKS ---")
image_info = page.get_images(full=True)
for img in image_info:
    xref = img[0]
    rects = page.get_image_rects(xref)
    print(f"Image xref {xref} | Rects: {rects}")
