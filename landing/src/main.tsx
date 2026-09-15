import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/dm-sans";
import "./styles.css";
import "./screenshots.css";
import Site from "./Site";
import "./guides.css";

const root = document.getElementById("root")!;
const app = (
  <React.StrictMode>
    <Site path={window.location.pathname} />
  </React.StrictMode>
);

if (root.childElementCount > 0) {
  ReactDOM.hydrateRoot(root, app);
} else {
  ReactDOM.createRoot(root).render(app);
}
