import { motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { glossary, termExample, type Term } from "../core/glossary";
import type { Position } from "../core/types";
export function TermChip({
  term,
  position,
  children,
}: {
  term: Term;
  position?: Position;
  children?: ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [point, setPoint] = useState({ top: 0, left: 0 });
  const trigger = useRef<HTMLButtonElement>(null),
    card = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const id = useId();
  function show() {
    clearTimeout(timer.current);
    const r = trigger.current?.getBoundingClientRect();
    if (r) {
      setPoint({
        left: Math.max(12, Math.min(r.left, window.innerWidth - 292)),
        top:
          window.innerHeight - r.bottom < 220
            ? Math.max(12, r.top - 210)
            : r.bottom + 8,
      });
    }
    setOpen(true);
  }
  function hide() {
    timer.current = setTimeout(() => setOpen(false), 120);
  }
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (
        !trigger.current?.contains(e.target as Node) &&
        !card.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    };
    const close = () => setOpen(false);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="term-chip"
        aria-label={`Explain ${glossary[term].label}`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          show();
        }}
      >
        {children ?? glossary[term].label}
        <span aria-hidden="true">?</span>
      </button>
      {open &&
        createPortal(
          <motion.div
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reducedMotion ? 0 : 0.15 }}
            ref={card}
            id={id}
            role="tooltip"
            className="term-card"
            style={point}
            onMouseEnter={() => clearTimeout(timer.current)}
            onMouseLeave={hide}
          >
            <strong>{glossary[term].label}</strong>
            {term === "reward-risk" && (
              <p>{glossary["reward-risk"].exampleIntro}</p>
            )}
            <p>{glossary[term].meaning}</p>
            <p className="term-example">{termExample(term, position)}</p>
          </motion.div>,
          trigger.current?.closest("dialog") ?? document.body,
        )}
    </>
  );
}
