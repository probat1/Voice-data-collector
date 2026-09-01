-- ====================================================
-- VOICE DATA COLLECTOR - SUPABASE DATABASE SCHEMA & RLS
-- ====================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Speakers Table
CREATE TABLE IF NOT EXISTS public.speakers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Voice Samples Table
CREATE TABLE IF NOT EXISTS public."voiceSample" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    targetword TEXT NOT NULL,
    category TEXT NOT NULL,
    hasbackgroundnoise BOOLEAN DEFAULT FALSE,
    audiourl TEXT NOT NULL,
    audiopath TEXT NOT NULL,
    mimetype TEXT DEFAULT 'audio/wav',
    "durationMs" INTEGER DEFAULT 1000,
    "createdAT" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ====================================================
-- PERFORMANCE INDEXES (FOR FAST SEARCHING & BALANCING)
-- ====================================================
CREATE INDEX IF NOT EXISTS idx_speakers_name ON public.speakers (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_voice_sample_speaker ON public."voiceSample" (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_voice_sample_targetword ON public."voiceSample" (LOWER(targetword));
CREATE INDEX IF NOT EXISTS idx_voice_sample_category ON public."voiceSample" (category);

-- ====================================================
-- DATABASE FUNCTIONS (RPC) FOR SPEAKER SEARCH
-- ====================================================
CREATE OR REPLACE FUNCTION search_speakers_pg(
    search_term TEXT DEFAULT '',
    result_limit INT DEFAULT 20,
    result_offset INT DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT s.id, s.name, s.created_at
    FROM public.speakers s
    WHERE search_term = '' OR LOWER(s.name) LIKE '%' || LOWER(search_term) || '%'
    ORDER BY s.name ASC
    LIMIT result_limit OFFSET result_offset;
END;
$$;

-- ====================================================
-- ROW LEVEL SECURITY (RLS) & SAFETY POLICIES
-- ====================================================

-- Enable RLS on Tables
ALTER TABLE public.speakers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."voiceSample" ENABLE ROW LEVEL SECURITY;

-- Policy 1: Allow anyone to read speakers list (for dropdown search)
CREATE POLICY "Allow public read access to speakers"
ON public.speakers FOR SELECT
USING (true);

-- Policy 2: Allow insert of new speakers
CREATE POLICY "Allow public insert to speakers"
ON public.speakers FOR INSERT
WITH CHECK (length(trim(name)) >= 2);

-- Policy 3: Allow public read access to voice samples
CREATE POLICY "Allow public read access to voiceSample"
ON public."voiceSample" FOR SELECT
USING (true);

-- Policy 4: Allow insert of voice samples with non-empty fields
CREATE POLICY "Allow validated insert to voiceSample"
ON public."voiceSample" FOR INSERT
WITH CHECK (
    length(trim(name)) > 0 AND
    length(trim(targetword)) > 0 AND
    length(trim(audiourl)) > 0
);

-- ====================================================
-- SUPABASE STORAGE BUCKET RLS POLICIES
-- ====================================================
-- Note: Run these storage policies in Supabase Storage SQL Editor

-- 1. Create 'recordings' bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('recordings', 'recordings', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Allow public read access to recordings bucket
CREATE POLICY "Public Read Access for Recordings"
ON storage.objects FOR SELECT
USING (bucket_id = 'recordings');

-- 3. Allow upload access to recordings bucket
CREATE POLICY "Upload Access for Recordings"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'recordings');
