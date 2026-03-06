import { Spinner } from "./Spinner";

export function DefaultPendingComponent() {
  return (
    <div className="dg-page-enter flex-1 overflow-y-auto">
      <div
        className="max-w-[1100px] mx-auto px-g2 sm:px-g3 pt-8 flex items-center justify-center"
        style={{ minHeight: 120 }}
      >
        <Spinner />
      </div>
    </div>
  );
}
