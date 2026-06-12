import json
import os

topics_json_path = "/Users/sain/development/openmedq/frontend/src/lib/topics.json"
seed_sql_path = "/Users/sain/development/openmedq/backend/dist/neet_pg_pyqs_seed.sql"

# Load topics from topics.json
with open(topics_json_path, "r", encoding="utf-8") as f:
    topics = json.load(f)

# Filter for missing topics
missing_topics = [t for t in topics if t['id'] > 2823]

print(f"Found {len(missing_topics)} missing topics to insert.")

# Read existing seed SQL
with open(seed_sql_path, "r", encoding="utf-8") as f:
    existing_sql = f.read()

# Generate INSERT statements for missing topics
topics_sql_parts = []
for t in missing_topics:
    escaped_name = t['name'].replace("'", "''")
    topics_sql_parts.append(f"({t['id']}, {t['subjectId']}, '{escaped_name}')")

topics_sql = ""
if topics_sql_parts:
    topics_sql = "-- Seeding Missing Topics (IDs > 2823)\n"
    # Chunk them to avoid very long SQL statements
    chunk_size = 200
    for i in range(0, len(topics_sql_parts), chunk_size):
        chunk = topics_sql_parts[i:i+chunk_size]
        topics_sql += "INSERT OR IGNORE INTO topics (id, subject_id, name) VALUES\n" + ",\n".join(chunk) + ";\n"
    topics_sql += "\n"

# Rewrite the seed SQL file with topics inserted first
# Let's insert topics_sql right after the header lines
lines = existing_sql.split("\n")
header_lines = []
content_start_idx = 0
for idx, line in enumerate(lines):
    if line.strip().startswith("--") or not line.strip():
        header_lines.append(line)
    else:
        content_start_idx = idx
        break

header_str = "\n".join(header_lines) + "\n\n"
content_str = "\n".join(lines[content_start_idx:])

patched_sql = header_str + topics_sql + content_str

with open(seed_sql_path, "w", encoding="utf-8") as f:
    f.write(patched_sql)

print("Successfully patched neet_pg_pyqs_seed.sql with missing topics!")
