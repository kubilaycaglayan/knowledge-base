alter table time_entry add column external_id varchar(255);
create unique index time_entry_import_identity_unique on time_entry (user_id, source, external_id) where external_id is not null;
