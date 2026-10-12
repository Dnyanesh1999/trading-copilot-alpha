import { useEffect, useRef, type ReactNode } from "react";
import { ArrowRight, X } from "lucide-react";
export const Arrow = () => <ArrowRight size={20} aria-hidden="true" />;
export function Header({
  onHome,
  onHelp,
  onReset,
}: {
  onHome: () => void;
  onHelp: () => void;
  onReset: () => void;
}) {
  return (
    <header className="header">
      <button
        className="brand"
        onClick={onHome}
        aria-label="Trading Copilot home"
      >
        <img src={`${import.meta.env.BASE_URL}compass.svg`} alt="" />
        Trading Copilot
      </button>
      <nav aria-label="Demo navigation">
        <button onClick={onHelp}>How it works</button>
        <button onClick={onReset}>Reset demo</button>
      </nav>
    </header>
  );
}
export function Progress({
  current = 0,
  welcome = false,
  complete = false,
  animate = true,
}: {
  current?: number;
  welcome?: boolean;
  complete?: boolean;
  animate?: boolean;
}) {
  return (
    <ol
      className={`steps ${welcome ? "welcome-steps" : ""} ${!animate ? "progress-still" : ""}`}
      aria-label="Review progress"
    >
      {["Your rules", "Your session", "Your next step"].map((label, i) => (
        <li
          key={label}
          aria-current={!complete && current === i + 1 ? "step" : undefined}
          className={`${current >= i + 1 ? "reached" : ""} ${!welcome && (complete || current > i + 1) ? "step-done" : ""}`}
        >
          <span aria-hidden="true">
            {!welcome && (complete || current > i + 1) ? (
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="m6 12 4 4 8-8" pathLength="1" />
              </svg>
            ) : (
              i + 1
            )}
          </span>
          {!welcome && (complete || current > i + 1) && (
            <small className="sr-only">Completed: </small>
          )}
          <div>{label}</div>
        </li>
      ))}
    </ol>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const el = ref.current!;
    el.showModal();
    return () => {
      el.close();
      trigger?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onKeyDown={(e) => {
        if (e.key !== "Tab") return;
        const controls = Array.from(
          ref.current!.querySelectorAll<HTMLElement>(
            "button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex='0']",
          ),
        ).filter((control) => control.getClientRects().length > 0);
        const active = document.activeElement as HTMLElement | null;
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        } else if (active && !controls.includes(active)) {
          // Source rows may receive deliberate focus without becoming tab stops.
          e.preventDefault();
          const relative = e.shiftKey
            ? controls
                .filter(
                  (control) =>
                    active.compareDocumentPosition(control) &
                    Node.DOCUMENT_POSITION_PRECEDING,
                )
                .at(-1)
            : controls.find(
                (control) =>
                  active.compareDocumentPosition(control) &
                  Node.DOCUMENT_POSITION_FOLLOWING,
              );
          (relative ?? (e.shiftKey ? last : first))?.focus();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        const r = ref.current!.getBoundingClientRect();
        if (
          e.target === ref.current &&
          (e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom)
        )
          onClose();
      }}
      aria-labelledby="dialog-title"
    >
      <button
        className="dialog-close"
        onClick={onClose}
        aria-label="Close dialog"
        autoFocus
      >
        <X size={24} />
      </button>
      <h2 id="dialog-title">{title}</h2>
      {children}
    </dialog>
  );
}
