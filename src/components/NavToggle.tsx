import { cn } from "~/lib/cn";

type Option<T extends string> = {
  value: T;
  label: string;
  icon?: React.ReactNode;
};

type NavToggleProps<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
};

export function NavToggle<T extends string>({
  options,
  value,
  onChange,
  className,
}: NavToggleProps<T>) {
  return (
    <div className={cn("flex gap-1", className)}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "dg-press flex-1 flex items-center justify-center gap-1.5 font-body text-xs tracking-[0.06em] uppercase rounded-sm py-[7px] px-2 border",
              active
                ? "bg-dg-accent-soft border-dg-accent text-dg-accent font-semibold"
                : "bg-transparent border-dg-border text-dg-text-secondary hover:border-dg-border-strong",
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
