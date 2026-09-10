import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { can, hasPermission, hasAnyPermission } from './policy-engine.js';
import type { AuthorizableUser, ScopeContext } from './types.js';

export interface PermissionContextValue {
  user: AuthorizableUser | null;
  isReady: boolean;
}

const PermissionContext = createContext<PermissionContextValue>({
  user: null,
  isReady: false,
});

export interface PermissionProviderProps {
  user: AuthorizableUser | null;
  children: ReactNode;
}

export function PermissionProvider({ user, children }: PermissionProviderProps) {
  const value = useMemo<PermissionContextValue>(() => ({ user, isReady: true }), [user]);
  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

export function usePermissionContext(): PermissionContextValue {
  return useContext(PermissionContext);
}

export function useCan(permission: string, scopeContext?: ScopeContext): boolean {
  const { user } = useContext(PermissionContext);
  if (!user) return false;
  return can(user, permission, scopeContext);
}

export function useHasAnyPermission(permissions: string[]): boolean {
  const { user } = useContext(PermissionContext);
  if (!user) return false;
  return hasAnyPermission(user, permissions);
}

export function usePermission(permission: string): boolean {
  const { user } = useContext(PermissionContext);
  if (!user) return false;
  return hasPermission(user, permission);
}

export interface PermissionGateProps {
  permission: string;
  scopeContext?: ScopeContext;
  fallback?: ReactNode;
  children: ReactNode;
}

export function PermissionGate({ permission, scopeContext, fallback = null, children }: PermissionGateProps) {
  const allowed = useCan(permission, scopeContext);
  return allowed ? <>{children}</> : <>{fallback}</>;
}

export interface AnyPermissionGateProps {
  permissions: string[];
  fallback?: ReactNode;
  children: ReactNode;
}

export function AnyPermissionGate({ permissions, fallback = null, children }: AnyPermissionGateProps) {
  const allowed = useHasAnyPermission(permissions);
  return allowed ? <>{children}</> : <>{fallback}</>;
}
