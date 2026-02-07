-- Change session_id from UUID to TEXT to support Firebase UIDs
ALTER TABLE user_picks ALTER COLUMN session_id TYPE TEXT;
