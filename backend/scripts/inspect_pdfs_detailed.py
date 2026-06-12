import os
from pypdf import PdfReader

data_dir = "/Users/sain/development/openmedq/data"
pdf_files = sorted([f for f in os.listdir(data_dir) if f.endswith(".pdf")])

for f in pdf_files:
    path = os.path.join(data_dir, f)
    reader = PdfReader(path)
    print(f"\n============================\nFile: {f}\n============================")
    
    # Try pages 1, 2, 3
    for p_idx in [1, 2, 3]:
        if p_idx < len(reader.pages):
            text = reader.pages[p_idx].extract_text()
            print(f"--- Page {p_idx+1} ---")
            print(text[:1500])
            print("\n" + "-"*20 + "\n")
