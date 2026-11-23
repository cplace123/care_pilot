import { tenantApi } from '@/lib/server/api';
import { readUpload } from '@/lib/server/import-files';
import { importHistory, uploadImport, uploadSchema } from '@/lib/server/imports';
export const runtime = 'nodejs';
type Context = { params: Promise<{ organisationId: string }> };
export async function GET(_request: Request, { params }: Context) {
 const { organisationId } = await params;
 return tenantApi(organisationId, 'imports.read', tx => importHistory(tx, organisationId));
}
export async function POST(request: Request, { params }: Context) {
 const { organisationId } = await params;
 return tenantApi(organisationId, 'imports.write', async tx => {
  const input = uploadSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  return uploadImport(tx, organisationId, input, await readUpload(request));
 });
}
