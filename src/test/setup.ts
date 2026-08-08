import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './mswServer';

/**
 * jsdom installs its own AbortController/AbortSignal, but Node's `fetch`
 * (undici, which also backs MSW's Request construction) validates the passed
 * signal with `instanceof` against *its* realm's AbortSignal and rejects
 * jsdom's. That mismatch only exists in the test environment, so bridge it
 * here (never in production code): drop the incompatible signal before the
 * request reaches MSW/undici, while still rejecting with an AbortError if the
 * caller's signal fires — preserving the client's abort semantics.
 *
 * This wrapper is installed *after* `server.listen()` so it sits above MSW's
 * own fetch patch.
 */
function bridgeAbortSignal(): void {
  const inner = globalThis.fetch.bind(globalThis);
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const signal = init?.signal;
    if (!signal) return inner(input, init);
    const { signal: _dropped, ...rest } = init ?? {};
    if (signal.aborted) {
      return Promise.reject(new DOMException('Aborted', 'AbortError'));
    }
    return new Promise<Response>((resolve, reject) => {
      const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
      signal.addEventListener('abort', onAbort, { once: true });
      inner(input, rest).then(
        (res) => {
          signal.removeEventListener('abort', onAbort);
          resolve(res);
        },
        (err) => {
          signal.removeEventListener('abort', onAbort);
          reject(err);
        },
      );
    });
  }) as typeof fetch;
}

// Start the MSW mock server once for the whole suite. Any request without a
// matching handler errors, so tests can't accidentally hit the network.
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  bridgeAbortSignal();
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
