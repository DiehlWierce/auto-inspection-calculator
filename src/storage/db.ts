const DB_NAME = 'auto-inspection-calculator';
const DB_VERSION = 2;

export type StoreName = 'inspections' | 'config' | 'snapshots';
export const ALL_STORES: StoreName[] = ['inspections', 'config', 'snapshots'];

let connection: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (connection) return connection;
  const pending = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('inspections')) db.createObjectStore('inspections', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('config')) db.createObjectStore('config', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots', { keyPath: 'hash' });
    };
    request.onsuccess = () => {
      const db = request.result;
      const forget = () => { if (connection === pending) connection = null; };
      db.onclose = forget;
      db.onversionchange = () => { db.close(); forget(); };
      resolve(db);
    };
    request.onerror = () => { if (connection === pending) connection = null; reject(request.error); };
    request.onblocked = () => { if (connection === pending) connection = null; reject(new Error('Хранилище занято другой вкладкой приложения. Закройте лишние вкладки и повторите.')); };
  });
  connection = pending;
  return pending;
}

// The action must issue every request synchronously: awaiting inside it would let the
// transaction auto-close. Values it returns are resolved once the transaction commits,
// so read requests can fill a holder object from their own onsuccess handlers.
export async function transact<T>(stores: StoreName[], mode: IDBTransactionMode, action: (transaction: IDBTransaction) => T): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(stores, mode);
    let value: T;
    try {
      value = action(transaction);
    } catch (error) {
      transaction.abort();
      reject(error);
      return;
    }
    transaction.oncomplete = () => resolve(value);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('Запись в хранилище прервана.'));
  });
}

export async function request<T>(storeName: StoreName, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const holder = await transact([storeName], mode, (transaction) => {
    const box: { value: T | undefined } = { value: undefined };
    const result = action(transaction.objectStore(storeName));
    result.onsuccess = () => { box.value = result.result; };
    return box;
  });
  return holder.value as T;
}

export async function clearAll(): Promise<void> {
  await transact(ALL_STORES, 'readwrite', (transaction) => {
    for (const store of ALL_STORES) transaction.objectStore(store).clear();
  });
}
