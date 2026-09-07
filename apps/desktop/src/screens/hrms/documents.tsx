import { FileText } from "lucide-react";
import { EmptyState } from "../../components/ui/empty-state";

export function DocumentsSection() {
  return (
    <EmptyState
      icon={FileText}
      title="Documents"
      description="Employee documents will be available once HRMS data is wired up."
    />
  );
}
