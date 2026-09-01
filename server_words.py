from fastapi import FastAPI, HTTPException, Header, Query, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import json
import re
import random
from collections import defaultdict
from typing import Optional, List
import os

app = FastAPI(
    title="Voice Data Collector Backend API",
    description="Word Balancing Engine, Speaker Search, and Dataset Protocol Management",
    version="1.0.0"
)

# Enable CORS for security
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Update to specific domain in production
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# ----------------------------------------------------
# Load Config
# ----------------------------------------------------
CONFIG_PATH = os.path.join(os.path.dirname(__file__), "words_config.json")

def load_config():
    if not os.path.exists(CONFIG_PATH):
        return {
            "trigger_word": "suraksha",
            "rhyming_words": ["surakshit", "raksha", "surplus", "akasha"],
            "negative_words": ["laptop", "bottle", "window", "light", "metro", "college", "charger", "campus"],
            "authorized_pin": "1234"
        }
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

CONFIG = load_config()

# In-memory speaker database (Persistent to file/DB in production)
SPEAKERS_DB = ["rahul", "priya", "alex", "vikram", "ananya", "siddharth", "meera", "rohit"]

# In-memory tracking of rhyming word counts
rhyming_counts = defaultdict(int)

# ----------------------------------------------------
# Security & Safety Helpers
# ----------------------------------------------------
def sanitize_string(text: str) -> str:
    """Sanitizes text inputs to prevent injection attacks and path traversal."""
    if not text:
        return ""
    # Strip dangerous path characters and allow alphanumeric, spaces, underscores, hyphens
    sanitized = re.sub(r"[^a-zA-Z0-9_\-\s]", "", text).strip()
    return sanitized

def verify_pin_header(x_collector_pin: Optional[str] = Header(None)):
    """Verifies that requests supply the authorized collector PIN."""
    expected_pin = CONFIG.get("authorized_pin", "1234")
    if x_collector_pin != expected_pin:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-Collector-PIN authorization header."
        )
    return True

# ----------------------------------------------------
# Models
# ----------------------------------------------------
class SpeakerCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=50, description="Speaker name")

class SpeakerSearchResponse(BaseModel):
    total: int
    speakers: List[str]

class SessionWordsResponse(BaseModel):
    speaker: str
    trigger_word: str
    rhyming_words: List[str]
    negative_words: List[str]

# ----------------------------------------------------
# Speaker Management & Search Endpoints
# ----------------------------------------------------

@app.get("/api/speakers", response_model=SpeakerSearchResponse)
def search_speakers(
    search: Optional[str] = Query(None, description="Search term for speaker name"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0)
):
    """
    Fast speaker search endpoint for long lists.
    Supports case-insensitive search filtering and pagination.
    """
    sanitized_search = sanitize_string(search) if search else ""
    
    if sanitized_search:
        results = [s for s in SPEAKERS_DB if sanitized_search.lower() in s.lower()]
    else:
        results = list(SPEAKERS_DB)

    total_count = len(results)
    paginated_results = results[offset : offset + limit]

    return {
        "total": total_count,
        "speakers": [s.capitalize() for s in paginated_results]
    }

@app.post("/api/speakers", status_code=status.HTTP_201_CREATED)
def create_speaker(
    req: SpeakerCreateRequest,
    authorized: bool = Depends(verify_pin_header)
):
    """Registers a new speaker profile in the system."""
    clean_name = sanitize_string(req.name).lower()
    if not clean_name:
        raise HTTPException(status_code=400, detail="Invalid speaker name format.")
    
    if clean_name not in SPEAKERS_DB:
        SPEAKERS_DB.append(clean_name)

    return {"message": "Speaker registered successfully", "name": clean_name.capitalize()}

# ----------------------------------------------------
# Word Balancing Engine Endpoint
# ----------------------------------------------------

@app.get("/api/session-words", response_model=SessionWordsResponse)
def get_balanced_session_words(speaker: str = Query("anonymous")):
    """
    Returns balanced 5-step words for a session:
    - 1 Custom Trigger Word
    - 2 Least Recorded Rhyming Words
    - 2 Random Negative Words
    """
    clean_speaker = sanitize_string(speaker).lower() or "anonymous"

    trigger = CONFIG.get("trigger_word", "suraksha")
    rhyming_pool = CONFIG.get("rhyming_words", ["surakshit", "raksha"])
    negative_pool = CONFIG.get("negative_words", ["laptop", "bottle"])

    # 1. Pick 2 least recorded rhyming words
    sorted_rhymes = sorted(rhyming_pool, key=lambda w: rhyming_counts[w])
    selected_rhymes = sorted_rhymes[:2]

    # Increment historical count
    for w in selected_rhymes:
        rhyming_counts[w] += 1

    # 2. Pick 2 random negative words
    selected_negatives = random.sample(negative_pool, min(2, len(negative_pool)))

    return {
        "speaker": clean_speaker.capitalize(),
        "trigger_word": trigger.upper(),
        "rhyming_words": [w.upper() for w in selected_rhymes],
        "negative_words": [w.upper() for w in selected_negatives]
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server_words:app", host="0.0.0.0", port=8000, reload=True)
