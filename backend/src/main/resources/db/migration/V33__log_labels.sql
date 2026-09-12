alter table logs drop column if exists favorite;

alter table label_scope drop constraint label_scope_value;
alter table label_scope add constraint label_scope_value check (scope in ('NOTE', 'CALENDAR', 'TIME_ENTRY', 'LOG'));

create table log_label (
    log_id uuid not null references logs(id) on delete cascade,
    label_id uuid not null references labels(id) on delete cascade,
    primary key (log_id, label_id)
);

create index log_label_label_idx on log_label(label_id, log_id);
