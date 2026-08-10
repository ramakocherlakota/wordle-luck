import { describe, it, expect, vi, type Mock } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UserEvent } from '@testing-library/user-event';
import App from './App';
import { parseScreenshot } from './screenshot/parseScreenshot';
import { server } from './test/mswServer';
import { slowHandler, error500Handler } from './test/mswHandlers';

// Screenshot parsing needs a canvas; jsdom has none. The parser itself is
// covered against synthetic images in src/screenshot/*.test.ts.
vi.mock('./screenshot/parseScreenshot', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./screenshot/parseScreenshot')>()),
  parseScreenshot: vi.fn(),
}));

/** Upload a screenshot that parses to the given board. */
async function uploadScreenshot(
  user: UserEvent,
  board: { target: string; guesses: string[]; patterns: string[] },
) {
  (parseScreenshot as Mock).mockResolvedValue({ ...board, unresolved: [] });
  await user.upload(
    screen.getByLabelText(/upload a screenshot/i),
    new File(['pixels'], 'wordle.png', { type: 'image/png' }),
  );
}

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

describe('App — screenshot upload', () => {
  const CRANE = {
    target: 'crane',
    guesses: ['soare', 'clint', 'crane'],
    patterns: ['-w--w', '--w--', 'bbbbb'],
  };

  it('fills the target and guesses from the parsed board', async () => {
    const user = userEvent.setup();
    render(<App />);

    await uploadScreenshot(user, CRANE);

    expect(await screen.findByLabelText('Target answer')).toHaveValue('crane');
    expect(screen.getByLabelText('Guess 1')).toHaveValue('soare');
    expect(screen.getByLabelText('Guess 2')).toHaveValue('clint');
    expect(screen.getByLabelText('Guess 3')).toHaveValue('crane');
    // The remaining default slots stay empty and Submit is ready.
    expect(screen.getByLabelText('Guess 4')).toHaveValue('');
    expect(screen.getByRole('button', { name: /submit/i })).toBeEnabled();
  });

  it('rates the uploaded board when Submit is pressed', async () => {
    const user = userEvent.setup();
    render(<App />);

    await uploadScreenshot(user, CRANE);
    await user.click(screen.getByRole('button', { name: /submit/i }));

    const table = await screen.findByRole('table');
    expect(within(table).getByText('soare')).toBeInTheDocument();
    expect(within(table).getByText('clint')).toBeInTheDocument();
  });

  it('drops results from the previous game', async () => {
    const user = userEvent.setup();
    render(<App />);
    await pickWord(user, 'Target answer', 'crane');
    await pickWord(user, 'Guess 1', 'soare');
    await user.click(screen.getByRole('button', { name: /submit/i }));
    await screen.findByRole('table');

    await uploadScreenshot(user, {
      target: 'slate',
      guesses: ['soare', 'slate'],
      patterns: ['-ww--', 'bbbbb'],
    });

    expect(await screen.findByLabelText('Target answer')).toHaveValue('slate');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('leaves a screenshot it could not read out of the inputs', async () => {
    const user = userEvent.setup();
    render(<App />);
    (parseScreenshot as Mock).mockRejectedValue(
      new Error('no board in this image'),
    );

    await user.upload(
      screen.getByLabelText(/upload a screenshot/i),
      new File(['pixels'], 'cat.png', { type: 'image/png' }),
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      /couldn't read/i,
    );
    expect(screen.getByLabelText('Target answer')).toHaveValue('');
    expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled();
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
