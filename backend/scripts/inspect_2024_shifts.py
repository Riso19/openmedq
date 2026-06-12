import os
import fitz

shift1_path = "/Users/sain/development/openmedq/data/NEET_PG_2024_Shift_I.pdf"
shift2_path = "/Users/sain/development/openmedq/data/NEET_PG_2024 SHIFT 2.pdf"

for name, path in [("Shift 1", shift1_path), ("Shift 2", shift2_path)]:
    if not os.path.exists(path):
        print(f"{name}: file not found at {path}")
        continue
        
    doc = fitz.open(path)
    print(f"=== {name} ===")
    print(f"  Pages: {len(doc)}")
    
    img_count = 0
    pages_with_images = []
    for p_idx in range(len(doc)):
        image_list = doc[p_idx].get_images(full=True)
        if image_list:
            img_count += len(image_list)
            pages_with_images.append(p_idx + 1)
            
    print(f"  Total image objects: {img_count}")
    print(f"  Pages with images: {len(pages_with_images)}")
    
    # Print first page text
    print(f"  --- FIRST PAGE TEXT ---")
    print(doc[0].get_text()[:600])
    print("-" * 50)
