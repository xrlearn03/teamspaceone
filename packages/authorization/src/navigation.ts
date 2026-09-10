import type { AuthorizableUser } from './types.js';
import { can } from './policy-engine.js';

export interface NavigationItem {
  id: string;
  label: string;
  path?: string;
  icon?: string;
  permission?: string;
  children?: NavigationItem[];
  badge?: number;
}

export function filterNavigation(
  user: AuthorizableUser | null,
  items: NavigationItem[],
): NavigationItem[] {
  if (!user) return [];

  const filtered: NavigationItem[] = [];

  for (const item of items) {
    if (item.permission && !can(user, item.permission)) {
      continue;
    }

    const children = item.children ? filterNavigation(user, item.children) : undefined;

    if (item.children && (!children || children.length === 0)) {
      continue;
    }

    filtered.push({
      ...item,
      children,
    });
  }

  return filtered;
}
