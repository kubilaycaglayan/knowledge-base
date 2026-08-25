alter table note add constraint note_activity_fk foreign key (activity_id) references activity(id) on delete set null;
create index progress_user_changed_idx on progress_entry(user_id, changed_at desc);
create index activity_item_occurred_idx on activity(item_id, occurred_at desc);
create index time_path_started_idx on time_entry(path_id, started_at desc);
create index time_item_started_idx on time_entry(item_id, started_at desc);
