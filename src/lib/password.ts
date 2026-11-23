import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
// Explicit memory-hard work factor: N=2^17, r=8, p=1 (~128 MiB).
const deriveKey = (password: string, salt: string) => new Promise<Buffer>((resolve, reject) => {
  scryptCallback(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key));
});
export const passwordPolicy = { min: 14, max: 128 };
export async function hashPassword(password: string) {
  if (password.length < passwordPolicy.min || password.length > passwordPolicy.max) throw new Error('Password must contain 14–128 characters');
  const salt = randomBytes(16).toString('hex');
  const key = await deriveKey(password, salt);
  return `scrypt-v1:${salt}:${key.toString('hex')}`;
}
// Valid fixed-format hash used only for equal-work unknown-user checks; not an account credential.
const dummyHash = 'scrypt-v1:' + '0'.repeat(32) + ':' + '0'.repeat(128);
export async function verifyPassword(password: string, stored = dummyHash) {
  if (password.length > passwordPolicy.max) return false;
  const [algorithm, salt, hex] = stored.split(':');
  if (algorithm !== 'scrypt-v1' || !/^[0-9a-f]{32}$/.test(salt ?? '') || !/^[0-9a-f]{128}$/.test(hex ?? '')) return false;
  const actual = await deriveKey(password, salt);
  return timingSafeEqual(actual, Buffer.from(hex, 'hex'));
}
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
