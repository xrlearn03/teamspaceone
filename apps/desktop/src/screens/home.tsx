import { usePermissionContext } from "@teamspace-one/authorization/react";
import { LayoutDashboard } from "lucide-react";
import { useMe } from "../hooks/api";
import { EmptyState } from "@teamspace-one/ui/empty-state";
import { cn, getUserDisplayName } from "../lib/utils";
import { filterDashboardWidgets } from "../features/dashboard/registry";
import { useIsRecruitingRole, useShellVariant } from "../hooks/usePermissions";
import { AdminHomeScreen } from "./home-admin";
import { HrDashboardScreen } from "./hr/dashboard";
import { RecruiterHomeScreen } from "./home-recruiter";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function HomeScreen() {
  const { data: user } = useMe();
  const { user: authzUser } = usePermissionContext();
  const shellVariant = useShellVariant();
  const isRecruitingRole = useIsRecruitingRole();
  const widgets = filterDashboardWidgets(authzUser);
  const bannerWidgets = widgets.filter((w) => w.banner);
  const gridWidgets = widgets.filter((w) => !w.banner);

  const displayName = getUserDisplayName(user, "there");

  // Role shells land on their own dashboard instead of the member
  // widget grid.
  if (shellVariant === "admin") {
    return <AdminHomeScreen />;
  }
  if (shellVariant === "hr") {
    return <HrDashboardScreen />;
  }
  if (isRecruitingRole) {
    return <RecruiterHomeScreen />;
  }

  return (
    <div className="mx-auto flex h-full max-w-[1600px] flex-col overflow-y-auto">
      <header className="sticky top-0 z-10 border-b bg-background/95 px-4 sm:px-6 py-5 backdrop-blur">
        <h1 className="text-xl font-semibold text-text">
          {getGreeting()}, {displayName}
        </h1>
        <p className="text-sm text-text-secondary">
          Here is what needs your attention today.
        </p>
      </header>

      {widgets.length > 0 ? (
        <div className="flex flex-col gap-6 p-4 sm:p-5 lg:p-6">
          {bannerWidgets.map((widget) => {
            const WidgetComponent = widget.component;
            return <WidgetComponent key={widget.id} />;
          })}
          {gridWidgets.length > 0 && (
            <div className="grid auto-rows-auto grid-cols-1 gap-6 sm:auto-rows-[minmax(14rem,auto)] sm:grid-cols-2 xl:grid-cols-3">
              {gridWidgets.map((widget) => {
                const WidgetComponent = widget.component;
                return (
                  <div key={widget.id} className={cn("h-full", widget.gridClass)}>
                    <WidgetComponent />
                  </div>
                );
              })}
            </div>
          )}
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
