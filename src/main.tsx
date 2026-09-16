import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { StartupBoundary } from './StartupBoundary';
import "./styles.css";
import "./topology.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <StartupBoundary><App /></StartupBoundary>
  </React.StrictMode>,
);
