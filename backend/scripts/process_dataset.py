import os
import sys
import json
import argparse
import re
from datasets import load_dataset
from tqdm import tqdm

# Subject Mapping from UI/Curriculum
SUBJECT_MAPPING = {
    'anatomy': ('Anatomy', 1),
    'biochemistry': ('Biochemistry', 2),
    'physiology': ('Physiology', 3),
    'pharmacology': ('Pharmacology', 4),
    'pathology': ('Pathology', 5),
    'microbiology': ('Microbiology', 6),
    'forensic medicine': ('Forensic Medicine', 7),
    'preventive & social medicine': ('Social & Preventive Medicine', 8),
    'preventive and social medicine': ('Social & Preventive Medicine', 8),
    'social & preventive medicine': ('Social & Preventive Medicine', 8),
    'psm': ('Social & Preventive Medicine', 8),
    'ophthalmology': ('Ophthalmology', 9),
    'ent': ('ENT', 10),
    'medicine': ('General Medicine', 11),
    'general medicine': ('General Medicine', 11),
    'surgery': ('General Surgery', 12),
    'general surgery': ('General Surgery', 12),
    'obstetrics & gynecology': ('Obstetrics & Gynecology', 13),
    'obstetrics and gynecology': ('Obstetrics & Gynecology', 13),
    'gynaecology & obstetrics': ('Obstetrics & Gynecology', 13),
    'o&g': ('Obstetrics & Gynecology', 13),
    'pediatrics': ('Pediatrics', 14),
    'orthopedics': ('Orthopedics', 15),
    'orthopaedics': ('Orthopedics', 15),
    'dermatology': ('Dermatology', 16),
    'skin': ('Dermatology', 16),
    'psychiatry': ('Psychiatry', 17),
    'radiology': ('Radiology', 18),
    'anesthesia': ('Anesthesia', 19),
    'anaesthesia': ('Anesthesia', 19),
    'dental': ('Dental', 20),
}

# Standardized subjects list
SUBJECTS_LIST = [
    {"id": 1, "name": "Anatomy"},
    {"id": 2, "name": "Biochemistry"},
    {"id": 3, "name": "Physiology"},
    {"id": 4, "name": "Pharmacology"},
    {"id": 5, "name": "Pathology"},
    {"id": 6, "name": "Microbiology"},
    {"id": 7, "name": "Forensic Medicine"},
    {"id": 8, "name": "Social & Preventive Medicine"},
    {"id": 9, "name": "Ophthalmology"},
    {"id": 10, "name": "ENT"},
    {"id": 11, "name": "General Medicine"},
    {"id": 12, "name": "General Surgery"},
    {"id": 13, "name": "Obstetrics & Gynecology"},
    {"id": 14, "name": "Pediatrics"},
    {"id": 15, "name": "Orthopedics"},
    {"id": 16, "name": "Dermatology"},
    {"id": 17, "name": "Psychiatry"},
    {"id": 18, "name": "Radiology"},
    {"id": 19, "name": "Anesthesia"},
    {"id": 20, "name": "Dental"},
    {"id": 21, "name": "General/Other"}
]

def clean_html(text):
    if not text:
        return ""
    # Remove simple HTML tags
    clean = re.compile('<.*?>')
    return re.sub(clean, '', str(text)).strip()

def clean_year(year_val):
    if not year_val:
        return None
    try:
        y = int(year_val)
        if 1900 <= y <= 2030:
            return y
    except (ValueError, TypeError):
        pass
    return None

