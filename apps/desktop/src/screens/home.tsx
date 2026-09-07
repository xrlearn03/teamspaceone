import { usePermissionContext } from "@teamspace-one/authorization/react";
import { LayoutDashboard } from "lucide-react";
import { useMe } from "../hooks/api";
import { EmptyState } from "../components/ui/empty-state";
import { filterDashboardWidgets } from "../features/dashboard/registry";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function HomeScreen() {
  const { data: user } = useMe();
  const { user: authzUser } = usePermissionContext();
  const widgets = filterDashboardWidgets(authzUser);

  const firstName =
    user?.firstName ?? user?.email?.split("@")[0] ?? "there";

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="sticky top-0 z-10 border-b bg-background/95 px-6 py-4 backdrop-blur">
        <h1 className="text-xl font-semibold text-text">
          {getGreeting()}, {firstName}
        </h1>
        <p className="text-sm text-text-secondary">
          Here is what needs your attention today.
        </p>
      </header>

      {widgets.length > 0 ? (
        <div className="grid auto-rows-min grid-cols-1 gap-4 p-6 md:grid-cols-2 xl:grid-cols-3">
          {widgets.map((widget) => {
            const WidgetComponent = widget.component;
            return (
              <div key={widget.id} className={widget.gridClass}>
                <WidgetComponent />
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          className="flex-1"
          icon={LayoutDashboard}
          title="Nothing here yet"
          description="No dashboard widgets are available for your role."
        />
      )}
    </div>
  );
}
