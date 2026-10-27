-- Full note bodies can exceed PostgreSQL's B-tree index tuple size.  Substring
-- searches use note_content_text_search_trgm_idx and user-scoped note indexes
-- remain available for filtering and ordering.
drop index if exists note_user_content_text_idx;
