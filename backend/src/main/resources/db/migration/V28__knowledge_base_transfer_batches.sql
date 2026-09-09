alter table note add column import_batch_id uuid references import_batch(id) on delete set null;
alter table daily_record add column import_batch_id uuid references import_batch(id) on delete set null;
alter table labels add column import_batch_id uuid references import_batch(id) on delete set null;
