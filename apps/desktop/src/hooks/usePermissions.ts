import { usePermissionContext } from "@teamspace-one/authorization/react";
import { can, hasAnyPermission } from "@teamspace-one/authorization";
import type { AuthorizableUser } from "@teamspace-one/authorization";
import { useQuery } from "@tanstack/react-query";
import { getActiveOrganisation, getMyContext } from "../lib/api";

/**
 * The caller's RBAC context for the active organisation. App.tsx already
 * fetches this under the same query key and feeds it into PermissionProvider,
 * so this is a cached read in practice.
 */
export function useMyContext() {
  const organisationId = getActiveOrganisation();
  return useQuery({
    queryKey: ["me-context", organisationId],
    queryFn: () => getMyContext(organisationId as string),
    enabled: Boolean(organisationId),
    staleTime: 60 * 1000,
    retry: 1,
  });
}

export function usePermissions() {
  const { user, isReady } = usePermissionContext();
  const check = (permission: string) => (user ? can(user, permission) : false);
  return {
    user: user as AuthorizableUser | null,
    isReady,
    can: check,
    canAny: (permissions: string[]) => (user ? hasAnyPermission(user, permissions) : false),
    /**
     * True when the user holds any permission under the given prefix
     * (e.g. "hrms."), including wildcard grants that cover it.
     */
    hasPermissionPrefix: (prefix: string) => {
      if (!user) return false;
      if (user.permissions.some((p) => p.startsWith(prefix))) return true;
      // Wildcard grants ("*", "hrms.*") imply the prefix too.
      const segments = prefix.replace(/\.$/, "").split(".");
      for (let i = segments.length; i >= 0; i--) {
        const candidate = `${segments.slice(0, i).join(".")}${i > 0 ? "." : ""}*`;
        if (user.permissions.includes(candidate === ".*" ? "*" : candidate)) return true;
      }
      return user.permissions.includes("*");
    },
    /** Data scopes the user holds for a module ("hrms", "*", etc). */
    scopesFor: (module: string) =>
      (user?.dataScopes ?? []).filter((s) => s.module === module || s.module === "*"),
  };
}
