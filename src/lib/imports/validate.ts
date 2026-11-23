import { z } from 'zod';
import { createHash } from 'node:crypto';
import { dataTypes, type Mapping, type RowIssue, type Table } from './catalog';
export const checksum = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
export const unsafeCell = (value: string) => /^[\s\uFEFF]*[=+@]/.test(value) || (/^[\s\uFEFF]*-/.test(value) && !/^-\d+(\.\d+)?$/.test(value.trim())) || /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(value);
export function csvCell(value: string | number) {
 const text = String(value); const safe = /^[\s\uFEFF]*[=+\-@]/.test(text) ? "'" + text : text;
 return '"' + safe.replaceAll('"', '""') + '"';
}
export function normalDate(value: string, format: string): string | null {
 const match = format === 'AU' ? /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value) : /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
 if (!match) return null;
 const [year, month, day] = format === 'AU' ? [match[3], match[2], match[1]] : match.slice(1);
 const iso = `${year}-${month}-${day}`;
 const parsed = new Date(iso + 'T00:00:00Z');
 return Number(year) >= 1900 && Number(year) <= 2200 && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : null;
}
// Exact decimal strings: no Number/parseFloat or monetary arithmetic.
export function normalMoney(value: string): string | null {
 if (!/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/.test(value)) return null;
 const [whole, fraction = ''] = value.split('.'); return `${whole}.${fraction.padEnd(2, '0')}`;
}
export function checkMapping(table: Table, type: string, mapping: Mapping) {
 const fields = dataTypes[type]?.fields;
 if (!fields || Object.keys(mapping).some(k => !fields.some(f => f.key === k)) || Object.values(mapping).some(h => !table.headers.includes(h)) || new Set(Object.values(mapping)).size !== Object.values(mapping).length) throw new Error('INVALID_MAPPING');
 if (fields.some(f => f.required && !mapping[f.key])) throw new Error('MISSING_MAPPING');
 if (type === 'payments' && !mapping.claimExternalId && !mapping.invoiceExternalId) throw new Error('MISSING_MAPPING');
}
export function mapRows(table: Table, type: string, mapping: Mapping, format: string) {
 checkMapping(table, type, mapping);
 return table.rows.map((cells, index) => {
  const payload: Record<string, string> = {}; const issues: RowIssue[] = [];
  const add = (field: string, code: string) => issues.push({ row: index + 2, field, code });
  for (const f of dataTypes[type].fields) {
   let value = mapping[f.key] ? (cells[table.headers.indexOf(mapping[f.key])] ?? '').trim() : '';
   if (!value) { if (f.required) add(f.key, 'REQUIRED'); continue; }
   if (unsafeCell(value)) { add(f.key, 'UNSAFE_CELL'); continue; }
   if (f.kind === 'id' && !/^[\p{L}\p{N}][\p{L}\p{N} _./:@-]{0,199}$/u.test(value)) add(f.key, 'INVALID_ID');
   if (f.kind === 'text' && value.length > 200) add(f.key, 'TOO_LONG');
   if (f.kind === 'date') { const normalized = normalDate(value, format); if (!normalized) add(f.key, 'INVALID_DATE'); else value = normalized; }
   if (f.kind === 'timestamp') { if (!z.iso.datetime({ offset: true }).safeParse(value).success) add(f.key, 'INVALID_TIMESTAMP'); else value = new Date(value).toISOString(); }
   if (f.kind === 'money') { const normalized = normalMoney(value); if (!normalized) add(f.key, 'INVALID_AMOUNT'); else value = normalized; }
   if (f.kind === 'scheme' && !['support_at_home', 'ndis'].includes(value)) add(f.key, 'INVALID_SCHEME');
   payload[f.key] = value;
  }
  if (type === 'payments' && !payload.claimExternalId && !payload.invoiceExternalId) add('claimExternalId', 'REQUIRED');
  if (payload.startDate && payload.endDate && payload.startDate > payload.endDate) add('endDate', 'DATE_ORDER');
  const hash = checksum(JSON.stringify(payload));
  const fingerprint = checksum(JSON.stringify(Object.fromEntries(Object.entries(payload).filter(([k]) => !['externalId','sourceUpdatedAt'].includes(k)))));
  return { row: index + 2, payload, issues, hash, fingerprint };
 });
}
