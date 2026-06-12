import os
import json

packs_dir = "/Users/sain/development/openmedq/backend/dist/r2-packs/packs"
years = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]

print("=== PYQ PACKS ANALYSIS ===")
for yr in years:
    filename = f"neet_pg_{yr}.json"
    filepath = os.path.join(packs_dir, filename)
    if not os.path.exists(filepath):
        print(f"{filename}: File not found!")
        continue
        
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    expected = 300 if yr in [2018, 2019, 2020] else 200
    actual = len(data)
    
    # Check pdf_ids present
    # Usually in the JSON, they might have pdf_id, or they might be from the parser
    # Let's inspect the keys of the first item
    keys = list(data[0].keys()) if data else []
    
    # Try to extract the pdf_id or custom identifiers if any
    # Let's list the values of pdf_id
    pdf_ids = []
    for item in data:
        # Some items might have pdf_id, some might have other fields
        val = item.get("pdf_id") or item.get("id_in_pdf") or item.get("id")
        if val is not None:
            try:
                pdf_ids.append(int(val))
            except:
                pass
                
    pdf_ids = sorted(list(set(pdf_ids)))
    
    # Find missing numbers in range 1 to expected
    missing = []
    for i in range(1, expected + 1):
        if i not in pdf_ids:
            missing.append(i)
            
    print(f"Year {yr}:")
    print(f"  Expected: {expected} | Actual parsed: {actual}")
    print(f"  First item keys: {keys}")
    if missing:
        print(f"  Missing question numbers in PDF range (1-{expected}): {len(missing)} questions missing")
        # Print first 20 missing numbers and summarize the rest
        if len(missing) <= 20:
            print(f"    IDs: {missing}")
        else:
            print(f"    IDs (first 20): {missing[:20]} ... (total {len(missing)} missing)")
    else:
        print(f"  No missing question numbers in range 1-{expected}.")
    print("-" * 50)
