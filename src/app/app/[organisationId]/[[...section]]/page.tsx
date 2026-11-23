import { IntegrationHub } from '@/components/integration-hub';
import { importLimits } from '@/lib/server/import-files';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireIdentity } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { AccessDenied, withOrganisation } from '@/lib/server/access';
import { navigation } from '@/lib/permissions';
import { AppShell } from '@/components/app-shell';
import { DemoIssues } from '@/components/demo-issues';
import { Icon } from '@/components/icon';
export const dynamic = 'force-dynamic';
const headings: Record<string, { title: string; description: string }> = {
 '': { title: 'A clearer view of your day.', description: 'A little less searching. More focus on what needs your attention.' },
 issues: { title: 'Focus on what needs attention.', description: 'A preview of how your team will review and prioritise exceptions.' },
 compliance: { title: 'Confidence starts with evidence.', description: 'A dedicated place for compliance reviews, with separate scheme rules.' },
 finance: { title: 'See the story behind the numbers.', description: 'A workspace for reviewing claims, payments and funding exceptions.' },
 assistant: { title: 'An extra hand. You’re in control.', description: 'Future assistance grounded in your authorised records.' },
 integrations: { title: 'Keep the systems you know.', description: 'CarePilot works alongside your existing care and accounting software.' },
 reports: { title: 'The bigger picture, made clear.', description: 'Future reporting will trace every metric to its source.' },
 settings: { title: 'Your organisation, your workspace.', description: 'Review your organisation, access and security information.' },
};
export default async function Workspace({ params }: { params: Promise<{ organisationId: string; section?: string[] }> }) {
 const { organisationId, section: segments } = await params;
 const section = segments?.join('/') ?? '';
 const item = navigation.find(n => n.slug === section);
 if (!item || !z.uuid().safeParse(organisationId).success) notFound();
 const identity = await requireIdentity();
 const data = await withOrganisation(db(), identity, organisationId, item.permission, async (tx, access) => {
   const organisation = await tx.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { id: true, name: true } });
   const user = await tx.user.findUniqueOrThrow({ where: { id: identity.userId }, select: { name: true } });
   const connections = section === 'integrations' ? await tx.integrationConnection.findMany({ where: { organisationId }, orderBy: { provider: 'asc' } }) : [];
   const events = access.permissions.includes('audit.read') && (section === '' || section === 'settings') ? await tx.activityEvent.findMany({ where: { organisationId }, take: 5, orderBy: { createdAt: 'desc' } }) : [];
   return { organisation, user, connections, events, ...access };
 }).catch(error => { if (error instanceof AccessDenied) notFound(); throw error; });
 const base = `/app/${organisationId}`;
 const areas = [ ...(data.permissions.includes('compliance.read') ? ['Compliance'] : []), ...(data.permissions.includes('finance.read') ? ['Finance'] : []) ];
 const heading = headings[section];
 return <AppShell organisation={data.organisation} userName={data.user.name} roles={data.roles} permissions={data.permissions} section={section}>
   <div className="page-heading"><div><span className="eyebrow">{section === '' ? 'YOUR WORKSPACE, AT A GLANCE' : item.label.toUpperCase()}</span><h1>{heading.title}</h1><p className="lead">{heading.description}</p></div>{section === '' && data.permissions.includes('issues.read') && <Link className="button primary" href={`${base}/issues`}>Review priority issues<Icon name="arrow" size={18}/></Link>}</div>
   <div className="demo-notice"><Icon name="info" size={18}/><p><strong>Foundation preview.</strong> All issue examples are synthetic. No care systems are connected and no automated checks have run.</p></div>
   {section === '' && <>
     <section className="welcome-panel"><div><span className="eyebrow">A GOOD PLACE TO START</span><h2>Everything important.<br/>A little easier to see.</h2><p>Your team’s review queue will bring exceptions together, with the evidence and next steps to help you move forward.</p>{data.permissions.includes('integrations.read') && <Link href={`${base}/integrations`} className="text-link">Explore your integrations<Icon name="arrow" size={16}/></Link>}</div><div className="welcome-visual" aria-hidden="true"><span className="visual-orbit"/><span className="visual-orbit second"/><span className="visual-centre"><Icon name="layers" size={42}/></span><span className="floating-label label-one"><Icon name="shield" size={17}/>Compliance</span><span className="floating-label label-two"><Icon name="wallet" size={17}/>Finance</span><span className="floating-label label-three"><Icon name="check" size={17}/>Peace of mind</span></div></section>
     <div className="dashboard-grid"><section className="panel"><div className="panel-heading"><div><h2>Priority issues</h2><p>What a review queue could look like</p></div><span className="badge neutral">Examples</span></div><DemoIssues areas={areas}/>{data.permissions.includes('issues.read') && <Link className="panel-link" href={`${base}/issues`}>View example issues<Icon name="arrow" size={17}/></Link>}</section><div className="right-stack"><section className="panel connection-summary"><span className="small-icon"><Icon name="link"/></span><h2>A fresh start</h2><p>Your care systems remain independent. Manual import history and freshness are available in Integrations. No API sync is connected.</p><div className="status-line"><span className="status-dot"/>No successful sync yet</div></section><section className="panel compact-panel"><div className="inline-heading"><Icon name="spark"/><h2>You have the final say</h2></div><p>AI drafts and sensitive changes will require human review. AI is not active in this preview.</p></section></div></div>
     <section className="panel activity-panel"><div className="panel-heading"><div><h2>Recent activity</h2><p>{data.permissions.includes('audit.read') ? 'Actual workspace access events' : 'Audit history is restricted to authorised roles'}</p></div><Icon name="clock"/></div>{data.events.length ? data.events.map(event => <div className="activity-row" key={event.id}><span className="activity-dot"/><span>{event.action === 'auth.login' ? 'A team member signed in' : event.action === 'auth.logout' ? 'A team member signed out' : event.action === 'workspace.demo_seeded' ? 'Demonstration workspace initialised' : event.action.replaceAll('.', ' ').replaceAll('_', ' ')}</span><time dateTime={event.createdAt.toISOString()}>{event.createdAt.toLocaleString('en-AU', { timeZone: 'Australia/Sydney', dateStyle: 'medium', timeStyle: 'short' })} Sydney time</time></div>) : <p className="empty-small">No activity to display.</p>}</section>
   </>}
   {section === 'issues' && <section className="panel"><div className="panel-heading"><div><h2>Example review queue</h2><p>These examples have no source records and cannot be actioned.</p></div><span className="badge neutral">Synthetic</span></div><DemoIssues areas={areas} filters/></section>}
   {['compliance', 'finance', 'assistant', 'reports'].includes(section) && <section className="panel placeholder"><span className="placeholder-icon"><Icon name={item.icon} size={32}/></span><span className="badge neutral">Planned for a later stage</span><h2>{section === 'assistant' ? 'Your assistant is not active yet' : `${item.label} workspace is ready for the next stage`}</h2><p>{section === 'compliance' ? 'No compliance assessments have been performed. Future reviews will keep aged care and NDIS requirements separate and link findings to versioned rules and evidence.' : section === 'finance' ? 'No financial calculations or reconciliation have run. Future checks will use deterministic, testable calculations and source-linked findings.' : section === 'assistant' ? 'No AI provider is connected. Future assistance will respect your permissions, cite source records and keep sensitive actions under human control.' : 'Analytical reports and evidence packs are planned for a later stage. Import validation reports are available in Integrations.'}</p><div className="placeholder-foot"><Icon name="shield" size={17}/>Your existing software remains your source of truth.</div></section>}
   {section === 'integrations' && data.permissions.includes('imports.read') && <IntegrationHub organisationId={organisationId} canWrite={data.permissions.includes('imports.write')} maxBytes={importLimits().IMPORT_MAX_BYTES} maxRows={importLimits().IMPORT_MAX_ROWS} connections={data.connections.map(({provider,status,displayName}) => ({provider,status,displayName}))}/>}
   {section === 'settings' && <div className="settings-grid"><section className="panel settings-panel"><h2>Organisation details</h2><dl><dt>Name</dt><dd>{data.organisation.name}</dd><dt>Workspace ID</dt><dd className="mono">{organisationId}</dd><dt>Your roles</dt><dd>{data.roles.join(', ')}</dd><dt>Session duration</dt><dd>8 hours · revoked when you sign out</dd></dl></section><section className="panel settings-panel"><h2>Your permissions</h2><p>Access is checked on the server for each workspace request.</p><ul className="permission-list">{data.permissions.map(permission => <li key={permission}><Icon name="check" size={16}/>{permission}</li>)}</ul><p className="muted">Role editing and account administration are not available in this foundation preview.</p></section></div>}
 </AppShell>;
}
