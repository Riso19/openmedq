import os
from pypdf import PdfReader

path = "/Users/sain/development/openmedq/data/NEET-PG-Recall-Questions-2025.pdf"
reader = PdfReader(path)

print("Checking annotations:")
annot_pages = []
for p_idx, page in enumerate(reader.pages):
    if "/Annots" in page:
        annot_pages.append(p_idx + 1)
print(f"Pages with annotations: {annot_pages}")

# Let's inspect page 2's structure
page = reader.pages[1]
print("\nKeys on page 2:")
print(list(page.keys()))

if "/Resources" in page:
    print("\nResources on page 2:")
    print(list(page["/Resources"].keys()))
