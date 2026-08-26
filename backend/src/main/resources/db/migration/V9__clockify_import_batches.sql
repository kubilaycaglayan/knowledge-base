create table import_batch (
    id uuid primary key,
    user_id uuid not null references app_user(id) on delete cascade,
    source varchar(30) not null,
    imported_count integer not null default 0,
    skipped_count integer not null default 0,
    created_paths_count integer not null default 0,
    created_at timestamptz not null default now(),
    undone_at timestamptz,
    constraint import_batch_source check (source in ('IMPORT'))
);

alter table time_entry add column import_batch_id uuid references import_batch(id) on delete set null;
alter table activity add column import_batch_id uuid references import_batch(id) on delete set null;
alter table path add column import_batch_id uuid references import_batch(id) on delete set null;

create index import_batch_user_created_idx on import_batch(user_id, created_at desc);
create index time_entry_import_batch_idx on time_entry(import_batch_id);
create index activity_import_batch_idx on activity(import_batch_id);
