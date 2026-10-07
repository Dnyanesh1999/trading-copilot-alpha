import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowRight, X } from 'lucide-react';
export const Arrow = () => <ArrowRight size={20} aria-hidden="true" />;
export function Header({ onHome, onHelp, onReset }: { onHome: () => void; onHelp: () => void; onReset: () => void }) {
  return <header className="header"><button className="brand" onClick={onHome} aria-label="Trading Copilot home"><img src={`${import.meta.env.BASE_URL}compass.svg`} alt="" />Trading Copilot</button><nav aria-label="Demo navigation"><button onClick={onHelp}>How it works</button><button onClick={onReset}>Reset demo</button></nav></header>;
}
export function Progress({ current = 0, welcome = false }: { current?: number; welcome?: boolean }) {
  return <ol className={`steps ${welcome ? 'welcome-steps' : ''}`} aria-label="Review progress">{['Your rules', 'Your session', 'Your next step'].map((label, i) => <li key={label} aria-current={current === i + 1 ? 'step' : undefined} className={current >= i + 1 ? 'reached' : ''}><span>{i + 1}</span><div>{label}</div></li>)}</ol>;
}
export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const trigger = document.activeElement as HTMLElement | null; const el = ref.current!; el.showModal(); return () => { el.close(); trigger?.focus(); }; }, []);
  return <dialog ref={ref} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { const r = ref.current!.getBoundingClientRect(); if (e.target === ref.current && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) onClose(); }} aria-labelledby="dialog-title"><button className="dialog-close" onClick={onClose} aria-label="Close dialog" autoFocus><X size={24} /></button><h2 id="dialog-title">{title}</h2>{children}</dialog>;
}
