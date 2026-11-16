import "#ui/styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app.tsx";

const root = document.querySelector("#root");

if (!root) {
  throw new Error("The shell page has no #root element");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
