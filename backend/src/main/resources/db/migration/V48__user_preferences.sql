-- Settings a user adjusts in the web app, stored so they follow the user
-- across browsers and devices. A missing row means the defaults.
create table user_preferences (
    user_id uuid primary key references app_user(id) on delete cascade,
    theme varchar(8) not null default 'auto',
    kanban_wide boolean not null default false,
    updated_at timestamptz not null default now(),
    constraint user_preferences_theme check (theme in ('auto', 'light', 'dark'))
);
