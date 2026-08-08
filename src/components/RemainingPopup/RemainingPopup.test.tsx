import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RemainingPopup from './RemainingPopup';
import { server } from '../../test/mswServer';
import { remainingError500Handler } from '../../test/mswHandlers';

describe('RemainingPopup', () => {
  it('lazily fetches and renders the remaining word list', async () => {
    render(
      <RemainingPopup
        guess="soare"
        guesses={['soare']}
        scores={['-w--w']}
        onClose={vi.fn()}
      />,
    );
    // Loading first, then the list.
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i);
    expect(await screen.findByText('abbot')).toBeInTheDocument();
    expect(screen.getByText('actor')).toBeInTheDocument();
  });

  it('closes when the close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <RemainingPopup
        guess="soare"
        guesses={['soare']}
        scores={['-w--w']}
        onClose={onClose}
      />,
    );
    await screen.findByText('abbot');
    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <RemainingPopup
        guess="soare"
        guesses={['soare']}
        scores={['-w--w']}
        onClose={onClose}
      />,
    );
    await screen.findByText('abbot');
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('shows only the target for a solved row', async () => {
    render(
      <RemainingPopup
        guess="crane"
        guesses={['crane']}
        scores={['bbbbb']}
        onClose={vi.fn()}
      />,
    );
    expect(await screen.findByText(/1 possible answer/i)).toBeInTheDocument();
    const list = screen.getByRole('list');
    expect(within(list).getByText('crane')).toBeInTheDocument();
    expect(within(list).queryAllByRole('listitem')).toHaveLength(1);
  });

  it('shows an error with a working Retry affordance', async () => {
    const user = userEvent.setup();
    server.use(remainingError500Handler());
    render(
      <RemainingPopup
        guess="soare"
        guesses={['soare']}
        scores={['-w--w']}
        onClose={vi.fn()}
      />,
    );
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/error|reported/i);

    server.resetHandlers(); // recover
    await user.click(within(alert).getByRole('button', { name: /retry/i }));
    await waitFor(() =>
      expect(screen.getByText('abbot')).toBeInTheDocument(),
    );
  });

  it('focuses the close button on open and traps Tab within the dialog', async () => {
    const user = userEvent.setup();
    render(
      <RemainingPopup
        guess="crane"
        guesses={['crane']}
        scores={['bbbbb']}
        onClose={vi.fn()}
      />,
    );
    const close = screen.getByRole('button', { name: /close/i });
    expect(close).toHaveFocus();
    // Only the close button is focusable on a solved (no-retry) dialog, so Tab
    // wraps back to it.
    await user.tab();
    expect(close).toHaveFocus();
  });

  it('uses cached words without fetching', () => {
    render(
      <RemainingPopup
        guess="soare"
        guesses={['soare']}
        scores={['-w--w']}
        cachedWords={['zzzz1', 'zzzz2']}
        onClose={vi.fn()}
      />,
    );
    // No loading state; renders the cached list immediately.
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText('zzzz1')).toBeInTheDocument();
  });
});
