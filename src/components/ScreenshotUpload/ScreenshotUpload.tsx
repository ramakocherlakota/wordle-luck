import { useEffect, useId, useRef, useState } from 'react';
import {
  parseScreenshot,
  ScreenshotParseError,
  type ParsedScreenshot,
} from '../../screenshot/parseScreenshot';
import styles from './ScreenshotUpload.module.css';

export interface ScreenshotUploadProps {
  /** Called with the board read from the image, to fill the inputs below. */
  onParsed: (parsed: ParsedScreenshot) => void;
  /** Suppressed while a rating request is in flight. */
  disabled?: boolean;
}

type Status = 'idle' | 'parsing' | 'error' | 'done';

const GENERIC_ERROR = "Couldn't read that image. Try another screenshot.";

/**
 * Drop zone that fills the target and guesses from a screenshot of a finished
 * game. Accepts a file, a drag-and-drop, or a paste, then shows the board it
 * read back so the user can check it before submitting.
 */
export default function ScreenshotUpload({
  onParsed,
  disabled,
}: ScreenshotUploadProps) {
  const inputId = `screenshot-${useId()}`;
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');
  const [parsed, setParsed] = useState<ParsedScreenshot | null>(null);
  const [dragging, setDragging] = useState(false);
  // Ignore a slow parse whose result arrived after another image was dropped.
  const runId = useRef(0);

  async function handleFile(file: File | null | undefined) {
    if (!file || disabled) return;
    if (!file.type.startsWith('image/')) {
      setStatus('error');
      setMessage('That file is not an image.');
      return;
    }

    const run = ++runId.current;
    setStatus('parsing');
    setMessage('');
    setParsed(null);
    try {
      const result = await parseScreenshot(file);
      if (run !== runId.current) return;
      setParsed(result);
      setStatus('done');
      onParsed(result);
    } catch (err) {
      if (run !== runId.current) return;
      setStatus('error');
      setMessage(
        err instanceof ScreenshotParseError ? err.message : GENERIC_ERROR,
      );
    }
  }

  // Pasting a screenshot straight from the clipboard is the fastest path on
  // desktop, so listen document-wide rather than only when the zone has focus.
  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const file = [...(event.clipboardData?.items ?? [])]
        .find((item) => item.kind === 'file' && item.type.startsWith('image/'))
        ?.getAsFile();
      if (file) {
        event.preventDefault();
        void handleFile(file);
      }
    }
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  });

  return (
    <div className={styles.root}>
      <div
        className={`${styles.zone} ${dragging ? styles.dragging : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFile(e.dataTransfer.files[0]);
        }}
      >
        <input
          id={inputId}
          className={styles.srOnly}
          type="file"
          accept="image/*"
          disabled={disabled || status === 'parsing'}
          onChange={(e) => {
            void handleFile(e.target.files?.[0]);
            // Allow re-picking the same file after a failed read.
            e.target.value = '';
          }}
        />
        {/* Deliberately a fixed label: progress belongs in the status region
            below, and a control that renames itself mid-action is hard to
            follow — for a screen reader above all. */}
        <label htmlFor={inputId} className={styles.button}>
          Upload Screenshot
        </label>
      </div>

      <div role="status" aria-live="polite" className={styles.feedback}>
        {status === 'parsing' && (
          <p className={styles.parsing}>Reading the screenshot…</p>
        )}

        {status === 'error' && <p className={styles.error}>{message}</p>}

        {status === 'done' && parsed && (
          <div className={styles.result}>
            <div className={styles.board} aria-hidden="true">
              {parsed.patterns.map((pattern, i) => (
                <div key={i} className={styles.boardRow}>
                  {[0, 1, 2, 3, 4].map((j) => (
                    <span
                      key={j}
                      className={`${styles.tile} ${styles[colorClass(pattern[j])]}`}
                    >
                      {parsed.guesses[i]?.[j] ?? ''}
                    </span>
                  ))}
                </div>
              ))}
            </div>
            <p className={styles.summary}>{summarize(parsed)}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function colorClass(
  symbol: string | undefined,
): 'correct' | 'present' | 'absent' {
  return symbol === 'b' ? 'correct' : symbol === 'w' ? 'present' : 'absent';
}

/** Plain-language account of what was filled in, and what wasn't. */
function summarize(parsed: ParsedScreenshot): string {
  const rows = parsed.patterns.length;
  const problems: string[] = [];
  if (parsed.target === '') {
    problems.push('no winning row, so pick the answer yourself');
  } else if (!parsed.targetIsAnswer) {
    problems.push(
      `the answer reads as “${parsed.target}”, which is not on the answer list, so pick the answer yourself`,
    );
  }
  if (parsed.unresolved.length > 0) {
    const list = parsed.unresolved.map((i) => i + 1).join(', ');
    problems.push(
      `couldn't read ${parsed.unresolved.length === 1 ? 'row' : 'rows'} ${list}`,
    );
  }
  const read = `Read ${rows} ${rows === 1 ? 'row' : 'rows'}`;
  return problems.length === 0
    ? `${read}. Check them below, then Submit.`
    : `${read}, but ${problems.join(' and ')}. Fix anything wrong below.`;
}
