import { useHotkey } from "@tanstack/react-hotkeys";
import { SHORTCUT_SECTIONS, type ShortcutSection } from "./shortcuts";

export function HelpOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  useHotkey("Escape", onClose, { enabled: open, conflictBehavior: "allow" });

  if (!open) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Esc handled via useHotkey
    <div
      role="dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleBackdropClick}
    >
      <div className="bg-dg-surface border border-dg-border rounded max-w-[720px] w-[92vw] max-h-[80vh] overflow-y-auto p-4 sm:p-5 font-body">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[0.9rem] font-semibold text-dg-text m-0">Keyboard Shortcuts</h2>
          <button
            type="button"
            onClick={onClose}
            className="dg-press text-dg-text-tertiary hover:text-dg-text-secondary bg-transparent border-none text-lg p-2 -m-2"
          >
            &times;
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-5 gap-y-3">
          {SHORTCUT_SECTIONS.map((section) => (
            <ShortcutGroup key={section.title} section={section} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ShortcutGroup({ section }: { section: ShortcutSection }) {
  return (
    <div>
      <h3 className="text-[0.6rem] text-dg-text-tertiary uppercase tracking-wider mb-1.5">
        {section.title}
      </h3>
      <div className="space-y-0.5">
        {section.shortcuts.map((shortcut) => (
          <div key={shortcut.description} className="flex items-center justify-between gap-2 py-px">
            <span className="text-[0.75rem] text-dg-text-secondary leading-tight">
              {shortcut.description}
            </span>
            <span className="flex items-center gap-0.5 shrink-0">
              {shortcut.keys.map((key) => (
                <kbd
                  key={key}
                  className="text-[0.65rem] px-1 py-px bg-dg-elevated border border-dg-border rounded text-dg-text min-w-[1.25rem] text-center inline-block leading-relaxed font-mono"
                >
                  {key}
                </kbd>
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
