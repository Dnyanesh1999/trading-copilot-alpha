import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, AlertCircle, Info, X, ArrowRight } from "lucide-react";

type ToastInput = {
  title: string;
  description?: string;
  tone?: "success" | "error" | "info";
  action?: { label: string; onClick: () => void };
};
type Toast = ToastInput & { id: string };
const ToastContext = createContext<(toast: ToastInput) => void>(() => {});
export const useToast = () => useContext(ToastContext);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const notify = useCallback(
    (toast: ToastInput) =>
      setToasts((items) => [
        ...items.slice(-2),
        { ...toast, id: crypto.randomUUID() },
      ]),
    [],
  );
  const dismiss = useCallback(
    (id: string) =>
      setToasts((items) => items.filter((item) => item.id !== id)),
    [],
  );
  return (
    <ToastContext.Provider value={notify}>
      {children}
      <section className="toast-stack" aria-label="Notifications">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <ToastCard key={toast.id} toast={toast} dismiss={dismiss} />
          ))}
        </AnimatePresence>
      </section>
    </ToastContext.Provider>
  );
}
function ToastCard({
  toast,
  dismiss,
}: {
  toast: Toast;
  dismiss: (id: string) => void;
}) {
  const reduced = useReducedMotion();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(document.hidden);
  const tone = toast.tone ?? "success";
  useEffect(() => {
    const update = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    if (hovered || focused || hidden || tone === "error") return;
    const timer = setTimeout(() => dismiss(toast.id), 6500);
    return () => clearTimeout(timer);
  }, [hovered, focused, hidden, tone, toast.id, dismiss]);
  const Icon = tone === "error" ? AlertCircle : tone === "info" ? Info : Check;
  return (
    <motion.article
      layout={!reduced}
      className={`app-toast toast-${tone}`}
      initial={
        reduced
          ? { opacity: 0 }
          : { opacity: 0, y: -22, scale: 0.95, rotateX: -12 }
      }
      animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, x: 28, scale: 0.96 }}
      transition={
        reduced
          ? { duration: 0 }
          : { type: "spring", stiffness: 380, damping: 29 }
      }
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
      }}
    >
      <motion.span
        className="toast-icon"
        initial={reduced ? false : { scale: 0.6, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{
          delay: reduced ? 0 : 0.1,
          type: "spring",
          stiffness: 350,
          damping: 18,
        }}
      >
        <Icon size={19} />
      </motion.span>
      <div className="toast-copy">
        <div role={tone === "error" ? "alert" : "status"} aria-atomic="true">
          <strong>{toast.title}</strong>
          {toast.description && <p>{toast.description}</p>}
        </div>
        {toast.action && (
          <button
            className="toast-action"
            onClick={() => {
              toast.action?.onClick();
              dismiss(toast.id);
            }}
          >
            {toast.action.label}
            <ArrowRight size={13} />
          </button>
        )}
      </div>
      <button
        className="toast-close icon-button"
        aria-label={`Dismiss notification: ${toast.title}`}
        onClick={() => dismiss(toast.id)}
      >
        <X size={16} />
      </button>
    </motion.article>
  );
}
