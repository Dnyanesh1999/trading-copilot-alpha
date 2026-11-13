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
      <main className="panel">
        <h1>Study collection is closed</h1>
        <p>This static demo does not collect study sessions or feedback.</p>
        <a href={import.meta.env.BASE_URL}>Open the Trading Copilot demo</a>
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
