/*
# Fix RLS policies for no-auth client_id-based access

## Problem
The previous migration used `current_setting('request.header.x-client-id')`
for RLS ownership checks. This does not work with the standard Supabase JS
client, which does not send custom headers. The app has no sign-in screen,
so there is no `auth.uid()` to use for ownership either.

## Solution
Since this is a single-tenant no-auth app where all data is intentionally
shared (the app itself filters by `client_id` in queries), we use `USING (true)`
policies with `TO anon, authenticated`. This is the documented pattern for
no-auth apps. The `client_id` column is used for logical partitioning in
client-side queries, not for RLS enforcement.

The `submit_score` RPC remains `SECURITY DEFINER` for atomic stats updates.

## Changes
- Drop all existing policies on game_sessions, seen_questions, player_stats, leaderboard.
- Recreate with `USING (true)` / `WITH CHECK (true)` for `TO anon, authenticated`.
*/

-- game_sessions
DROP POLICY IF EXISTS "select_own_sessions" ON game_sessions;
DROP POLICY IF EXISTS "insert_own_sessions" ON game_sessions;
DROP POLICY IF EXISTS "update_own_sessions" ON game_sessions;
DROP POLICY IF EXISTS "delete_own_sessions" ON game_sessions;

CREATE POLICY "select_sessions" ON game_sessions FOR SELECT
  TO anon, authenticated USING (true);
CREATE POLICY "insert_sessions" ON game_sessions FOR INSERT
  TO anon, authenticated WITH CHECK (true);
CREATE POLICY "update_sessions" ON game_sessions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_sessions" ON game_sessions FOR DELETE
  TO anon, authenticated USING (true);

-- seen_questions
DROP POLICY IF EXISTS "select_own_seen" ON seen_questions;
DROP POLICY IF EXISTS "insert_own_seen" ON seen_questions;
DROP POLICY IF EXISTS "delete_own_seen" ON seen_questions;

CREATE POLICY "select_seen" ON seen_questions FOR SELECT
  TO anon, authenticated USING (true);
CREATE POLICY "insert_seen" ON seen_questions FOR INSERT
  TO anon, authenticated WITH CHECK (true);
CREATE POLICY "delete_seen" ON seen_questions FOR DELETE
  TO anon, authenticated USING (true);

-- player_stats
DROP POLICY IF EXISTS "select_own_stats" ON player_stats;
DROP POLICY IF EXISTS "insert_own_stats" ON player_stats;
DROP POLICY IF EXISTS "update_own_stats" ON player_stats;

CREATE POLICY "select_stats" ON player_stats FOR SELECT
  TO anon, authenticated USING (true);
CREATE POLICY "insert_stats" ON player_stats FOR INSERT
  TO anon, authenticated WITH CHECK (true);
CREATE POLICY "update_stats" ON player_stats FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

-- leaderboard
DROP POLICY IF EXISTS "read_leaderboard" ON leaderboard;
DROP POLICY IF EXISTS "insert_own_leaderboard" ON leaderboard;

CREATE POLICY "read_leaderboard" ON leaderboard FOR SELECT
  TO anon, authenticated USING (true);
CREATE POLICY "insert_leaderboard" ON leaderboard FOR INSERT
  TO anon, authenticated WITH CHECK (true);
