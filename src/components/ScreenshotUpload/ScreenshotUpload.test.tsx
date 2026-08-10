import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  parseScreenshot,
  ScreenshotParseError,
  type ParsedScreenshot,
} from '../../screenshot/parseScreenshot';
import ScreenshotUpload from './ScreenshotUpload';

// Parsing needs a canvas, which jsdom has not got; it is covered directly in
// src/screenshot/*.test.ts against synthetic images.
vi.mock('../../screenshot/parseScreenshot', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../screenshot/parseScreenshot')
  >()),
  parseScreenshot: vi.fn(),
}));

const parseMock = parseScreenshot as Mock;

const PARSED: ParsedScreenshot = {
  target: 'crane',
  guesses: ['adieu', 'crane'],
  unresolved: [],
  patterns: ['w--w-', 'bbbbb'],
};

function imageFile(name = 'wordle.png') {
  return new File(['pixels'], name, { type: 'image/png' });
}

async function upload(file: File) {
  await userEvent.upload(screen.getByLabelText(/upload a screenshot/i), file);
}

/** The drop zone: the input's parent. */
function dropZone(): HTMLElement {
  return screen.getByLabelText(/upload a screenshot/i).parentElement!;
}

function drop(file: File) {
  fireEvent.drop(dropZone(), { dataTransfer: { files: [file] } });
}

beforeEach(() => {
  parseMock.mockReset();
});

describe('ScreenshotUpload', () => {
  it('hands the parsed board to its caller', async () => {
    parseMock.mockResolvedValue(PARSED);
    const onParsed = vi.fn();
    render(<ScreenshotUpload onParsed={onParsed} />);

    await upload(imageFile());

    expect(onParsed).toHaveBeenCalledWith(PARSED);
    expect(await screen.findByRole('status')).toHaveTextContent(
      /read 2 rows.*then submit/i,
    );
  });

  it('says which rows it could not read', async () => {
    parseMock.mockResolvedValue({
      ...PARSED,
      guesses: ['', 'crane'],
      unresolved: [0],
    });
    render(<ScreenshotUpload onParsed={vi.fn()} />);

    await upload(imageFile());

    expect(await screen.findByRole('status')).toHaveTextContent(
      /couldn't read row 1/i,
    );
  });

  it('says when the game has no winning row to take the answer from', async () => {
    parseMock.mockResolvedValue({ ...PARSED, target: '', patterns: ['w--w-'] });
    render(<ScreenshotUpload onParsed={vi.fn()} />);

    await upload(imageFile());

    expect(await screen.findByRole('status')).toHaveTextContent(
      /pick the answer yourself/i,
    );
  });

  it('shows the parse failure verbatim when it explains itself', async () => {
    parseMock.mockRejectedValue(
      new ScreenshotParseError('That looks like a shared results grid.'),
    );
    render(<ScreenshotUpload onParsed={vi.fn()} />);

    await upload(imageFile());

    expect(await screen.findByRole('status')).toHaveTextContent(
      'That looks like a shared results grid.',
    );
  });

  it('falls back to a generic message for an unexpected failure', async () => {
    parseMock.mockRejectedValue(new TypeError('canvas is not a function'));
    const onParsed = vi.fn();
    render(<ScreenshotUpload onParsed={onParsed} />);

    await upload(imageFile());

    expect(await screen.findByRole('status')).toHaveTextContent(
      /couldn't read that image/i,
    );
    expect(await screen.findByRole('status')).not.toHaveTextContent('canvas');
    expect(onParsed).not.toHaveBeenCalled();
  });

  it('accepts a dropped image', async () => {
    parseMock.mockResolvedValue(PARSED);
    const onParsed = vi.fn();
    render(<ScreenshotUpload onParsed={onParsed} />);

    fireEvent.dragOver(dropZone());
    drop(imageFile());

    expect(await screen.findByRole('status')).toHaveTextContent(/read 2 rows/i);
    expect(onParsed).toHaveBeenCalledWith(PARSED);
  });

  it('accepts an image pasted from the clipboard', async () => {
    parseMock.mockResolvedValue(PARSED);
    const onParsed = vi.fn();
    render(<ScreenshotUpload onParsed={onParsed} />);

    fireEvent.paste(document, {
      clipboardData: {
        items: [
          { kind: 'string', type: 'text/plain', getAsFile: () => null },
          { kind: 'file', type: 'image/png', getAsFile: () => imageFile() },
        ],
      },
    });

    expect(await screen.findByRole('status')).toHaveTextContent(/read 2 rows/i);
    expect(onParsed).toHaveBeenCalledWith(PARSED);
  });

  it('rejects a file that is not an image', async () => {
    render(<ScreenshotUpload onParsed={vi.fn()} />);

    drop(new File(['x'], 'notes.txt', { type: 'text/plain' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      /not an image/i,
    );
    expect(parseMock).not.toHaveBeenCalled();
  });

  it('ignores uploads while a rating is in flight', async () => {
    render(<ScreenshotUpload onParsed={vi.fn()} disabled />);
    expect(screen.getByLabelText(/upload a screenshot/i)).toBeDisabled();
  });

  it('keeps only the most recent image when two are dropped in a row', async () => {
    const slow = { ...PARSED, target: 'slate' };
    parseMock
      .mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(() => resolve(slow), 50)),
      )
      .mockResolvedValueOnce(PARSED);
    const onParsed = vi.fn();
    render(<ScreenshotUpload onParsed={onParsed} />);

    drop(imageFile('first.png'));
    drop(imageFile('second.png'));

    expect(await screen.findByRole('status')).toHaveTextContent(/read 2 rows/i);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(onParsed).toHaveBeenCalledTimes(1);
    expect(onParsed).toHaveBeenCalledWith(PARSED);
  });
});
