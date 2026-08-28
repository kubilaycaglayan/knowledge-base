drop index if exists time_item_started_idx;

alter table time_entry drop column item_id;
