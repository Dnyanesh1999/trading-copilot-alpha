import type { SavedReview } from "../core/types";
import { FOCUS_LABELS } from "../core/fixtures";
import { Arrow, Progress } from "./Chrome";
export function Welcome({
  onStart,
  animateIntro,
  onCustom,
  saved,
  onSaved,
}: {
  onStart: () => void;
  animateIntro: boolean;
  onCustom: () => void;
  saved: SavedReview | null;
  onSaved: () => void;
}) {
  return (
    <main
      id="content"
      className={`welcome ${animateIntro ? "welcome-intro" : "welcome-return"}`}
    >
      <section className="welcome-main">
        <div className="welcome-copy">
          <h1 tabIndex={-1}>
            Make sense of
            <br className="desktop-break" /> your trading.
          </h1>
          <p className="welcome-description">
            A short guided review. Your rules, your trades,
            <br className="desktop-break" /> one useful next step.
          </p>
          <div className="welcome-actions">
            <button className="primary pill" onClick={onStart}>
              Try a sample review <Arrow />
            </button>
            <button className="text-action" onClick={onCustom}>
              Set my rules
            </button>
          </div>
          <p className="demo-note">
            Alpha · fictional equities · five evidence-based checks
          </p>
        </div>
        <div className="welcome-art">
          <svg
            className="welcome-light-trail"
            viewBox="0 0 1505 1045"
            fill="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient
                id="welcome-trail-light"
                x1="550"
                y1="800"
                x2="1075"
                y2="300"
                gradientUnits="userSpaceOnUse"
              >
                <stop stopColor="#f8bd9b" />
                <stop offset=".55" stopColor="#e1d1f0" />
                <stop offset="1" stopColor="#fff2d8" />
              </linearGradient>
            </defs>
            <path
              d="M550 785C635 750 690 680 775 640S900 555 930 510S978 461 1004 441S1084 424 1068 408S1012 391 1030 375S973 364 976 351S1018 337 1010 329S1037 311 1075 295"
              stroke="url(#welcome-trail-light)"
              strokeWidth="12"
              strokeLinecap="round"
              pathLength="1"
            />
          </svg>
          <img
            src={`${import.meta.env.BASE_URL}stepping-stones.webp`}
            alt="Coral and lavender stepping stones leading towards a warm sunrise"
          />
        </div>
      </section>
      <Progress welcome />
      {saved && (
        <div className="resume">
          <span>Your saved next step: {FOCUS_LABELS[saved.focus]}</span>
          <button onClick={onSaved}>
            Open saved review <Arrow />
          </button>
        </div>
      )}
      <p className="page-footnote">
        Start with a sample. Explore at your own pace.
      </p>
    </main>
  );
}
