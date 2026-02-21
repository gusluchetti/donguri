import { useHotkey } from "@tanstack/react-hotkeys";
import { SHORTCUT_SECTIONS, type ShortcutSection } from "./shortcuts";

export function HelpOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  useHotkey("Escape", onClose, { enabled: open, conflictBehavior: "allow" });

  if (!open) return null;

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Esc handled via useHotkey
    <div
      role="dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dg-modal bg-dg-overlay border border-dg-border rounded max-w-[720px] w-[92vw] max-h-[80vh] overflow-y-auto p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-dg-text m-0">Keyboard Shortcuts</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-dg-text-tertiary hover:text-dg-text-secondary bg-transparent border-none cursor-pointer text-lg p-2 -m-2 transition-colors active:scale-[0.97]"
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
      <h3 className="text-xs text-dg-text-tertiary uppercase tracking-wider mb-1.5 opacity-60">
        {section.title}
      </h3>
      <div className="space-y-0.5">
        {section.shortcuts.map((shortcut) => (
          <div key={shortcut.description} className="flex items-center justify-between gap-2 py-px">
            <span className="text-sm text-dg-text-secondary leading-tight">
              {shortcut.description}
            </span>
            <span className="flex items-center gap-0.5 shrink-0">
              {shortcut.keys.map((key) => (
                <kbd
                  key={key}
                  className="text-xs px-1 py-px bg-dg-elevated border border-dg-border rounded text-dg-text min-w-[1.25rem] text-center inline-block leading-relaxed"
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
