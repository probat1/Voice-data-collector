import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://ethzeecixqtcfumnolly.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_sFQ1LqTF2CZ6y-ZnsGYu9Q_NILLEtSM';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
