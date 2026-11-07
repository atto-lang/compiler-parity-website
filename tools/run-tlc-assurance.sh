#!/usr/bin/env bash
# Finite TLC source model checks. Does not compile or execute AttoLang guests.
set -euo pipefail
umask 077

# Invalidate an earlier success marker even if this attempt fails admission.
rm -f private-artifacts/tlc/completed-source-only.json
: "${TLA2TOOLS_JAR:?A verified TLC jar is required}"
: "${EXPECTED_HEAD:?An immutable 40-hex source HEAD is required}"
: "${EXPECTED_JAR_SHA256:?A pinned jar SHA-256 is required}"
: "${EXPECTED_JAR_SHA1:?A published release SHA-1 is required}"
: "${GITHUB_RUN_ID:?Run identity is required}"
: "${GITHUB_RUN_ATTEMPT:?Run attempt is required}"
: "${GITHUB_JOB:?Job identity is required}"

[[ "$EXPECTED_HEAD" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid source SHA' >&2; exit 1; }
[[ "$EXPECTED_JAR_SHA256" =~ ^[0-9a-f]{64}$ ]] || { echo 'Invalid jar SHA-256' >&2; exit 1; }
[[ "$EXPECTED_JAR_SHA1" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid jar SHA-1' >&2; exit 1; }
[[ "$GITHUB_RUN_ID" =~ ^[1-9][0-9]*$ ]] || { echo 'Invalid run ID' >&2; exit 1; }
[[ "$GITHUB_RUN_ATTEMPT" =~ ^[1-9][0-9]*$ ]] || { echo 'Invalid attempt' >&2; exit 1; }
[[ "$GITHUB_JOB" =~ ^[a-zA-Z0-9_.-]+$ ]] || { echo 'Invalid job identity' >&2; exit 1; }
test -f "$TLA2TOOLS_JAR"
test "$(git rev-parse HEAD)" = "$EXPECTED_HEAD"
test -z "$(git status --porcelain --untracked-files=no)"
actual_tree="$(git rev-parse 'HEAD^{tree}')"
[[ "$actual_tree" =~ ^[0-9a-f]{40}$ ]]
printf '%s  %s\n' "$EXPECTED_JAR_SHA256" "$TLA2TOOLS_JAR" | sha256sum -c -
printf '%s  %s\n' "$EXPECTED_JAR_SHA1" "$TLA2TOOLS_JAR" | sha1sum -c -
jar tf "$TLA2TOOLS_JAR" | grep -Fx 'tlc2/TLC.class' >/dev/null
jar tf "$TLA2TOOLS_JAR" | grep -Fx 'tla2sany/SANY.class' >/dev/null

mkdir -p private-artifacts/tlc
printf '{"scope":"TLC_BOUNDED_MODEL_ONLY","guest":"NOT_EXECUTED","head":"%s","tree":"%s","jar_sha256":"%s","run_id":"%s","run_attempt":"%s","job":"%s"}\n' \
  "$EXPECTED_HEAD" "$actual_tree" "$EXPECTED_JAR_SHA256" \
  "$GITHUB_RUN_ID" "$GITHUB_RUN_ATTEMPT" "$GITHUB_JOB" \
  > private-artifacts/tlc/provenance.json

pushd formal/specs >/dev/null
for model in ActorIsolation CancellationAwait HotReloadFencing ReliablePubSub ActorBorrowGeneration; do
  echo "TLC baseline safety: $model"
  timeout 30s java -cp "$TLA2TOOLS_JAR" tla2sany.SANY "$model.tla" \
    > "../../private-artifacts/tlc/$model.parse.log" 2>&1
  timeout 90s java -cp "$TLA2TOOLS_JAR" tlc2.TLC -deadlock -workers 1 \
    -config "$model.cfg" "$model.tla" \
    > "../../private-artifacts/tlc/$model.baseline.log" 2>&1
done

for mutation in overlap stale; do
  case "$mutation" in
    overlap) config='ActorBorrowGeneration.overlap-mutant.cfg';;
    stale) config='ActorBorrowGeneration.stale-mutant.cfg';;
  esac
  output="../../private-artifacts/tlc/ActorBorrowGeneration.$mutation.counterexample.log"
  status=0
  timeout 90s java -cp "$TLA2TOOLS_JAR" tlc2.TLC -deadlock -workers 1 \
    -config "$config" ActorBorrowGeneration.tla > "$output" 2>&1 || status=$?
  if [[ "$status" -eq 0 || "$status" -eq 124 || "$status" -eq 137 ]]; then
    echo "Mutant passed, hung, or was terminated: $mutation ($status)" >&2
    exit 1
  fi
  # Reject arbitrary nonzero exits, parse errors or tool crashes.
  if ! grep -Fx 'Error: Invariant Inv is violated.' "$output" >/dev/null ||
     ! grep -F 'Error: The behavior up to this point is:' "$output" >/dev/null ||
     ! grep -E '^State 1:' "$output" >/dev/null; then
    echo "No complete invariant counterexample for $mutation ($status)" >&2
    exit 1
  fi
done
popd >/dev/null

find private-artifacts/tlc -type f -name '*.log' -print0 | sort -z |
  xargs -0 sha256sum > private-artifacts/tlc/logs.sha256
# This is a scoped, unsigned report of a completed tool invocation, not proof
# of source-to-runtime refinement or an independently verified guest execution.
printf '{"classification":"TLC_BOUNDED_MODEL_ONLY","verification":"UNATTESTED_TOOL_RUN","guest":"NOT_EXECUTED","baseline_models":5,"expected_invariant_counterexamples":2,"source_head":"%s","source_tree":"%s","tool_sha256":"%s","run_id":"%s","run_attempt":"%s","job":"%s"}\n' \
  "$EXPECTED_HEAD" "$actual_tree" "$EXPECTED_JAR_SHA256" \
  "$GITHUB_RUN_ID" "$GITHUB_RUN_ATTEMPT" "$GITHUB_JOB" \
  > private-artifacts/tlc/completed-source-only.json
echo 'PASS TLC bounded reference safety models and counterexamples (no guest execution)'
