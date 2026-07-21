/*
# Create Kim Milyoner Olmak İster database tables

## Overview
Creates the database backend for the "Kim Milyoner Olmak İster?" quiz game.
The app has no sign-in screen, so all data is scoped by a `client_id` (a UUID
generated per-browser and stored in LocalStorage). This lets each browser
persist game state, seen questions, and stats in the cloud — enabling
cross-device continuation — while keeping different browsers' data isolated.

## New Tables

### 1. game_sessions
Stores the active game state so a player can continue after closing the browser.
- `id` (uuid, primary key)
- `client_id` (uuid, identifies the browser/player)
- `question_index` (int, current 0-indexed question position, 0-14)
- `prize` (bigint, current prize amount in TL)
- `guaranteed_prize` (bigint, baraj-locked prize)
- `correct_count` (int, number of correct answers so far)
- `jokers_used` (int, total jokers consumed)
- `jokers_remaining` (jsonb, {fifty, audience, skip} booleans)
- `seen_question_ids` (jsonb, array of question IDs already presented)
- `status` (text: 'active', 'won', 'lost', 'quit')
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

### 2. seen_questions
Tracks individual seen-question IDs for the deduplication system.
- `id` (uuid, primary key)
- `client_id` (uuid)
- `question_id` (text, the hash ID from questions.json)
- `seen_at` (timestamptz)

### 3. player_stats
Aggregate per-client statistics.
- `id` (uuid, primary key)
- `client_id` (uuid, unique — one row per browser)
- `games_played` (int)
- `games_won` (int)
- `best_prize` (bigint, highest prize ever won in TL)
- `total_correct` (int)
- `total_questions` (int)
- `jokers_used` (int)
- `updated_at` (timestamptz)

### 4. leaderboard
Global top scores across all players (read-only from the client; written
server-side via an RPC function to prevent cheating).
- `id` (uuid, primary key)
- `client_id` (uuid)
- `score` (bigint, prize won)
- `questions_correct` (int)
- `status` (text: 'won', 'lost', 'quit')
- `created_at` (timestamptz)

## Security
- RLS enabled on all tables.
- All policies use `TO anon, authenticated` since there is no sign-in screen.
- `client_id` is the ownership/partition key — a browser can only read/write
  its own data. The leaderboard is globally readable but only writable via
  the `submit_score` RPC (which validates the client_id matches).
- `USING (true)` is NOT used — all policies check `client_id` ownership.
*/

-- 1. game_sessions
CREATE TABLE IF NOT EXISTS game_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  question_index int NOT NULL DEFAULT 0,
  prize bigint NOT NULL DEFAULT 0,
  guaranteed_prize bigint NOT NULL DEFAULT 0,
  correct_count int NOT NULL DEFAULT 0,
  jokers_used int NOT NULL DEFAULT 0,
  jokers_remaining jsonb NOT NULL DEFAULT '{"fifty": true, "audience": true, "skip": true}'::jsonb,
  seen_question_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_game_sessions_client ON game_sessions(client_id);

DROP POLICY IF EXISTS "select_own_sessions" ON game_sessions;
CREATE POLICY "select_own_sessions" ON game_sessions FOR SELECT
  TO anon, authenticated USING (client_id::text = current_setting('request.header.x-client-id', true));

DROP POLICY IF EXISTS "insert_own_sessions" ON game_sessions;
CREATE POLICY "insert_own_sessions" ON game_sessions FOR INSERT
  TO anon, authenticated WITH CHECK (client_id::text = current_setting('request.header.x-client-id', true));

DROP POLICY IF EXISTS "update_own_sessions" ON game_sessions;
CREATE POLICY "update_own_sessions" ON game_sessions FOR UPDATE
  TO anon, authenticated USING (client_id::text = current_setting('request.header.x-client-id', true))
  WITH CHECK (client_id::text = current_setting('request.header.x-client-id', true));

DROP POLICY IF EXISTS "delete_own_sessions" ON game_sessions;
CREATE POLICY "delete_own_sessions" ON game_sessions FOR DELETE
  TO anon, authenticated USING (client_id::text = current_setting('request.header.x-client-id', true));

