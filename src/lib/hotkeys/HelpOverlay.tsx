import { useHotkey } from "@tanstack/react-hotkeys";
import styles from "./HelpOverlay.module.css";
import { SHORTCUT_SECTIONS, type ShortcutSection } from "./shortcuts";

export function HelpOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  useHotkey("Escape", onClose, { enabled: open, conflictBehavior: "allow" });

  if (!open) return null;

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Esc handled via useHotkey
    <div
      role="dialog"
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.dialog}>
        <div className={styles.header}>
          <h2 className={styles.title}>Keyboard Shortcuts</h2>
          <button type="button" onClick={onClose} className={styles.closeBtn}>
            &times;
          </button>
        </div>
        <div className={styles.grid}>
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
      <h3 className={styles.sectionTitle}>{section.title}</h3>
      <div className={styles.shortcuts}>
        {section.shortcuts.map((shortcut) => (
          <div key={shortcut.description} className={styles.shortcutRow}>
            <span className={styles.shortcutDesc}>{shortcut.description}</span>
            <span className={styles.keys}>
              {shortcut.keys.map((key) => (
                <kbd key={key} className={styles.kbd}>
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
