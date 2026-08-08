import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import GuessInputs from './GuessInputs';
import { buildFirstLetterIndex } from '../../data/wordLists';

const OPTIONS = ['crane', 'soare', 'clint', 'abbot'];
const INDEX = buildFirstLetterIndex(OPTIONS);

/** Harness that owns guess state like App does, exercising add + submit. */
function Harness({ onSubmit }: { onSubmit: (guesses: string[]) => void }) {
  const [guesses, setGuesses] = useState<string[]>(() =>
    Array<string>(6).fill(''),
  );
  return (
    <div>
      <GuessInputs
        guesses={guesses}
        onChangeGuess={(i, v) =>
          setGuesses((prev) => {
            const next = [...prev];
            next[i] = v;
            return next;
          })
        }
        options={OPTIONS}
        index={INDEX}
        onAddGuess={() => setGuesses((prev) => [...prev, ''])}
      />
      <button type="button" onClick={() => onSubmit(guesses.filter(Boolean))}>
        submit
      </button>
    </div>
  );
}

describe('GuessInputs', () => {
  it('renders six guess slots by default', () => {
    render(
      <GuessInputs
        guesses={Array<string>(6).fill('')}
        onChangeGuess={vi.fn()}
        options={OPTIONS}
        index={INDEX}
        onAddGuess={vi.fn()}
      />,
    );
    expect(screen.getAllByRole('combobox')).toHaveLength(6);
  });

  it('"Add guess" appends a slot', async () => {
    const user = userEvent.setup();
    render(<Harness onSubmit={vi.fn()} />);
    expect(screen.getAllByRole('combobox')).toHaveLength(6);
    await user.click(screen.getByRole('button', { name: /add guess/i }));
    expect(screen.getAllByRole('combobox')).toHaveLength(7);
  });

  it('includes a value entered in an added slot on submit (FR-005)', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: /add guess/i }));

    const seventh = screen.getByLabelText('Guess 7');
    await user.click(seventh);
    await user.type(seventh, 'crane');
    await user.keyboard('{Enter}');

    await user.click(screen.getByRole('button', { name: 'submit' }));
    expect(onSubmit).toHaveBeenCalledWith(['crane']);
  });
});
