import os
from pypdf import PdfReader

data_dir = "/Users/sain/development/openmedq/data"
pdf_files = [f for f in os.listdir(data_dir) if f.endswith(".pdf")]

print("PDF Files found:")
for f in pdf_files:
    path = os.path.join(data_dir, f)
    size = os.path.getsize(path)
    print(f"  {f} ({size / (1024 * 1024):.2f} MB)")

print("\n--- Inspecting first page of each PDF ---")
for f in sorted(pdf_files):
    path = os.path.join(data_dir, f)
    try:
        reader = PdfReader(path)
        num_pages = len(reader.pages)
        print(f"\nFile: {f} | Total Pages: {num_pages}")
        
        # Extract text from page 0 (or page 1 if page 0 is empty)
        text = ""
        for page_idx in range(min(5, num_pages)):
            page_text = reader.pages[page_idx].extract_text()
            if page_text and len(page_text.strip()) > 50:
                text = page_text
                print(f"  Found text on page {page_idx + 1}:")
                break
        
        if not text:
            print("  Warning: No text extracted from first 5 pages.")
        else:
            # Print first 800 characters
            print("-" * 40)
            print(text[:800])
            print("-" * 40)
    except Exception as e:
        print(f"  Error reading {f}: {e}")