def main():
    parser = argparse.ArgumentParser(description="Process MedMCQA dataset into static R2 JSON packs and D1 seeds")
    parser.add_argument("--limit", type=int, default=None, help="Limit the number of questions to process (for testing)")
    parser.add_argument("--out-dir", type=str, default="backend/dist", help="Output directory for generated files")
    args = parser.parse_args()

    # Ensure output directories exist
    r2_dir = os.path.join(args.out_dir, "r2-packs")
    packs_dir = os.path.join(r2_dir, "packs")
    os.makedirs(packs_dir, exist_ok=True)

    print("Loading openlifescienceai/medmcqa from Hugging Face...")
    # Load dataset train and validation splits
    try:
        dataset_dict = load_dataset("openlifescienceai/medmcqa")
    except Exception as e:
        print(f"Error: Failed to load dataset 'openlifescienceai/medmcqa'. Details: {e}", file=sys.stderr)
        sys.exit(1)
    
    # Combine train and validation splits
    splits_to_use = ['train', 'validation']
    records = []
    
    for split in splits_to_use:
        if split in dataset_dict:
            print(f"Loading {split} split ({len(dataset_dict[split])} records)...")
            records.extend(dataset_dict[split])
            
    print(f"Total raw records loaded: {len(records)}")

    # We will process records
    if args.limit:
        print(f"Limiting to first {args.limit} records for dry-run...")
        records = records[:args.limit]

    # Structuring data
    subjects_counts = {s["id"]: 0 for s in SUBJECTS_LIST}
    topics_map = {}  # (subject_id, topic_name) -> topic_id
    topics_list = [] # List of unique topics
    topic_counter = 1
    
    # Store questions grouped by (subject_id, topic_id)
    questions_by_pack = {} # (subject_id, topic_id) -> list of questions
    # Store questions grouped by subject_id for bulk subject downloading
    questions_by_subject = {} # subject_id -> list of questions
    
    # To write to SQL questions seed
    questions_metadata = []

    skipped_empty = 0
    skipped_invalid_cop = 0
    
    print("Processing questions...")
    for idx, row in enumerate(tqdm(records)):
        question_text = clean_html(row.get('question', ''))
        opa = clean_html(row.get('opa', ''))
        opb = clean_html(row.get('opb', ''))
        opc = clean_html(row.get('opc', ''))
        opd = clean_html(row.get('opd', ''))
        
        # Validation checks
        if not question_text or not opa or not opb or not opc or not opd:
            skipped_empty += 1
            continue
            
        cop_val = row.get('cop')
        try:
            cop = int(cop_val)
            if cop not in [0, 1, 2, 3]:
                skipped_invalid_cop += 1
                continue
        except (ValueError, TypeError):
            skipped_invalid_cop += 1
            continue

        # Subject mapping
        sub_name = str(row.get('subject_name', '')).strip().lower()
        subject_id = 21  # Default to General/Other
        if sub_name in SUBJECT_MAPPING:
            subject_id = SUBJECT_MAPPING[sub_name][1]
            
        # Topic mapping
        topic_name = clean_html(row.get('topic_name', ''))
        if not topic_name:
            topic_name = "General Practice"
        else:
            # Capitalize first letter of each word for beauty
            topic_name = topic_name.strip().title()
            if topic_name in ["Testis & Scrotum", "Testis And Scrotum"]:
                topic_name = "Testis and Scrotum"
            elif topic_name == "Enterobecteriaceae":
                topic_name = "Enterobacteriaceae"
            elif topic_name == "Umblicial Cord And Diaphragm":
                topic_name = "Umbilical Cord And Diaphragm"

        topic_key = (subject_id, topic_name)
        if topic_key not in topics_map:
            topic_id = topic_counter
            topics_map[topic_key] = topic_id
            topics_list.append({
                "id": topic_id,
                "subjectId": subject_id,
                "name": topic_name,
                "count": 0
            })
            topic_counter += 1
        else:
            topic_id = topics_map[topic_key]

        # Year and Exam mapping
        exam_type = clean_html(row.get('exam_name'))
        if not exam_type:
            exam_type = None
        exam_year = clean_year(row.get('year'))

        explanation = clean_html(row.get('exp', ''))
        
        # Increment counts
        subjects_counts[subject_id] += 1
        # Update topic count (we will update the list object after the loop)
        
        q_id = idx + 1  # Standard 1-based index for clean sequential IDs
        
        q_obj = {
            "id": q_id,
            "questionText": question_text,
            "opa": opa,
            "opb": opb,
            "opc": opc,
            "opd": opd,
            "correctOption": cop,
            "subjectId": subject_id,
            "topicId": topic_id,
            "examType": exam_type,
            "examYear": exam_year,
            "explanation": explanation
        }
        
        pack_key = (subject_id, topic_id)
        if pack_key not in questions_by_pack:
            questions_by_pack[pack_key] = []
        questions_by_pack[pack_key].append(q_obj)
        
        # Subject grouping for bulk download
        if subject_id not in questions_by_subject:
            questions_by_subject[subject_id] = []
        questions_by_subject[subject_id].append(q_obj)
        
        # Meta for D1 database index
        questions_metadata.append({
            "id": q_id,
            "subject_id": subject_id,
            "topic_id": topic_id,
            "exam_type": exam_type,
            "exam_year": exam_year
        })

    print(f"\nProcessing Complete!")
    print(f"Skipped (missing text/options): {skipped_empty}")
    print(f"Skipped (invalid correct option): {skipped_invalid_cop}")
    print(f"Valid questions retained: {len(questions_metadata)}")

    # Update counts in topics_list
    for topic in topics_list:
        sub_id = topic["subjectId"]
        top_name = topic["name"]
        pack_q_list = questions_by_pack.get((sub_id, topic["id"]), [])
        topic["count"] = len(pack_q_list)

    # Filter out topics with 0 questions (if any)
    topics_list = [t for t in topics_list if t["count"] > 0]
    
    # Save subjects list (with updated question counts)
    subjects_out = []
    for s in SUBJECTS_LIST:
        subjects_out.append({
            "id": s["id"],
            "name": s["name"],
            "count": subjects_counts[s["id"]]
        })
        
    print(f"Saving subjects.json ({len(subjects_out)} subjects)...")
    with open(os.path.join(r2_dir, "subjects.json"), "w", encoding="utf-8") as f:
        json.dump(subjects_out, f, indent=2, ensure_ascii=False)

    print(f"Saving topics.json ({len(topics_list)} topics)...")
    with open(os.path.join(r2_dir, "topics.json"), "w", encoding="utf-8") as f:
        json.dump(topics_list, f, indent=2, ensure_ascii=False)

    # Save individual R2 JSON packs
    print("Saving question packs to dist/r2-packs/packs/...")
    for pack_key, pack_qs in tqdm(questions_by_pack.items(), desc="Writing JSON Packs"):
        sub_id, top_id = pack_key
        pack_filename = f"subject_{sub_id}_topic_{top_id}.json"
        pack_path = os.path.join(packs_dir, pack_filename)
        with open(pack_path, "w", encoding="utf-8") as f:
            json.dump(pack_qs, f, ensure_ascii=False)

    print("Saving bulk subject packs to dist/r2-packs/packs/...")
    for sub_id, sub_qs in tqdm(questions_by_subject.items(), desc="Writing Subject Packs"):
        pack_filename = f"subject_{sub_id}.json"
        pack_path = os.path.join(packs_dir, pack_filename)
        with open(pack_path, "w", encoding="utf-8") as f:
            json.dump(sub_qs, f, ensure_ascii=False)

    # Generate D1 SQL seed script
    seed_sql_path = os.path.join(args.out_dir, "d1-seed.sql")
    print(f"Generating D1 SQLite seed file at {seed_sql_path}...")
    
    with open(seed_sql_path, "w", encoding="utf-8") as f:
        f.write("-- OpenMedQ SQLite D1 Database Seeding Script\n")
        f.write("-- Auto-generated by process_dataset.py\n\n")
        
        # Clear existing data optionally (uncomment if we want clean overwrite during dev)
        f.write("DELETE FROM questions;\n")
        f.write("DELETE FROM topics;\n")
        f.write("DELETE FROM subjects;\n\n")
        
        # Seed Subjects
        f.write("-- Seeding Subjects\n")
        for s in SUBJECTS_LIST:
            # Escape strings to prevent sql injection/errors
            escaped_name = s['name'].replace("'", "''")
            f.write(f"INSERT INTO subjects (id, name) VALUES ({s['id']}, '{escaped_name}');\n")
        f.write("\n")

        # Seed Topics
        f.write("-- Seeding Topics\n")
        for t in topics_list:
            escaped_name = t['name'].replace("'", "''")
            f.write(f"INSERT INTO topics (id, subject_id, name) VALUES ({t['id']}, {t['subjectId']}, '{escaped_name}');\n")
        f.write("\n")

        # Seed Questions Metadata in Bulk (500 rows per statement)
        f.write("-- Seeding Questions Index\n")
        chunk_size = 500
        for i in range(0, len(questions_metadata), chunk_size):
            chunk = questions_metadata[i:i+chunk_size]
            values_str = []
            for q in chunk:
                escaped_exam = q['exam_type'].replace("'", "''") if q['exam_type'] else "NULL"
                exam_val = f"'{escaped_exam}'" if q['exam_type'] else "NULL"
                year_val = str(q['exam_year']) if q['exam_year'] else "NULL"
                values_str.append(f"({q['id']}, {q['subject_id']}, {q['topic_id']}, {exam_val}, {year_val})")
            
            f.write(f"INSERT INTO questions (id, subject_id, topic_id, exam_type, exam_year) VALUES\n" + ",\n".join(values_str) + ";\n")
            
    print(f"D1 Seed script written successfully to {seed_sql_path}")
    print("Processing script completed successfully!")

if __name__ == "__main__":
    main()
