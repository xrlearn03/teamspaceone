import { usePermissionContext } from "@teamspace-one/authorization/react";
import { can, hasAnyPermission } from "@teamspace-one/authorization";
import type { AuthorizableUser } from "@teamspace-one/authorization";
import { useQuery } from "@tanstack/react-query";
import { getActiveOrganisation, getMyContext } from "@/lib/api";

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

export type ShellVariant = "admin" | "hr" | "default";

/**
 * Which sidebar chrome the caller gets:
 * - "admin": organisation super admin / org admin (wildcard `*`) and other
 *   administrative roles — Figma admin menu (Assets / Users / Administrations).
 * - "hr": HR Admin and HR Manager — Figma HR menu (Employees / Departments /
 *   Designations / Leaves / Tickets). Detected via the role name or HR-ops
 *   permissions that only HR roles carry.
 * - "default": everyone else keeps the collaboration rail + workspace sidebar.
 */
export function useShellVariant(): ShellVariant {
  const { data } = useMyContext();
  const perms = data?.permissions ?? [];
  if (data?.isSuperAdmin || perms.includes("*")) return "admin";
  const roleName = (data?.roleName ?? "").toLowerCase().replace(/[\s_-]+/g, "");
  const isHr =
    roleName.includes("hr") ||
    perms.some(
      (p) =>
        p === "hrms.*" ||
        p === "hrms.employee.*" ||
        p === "hrms.employee.create" ||
        p.startsWith("hrms.designation"),
    );
  if (isHr) return "hr";
  if (data?.roleCategory === "administrative") return "admin";
  return "default";
}

/**
 * Recruiters, hiring managers and interviewers land on the recruiter home
 * dashboard. Detected via role name, or interview-module permissions held by
 * an internal member — candidates/guests keep the applicant-facing views even
 * though their roles also carry interview.* permissions.
 */
export function useIsRecruitingRole() {
  const { data } = useMyContext();
  const roleName = (data?.roleName ?? "").toLowerCase().replace(/[\s_-]+/g, "");
  if (/recruiter|hiringmanager|interviewer/.test(roleName)) return true;
  const category = data?.roleCategory ?? "";
  if (category === "candidate" || category === "guest" || category === "external") {
    return false;
  }
  return (data?.permissions ?? []).some((p) => p.startsWith("interview."));
}