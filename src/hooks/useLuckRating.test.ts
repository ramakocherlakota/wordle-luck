import { describe, it, expect } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useLuckRating } from './useLuckRating';
import { server } from '../test/mswServer';
import {
  error500Handler,
  error200Handler,
  networkErrorHandler,
  slowHandler,
} from '../test/mswHandlers';

describe('useLuckRating', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => useLuckRating());
    expect(result.current.status).toBe('idle');
    expect(result.current.results).toBeNull();
  });

  it('transitions idle → loading → success with parsed rows', async () => {
    const { result } = renderHook(() => useLuckRating());

    act(() => {
      result.current.submit('crane', ['soare', 'crane']);
    });
    expect(result.current.status).toBe('loading');

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.results).toHaveLength(2);
    expect(result.current.results![0]!.guess).toBe('soare');
  });

  it('surfaces a 500 as an error message', async () => {
    server.use(error500Handler());
    const { result } = renderHook(() => useLuckRating());
    act(() => result.current.submit('crane', ['soare']));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toMatch(/error/i);
  });

  it('surfaces a 200 body error message', async () => {
    server.use(error200Handler());
    const { result } = renderHook(() => useLuckRating());
    act(() => result.current.submit('crane', ['soare']));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toMatch(/inconsistent/i);
  });

  it('surfaces a network failure', async () => {
    server.use(networkErrorHandler());
    const { result } = renderHook(() => useLuckRating());
    act(() => result.current.submit('crane', ['soare']));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBeTruthy();
  });

  it('ticks elapsed time while loading', async () => {
    server.use(slowHandler(400));
    const { result } = renderHook(() => useLuckRating());
    act(() => result.current.submit('crane', ['soare', 'crane']));
    await waitFor(() => expect(result.current.elapsedMs).toBeGreaterThan(0));
    await waitFor(() => expect(result.current.status).toBe('success'));
  });

  it('retry re-runs the last submit', async () => {
    server.use(error500Handler());
    const { result } = renderHook(() => useLuckRating());
    act(() => result.current.submit('crane', ['soare']));
    await waitFor(() => expect(result.current.status).toBe('error'));

    server.resetHandlers(); // back to happy path
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.results).not.toBeNull();
  });

  it('reset returns to idle and drops results', async () => {
    const { result } = renderHook(() => useLuckRating());
    act(() => result.current.submit('crane', ['crane']));
    await waitFor(() => expect(result.current.status).toBe('success'));
    act(() => result.current.reset());
    expect(result.current.status).toBe('idle');
    expect(result.current.results).toBeNull();
  });

  it('aborts in-flight request on resubmit without error', async () => {
    server.use(slowHandler(300));
    const { result } = renderHook(() => useLuckRating());
    act(() => result.current.submit('crane', ['soare']));
    act(() => result.current.submit('crane', ['soare', 'crane']));
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.results).toHaveLength(2);
  });

  it('unmounting during a request does not throw', async () => {
    server.use(slowHandler(300));
    const { result, unmount } = renderHook(() => useLuckRating());
    act(() => result.current.submit('crane', ['soare']));
    expect(() => unmount()).not.toThrow();
  });
});
