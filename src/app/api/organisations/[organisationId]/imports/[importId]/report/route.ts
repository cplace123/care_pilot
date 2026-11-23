import { tenantApi } from '@/lib/server/api';
import { validationReport } from '@/lib/server/imports';
export async function GET(_request: Request, { params }: { params: Promise<{ organisationId: string; importId: string }> }) {
 const { organisationId, importId } = await params;
 const response = await tenantApi(organisationId, 'imports.read', tx => validationReport(tx, organisationId, importId));
 if (!response.ok) return response;
 const { csv } = await response.json();
 return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="validation-report.csv"', 'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff' } });
}
