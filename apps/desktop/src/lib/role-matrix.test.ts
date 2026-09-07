import { describe, expect, it, vi } from "vitest";
import type { AuthorizableUser, DataScope } from "@teamspace-one/authorization";

// The widget registry pulls in the full component tree (api client, Tauri
// plugins, Radix). Swap the components for stubs — we only exercise the
// metadata + filtering here.
vi.mock("../features/dashboard/widgets", () => {
  const stub = () => null;
  return new Proxy(
    {},
    {
      get: (_target, prop) => (typeof prop === "string" ? stub : undefined),
    },
  );
});

import { canAccessView, VIEW_PERMISSIONS } from "./view-permissions";
import { filterDashboardWidgets } from "../features/dashboard/registry";

/**
 * Role fixtures mirror the system role templates in
 * services/organisation/src/organisation/authorization.service.ts and
 * services/organisation/src/seed/seed-rbac.ts. Keep them in sync if role
 * permissions change.
 */
const ORG = "org-1";

function roleUser(permissions: string[], dataScopes: DataScope[] = []): AuthorizableUser {
  return { id: `u-${Math.random().toString(36).slice(2)}`, organisationId: ORG, permissions, dataScopes };
}

const employee = roleUser(
  [
    "dashboard.view",
    "dashboard.quick-action.execute",
    "collaboration.access",
    "collaboration.channel.view",
    "collaboration.message.send",
    "collaboration.project.view",
    "collaboration.task.view",
    "collaboration.meeting.view",
    "hrms.access",
    "hrms.employee.view",
    "hrms.attendance.view",
    "hrms.attendance.checkin",
    "hrms.attendance.checkout",
    "hrms.leave.view",
    "hrms.leave.apply",
    "hrms.document.view",
  ],
  [
    { module: "hrms", scope: "own" },
    { module: "collaboration", scope: "organisation" },
  ],
);

const manager = roleUser(
  [
    ...employee.permissions,
    "hrms.department.view",
    "hrms.leave.approve",
    "hrms.attendance.approve",
  ],
  [
    { module: "hrms", scope: "team" },
    { module: "collaboration", scope: "organisation" },
  ],
);

const recruiter = roleUser(
  [
    "dashboard.view",
    "dashboard.quick-action.execute",
    "collaboration.access",
    "collaboration.channel.view",
    "collaboration.message.send",
    "interview.access",
    "interview.job.view",
    "interview.job.create",
    "interview.candidate.view",
    "interview.candidate.create",
    "interview.candidate.edit",
    "interview.interview.view",
    "interview.interview.schedule",
  ],
  [
    { module: "interview", scope: "assigned" },
    { module: "collaboration", scope: "organisation" },
  ],
);

const hiringManager = roleUser(
  [
    "dashboard.view",
    "collaboration.access",
    "interview.access",
    "interview.job.view",
    "interview.candidate.view",
    "interview.interview.view",
    "interview.interview.evaluate",
    "interview.decision.view",
    "interview.decision.make",
  ],
  [
    { module: "interview", scope: "assigned" },
    { module: "collaboration", scope: "organisation" },
  ],
);

const candidate = roleUser(
  [
    "interview.access",
    "interview.candidate.view",
    "interview.interview.view",
    "dashboard.view",
  ],
  [{ module: "interview", scope: "own" }],
);

const orgAdmin = roleUser(
  ["*"],
  [{ module: "*", scope: "organisation" }],
);

describe("view access by role", () => {
  it("covers every view in the union", () => {
    const views: Array<Parameters<typeof canAccessView>[1]> = [
      "home", "inbox", "channel", "dm", "project", "meeting", "voice", "files",
      "ai", "members", "saved", "drafts", "hrms", "interview", "admin", "settings",
    ];
    const exempt = new Set(["settings", "inbox", "saved", "drafts", "ai"]);
    for (const v of views) {
      expect(v, `view "${v}" has a permission entry`).toSatisfy(
        (x) => x in VIEW_PERMISSIONS || exempt.has(x),
      );
    }
  });

  it("employee sees collaboration + own HRMS, no interview/admin", () => {
    expect(canAccessView(employee, "home")).toBe(true);
    expect(canAccessView(employee, "hrms")).toBe(true);
    expect(canAccessView(employee, "channel")).toBe(true);
    expect(canAccessView(employee, "interview")).toBe(false);
    expect(canAccessView(employee, "admin")).toBe(false);
  });

  it("recruiter sees interview but not HRMS or admin", () => {
    expect(canAccessView(recruiter, "interview")).toBe(true);
    expect(canAccessView(recruiter, "hrms")).toBe(false);
    expect(canAccessView(recruiter, "admin")).toBe(false);
    expect(canAccessView(recruiter, "project")).toBe(false);
  });

  it("candidate sees only interview + home", () => {
    expect(canAccessView(candidate, "interview")).toBe(true);
    expect(canAccessView(candidate, "home")).toBe(true);
    expect(canAccessView(candidate, "hrms")).toBe(false);
    expect(canAccessView(candidate, "channel")).toBe(false);
    expect(canAccessView(candidate, "admin")).toBe(false);
  });

  it("org admin sees everything", () => {
    expect(canAccessView(orgAdmin, "admin")).toBe(true);
    expect(canAccessView(orgAdmin, "hrms")).toBe(true);
    expect(canAccessView(orgAdmin, "interview")).toBe(true);
  });

  it("unauthenticated user sees nothing", () => {
    expect(canAccessView(null, "home")).toBe(false);
  });
});

describe("dashboard widget visibility by role", () => {
  const ids = (u: AuthorizableUser | null) =>
    filterDashboardWidgets(u).map((w) => w.id);

  it("employee sees own-people widgets, not HR analytics or recruiting", () => {
    const w = ids(employee);
    expect(w).toContain("my-tasks");
    expect(w).toContain("my-attendance");
    expect(w).toContain("my-leave");
    expect(w).not.toContain("hrms-overview");
    expect(w).not.toContain("pending-hr-approvals");
    expect(w).not.toContain("open-positions");
    expect(w).not.toContain("candidate-pipeline");
  });

  it("manager sees approval widgets", () => {
    const w = ids(manager);
    expect(w).toContain("pending-hr-approvals");
    expect(w).toContain("my-leave");
  });

  it("recruiter sees pipeline + jobs, no HR widgets", () => {
    const w = ids(recruiter);
    expect(w).toContain("open-positions");
    expect(w).toContain("candidate-pipeline");
    expect(w).toContain("interviews-today");
    expect(w).not.toContain("hrms-overview");
    expect(w).not.toContain("my-leave");
    expect(w).not.toContain("people");
  });

  it("hiring manager sees evaluations + decisions widgets", () => {
    const w = ids(hiringManager);
    expect(w).toContain("pending-evaluations");
    expect(w).toContain("interviews-today");
    expect(w).not.toContain("my-attendance");
  });

  it("candidate sees no recruiter widgets (own scope excluded)", () => {
    const w = ids(candidate);
    expect(w).not.toContain("open-positions");
    expect(w).not.toContain("candidate-pipeline");
    expect(w).not.toContain("pending-evaluations");
  });

  it("org admin sees all widgets", () => {
    const w = ids(orgAdmin);
    expect(w).toContain("hrms-overview");
    expect(w).toContain("open-positions");
    expect(w).toContain("pending-evaluations");
  });

  it("no user → no widgets", () => {
    expect(ids(null)).toEqual([]);
  });
});
