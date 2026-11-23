import Link from 'next/link';
import { navigation } from '@/lib/permissions';
import { Brand } from './brand';
import { Icon } from './icon';
import { ThemeToggle } from './theme-toggle';
import { SignOut } from './sign-out';
export function AppShell({ organisation, userName, roles, permissions, section, children }: { organisation: { id: string; name: string }; userName: string; roles: string[]; permissions: string[]; section: string; children: React.ReactNode }) {
  const base = `/app/${organisation.id}`;
  const nav = <nav aria-label="Main navigation">{navigation.map(item => {
    const allowed = permissions.includes(item.permission);
    return allowed ? <Link key={item.slug} href={`${base}/${item.slug}`} className={`nav-item ${section === item.slug ? 'active' : ''}`} aria-current={section === item.slug ? 'page' : undefined}><Icon name={item.icon}/><span>{item.label}</span>{item.slug === 'assistant' && <span className="nav-tag">SOON</span>}</Link> : <span key={item.slug} className="nav-item unavailable" aria-disabled="true" title="Your role does not have access"><Icon name={item.icon}/><span>{item.label}</span><span className="sr-only"> — no access</span></span>;
  })}</nav>;
  return <div className="app-frame">
    <a href="#main" className="skip-link">Skip to content</a>
    <aside className="sidebar"><Link href={base} aria-label="CarePilot home"><Brand/></Link>
      <Link href="/app" className="organisation-switch"><span className="org-avatar">{organisation.name.slice(0,1)}</span><span><strong>{organisation.name}</strong><small>Change organisation</small></span><span aria-hidden="true">⌄</span></Link>
      <p className="eyebrow nav-label">WORKSPACE</p>{nav}
      <div className="sidebar-bottom"><div className="foundation-note"><Icon name="shield"/><strong>Your systems. Connected.</strong><p>Keep the tools you know.<br/>Bring the bigger picture together.</p></div><div className="profile"><span className="avatar">{userName.split(' ').map(n => n[0]).slice(0,2).join('')}</span><span><strong>{userName}</strong><small>{roles.join(', ')}</small></span></div><SignOut/></div>
    </aside>
    <div className="workspace"><header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <strong>{navigation.find(n => n.slug === section)?.label ?? 'Home'}</strong></div><div className="top-actions"><span className="environment-label"><span/>Foundation preview</span><ThemeToggle/></div></header>
      <div className="mobile-navigation"><Link href={base}><Brand/></Link><details key={section}><summary>Menu</summary>{nav}<Link className="nav-item" href="/app">Change organisation</Link><SignOut/></details></div>
      <main id="main" className="main-content">{children}<footer className="page-footer"><span>CarePilot · Working alongside your existing systems</span><span>Stage 3 · Synthetic data only</span></footer></main>
    </div>
  </div>;
}
