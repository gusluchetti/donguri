import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef } from "react";
import { cn } from "~/lib/cn";

const iconButtonVariants = cva(
  "dg-press inline-flex items-center justify-center rounded-sm border",
  {
    variants: {
      variant: {
        surface:
          "bg-dg-surface border-dg-border text-dg-text-tertiary hover:text-dg-accent hover:border-dg-accent",
        ghost:
          "bg-transparent border-dg-border text-dg-text-secondary hover:border-dg-border-strong",
      },
      size: {
        default: "w-[42px] h-[42px]",
        compact: "w-[34px] h-[34px]",
        nav: "py-1.5 px-2.5 sm:py-1 sm:px-2",
      },
    },
    defaultVariants: { variant: "surface", size: "default" },
  },
);

export type IconButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof iconButtonVariants>;

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      {...props}
      className={cn(iconButtonVariants({ variant, size }), className)}
    />
  ),
);
