// The browser version's project storage: IndexedDB instead of localStorage,
// whose ~5 MB per site a few large projects (code plus every version) fill
// up. IndexedDB may use a large share of the disk. desktop.js serves reads
// from memory and sends changed rows here, the same way the desktop app
// sends them to disk.
//
// Database 'appblips-projects': store 'rows' (a project row by id) and store
// 'appData' (the generated app's own storage map, by project id). On first
// use, projects an older version kept in localStorage are copied in and then
// removed from localStorage.

const DB_NAME = 'appblips-projects';
const LEGACY_ROWS_KEY = 'orion-projects';
const LEGACY_APP_DATA_PREFIX = 'orion-preview-storage:';

const promised = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
const done = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error || new Error('The browser cancelled the save.'));
});

export const indexedDbAvailable = () => {
  try { return typeof indexedDB !== 'undefined' && indexedDB !== null; } catch { return false; }
};

export function createIdbProjectBackend({ idb = globalThis.indexedDB, storage = globalThis.localStorage } = {}) {
  let dbPromise = null;
  const open = () => {
    if (!dbPromise) {
      const request = idb.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('rows');
        request.result.createObjectStore('appData');
      };
      dbPromise = promised(request).catch((err) => {
        dbPromise = null;
        throw err;
      });
    }
    return dbPromise;
  };

  // Copies localStorage projects and app data in, then removes them there.
  // Rows already in IndexedDB win: they are newer than a leftover copy.
  const migrateLegacy = async (db) => {
    let rows = [];
    try { rows = JSON.parse(storage?.getItem(LEGACY_ROWS_KEY) || '[]'); } catch { rows = []; }
    const appDataKeys = [];
    for (let i = 0; i < (storage?.length || 0); i++) {
      const key = storage.key(i);
      if (key?.startsWith(LEGACY_APP_DATA_PREFIX)) appDataKeys.push(key);
    }
    if (!Array.isArray(rows)) rows = [];
    if (!rows.length && !appDataKeys.length) return;
    const tx = db.transaction(['rows', 'appData'], 'readwrite');
    const [rowKeys, dataKeys] = await Promise.all([
      promised(tx.objectStore('rows').getAllKeys()),
      promised(tx.objectStore('appData').getAllKeys()),
    ]);
    const existingRows = new Set(rowKeys);
    const existingData = new Set(dataKeys);
    for (const row of rows) {
      if (row && typeof row.id === 'string' && !existingRows.has(row.id)) tx.objectStore('rows').put(row, row.id);
    }
    for (const key of appDataKeys) {
      const id = key.slice(LEGACY_APP_DATA_PREFIX.length);
      try {
        const map = JSON.parse(storage.getItem(key));
        if (map && typeof map === 'object' && !Array.isArray(map) && !existingData.has(id)) tx.objectStore('appData').put(map, id);
      } catch { /* not valid JSON: nothing to keep */ }
    }
    await done(tx);
    // Only once IndexedDB has them.
    storage.removeItem(LEGACY_ROWS_KEY);
    for (const key of appDataKeys) storage.removeItem(key);
  };

  const write = async (store, id, value) => {
    const db = await open();
    const tx = db.transaction(store, 'readwrite');
    if (value === null) tx.objectStore(store).delete(id);
    else tx.objectStore(store).put(value, id);
    await done(tx);
  };

  return {
    // { projects: [{ row, appData }], orphanAppData: { id: map } }, the shape
    // the desktop app's bridge.projects.list() answers with.
    async list() {
      const db = await open();
      await migrateLegacy(db);
      // Ask the browser not to evict the projects when the disk runs low.
      globalThis.navigator?.storage?.persist?.().catch(() => {});
      const tx = db.transaction(['rows', 'appData'], 'readonly');
      const [rowKeys, rows, dataKeys, data] = await Promise.all([
        promised(tx.objectStore('rows').getAllKeys()),
        promised(tx.objectStore('rows').getAll()),
        promised(tx.objectStore('appData').getAllKeys()),
        promised(tx.objectStore('appData').getAll()),
      ]);
      const appData = new Map(dataKeys.map((id, i) => [id, data[i]]));
      const projects = rowKeys.map((id, i) => {
        const entry = { row: rows[i], appData: appData.get(id) || null };
        appData.delete(id);
        return entry;
      });
      return { projects, orphanAppData: Object.fromEntries(appData) };
    },
    // Settings → Reset: the whole database, once pending saves are done.
    async clearAll() {
      const db = await dbPromise?.catch(() => null);
      db?.close();
      dbPromise = null;
      await promised(idb.deleteDatabase(DB_NAME));
    },
    save: (row) => write('rows', row.id, row),
    delete: (id) => write('rows', id, null),
    saveAppData: (id, map) => write('appData', id, map),
  };
}
