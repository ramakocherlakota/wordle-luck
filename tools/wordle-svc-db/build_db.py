#!/usr/bin/env python3
"""
Build a wordle-svc SQLite database from an answer list and a guess list.

wordle-svc (github.com/ramakocherlakota/wordle-pal, wordle-svc/) rates a game
from a table holding the score of every guess against every possible answer.
Its own db/create-db.sh loads that table from a precomputed scores file; this
computes the scores itself, so a new pair of lists needs nothing else. The
schema is create-db.sh's, table for table and index for index:

  scores(answer, guess, score)  one row per (answer, guess), score like 'B-W--'
  answers, guesses, responses   the distinct values of each scores column
  log2_lookup(n, log2n)         n * log2(n) is summed to get expected uncertainty

with one deliberate difference: log2_lookup holds base-2 logarithms.
create-db.sh fills it with Perl's log(), which is the natural log, while the
service measures every other uncertainty with math.log(x, 2), so a luck figure
came out as a difference between nats and bits.

Usage (from the repository root; Python 3.8+, standard library only):
  python3 tools/wordle-svc-db/build_db.py \\
      --answers tools/plausible-answers/plausible-answers.txt \\
      --guesses src/data/guesses-v2.ts \\
      --out plausible-wordle.sqlite
"""
import argparse, math, os, re, sqlite3, sys, time
from multiprocessing import Pool


def read_words(path):
    """Five-letter words from a .ts/.js list ('aback',) or a text file (one or
    more per line, # comments allowed, other tokens such as dates ignored)."""
    text = open(path, encoding='utf-8').read()
    if path.endswith(('.ts', '.js')):
        return re.findall(r"""['"]([a-z]{5})['"]""", text)
    words = []
    for line in text.splitlines():
        words += [t for t in line.split('#', 1)[0].split() if re.fullmatch(r'[a-z]{5}', t)]
    return words


def score(answer, guess):
    """Wordle's response, in wordle-svc's notation: B right letter right place,
    W right letter wrong place, - neither. Greens are taken first, then each
    remaining letter of the answer can turn one more guess letter yellow."""
    result = ['-'] * 5
    unmatched = {}
    for i in range(5):
        if guess[i] == answer[i]:
            result[i] = 'B'
        else:
            unmatched[answer[i]] = unmatched.get(answer[i], 0) + 1
    for i in range(5):
        if result[i] == '-' and unmatched.get(guess[i], 0) > 0:
            result[i] = 'W'
            unmatched[guess[i]] -= 1
    return ''.join(result)


_guesses = None


def _init(guesses):
    global _guesses
    _guesses = guesses


def _rows(answer):
    return [(answer, g, score(answer, g)) for g in _guesses]


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[1],
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--answers', required=True, help='the words that can be the answer')
    ap.add_argument('--guesses', required=True, help='the words that can be guessed')
    ap.add_argument('--out', required=True, help='the database file to create')
    args = ap.parse_args()

    if os.path.exists(args.out):
        sys.exit(f'{args.out} already exists')
    answers = sorted(set(read_words(args.answers)))
    # Every answer can be guessed, whether or not the guess list says so.
    guesses = sorted(set(read_words(args.guesses)) | set(answers))
    missing = set(answers) - set(read_words(args.guesses))
    if missing:
        print(f'note: {len(missing)} answers not in the guess list, added as guesses: '
              + ' '.join(sorted(missing)), file=sys.stderr)
    print(f'{len(answers)} answers x {len(guesses)} guesses = {len(answers) * len(guesses):,} scores',
          file=sys.stderr)

    start = time.time()
    db = sqlite3.connect(args.out)
    db.executescript('pragma journal_mode = off; pragma synchronous = off;'
                     'create table scores(answer text, guess text, score text);')
    with Pool(initializer=_init, initargs=(guesses,)) as pool:
        for n, rows in enumerate(pool.imap(_rows, answers, chunksize=8), 1):
            db.executemany('insert into scores values (?, ?, ?)', rows)
            if n % 250 == 0 or n == len(answers):
                print(f'  {n}/{len(answers)} answers scored ({time.time() - start:.0f}s)', file=sys.stderr)
    db.commit()

    print('indexing...', file=sys.stderr)
    db.executescript("""
        create unique index idx_scores_guess_answer on scores(guess, answer);
        create index idx_scores_guess_score on scores(guess, score);
        create table answers(answer text not null primary key);
        insert into answers select distinct answer from scores;
        create table guesses(guess text not null primary key);
        insert into guesses select distinct guess from scores;
        create table responses(score text not null primary key);
        insert into responses select distinct score from scores;
        create table log2_lookup(n int not null primary key, log2n float not null);
    """)
    # As many entries as create-db.sh's, though only n <= len(answers) are used.
    db.executemany('insert into log2_lookup values (?, ?)',
                   [(n, math.log2(n)) for n in range(1, max(20000, len(answers)) + 1)])
    db.commit()
    db.execute('analyze')
    db.commit()
    db.close()
    print(f'wrote {args.out}: {os.path.getsize(args.out) / 1e9:.2f} GB in {time.time() - start:.0f}s',
          file=sys.stderr)


if __name__ == '__main__':
    main()
