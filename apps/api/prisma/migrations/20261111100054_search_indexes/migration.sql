-- Full-text search over post content. Expression indexes (not represented in schema.prisma):
-- queries must use exactly the same expressions to hit them.
CREATE INDEX "posts_search_idx" ON "posts"
  USING GIN (to_tsvector('english'::regconfig, coalesce("content", '')));

-- Fuzzy / substring people search ("ada" finds "Adam Smith" and "Nadia").
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "users_name_trgm_idx" ON "users"
  USING GIN ((lower("first_name" || ' ' || "last_name")) gin_trgm_ops);
