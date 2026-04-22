import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const TAG_LENGTH = 16

function getKey(): Buffer {
  const key = process.env.BC_ENCRYPTION_KEY
  if (!key) throw new Error('BC_ENCRYPTION_KEY is niet ingesteld')
  if (!/^[0-9a-f]{64}$/i.test(key)) {
    throw new Error('BC_ENCRYPTION_KEY moet exact 64 hex tekens zijn (32 bytes)')
  }
  return Buffer.from(key, 'hex')
}

export function encryptSecret(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decryptSecret(ciphertext: string): string {
  const key = getKey()
  const parts = ciphertext.split(':')
  if (parts.length !== 3) throw new Error('Ongeldig versleuteld formaat')

  const [ivHex, tagHex, encryptedHex] = parts
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const encrypted = Buffer.from(encryptedHex, 'hex')

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  return decipher.update(encrypted).toString('utf8') + decipher.final('utf8')
}

export function isEncrypted(value: string): boolean {
  const parts = value.split(':')
  return (
    parts.length === 3 &&
    /^[0-9a-f]+$/i.test(parts[0]) &&
    /^[0-9a-f]+$/i.test(parts[1]) &&
    /^[0-9a-f]+$/i.test(parts[2])
  )
}

export function validateEncryptionKey(): void {
  getKey()
}
