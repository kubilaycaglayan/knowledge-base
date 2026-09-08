-- Consolidate note tags and calendar/session labels into one user-owned catalog.
create table labels (
    id uuid primary key,
    user_id uuid not null references app_user(id) on delete cascade,
    name varchar(80) not null,
    color varchar(7),
    created_at timestamptz not null default now(),
    constraint labels_color_format check (color is null or color ~ '^#[0-9A-Fa-f]{6}$')
);

create unique index labels_user_name_unique on labels(user_id, lower(name));

create table label_scope (
    label_id uuid not null references labels(id) on delete cascade,
    scope varchar(20) not null,
    primary key (label_id, scope),
    constraint label_scope_value check (scope in ('NOTE', 'CALENDAR', 'TIME_ENTRY'))
);

-- Preserve daily_label IDs because calendar and session assignments already use them.
insert into labels (id, user_id, name, color, created_at)
select id, user_id, name, color, created_at from daily_label;

insert into labels (id, user_id, name, color, created_at)
select t.id, t.user_id, t.name, null, now()
from tag t
where not exists (
    select 1 from labels l
    where l.user_id = t.user_id and lower(l.name) = lower(t.name)
)
and not exists (select 1 from labels l where l.id = t.id);

insert into label_scope (label_id, scope)
select id, 'CALENDAR' from labels
where exists (select 1 from daily_label d where d.id = labels.id);

insert into label_scope (label_id, scope)
select distinct daily_label_id, 'TIME_ENTRY' from time_entry_label;

insert into label_scope (label_id, scope)
select l.id, 'NOTE'
from tag t
join labels l on l.user_id = t.user_id and lower(l.name) = lower(t.name);

alter table note_tag drop constraint if exists note_tag_tag_id_fkey;
alter table daily_record_label drop constraint if exists daily_record_label_daily_label_id_fkey;
alter table time_entry_label drop constraint if exists time_entry_label_daily_label_id_fkey;

alter table note_tag rename to note_label;
alter table note_label rename column tag_id to label_id;
alter table daily_record_label rename column daily_label_id to label_id;
alter table time_entry_label rename column daily_label_id to label_id;

update note_label nl
set label_id = l.id
from tag t
join labels l on l.user_id = t.user_id and lower(l.name) = lower(t.name)
where nl.label_id = t.id;

alter table note_label add constraint note_label_label_id_fkey foreign key (label_id) references labels(id) on delete cascade;
alter table daily_record_label add constraint daily_record_label_label_id_fkey foreign key (label_id) references labels(id) on delete cascade;
alter table time_entry_label add constraint time_entry_label_label_id_fkey foreign key (label_id) references labels(id) on delete cascade;

alter table note_label rename constraint note_tag_pkey to note_label_pkey;
alter index if exists item_tag_tag_idx rename to item_tag_label_idx;
alter index if exists note_tag_tag_idx rename to note_label_label_idx;

drop table tag;
drop table daily_label;
