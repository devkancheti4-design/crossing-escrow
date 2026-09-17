#!/usr/bin/env bash
# One command, every proof. Prints one line per check and exits non-zero if any fails.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
mkdir -p docs
fail=0
line() { printf '  %-26s %s\n' "$1" "$2"; }

echo "CROSSING — verify everything"

if ( cd "$ROOT/law" && cc -O2 -Wall -Wextra -Werror -o crossing crossing.c && ./crossing > "$ROOT/docs/harness-output.txt" ); then
  line "C harness" "$(grep -E '^  TOTAL ' "$ROOT/docs/harness-output.txt" | sed 's/^ *//')"
else
  line "C harness" "FAILED (see docs/harness-output.txt)"; fail=1
fi

if ( cd "$ROOT/contracts" && { [ -d node_modules ] || npm install --no-audit --no-fund >/dev/null 2>&1; } && npx hardhat test > "$ROOT/docs/solidity-tests.txt" 2>&1 ); then
  line "Solidity" "$(grep -E 'passing' "$ROOT/docs/solidity-tests.txt" | head -1 | sed 's/^ *//')"
else
  line "Solidity" "FAILED: $(grep -E 'failing' "$ROOT/docs/solidity-tests.txt" | head -1 | sed 's/^ *//')"; fail=1
fi

if ( cd "$ROOT/frontend" && { [ -d node_modules ] || npm install --no-audit --no-fund >/dev/null 2>&1; } && npx vitest run > "$ROOT/docs/ts-tests.txt" 2>&1 ); then
  line "TypeScript port" "$(grep -E '^ +Tests ' "$ROOT/docs/ts-tests.txt" | head -1 | sed 's/^ *//')"
else
  line "TypeScript port" "FAILED (see docs/ts-tests.txt)"; fail=1
fi

if ( cd "$ROOT/frontend" && npx tsc -b > "$ROOT/docs/typecheck.txt" 2>&1 ); then
  line "dApp typecheck" "clean"
else
  line "dApp typecheck" "FAILED (see docs/typecheck.txt)"; fail=1
fi

rm -f "$ROOT/law/crossing"
echo
if [ $fail -eq 0 ]; then echo "  ALL CHECKS PASSED"; else echo "  SOME CHECKS FAILED"; fi
exit $fail
