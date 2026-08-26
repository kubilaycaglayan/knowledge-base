do $$
declare
    legacy record;
    batch_id uuid;
begin
    for legacy in
        select user_id, date_trunc('minute', created_at) as imported_at, count(*) as imported_count
        from time_entry
        where source = 'IMPORT' and import_batch_id is null
        group by user_id, date_trunc('minute', created_at)
        order by date_trunc('minute', created_at)
    loop
        batch_id := gen_random_uuid();
        insert into import_batch (id, user_id, source, imported_count, skipped_count, created_paths_count, created_at)
        values (batch_id, legacy.user_id, 'IMPORT', legacy.imported_count, 0, 0, legacy.imported_at);

        update time_entry
        set import_batch_id = batch_id
        where user_id = legacy.user_id
          and source = 'IMPORT'
          and import_batch_id is null
          and date_trunc('minute', created_at) = legacy.imported_at;

        update activity a
        set import_batch_id = batch_id
        where a.user_id = legacy.user_id
          and a.import_batch_id is null
          and a.title = 'Imported Clockify session'
          and exists (
              select 1
              from time_entry t
              where t.import_batch_id = batch_id
                and t.user_id = a.user_id
                and (t.path_id is not distinct from a.path_id)
                and t.started_at = a.occurred_at
          );
    end loop;
end $$;
