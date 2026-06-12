import os
import fitz

path = "/Users/sain/development/openmedq/data/NEET_2025_Questions_with_Answers-final.pdf"
doc = fitz.open(path)

# Let's inspect page 2 (index 1)
page = doc[1]
print("=== PAGE 2 DIAGRAMS ===")
for img in page.get_images(full=True):
    xref = img[0]
    rects = page.get_image_rects(xref)
    if rects:
        print(f"Image xref: {xref} | Rect: {rects[0]}")
    else:
        print(f"Image xref: {xref} | No Rect")

print("\n=== PAGE 2 TEXT BLOCKS ===")
blocks = page.get_text("blocks")
blocks.sort(key=lambda b: (b[1], b[0]))
for b in blocks:
    x0, y0, x1, y1, text, block_no, block_type = b
    print(f"Bbox: ({x0:.1f}, {y0:.1f}, {x1:.1f}, {y1:.1f}) | Text: {repr(text.strip())}")
