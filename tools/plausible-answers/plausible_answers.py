#!/usr/bin/env python3
"""
Decide which allowed Wordle guesses are plausible answers.

Wordle accepts ~15,000 guesses but chooses answers from a much smaller set of
ordinary words. Which words count as ordinary is a human editor's call, so
rather than hand-tune rules, learn the call from the answers the editors have
already chosen, and apply it to any new guess list. It works in two stages,
because some exclusions are categorical and no amount of frequency should
override them.

  1. Eligibility. Hard rules, each measured against the known answers for
     what it costs (see README.md). A candidate must be a lowercase
     dictionary word: in WordNet, in the Unix word list NLTK ships as
     `words`, or an inflection WordNet recognises (wider, began, women). That
     one rule shuts out names (james), slang (gonna) and junk (padou) at
     once. It must not be a first name (NLTK's `names`) unless WordNet has it
     lowercase, because the Unix list keeps many names for some obscure
     common noun (colin, a quail). It must not be a regular plural (cats) or
     a regular past tense (baked, though dried is fine), which the editors
     have all but never picked. Not a word whose every sense WordNet marks
     offensive, and not on the blocklist.

  2. Ranking. Among eligible words, a logistic regression on how common the
     word is (wordfreq), how often it appears in sense-tagged text, how many
     senses it has, its parts of speech, and how often it is written as a name
     (capitalised mid-sentence in NLTK's cased corpora) gives each a
     probability of being picked. It is trained on every known answer, from
     --answers and --history, against the eligible words never picked.

  3. Threshold. Cross-validated scores on the known answers set the cut: by
     default, admit a word if it looks at least as answer-like as the least
     answer-like 1% of real answers did to a model that never saw them.

  4. Output. Known answers, past answers, words on the allow list, and every
     eligible word above the threshold. Separately, review.txt lists common
     words that fail only the headword test, because the dictionary predates
     them (login, ramen, emoji) or they are slang (gonna): a person has to tell
     those apart, and promote the real ones through the allow list.

When there is a new guess list, rerun this with it as --guesses. When new
answers are announced, add them to --history: they are always included, and
the report says how many of the past answers the cross-validated model would
have admitted unaided, which is the honest test of the threshold.

Usage (from the repository root):
  python3 -m venv .venv            # Python 3.10 or later
  .venv/bin/python -m pip install -r tools/plausible-answers/requirements.txt
  .venv/bin/python tools/plausible-answers/plausible_answers.py \\
      --guesses src/data/guesses-v2.ts \\
      --answers src/data/answers.ts --pool src/data/guesses.ts \\
      --history tools/plausible-answers/nyt-answers.txt \\
      --block tools/plausible-answers/blocklist.txt \\
      --allow tools/plausible-answers/allowlist.txt \\
      --out tools/plausible-answers
"""
import argparse, collections, csv, math, os, re, sys

try:
    import nltk, numpy as np, sklearn, wordfreq  # noqa: F401
except ModuleNotFoundError as e:
    # Usually pip installed into a different Python from the one running this.
    sys.exit(f"No module named '{e.name}' in {sys.executable}. Install the requirements into this\n"
             f"same Python:\n  {sys.executable} -m pip install -r "
             f"{os.path.join(os.path.dirname(os.path.abspath(__file__)), 'requirements.txt')}")

SENTENCE_START = {'.', '!', '?', ':', ';', '"', "''", '``'}
OFFENSIVE = re.compile(r'\b(offensive|obscene|vulgar|slur|disparaging|derogatory|contemptuous)\b')


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


def nltk_corpus(name):
    import nltk
    try:
        nltk.data.find(('corpora/' if name != 'punkt_tab' else 'tokenizers/') + name)
    except LookupError:
        nltk.download(name, quiet=True)


