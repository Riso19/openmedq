import os
import fitz
import hashlib

path = "/Users/sain/development/openmedq/data/NEET-PG-Recall-Questions-2025.pdf"
doc = fitz.open(path)

hashes = {}
for p_idx in range(len(doc)):
    page = doc[p_idx]
    image_list = page.get_images(full=True)
    for img in image_list:
        xref = img[0]
        base_image = doc.extract_image(xref)
        image_bytes = base_image["image"]
        h = hashlib.md5(image_bytes).hexdigest()
        
        if h not in hashes:
            hashes[h] = {
                "count": 0,
                "width": base_image["width"],
                "height": base_image["height"],
                "ext": base_image["ext"],
                "pages": []
            }
        hashes[h]["count"] += 1
        hashes[h]["pages"].append(p_idx + 1)

print(f"Total image objects: {sum(x['count'] for x in hashes.values())}")
print(f"Total unique images: {len(hashes)}")

# Print top repeated images
sorted_hashes = sorted(hashes.items(), key=lambda x: x[1]["count"], reverse=True)
print("\nTop repeated images:")
for h, info in sorted_hashes[:10]:
    print(f"Hash: {h} | Count: {info['count']} | Size: {info['width']}x{info['height']} | Ext: {info['ext']} | Pages: {info['pages'][:5]}...")
