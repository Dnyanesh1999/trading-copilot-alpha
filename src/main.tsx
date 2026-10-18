import { createRoot } from "react-dom/client";
import App from "./App";
import { ToastProvider } from "./workspace/Toasts";

createRoot(document.getElementById("root")!).render(
  <ToastProvider>
    <App />
  </ToastProvider>,
);
