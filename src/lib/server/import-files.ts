import 'server-only';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import { readSheet } from 'read-excel-file/node';
import { fromBuffer } from 'yauzl';
import { z } from 'zod';
import { getEnv } from '@/lib/env';
import type { Table } from '@/lib/imports/catalog';
import { unsafeCell } from '@/lib/imports/validate';
import { RequestError } from './api';
export function importLimits() {
 return z.object({ IMPORT_MAX_BYTES: z.coerce.number().int().min(1024).max(4194304).default(2097152), IMPORT_MAX_ROWS: z.coerce.number().int().min(1).max(5000).default(2000) }).parse(process.env);
}
const key = () => Buffer.from(hkdfSync('sha256', Buffer.from(getEnv().AUTH_ENCRYPTION_KEY, 'hex'), '', 'CarePilot import files v1', 32));
export function encryptFile(bytes: Buffer, context: string) {
 const nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), nonce); cipher.setAAD(Buffer.from(context));
 const content = Buffer.concat([cipher.update(bytes), cipher.final()]); return Buffer.concat([nonce, cipher.getAuthTag(), content]);
}
export function decryptFile(bytes: Uint8Array, context: string) {
 const b = Buffer.from(bytes), cipher = createDecipheriv('aes-256-gcm', key(), b.subarray(0, 12)); cipher.setAAD(Buffer.from(context)); cipher.setAuthTag(b.subarray(12, 28));
 return Buffer.concat([cipher.update(b.subarray(28)), cipher.final()]);
}
export async function readUpload(request: Request) {
 if (request.headers.get('origin') !== new URL(getEnv().NEXTAUTH_URL).origin) throw new RequestError(403, 'Access denied');
 if (request.headers.get('content-type')?.split(';')[0] !== 'application/octet-stream') throw new RequestError(415, 'Upload a CSV or XLSX file');
 const limit = importLimits().IMPORT_MAX_BYTES;
 if (Number(request.headers.get('content-length')) > limit) throw new RequestError(413, 'File exceeds the upload limit');
 const reader = request.body?.getReader(); if (!reader) throw new RequestError(400, 'File is empty');
 const chunks: Uint8Array[] = []; let size = 0;
 try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > limit) { await reader.cancel(); throw new RequestError(413, 'File exceeds the upload limit'); } chunks.push(value); } }
 finally { reader.releaseLock(); }
 if (!size) throw new RequestError(400, 'File is empty');
 return Buffer.concat(chunks);
}
// Examine every ZIP member before the workbook reader runs. Never extract paths to disk.
async function inspectWorkbook(bytes: Buffer) {
 await new Promise<void>((resolve, reject) => fromBuffer(bytes, { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
  if (error || !zip) return reject(new Error('CORRUPT_XLSX'));
  let total = 0, entries = 0, sheets = 0; const seen = new Set<string>();
  const fail = () => { zip.close(); reject(new Error('UNSAFE_XLSX')); };
  zip.on('error', fail); zip.on('end', () => sheets === 1 && seen.has('[Content_Types].xml') && seen.has('xl/workbook.xml') ? resolve() : fail());
  zip.on('entry', entry => {
   total += entry.uncompressedSize; entries++;
   if (total > 8388608 || entries > 200 || seen.has(entry.fileName) || entry.generalPurposeBitFlag & 1 || /(^\/|\\|(^|\/)\.\.(\/|$)|vba|macro|externalLinks|embeddings|activeX)/i.test(entry.fileName)) return fail();
   seen.add(entry.fileName); if (/^xl\/worksheets\/sheet\d+\.xml$/.test(entry.fileName)) sheets++;
   if (entry.fileName.endsWith('/')) return zip.readEntry();
   if (!/\.(xml|rels)$/.test(entry.fileName)) return fail();
   zip.openReadStream(entry, (err, stream) => {
    if (err || !stream) return fail();
    const chunks: Buffer[] = []; let actual = 0;
    stream.on('error', fail); stream.on('data', (chunk: Buffer) => { actual += chunk.length; if (actual > entry.uncompressedSize || actual > 8388608) { stream.destroy(); fail(); } else chunks.push(chunk); });
    stream.on('end', () => {
     const xml = Buffer.concat(chunks).toString('utf8');
     if (/&#|<!DOCTYPE|<!ENTITY|<(?:\w+:)?f(?:\s|>|\/)|macroEnabled|vbaProject|TargetMode\s*=\s*["']External|<(?:\w+:)?hyperlink\b/i.test(xml) || (xml.match(/<(?:\w+:)?c\b/g)?.length ?? 0) > (importLimits().IMPORT_MAX_ROWS + 1) * 50) return fail();
     // Sparse XLSX coordinates can allocate enormous arrays even in a tiny ZIP.
     const rowLimit = importLimits().IMPORT_MAX_ROWS + 1;
     if ((xml.match(/<(?:\w+:)?row\b/g)?.length ?? 0) > rowLimit) return fail();
     for (const match of xml.matchAll(/<(?:\w+:)?(row|c)\b[^>]*\br\s*=\s*["']([^"']+)["']/g)) {
      const coordinate = match[1] === 'row' ? /^(\d+)$/.exec(match[2]) : /^([A-Z]{1,3})(\d+)$/.exec(match[2]);
      if (!coordinate) return fail();
      const rowNumber = Number(coordinate.at(-1));
      const column = match[1] === 'c' ? [...coordinate[1]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) : 1;
      if (rowNumber < 1 || rowNumber > rowLimit || column > 50) return fail();
     }
     zip.readEntry();
    });
   });
  }); zip.readEntry();
 }));
}
export async function parseFile(bytes: Buffer, format: string): Promise<Table> {
 const { IMPORT_MAX_BYTES: maxBytes, IMPORT_MAX_ROWS: maxRows } = importLimits();
 if (!bytes.length || bytes.length > maxBytes) throw new RequestError(413, 'File is empty or exceeds the upload limit');
 try {
  let rows: string[][];
  if (format === 'csv') {
   const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
   if (text.includes('\0') || /^\s*</.test(text)) throw new Error();
   rows = parse(text, { bom: true, skip_empty_lines: true, max_record_size: 16384 }) as string[][];
  } else if (format === 'xlsx') {
   if (bytes.readUInt32LE(0) !== 0x04034b50) throw new Error();
   await inspectWorkbook(bytes);
   const cells = await readSheet<string>(bytes, { parseNumber: value => value });
   rows = cells.map(row => row.map(cell => {
    if (cell instanceof Date && (cell.getUTCHours() || cell.getUTCMinutes() || cell.getUTCSeconds() || cell.getUTCMilliseconds())) throw new Error('DATE_WITH_TIME');
    return cell == null ? '' : cell instanceof Date ? cell.toISOString().slice(0,10) : String(cell);
   }));
  } else throw new RequestError(415, 'Only .csv and .xlsx files are supported');
  if (rows.length < 2 || rows.length > maxRows + 1) throw new RequestError(400, `File must have headings and 1–${maxRows} data rows`);
  const headers = rows[0].map(h => h.trim());
  if (!headers.length || headers.length > 50 || headers.some(h => !h || h.length > 100 || unsafeCell(h) || ['__proto__','constructor','prototype'].includes(h)) || new Set(headers).size !== headers.length) throw new Error();
  rows = rows.slice(1);
  if (rows.some(row => row.length > headers.length || row.some(cell => cell.length > 2000 || unsafeCell(cell)))) throw new Error();
  return { headers, rows: rows.map(row => headers.map((_, i) => row[i] ?? '')) };
 } catch (e) { if (e instanceof RequestError) throw e; throw new RequestError(400, 'Unsupported, corrupted or unsafe file. Use UTF-8 CSV or one plain XLSX worksheet without formulas, macros or links.'); }
}
