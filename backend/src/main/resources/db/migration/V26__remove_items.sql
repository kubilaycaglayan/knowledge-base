delete from item_event
where type in ('ITEM_CREATED', 'ITEM_COMPLETED', 'PROGRESS_CHANGED');

alter table note drop constraint if exists note_target;
alter table note drop column if exists item_id;
alter table note add constraint note_target check (
    (path_id is not null)::integer
    + (item_event_id is not null)::integer
    + (time_entry_id is not null)::integer
    <= 1
);

alter table item_event drop column if exists item_id;

drop table if exists time_entry_item;
drop table if exists progress_entry;
drop table if exists item_tag;
drop table if exists path_item;
drop table if exists item;
