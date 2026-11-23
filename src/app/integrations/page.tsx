import { redirect } from 'next/navigation';
import { requireIdentity } from '@/lib/server/auth';
import { listOrganisations } from '@/lib/server/access';
import { db } from '@/lib/server/db';
export default async function Integrations() {
 const memberships = await listOrganisations(db(), await requireIdentity());
 if (memberships.length === 1) redirect(`/app/${memberships[0].organisation.id}/integrations`);
 redirect('/app');
}
