import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";

interface SectionBadgeProps {
  children: ReactNode;
}

export function SectionBadge({ children }: SectionBadgeProps) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-4 py-1.5 text-sm font-semibold text-brand-600">
      <Sparkles className="h-4 w-4" />
      {children}
    </span>
  );
}
