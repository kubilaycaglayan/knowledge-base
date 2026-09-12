create table logs (
    id uuid primary key,
    user_id uuid not null references app_user(id) on delete cascade,
    body text not null,
    occurred_at timestamptz not null,
    version bigint not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint logs_body_not_blank check (length(trim(body)) > 0),
    constraint logs_body_length check (length(body) <= 20000)
);

create index logs_user_occurred_at_idx on logs(user_id, occurred_at desc, id desc);
