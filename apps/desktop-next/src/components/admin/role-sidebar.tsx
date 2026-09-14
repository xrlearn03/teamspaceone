import {
  Calendar,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  Clock,
  Folder,
  Hash,
  HelpCircle,
  Home,
  ListPlus,
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
import { useUIStore, type View } from "@/stores/ui";
import { useShallow } from "zustand/shallow";
import type { ShellVariant } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";

interface MenuItem {
  view: View;
  label: string;
  icon: React.ElementType;
  hrmsTab?: string;
}

const SHARED_SECTION_1: MenuItem[] = [
  { view: "home", label: "Home", icon: Home },
  { view: "channel", label: "Channels", icon: Hash },
  { view: "dm", label: "Messages", icon: MessageSquare },
  { view: "meeting", label: "Meetings", icon: Calendar },
];

const SELF_SERVICE_SECTION: MenuItem[] = [
  { view: "my-attendance", label: "My Attendance", icon: Clock },
  { view: "my-timesheet", label: "My Timesheet", icon: Timer },
  { view: "my-leaves", label: "My Leaves", icon: CalendarDays },
  { view: "my-payroll", label: "My Payroll", icon: Wallet },
  { view: "my-performance", label: "My Performance", icon: TrendingUp },
];

const FOOTER_SECTION: MenuItem[] = [
  { view: "files", label: "Files", icon: Folder },
  { view: "help", label: "Help", icon: HelpCircle },
];

const MENU_SECTIONS: Record<Exclude<ShellVariant, "default">, MenuItem[][]> = {
  admin: [
    SHARED_SECTION_1,
    [
      { view: "assets", label: "Assets", icon: Package },
      { view: "members", label: "Users", icon: Users },
      { view: "tickets", label: "Tickets", icon: Ticket },
      { view: "admin", label: "Administrations", icon: ShieldCheck },
    ],
    SELF_SERVICE_SECTION,
    FOOTER_SECTION,
  ],
  hr: [
    SHARED_SECTION_1,
    [
      { view: "employees", label: "Employees", icon: UserRound },
      { view: "departments", label: "Departments", icon: Network },
      { view: "designations", label: "Designations", icon: CalendarCheck },
      { view: "leaves", label: "Leaves", icon: CalendarDays },
      { view: "attendance", label: "Overall Attendance", icon: CalendarClock },
      { view: "payroll", label: "Payroll", icon: Wallet },
      { view: "onboarding", label: "Onboarding", icon: UserPlus },
      { view: "offboarding", label: "Offboarding", icon: UserMinus },
      { view: "tickets", label: "Tickets", icon: Ticket },
    ],
    SELF_SERVICE_SECTION,
    FOOTER_SECTION,
  ],
};

export function RoleSidebar({ variant }: { variant: Exclude<ShellVariant, "default"> }) {
  const { activeView, hrmsTab, setActiveView, theme, setTheme } = useUIStore(
    useShallow((s) => ({
      activeView: s.activeView,
      hrmsTab: s.hrmsTab,
      setActiveView: s.setActiveView,
      theme: s.theme,
      setTheme: s.setTheme,
    })),
  );

  const sections = MENU_SECTIONS[variant];

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

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-4 pb-3">
        {sections.map((section, i) => (
          <div key={i} className="flex flex-col gap-1">
            {i > 0 && <div className="mx-1 my-2 h-px bg-border" />}
            {section.map((item) => {
              const Icon = item.icon;
              const isActive = item.hrmsTab
                ? activeView === "hrms" && hrmsTab === item.hrmsTab
                : activeView === item.view;
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => setActiveView(item.view, { hrmsTab: item.hrmsTab })}
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
        ))}
      </nav>

      <div className="flex h-9 shrink-0 items-center justify-between border-t border-border px-5">
        <button
          type="button"
          onClick={() => setActiveView("members")}
          className="flex h-6 w-6 items-center justify-center rounded-md text-text-muted hover:bg-surface-elevated hover:text-text"
          aria-label="Users"
        >
          <Users className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setActiveView("dm")}
          className="flex h-6 w-6 items-center justify-center rounded-md text-text-muted hover:bg-surface-elevated hover:text-text"
          aria-label="New message"
        >
          <ListPlus className="h-4 w-4" />
        </button>
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
