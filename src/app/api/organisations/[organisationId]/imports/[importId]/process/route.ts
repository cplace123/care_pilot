import { z } from 'zod';
import { tenantApi, readMutation } from '@/lib/server/api';
import { processImport } from '@/lib/server/imports';
export async function POST(request: Request, { params }: { params: Promise<{ organisationId: string; importId: string }> }) {
 const { organisationId, importId } = await params;
 return tenantApi(organisationId, 'imports.write', async tx => { const input = z.object({ configurationToken: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(await readMutation(request)); return processImport(tx, organisationId, importId, input.configurationToken); });
}
