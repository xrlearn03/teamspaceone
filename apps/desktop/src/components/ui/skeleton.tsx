import { cn } from "../../lib/utils";

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-md bg-text-muted/20", className)} />
  );
}

export { Skeleton };
