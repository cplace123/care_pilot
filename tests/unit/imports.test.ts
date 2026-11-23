import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { parseFile, readUpload, encryptFile, decryptFile } from '@/lib/server/import-files';
import { normalMoney, normalDate, csvCell, mapRows, checkMapping } from '@/lib/imports/validate';
import { suggestMapping } from '@/lib/imports/catalog';
import { uploadSchema } from '@/lib/server/imports';
const sample = (name: string) => readFile(`samples/imports/${name}`);
describe('bounded, passive file parsing', () => {
 it('reads equivalent CSV and XLSX without running workbook content', async () => {
  expect(await parseFile(await sample('01-participants.xlsx'),'xlsx')).toEqual(await parseFile(await sample('01-participants.csv'),'csv'));
 });
 it.each(['sparse','formula','macro','external','traversal','entity','expanded','multiple-sheets'])('rejects unsafe %s workbooks', async name => {
  await expect(parseFile(await readFile(`tests/fixtures/imports/${name}.xlsx`),'xlsx')).rejects.toMatchObject({ status: 400 });
 });
 it('rejects mismatched extensions, binary CSV, malformed structure and corrupted workbooks', async () => {
  for (const [bytes, format] of [[Buffer.from('not a zip'),'xlsx'],[Buffer.from([0xff,0xfe,0]),'csv'],[Buffer.from('id,id\na,b'),'csv'],[Buffer.from('id,name\na,b,c'),'csv'],[Buffer.from('<html>bad</html>'),'csv']] as const) await expect(parseFile(bytes,format)).rejects.toThrow();
  await expect(parseFile(Buffer.from('x\ny'),'xlsm')).rejects.toMatchObject({ status: 415 });
 });
 it('rejects formula-like CSV cells, dangerous headings and unsupported paths', async () => {
  for (const text of ['id,name\na,=HYPERLINK("x")','id,name\na,@SUM(1)','id,name\na,-2+cmd','__proto__,name\na,b','id,name\na,\t+cmd']) await expect(parseFile(Buffer.from(text),'csv')).rejects.toThrow();
  for (const filename of ['../../x.csv','x.xlsm','x.csv.exe','C:\\x.xlsx','x\0.csv']) expect(uploadSchema.safeParse({ provider: 'CSV', dataType: 'participants', filename }).success).toBe(false);
 });
 it('enforces byte and row limits without silently truncating', async () => {
  await expect(parseFile(Buffer.alloc(2097153),'csv')).rejects.toMatchObject({ status: 413 });
  await expect(parseFile(Buffer.from('id\n'+Array.from({length:2001},(_,i)=>i).join('\n')),'csv')).rejects.toThrow();
 });
 it('enforces Origin and measured stream size even without Content-Length', async () => {
  const origin = new URL(process.env.NEXTAUTH_URL!).origin;
  const req = (body: string, suppliedOrigin = origin) => new Request(origin+'/upload',{method:'POST',headers:{origin:suppliedOrigin,'content-type':'application/octet-stream'},body});
  await expect(readUpload(req('x','https://evil.invalid'))).rejects.toMatchObject({status:403});
  await expect(readUpload(req('x'.repeat(2097153)))).rejects.toMatchObject({status:413});
  await expect(readUpload(req(''))).rejects.toMatchObject({status:400});
 });
 it('authenticates encrypted file bytes to the organisation and file identifier', () => {
  const bytes=Buffer.from('fictional private content'), encrypted=encryptFile(bytes,'tenant:file');
  expect(encrypted.includes(bytes)).toBe(false); expect(decryptFile(encrypted,'tenant:file')).toEqual(bytes);
  expect(()=>decryptFile(encrypted,'other:file')).toThrow(); encrypted[29]^=1; expect(()=>decryptFile(encrypted,'tenant:file')).toThrow();
 });
});
describe('mapping and validation', () => {
 it('suggests Client ID, Service Date and Amount fields',()=>{
  expect(suggestMapping(['Client ID','Service Date','Amount'],'claims')).toEqual({participantExternalId:'Client ID',serviceDate:'Service Date',claimAmount:'Amount'});
 });
 it('rejects unknown, duplicate and incomplete mappings',()=>{
  const table={headers:['id'],rows:[['one']]};
  for(const mapping of [{},{externalId:'missing'},{externalId:'id',displayName:'id'},{constructor:'id'}] as Record<string,string>[]) expect(()=>checkMapping(table,'participants',mapping)).toThrow();
 });
 it('keeps money decimal-exact and never rounds invalid precision',()=>{
  expect(normalMoney('999999999999.99')).toBe('999999999999.99');expect(normalMoney('0.1')).toBe('0.10');
  for(const value of ['1.005','-10','1e3','$12','1,000','NaN','Infinity','01','1000000000000']) expect(normalMoney(value)).toBeNull();
 });
 it('requires explicit date interpretation and rejects impossible dates',()=>{
  expect(normalDate('11/12/2026','ISO')).toBeNull();expect(normalDate('11/12/2026','AU')).toBe('2026-12-11');
  expect(normalDate('2026-02-30','ISO')).toBeNull();expect(normalDate('29/02/2028','AU')).toBe('2028-02-29');
  expect(normalDate('2026-11-20T12:00:00Z','ISO')).toBeNull();
 });
 it('returns row-level missing fields, unsupported schemes, dates and amounts',()=>{
  const headers=['externalId','participantExternalId','scheme','serviceExternalId','serviceDate','claimAmount'];
  const result=mapRows({headers,rows:[['C1','','unknown','S1','2026-02-30','12.555']]},'claims',Object.fromEntries(headers.map(h=>[h,h])),'ISO');
  expect(result[0].issues.map(i=>i.code)).toEqual(['REQUIRED','INVALID_SCHEME','INVALID_DATE','INVALID_AMOUNT']);
 });
 it('validates timestamps with an explicit timezone',()=>{
  const headers=['externalId','sourceUpdatedAt'];
  const rows=mapRows({headers,rows:[['A','2026-11-23T12:00:00+10:00'],['B','2026-11-23T12:00:00']]},'participants',{externalId:'externalId',sourceUpdatedAt:'sourceUpdatedAt'},'ISO');
  expect(rows[0].payload.sourceUpdatedAt).toBe('2026-11-23T02:00:00.000Z');expect(rows[1].issues[0].code).toBe('INVALID_TIMESTAMP');
 });
 it('escapes dangerous spreadsheet exports including whitespace and quotes',()=>{
  for(const cell of ['=SUM(1)',' +cmd','\t@SUM(1)','-cmd']) expect(csvCell(cell)).toBe('"\''+cell+'"');
  expect(csvCell('a"b')).toBe('"a""b"');
 });
});
