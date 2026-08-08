import { useCallback, useEffect, useRef, useState } from 'react';
import { rateSolution, ApiError } from '../api/wordleService';
import type { GuessRating, LuckStatus } from '../types';

export interface UseLuckRating {
  status: LuckStatus;
  results: GuessRating[] | null;
  error: string | null;
  /** Milliseconds elapsed in the current/last loading run. */
  elapsedMs: number;
  /** Submit a target + guesses for rating (aborts any in-flight request). */
  submit: (target: string, guesses: string[]) => void;
  /** Re-run the most recent submit (for the error-banner Retry action). */
  retry: () => void;
  /** Reset to idle and drop results/error (used by Clear). */
  reset: () => void;
}

function messageFor(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return 'Something went wrong. Please try again.';
}

/**
 * Encapsulates the submit lifecycle for luck rating:
 * idle → loading (elapsed ticking, abortable) → success | error.
 */
export function useLuckRating(): UseLuckRating {
  const [status, setStatus] = useState<LuckStatus>('idle');
  const [results, setResults] = useState<GuessRating[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const controllerRef = useRef<AbortController | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastArgsRef = useRef<{ target: string; guesses: string[] } | null>(
    null,
  );

  const stopTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const run = useCallback(
    (target: string, guesses: string[]) => {
      lastArgsRef.current = { target, guesses };

      // Abort any in-flight request before starting a new one.
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      setStatus('loading');
      setError(null);
      setResults(null);

      const start = Date.now();
      setElapsedMs(0);
      stopTimer();
      intervalRef.current = setInterval(() => {
        setElapsedMs(Date.now() - start);
      }, 250);

      rateSolution(target, guesses, controller.signal)
        .then((rows) => {
          if (controller.signal.aborted) return;
          stopTimer();
          setElapsedMs(Date.now() - start);
          setResults(rows);
          setStatus('success');
        })
        .catch((err: unknown) => {
          // A caller-initiated abort (resubmit/unmount) is not an error.
          if ((err as { name?: string })?.name === 'AbortError') return;
          if (controller.signal.aborted) return;
          stopTimer();
          setError(messageFor(err));
          setStatus('error');
        });
    },
    [stopTimer],
  );

  const submit = useCallback(
    (target: string, guesses: string[]) => run(target, guesses),
    [run],
  );

  const retry = useCallback(() => {
    const last = lastArgsRef.current;
    if (last) run(last.target, last.guesses);
  }, [run]);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    stopTimer();
    lastArgsRef.current = null;
    setStatus('idle');
    setResults(null);
    setError(null);
    setElapsedMs(0);
  }, [stopTimer]);

  // Abort in-flight request + clear timer on unmount.
  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
      stopTimer();
    };
  }, [stopTimer]);

  return { status, results, error, elapsedMs, submit, retry, reset };
}
