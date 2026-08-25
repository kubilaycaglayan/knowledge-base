create extension if not exists pg_trgm;

create index path_name_search_trgm_idx on path using gin (lower(name) gin_trgm_ops);
create index item_title_search_trgm_idx on item using gin (lower(title) gin_trgm_ops);
create index note_title_search_trgm_idx on note using gin (lower(title) gin_trgm_ops);
create index note_content_search_trgm_idx on note using gin (lower(content) gin_trgm_ops);
create index activity_title_search_trgm_idx on activity using gin (lower(title) gin_trgm_ops);
create index activity_detail_search_trgm_idx on activity using gin (lower(coalesce(detail, '')) gin_trgm_ops);
