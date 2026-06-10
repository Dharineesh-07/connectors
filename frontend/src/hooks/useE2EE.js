import { useCallback, useEffect, useRef, useState } from 'react'
import { getOrCreateKeyPair, deriveSharedKey, encryptMessage, decryptMessage } from '../utils/e2ee'
import { uploadPublicKey, getUserPublicKey } from '../api/users'

export function useE2EE(conversation, currentUserId) {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)
  const sharedKeyRef = useRef(null)

  const isDirect = conversation?.type === 'direct'
  const isE2EEEnabled = !!conversation?.e2ee_enabled
  const otherMember = isDirect
    ? conversation?.members?.find((m) => m.user_id !== currentUserId)
    : null

  useEffect(() => {
    if (!isDirect || !isE2EEEnabled || !otherMember?.user_id) {
      setReady(false)
      sharedKeyRef.current = null
      return
    }

    let cancelled = false
    setReady(false)
    setError(null)

    async function setup() {
      try {
        const { privateKey, publicBase64 } = await getOrCreateKeyPair()
        await uploadPublicKey(publicBase64)
        const { public_key: partnerKey } = await getUserPublicKey(otherMember.user_id)
        if (!cancelled) {
          sharedKeyRef.current = await deriveSharedKey(privateKey, partnerKey)
          setReady(true)
        }
      } catch (err) {
        if (!cancelled) setError(err?.response?.data?.detail ?? err.message)
      }
    }

    setup()
    return () => { cancelled = true }
  }, [isDirect, isE2EEEnabled, otherMember?.user_id, currentUserId])

  const encrypt = useCallback(async (plaintext) => {
    if (!sharedKeyRef.current) throw new Error('E2EE not ready')
    return encryptMessage(sharedKeyRef.current, plaintext)
  }, [])

  const decrypt = useCallback(async (ciphertext) => {
    if (!sharedKeyRef.current) return '[E2EE key not available]'
    return decryptMessage(sharedKeyRef.current, ciphertext)
  }, [])

  return {
    ready,
    error,
    encrypt,
    decrypt,
    isActive: isDirect && isE2EEEnabled,
  }
}
