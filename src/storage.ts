import type { HistoryEntry, Run, Settings, SourceOverride } from "./types";
import { currentMatch } from "./engine";
const database = new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open("musicbracket", 1);
  request.onupgradeneeded = () => {
    for (const name of ["runs", "history", "settings", "sources"])
      request.result.createObjectStore(name);
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
async function readAll<T>(store: string): Promise<T[]> {
  const db = await database;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function put(store: string, key: string, value: unknown) {
  const db = await database;
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
async function remove(store: string, key: string) {
  const db = await database;
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
export const storage = {
  runs: () => readAll<Run>("runs"),
  history: () => readAll<HistoryEntry>("history"),
  saveRun: async (run: Run, { existing = false } = {}) => {
    const db = await database;
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction("runs", "readwrite"),
        store = tx.objectStore("runs"),
        request = store.getAll();
      let failure: string | undefined;
      request.onsuccess = () => {
        const list = request.result as Run[];
        if (existing && !list.some((r) => r.id === run.id)) {
          failure = "This run has been deleted.";
          tx.abort();
          return;
        }
        if (
          currentMatch(run) &&
          !list.some((r) => r.id === run.id && currentMatch(r)) &&
          list.filter((r) => currentMatch(r)).length >= 5
        ) {
          failure =
            "Five active runs are already saved. Finish or delete one before starting another.";
          tx.abort();
          return;
        }
        store.put(run, run.id);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(failure ? Error(failure) : tx.error);
    });
  },
  deleteRun: (id: string) => remove("runs", id),
  deleteHistory: (id: string) => remove("history", id),
  clearBrackets: async () => {
    const db = await database;
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["runs", "history"], "readwrite");
      tx.objectStore("runs").clear();
      tx.objectStore("history").clear();
      tx.oncomplete = () => resolve();
      tx.onabort = () =>
        reject(tx.error ?? Error("Saved brackets could not be cleared."));
    });
  },
  archive: async (entry: HistoryEntry) => {
    const db = await database;
    return new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction(["runs", "history"], "readwrite");
      const runs = tx.objectStore("runs");
      const request = runs.getKey(entry.id);
      let archived = false;
      request.onsuccess = () => {
        if (request.result === undefined) return;
        archived = true;
        tx.objectStore("history").put(entry, entry.id);
        runs.delete(entry.id);
      };
      tx.oncomplete = () => resolve(archived);
      tx.onabort = () => reject(tx.error);
    });
  },
  settings: async () => {
    const list = await readAll<Settings>("settings");
    return list[0];
  },
  saveSettings: (s: Settings) => put("settings", "preferences", s),
  sources: async () => {
    const db = await database;
    return new Promise<Record<string, SourceOverride>>((resolve, reject) => {
      const tx = db.transaction("sources");
      const os = tx.objectStore("sources");
      const keys = os.getAllKeys(),
        values = os.getAll();
      tx.oncomplete = () =>
        resolve(
          Object.fromEntries(values.result.map((v, i) => [keys.result[i], v])),
        );
      tx.onerror = () => reject(tx.error);
    });
  },
  saveSource: (id: string, s: SourceOverride) => put("sources", id, s),
};
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
