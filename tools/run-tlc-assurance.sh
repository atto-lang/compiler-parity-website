#!/usr/bin/env bash
# Source-only independent TLC model checking. No .atto compiler or guest execution.
set -euo pipefail
: "${TLA2TOOLS_JAR:?A verified TLC jar is required}"
: "${EXPECTED_HEAD:?A full immutable source head is required}"
: "${EXPECTED_JAR_SHA256:?A pinned TLC SHA256 is required}"
[[ "$EXPECTED_HEAD" =~ ^[0-9a-f]{40}$ ]] || { echo "Invalid expected source head" >&2; exit 1; }
[[ "$EXPECTED_JAR_SHA256" =~ ^[0-9a-f]{64}$ ]] || { echo "Invalid TLC digest" >&2; exit 1; }
test -f "$TLA2TOOLS_JAR"
test "$(git rev-parse HEAD)" = "$EXPECTED_HEAD"
actual_tree="$(git rev-parse 'HEAD^{tree}')"
test "$(printf '%s' "$actual_tree" | wc -c)" -eq 40
echo "$EXPECTED_JAR_SHA256  $TLA2TOOLS_JAR" | sha256sum -c -
mkdir -p private-artifacts/tlc
printf '{"scope":"TLC_BOUNDED_MODEL_ONLY","guest":"NOT_EXECUTED","head":"%s","tree":"%s","jar_sha256":"%s","run_id":"%s","run_attempt":"%s","job":"%s"}\n' \
  "$EXPECTED_HEAD" "$actual_tree" "$EXPECTED_JAR_SHA256" \
  "$GITHUB_RUN_ID" "$GITHUB_RUN_ATTEMPT" "$GITHUB_JOB" \
  > private-artifacts/tlc/provenance.json

pushd formal/specs >/dev/null
for model in ActorIsolation CancellationAwait HotReloadFencing ReliablePubSub ActorBorrowGeneration; do
  echo "TLC base safety check: $model"
  java -cp "$TLA2TOOLS_JAR" tla2sany.SANY "$model.tla" > "../../private-artifacts/tlc/$model.parse.log" 2>&1
  java -cp "$TLA2TOOLS_JAR" tlc2.TLC -deadlock -workers 1 -config "$model.cfg" "$model.tla" \
    > "../../private-artifacts/tlc/$model.baseline.log" 2>&1
done
for mutation in overlap stale; do
  echo "TLC expected unsafe counterexample: ActorBorrowGeneration/$mutation"
  case "$mutation" in
    overlap) config="ActorBorrowGeneration.overlap-mutant.cfg";;
    stale) config="ActorBorrowGeneration.stale-mutant.cfg";;
  esac
  output="../../private-artifacts/tlc/ActorBorrowGeneration.$mutation.counterexample.log"
  if java -cp "$TLA2TOOLS_JAR" tlc2.TLC -deadlock -workers 1 -config "$config" \
      ActorBorrowGeneration.tla > "$output" 2>&1; then
    echo "Unsafe mutant unexpectedly passed: $mutation" >&2
    exit 1
  fi
  if ! grep -Eiq 'Invariant[[:space:]]+Inv[[:space:]]+is[[:space:]]+violated' "$output"; then
    echo "Mutant failed for another reason, not an invariant counterexample: $mutation" >&2
    exit 1
  fi
done
popd >/dev/null
find private-artifacts/tlc -type f -name '*.log' -print0 | sort -z |
  xargs -0 sha256sum > private-artifacts/tlc/logs.sha256
# This marker is produced only after every baseline and both negative mutants
# passed the expected contract, but it is NOT cryptographically attested.
printf '{"classification":"TLC_BOUNDED_MODEL_ONLY","verification":"UNATTESTED_TOOL_RUN","guest":"NOT_EXECUTED","baseline_models":5,"expected_invariant_counterexamples":2,"source_head":"%s","source_tree":"%s","tool_sha256":"%s","run_id":"%s","run_attempt":"%s","job":"%s"}\n' \
  "$EXPECTED_HEAD" "$actual_tree" "$EXPECTED_JAR_SHA256" \
  "$GITHUB_RUN_ID" "$GITHUB_RUN_ATTEMPT" "$GITHUB_JOB" \
  > private-artifacts/tlc/completed-source-only.json
echo "PASS TLC source-only bounded design models and expected mutant counterexamples."
echo "NOT a real AttoLang compiler execution or guest proof."
