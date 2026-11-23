import { z } from 'zod';
import { readMutation, tenantApi } from '@/lib/server/api';
type Context = { params: Promise<{ organisationId: string }> };
export async function GET(_request: Request, context: Context) {
  const { organisationId } = await context.params;
  return tenantApi(organisationId, 'settings.read', tx => tx.organisation.findUnique({ where: { id: organisationId }, select: { id: true, name: true, createdAt: true, updatedAt: true } }));
}
export async function PATCH(request: Request, context: Context) {
  const { organisationId } = await context.params;
  return tenantApi(organisationId, 'organisation.configure', async tx => {
    const data = z.object({ name: z.string().trim().min(1).max(120) }).strict().parse(await readMutation(request));
    return tx.organisation.update({ where: { id: organisationId }, data, select: { id: true, name: true, updatedAt: true } });
  });
}
