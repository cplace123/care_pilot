"use client";
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Icon } from './icon';
export function LoginForm() {
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const router = useRouter();
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      const result = await signIn('credentials', { email: data.get('email'), password: data.get('password'), code: data.get('code'), redirect: false });
      if (result?.ok && !result.error) { router.replace('/app'); router.refresh(); }
      else { setError('Unable to sign in. Check your details and authenticator code, or wait 15 minutes if you have tried repeatedly.'); setBusy(false); }
    } catch { setError('Sign-in is temporarily unavailable. Please try again.'); setBusy(false); }
  }
  return <form onSubmit={submit} className="login-form"><label htmlFor="email">Work email</label><input id="email" name="email" type="email" autoComplete="username" placeholder="you@yourorganisation.com.au" required maxLength={254}/><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required maxLength={128}/><label htmlFor="code">Authenticator code <span className="muted">(if enabled)</span></label><input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} aria-describedby="mfa-help"/><p id="mfa-help" className="muted">Required for Organisation Owners and Administrators.</p>{error && <p role="alert" className="form-error">{error}</p>}<button className="button primary" disabled={busy} type="submit">{busy ? 'Signing in…' : 'Sign in to your workspace'}<Icon name="arrow" size={18}/></button><p className="login-help">Need access? Contact your organisation administrator.<br/>Stage 1 accounts are provisioned locally.</p></form>;
}
