import { createServer } from "vite";
import { spawn } from "node:child_process";
import electron from "electron";
await import("./build-electron.mjs");
await import("./build-icons.mjs");
const server = await createServer();
await server.listen();
const child = spawn(electron, ["."], {
  stdio: "inherit",
  env: { ...process.env, PORTY_DEV_URL: "http://127.0.0.1:5173" },
});
const close = async () => {
  child.kill();
  await server.close();
};
child.on("exit", async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
process.on("SIGINT", close);
process.on("SIGTERM", close);
