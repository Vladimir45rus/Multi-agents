/**
 * Merges several async iterables into a single stream.
 *
 * Chat rounds use it so advisors can think concurrently: each generator keeps
 * its own ordering, the merged stream yields events as soon as they arrive.
 */
export async function* mergeAsync<T>(
  iterables: Array<AsyncIterable<T>>,
  concurrency = 3,
): AsyncGenerator<T> {
  const total = iterables.length;
  if (total === 0) return;

  const queue: T[] = [];
  let cursor = 0;
  let finished = 0;
  let wake: (() => void) | null = null;

  const notify = () => {
    const resume = wake;
    wake = null;
    resume?.();
  };

  const worker = async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= total) return;
      try {
        for await (const item of iterables[index]) {
          queue.push(item);
          notify();
        }
      } catch {
        // Individual generators report their own failures as stream events.
      }
      finished += 1;
      notify();
    }
  };

  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, total)) }, () => worker());

  while (finished < total) {
    if (queue.length > 0) {
      yield queue.shift() as T;
      continue;
    }
    await new Promise<void>((resolve) => {
      wake = resolve;
      // Safety net: a lost wake-up must never hang the round.
      setTimeout(resolve, 50);
    });
  }

  while (queue.length > 0) yield queue.shift() as T;

  // Workers exit on their own once every generator has been consumed; the
  // consumer stopping early leaves them draining into a dead queue.
  void workers;
}
