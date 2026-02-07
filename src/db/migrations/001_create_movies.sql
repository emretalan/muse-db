-- Movies table
CREATE TABLE movies (
  id SERIAL PRIMARY KEY,
  tmdb_id INTEGER NOT NULL UNIQUE,
  title VARCHAR(500) NOT NULL,
  original_title VARCHAR(500),
  year SMALLINT,
  runtime SMALLINT,
  synopsis TEXT,
  poster_path VARCHAR(255),
  vote_average DECIMAL(3,1) DEFAULT 0,
  vote_count INTEGER DEFAULT 0,
  original_language VARCHAR(10),
  adult BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for filtering
CREATE INDEX idx_movies_tmdb_id ON movies(tmdb_id);
CREATE INDEX idx_movies_year ON movies(year);
CREATE INDEX idx_movies_vote_average ON movies(vote_average);
CREATE INDEX idx_movies_vote_count ON movies(vote_count);
CREATE INDEX idx_movies_runtime ON movies(runtime);
CREATE INDEX idx_movies_adult ON movies(adult);
CREATE INDEX idx_movies_original_language ON movies(original_language);
