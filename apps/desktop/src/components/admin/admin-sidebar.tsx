import {
  Calendar,
  CalendarDays,
  Clock,
  Folder,
  Hash,
  HelpCircle,
  Home,
  ListPlus,
  MessageSquare,
  Package,
  ShieldCheck,
  Sun,
  Ticket,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { useUIStore, type View } from "../../stores/ui";
import { useShallow } from "zustand/shallow";
import { cn } from "../../lib/utils";

interface MenuItem {
  id: View;
  label: string;
  icon: React.ElementType;
}

const MENU_SECTIONS: MenuItem[][] = [
  [
    { id: "home", label: "Home", icon: Home },
    { id: "channel", label: "Channels", icon: Hash },
    { id: "dm", label: "Messages", icon: MessageSquare },
    { id: "meeting", label: "Meetings", icon: Calendar },
  ],
  [
    { id: "assets", label: "Assets", icon: Package },
    { id: "members", label: "Users", icon: Users },
    { id: "tickets", label: "Tickets", icon: Ticket },
    { id: "admin", label: "Administrations", icon: ShieldCheck },
  ],
  [
    { id: "hrms", label: "My Attendance", icon: Clock },
    { id: "hrms", label: "My Leaves", icon: CalendarDays },
    { id: "hrms", label: "My Payroll", icon: Wallet },
    { id: "hrms", label: "My Performance", icon: TrendingUp },
  ],
  [
    { id: "files", label: "Files", icon: Folder },
    { id: "help", label: "Help", icon: HelpCircle },
  ],
];

export function AdminSidebar() {
  const { activeView, setActiveView, theme, setTheme } = useUIStore(
    useShallow((s) => ({
      activeView: s.activeView,
      setActiveView: s.setActiveView,
      theme: s.theme,
      setTheme: s.setTheme,
    })),
  );

  return (
    <aside className="flex w-[302px] shrink-0 flex-col border-r border-[#e5e7eb] bg-white p-4">
      <div className="flex items-center gap-2 px-1 pb-6">
        <img
          src="/Teamspace%20One_light.svg"
          alt="Teamspace One"
          className="h-9 w-9"
        />
        <span className="text-xl font-semibold tracking-tight text-[#111827]">
          Teamspace{" "}
          <span className="bg-gradient-to-br from-[#9f62fb] to-[#4a2aee] bg-clip-text text-transparent">
            One
          </span>
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {MENU_SECTIONS.map((section, i) => (
          <div key={i} className="flex flex-col gap-1">
            {i > 0 && <div className="mx-1 my-2 h-px bg-[#f3f4f6]" />}
            {section.map((item) => {
              const Icon = item.icon;
              const isActive =
                activeView === item.id &&
                (item.id !== "hrms" || item.label === "My Attendance");
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => setActiveView(item.id)}
                  className={cn(
                    "flex h-10 w-full items-center gap-2.5 rounded-[5px] px-3 text-left text-sm font-medium text-[#111827] transition-colors",
                    isActive ? "bg-admin-active" : "hover:bg-[#f3f4f6]",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 text-[#6b7280]" />
                  {item.label}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="flex items-center gap-1 pt-4">
        <button
          type="button"
          onClick={() => setActiveView("members")}
          className="flex h-[30px] w-[30px] items-center justify-center rounded-[5px] text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#111827]"
          aria-label="Users"
        >
          <Users className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setActiveView("dm")}
          className="flex h-[30px] w-[30px] items-center justify-center rounded-[5px] text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#111827]"
          aria-label="New message"
        >
          <ListPlus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="flex h-[30px] w-[30px] items-center justify-center rounded-[5px] text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#111827]"
          aria-label="Toggle theme"
        >
          <Sun className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
