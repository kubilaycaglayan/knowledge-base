delete from log_label
where label_id in (
    select id from labels
    where lower(name) = 'highlight'
);

delete from labels
where lower(name) = 'highlight';
