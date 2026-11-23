import { tenantApi } from '@/lib/server/api';
export async function GET(_request: Request, context: { params: Promise<{ organisationId: string }> }) {
  const { organisationId } = await context.params;
  return tenantApi(organisationId, 'integrations.read', tx => tx.integrationConnection.findMany({ where: { organisationId }, select: { id: true, provider: true, displayName: true, status: true, readOnly: true, lastSuccessfulSyncAt: true }, orderBy: { provider: 'asc' } }));
}
