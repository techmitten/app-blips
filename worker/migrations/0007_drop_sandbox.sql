-- The per-user Render sandbox ("agent computer") was removed before it was
-- ever switched on, so these columns were always empty. The Node store
-- (electron/server/hosted/store.js) drops them the same way.
alter table accounts drop column sandbox_id;
alter table accounts drop column sandbox_snapshot_id;
