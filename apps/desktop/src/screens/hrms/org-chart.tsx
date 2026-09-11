import { TrendingUp } from "lucide-react";
import { useOrgChart } from "../../hooks/api";
import type { OrgChartNode } from "../../lib/api";
import { Avatar, AvatarFallback } from "@teamspace-one/ui/avatar";
import { Card, CardContent } from "@teamspace-one/ui/card";
import { EmptyState } from "@teamspace-one/ui/empty-state";
import { cn } from "../../lib/utils";
import { SectionError, SectionSkeleton } from "./common";

function OrgNode({ node, depth = 0 }: { node: OrgChartNode; depth?: number }) {
  return (
    <div className={cn("flex flex-col", depth > 0 && "ml-6 border-l pl-4")}>
      <Card className="w-fit">
        <CardContent className="flex items-center gap-3 p-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs">
              {node.name.slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-text">{node.name}</p>
            <p className="truncate text-xs text-text-muted">
              {[node.designation, node.department].filter(Boolean).join(" · ") || "—"}
            </p>
          </div>
        </CardContent>
      </Card>
      {node.children.length > 0 ? (
        <div className="mt-2 flex flex-col gap-2">
          {node.children.map((child) => (
            <OrgNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function OrgChartSection() {
  const chart = useOrgChart();

  if (chart.isLoading) return <SectionSkeleton />;
  if (chart.isError) return <SectionError onRetry={() => chart.refetch()} />;

  const roots = chart.data ?? [];
  if (roots.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={TrendingUp}
          title="No org chart yet"
          description="Reporting lines appear here once employees have managers assigned."
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {roots.map((node) => (
        <OrgNode key={node.id} node={node} />
      ))}
    </div>
  );
}
