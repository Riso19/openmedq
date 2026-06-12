import os
import fitz # PyMuPDF

data_dir = "/Users/sain/development/openmedq/data"
pdf_files = sorted([f for f in os.listdir(data_dir) if f.endswith(".pdf")])

for f in pdf_files:
    path = os.path.join(data_dir, f)
    doc = fitz.open(path)
    img_count = 0
    pages_with_images = []
    
    for p_idx in range(len(doc)):
        page = doc[p_idx]
        image_list = page.get_images(full=True)
        if image_list:
            img_count += len(image_list)
            pages_with_images.append(p_idx + 1)
            
    print(f"File: {f}")
    print(f"  Pages with images: {len(pages_with_images)} / {len(doc)}")
    print(f"  Total image objects: {img_count}")
    if pages_with_images:
        print(f"  First 10 pages with images: {pages_with_images[:10]}")
    print("-" * 50)
