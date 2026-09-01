"""
Dataset Organizer & Catalog Generator for ML Training
Organizes collected audio samples into the exact directory hierarchy:
  dataset/
  ├── trigger_word/<speaker>/
  └── negative_word/
      ├── rhyming/<speaker>/
      └── general/<speaker>/

Generates metadata.db (SQLite) and dataset_catalog.csv
"""

import os
import csv
import sqlite3
import json
import urllib.request
import re

# Database / Metadata Output Paths
DATASET_DIR = os.path.join(os.path.dirname(__file__), "dataset")
CSV_PATH = os.path.join(os.path.dirname(__file__), "dataset_catalog.csv")
SQLITE_PATH = os.path.join(os.path.dirname(__file__), "metadata.db")

def init_sqlite_db():
    conn = sqlite3.connect(SQLITE_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS dataset_catalog (
            file_id TEXT PRIMARY KEY,
            file_path TEXT NOT NULL,
            speaker_name TEXT NOT NULL,
            word_spoken TEXT NOT NULL,
            category TEXT NOT NULL,
            environment TEXT NOT NULL,
            duration_ms INTEGER NOT NULL,
            created_at TEXT NOT NULL
        )
    """)
    conn.commit()
    return conn

def sanitize_name(name):
    return re.sub(r'[^a-z0-9]', '_', str(name).lower())

def organize_sample_record(record, conn, csv_writer):
    speaker = sanitize_name(record.get('name', 'anonymous'))
    word = sanitize_name(record.get('targetword', 'word'))
    category = record.get('category', 'Trigger Word')
    has_noise = record.get('hasbackgroundnoise', False)
    env_str = 'noisy_environment' if has_noise else 'silent_room'
    env_tag = 'noisy' if has_noise else 'silent'
    audio_url = record.get('audiourl', '')
    duration_ms = record.get('durationMs', 1000)
    created_at = record.get('createdAT', '')
    file_id = record.get('id', re.sub(r'[^a-z0-9]', '', f"{speaker}_{word}_{created_at}"))

    # Map category to folder structure
    if category == 'Trigger Word':
        folder_path = os.path.join(DATASET_DIR, "trigger_word", speaker)
        cat_tag = "trigger_word"
    elif category == 'Rhyming Word':
        folder_path = os.path.join(DATASET_DIR, "negative_word", "rhyming", speaker)
        cat_tag = "rhyming_word"
    else:
        folder_path = os.path.join(DATASET_DIR, "negative_word", "general", speaker)
        cat_tag = "general_negative"

    os.makedirs(folder_path, exist_ok=True)

    # Standardized filename: <speaker>_<word>_<env>_<id>.wav
    file_name = f"{speaker}_{word}_{env_tag}_{file_id[:6]}.wav"
    relative_path = os.path.join(os.path.relpath(folder_path, os.path.dirname(__file__)), file_name)
    full_disk_path = os.path.join(folder_path, file_name)

    # Download audio clip if URL available
    if audio_url and not os.path.exists(full_disk_path):
        try:
            print(f"Downloading clip for '{word}' by '{speaker}'...")
            urllib.request.urlretrieve(audio_url, full_disk_path)
        except Exception as e:
            print(f"Download failed for {audio_url}: {e}")

    # Write to CSV
    csv_writer.writerow([
        file_id, relative_path, speaker, word, cat_tag, env_str, duration_ms, created_at
    ])

    # Write to SQLite
    cursor = conn.cursor()
    cursor.execute("""
        INSERT OR REPLACE INTO dataset_catalog 
        (file_id, file_path, speaker_name, word_spoken, category, environment, duration_ms, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (file_id, relative_path, speaker, word, cat_tag, env_str, duration_ms, created_at))
    conn.commit()

def main():
    print("=" * 60)
    print("Dataset Organizer & Catalog Generator for ML Lead")
    print("=" * 60)

    os.makedirs(DATASET_DIR, exist_ok=True)
    conn = init_sqlite_db()

    csv_file = open(CSV_PATH, 'w', newline='', encoding='utf-8')
    csv_writer = csv.writer(csv_file)
    csv_writer.writerow([
        "file_id", "file_path", "speaker_name", "word_spoken", 
        "category", "environment", "duration_ms", "created_at"
    ])

    print(f"Output Directory: {DATASET_DIR}")
    print(f"CSV Catalog:     {CSV_PATH}")
    print(f"SQLite DB:       {SQLITE_PATH}")

    csv_file.close()
    conn.close()
    print("\nDataset preparation script ready.")

if __name__ == "__main__":
    main()
