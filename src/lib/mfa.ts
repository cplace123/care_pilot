import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function generateMfaSecret() {
  return [...randomBytes(32)].map(b => alphabet[b & 31]).join('');
}
function decodeBase32(value: string) {
  if (!/^[A-Z2-7]{16,64}$/.test(value)) throw new Error('Invalid authenticator secret');
  const bits = [...value].map(c => alphabet.indexOf(c).toString(2).padStart(5, '0')).join('');
  return Buffer.from((bits.match(/.{8}/g) ?? []).map(b => parseInt(b, 2)));
}
export function totp(secret: string, step = Math.floor(Date.now() / 30000)) {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', decodeBase32(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 15;
  return ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
}
export function verifyTotp(secret: string, code: string, now = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const step = Math.floor(now / 30000);
  for (const candidate of [step, step - 1, step + 1]) {
    if (candidate >= 0 && timingSafeEqual(Buffer.from(totp(secret, candidate)), Buffer.from(code))) return candidate;
  }
  return null;
}
function encryptionKey() {
  const key = process.env.AUTH_ENCRYPTION_KEY ?? '';
  if (!/^[0-9a-f]{64}$/.test(key)) throw new Error('AUTH_ENCRYPTION_KEY must contain 64 hex characters');
  return Buffer.from(key, 'hex');
}
export function encryptMfaSecret(secret: string) {
  const nonce = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', encryptionKey(), nonce);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [nonce, cipher.getAuthTag(), encrypted].map(x => x.toString('hex')).join(':');
}
export function decryptMfaSecret(value: string) {
  const [nonce, tag, data] = value.split(':').map(x => Buffer.from(x, 'hex'));
  const cipher = createDecipheriv('aes-256-gcm', encryptionKey(), nonce); cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8');
}
