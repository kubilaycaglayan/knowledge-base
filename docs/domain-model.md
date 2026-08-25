# Domain model

`User` owns paths and items. `Path` and `Item` are intentionally separate resources; `path_item` provides many-to-many organization and `item_tag` provides arbitrary tags. Activities describe what happened, notes preserve knowledge, progress entries preserve change history, and time entries preserve work duration with explicit `WEB`, `IOS`, `CHROME_EXTENSION`, `MANUAL`, or `IMPORT` sources. A running timer is a server-owned time entry with one-active-timer-per-user enforced by the service and a PostgreSQL partial unique index.
