export const providers = ['ShiftCare', 'AlayaCare', 'Visualcare', 'Lumary', 'CareMaster', 'Brevity', 'Xero', 'MYOB', 'CSV', 'Excel'] as const;
export type Field = { key: string; label: string; kind: 'id' | 'text' | 'date' | 'timestamp' | 'money' | 'scheme'; required?: boolean; reference?: string };
const id: Field = { key: 'externalId', label: 'External record ID', kind: 'id', required: true };
const sourceUpdated: Field = { key: 'sourceUpdatedAt', label: 'Source update timestamp (optional ISO text)', kind: 'timestamp' };
const participant: Field = { key: 'participantExternalId', label: 'Participant / client ID', kind: 'id', required: true, reference: 'participants' };
const scheme: Field = { key: 'scheme', label: 'Scheme', kind: 'scheme', required: true };
const date = (key: string, label: string, required = true): Field => ({ key, label, kind: 'date', required });
const money = (key: string, label: string): Field => ({ key, label, kind: 'money', required: true });
export const dataTypes: Record<string, { label: string; fields: Field[] }> = {
 participants: { label: 'Participants / clients', fields: [id, sourceUpdated, { key: 'displayName', label: 'Display name (optional)', kind: 'text' }] },
 services: { label: 'Service records', fields: [id, sourceUpdated, participant, scheme, date('serviceDate', 'Service date'), { key: 'workerExternalId', label: 'Worker ID (optional)', kind: 'id', reference: 'workers' }] },
 agreements: { label: 'Service agreements', fields: [id, sourceUpdated, participant, scheme, date('startDate', 'Start date'), date('endDate', 'End date', false)] },
 claims: { label: 'Claims', fields: [id, sourceUpdated, participant, scheme, { key: 'serviceExternalId', label: 'Service ID', kind: 'id', required: true, reference: 'services' }, date('serviceDate', 'Service date'), money('claimAmount', 'Claim amount')] },
 invoices: { label: 'Invoices', fields: [id, sourceUpdated, participant, scheme, date('invoiceDate', 'Invoice date'), money('invoiceAmount', 'Invoice amount')] },
 payments: { label: 'Payments / remittances', fields: [id, sourceUpdated, scheme, { key: 'claimExternalId', label: 'Claim ID (or invoice ID required)', kind: 'id', reference: 'claims' }, { key: 'invoiceExternalId', label: 'Invoice ID (or claim ID required)', kind: 'id', reference: 'invoices' }, date('paymentDate', 'Payment date'), money('paymentAmount', 'Payment amount')] },
 funding: { label: 'Funding records', fields: [id, sourceUpdated, participant, scheme, date('startDate', 'Start date'), date('endDate', 'End date'), money('fundingAmount', 'Funding amount')] },
 compliance: { label: 'Compliance document references', fields: [id, sourceUpdated, { key: 'workerExternalId', label: 'Worker ID', kind: 'id', required: true, reference: 'workers' }, { key: 'documentType', label: 'Document type', kind: 'text', required: true }, date('expiryDate', 'Expiry date', false)] },
 workers: { label: 'Worker records', fields: [id, sourceUpdated, { key: 'displayName', label: 'Display name (optional)', kind: 'text' }] },
};
export type Mapping = Record<string, string>;
export type Table = { headers: string[]; rows: string[][] };
export type RowIssue = { row: number; field: string; code: string };
export const errorMessages: Record<string, string> = {
 REQUIRED: 'Required value is missing.', INVALID_ID: 'Use a valid external identifier (maximum 200 characters).',
 INVALID_DATE: 'Use a real date in the selected format: ISO YYYY-MM-DD or Australian DD/MM/YYYY.',
 INVALID_TIMESTAMP: 'Use a valid ISO timestamp with an explicit timezone.', INVALID_AMOUNT: 'Use a non-negative decimal amount with at most two decimal places and no currency symbol or grouping.',
 INVALID_SCHEME: 'Use support_at_home or ndis.', TOO_LONG: 'Text exceeds 200 characters.', UNSAFE_CELL: 'Formula-like or unsafe cell content is not allowed.',
 MISSING_REFERENCE: 'Referenced record has not been imported from this source.', REFERENCE_MISMATCH: 'Reference belongs to another scheme or participant.',
 DUPLICATE_ID: 'This file contains conflicting values for the same external ID.', FINGERPRINT_CONFLICT: 'An equivalent record has a different external ID; review the source file.',
 VERSION_CONFLICT: 'Changed record requires explicit approval to append a new version.', DATE_ORDER: 'End date must not precede start date.',
};
export function suggestMapping(headers: string[], type: string): Mapping {
 const normal = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
 const aliases: Record<string, string[]> = { externalId: ['recordid', 'externalid', 'id'], participantExternalId: ['clientid', 'participantid'], serviceExternalId: ['serviceid'], workerExternalId: ['workerid'], claimExternalId: ['claimid'], invoiceExternalId: ['invoiceid'] };
 return Object.fromEntries((dataTypes[type]?.fields ?? []).flatMap(f => {
  const header = headers.find(h => [normal(f.key), ...(aliases[f.key] ?? []), ...(f.kind === 'money' ? ['amount'] : [])].includes(normal(h)));
  return header ? [[f.key, header]] : [];
 }));
}
