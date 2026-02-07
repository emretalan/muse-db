-- User picks tracking
CREATE TABLE user_picks (
  id SERIAL PRIMARY KEY,
  session_id UUID NOT NULL,
  movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  filters JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_user_picks_session_id ON user_picks(session_id);
CREATE INDEX idx_user_picks_created_at ON user_picks(created_at);