class Features:
    STEM_MIN = 2.0  # a stem must be at least this common (Zipf) to count as a word

    def __init__(self):
        from wordfreq import zipf_frequency
        for name in ('wordnet', 'words', 'names', 'brown', 'reuters', 'gutenberg', 'webtext'):
            nltk_corpus(name)
        from nltk.corpus import names as first_names, wordnet, words
        self.zipf = lambda w: zipf_frequency(w, 'en')
        self.wn = wordnet
        names = [l.name() for s in wordnet.all_synsets() for l in s.lemmas()]
        self.wordnet = {n for n in names if n.islower()}
        # WordNet alone misses a fair number of answers (loris, kefir, grift,
        # atria); the older, larger Unix list has them, and keeps case too.
        self.lower = self.wordnet | {w for w in words.words() if w.islower()}
        self.first_names = {n.lower() for n in first_names.words()}
        self.titled, self.seen = self._name_counts()

    @staticmethod
    def _name_counts():
        """Per five-letter word: how often it is Titlecase mid-sentence (a name)
        and how often it appears at all. All-caps tokens (headlines) and
        sentence-initial ones say nothing either way and are skipped."""
        from nltk.corpus import brown, gutenberg, reuters, webtext
        titled, seen = collections.Counter(), collections.Counter()
        for corpus in (brown, reuters, gutenberg, webtext):
            prev = '.'
            for tok in corpus.words():
                if len(tok) == 5 and tok.isalpha() and tok.isascii() and not tok.isupper():
                    low = tok.lower()
                    seen[low] += 1
                    if tok[0].isupper() and tok[1:].islower() and prev not in SENTENCE_START:
                        titled[low] += 1
                prev = tok
        return titled, seen

    def name_rate(self, w, prior=0.1, weight=3):
        # Smoothed toward a common word's rate, so a word seen twice is not
        # judged a name on the strength of one capital letter.
        return (self.titled[w] + weight * prior) / (self.seen[w] + weight)

    def name_confidence(self, w, z=1.64):
        # Lower confidence bound on the name rate (Wilson): high only for a
        # word seen often and nearly always capitalised (japan, henry).
        k, n = self.titled[w], self.seen[w]
        if not n:
            return 0.0
        p = k / n
        return (p + z * z / (2 * n) - z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / (1 + z * z / n)

    def is_stem(self, s, w):
        # Relative to w, so that names and abbreviations which happen to spell
        # a word's first letters (bree/breed, chao/chaos) do not pass as stems.
        z = self.zipf(s)
        return len(s) >= 2 and z >= self.STEM_MIN and z >= self.zipf(w) - 0.5

    def plural_shape(self, w):
        # Regular plurals only: irregular ones (women, geese) are answers.
        if not w.endswith('s') or w.endswith('ss'):
            return False
        if self.wn.morphy(w, 'n') in (w[:-1], w[:-2], w[:-3] + 'y', w[:-3] + 'f', w[:-3] + 'fe'):
            return True  # the dictionary says so (menus, gurus, wives)
        if w.endswith(('us', 'is')):
            return False
        return ((w.endswith('ies') and self.is_stem(w[:-3] + 'y', w))
                or (w.endswith('es') and self.is_stem(w[:-2], w))
                or self.is_stem(w[:-1], w))

    def past_shape(self, w):
        # Regular past tenses only: irregular ones (wrote, began) are answers.
        # So are half the -ied ones (dried, fried, tried), so those pass too.
        if not w.endswith('ed') or w.endswith('ied'):
            return False
        return self.is_stem(w[:-1], w) or self.is_stem(w[:-2], w)

    def inflection(self, w):
        # Comparatives and irregular forms of a dictionary word (wider, began,
        # women), which neither word list has as entries in their own right.
        return any(m != w and m in self.wordnet
                   for m in {self.wn.morphy(w, p) for p in 'nvar'} - {None})

    def comparative_shape(self, w):
        if not w.endswith(('er', 'st')):
            return False
        stem = w[:-2] if w.endswith('er') else w[:-3]
        return any(s.pos() in ('a', 's') for t in (stem, stem + 'e') for s in self.wn.synsets(t))

    def __call__(self, w):
        synsets = self.wn.synsets(w)
        pos = {s.pos() for s in synsets}
        own = [(s, l) for s in synsets for l in s.lemmas() if l.name() == w]
        capital = [l for s in synsets for l in s.lemmas()
                   if l.name().lower() == w and not l.name().islower()]
        return {
            # eligibility
            'headword': w in self.lower or self.inflection(w),
            'in_wordnet': w in self.wordnet,
            'first_name': w in self.first_names,
            'plural_shape': self.plural_shape(w),
            'past_shape': self.past_shape(w),
            'offensive': bool(own) and all(OFFENSIVE.search(s.definition()) for s, _ in own),
            # ranking
            'zipf': self.zipf(w),
            'log_semcor': math.log1p(sum(l.count() for _, l in own)),
            'log_senses': math.log1p(len(synsets)),
            'noun': 'n' in pos, 'verb': 'v' in pos,
            'adj': bool(pos & {'a', 's'}), 'adv': 'r' in pos,
            'name_share': len(capital) / max(1, len(capital) + len(own)),
            'name_rate': self.name_rate(w),
            'name_confidence': self.name_confidence(w),
            'comparative_shape': self.comparative_shape(w),
        }


RANKING = ['zipf', 'in_wordnet', 'log_semcor', 'log_senses', 'noun', 'verb', 'adj', 'adv',
           'first_name', 'name_share', 'name_rate', 'name_confidence', 'comparative_shape']


def is_name(f):
    return f['first_name'] and not f['in_wordnet']


def eligible(f, blocked):
    return (f['headword'] and not is_name(f) and not f['plural_shape'] and not f['past_shape']
            and not f['offensive'] and not blocked)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[1],
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--guesses', required=True, help='the guess list to choose plausible answers from')
    ap.add_argument('--answers', required=True, help='a known answer list')
    ap.add_argument('--pool', required=True,
                    help='the guess list --answers was chosen from (where the negatives come from)')
    ap.add_argument('--history', help='past answers (dates allowed): always included, and trained on')
    ap.add_argument('--block', help='words never to admit, one per line')
    ap.add_argument('--allow', help='words to admit regardless of rules and score, one per line')
    ap.add_argument('--recall', type=float, default=0.99,
                    help='share of known answers the threshold must keep (default 0.99)')
    ap.add_argument('--out', default='.', help='directory for plausible-answers.txt, review.txt, scores.csv')
    args = ap.parse_args()

    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import roc_auc_score
    from sklearn.model_selection import cross_val_predict
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler

    guesses = sorted(set(read_words(args.guesses)))
    answers = set(read_words(args.answers))
    history = set(read_words(args.history)) if args.history else set()
    blocked = set(read_words(args.block)) if args.block else set()
    allowed = set(read_words(args.allow)) if args.allow else set()
    known = answers | history
    pool = sorted(set(read_words(args.pool)) | known)

    print('loading word data...', file=sys.stderr)
    feat = Features()
    F = {w: feat(w) for w in set(guesses) | set(pool)}
    X = lambda ws: np.array([[float(F[w][k]) for k in RANKING] for w in ws])

    # Train on eligible words only: the rules have already decided the rest.
    train = [w for w in pool if eligible(F[w], w in blocked)]
    y = np.array([w in known for w in train], dtype=int)
    model = make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000))
    cv = dict(zip(train, cross_val_predict(model, X(train), y, cv=10, method='predict_proba')[:, 1]))
    threshold = float(np.quantile([cv[w] for w in train if w in known], 1 - args.recall))
    model.fit(X(train), y)
    score = dict(zip(guesses, model.predict_proba(X(guesses))[:, 1]))

    def verdict(w):
        if w in answers: return 'known answer'
        if w in history: return 'past answer'
        if w in allowed: return 'allowed'
        if w in blocked: return 'blocked'
        f = F[w]
        if f['offensive']: return 'offensive'
        if f['plural_shape']: return 'plural'
        if f['past_shape']: return 'past tense'
        if not f['headword']: return 'not a headword'
        if is_name(f): return 'first name'
        return 'model' if score[w] >= threshold else 'below threshold'

    INCLUDED = ('known answer', 'past answer', 'allowed', 'model')
    v = {w: verdict(w) for w in guesses}
    plausible = sorted(w for w in guesses if v[w] in INCLUDED)
    # Common words failing only the headword test: a person must judge these.
    review = sorted((w for w in guesses if v[w] == 'not a headword'
                     and F[w]['zipf'] >= 3.0 and F[w]['name_rate'] < 0.5),
                    key=lambda w: -F[w]['zipf'])

    os.makedirs(args.out, exist_ok=True)
    stamp = f'Generated by tools/plausible-answers/plausible_answers.py from {os.path.basename(args.guesses)}; do not edit by hand.'
    with open(os.path.join(args.out, 'plausible-answers.txt'), 'w') as f:
        f.write(f'# {len(plausible)} plausible Wordle answers. {stamp}\n' + '\n'.join(plausible) + '\n')
    with open(os.path.join(args.out, 'review.txt'), 'w') as f:
        f.write('# Common words that fail only the dictionary-headword test: too new for the\n'
                '# dictionary (login, ramen), or slang (gonna). Copy any real answer candidates\n'
                f'# into the allow list. {stamp}\n' + '\n'.join(review) + '\n')
    with open(os.path.join(args.out, 'scores.csv'), 'w', newline='') as f:
        out = csv.writer(f)
        out.writerow(['word', 'score', 'verdict'] + list(F[guesses[0]]))
        for w in sorted(guesses, key=lambda w: -score[w]):
            out.writerow([w, f'{score[w]:.4f}', v[w]] +
                         [f'{x:.3f}' if isinstance(x, float) else int(x) for x in F[w].values()])

    counts = collections.Counter(v.values())
    print(f'cross-validated AUC among eligible words: {roc_auc_score(y, [cv[w] for w in train]):.3f}')
    print(f'threshold {threshold:.3f} keeps {args.recall:.0%} of known answers under cross-validation')
    print(f'{len(plausible)} plausible answers out of {len(guesses)} guesses: '
          + ', '.join(f'{counts[k]} {k}' for k in INCLUDED if counts[k]))
    print('excluded: ' + ', '.join(f'{n} {k}' for k, n in counts.most_common() if k not in INCLUDED))
    print(f'{len(review)} words for review in review.txt')
    beyond = sorted(history - answers)
    # How the size of the list trades against what it catches, to pick --recall by.
    print('recall  threshold  new words admitted' + ('  past answers beyond --answers caught' if beyond else ''))
    for r in (0.90, 0.95, 0.97, 0.98, 0.99, 0.995):
        t = float(np.quantile([cv[w] for w in train if w in known], 1 - r))
        n = sum(v[w] in ('model', 'below threshold') and score[w] >= t for w in guesses)
        line = f'{r:6.1%}  {t:9.3f}  {n:18d}'
        if beyond:
            c = sum(cv.get(w, -1) >= t for w in beyond)
            line += f'  {c:4d} of {len(beyond)} ({c / len(beyond):.0%})'
        print(line)
    if beyond:
        # cv scores come from models that never saw the word: an honest test.
        caught = [w for w in beyond if w in cv and cv[w] >= threshold]
        missed = sorted(set(beyond) - set(caught), key=lambda w: cv.get(w, 0))
        print(f'past answers beyond --answers: {len(beyond)}; the cross-validated model would have'
              f' admitted {len(caught)} ({len(caught) / len(beyond):.0%})')
        if missed:
            print('  missed:', ' '.join(f'{w}:{cv[w]:.2f}' if w in cv else f'{w}:ineligible' for w in missed))


if __name__ == '__main__':
    main()
