import os
import json

packs_dir = "/Users/sain/development/openmedq/backend/dist/r2-packs/packs"
r2_dir = "/Users/sain/development/openmedq/backend/dist/r2-packs"
years = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]

print("==================================================")
print("     SMART VALIDATOR FOR NEET PG PYQ PACKS")
print("==================================================")

all_passed = True

for yr in years:
    filename = f"neet_pg_{yr}.json"
    filepath = os.path.join(packs_dir, filename)
    if not os.path.exists(filepath):
        print(f"❌ {filename}: File not found!")
        all_passed = False
        continue
        
    with open(filepath, "r", encoding="utf-8") as f:
        try:
            data = json.load(f)
        except Exception as e:
            print(f"❌ {filename}: Failed to parse JSON: {e}")
            all_passed = False
            continue
            
    print(f"\nAnalyzing {filename} ({len(data)} questions):")
    
    expected_count = 300 if yr in [2018, 2019, 2020] else 200
    if yr == 2024:
        expected_count = 142 # 142 unique recall questions across all three sources
        
    if len(data) != expected_count:
        print(f"  ⚠️ Question count mismatch: Expected {expected_count}, got {len(data)}")
        all_passed = False
    else:
        print(f"  ✅ Question count matches: {len(data)}")
        
    errors = []
    warnings = []
    seen_texts = {}
    
    for idx, q in enumerate(data):
        q_label = f"Question #{idx+1} (ID: {q.get('id', 'N/A')})"
        
        # 1. Check required fields
        for field in ['id', 'questionText', 'opa', 'opb', 'opc', 'opd', 'correctOption', 'subjectId', 'topicId', 'examType', 'examYear', 'explanation']:
            if field not in q:
                errors.append(f"{q_label} is missing required field: '{field}'")
            elif q[field] is None or (isinstance(q[field], str) and not q[field].strip()):
                errors.append(f"{q_label} has empty field: '{field}'")
                
        # 2. Check correctOption range
        if 'correctOption' in q and q['correctOption'] not in [0, 1, 2, 3]:
            errors.append(f"{q_label} has invalid correctOption value: {repr(q['correctOption'])} (must be 0, 1, 2, or 3)")
            
        # 3. Check duplicate option text
        options = [q.get('opa'), q.get('opb'), q.get('opc'), q.get('opd')]
        if all(isinstance(o, str) for o in options):
            clean_opts = [o.strip().lower() for o in options]
            for i in range(len(clean_opts)):
                for j in range(i + 1, len(clean_opts)):
                    if clean_opts[i] == clean_opts[j] and clean_opts[i]:
                        warnings.append(f"{q_label} has duplicate option content: {repr(options[i])} for Option {chr(ord('A')+i)} and {chr(ord('A')+j)}")
                        
        # 4. Check duplicate question text
        q_text = q.get('questionText', '').strip().lower()
        if q_text:
            if q_text in seen_texts:
                warnings.append(f"{q_label} is a duplicate of Question #{seen_texts[q_text]+1} (matching questionText)")
            else:
                seen_texts[q_text] = idx
                
        # 5. Check image reference exists
        if 'imageUrl' in q and q['imageUrl']:
            img_path = os.path.join(r2_dir, q['imageUrl'])
            if not os.path.exists(img_path):
                errors.append(f"{q_label} references non-existent image: {q['imageUrl']}")
                
    # Report errors & warnings
    if errors:
        print(f"  ❌ Errors found ({len(errors)}):")
        for err in errors[:10]:
            print(f"    - {err}")
        if len(errors) > 10:
            print(f"    ... and {len(errors)-10} more errors")
        all_passed = False
    else:
        print("  ✅ Zero field errors or invalid options.")
        
    if warnings:
        print(f"  ⚠️ Warnings found ({len(warnings)}):")
        for warn in warnings[:10]:
            print(f"    - {warn}")
        if len(warnings) > 10:
            print(f"    ... and {len(warnings)-10} more warnings")
            
    # Sample a question for inspection
    if data:
        sample = data[0]
        print(f"  Sample Check (PDF ID / Index 0):")
        print(f"    Text: {sample.get('questionText', '')[:120]}...")
        print(f"    A: {sample.get('opa', '')} | B: {sample.get('opb', '')} | C: {sample.get('opc', '')} | D: {sample.get('opd', '')}")
        print(f"    Correct Option: {sample.get('correctOption', 'N/A')} | Explanation: {sample.get('explanation', '')[:80]}...")
        if sample.get('imageUrl'):
            print(f"    Image: {sample.get('imageUrl')}")

print("\n==================================================")
if all_passed:
    print("🎉 SUCCESS: All existing files are fully valid!")
else:
    print("⚠️ WARNING: Gaps or validation errors found in existing packs.")
print("==================================================")
