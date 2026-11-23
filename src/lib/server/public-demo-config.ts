import 'server-only';
import { z } from 'zod';
export const PUBLIC_DEMO_EMAIL = 'public-demo@carepilot.example';
export const PUBLIC_DEMO_ROLE = 'Public Demo';
export const publicDemoPermissions = ['dashboard.read','issues.read','compliance.read','finance.read','assistant.read','integrations.read','reports.read','settings.read','sources.read','imports.read','imports.write'] as const;
export function publicDemoConfig() {
 if (process.env.PUBLIC_DEMO_ENABLED !== 'true') return null;
 const parsed = z.object({ PUBLIC_DEMO_USER_ID: z.uuid(), PUBLIC_DEMO_ORGANISATION_ID: z.uuid(), PUBLIC_DEMO_EXPIRES_AT: z.iso.datetime() }).safeParse(process.env);
 if (!parsed.success || Date.parse(parsed.data.PUBLIC_DEMO_EXPIRES_AT) <= Date.now()) return null;
 return { userId: parsed.data.PUBLIC_DEMO_USER_ID, organisationId: parsed.data.PUBLIC_DEMO_ORGANISATION_ID, expiresAt: new Date(parsed.data.PUBLIC_DEMO_EXPIRES_AT) };
}
export function safePublicDemoGrants(roles: string[], permissions: string[]) {
 return roles.length === 1 && roles[0] === PUBLIC_DEMO_ROLE && permissions.every(p => (publicDemoPermissions as readonly string[]).includes(p));
}
