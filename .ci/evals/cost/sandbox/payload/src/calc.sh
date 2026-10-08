#!/bin/sh
# Tiny calculator used as a throwaway target for cost-eval runs.

add() { echo $(( $1 + $2 )); }

case "$1" in
  add) add "$2" "$3";;
  *) echo "usage: calc.sh add <a> <b>" >&2; exit 2;;
esac
