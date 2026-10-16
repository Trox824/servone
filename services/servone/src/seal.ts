// AES-256-GCM for secrets the service must read back (mail passwords, webhook signing secrets).
// Keys come from env as `id:base64,...`; the first one seals, all of them open, so a key can be rotated.
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { types } from 'util'

const ALGORITHM = 'aes-256-gcm'
const KEY_BYTES = 32
// 96-bit IV is the size GCM is specified for.
const IV_BYTES = 12

export class SealError extends Error {
  constructor (message: string) {
    super(message)
    Object.setPrototypeOf(this, SealError.prototype)
  }
}

export interface SealKeys {
  current: { id: string, key: Buffer }
  byId: Map<string, Buffer>
}

export interface SealedSecret {
  keyId: string
  iv: string
  tag: string
  data: string
}

export function parseSealKeys (text: string, envName: string): SealKeys {
  const entries = text.split(',').map((part) => {
    const [id, encoded] = part.trim().split(':')
    const key = Buffer.from(encoded ?? '', 'base64')
    if (id === undefined || id === '' || key.length !== KEY_BYTES) {
      throw new SealError(`${envName} entries must be id:base64 of ${KEY_BYTES} bytes`)
    }
    return { id, key }
  })
  return { current: entries[0], byId: new Map(entries.map((entry) => [entry.id, entry.key])) }
}

// The AAD binds a record to its owner, so a sealed value copied to another record fails to open.
export function seal (keys: SealKeys, aad: string, plaintext: string): SealedSecret {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, keys.current.key, iv)
  cipher.setAAD(Buffer.from(aad))
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return {
    keyId: keys.current.id,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: encrypted.toString('base64')
  }
}

export function unseal (keys: SealKeys, aad: string, sealed: SealedSecret): string {
  const key = keys.byId.get(sealed.keyId)
  if (key === undefined) throw new SealError(`Unknown seal key ${sealed.keyId}`)
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(sealed.iv, 'base64'))
  decipher.setAAD(Buffer.from(aad))
  decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'))
  try {
    return Buffer.concat([decipher.update(Buffer.from(sealed.data, 'base64')), decipher.final()]).toString('utf8')
  } catch (error) {
    // isNativeError: crypto errors come from another realm under jest.
    if (types.isNativeError(error) && /unable to authenticate/i.test(error.message)) {
      throw new SealError('Sealed record failed authentication')
    }
    throw error
  }
}
