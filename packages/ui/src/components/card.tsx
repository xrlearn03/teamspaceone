import type * as React from "react";
import { cn } from "../lib/utils";

export type CardProps = React.HTMLAttributes<HTMLDivElement>;
export type CardTitleProps = React.HTMLAttributes<HTMLHeadingElement>;

function Card({ className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "h-full rounded-lg border bg-surface p-4 shadow-sm transition-colors",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

function CardHeader({ className, children, ...props }: CardProps) {
  return (
    <div className={cn("mb-3 flex items-center justify-between", className)} {...props}>
      {children}
    </div>
  );
}

function CardTitle({ className, children, ...props }: CardTitleProps) {
  return (
    <h3 className={cn("text-sm font-semibold text-text", className)} {...props}>
      {children}
    </h3>
  );
}

function CardContent({ className, children, ...props }: CardProps) {
  return (
    <div className={cn("text-sm text-text-secondary", className)} {...props}>
      {children}
    </div>
  );
}

export { Card, CardHeader, CardTitle, CardContent };
