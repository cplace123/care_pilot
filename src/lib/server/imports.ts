import 'server-only';
import { publicDemoConfig } from './public-demo-config';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Prisma, ImportJob } from '@/generated/prisma/client';
import { dataTypes, providers, suggestMapping, type Mapping, type RowIssue } from '@/lib/imports/catalog';
import { checksum, checkMapping, mapRows } from '@/lib/imports/validate';
import { decryptFile, encryptFile, parseFile } from './import-files';
import { RequestError } from './api';
type Tx = Prisma.TransactionClient;
const mappingSchema = z.record(z.string().max(80), z.string().max(100)).refine(v => Object.keys(v).length <= 20);
export const configurationSchema = z.object({ mapping: mappingSchema, dateFormat: z.enum(['ISO','AU']), allowVersions: z.boolean().default(false), templateName: z.string().trim().min(1).max(80).optional() }).strict();
export const uploadSchema = z.object({ provider: z.enum(providers), dataType: z.string().refine(t => Object.hasOwn(dataTypes,t)), filename: z.string().max(160).regex(/^[^/\\\x00-\x1f]+\.(csv|xlsx)$/i) }).strict();
const finished = (job: ImportJob) => ['COMPLETED','COMPLETED_WITH_ERRORS'].includes(job.status);
function publicJob(job: ImportJob) {
 return { configurationToken: checksum(JSON.stringify([job.mapping, job.dateFormat, job.allowVersions])), id: job.id, connectionId: job.connectionId, sourceName: job.sourceName, dataType: job.dataType, status: job.status, recordCount: job.recordCount, processedCount: job.processedCount, successCount: job.successCount, rejectedCount: job.rejectedCount, unchangedCount: job.unchangedCount, updatedCount: job.updatedCount, errorCode: job.errorCode, createdAt: job.createdAt, completedAt: job.completedAt, initiatedById: job.initiatedById, fileId: job.fileId, allowVersions: job.allowVersions };
}
async function event(tx: Tx, organisationId: string, jobId: string, action: string, metadata: Prisma.InputJsonObject = {}) {
 const [context] = await tx.$queryRaw<{ userId: string }[]>`SELECT current_setting('app.user_id') AS "userId"`;
 await tx.activityEvent.create({ data: { organisationId, actorId: context.userId, action, resourceId: jobId, metadata } });
}
async function lockSource(tx: Tx, organisationId: string, connectionId: string) {
 // Serialise classification and commits for one tenant/source; hash collisions only reduce concurrency.
 await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${organisationId + ':' + connectionId}, 0))::text`;
}
async function getJob(tx: Tx, organisationId: string, id: string) {
 if (!z.uuid().safeParse(id).success) throw new RequestError(400, 'Invalid import ID');
 const job = await tx.importJob.findFirst({ where: { organisationId, id } });
 if (!job || !job.fileId || !job.dataType) throw new RequestError(404, 'Import not found'); return job;
}
async function tableFor(tx: Tx, job: ImportJob) {
 const file = await tx.importFile.findFirstOrThrow({ where: { organisationId: job.organisationId, id: job.fileId! } });
 const bytes = decryptFile(file.encryptedContent, `${job.organisationId}:${file.id}`);
 if (checksum(bytes) !== file.checksum) throw new Error('FILE_INTEGRITY');
 return parseFile(bytes, file.format);
}
export async function uploadImport(tx: Tx, organisationId: string, input: unknown, bytes: Buffer) {
 const { provider, dataType, filename } = uploadSchema.parse(input);
 const format = filename.split('.').at(-1)!.toLowerCase();
 const [context] = await tx.$queryRaw<{ userId: string }[]>`SELECT current_setting('app.user_id') AS "userId"`;
 const publicDemo = publicDemoConfig()?.userId === context.userId;
 if (publicDemo && bytes.length > 1048576) throw new RequestError(413, 'Public demo files are limited to 1 MiB');
 // Lock before connection creation, quotas and checksum lookup to cover concurrent uploads.
 await lockSource(tx, organisationId, 'upload-admission');
 let connection = await tx.integrationConnection.findUnique({ where: { organisationId_provider: { organisationId, provider } } });
 if (!connection) {
  const connectionId = randomUUID();
  await tx.$executeRaw`INSERT INTO "IntegrationConnection" (id,"organisationId",provider,"updatedAt") VALUES (${connectionId}::uuid,${organisationId}::uuid,${provider},now())`;
  connection = await tx.integrationConnection.findFirstOrThrow({ where: { organisationId, id: connectionId } });
 }
 const hash = checksum(bytes);
 const existing = await tx.importFile.findFirst({ where: { organisationId, checksum: hash }, include: { jobs: true } });
 if (existing) {
  if (existing.connectionId !== connection.id || existing.format !== format) throw new RequestError(409, 'This file was already uploaded with another source or format');
  if (existing.jobs[0]?.dataType !== dataType) throw new RequestError(409, 'This file was already uploaded with another record type');
  await event(tx, organisationId, existing.jobs[0].id, 'import.duplicate_file');
  return { job: publicJob(existing.jobs[0]), duplicate: true };
 }
 if (await tx.importJob.count({ where: { organisationId, createdAt: { gt: new Date(Date.now() - 86400000) } } }) >= (publicDemo ? 10 : 100)) throw new RequestError(429, 'Daily import limit reached');
 const fileId = randomUUID();
 await tx.importFile.create({ data: { id: fileId, organisationId, connectionId: connection.id, uploadedById: context.userId, checksum: hash, format, byteSize: bytes.length, encryptedContent: encryptFile(bytes, `${organisationId}:${fileId}`) } });
 let job = await tx.importJob.create({ data: { organisationId, connectionId: connection.id, initiatedById: context.userId, fileId, dataType, sourceName: provider, status: 'UPLOADED', idempotencyKey: `${connection.id}:${hash}` } });
 await event(tx, organisationId, job.id, 'import.uploaded');
 job = await tx.importJob.update({ where: { id: job.id }, data: { status: 'VALIDATING' } });
 try {
  const table = await parseFile(bytes, format);
  if (publicDemo && table.rows.length > 500) throw new RequestError(400, 'Public demo files are limited to 500 rows');
  job = await tx.importJob.update({ where: { id: job.id }, data: { status: 'MAPPING_REQUIRED', recordCount: table.rows.length, mapping: suggestMapping(table.headers, dataType) } });
 } catch (e) {
  if (!(e instanceof RequestError)) throw e;
  job = await tx.importJob.update({ where: { id: job.id }, data: { status: 'FAILED', errorCode: 'INVALID_FILE' } });
  await event(tx, organisationId, job.id, 'import.validation_failed', { code: 'INVALID_FILE' });
 }
 return { job: publicJob(job), duplicate: false };
}
export async function importHistory(tx: Tx, organisationId: string) {
 const jobs = await tx.importJob.findMany({ where: { organisationId, fileId: { not: null } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100 });
 const latest = await tx.importJob.groupBy({ by: ['sourceName'], where: { organisationId, status: { in: ['COMPLETED','COMPLETED_WITH_ERRORS'] }, successCount: { gt: 0 } }, _max: { completedAt: true } });
 return { jobs: jobs.map(publicJob), latest };
}
export async function importDetail(tx: Tx, organisationId: string, id: string) {
 const job = await getJob(tx, organisationId, id);
 const file = await tx.importFile.findFirstOrThrow({ where: { organisationId, id: job.fileId! }, select: { checksum: true, format: true, byteSize: true } });
 const errors = await tx.importError.findMany({ where: { organisationId, importJobId: id }, take: 100, orderBy: [{ row: 'asc' }, { field: 'asc' }] });
 const templates = await tx.importMapping.findMany({ where: { organisationId, provider: job.sourceName, dataType: job.dataType! }, take: 50, orderBy: { name: 'asc' }, select: { id: true, name: true, mapping: true, dateFormat: true } });
 if (job.status === 'FAILED') return { job: publicJob(job), file, headers: [], mapping: job.mapping, dateFormat: job.dateFormat, templates, errors };
 const table = await tableFor(tx, job);
 return { job: publicJob(job), file, headers: table.headers, mapping: job.mapping, dateFormat: job.dateFormat, templates, errors };
}
async function classifiedRows(tx: Tx, job: ImportJob, table: Awaited<ReturnType<typeof tableFor>>, mapping: Mapping, dateFormat: string, allowVersions: boolean) {
 const rows = mapRows(table, job.dataType!, mapping, dateFormat);
 const ids = [...new Set(rows.map(r => r.payload.externalId).filter(Boolean))];
 const prior = await tx.sourceRecord.findMany({ where: { organisationId: job.organisationId, connectionId: job.connectionId, sourceType: job.dataType!, OR: [{ externalId: { in: ids } }, { fingerprint: { in: rows.map(r => r.fingerprint) } }] }, select: { externalId: true, contentHash: true, fingerprint: true } });
 const refs = new Map<string, Record<string, string>>();
 for (const f of dataTypes[job.dataType!].fields.filter(f => f.reference)) {
  const keys = [...new Set(rows.map(r => r.payload[f.key]).filter(Boolean))];
  if (!keys.length) continue;
  const matches = await tx.sourceRecord.findMany({ where: { organisationId: job.organisationId, connectionId: job.connectionId, sourceType: f.reference!, externalId: { in: keys } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { externalId: true, payload: true } });
  for (const match of matches) if (!refs.has(`${f.reference}:${match.externalId}`)) refs.set(`${f.reference}:${match.externalId}`, match.payload as Record<string,string>);
 }
 const withinFile = new Map<string, Set<string>>();
 for (const r of rows) { const set = withinFile.get(r.payload.externalId) ?? new Set(); set.add(r.hash); withinFile.set(r.payload.externalId, set); }
 const seen = new Set<string>(), fingerprints = new Map<string,string>();
 return rows.map(row => {
  const issues: RowIssue[] = [...row.issues]; const add = (field: string, code: string) => issues.push({ row: row.row, field, code });
  if ((withinFile.get(row.payload.externalId)?.size ?? 0) > 1) add('externalId','DUPLICATE_ID');
  for (const f of dataTypes[job.dataType!].fields.filter(f => f.reference && row.payload[f.key])) {
   const ref = refs.get(`${f.reference}:${row.payload[f.key]}`);
   if (!ref) add(f.key, 'MISSING_REFERENCE');
   else if ((ref.scheme && row.payload.scheme && ref.scheme !== row.payload.scheme) || (ref.participantExternalId && row.payload.participantExternalId && ref.participantExternalId !== row.payload.participantExternalId)) add(f.key, 'REFERENCE_MISMATCH');
  }
  const own = prior.filter(p => p.externalId === row.payload.externalId);
  let outcome = own.some(p => p.contentHash === row.hash) || seen.has(row.hash) ? 'unchanged' : own.length ? 'updated' : 'new';
  // Reference-only records may legitimately have no attributes beyond their external ID.
  if (Object.keys(row.payload).some(k => !['externalId','sourceUpdatedAt'].includes(k)) && (prior.some(p => p.fingerprint === row.fingerprint && p.externalId !== row.payload.externalId) || (fingerprints.has(row.fingerprint) && fingerprints.get(row.fingerprint) !== row.payload.externalId))) add('externalId','FINGERPRINT_CONFLICT');
  if (outcome === 'updated' && !allowVersions) add('externalId','VERSION_CONFLICT');
  if (issues.length) outcome = 'conflicting';
  else { seen.add(row.hash); fingerprints.set(row.fingerprint, row.payload.externalId); }
  return { ...row, issues, outcome };
 });
}
export async function configureImport(tx: Tx, organisationId: string, id: string, input: unknown) {
 const config = configurationSchema.parse(input); let job = await getJob(tx, organisationId, id); await lockSource(tx, organisationId, job.connectionId); job = await getJob(tx, organisationId, id);
 if (!['MAPPING_REQUIRED','READY'].includes(job.status)) throw new RequestError(409, 'This import can no longer be remapped');
 const table = await tableFor(tx, job);
 try { checkMapping(table, job.dataType!, config.mapping); } catch { throw new RequestError(400, 'Map each required field to a distinct existing column'); }
 const rows = await classifiedRows(tx, job, table, config.mapping, config.dateFormat, config.allowVersions);
 job = await tx.importJob.update({ where: { id }, data: { mapping: config.mapping, dateFormat: config.dateFormat, allowVersions: config.allowVersions, status: 'READY' } });
 if (config.templateName) {
  const where = { organisationId_provider_dataType_name: { organisationId, provider: job.sourceName, dataType: job.dataType!, name: config.templateName } };
  await tx.importMapping.upsert({ where, create: { ...where.organisationId_provider_dataType_name, mapping: config.mapping, dateFormat: config.dateFormat }, update: { mapping: config.mapping, dateFormat: config.dateFormat } });
  await event(tx, organisationId, id, 'import.mapping_saved');
 }
 await event(tx, organisationId, id, 'import.previewed', { allowVersions: config.allowVersions });
 return { job: publicJob(job), preview: rows.slice(0, 20).map(({ row, payload, issues, outcome }) => ({ row, payload, issues, outcome })), errors: rows.flatMap(r => r.issues).slice(0,100), summary: { new: rows.filter(r => r.outcome === 'new').length, unchanged: rows.filter(r => r.outcome === 'unchanged').length, updated: rows.filter(r => r.outcome === 'updated').length, conflicting: rows.filter(r => r.outcome === 'conflicting').length } };
}
// A durable, client-driven queue: each POST processes at most 50 rows in one atomic transaction.
// A crash rolls back that entire batch; the persisted cursor is the only resume position.
export async function processImport(tx: Tx, organisationId: string, id: string, configurationToken: string) {
 let job = await getJob(tx, organisationId, id); await lockSource(tx, organisationId, job.connectionId); job = await getJob(tx, organisationId, id);
 if (configurationToken !== publicJob(job).configurationToken) throw new RequestError(409, 'The mapping changed. Reopen this import and review a fresh preview');
 if (finished(job)) return { job: publicJob(job) };
 if (!['READY','PROCESSING','FAILED'].includes(job.status) || job.errorCode === 'INVALID_FILE') throw new RequestError(409, 'Preview a valid mapping before importing');
 let table;
 try { table = await tableFor(tx, job); }
 catch {
  job = await tx.importJob.update({ where: { id }, data: { status: 'FAILED', errorCode: 'FILE_UNAVAILABLE' } });
  await event(tx, organisationId, id, 'import.failed', { code: 'FILE_UNAVAILABLE' }); return { job: publicJob(job) };
 }
 const rows = await classifiedRows(tx, job, table, job.mapping as Mapping, job.dateFormat, job.allowVersions);
 const batch = rows.slice(job.processedCount, job.processedCount + 50);
 let success = 0, rejected = 0, unchanged = 0, updated = 0;
 for (const row of batch) {
  if (row.issues.length) {
   rejected++; await tx.importError.createMany({ data: row.issues.map(issue => ({ ...issue, organisationId, importJobId: id })), skipDuplicates: true });
  } else if (row.outcome === 'unchanged') unchanged++;
  else {
   await tx.sourceRecord.create({ data: { organisationId, connectionId: job.connectionId, importJobId: id, sourceType: job.dataType!, externalId: row.payload.externalId, contentHash: row.hash, fingerprint: row.fingerprint, payload: row.payload } });
   success++; if (row.outcome === 'updated') updated++;
  }
 }
 const count = job.processedCount + batch.length; const done = count === job.recordCount;
 job = await tx.importJob.update({ where: { id }, data: { processedCount: count, successCount: { increment: success }, rejectedCount: { increment: rejected }, unchangedCount: { increment: unchanged }, updatedCount: { increment: updated }, status: done ? job.rejectedCount + rejected > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED' : 'PROCESSING', errorCode: null, ...(done ? { completedAt: new Date() } : {}) } });
 await event(tx, organisationId, id, done ? 'import.completed' : 'import.batch_committed', { processed: count, success: job.successCount, rejected: job.rejectedCount, unchanged: job.unchangedCount, updated: job.updatedCount, allowVersions: job.allowVersions });
 return { job: publicJob(job) };
}
export async function validationReport(tx: Tx, organisationId: string, id: string) {
 const job = await getJob(tx, organisationId, id);
 let issues: RowIssue[];
 if (job.status === 'READY') {
  const table = await tableFor(tx, job);
  issues = (await classifiedRows(tx, job, table, job.mapping as Mapping, job.dateFormat, job.allowVersions)).flatMap(r => r.issues);
 } else issues = await tx.importError.findMany({ where: { organisationId, importJobId: id }, orderBy: [{ row: 'asc' }, { field: 'asc' }] });
 await event(tx, organisationId, id, 'import.validation_report_downloaded');
 const { csvCell } = await import('@/lib/imports/validate');
 const { errorMessages } = await import('@/lib/imports/catalog');
 return { csv: [['Row','Field','Code','Explanation'].map(csvCell).join(','), ...issues.map(issue => [issue.row, issue.field, issue.code, errorMessages[issue.code] ?? 'Validation failed.'].map(csvCell).join(','))].join('\r\n') };
}
