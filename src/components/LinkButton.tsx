import { Link, type LinkComponentProps } from "@tanstack/react-router";
import type { VariantProps } from "class-variance-authority";
import { cn } from "~/lib/cn";
import { buttonVariants } from "./Button";

export type LinkButtonProps = LinkComponentProps & VariantProps<typeof buttonVariants>;

export function LinkButton({ className, variant, size, ...props }: LinkButtonProps) {
  return (
    <Link {...props} className={cn(buttonVariants({ variant, size }), "no-underline", className)} />
  );
}
