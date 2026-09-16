export async function boundedScan<T>(
  run: (signal: AbortSignal) => Promise<T>,
  milliseconds: number,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("The hardware scan timed out. Refresh to retry."));
    }, milliseconds);
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() => run(controller.signal)),
      deadline,
    ]);
  } finally {
    clearTimeout(timer!);
  }
}
