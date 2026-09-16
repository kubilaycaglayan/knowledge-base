create table tracker_draft (
    user_id uuid primary key references app_user(id) on delete cascade,
    path_id uuid references path(id) on delete set null,
    description varchar(5000)
);
create table tracker_draft_label (
    user_id uuid not null references tracker_draft(user_id) on delete cascade,
    label_id uuid not null references labels(id) on delete cascade,
    primary key (user_id, label_id)
);
