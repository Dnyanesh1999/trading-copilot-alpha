import { createRoot } from "react-dom/client";
import App from "./App";
import { StudyShell, ResearcherDesk } from "./study/StudyShell";
import { ToastProvider } from "./workspace/Toasts";

createRoot(document.getElementById("root")!).render(
  <ToastProvider>
    {new URLSearchParams(location.search).has("researcher") ? (
      <ResearcherDesk />
    ) : new URLSearchParams(location.search).has("study") ? (
      <StudyShell />
    ) : (
      <App />
    )}
  </ToastProvider>,
);
