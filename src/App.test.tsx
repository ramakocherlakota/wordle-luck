import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UserEvent } from '@testing-library/user-event';
import App from './App';
import { server } from './test/mswServer';
import { slowHandler, error500Handler } from './test/mswHandlers';

/** Type a word into a labeled WordSelect combobox and commit it with Enter. */
async function pickWord(user: UserEvent, label: string, word: string) {
  const input = screen.getByLabelText(label);
  await user.click(input);
  await user.type(input, word);
  await user.keyboard('{Enter}');
}

describe('App — User Story 1 (rate luck)', () => {
  it('keeps Submit disabled until a target and ≥1 guess exist (FR-006)', async () => {
    const user = userEvent.setup();
    render(<App />);
    const submit = screen.getByRole('button', { name: /submit/i });
    expect(submit).toBeDisabled();

    await pickWord(user, 'Target answer', 'crane');
    expect(submit).toBeDisabled(); // target only — still disabled

    await pickWord(user, 'Guess 1', 'soare');
    expect(submit).toBeEnabled();
  });

  it('enables Submit for words typed in full and tabbed past (no dropdown)', async () => {
    const user = userEvent.setup();
    render(<App />);
    const submit = screen.getByRole('button', { name: /submit/i });

    await user.click(screen.getByLabelText('Target answer'));
    await user.keyboard('crane');
    await user.tab();
    await user.keyboard('soare');
    await user.tab();

    expect(screen.getByLabelText('Target answer')).toHaveValue('crane');
    expect(screen.getByLabelText('Guess 1')).toHaveValue('soare');
    expect(submit).toBeEnabled();
  });

  it('renders GUESS/LUCK columns with luck rounded to 2 decimals (SC-002/003)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await pickWord(user, 'Target answer', 'crane');
    await pickWord(user, 'Guess 1', 'soare');
    await pickWord(user, 'Guess 2', 'clint');

    await user.click(screen.getByRole('button', { name: /submit/i }));

    const table = await screen.findByRole('table');
    // Column headers
    expect(
      within(table).getByRole('columnheader', { name: /guess/i }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole('columnheader', { name: /luck/i }),
    ).toBeInTheDocument();
    // Scores are computed but never shown.
    expect(
      within(table).queryByRole('columnheader', { name: /score/i }),
    ).not.toBeInTheDocument();

    // 0.5316 rounds to "+0.53"; -0.5316 rounds to "-0.53".
    expect(within(table).getByText('+0.53')).toBeInTheDocument();
    expect(within(table).getByText('-0.53')).toBeInTheDocument();
    expect(within(table).queryByText('0.531')).not.toBeInTheDocument();
    expect(within(table).queryByText('-0.531')).not.toBeInTheDocument();
  });

  it('shows a loading + elapsed indicator during the backend call (FR-008/SC-004)', async () => {
    server.use(slowHandler(400));
    const user = userEvent.setup();
    render(<App />);
    await pickWord(user, 'Target answer', 'crane');
    await pickWord(user, 'Guess 1', 'soare');
    await user.click(screen.getByRole('button', { name: /submit/i }));

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(/rating/i);
    expect(status).toHaveTextContent(/\d\.\ds/); // elapsed seconds

    await screen.findByRole('table');
  });

  it('shows an error banner with a working Retry on backend failure (FR-014/SC-007)', async () => {
    server.use(error500Handler());
    const user = userEvent.setup();
    render(<App />);
    await pickWord(user, 'Target answer', 'crane');
    await pickWord(user, 'Guess 1', 'soare');
    await user.click(screen.getByRole('button', { name: /submit/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/error/i);

    // Recover, then Retry re-submits successfully.
    server.resetHandlers();
    await user.click(within(alert).getByRole('button', { name: /retry/i }));
    await screen.findByRole('table');
  });
});

describe('App — persisted inputs', () => {
  it('restores the target and guesses entered in a previous session', async () => {
    const user = userEvent.setup();
    const first = render(<App />);
    await pickWord(user, 'Target answer', 'crane');
    await pickWord(user, 'Guess 1', 'soare');
    await pickWord(user, 'Guess 3', 'clint');
    first.unmount();

    render(<App />);
    expect(screen.getByLabelText('Target answer')).toHaveValue('crane');
    expect(screen.getByLabelText('Guess 1')).toHaveValue('soare');
    expect(screen.getByLabelText('Guess 2')).toHaveValue('');
    expect(screen.getByLabelText('Guess 3')).toHaveValue('clint');
  });

  it('restores added slots beyond the default six', async () => {
    const user = userEvent.setup();
    const first = render(<App />);
    await user.click(screen.getByRole('button', { name: /add guess/i }));
    await pickWord(user, 'Guess 7', 'salet');
    first.unmount();

    render(<App />);
    expect(screen.getByLabelText('Guess 7')).toHaveValue('salet');
  });

  it('does not restore anything after Clear', async () => {
    const user = userEvent.setup();
    const first = render(<App />);
    await pickWord(user, 'Target answer', 'crane');
    await pickWord(user, 'Guess 1', 'soare');
    await user.click(screen.getByRole('button', { name: /clear/i }));
    first.unmount();

    render(<App />);
    expect(screen.getByLabelText('Target answer')).toHaveValue('');
    expect(screen.getByLabelText('Guess 1')).toHaveValue('');
  });
});

describe('App — User Story 4 (clear)', () => {
  it('Clear resets the target, all guess slots, and any results (FR-013/SC-008)', async () => {
    const user = userEvent.setup();
    render(<App />);

    await pickWord(user, 'Target answer', 'crane');
    await pickWord(user, 'Guess 1', 'soare');
    await pickWord(user, 'Guess 2', 'clint');
    await user.click(screen.getByRole('button', { name: /submit/i }));
    await screen.findByRole('table');

    // Sanity: values are set.
    expect(screen.getByLabelText('Target answer')).toHaveValue('crane');
    expect(screen.getByLabelText('Guess 1')).toHaveValue('soare');

    await user.click(screen.getByRole('button', { name: /clear/i }));

    expect(screen.getByLabelText('Target answer')).toHaveValue('');
    expect(screen.getByLabelText('Guess 1')).toHaveValue('');
    expect(screen.getByLabelText('Guess 2')).toHaveValue('');
    // Results are gone.
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    // Submit disabled again (nothing selected).
    expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled();
  });
});
