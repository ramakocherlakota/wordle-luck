#!/usr/bin/env python3
"""
Build a wordle-svc SQLite database from an answer list and a guess list.

wordle-svc (github.com/ramakocherlakota/wordle-pal, wordle-svc/) rates a game
from a table holding the score of every guess against every possible answer.
Its own db/create-db.sh loads that table from a precomputed scores file; this
computes the scores itself, so a new pair of lists needs nothing else. The
tables and columns are create-db.sh's, so the service's queries run unchanged:

  scores(answer, guess, score)  one row per (answer, guess), score like 'B-W--'
  answers, guesses, responses   the distinct values of each scores column
  log2_lookup(n, log2n)         n * log2(n) is summed to get expected uncertainty

with two deliberate differences.

The scores are laid out for EFS, where the service reads them and every page
read is a network round trip. create-db.sh's table keeps each score apart from
the indexes that find it, so rating one guess against every answer took a
separate read per answer, thousands per request. Here scores is clustered on
(guess, answer), so all of a guess's rows sit together with their scores, and
the (guess, score) index carries the answer too. With 64 KB pages, a guess's
rows take a page or two. --layout rowid builds create-db.sh's layout instead,
for comparison.

WITHOUT ROWID tables need SQLite 3.8.2 or later to read. On Lambda that means
the python3.12 runtime or later: python3.11 and earlier run on Amazon Linux 2,
whose SQLite is 3.7.17, and every query fails with "malformed database schema
(scores) - near "without": syntax error". --layout rowid makes a file that
SQLite reads too.

log2_lookup holds base-2 logarithms. create-db.sh fills it with Perl's log(),
which is the natural log, while the service measures every other uncertainty
with math.log(x, 2), so a luck figure came out as a difference between nats
and bits.

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


_answers = None


def _init(answers):
    global _answers
    _answers = answers


def _rows(guess):
    return [(a, guess, score(a, guess)) for a in _answers]


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[1],
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--answers', required=True, help='the words that can be the answer')
    ap.add_argument('--guesses', required=True, help='the words that can be guessed')
    ap.add_argument('--out', required=True, help='the database file to create')
    ap.add_argument('--page-size', type=int, default=65536,
                    help='SQLite page size in bytes (default 65536; see the docstring)')
    ap.add_argument('--layout', choices=['clustered', 'rowid'], default='clustered',
                    help="clustered (default) or rowid, create-db.sh's layout")
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
    db.execute(f'pragma page_size = {args.page_size}')
    db.executescript('pragma journal_mode = off; pragma synchronous = off; pragma cache_size = -1000000;')
    if args.layout == 'clustered':
        db.execute('create table scores(answer text, guess text, score text, '
                   'primary key (guess, answer)) without rowid')
    else:
        db.execute('create table scores(answer text, guess text, score text)')
    # Guess by guess, answers in order: the primary key's own order, so the
    # clustered table is written front to back instead of all over.
    with Pool(initializer=_init, initargs=(answers,)) as pool:
        for n, rows in enumerate(pool.imap(_rows, guesses, chunksize=16), 1):
            db.executemany('insert into scores values (?, ?, ?)', rows)
            if n % 2500 == 0 or n == len(guesses):
                print(f'  {n}/{len(guesses)} guesses scored ({time.time() - start:.0f}s)', file=sys.stderr)
    db.commit()

    print('indexing...', file=sys.stderr)
    if args.layout == 'clustered':
        db.execute('create index idx_scores_guess_score on scores(guess, score)')
    else:
        db.executescript('create unique index idx_scores_guess_answer on scores(guess, answer);'
                         'create index idx_scores_guess_score on scores(guess, score);')
    db.executescript("""
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
