#!/bin/sh
# Tests for src/calc.sh. Runs all checks; exits non-zero if any fail.
set -u

DIR=$(cd "$(dirname "$0")" && pwd)
FAILED=0

check() {
  expected=$1; shift
  actual=$(sh "$DIR/src/calc.sh" "$@" 2>/dev/null)
  if [ "$actual" = "$expected" ]; then
    printf 'ok   %s -> %s\n' "$*" "$actual"
  else
    printf 'FAIL %s -> %s (expected %s)\n' "$*" "$actual" "$expected"
    FAILED=1
  fi
}

check 3 add 1 2
check 0 add -2 2
check 10 add 7 3

if sh "$DIR/src/calc.sh" bogus >/dev/null 2>&1; then
  printf 'FAIL unknown command should exit non-zero\n'
  FAILED=1
else
  printf 'ok   unknown command exits non-zero\n'
fi

exit "$FAILED"
