import { useEffect, useRef, useState } from "react";
import { Copy, Check } from "lucide-react";
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const previous = document.activeElement as HTMLElement | null;
    const field = document.createElement("textarea");
    field.value = text;
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.append(field);
    field.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {}
    field.remove();
    previous?.focus();
    return ok;
  }
}
export function CopyAction({
  text,
  label = "Copy before your next trade",
}: {
  text: string;
  label?: string;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "blocked">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <span className="copy-action">
      <button
        className="icon-button"
        aria-label={label}
        onClick={async () => {
          clearTimeout(timer.current);
          const ok = await copyText(text);
          setStatus(ok ? "copied" : "blocked");
          if (ok) timer.current = setTimeout(() => setStatus("idle"), 1500);
        }}
      >
        {status === "copied" ? (
          <>
            <Check size={16} />
            <span>Copied</span>
          </>
        ) : (
          <Copy size={16} />
        )}
      </button>
      {status === "blocked" && (
        <span role="status" className="copy-fallback">
          Clipboard blocked. Select and copy this text.
          <textarea
            readOnly
            aria-label="Text to copy"
            value={text}
            onFocus={(e) => e.target.select()}
          />
        </span>
      )}
    </span>
  );
}
