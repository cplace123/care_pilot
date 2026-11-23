'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { signIn, type SignInResponse } from 'next-auth/react';
import { useRouter } from 'next/navigation';
export function PublicDemoEntry({ organisationId }: { organisationId: string }) {
 const router = useRouter();
 const attempt = useRef<Promise<SignInResponse | undefined> | null>(null);
 const [failed,setFailed] = useState(false), [retry,setRetry] = useState(0);
 useEffect(() => {
  let active = true;
  attempt.current ??= signIn('credentials', { demo: 'true', redirect: false });
  attempt.current.then(result => { if (!active) return; if (result?.ok && !result.error) { router.replace(`/app/${organisationId}`); router.refresh(); } else setFailed(true); }).catch(() => { if (active) setFailed(true); });
  return () => { active = false; };
 }, [organisationId,router,retry]);
 return <main className="chooser"><span className="eyebrow">CAREPILOT · PUBLIC DEMO</span><h1>{failed ? 'The demo is temporarily unavailable.' : 'Opening your demo…'}</h1><p className="lead">No password needed. This is a shared synthetic workspace; imported files are visible to other demo visitors.</p><p>Use fictional data only. Existing organisation accounts remain private.</p>{failed && <button className="button primary" onClick={() => { attempt.current=null;setFailed(false);setRetry(n=>n+1); }}>Try again</button>}<p><Link className="text-link" href="/login?account=1">Use an organisation account</Link></p></main>;
}
