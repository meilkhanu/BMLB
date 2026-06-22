CREATE INDEX IF NOT EXISTS idx_posts_status_published ON posts(status, published_at);
CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts(slug);
CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(status, category_id, published_at);
CREATE INDEX IF NOT EXISTS idx_posts_updated ON posts(updated_at);
CREATE INDEX IF NOT EXISTS idx_comments_target ON comments(target_slug, created_at);
CREATE INDEX IF NOT EXISTS idx_songs_sort ON songs(sort_order, id);
