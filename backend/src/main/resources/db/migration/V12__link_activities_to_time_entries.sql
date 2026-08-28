alter table activity add column time_entry_id uuid references time_entry(id) on delete cascade;

create index activity_time_entry_idx on activity(time_entry_id);
