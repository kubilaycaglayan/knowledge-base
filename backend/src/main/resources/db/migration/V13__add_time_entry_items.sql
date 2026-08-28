create table time_entry_item (
    time_entry_id uuid not null references time_entry(id) on delete cascade,
    item_id uuid not null references item(id) on delete cascade,
    primary key (time_entry_id, item_id)
);

insert into time_entry_item (time_entry_id, item_id)
select id, item_id
from time_entry
where item_id is not null
on conflict do nothing;

create index time_entry_item_item_idx on time_entry_item(item_id, time_entry_id);
create index time_entry_item_entry_idx on time_entry_item(time_entry_id);
