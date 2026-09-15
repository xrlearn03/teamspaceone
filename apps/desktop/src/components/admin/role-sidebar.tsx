import {
  Calendar,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  ChartGantt,
  ClipboardCheck,
  Clock,
  FolderKanban,
  FileClock,
  Folder,
  Hash,
  HelpCircle,
  Home,
  ListPlus,
  ListTodo,
  MessageSquare,
  Network,
  Package,
  ShieldCheck,
  Sun,
  Ticket,
  Timer,
  TrendingUp,
  UserMinus,
  UserPlus,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import { usePermissionContext } from "@teamspace-one/authorization/react";
import { useUIStore, type View } from "../../stores/ui";
import { useShallow } from "zustand/shallow";
import type { ShellVariant } from "../../hooks/usePermissions";
import { useMyContext } from "../../hooks/usePermissions";
import { canAccessView } from "../../lib/view-permissions";
import { cn } from "../../lib/utils";

interface MenuItem {
  view: View;
  label: string;
  icon: React.ElementType;
  hrmsTab?: string;
  projectsTab?: string;
  /** Hidden from candidate/guest/external members. */
  internalOnly?: boolean;
}

const SHARED_SECTION_1: MenuItem[] = [
  { view: "home", label: "Home", icon: Home },
  { view: "channel", label: "Channels", icon: Hash },
  { view: "dm", label: "Messages", icon: MessageSquare },
  { view: "meeting", label: "Meetings", icon: Calendar },
];

const PROJECTS_SECTION: MenuItem[] = [
  { view: "my-projects", label: "My Projects", icon: FolderKanban, projectsTab: "projects", internalOnly: true },
  { view: "my-projects", label: "My Tasks", icon: ListTodo, projectsTab: "tasks", internalOnly: true },
  { view: "my-projects", label: "Timelines", icon: ChartGantt, projectsTab: "timeline", internalOnly: true },
];

// The recruitment workspace — visible to staff roles carrying interview.*
// grants (recruiter, hiring manager, interviewer) and to candidates, whose
// interview.access permission already unlocks the view.
const INTERVIEW_SECTION: MenuItem[] = [
  { view: "interview", label: "Interview", icon: ClipboardCheck },
];

const SELF_SERVICE_SECTION: MenuItem[] = [
  { view: "my-attendance", label: "My Attendance", icon: Clock, internalOnly: true },
  { view: "my-timesheet", label: "My Timesheet", icon: Timer, internalOnly: true },
  { view: "my-leaves", label: "My Leaves", icon: CalendarDays, internalOnly: true },
  { view: "my-payroll", label: "My Payroll", icon: Wallet, internalOnly: true },
  { view: "my-performance", label: "My Performance", icon: TrendingUp, internalOnly: true },
];

const FOOTER_SECTION: MenuItem[] = [
  { view: "files", label: "Files", icon: Folder },
  { view: "help", label: "Help", icon: HelpCircle },
];

/**
 * Role-specific menu sections, sandwiched between the shared top group and
 * the shared bottom groups. The common menus render at fixed positions for
 * every user type — Home/Channels/Messages/Meetings at the top of the nav and
 * the self-service + Files/Help groups anchored to the bottom — so switching
 * roles never shifts them.
 */
const ROLE_MENU_SECTIONS: Record<ShellVariant, MenuItem[][]> = {
  admin: [
    [
      { view: "assets", label: "Assets", icon: Package },
      { view: "members", label: "Users", icon: Users },
      { view: "tickets", label: "Tickets", icon: Ticket },
      { view: "admin", label: "Administrations", icon: ShieldCheck },
    ],
  ],
  hr: [
    [
      { view: "employees", label: "Employees", icon: UserRound },
      { view: "departments", label: "Departments", icon: Network },
      { view: "designations", label: "Designations", icon: CalendarCheck },
      { view: "leaves", label: "Leaves", icon: CalendarDays },
      { view: "attendance", label: "Overall Attendance", icon: CalendarClock },
      { view: "timesheets", label: "All Timesheets", icon: FileClock },
      { view: "payroll", label: "Payroll", icon: Wallet },
      { view: "onboarding", label: "Onboarding", icon: UserPlus },
      { view: "offboarding", label: "Offboarding", icon: UserMinus },
      { view: "tickets", label: "Tickets", icon: Ticket },
    ],
  ],
  member: [INTERVIEW_SECTION, PROJECTS_SECTION],
};

export function RoleSidebar({ variant }: { variant: ShellVariant }) {
  const { activeView, hrmsTab, projectsTab, setActiveView, theme, setTheme } = useUIStore(
    useShallow((s) => ({
      activeView: s.activeView,
      hrmsTab: s.hrmsTab,
      projectsTab: s.projectsTab,
      setActiveView: s.setActiveView,
      theme: s.theme,
      setTheme: s.setTheme,
    })),
  );

  const { user } = usePermissionContext();
  const { data: myContext } = useMyContext();
  const isInternal = !["candidate", "guest", "external"].includes(
    myContext?.roleCategory ?? "",
  );

  // Only surface menu entries the caller can actually open — e.g. a member
  // without hrms.* or file permissions never sees a dead AccessDenied link.
  const visibleSections = (groups: MenuItem[][]) =>
    groups
      .map((section) =>
        section.filter(
          (item) =>
            canAccessView(user, item.view) && (!item.internalOnly || isInternal),
        ),
      )
      .filter((section) => section.length > 0);

  const topSections = visibleSections([
    SHARED_SECTION_1,
    ...ROLE_MENU_SECTIONS[variant],
  ]);
  const bottomSections = visibleSections([SELF_SERVICE_SECTION, FOOTER_SECTION]);

  const renderSection = (section: MenuItem[], key: string, divider: boolean) => (
    <div key={key} className="flex flex-col gap-1">
      {divider && <div className="mx-1 my-2 h-px bg-border" />}
      {section.map((item) => {
        const Icon = item.icon;
        const isActive = item.hrmsTab
          ? activeView === "hrms" && hrmsTab === item.hrmsTab
          : item.projectsTab
            ? activeView === "my-projects" && projectsTab === item.projectsTab
            : activeView === item.view;
        return (
          <button
            key={item.label}
            type="button"
            onClick={() =>
              setActiveView(item.view, {
                hrmsTab: item.hrmsTab,
                projectsTab: item.projectsTab,
              })
            }
            className={cn(
              "flex h-10 w-full items-center gap-2.5 rounded-md px-3 text-left text-sm font-medium transition-colors",
              isActive
                ? "bg-primary-subtle text-primary"
                : "text-text hover:bg-surface-elevated",
            )}
          >
            <Icon
              className={cn(
                "h-4 w-4 shrink-0",
                isActive ? "text-primary" : "text-text-muted",
              )}
            />
            <span className="truncate">{item.label}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-surface lg:w-64 xl:w-[302px]">
      <div className="flex items-center gap-2 px-5 pb-4 pt-4">
        <img
          src="/Teamspace%20One_light.svg"
          alt="Teamspace One"
          className="h-9 w-9 dark:hidden"
        />
        <img
          src="/Teamspace%20One_dark.svg"
          alt="Teamspace One"
          className="hidden h-9 w-9 dark:block"
        />
        <span className="text-xl font-semibold tracking-tight text-text">
          Teamspace <span className="text-primary">One</span>
        </span>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-4 pb-3">
        {topSections.map((section, i) =>
          renderSection(section, `top-${i}`, i > 0),
        )}
      </nav>

      {bottomSections.length > 0 && (
        <div className="flex shrink-0 flex-col gap-1 px-4 pb-3">
          {bottomSections.map((section, i) =>
            renderSection(section, `bottom-${i}`, i > 0 || topSections.length > 0),
          )}
        </div>
      )}

      <div className="flex h-9 shrink-0 items-center justify-between border-t border-border px-5">
        {canAccessView(user, "members") ? (
          <button
            type="button"
            onClick={() => setActiveView("members")}
            className="flex h-6 w-6 items-center justify-center rounded-md text-text-muted hover:bg-surface-elevated hover:text-text"
            aria-label="Users"
          >
            <Users className="h-4 w-4" />
          </button>
        ) : (
          <span className="h-6 w-6" />
        )}
        {canAccessView(user, "dm") ? (
          <button
            type="button"
            onClick={() => setActiveView("dm")}
            className="flex h-6 w-6 items-center justify-center rounded-md text-text-muted hover:bg-surface-elevated hover:text-text"
            aria-label="New message"
          >
            <ListPlus className="h-4 w-4" />
          </button>
        ) : (
          <span className="h-6 w-6" />
        )}
        <button
          type="button"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="flex h-6 w-6 items-center justify-center rounded-md text-text-muted hover:bg-surface-elevated hover:text-text"
          aria-label="Toggle theme"
        >
          <Sun className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
