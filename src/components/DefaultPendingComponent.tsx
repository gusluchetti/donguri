export function DefaultPendingComponent() {
  return (
    <div className="dg-page-enter flex-1 overflow-y-auto">
      <div className="max-w-[1100px] mx-auto px-3 sm:px-g3 pt-8 flex flex-col gap-4">
        <div className="h-6 w-48 rounded-sm bg-dg-surface animate-pulse" />
        <div className="h-4 w-80 max-w-full rounded-sm bg-dg-surface animate-pulse opacity-60" />
        <div className="h-4 w-64 max-w-full rounded-sm bg-dg-surface animate-pulse opacity-40" />
      </div>
    </div>
  );
}
