-- Movie-Country junction table
CREATE TABLE movie_countries (
  movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  country_code VARCHAR(5) NOT NULL REFERENCES countries(code) ON DELETE CASCADE,
  PRIMARY KEY (movie_id, country_code)
);

CREATE INDEX idx_movie_countries_country_code ON movie_countries(country_code);
