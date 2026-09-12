alter table logs add column import_batch_id uuid references import_batch(id) on delete set null;
create index logs_import_batch_idx on logs(import_batch_id);
