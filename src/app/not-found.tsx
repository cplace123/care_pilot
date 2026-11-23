import Link from 'next/link';
export default function NotFound() { return <main className="chooser"><span className="eyebrow">WORKSPACE ACCESS</span><h1>This page isn’t available.</h1><p className="lead">It may not exist, or your account may not have access.</p><Link className="button primary" href="/app">Back to your workspaces</Link></main>; }
