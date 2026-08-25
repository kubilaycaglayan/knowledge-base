create table app_user (
    id uuid primary key,
    email varchar(320) not null unique,
    password_hash varchar(255) not null,
    display_name varchar(120) not null,
    created_at timestamptz not null default now()
);

create table path (
    id uuid primary key,
    user_id uuid not null references app_user(id),
    name varchar(160) not null,
    description text,
    status varchar(20) not null default 'ACTIVE',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    archived_at timestamptz,
    constraint path_status check (status in ('ACTIVE','ARCHIVED'))
);

create table item (
    id uuid primary key,
    user_id uuid not null references app_user(id),
    title varchar(240) not null,
    type varchar(30) not null default 'CUSTOM',
    description text,
    status varchar(20) not null default 'PLANNED',
    progress smallint not null default 0,
    started_at timestamptz,
    completed_at timestamptz,
    estimated_duration integer,
    parent_item_id uuid references item(id),
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint item_progress check (progress between 0 and 100),
    constraint item_status check (status in ('PLANNED','ACTIVE','PAUSED','COMPLETED','ABANDONED'))
);

create table path_item (
    path_id uuid not null references path(id) on delete cascade,
    item_id uuid not null references item(id) on delete cascade,
    position integer not null default 0,
    primary key (path_id, item_id)
);

create index path_user_idx on path(user_id, updated_at desc);
create index item_user_idx on item(user_id, updated_at desc);
create index path_item_item_idx on path_item(item_id);
