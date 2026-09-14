import { useEffect, useState } from "react";
import {
  BarChart3,
  CalendarCheck,
  CalendarClock,
  FileText,
  LayoutDashboard,
  Network,
  ShieldAlert,
  Target,
  TrendingUp,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { useUIStore } from "@/stores/ui";
import { EmptyState } from "@teamspace-one/ui/empty-state";
import { cn } from "@/lib/utils";
import { HrmsOverviewSection } from "./overview";
import { EmployeesSection } from "./employees";
import { DepartmentsSection } from "./departments";
import { OrgChartSection } from "./org-chart";
import { AttendanceSection } from "./attendance";
import { LeaveSection } from "./leave";
import { DocumentsSection } from "./documents";
import { OnboardingSection } from "./onboarding";
import { OffboardingSection } from "./offboarding";
import { PerformanceSection } from "./performance";
import { AnalyticsSection } from "./analytics";

type TabId =
  | "overview"
  | "employees"
  | "departments"
  | "org-chart"
  | "attendance"
  | "leave"
  | "documents"
  | "onboarding"
  | "offboarding"
  | "performance"
  | "analytics";

interface Tab {
  id: TabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: string;
}

const TABS: Tab[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "employees", label: "Employees", icon: Users, permission: "hrms.employee.view" },
  { id: "departments", label: "Departments", icon: Network, permission: "hrms.department.view" },
  { id: "org-chart", label: "Org chart", icon: TrendingUp, permission: "hrms.org-chart.view" },
  { id: "attendance", label: "Attendance", icon: CalendarCheck, permission: "hrms.attendance.view" },
  { id: "leave", label: "Leave", icon: CalendarClock, permission: "hrms.leave.view" },
  { id: "documents", label: "Documents", icon: FileText, permission: "hrms.document.view" },
  { id: "onboarding", label: "Onboarding", icon: UserPlus, permission: "hrms.onboarding.view" },
  { id: "offboarding", label: "Offboarding", icon: UserMinus, permission: "hrms.offboarding.view" },
  { id: "performance", label: "Performance", icon: Target, permission: "hrms.performance.view" },
  { id: "analytics", label: "Analytics", icon: BarChart3, permission: "hrms.analytics.view" },
];

export function HrmsScreen() {
  const { can, hasPermissionPrefix } = usePermissions();
  const [tab, setTab] = useState<TabId>("overview");
  const { hrmsTab, setHrmsTab } = useUIStore();

  // The role sidebar deep-links here via the store (e.g. "My Leaves" → leave).
  useEffect(() => {
    if (hrmsTab && TABS.some((t) => t.id === hrmsTab)) {
      setTab(hrmsTab as TabId);
    }
  }, [hrmsTab]);

  const hasAnyHrms =
    hasPermissionPrefix("hrms.") || can("hrms.access");

  if (!hasAnyHrms) {
    return (
      <div className="flex h-full flex-col">
        <header className="border-b px-3 sm:px-6 py-4">
          <h1 className="text-xl font-semibold text-text">HRMS</h1>
        </header>
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon={ShieldAlert}
            title="You don't have access to HRMS"
            description="Ask an administrator to grant you an HRMS permission."
          />
        </div>
      </div>
    );
  }


  const visibleTabs = TABS.filter((t) => !t.permission || can(t.permission));
  const activeTab = visibleTabs.some((t) => t.id === tab) ? tab : visibleTabs[0]?.id ?? "overview";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="border-b px-3 sm:px-6 pb-0 pt-4">
        <h1 className="text-xl font-semibold text-text">HRMS</h1>
        <p className="text-sm text-text-secondary">
          People operations for your organisation.
        </p>
        <div className="mt-3 flex gap-1 overflow-x-auto">
          {visibleTabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTab(t.id);
                  setHrmsTab(t.id);
                }}
                className={cn(
                  "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
                  activeTab === t.id
                    ? "border-primary font-medium text-text"
                    : "border-transparent text-text-muted hover:text-text",
                )}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6">
        {activeTab === "overview" && <HrmsOverviewSection />}
        {activeTab === "employees" && <EmployeesSection />}
        {activeTab === "departments" && <DepartmentsSection />}
        {activeTab === "org-chart" && <OrgChartSection />}
        {activeTab === "attendance" && <AttendanceSection />}
        {activeTab === "leave" && <LeaveSection />}
        {activeTab === "documents" && <DocumentsSection />}
        {activeTab === "onboarding" && <OnboardingSection />}
        {activeTab === "offboarding" && <OffboardingSection />}
        {activeTab === "performance" && <PerformanceSection />}
        {activeTab === "analytics" && <AnalyticsSection />}
      </div>
    </div>
  );
}
