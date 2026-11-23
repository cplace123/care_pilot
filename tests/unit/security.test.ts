import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword } from '@/lib/password';
import { envSchema } from '@/lib/env';
import { defaultRoles, hasPermission } from '@/lib/permissions';
import { totp, verifyTotp, generateMfaSecret, encryptMfaSecret, decryptMfaSecret } from '@/lib/mfa';
describe('password security', () => {
 it('uses unique salts and verifies the correct password only', async () => {
  const a = await hashPassword('Synthetic test password!'); const b = await hashPassword('Synthetic test password!');
  expect(a).not.toBe(b); expect(a).not.toContain('Synthetic');
  expect(await verifyPassword('Synthetic test password!', a)).toBe(true);
  expect(await verifyPassword('wrong password', a)).toBe(false);
 });
 it('rejects invalid hashes, excessive passwords and weak provisioning', async () => {
  expect(await verifyPassword('anything', 'not-a-hash')).toBe(false);
  expect(await verifyPassword('a'.repeat(129))).toBe(false);
  expect(await verifyPassword('unknown-user-password')).toBe(false);
  await expect(hashPassword('short')).rejects.toThrow();
 });
});
describe('MFA', () => {
 it('matches the RFC 6238 SHA-1 test vector reduced to six digits', () => {
  expect(totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 1)).toBe('287082');
  expect(verifyTotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', '287082', 59000)).toBe(1);
 });
 it('accepts a limited clock window and rejects old or malformed codes', () => {
  const secret = generateMfaSecret();
  expect(verifyTotp(secret, totp(secret, 100), 3000000)).toBe(100);
  expect(verifyTotp(secret, totp(secret, 99), 3000000)).toBe(99);
  expect(verifyTotp(secret, '123', 3000000)).toBeNull();
  expect(verifyTotp(secret, totp(secret, 90), 3000000)).toBeNull();
 });
 it('encrypts secrets with authenticated encryption', () => {
  process.env.AUTH_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  const secret = generateMfaSecret(); const ciphertext = encryptMfaSecret(secret);
  expect(ciphertext).not.toContain(secret); expect(decryptMfaSecret(ciphertext)).toBe(secret);
  expect(() => decryptMfaSecret(ciphertext.slice(0, -2) + (ciphertext.endsWith('00') ? 'ff' : '00'))).toThrow();
 });
});
describe('configuration and permissions', () => {
 it('fails closed without secrets and rejects non-PostgreSQL URLs', () => {
  expect(envSchema.safeParse({}).success).toBe(false);
  expect(envSchema.safeParse({ DATABASE_URL: 'https://example.com', NEXTAUTH_URL: 'http://localhost:3000', NEXTAUTH_SECRET: 'x'.repeat(32), AUTH_ENCRYPTION_KEY: 'a'.repeat(64) }).success).toBe(false);
 });
 it('denies unknown and restricted role permissions', () => {
  expect(hasPermission([], 'finance.read')).toBe(false);
  expect(hasPermission(defaultRoles.Auditor, 'integrations.read')).toBe(false);
  expect(hasPermission(defaultRoles['AI Assistant'], 'dashboard.read')).toBe(false);
  expect(hasPermission(defaultRoles['Finance Manager'], 'finance.read')).toBe(true);
  expect(hasPermission(defaultRoles['Compliance Manager'], 'finance.read')).toBe(false);
 });
});