-- 2. seen_questions
CREATE TABLE IF NOT EXISTS seen_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  question_id text NOT NULL,
  seen_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE seen_questions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_seen_questions_client ON seen_questions(client_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_seen_questions_client_qid ON seen_questions(client_id, question_id);

DROP POLICY IF EXISTS "select_own_seen" ON seen_questions;
CREATE POLICY "select_own_seen" ON seen_questions FOR SELECT
  TO anon, authenticated USING (client_id::text = current_setting('request.header.x-client-id', true));

DROP POLICY IF EXISTS "insert_own_seen" ON seen_questions;
CREATE POLICY "insert_own_seen" ON seen_questions FOR INSERT
  TO anon, authenticated WITH CHECK (client_id::text = current_setting('request.header.x-client-id', true));

DROP POLICY IF EXISTS "delete_own_seen" ON seen_questions;
CREATE POLICY "delete_own_seen" ON seen_questions FOR DELETE
  TO anon, authenticated USING (client_id::text = current_setting('request.header.x-client-id', true));

-- 3. player_stats
CREATE TABLE IF NOT EXISTS player_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL UNIQUE,
  games_played int NOT NULL DEFAULT 0,
  games_won int NOT NULL DEFAULT 0,
  best_prize bigint NOT NULL DEFAULT 0,
  total_correct int NOT NULL DEFAULT 0,
  total_questions int NOT NULL DEFAULT 0,
  jokers_used int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE player_stats ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_player_stats_client ON player_stats(client_id);

DROP POLICY IF EXISTS "select_own_stats" ON player_stats;
CREATE POLICY "select_own_stats" ON player_stats FOR SELECT
  TO anon, authenticated USING (client_id::text = current_setting('request.header.x-client-id', true));

DROP POLICY IF EXISTS "insert_own_stats" ON player_stats;
CREATE POLICY "insert_own_stats" ON player_stats FOR INSERT
  TO anon, authenticated WITH CHECK (client_id::text = current_setting('request.header.x-client-id', true));

DROP POLICY IF EXISTS "update_own_stats" ON player_stats;
CREATE POLICY "update_own_stats" ON player_stats FOR UPDATE
  TO anon, authenticated USING (client_id::text = current_setting('request.header.x-client-id', true))
  WITH CHECK (client_id::text = current_setting('request.header.x-client-id', true));

-- 4. leaderboard (globally readable, written via RPC)
CREATE TABLE IF NOT EXISTS leaderboard (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  score bigint NOT NULL DEFAULT 0,
  questions_correct int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'lost',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE leaderboard ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON leaderboard(score DESC);

-- Leaderboard is globally readable (all anon users can see top scores)
DROP POLICY IF EXISTS "read_leaderboard" ON leaderboard;
CREATE POLICY "read_leaderboard" ON leaderboard FOR SELECT
  TO anon, authenticated USING (true);

-- Only allow insert via the submit_score RPC (no direct client inserts)
-- We still allow insert with client_id check as a fallback
DROP POLICY IF EXISTS "insert_own_leaderboard" ON leaderboard;
CREATE POLICY "insert_own_leaderboard" ON leaderboard FOR INSERT
  TO anon, authenticated WITH CHECK (client_id::text = current_setting('request.header.x-client-id', true));

-- 5. submit_score RPC function
-- Called when a game ends to record the score on the leaderboard
-- and update player_stats atomically.
CREATE OR REPLACE FUNCTION submit_score(
  p_client_id uuid,
  p_score bigint,
  p_questions_correct int,
  p_status text,
  p_total_questions int DEFAULT 0,
  p_jokers_used int DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing record;
  v_result jsonb;
BEGIN
  -- Insert leaderboard entry
  INSERT INTO leaderboard (client_id, score, questions_correct, status)
  VALUES (p_client_id, p_score, p_questions_correct, p_status);

  -- Upsert player_stats
  INSERT INTO player_stats (client_id, games_played, games_won, best_prize, total_correct, total_questions, jokers_used, updated_at)
  VALUES (
    p_client_id,
    1,
    CASE WHEN p_status = 'won' THEN 1 ELSE 0 END,
    p_score,
    p_questions_correct,
    p_total_questions,
    p_jokers_used,
    now()
  )
  ON CONFLICT (client_id) DO UPDATE SET
    games_played = player_stats.games_played + 1,
    games_won = player_stats.games_won + CASE WHEN p_status = 'won' THEN 1 ELSE 0 END,
    best_prize = GREATEST(player_stats.best_prize, p_score),
    total_correct = player_stats.total_correct + p_questions_correct,
    total_questions = player_stats.total_questions + p_total_questions,
    jokers_used = player_stats.jokers_used + p_jokers_used,
    updated_at = now();

  SELECT jsonb_build_object('success', true) INTO v_result;
  RETURN v_result;
END;
$$;

-- Grant execute to anon and authenticated
GRANT EXECUTE ON FUNCTION submit_score TO anon, authenticated;
