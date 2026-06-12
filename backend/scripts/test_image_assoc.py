import os
import hashlib
import fitz

path = "/Users/sain/development/openmedq/data/NEET-PG-2018-PYQS..pdf"
doc = fitz.open(path)

# First pass: count image hashes to detect logos
image_hashes_counts = {}
for page in doc:
    for img in page.get_images(full=True):
        xref = img[0]
        try:
            base_image = doc.extract_image(xref)
            image_bytes = base_image["image"]
            h = hashlib.md5(image_bytes).hexdigest()
            image_hashes_counts[h] = image_hashes_counts.get(h, 0) + 1
        except:
            pass

# Second pass: extract images for page 1 and print their coords, and print text blocks
page = doc[0]
print("--- IMAGE OBJECTS ON PAGE 1 (excluding logos) ---")
image_list = page.get_images(full=True)
for img in image_list:
    xref = img[0]
    base_image = doc.extract_image(xref)
    image_bytes = base_image["image"]
    h = hashlib.md5(image_bytes).hexdigest()
    count = image_hashes_counts.get(h, 0)
    
    rects = page.get_image_rects(xref)
    if rects:
        rect = rects[0]
        print(f"Xref: {xref} | Hash: {h[:8]} | Count: {count} | Rect: {rect} | Size: {base_image['width']}x{base_image['height']}")
    else:
        print(f"Xref: {xref} | Hash: {h[:8]} | Count: {count} | No Rects")

print("\n--- TEXT BLOCKS ON PAGE 1 ---")
blocks = page.get_text("blocks")
blocks.sort(key=lambda b: (b[1], b[0]))
for b in blocks:
    x0, y0, x1, y1, text, block_no, block_type = b
    print(f"Bbox: ({x0:.1f}, {y0:.1f}, {x1:.1f}, {y1:.1f}) | Text: {repr(text.strip()[:100])}")
