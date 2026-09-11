import { cn } from "../lib/utils";

export interface SkeletonProps {
  className?: string;
}

function Skeleton({ className }: SkeletonProps) {
  return <div className={cn("animate-pulse rounded-md bg-text-muted/20", className)} />;
}

export { Skeleton };
