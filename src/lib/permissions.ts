export const permissionDescriptions = {
  'dashboard.read': 'View the organisation overview',
  'issues.read': 'View demonstration issue examples',
  'compliance.read': 'View compliance workspace',
  'finance.read': 'View finance workspace',
  'assistant.read': 'View the assistant placeholder',
  'integrations.read': 'View connection status',
  'reports.read': 'View reports placeholder',
  'settings.read': 'View organisation settings',
  'organisation.configure': 'Change organisation settings',
  'integrations.configure': 'Change integration display settings',
  'sources.read': 'View source record metadata',
  'audit.read': 'View organisation audit history',
} as const;
export type PermissionKey = keyof typeof permissionDescriptions;
const common: PermissionKey[] = ['dashboard.read', 'issues.read'];
export const defaultRoles: Record<string, PermissionKey[]> = {
  'Organisation Owner': Object.keys(permissionDescriptions) as PermissionKey[],
  'Administrator': Object.keys(permissionDescriptions) as PermissionKey[],
  'Compliance Manager': [...common, 'compliance.read', 'reports.read', 'audit.read'],
  'Finance Manager': [...common, 'finance.read', 'reports.read'],
  'Operations Manager': common,
  'Auditor': ['dashboard.read', 'compliance.read', 'finance.read', 'reports.read', 'audit.read'],
  'AI Assistant': [],
};
export function hasPermission(permissions: readonly string[], permission: PermissionKey) { return permissions.includes(permission); }
export const navigation: { slug: string; label: string; icon: string; permission: PermissionKey }[] = [
  { slug: '', label: 'Home', icon: 'home', permission: 'dashboard.read' },
  { slug: 'issues', label: 'Issues', icon: 'flag', permission: 'issues.read' },
  { slug: 'compliance', label: 'Compliance', icon: 'shield', permission: 'compliance.read' },
  { slug: 'finance', label: 'Finance', icon: 'wallet', permission: 'finance.read' },
  { slug: 'assistant', label: 'AI Assistant', icon: 'spark', permission: 'assistant.read' },
  { slug: 'integrations', label: 'Integrations', icon: 'link', permission: 'integrations.read' },
  { slug: 'reports', label: 'Reports', icon: 'chart', permission: 'reports.read' },
  { slug: 'settings', label: 'Settings', icon: 'settings', permission: 'settings.read' },
];
