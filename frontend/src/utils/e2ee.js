// E2EE using ECDH key exchange + AES-GCM encryption via Web Crypto API.
// The ECDH private key is wrapped with an AES-GCM key before being stored in
// IndexedDB so the raw JWK is never written to disk in plaintext.
// The wrapping key lives in localStorage (same origin, but a separate storage
// mechanism — an attacker needs both to reconstruct the private key).

const DB_NAME = 'orgchat-e2ee'
const STORE_NAME = 'keys'
const KEY_ID = 'my-keypair'
const WRAP_KEY_LS = 'orgchat-e2ee-wk'

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
  const bytes = new Uint8Array(buf)
  let binary = ''
  // Chunked to avoid call-stack overflow on large buffers (spread limit ~65 K args).
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  }
  return btoa(binary)
}

function b642buf(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

async function getOrCreateWrappingKey() {
  const stored = localStorage.getItem(WRAP_KEY_LS)
  if (stored) {
    try {
      return await crypto.subtle.importKey('raw', b642buf(stored), 'AES-GCM', false, ['wrapKey', 'unwrapKey'])
    } catch {
      // fall through to generate a new wrapping key
    }
  }
  const exportableKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['wrapKey', 'unwrapKey'])
  const raw = await crypto.subtle.exportKey('raw', exportableKey)
  localStorage.setItem(WRAP_KEY_LS, buf2b64(raw))
  // Re-import as non-extractable so the in-memory CryptoKey cannot be
  // exfiltrated via exportKey() by an XSS payload (localStorage is already
  // same-origin accessible regardless, but this removes one attack surface).
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['wrapKey', 'unwrapKey'])
}

export async function getOrCreateKeyPair() {
  const stored = await dbGet(KEY_ID)
  const wk = await getOrCreateWrappingKey()

  if (stored && stored.wrappedPrivate) {
    try {
      // unwrapKey with extractable:false so the in-memory key cannot be re-exported
      const privateKey = await crypto.subtle.unwrapKey(
        'jwk',
        b642buf(stored.wrappedPrivate),
        wk,
        { name: 'AES-GCM', iv: b642buf(stored.wrapIV) },
        { name: 'ECDH', namedCurve: 'P-256' },
        false,
        ['deriveKey']
      )
      return { privateKey, publicBase64: stored.publicBase64 }
    } catch {
      // Wrapping key was rotated (localStorage cleared) — regenerate the key pair below.
    }
  }

  if (stored && stored.privateJWK) {
    // Migrate from the old unencrypted format: re-wrap and overwrite the IDB entry.
    const wrapIV = crypto.getRandomValues(new Uint8Array(12))
    const tempKey = await crypto.subtle.importKey(
      'jwk', stored.privateJWK,
      { name: 'ECDH', namedCurve: 'P-256' },
      true, ['deriveKey']
    )
    const wrappedPrivate = buf2b64(await crypto.subtle.wrapKey('jwk', tempKey, wk, { name: 'AES-GCM', iv: wrapIV }))
    await dbPut(KEY_ID, { wrappedPrivate, wrapIV: buf2b64(wrapIV), publicBase64: stored.publicBase64 })
    const privateKey = await crypto.subtle.importKey(
      'jwk', stored.privateJWK,
      { name: 'ECDH', namedCurve: 'P-256' },
      false, ['deriveKey']
    )
    return { privateKey, publicBase64: stored.publicBase64 }
  }

  // Generate a new key pair.
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey']
  )
  const publicBase64 = buf2b64(await crypto.subtle.exportKey('spki', keyPair.publicKey))
  const wrapIV = crypto.getRandomValues(new Uint8Array(12))
  const wrappedPrivate = buf2b64(await crypto.subtle.wrapKey('jwk', keyPair.privateKey, wk, { name: 'AES-GCM', iv: wrapIV }))
  await dbPut(KEY_ID, { wrappedPrivate, wrapIV: buf2b64(wrapIV), publicBase64 })
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
