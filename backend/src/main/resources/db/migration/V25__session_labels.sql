create table time_entry_label (
    time_entry_id uuid not null references time_entry(id) on delete cascade,
    daily_label_id uuid not null references daily_label(id) on delete cascade,
    primary key (time_entry_id, daily_label_id)
);

create index time_entry_label_label_idx on time_entry_label(daily_label_id, time_entry_id);
create index time_entry_label_entry_idx on time_entry_label(time_entry_id);

-- Preserve item context as reusable labels before the item subsystem is retired.
-- Existing labels win on a case-insensitive name collision; otherwise the first
-- item with that name lends its UUID to the new label.
insert into daily_label (id, user_id, name, color, created_at)
select distinct on (i.user_id, lower(left(trim(i.title), 80)))
       i.id,
       i.user_id,
       left(trim(i.title), 80),
       null,
       i.created_at
from item i
where length(trim(i.title)) > 0
  and not exists (
      select 1
      from daily_label l
      where l.user_id = i.user_id
        and lower(l.name) = lower(left(trim(i.title), 80))
  )
order by i.user_id, lower(left(trim(i.title), 80)), i.created_at, i.id;

insert into time_entry_label (time_entry_id, daily_label_id)
select distinct tei.time_entry_id, l.id
from time_entry_item tei
join time_entry te on te.id = tei.time_entry_id
join item i on i.id = tei.item_id and i.user_id = te.user_id
join daily_label l
  on l.user_id = te.user_id
 and lower(l.name) = lower(left(trim(i.title), 80))
where length(trim(i.title)) > 0
on conflict do nothing;
