import { useLayoutEffect, useRef, useState } from "react";
export const reviewSteps = ["Rules", "Trades", "Review", "Next focus"];
export function StepRail({
  current,
  complete = false,
}: {
  current: number;
  complete?: boolean;
}) {
  const previous = useRef(current);
  const [direction, setDirection] = useState("down");
  useLayoutEffect(() => {
    setDirection(current < previous.current ? "up" : "down");
    previous.current = current;
  }, [current]);
  return (
    <section
      className={`quiet-rail ${complete ? "complete" : ""}`}
      aria-label={`Review progress: step ${complete ? 4 : current + 1} of 4, ${complete ? "Review complete" : reviewSteps[current]}`}
    >
      <div className="quiet-rows">
        <div
          aria-hidden="true"
          className={`quiet-indicator ${direction}`}
          style={{
            top: complete ? 0 : current * 28 + 6,
            bottom: complete ? 0 : 112 - (current * 28 + 22),
          }}
        />
        {reviewSteps.map((step, i) => (
          <div
            key={step}
            className={`quiet-row ${complete || i < current ? "done" : i === current ? "current" : "upcoming"}`}
            aria-current={!complete && i === current ? "step" : undefined}
          >
            <span className="quiet-ghost" aria-hidden="true" />
            <span className="quiet-label">{step}</span>
            {(complete || i < current) && (
              <svg
                className="quiet-tick"
                viewBox="0 0 16 16"
                width="14"
                height="14"
                aria-hidden="true"
              >
                <path d="M3 8l3 3 7-7" pathLength="1" />
              </svg>
            )}
          </div>
        ))}
      </div>
      {complete && <p className="quiet-complete">Review complete</p>}
    </section>
  );
}
