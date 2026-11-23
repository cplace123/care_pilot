import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: { default: 'CarePilot', template: '%s · CarePilot' }, description: 'Operations, compliance and financial assurance alongside your existing care systems.', robots: { index: false, follow: false } };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en-AU"><body>{children}</body></html>; }
