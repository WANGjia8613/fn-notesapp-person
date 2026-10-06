import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * AES-256-GCM 对称加密，用于加密 LLM API Key 等敏感凭证。
 *
 * 输出格式：base64(iv) + '.' + base64(ciphertext) + '.' + base64(authTag)
 * 用 '.' 分隔是因为 base64 不含 '.'，解析时不会歧义。
 *
 * 为什么选 GCM：自带认证（authTag），能检测密文被篡改，
 * 比 CBC + HMAC 的组合更简洁，且 Node 内置支持。
 */

const ALGO = 'aes-256-gcm'
const IV_LEN = 12 // GCM 推荐 12 字节
const KEY_LEN = 32 // AES-256

function ensureKey(key: string): Buffer {
  const buf = Buffer.from(key, 'utf8')
  if (buf.length >= KEY_LEN) return buf.subarray(0, KEY_LEN)
  // 不足 32 字节时用零填充（实际 config 里已保证 32 字节，这里是防御性）
  const padded = Buffer.alloc(KEY_LEN)
  buf.copy(padded)
  return padded
}

/** 加密明文，返回可安全存储的字符串 */
export function encrypt(plaintext: string, key: string): string {
  const keyBuf = ensureKey(key)
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGO, keyBuf, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}.${enc.toString('base64')}.${tag.toString('base64')}`
}

/** 解密，失败抛错（密文被篡改或密钥不对） */
export function decrypt(ciphertext: string, key: string): string {
  const parts = ciphertext.split('.')
  if (parts.length !== 3) throw new Error('密文格式无效')
  const [ivB64, encB64, tagB64] = parts
  const keyBuf = ensureKey(key)
  const iv = Buffer.from(ivB64, 'base64')
  const enc = Buffer.from(encB64, 'base64')
  const tag = Buffer.from(tagB64, 'base64')
  const decipher = createDecipheriv(ALGO, keyBuf, iv)
  decipher.setAuthTag(tag)
  const dec = Buffer.concat([decipher.update(enc), decipher.final()])
  return dec.toString('utf8')
}
