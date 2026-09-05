create table daily_record (
    id uuid primary key,
    user_id uuid not null references app_user(id) on delete cascade,
    record_date date not null,
    note text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint daily_record_user_date_unique unique (user_id, record_date),
    constraint daily_record_note_not_blank check (note is null or length(trim(note)) > 0)
);

create table daily_label (
    id uuid primary key,
    user_id uuid not null references app_user(id) on delete cascade,
    name varchar(80) not null,
    color varchar(7),
    created_at timestamptz not null default now(),
    constraint daily_label_color_format check (color is null or color ~ '^#[0-9A-Fa-f]{6}$')
);

create unique index daily_label_user_name_unique on daily_label(user_id, lower(name));

create table daily_record_label (
    daily_record_id uuid not null references daily_record(id) on delete cascade,
    daily_label_id uuid not null references daily_label(id) on delete cascade,
    portion numeric(3,2),
    primary key (daily_record_id, daily_label_id),
    constraint daily_record_label_portion check (
        portion is null or portion in (0.25, 0.50, 0.75, 1.00)
    )
);

create index daily_record_user_date_idx on daily_record(user_id, record_date);
create index daily_record_label_label_idx on daily_record_label(daily_label_id);
