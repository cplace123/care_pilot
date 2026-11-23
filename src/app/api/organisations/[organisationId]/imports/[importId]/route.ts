import { tenantApi, readMutation } from '@/lib/server/api';
import { importDetail, configureImport } from '@/lib/server/imports';
type Context = { params: Promise<{ organisationId: string; importId: string }> };
export async function GET(_request: Request, { params }: Context) {
 const { organisationId, importId } = await params;
 return tenantApi(organisationId, 'imports.read', tx => importDetail(tx, organisationId, importId));
}
export async function PATCH(request: Request, { params }: Context) {
 const { organisationId, importId } = await params;
 return tenantApi(organisationId, 'imports.write', async tx => configureImport(tx, organisationId, importId, await readMutation(request)));
}
