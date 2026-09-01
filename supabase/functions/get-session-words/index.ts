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

// Word List Configuration (Loaded from hey_nexus_updated_dataset.csv)
const CONFIG = {
  trigger_word: "Hey Nexus",
  rhyming_words: [
    "Hey", "Nexus", "Say Lexus", "Play Texas", "Hey Plexus", "Grey Hexes", 
    "They Flex Us", "Ray Vexes", "Weigh Taxes", "Hey Sexes", "Pay Taxes", 
    "May Text Us", "Hey Excess", "Say Flexes", "Play Tetris", "Hey Next Is", 
    "Day Wrecks Us", "Bay Texas", "Spray Hexes", "Lay Tracks", "Stray Mechs", 
    "Way Next Is", "Hey Focus", "Pay Check Is", "Stay Restless", "Next", "Heys", "Texans"
  ],
  negative_words: [
    "Turn on the lights", "Turn off the fan", "Set a timer", "What time is it", "Play some music", "Stop listening", "Volume up", "Volume down", "Mute", "Next song", "Previous song", "Pause", "Resume", "Read my messages", "Send an email", "Call mom", "Check the weather", "Is it raining", "Lock the door", "Open the garage", "Start the vacuum", "Stop the robot", "Where are my keys", "I am going to the store", "What is for dinner", "I need a coffee", "Can you hear me", "Hold on a second", "I will be right back", "See you tomorrow", "Have a good night", "Did you lock the door", "Turn off the TV", "Wash the dishes", "Wake me up at seven", "Where is my phone", "I am running late", "I was thinking", "Maybe we should", "Did you know", "I don't understand", "Let's go outside", "Are you ready", "I am tired", "This is great", "What do you mean", "I forgot", "Can you help me", "It is over there", "Look at this", "That makes sense", "I have a question", "No way", "Yes please", "Thank you", "You're welcome", "Excuse me", "Computer", "System", "Machine", "Device", "Phone", "Tablet", "Screen", "Run", "Walk", "Jump", "Sit", "Stand", "Speak", "Listen", "Red", "Green", "Blue", "Yellow", "Black", "White", "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Good morning", "Good afternoon", "Good evening", "Good night", "Hello", "Hi", "Hey there", "Greetings", "Farewell", "Goodbye", "See you later", "Take care", "Have a good day", "What's up", "Not much", "How are you", "I am fine", "Where are you", "I am here", "Let's eat", "I am hungry", "I am thirsty", "Water please", "Coffee", "Tea", "Breakfast", "Lunch", "Dinner", "Snack", "Dessert", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "Table", "Chair", "Window", "Door", "House", "Car", "Street", "Book", "Pen", "Vanakkam", "Eppadi irukkinga", "Saaptingala", "Sari", "Illa", "Namaste", "Haan", "Nahi", "Theek hai", "Chalo"
  ],
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
      .select("targetword");

    const rhymingCounts: Record<string, number> = {};
    CONFIG.rhyming_words.forEach(w => (rhymingCounts[w.toLowerCase()] = 0));
    (samples || []).forEach((s: { targetword: string }) => {
      const word = (s.targetword || "").toLowerCase();
      if (rhymingCounts[word] !== undefined) rhymingCounts[word]++;
    });

    // 2. Select 2 LEAST recorded rhyming words for dataset balance
    const sortedRhymes = [...CONFIG.rhyming_words].sort((a, b) => (rhymingCounts[a.toLowerCase()] || 0) - (rhymingCounts[b.toLowerCase()] || 0));
    const selectedRhymes = sortedRhymes.slice(0, 2);

    // 3. Select 2 RANDOM negative words
    const shuffledNegatives = [...CONFIG.negative_words].sort(() => 0.5 - Math.random());
    const selectedNegatives = shuffledNegatives.slice(0, 2);

    const payload = {
      speaker: speakerName,
      trigger_word: CONFIG.trigger_word.toUpperCase(),
      rhyming_words: selectedRhymes.map(w => w.toUpperCase()),
      negative_words: selectedNegatives.map(w => w.toUpperCase())
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
