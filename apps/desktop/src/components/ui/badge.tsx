import * as React from "react";
import { cn } from "../../lib/utils";

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?:
    | "default"
    | "secondary"
    | "success"
    | "warning"
    | "error"
    | "mention";
};

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        variant === "default" && "bg-primary-subtle text-primary",
        variant === "secondary" && "bg-surface-elevated text-text-secondary",
        variant === "success" && "bg-success/10 text-success",
        variant === "warning" && "bg-warning/10 text-warning",
        variant === "error" && "bg-error/10 text-error",
        variant === "mention" && "bg-mention/10 text-mention",
        className,
      )}
      {...props}
    />
  );
}

export { Badge };
