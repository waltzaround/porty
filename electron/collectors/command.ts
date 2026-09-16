import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);
export async function command(file: string, args: string[], timeout = 25000, signal?: AbortSignal) {
  const { stdout } = await run(file, args, {
    encoding: "utf8",
    timeout,
    maxBuffer: 20 * 1024 * 1024,
    windowsHide: true,
    signal,
    killSignal: 'SIGKILL',
  });
  return stdout;
}
