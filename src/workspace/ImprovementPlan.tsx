import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { study } from "../study/client";
import type { Finding, Review, RuleId } from "../core/types";
import { actionRowsFor, focusRowFor } from "../core/action-rows";
import { ruleTerm } from "../core/glossary";
import { TermChip } from "./TermChip";
import { StatusPill } from "./StatusPill";
import { CopyAction } from "./CopyAction";
export function ImprovementPlan({
  review,
  initialFocus,
  onSave,
  onEvidence,
  saved,
  onFocusChange,
}: {
  review: Review;
  initialFocus: string;
  onSave: (focus: string) => void;
  onEvidence: (finding: Finding) => void;
  saved: boolean;
  onFocusChange?: (title: string) => void;
}) {
  const rows = actionRowsFor(review);
  const [selected, setSelected] = useState(
    () => focusRowFor(review, initialFocus)?.id ?? rows[0].id,
  );
  const reduced = useReducedMotion();
  const choose = (id: string) => {
    setSelected(id);
    const row = rows.find((r) => r.id === id);
    if (row) onFocusChange?.(row.title);
  };
  const current = rows.find((r) => r.id === selected) ?? rows[0];
  return (
    <section
      id="next-focus"
      tabIndex={-1}
      className="panel improvement-panel"
      onFocusCapture={() => study.start("action")}
    >
      <h2>Make the next review count.</h2>
      <p className="muted">Pick one thing to practise next time.</p>
      <div className="action-list" role="group" aria-label="Next review action">
        {rows.map((row, index) => {
          const expanded = row.id === current.id;
          const term =
            ["maintain", "missing-records"].includes(row.id) ? undefined : ruleTerm(row.id as RuleId);
          const before = [...new Set(row.details.map((d) => d.before))];
          if (!before.length)
            before.push(
              "Keep recording the original plan before your next trade.",
            );
          return (
            <article
              className={`focus-row ${expanded ? "selected" : ""}`}
              key={row.id}
            >
              <button
                className="focus-row-toggle"
                aria-expanded={expanded}
                aria-controls={`focus-${row.id}`}
                onClick={() => choose(row.id)}
                onKeyDown={(e) => {
                  if (["ArrowDown", "ArrowUp"].includes(e.key)) {
                    e.preventDefault();
                    const n =
                      (index + (e.key === "ArrowDown" ? 1 : -1) + rows.length) %
                      rows.length;
                    choose(rows[n].id);
                    e.currentTarget
                      .closest(".action-list")
                      ?.querySelectorAll<HTMLButtonElement>(".focus-row-toggle")
                      [n]?.focus();
                  }
                }}
              >
                <span className="focus-radio" aria-hidden="true" />
                <span className="focus-row-title" title={row.title}>
                  <span>{row.title}</span>
                  {index === 0 && <small>Suggested</small>}
                </span>
                <StatusPill status={row.status} />
              </button>
              <motion.div
                id={`focus-${row.id}`}
                initial={false}
                animate={{
                  height: expanded ? "auto" : 0,
                  opacity: expanded ? 1 : 0,
                }}
                transition={{ duration: reduced ? 0 : 0.3 }}
                inert={!expanded}
                aria-hidden={!expanded}
                className="focus-expand"
              >
                <div className="focus-content">
                  <h3>What happened</h3>
                  {row.details.length ? (
                    row.details.map((d) => (
                      <p key={d.finding.positionId}>
                        {d.emphasis && d.happened.includes(d.emphasis) ? (
                          <>
                            {d.happened.split(d.emphasis)[0]}
                            <strong>{d.emphasis}</strong>
                            {d.happened.slice(
                              d.happened.indexOf(d.emphasis) +
                                d.emphasis.length,
                            )}
                          </>
                        ) : (
                          d.happened
                        )}
                      </p>
                    ))
                  ) : (
                    <p>
                      Every assessed check was followed; unchecked rules were
                      not assessed.
                    </p>
                  )}
                  <h3>Before your next trade</h3>
                  <div className="before-focus">
                    <div>
                      {before.map((text) => (
                        <p key={text}>{text}</p>
                      ))}
                    </div>
                    <CopyAction text={before.join("\n")} />
                  </div>
                  {term && (
                    <div className="focus-term">
                      <TermChip
                        term={term}
                        position={review.session.positions.find(
                          (p) => p.id === row.details[0]?.finding.positionId,
                        )}
                      />
                    </div>
                  )}
                  <h3>In your next review</h3>
                  <p className="muted">{row.next}</p>
                  <div className="focus-proof">
                    {row.details.map((d) => (
                      <button
                        key={d.finding.positionId}
                        className="text-button"
                        onClick={() => onEvidence(d.finding)}
                      >
                        Show proof
                        {row.details.length > 1
                          ? ` · ${review.session.positions.find((p) => p.id === d.finding.positionId)?.instrument}`
                          : ""}
                        <ArrowRight size={14} />
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            </article>
          );
        })}
      </div>
      <div className="focus-save">
        <button
          id="save-focus"
          className="primary full"
          onClick={() => onSave(current.title)}
        >
          Save focus
        </button>
        {saved && (
          <span className="sr-only" role="status">
            Review saved; choose Save focus to update it.
          </span>
        )}
      </div>
    </section>
  );
}
