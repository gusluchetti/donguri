import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef } from "react";
import { cn } from "~/lib/cn";

export const buttonVariants = cva(
  "dg-press inline-flex items-center justify-center gap-2 font-body rounded-sm border text-[0.85rem]",
  {
    variants: {
      variant: {
        primary: "bg-dg-accent text-white border-transparent hover:brightness-110",
        secondary:
          "bg-dg-surface border-dg-border text-dg-text-secondary hover:border-dg-border-strong hover:text-dg-text",
        ghost:
          "bg-transparent border-dg-border text-dg-text-secondary hover:border-dg-border-strong hover:text-dg-text-secondary",
        danger:
          "bg-transparent border-dg-border-subtle text-dg-text-tertiary hover:text-dg-anime hover:border-dg-anime/40",
        accent: "bg-transparent border-dg-accent/30 text-dg-accent hover:border-dg-accent/60",
      },
      size: {
        default: "px-4 py-2",
        compact: "px-3 py-1 text-[0.75rem]",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

export type ButtonProps = React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      {...props}
      className={cn(buttonVariants({ variant, size }), className)}
    />
  ),
);
