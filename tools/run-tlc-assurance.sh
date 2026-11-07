#!/usr/bin/env bash
# Finite TLC source model checks. Does not compile or execute AttoLang guests.
set -euo pipefail
umask 077

# The published v1.7.4 release digests are immutable toolchain policy,
# not values a caller is allowed to re-pin through the environment.
readonly TLC_174_SHA256='936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88'
readonly TLC_174_SHA1='bee4a54f3ee3d4afc347c3240ec2d9e93b075104'

# A reused workspace must never contribute previous logs or completion markers.
# This path is a repository-local generated-artifact directory, not user data.
rm -rf -- private-artifacts/tlc
mkdir -p private-artifacts/tlc
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
[[ "$EXPECTED_JAR_SHA256" == "$TLC_174_SHA256" ]] ||
  { echo 'UNAUTHORIZED_TLC_SHA256_REPIN' >&2; exit 1; }
[[ "$EXPECTED_JAR_SHA1" == "$TLC_174_SHA1" ]] ||
  { echo 'UNAUTHORIZED_TLC_SHA1_REPIN' >&2; exit 1; }
[[ "$GITHUB_RUN_ID" =~ ^[1-9][0-9]*$ ]] || { echo 'Invalid run ID' >&2; exit 1; }
[[ "$GITHUB_RUN_ATTEMPT" =~ ^[1-9][0-9]*$ ]] || { echo 'Invalid attempt' >&2; exit 1; }
[[ "$GITHUB_JOB" =~ ^[a-zA-Z0-9_.-]+$ ]] || { echo 'Invalid job identity' >&2; exit 1; }
if [[ ! -f "$TLA2TOOLS_JAR" ]]; then
  echo "TLC_JAR_MISSING" >&2
  exit 1
fi
# The script changes directory to formal/specs below. A caller-supplied
# relative JAR path would otherwise resolve under the WRONG directory.
TLA2TOOLS_JAR="$(realpath -e -- "$TLA2TOOLS_JAR")"
[[ "$TLA2TOOLS_JAR" = /* ]] ||
  { echo 'TLC_JAR_NOT_ABSOLUTE' >&2; exit 1; }
if [[ "$(git rev-parse HEAD)" != "$EXPECTED_HEAD" ]]; then
  echo "SOURCE_HEAD_MISMATCH" >&2
  exit 1
fi
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "TRACKED_SOURCE_DIRTY" >&2
  exit 1
fi
# Untracked or symlinked TLA/config inputs can change model behavior while
# HEAD and the tracked-tree identity stay unchanged. Reject all such inputs.
for model_input in formal/specs/*.tla formal/specs/*.cfg; do
  if [[ ! -f "$model_input" || -L "$model_input" ]] ||
     ! git ls-files --error-unmatch -- "$model_input" >/dev/null 2>&1; then
    echo "UNTRACKED_MODEL_INPUT: $model_input" >&2
    exit 1
  fi
done
actual_tree="$(git rev-parse 'HEAD^{tree}')"
[[ "$actual_tree" =~ ^[0-9a-f]{40}$ ]]
printf '%s  %s\n' "$EXPECTED_JAR_SHA256" "$TLA2TOOLS_JAR" | sha256sum -c -
printf '%s  %s\n' "$EXPECTED_JAR_SHA1" "$TLA2TOOLS_JAR" | sha1sum -c -
jar tf "$TLA2TOOLS_JAR" | grep -Fx 'tlc2/TLC.class' >/dev/null
jar tf "$TLA2TOOLS_JAR" | grep -Fx 'tla2sany/SANY.class' >/dev/null

# Bind model/config source files and runner to the immutable checkout.
# Include all source fixtures in the receipt, not just generated logs.
sha256sum formal/specs/*.tla formal/specs/*.cfg tools/run-tlc-assurance.sh \
  > private-artifacts/tlc/model-inputs.sha256
java -version > private-artifacts/tlc/java-version.txt 2>&1
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

for mutation in overlap stale read-transfer; do
  case "$mutation" in
    overlap) config='ActorBorrowGeneration.overlap-mutant.cfg';;
    stale) config='ActorBorrowGeneration.stale-mutant.cfg';;
    read-transfer) config='ActorBorrowGeneration.read-transfer-mutant.cfg';;
  esac
  output="../../private-artifacts/tlc/ActorBorrowGeneration.$mutation.counterexample.log"
  status=0
  timeout 90s java -cp "$TLA2TOOLS_JAR" tlc2.TLC -deadlock -workers 1 \
    -config "$config" ActorBorrowGeneration.tla > "$output" 2>&1 || status=$?
  if [[ "$status" -eq 0 || "$status" -ge 124 ]]; then
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
printf '{"classification":"TLC_BOUNDED_MODEL_ONLY","verification":"UNATTESTED_TOOL_RUN","guest":"NOT_EXECUTED","baseline_models":5,"expected_invariant_counterexamples":3,"source_head":"%s","source_tree":"%s","tool_sha256":"%s","run_id":"%s","run_attempt":"%s","job":"%s"}\n' \
  "$EXPECTED_HEAD" "$actual_tree" "$EXPECTED_JAR_SHA256" \
  "$GITHUB_RUN_ID" "$GITHUB_RUN_ATTEMPT" "$GITHUB_JOB" \
  > private-artifacts/tlc/completed-source-only.json
echo 'PASS TLC bounded reference safety models and counterexamples (no guest execution)'
