import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
export default defineConfig({
  plugins: [react(), {
    name: "development-csp",
    apply: "serve",
    transformIndexHtml: html => html.replace("connect-src 'none'", "connect-src 'self' ws://127.0.0.1:5173 ws://localhost:5173"),
  }],
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: { sourcemap: false },
  base: "./",
  server: { port: 5173, strictPort: true },
});
