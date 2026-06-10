// E2EE using ECDH key exchange + AES-GCM encryption via Web Crypto API.
// Private keys never leave the browser — stored in IndexedDB as JWK.

const DB_NAME = 'orgchat-e2ee'
const STORE_NAME = 'keys'
const KEY_ID = 'my-keypair'

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE_NAME)
    req.onsuccess = (e) => resolve(e.target.result)
    req.onerror = (e) => reject(e.target.error)
  })
}

async function dbGet(key) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(key)
    req.onsuccess = (e) => resolve(e.target.result)
    req.onerror = (e) => reject(e.target.error)
  })
}

async function dbPut(key, value) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const req = tx.objectStore(STORE_NAME).put(value, key)
    req.onsuccess = () => resolve()
    req.onerror = (e) => reject(e.target.error)
  })
}

function buf2b64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}

function b642buf(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

export async function getOrCreateKeyPair() {
  const stored = await dbGet(KEY_ID)
  if (stored) {
    const privateKey = await crypto.subtle.importKey(
      'jwk',
      stored.privateJWK,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveKey']
    )
    return { privateKey, publicBase64: stored.publicBase64 }
  }

  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey']
  )
  const privateJWK = await crypto.subtle.exportKey('jwk', keyPair.privateKey)
  const publicBase64 = buf2b64(await crypto.subtle.exportKey('spki', keyPair.publicKey))

  await dbPut(KEY_ID, { privateJWK, publicBase64 })
  return { privateKey: keyPair.privateKey, publicBase64 }
}

export async function deriveSharedKey(myPrivateKey, partnerPublicBase64) {
  const partnerPublicKey = await crypto.subtle.importKey(
    'spki',
    b642buf(partnerPublicBase64),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  )
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: partnerPublicKey },
    myPrivateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export async function encryptMessage(sharedKey, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    sharedKey,
    new TextEncoder().encode(plaintext)
  )
  return JSON.stringify({ iv: buf2b64(iv), ct: buf2b64(ct) })
}

export async function decryptMessage(sharedKey, encryptedJSON) {
  try {
    const { iv, ct } = JSON.parse(encryptedJSON)
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b642buf(iv) },
      sharedKey,
      b642buf(ct)
    )
    return new TextDecoder().decode(plain)
  } catch {
    return '[Unable to decrypt — key mismatch or corrupted message]'
  }
}
