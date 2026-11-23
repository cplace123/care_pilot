'use client';
import { useCallback, useEffect, useState } from 'react';
import { dataTypes, providers, errorMessages, type Mapping, type RowIssue } from '@/lib/imports/catalog';
type Job = { configurationToken: string; id: string; sourceName: string; dataType: string; status: string; recordCount: number; processedCount: number; successCount: number; rejectedCount: number; unchangedCount: number; updatedCount: number; errorCode: string | null; createdAt: string; completedAt: string | null; allowVersions: boolean; initiatedById: string; fileId: string };
type Detail = { job: Job; file: { checksum: string; format: string; byteSize: number }; headers: string[]; mapping: Mapping; dateFormat: string; errors: RowIssue[]; templates: { id: string; name: string; mapping: Mapping; dateFormat: string }[] };
type Preview = { preview: { row: number; payload: Record<string,string>; outcome: string; issues: RowIssue[] }[]; errors: RowIssue[]; summary: { new: number; unchanged: number; updated: number; conflicting: number } };
const status = (s: string) => ({ MAPPING_REQUIRED: 'Mapping required', READY: 'Ready to import', PROCESSING: 'In progress · resume available', COMPLETED_WITH_ERRORS: 'Completed with errors' }[s] ?? s.charAt(0) + s.slice(1).toLowerCase());
const time = (s: string | null) => s ? new Date(s).toLocaleString('en-AU', { timeZone: 'Australia/Sydney', dateStyle: 'medium', timeStyle: 'short' }) + ' Sydney' : 'No successful import';
export function IntegrationHub({ organisationId, canWrite, maxBytes, maxRows, connections }: { organisationId: string; canWrite: boolean; maxBytes: number; maxRows: number; connections: { provider: string; status: string; displayName: string | null }[] }) {
 const base = `/api/organisations/${organisationId}/imports`;
 const [jobs, setJobs] = useState<Job[]>([]), [latest,setLatest] = useState<Record<string,string>>({});
 const [showUpload,setShowUpload] = useState(false), [provider,setProvider] = useState('CSV'), [type,setType] = useState('participants'), [file,setFile] = useState<File | null>(null);
 const [detail,setDetail] = useState<Detail | null>(null), [mapping,setMapping] = useState<Mapping>({}), [dateFormat,setDateFormat] = useState('ISO'), [allowVersions,setAllowVersions] = useState(false), [templateName,setTemplateName] = useState('');
 const [preview,setPreview] = useState<Preview | null>(null), [busy,setBusy] = useState(false), [message,setMessage] = useState(''), [error,setError] = useState('');
 const request = useCallback(async (path: string, init?: RequestInit) => {
  const res = await fetch(base + path, { ...init, cache: 'no-store' });
  const body = await res.json(); if (!res.ok) throw new Error(body.error ?? 'Request failed'); return body;
 }, [base]);
 const refresh = useCallback(async () => {
  const data = await request(''); setJobs(data.jobs); setLatest(Object.fromEntries(data.latest.filter((r: { _max: { completedAt: string | null } }) => r._max.completedAt).map((r: { sourceName: string; _max: { completedAt: string } }) => [r.sourceName,r._max.completedAt])));
 }, [request]);
 useEffect(() => { let active = true; request('').then(data => { if (active) { setJobs(data.jobs); setLatest(Object.fromEntries(data.latest.map((r: { sourceName: string; _max: { completedAt: string } }) => [r.sourceName,r._max.completedAt]))); } }).catch(() => { if (active) setError('Could not load import history. Refresh to try again.'); }); return () => { active = false; }; }, [request]);
 const open = async (id: string) => {
  const next: Detail = await request(`/${id}`); setDetail(next); setMapping(next.mapping); setDateFormat(next.dateFormat); setAllowVersions(next.job.allowVersions); setPreview(null); setTemplateName(''); setShowUpload(false);
 };
 const run = async (action: () => Promise<void>) => { setBusy(true); setError(''); setMessage(''); try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Request interrupted. Reopen the import and resume safely.'); } finally { setBusy(false); } };
 const upload = () => run(async () => {
  if (!file) throw new Error('Choose a CSV or XLSX file');
  if (file.size > maxBytes) throw new Error('File exceeds the upload limit');
  const query = new URLSearchParams({ provider, dataType: type, filename: file.name });
  const data = await request(`?${query}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file });
  await open(data.job.id); await refresh(); setMessage(data.duplicate ? 'This file was already uploaded. Opened the existing import.' : 'Upload saved securely. Review the mapping before importing.');
 });
 const savePreview = () => run(async () => {
  if (!detail) return;
  const data = await request(`/${detail.job.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mapping, dateFormat, allowVersions, ...(templateName ? { templateName } : {}) }) });
  setPreview(data); setDetail({ ...detail, job: data.job }); await refresh(); setMessage('Preview ready. Only valid rows will be imported.');
 });
 const process = () => run(async () => {
  if (!detail) return;
  let job = detail.job;
  do {
   const data = await request(`/${job.id}/process`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ configurationToken: job.configurationToken }) }); job = data.job;
   setDetail(current => current ? { ...current, job } : null);
  } while (job.status === 'PROCESSING');
  await open(job.id); await refresh(); setMessage(job.status === 'FAILED' ? 'Import failed. The saved history shows the failure code.' : `Import complete: ${job.successCount} saved, ${job.unchangedCount} unchanged, ${job.rejectedCount} rejected.`);
 });
 const editable = detail && ['MAPPING_REQUIRED','READY'].includes(detail.job.status);
 return <div className="hub">
  <section className="panel hub-intro"><div><h2>Bring your information together</h2><p>Import synthetic exports securely. Your existing software stays the source of truth.</p></div>{canWrite && !showUpload && (!detail || ['COMPLETED','COMPLETED_WITH_ERRORS'].includes(detail.job.status)) && <button className="button primary" disabled={busy} onClick={() => { setShowUpload(true); setDetail(null); setPreview(null); }}>Import Data</button>}</section>
  {error && <p className="hub-error" role="alert">{error}</p>}{message && <p className="hub-success" role="status">{message}</p>}
  {showUpload && <form className="panel hub-form" onSubmit={e => { e.preventDefault(); void upload(); }}>
   <h2>1. Choose your export</h2><p>Synthetic test data only. Up to {maxBytes / 1048576} MiB, {maxRows} rows and 50 columns. One worksheet; no formulas, macros or links.</p>
   <div className="hub-fields"><label>Source system<select value={provider} onChange={e => setProvider(e.target.value)}>{providers.map(p => <option key={p}>{p}</option>)}</select></label><label>Record type<select value={type} onChange={e => setType(e.target.value)}>{Object.entries(dataTypes).map(([key,value]) => <option value={key} key={key}>{value.label}</option>)}</select></label></div>
   <p className="muted">Import participant and worker references first, followed by services, claims and payments. References must come from the same source system.</p>
   <label>CSV or Excel file<input type="file" accept=".csv,.xlsx" required onChange={e => setFile(e.target.files?.[0] ?? null)}/></label>
   <div className="hub-actions"><button className="button primary" disabled={busy}>{busy ? 'Uploading…' : 'Upload and map'}</button><button type="button" className="button secondary" disabled={busy} onClick={() => setShowUpload(false)}>Cancel</button></div>
  </form>}
  {detail && <section className="panel hub-form" aria-label="Import details">
   <div className="panel-heading"><div><h2>{editable ? '2. Map and preview' : 'Import details'}</h2><p>{detail.job.sourceName} · {dataTypes[detail.job.dataType]?.label} · {status(detail.job.status)}</p></div><button className="button secondary" disabled={busy} onClick={() => setDetail(null)}>Close</button></div>
   <p className="muted">File {detail.job.fileId} · {detail.file.format.toUpperCase()} · {detail.file.byteSize} bytes</p><details><summary>Import provenance</summary><p className="mono hub-wrap">SHA-256: {detail.file.checksum}</p><p className="mono hub-wrap">Initiated by user {detail.job.initiatedById}</p><p>{time(detail.job.createdAt)}</p></details>
   {detail.job.status === 'FAILED' && <p role="alert" className="hub-error">{detail.job.errorCode === 'INVALID_FILE' ? 'File validation failed. Upload a corrected UTF-8 CSV or plain, single-sheet XLSX within the limits. Formulas, links, macros and unsafe cells are rejected.' : 'The saved file could not be read. Retry after the underlying storage or encryption configuration has been restored.'}</p>}
   {editable && <>
    {!!detail.templates.length && <label>Reuse a mapping<select defaultValue="" disabled={busy} onChange={e => { const t = detail.templates.find(t => t.id === e.target.value); if (t) { setMapping(t.mapping); setDateFormat(t.dateFormat); setPreview(null); } }}><option value="">Select a saved template</option>{detail.templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}
    <div className="hub-fields">{dataTypes[detail.job.dataType].fields.map(f => <label key={f.key}>{f.label}{f.required ? ' *' : ''}<select disabled={!canWrite || busy} value={mapping[f.key] ?? ''} onChange={e => { const next = { ...mapping }; if (e.target.value) next[f.key] = e.target.value; else delete next[f.key]; setMapping(next); setPreview(null); }}><option value="">Not mapped</option>{detail.headers.map(h => <option key={h} value={h}>{h}</option>)}</select></label>)}</div>
    <div className="hub-fields"><label>Date format<select value={dateFormat} disabled={!canWrite || busy} onChange={e => { setDateFormat(e.target.value); setPreview(null); }}><option value="ISO">ISO · YYYY-MM-DD (also Excel date cells)</option><option value="AU">Australian text · DD/MM/YYYY</option></select></label><label>Save mapping as (optional)<input value={templateName} maxLength={80} disabled={!canWrite || busy} onChange={e => setTemplateName(e.target.value)} placeholder="e.g. Monthly service export"/></label></div>
    <label className="hub-checkbox"><input type="checkbox" checked={allowVersions} disabled={!canWrite || busy} onChange={e => { setAllowVersions(e.target.checked); setPreview(null); }}/><span>Approve changed records as new, immutable versions. Retain previous records and audit this decision.</span></label>
    {canWrite && <button className="button secondary" disabled={busy} onClick={() => void savePreview()}>Validate and preview</button>}
   </>}
   {preview && <><h3>3. Review before import</h3><p>{preview.summary.new} new · {preview.summary.unchanged} unchanged · {preview.summary.updated} updated · {preview.summary.conflicting} conflicting / invalid</p><p className="muted">Showing the first 20 rows. Validation is checked again when each batch commits.</p><div className="hub-table-scroll"><table><thead><tr><th>Row</th><th>Result</th><th>Mapped values</th></tr></thead><tbody>{preview.preview.map(r => <tr key={r.row}><td>{r.row}</td><td>{r.outcome}</td><td>{Object.entries(r.payload).map(([k,v]) => <span className="hub-value" key={k}><strong>{k}:</strong> {v}</span>)}</td></tr>)}</tbody></table></div></>}
   {(preview?.errors.length || detail.errors.length) ? <div><h3>Validation errors</h3><p className="muted">First 100 errors. The download includes all recorded errors and no original cell values.</p><ul className="hub-errors">{(preview?.errors ?? detail.errors).map((issue,i) => <li key={i}>Row {issue.row} · {issue.field}: {errorMessages[issue.code] ?? issue.code}</li>)}</ul></div> : null}
   <p aria-live="polite">Processed {detail.job.processedCount} of {detail.job.recordCount} · Saved {detail.job.successCount} ({detail.job.updatedCount} new versions) · Unchanged {detail.job.unchangedCount} · Rejected {detail.job.rejectedCount}</p><progress max={Math.max(1,detail.job.recordCount)} value={detail.job.processedCount} aria-label="Import progress"/>
   <div className="hub-actions">{canWrite && ((detail.job.status === 'READY' && preview) || detail.job.status === 'PROCESSING' || (detail.job.status === 'FAILED' && detail.job.errorCode !== 'INVALID_FILE')) && <button className="button primary" disabled={busy} onClick={() => void process()}>{busy ? 'Processing…' : detail.job.status === 'READY' ? 'Import valid records' : 'Resume import'}</button>}{detail.job.status !== 'MAPPING_REQUIRED' && <a className="text-link" href={`${base}/${detail.job.id}/report`}>Download validation report</a>}</div>
   {detail.job.status === 'PROCESSING' && <p className="muted">Progress is saved after every batch. Reopen this import and resume if your browser closes or the connection fails.</p>}
  </section>}
  <section className="panel hub-history"><div className="panel-heading"><div><h2>Import history</h2><p>Latest 100 uploads. Failed or unfinished imports need your attention.</p></div><button className="button secondary" disabled={busy} onClick={() => void run(refresh)}>Refresh</button></div>{jobs.length ? <ul>{jobs.map(job => <li key={job.id}><div><strong>{job.sourceName} · {dataTypes[job.dataType]?.label}</strong><p>{status(job.status)} · {job.processedCount}/{job.recordCount} processed · {job.rejectedCount} rejected</p><small>{time(job.createdAt)}</small></div><button className="button secondary" disabled={busy} onClick={() => void run(() => open(job.id))}>{['FAILED','PROCESSING','MAPPING_REQUIRED','READY'].includes(job.status) ? 'Review import' : 'View details'}</button></li>)}</ul> : <p className="empty-small">No files imported yet. Start with a synthetic participant or worker export.</p>}</section>
  <section><h2>Available sources</h2><p>Manual exports only. API integrations are not available or connected.</p><div className="integration-grid">{providers.map(p => { const connection = connections.find(c => c.provider === p); return <article className="panel integration-card" key={p}><div className="integration-card-top"><span className="provider-mark">{p.slice(0,2)}</span><span className="badge neutral">{connection?.status === 'ERROR' ? 'Configuration needs review' : ['CSV','Excel'].includes(p) ? 'File import' : 'API not connected'}</span></div><h3>{connection?.displayName ?? p}</h3><p>{['CSV','Excel'].includes(p) ? 'Generic file import' : ['Xero','MYOB'].includes(p) ? 'Accounting source' : 'Care management source'}</p><p className="coming-soon">Last records imported: {time(latest[p] ?? null)}</p></article>; })}</div></section>
 </div>;
}
