import { tenantApi } from '@/lib/server/api';
export async function GET(_request: Request, context: { params: Promise<{ organisationId: string }> }) {
  const { organisationId } = await context.params;
  return tenantApi(organisationId, 'audit.read', tx => tx.activityEvent.findMany({ where: { organisationId }, take: 50, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }));
}
