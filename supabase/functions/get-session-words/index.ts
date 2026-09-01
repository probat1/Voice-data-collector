// ====================================================
// SUPABASE EDGE FUNCTION: get-session-words
// Path: supabase/functions/get-session-words/index.ts
// ====================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-collector-pin",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Word List Configuration
const CONFIG = {
  trigger_word: "SURAKSHA",
  rhyming_words: ["SURAKSHIT", "RAKSHA", "SURPLUS", "AKASHA"],
  negative_words: ["LAPTOP", "BOTTLE", "WINDOW", "LIGHT", "METRO", "COLLEGE", "CHARGER", "CAMPUS", "WATER", "TABLE"],
  authorized_pin: "1234"
};

serve(async (req: Request) => {
  // Handle CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const url = new URL(req.url);
    const pinHeader = req.headers.get("x-collector-pin");

    // PIN Security Check
    if (pinHeader && pinHeader !== CONFIG.authorized_pin) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid PIN header." }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const speakerName = (url.searchParams.get("speaker") || "anonymous").trim().toLowerCase();

    // Initialize Supabase Client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Fetch counts of collected rhyming words
    const { data: samples } = await supabase
      .from("voiceSample")
      .select("targetword")
      .in("targetword", CONFIG.rhyming_words);

    const rhymingCounts: Record<string, number> = {};
    CONFIG.rhyming_words.forEach(w => (rhymingCounts[w] = 0));
    (samples || []).forEach((s: { targetword: string }) => {
      const word = (s.targetword || "").toUpperCase();
      if (rhymingCounts[word] !== undefined) rhymingCounts[word]++;
    });

    // 2. Select 2 LEAST recorded rhyming words for dataset balance
    const sortedRhymes = [...CONFIG.rhyming_words].sort((a, b) => rhymingCounts[a] - rhymingCounts[b]);
    const selectedRhymes = sortedRhymes.slice(0, 2);

    // 3. Select 2 RANDOM negative words
    const shuffledNegatives = [...CONFIG.negative_words].sort(() => 0.5 - Math.random());
    const selectedNegatives = shuffledNegatives.slice(0, 2);

    const payload = {
      speaker: speakerName,
      trigger_word: CONFIG.trigger_word,
      rhyming_words: selectedRhymes,
      negative_words: selectedNegatives
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });

  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
