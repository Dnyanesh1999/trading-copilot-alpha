import { createRoot } from "react-dom/client";
import App from "./App";
import { StudyShell, ResearcherDesk } from "./study/StudyShell";
import { ToastProvider } from "./workspace/Toasts";

// Pages has no study backend. Old study links get a clear local notice, no request.
const params = new URLSearchParams(location.search);
const staticStudyLink =
  import.meta.env.PROD &&
  location.pathname.startsWith(import.meta.env.BASE_URL) &&
  (params.has("study") || params.has("researcher"));

createRoot(document.getElementById("root")!).render(
  <ToastProvider>
    {staticStudyLink ? (
      <main className="workspace study-closed-page">
        <a
          className="brand"
          href={import.meta.env.BASE_URL}
          aria-label="Trading Copilot home"
        >
          <span className="brand-mark" aria-hidden="true">
            ◩
          </span>
          Trading Copilot
        </a>
        <section
          className="panel study-closed-card"
          aria-labelledby="closed-title"
        >
          <h1 id="closed-title">Study collection is closed</h1>
          <p>This static demo does not collect study sessions or feedback.</p>
          <a className="primary" href={import.meta.env.BASE_URL}>
            Open the Trading Copilot demo
          </a>
        </section>
      </main>
    ) : new URLSearchParams(location.search).has("researcher") ? (
      <ResearcherDesk />
    ) : new URLSearchParams(location.search).has("study") ? (
      <StudyShell />
    ) : (
      <App />
    )}
  </ToastProvider>,
);
