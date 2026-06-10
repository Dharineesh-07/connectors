const DB_NAME = 'orgchat-drafts'
const STORE = 'queue'
const VERSION = 1

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
    req.onsuccess = (e) => resolve(e.target.result)
    req.onerror = () => reject(req.error)
  })
}

export async function loadDraftQueue(conversationId) {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(conversationId)
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => resolve([])
    })
  } catch {
    return []
  }
}

export async function saveDraftQueue(conversationId, items) {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    if (items.length === 0) {
      store.delete(conversationId)
    } else {
      store.put(items, conversationId)
    }
  } catch {
    // silently ignore — draft persistence is best-effort
  }
}
