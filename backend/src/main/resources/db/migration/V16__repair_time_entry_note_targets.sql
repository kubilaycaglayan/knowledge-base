-- A note that was attached to a legacy timer activity may have acquired a
-- time-entry target during V14. Keep the note attached to exactly one target.
update note n
set item_event_id = null
from item_event e
where n.item_event_id = e.id
  and n.time_entry_id is not null
  and e.time_entry_id = n.time_entry_id;
