/*
# Add unique constraint on game_sessions.client_id

## Problem
The `saveSession` upsert uses `onConflict: 'client_id'`, but `client_id`
has no UNIQUE constraint, so the upsert falls back to INSERT — creating
duplicate rows instead of updating the existing one.

## Solution
Add a UNIQUE constraint on `game_sessions.client_id` so `upsert` with
`onConflict: 'client_id'` correctly updates the existing session row.
*/

-- Remove duplicates before adding constraint (safe: table is empty in prod)
DELETE FROM game_sessions
WHERE id NOT IN (
  SELECT DISTINCT ON (client_id) id FROM game_sessions ORDER BY client_id, updated_at DESC
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_game_sessions_client_unique
ON game_sessions(client_id);
