import { useForm } from "@tanstack/react-form";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useState } from "react";
import { Button } from "~/components/Button";
import { FEEDBACK_TYPES, submitFeedback } from "./feedback.functions";

const TYPE_LABELS: Record<(typeof FEEDBACK_TYPES)[number], string> = {
  bug: "Bug",
  enhancement: "Enhancement",
  documentation: "Docs",
  question: "Question",
};

type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export function FeedbackDialog({ onClose }: { onClose: () => void }) {
  useHotkey("Escape", onClose, { conflictBehavior: "allow" });

  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const form = useForm({
    defaultValues: { type: "enhancement" as FeedbackType, title: "", description: "" },
    onSubmit: async ({ value }) => {
      setStatus("idle");
      setErrorMsg("");
      try {
        await submitFeedback({ data: value });
        setStatus("success");
        setTimeout(onClose, 2000);
      } catch (err) {
        setStatus("error");
        setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
      }
    },
  });

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
      <div className="bg-dg-surface border border-dg-border rounded max-w-[480px] w-[92vw] max-h-[80dvh] overflow-y-auto p-4 sm:p-5 font-body">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[0.9rem] font-semibold text-dg-text m-0">Send Feedback</h2>
          <button
            type="button"
            onClick={onClose}
            className="dg-press text-dg-text-tertiary hover:text-dg-text-secondary bg-transparent border-none text-lg p-2 -m-2"
          >
            &times;
          </button>
        </div>

        {status === "success" ? (
          <div className="text-center py-6">
            <p className="text-dg-accent text-[0.9rem] font-semibold">Thanks for the feedback!</p>
            <p className="text-dg-text-tertiary text-[0.75rem] mt-1">
              A GitHub issue has been created.
            </p>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              form.handleSubmit();
            }}
            className="flex flex-col gap-3"
          >
            <form.Field name="type">
              {(field) => (
                <div className="flex gap-1">
                  {FEEDBACK_TYPES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => field.handleChange(t)}
                      className={`dg-press flex-1 text-[0.7rem] uppercase tracking-wider py-1.5 px-1 rounded-sm border font-body transition-colors ${
                        field.state.value === t
                          ? "bg-dg-accent-soft border-dg-accent text-dg-accent font-semibold"
                          : "bg-transparent border-dg-border-subtle text-dg-text-tertiary hover:text-dg-text-secondary"
                      }`}
                    >
                      {TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              )}
            </form.Field>

            <form.Field
              name="title"
              validators={{
                onMount: ({ value }) => (value.length < 3 ? "Required" : undefined),
                onChange: ({ value }) =>
                  value.length < 3 ? "Title must be at least 3 characters" : undefined,
              }}
            >
              {(field) => (
                <div>
                  <input
                    type="text"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    placeholder="Brief summary"
                    maxLength={200}
                    className="w-full bg-dg-bg border border-dg-border rounded-sm px-3 py-2.5 sm:py-2 text-base sm:text-[0.85rem] text-dg-text font-body placeholder:text-dg-text-tertiary focus:outline-none focus:border-dg-accent"
                  />
                  {field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
                    <p className="text-dg-movie text-[0.75rem] mt-1">
                      {field.state.meta.errors[0]}
                    </p>
                  )}
                </div>
              )}
            </form.Field>

            <form.Field
              name="description"
              validators={{
                onMount: ({ value }) => (value.length < 10 ? "Required" : undefined),
                onChange: ({ value }) =>
                  value.length < 10 ? "Description must be at least 10 characters" : undefined,
              }}
            >
              {(field) => (
                <div>
                  <textarea
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    placeholder="What happened? What did you expect?"
                    rows={4}
                    maxLength={5000}
                    className="w-full bg-dg-bg border border-dg-border rounded-sm px-3 py-2.5 sm:py-2 text-base sm:text-[0.85rem] text-dg-text font-body placeholder:text-dg-text-tertiary focus:outline-none focus:border-dg-accent resize-y"
                  />
                  {field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
                    <p className="text-dg-movie text-[0.75rem] mt-1">
                      {field.state.meta.errors[0]}
                    </p>
                  )}
                </div>
              )}
            </form.Field>

            {status === "error" && <p className="text-dg-movie text-[0.8rem]">{errorMsg}</p>}

            <div className="flex justify-end gap-2 mt-1">
              <Button type="button" variant="ghost" size="compact" onClick={onClose}>
                cancel
              </Button>
              <form.Subscribe selector={(s) => s.canSubmit}>
                {(canSubmit) => (
                  <form.Subscribe selector={(s) => s.isSubmitting}>
                    {(isSubmitting) => (
                      <Button
                        type="submit"
                        variant="accent"
                        size="compact"
                        disabled={!canSubmit || isSubmitting}
                      >
                        {isSubmitting ? <span className="dg-ellipsis">Sending</span> : "submit"}
                      </Button>
                    )}
                  </form.Subscribe>
                )}
              </form.Subscribe>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
