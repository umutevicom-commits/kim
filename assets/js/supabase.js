/**
 * Supabase client — cloud persistence for game state, seen questions,
 * stats, and leaderboard. Uses the anon key (no auth).
 * Falls back gracefully to LocalStorage/IndexedDB when offline.
 *
 * NOTE: Anon key is intentionally public — it is designed to be embedded
 * in client-side code. RLS policies enforce data access rules server-side.
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

const SUPABASE_URL = 'https://ieqeioopwnicsszeeycs.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllcWVpb29wd25pY3NzemVleWNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2NDMwNDMsImV4cCI6MjEwMDIxOTA0M30.8yggcMaQkQRXFLTNO0-UrsEsFezClEKcCWnIJH2aDbw';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const isCloudEnabled = () => true;

const CLIENT_ID_KEY = 'kmo_client_id';

/** Get or create a persistent client ID for this browser. */
export function getClientId() {
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

// ---- Game Sessions ----

export async function saveSession(state) {
  const clientId = getClientId();
  try {
    await supabase.from('game_sessions').upsert({
      client_id: clientId,
      question_index: state.questionIndex,
      prize: state.prize,
      guaranteed_prize: state.guaranteedPrize,
      correct_count: state.correctCount,
      jokers_used: state.jokersUsed,
      jokers_remaining: state.jokers,
      seen_question_ids: state.seenIds || [],
      status: 'active',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'client_id' });
  } catch (e) {
    console.warn('saveSession cloud failed', e);
  }
}

export async function loadSession() {
  const clientId = getClientId();
  try {
    const { data, error } = await supabase
      .from('game_sessions')
      .select('*')
      .eq('client_id', clientId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  } catch (e) {
    console.warn('loadSession cloud failed', e);
    return null;
  }
}

export async function clearSession() {
  const clientId = getClientId();
  try {
    await supabase.from('game_sessions')
      .delete()
      .eq('client_id', clientId);
  } catch (e) {
    console.warn('clearSession cloud failed', e);
  }
}

// ---- Seen Questions ----

export async function syncSeenQuestions(questionIds) {
  if (!questionIds || questionIds.length === 0) return;
  const clientId = getClientId();
  try {
    const rows = questionIds.map(qid => ({ client_id: clientId, question_id: qid }));
    await supabase.from('seen_questions')
      .upsert(rows, { onConflict: 'client_id,question_id', ignoreDuplicates: true });
  } catch (e) {
    console.warn('syncSeenQuestions failed', e);
  }
}

export async function getSeenQuestionIds() {
  const clientId = getClientId();
  try {
    const { data, error } = await supabase
      .from('seen_questions')
      .select('question_id')
      .eq('client_id', clientId);
    if (error) throw error;
    return (data || []).map(r => r.question_id);
  } catch (e) {
    console.warn('getSeenQuestionIds failed', e);
    return [];
  }
}

// ---- Stats ----

export async function submitScore(score, questionsCorrect, status, totalQuestions, jokersUsed) {
  try {
    const { error } = await supabase.rpc('submit_score', {
      p_client_id: getClientId(),
      p_score: score,
      p_questions_correct: questionsCorrect,
      p_status: status,
      p_total_questions: totalQuestions,
      p_jokers_used: jokersUsed,
    });
    if (error) throw error;
  } catch (e) {
    console.warn('submitScore failed', e);
  }
}

export async function getStats() {
  const clientId = getClientId();
  try {
    const { data, error } = await supabase
      .from('player_stats')
      .select('*')
      .eq('client_id', clientId)
      .maybeSingle();
    if (error) throw error;
    return data;
  } catch (e) {
    console.warn('getStats failed', e);
    return null;
  }
}

// ---- Leaderboard ----

export async function getLeaderboard(limit = 10) {
  try {
    const { data, error } = await supabase
      .from('leaderboard')
      .select('score, questions_correct, status, created_at')
      .order('score', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.warn('getLeaderboard failed', e);
    return [];
  }
}
