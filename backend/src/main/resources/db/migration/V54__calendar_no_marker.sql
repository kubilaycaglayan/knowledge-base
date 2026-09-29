alter table daily_record_label drop constraint daily_record_label_portion;
alter table daily_record_label add constraint daily_record_label_portion check (
    portion is null or portion in (0.00, 0.25, 0.50, 0.75, 1.00)
);
