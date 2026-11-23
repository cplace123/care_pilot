import Link from 'next/link';
import { requireIdentity } from '@/lib/server/auth';
import { listOrganisations } from '@/lib/server/access';
import { db } from '@/lib/server/db';
import { Brand } from '@/components/brand';
import { SignOut } from '@/components/sign-out';
import { ThemeToggle } from '@/components/theme-toggle';
export const dynamic = 'force-dynamic';
export default async function Organisations() {
 const identity = await requireIdentity(); const memberships = await listOrganisations(db(), identity);
 return <main className="chooser"><div className="chooser-top"><Brand/><ThemeToggle/></div><span className="eyebrow">YOUR WORKSPACES</span><h1>Choose your organisation</h1><p className="lead">Each workspace has its own people, permissions and records.</p><div className="workspace-choices">{memberships.map(({ organisation }) => <Link className="panel workspace-choice" key={organisation.id} href={`/app/${organisation.id}`}><span className="org-avatar">{organisation.name[0]}</span><strong>{organisation.name}</strong><span aria-hidden="true">→</span></Link>)}</div>{memberships.length === 0 && <p role="status">You do not have an active organisation membership. Contact your administrator.</p>}<SignOut/></main>;
}
