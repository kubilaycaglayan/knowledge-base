alter table import_batch drop constraint import_batch_source;

alter table import_batch
    add constraint import_batch_source check (source in ('IMPORT', 'KNOWLEDGE_BASE'));
