"""
AWS Lambda entry point: build plausible-wordle.sqlite and swap it in on EFS.

The function (wordle-db-builder, set up by infra/setup-db-builder.sh) mounts
wordle-svc's EFS access point, and its code bundle carries build_db.py and the
two word lists, so it needs nothing from the network. It builds into /tmp,
which is local disk, then copies the file beside the live one on EFS and
renames it over it, so the service never opens a half-copied database.
infra/deploy-db.sh uploads a fresh bundle and invokes it.
"""
import os, shutil, sqlite3, time

import build_db

HERE = os.path.dirname(os.path.abspath(__file__))
EFS_DIR = os.environ.get('EFS_DIR', '/mnt/efs')
DB_NAME = os.environ.get('DB_NAME', 'plausible-wordle.sqlite')
WORK_DIR = os.environ.get('WORK_DIR', '/tmp/wordle-db')


def handler(event=None, context=None):
    start = time.time()
    if not os.path.ismount(EFS_DIR):
        raise RuntimeError(f'{EFS_DIR} is not mounted: check the function\'s file system configuration')
    # /tmp outlives an invocation on a warm function; start clean.
    shutil.rmtree(WORK_DIR, ignore_errors=True)
    os.makedirs(WORK_DIR)
    try:
        built = os.path.join(WORK_DIR, DB_NAME)
        build_db.build(os.path.join(HERE, 'plausible-answers.txt'),
                       os.path.join(HERE, 'guesses-v2.ts'), built)
        db = sqlite3.connect(f'file:{built}?mode=ro', uri=True)
        answers, = db.execute('select count(*) from answers').fetchone()
        guesses, = db.execute('select count(*) from guesses').fetchone()
        db.close()
        size = os.path.getsize(built)

        live = os.path.join(EFS_DIR, DB_NAME)
        new = live + '.new'
        print(f'copying {size / 1e9:.2f} GB to {new}', flush=True)
        with open(built, 'rb') as src, open(new, 'wb') as dst:
            shutil.copyfileobj(src, dst, 16 << 20)
            dst.flush()
            os.fsync(dst.fileno())
        if os.path.getsize(new) != size:
            raise RuntimeError(f'{new} is {os.path.getsize(new)} bytes, not {size}')
        os.replace(new, live)
        result = {'answers': answers, 'guesses': guesses, 'bytes': size,
                  'seconds': round(time.time() - start)}
        print(f'{live} replaced: {result}', flush=True)
        return result
    finally:
        shutil.rmtree(WORK_DIR, ignore_errors=True)
