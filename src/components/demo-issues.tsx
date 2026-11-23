"use client";
import { useState } from 'react';
import { demoIssues } from '@/lib/demo';
import { Icon } from './icon';
export function DemoIssues({ areas, filters = false }: { areas: string[]; filters?: boolean }) {
  const [severity, setSeverity] = useState('All priorities');
  const items = demoIssues.filter(i => areas.includes(i.area) && (severity === 'All priorities' || i.severity === severity));
  return <>{filters && <div className="filter-bar"><label htmlFor="priority">Priority</label><select id="priority" value={severity} onChange={e => setSeverity(e.target.value)}><option>All priorities</option><option>High</option><option>Medium</option></select><span className="muted" aria-live="polite">{items.length} examples</span></div>}
    <div className="issue-list">{items.map(issue => <article className="issue-row" key={issue.id}><span className={`issue-icon ${issue.area.toLowerCase()}`}><Icon name={issue.area === 'Finance' ? 'wallet' : 'shield'}/></span><div className="issue-copy"><div className="issue-meta"><span>{issue.area}</span><span>·</span><span>{issue.scheme}</span></div><h3>{issue.title}</h3><p>{issue.detail}</p><span className="issue-owner">{issue.id} · {issue.owner}</span></div><span className={`badge ${issue.severity.toLowerCase()}`}>{issue.severity}</span></article>)}{items.length === 0 && <p className="empty-small">No examples are available for your role and filter.</p>}</div></>;
}
