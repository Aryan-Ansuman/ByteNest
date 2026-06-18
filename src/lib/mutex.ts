/**
 * Tiny in-process keyed mutex. Serializes async tasks sharing the same key
 * so they run one at a time instead of racing.
 *
 * This only protects against races *within a single Node.js process*. It
 * does nothing across multiple serverless/horizontally-scaled instances —
 * for that you'd need a real distributed lock or, better, push the
 * operation down into a DB-level atomic primitive (see adjustVoteCounter
 * in /api/vote for an example of doing exactly that).
 */
const queues = new Map<string, Promise<unknown>>();

export function withMutex<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = queues.get(key) ?? Promise.resolve();
    const run = previous.then(task, task);
    queues.set(key, run.catch(() => undefined));
    return run;
}
