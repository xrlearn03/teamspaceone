import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "../lib/utils";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "ghost" | "secondary" | "destructive";
  size?: "sm" | "md" | "icon";
  asChild?: boolean;
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "default", size = "md", asChild = false, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(
          "inline-flex min-w-0 items-center justify-center rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
          variant === "default" &&
            "bg-primary text-white hover:bg-primary-hover",
          variant === "ghost" &&
            "bg-transparent text-text hover:bg-surface-elevated",
          variant === "secondary" &&
            "bg-surface-elevated text-text hover:bg-border",
          variant === "destructive" &&
            "bg-error text-white hover:brightness-90",
          size === "sm" && "min-h-7 h-auto py-1 px-2 text-xs",
          size === "md" && "min-h-9 h-auto py-1.5 px-3",
          size === "icon" && "h-8 w-8 p-0",
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button };
