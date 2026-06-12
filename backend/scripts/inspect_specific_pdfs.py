import os
from pypdf import PdfReader

data_dir = "/Users/sain/development/openmedq/data"

for filename in ["NEET-PG-2021-PYQs.pdf", "NEET-PG-PYQs-2024.pdf", "NEET-PG-Recall-Questions-2025.pdf"]:
    path = os.path.join(data_dir, filename)
    if os.path.exists(path):
        reader = PdfReader(path)
        print(f"\n============================\nFile: {filename} (Total pages: {len(reader.pages)})\n============================")
        for p_idx in range(1, min(5, len(reader.pages))):
            text = reader.pages[p_idx].extract_text()
            print(f"--- Page {p_idx+1} ---")
            print(text[:1200])
            print("\n" + "-"*20 + "\n")
