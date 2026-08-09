import { describe, it, expect } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResultsTable from './ResultsTable';
import type { GuessRating } from '../../types';

const RESULTS: GuessRating[] = [
  {
    guess: 'soare',
    score: '-w--w',
    luck: 0.5316,
    remainingCountAfter: 51,
  },
  {
    guess: 'crane',
    score: 'bbbbb',
    luck: 0.12,
    remainingCountAfter: 1,
  },
];

describe('ResultsTable', () => {
  it('renders one row per rated guess with rounded luck', () => {
    render(<ResultsTable results={RESULTS} />);
    const rows = screen.getAllByRole('row');
    // 1 header row + 2 data rows
    expect(rows).toHaveLength(3);
    expect(screen.getByText('+0.53')).toBeInTheDocument();
  });

  it('does not display the score column', () => {
    render(<ResultsTable results={RESULTS} />);
    expect(
      screen.queryByRole('columnheader', { name: /score/i }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('columnheader')).toHaveLength(3);
    expect(screen.queryByText('-w--w')).not.toBeInTheDocument();
  });

  it('opens the remaining popup for a row and keeps the table shown', async () => {
    const user = userEvent.setup();
    render(<ResultsTable results={RESULTS} />);

    await user.click(
      screen.getByRole('button', {
        name: /remaining answers after soare/i,
      }),
    );

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('abbot')).toBeInTheDocument();
    // Table remains present behind the dialog.
    expect(screen.getByRole('table')).toBeInTheDocument();

    // Dismiss → table unchanged.
    await user.click(within(dialog).getByRole('button', { name: /close/i }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('shows just the target for the solved row', async () => {
    const user = userEvent.setup();
    render(<ResultsTable results={RESULTS} />);
    await user.click(
      screen.getByRole('button', {
        name: /remaining answers after crane/i,
      }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(
      await within(dialog).findByText(/1 possible answer/i),
    ).toBeInTheDocument();
    const list = within(dialog).getByRole('list');
    expect(within(list).queryAllByRole('listitem')).toHaveLength(1);
  });
});
