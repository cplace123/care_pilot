import { z } from 'zod';
import { readMutation, RequestError, tenantApi } from '@/lib/server/api';
export async function PATCH(request: Request, context: { params: Promise<{ organisationId: string; connectionId: string }> }) {
  const { organisationId, connectionId } = await context.params;
  return tenantApi(organisationId, 'integrations.configure', async tx => {
    z.uuid().parse(connectionId);
    const data = z.object({ displayName: z.string().trim().min(1).max(120).nullable() }).strict().parse(await readMutation(request));
    const existing = await tx.integrationConnection.findUnique({ where: { organisationId_id: { organisationId, id: connectionId } }, select: { id: true } });
    if (!existing) throw new RequestError(404, 'Connection not found');
    return tx.integrationConnection.update({ where: { organisationId_id: { organisationId, id: connectionId } }, data, select: { id: true, provider: true, displayName: true } });
  });
}
