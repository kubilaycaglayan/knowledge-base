create table boards (
    id uuid primary key,
    user_id uuid not null references app_user(id) on delete cascade,
    name varchar(120) not null,
    archived_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint board_name_not_blank check (length(trim(name)) > 0)
);

create table board_statuses (
    id uuid primary key,
    board_id uuid not null references boards(id) on delete cascade,
    name varchar(80) not null,
    position integer not null default 0,
    archived_at timestamptz,
    constraint board_status_name_not_blank check (length(trim(name)) > 0),
    unique (board_id, name)
);

create table board_cards (
    id uuid primary key,
    board_id uuid not null references boards(id) on delete cascade,
    status_id uuid not null references board_statuses(id),
    title varchar(240) not null default '',
    body text not null default '{}',
    priority varchar(10) not null default 'MEDIUM',
    start_date date,
    due_date date,
    position integer not null default 0,
    archived_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint board_card_priority check (priority in ('LOW','MEDIUM','HIGH','URGENT')),
    constraint board_card_dates check (due_date is null or start_date is null or due_date >= start_date)
);

create table board_card_paths (
    card_id uuid not null references board_cards(id) on delete cascade,
    path_id uuid not null references path(id),
    primary key (card_id, path_id)
);

create table board_card_labels (
    card_id uuid not null references board_cards(id) on delete cascade,
    label_id uuid not null references labels(id),
    primary key (card_id, label_id)
);

create index boards_user_idx on boards(user_id, updated_at desc);
create index board_status_board_idx on board_statuses(board_id, position);
create index board_card_board_status_idx on board_cards(board_id, status_id, position);
create index board_card_dates_idx on board_cards(board_id, start_date, due_date);

insert into label_scope (label_id, scope)
select id, 'BOARD' from labels where false;
