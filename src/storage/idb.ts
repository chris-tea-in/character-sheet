const IDB_NAME = 'dnd-character-sheet'
const STORE = 'app-db'
const KEY = 'main'

let _idb: IDBDatabase | null = null

function openIdb(): Promise<IDBDatabase> {
  if (_idb) return Promise.resolve(_idb)
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => { _idb = req.result; resolve(req.result) }
    req.onerror = () => reject(req.error)
  })
}

export async function loadFromIdb(): Promise<Uint8Array | null> {
  const idb = await openIdb()
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(KEY)
    req.onsuccess = () => resolve((req.result as Uint8Array) ?? null)
    req.onerror = () => reject(req.error)
  })
}

export async function saveToIdb(data: Uint8Array): Promise<void> {
  const idb = await openIdb()
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(data, KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
