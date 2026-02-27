const FILE_DB_NAME = "nemetzComplianceFiles";
const FILE_DB_VERSION = 1;
const FILE_STORE_NAME = "files";

type StoredFileRecord = {
  id: string;
  blob: Blob;
  filename: string;
  mime?: string;
  sizeKb?: number;
  createdAt: string;
};

let dbPromise: Promise<IDBDatabase | null> | null = null;

function canUseIndexedDb() {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

function openDb() {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve) => {
    if (!canUseIndexedDb()) {
      resolve(null);
      return;
    }

    try {
      const request = window.indexedDB.open(FILE_DB_NAME, FILE_DB_VERSION);

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(FILE_STORE_NAME)) {
          database.createObjectStore(FILE_STORE_NAME, { keyPath: "id" });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        resolve(null);
      };

      request.onblocked = () => {
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });

  return dbPromise;
}

async function runRequest<T>(
  mode: IDBTransactionMode,
  execute: (store: IDBObjectStore) => IDBRequest<T>
) {
  const database = await openDb();
  if (!database) {
    throw new Error("indexeddb_unavailable");
  }

  return new Promise<T>((resolve, reject) => {
    try {
      const transaction = database.transaction(FILE_STORE_NAME, mode);
      const store = transaction.objectStore(FILE_STORE_NAME);
      const request = execute(store);

      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        reject(request.error ?? new Error("indexeddb_request_failed"));
      };
      transaction.onerror = () => {
        reject(transaction.error ?? new Error("indexeddb_transaction_failed"));
      };
    } catch (error) {
      reject(error);
    }
  });
}

export async function initFileDb(): Promise<void> {
  await openDb();
}

export async function putFile(id: string, file: File): Promise<void> {
  const record: StoredFileRecord = {
    id,
    blob: file,
    filename: file.name,
    mime: file.type || undefined,
    sizeKb: Math.max(1, Math.ceil(file.size / 1024)),
    createdAt: new Date().toISOString()
  };

  await runRequest("readwrite", (store) => store.put(record));
}

export async function getFile(
  id: string
): Promise<{ blob: Blob; filename: string; mime?: string } | null> {
  if (!canUseIndexedDb()) {
    return null;
  }

  try {
    const record = await runRequest<StoredFileRecord | undefined>("readonly", (store) =>
      store.get(id)
    );

    if (!record) {
      return null;
    }

    return {
      blob: record.blob,
      filename: record.filename,
      mime: record.mime
    };
  } catch {
    return null;
  }
}

export async function deleteFile(id: string): Promise<void> {
  if (!canUseIndexedDb()) {
    return;
  }
  try {
    await runRequest("readwrite", (store) => store.delete(id));
  } catch {
    // ignore in prototype mode
  }
}

export async function clearAllFiles(): Promise<void> {
  if (!canUseIndexedDb()) {
    return;
  }
  try {
    await runRequest("readwrite", (store) => store.clear());
  } catch {
    // ignore in prototype mode
  }
}
