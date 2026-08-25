create table tag (
    id uuid primary key,
    user_id uuid not null references app_user(id) on delete cascade,
    name varchar(80) not null,
    constraint tag_user_name_unique unique (user_id, name)
);

create table item_tag (
    item_id uuid not null references item(id) on delete cascade,
    tag_id uuid not null references tag(id) on delete cascade,
    primary key (item_id, tag_id)
);

create table note (
    id uuid primary key,
    user_id uuid not null references app_user(id) on delete cascade,
    path_id uuid references path(id) on delete cascade,
    item_id uuid references item(id) on delete cascade,
    activity_id uuid,
    title varchar(240) not null,
    content text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint note_target check ((path_id is not null)::integer + (item_id is not null)::integer + (activity_id is not null)::integer <= 1)
);

create table activity (
    id uuid primary key,
    user_id uuid not null references app_user(id) on delete cascade,
    path_id uuid references path(id) on delete set null,
    item_id uuid references item(id) on delete set null,
    type varchar(40) not null,
    title varchar(240) not null,
    detail text,
    occurred_at timestamptz not null default now()
);

create table progress_entry (
    id uuid primary key,
    user_id uuid not null references app_user(id) on delete cascade,
    item_id uuid not null references item(id) on delete cascade,
    previous_progress smallint not null,
    new_progress smallint not null,
    changed_at timestamptz not null default now(),
    constraint progress_values check (previous_progress between 0 and 100 and new_progress between 0 and 100)
);

create table time_entry (
    id uuid primary key,
    user_id uuid not null references app_user(id) on delete cascade,
    path_id uuid references path(id) on delete set null,
    item_id uuid references item(id) on delete set null,
    started_at timestamptz not null,
    ended_at timestamptz,
    duration_seconds bigint,
    description varchar(500),
    source varchar(30) not null,
    created_at timestamptz not null default now(),
    constraint time_entry_duration check (duration_seconds is null or duration_seconds >= 0),
    constraint time_entry_order check (ended_at is null or ended_at >= started_at)
);

create unique index one_running_timer_per_user on time_entry(user_id) where ended_at is null;
create index note_user_updated_idx on note(user_id, updated_at desc);
create index activity_user_occurred_idx on activity(user_id, occurred_at desc);
create index progress_item_changed_idx on progress_entry(item_id, changed_at desc);
create index time_user_started_idx on time_entry(user_id, started_at desc);
create index item_tag_tag_idx on item_tag(tag_id);
