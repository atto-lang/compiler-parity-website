# TLC toolchain provenance, anti-replay controls and release hold

This is a **source-only verification design**. No actual TLC model checker result
or AttoLang compiler-backed guest result has been observed from the GitHub jobs.

## Pinned stable upstream release

The previous assurance branch used an unreviewed third-party build and then
moved to the **rolling** upstream `v1.8.0` prerelease. Neither is an appropriate
reproducibility baseline without independently verified artifact provenance.
Upstream itself acknowledges that 1.8.0 assets were replaced:
https://github.com/tlaplus/tlaplus/issues/1399

The gate now requires the historic official upstream **v1.7.4** release:

- URL: https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar
- SHA-1 from the official upstream v1.7.4 release notes:
  `bee4a54f3ee3d4afc347c3240ec2d9e93b075104`
- SHA-256 independently recorded for the historical v1.7.4 binary by
  the SourceForge archive: `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`
- Archive reference: https://sourceforge.net/projects/tlaplus.mirror/files/v1.7.4/tla2tools.jar/download
- Also corroborated in a public content-addressed toolchain lock:
  https://github.com/libersoft-org/libersystem/blob/main/toolchain.lock

**This environment has not fetched the JAR.** The published hashes are known,
but actual downloaded bytes and execution must be independently verified in
an authorized runner. Mismatch is a hard failure. Do not silently re-pin the
release, select the rolling prerelease, or use an alternative mirror.

A SHA-1 cross-check is supplemental provenance information, not a substitute
for SHA-256 or a software supply-chain authorization. Running from the official
URL plus matching hashes is not itself a proof of binary trustworthiness.

## Fail-closed execution checks

The TLC job checks out the original PR head, verifies the full Git source tree,
and requires a clean tracked tree. It uses exact run ID, attempt and job identity;
verifies the expected SHA-256 and official release SHA-1; checks that the JAR
contains TLC and SANY classes; and limits each parser/model-checker execution.

The runner enforces the official v1.7.4 SHA-256 **and** SHA-1 constants
inside the shell script, not only in workflow environment variables; callers
cannot substitute their own `EXPECTED_JAR_SHA256`/`EXPECTED_JAR_SHA1` values.
It resolves the verified JAR to an absolute canonical path **before** changing
to `formal/specs` so a relative JAR path cannot point somewhere else at
execution time. Before running TLC, it verifies that every `.tla` and `.cfg`
under the checked directory is a tracked, non-symlink Git file. That protects
the exact-tree claim from injected untracked model inputs or external linked
source files. Furthermore, every such input's on-disk Git blob hash
must equal `HEAD:<path>` directly. This catches an `assume-unchanged` or
`skip-worktree` mutation that a conventional `git status` may omit.
These are source-side checks until a runner actually executes them. The
negative harness now includes **17** admission-rejection cases, including
one test that creates an isolated scratch Git repository and deliberately
mutates an `assume-unchanged` tracked model while Git status stays clean.

The runner clears `completed-source-only.json` **before** validation starts.
It writes the completion record only after five baseline models and three
negative mutation models have finished. All three negative controls must exit
nonzero **and** provide TLC's exact invariant violation plus a reachable state
trace; a parse failure, timeout, tool crash or arbitrary error message cannot
count as a mutation killed.

`tools/test-tlc-assurance-contract.mjs` exercises invalid JAR bytes, missing
attempt, mismatched source head, wrong release digest and stale-receipt rejection,
as **source-only** checks.

## Evidence and unresolved requirements

The uploaded completion record explicitly describes an **unsigned** finite
design-model run (`UNATTESTED_TOOL_RUN`), with actual AttoLang guest execution
`NOT_EXECUTED`. A partial artifact or workflow conclusion does not by itself
prove that models ran. No model has been certified against a real compiler.
There is no unbounded liveness, implementation refinement or cross-backend
guest-parity claim.

Independent security review of the toolchain inputs and an authenticated
stepful exact-head job are required before accepting TLC evidence. The current
GitHub runner-admission problem remains a separate blocker.

## Active reader generation proof obligation

`ActorBorrowGeneration.tla` now carries `readerEpoch`, constrained by `NoOldReader`. A third negative configuration (`ActorBorrowGeneration.read-transfer-mutant.cfg`) deliberately transfers an actor ownership epoch while a shared-reader lease is live. The TLC runner must reject every case except an actual invariant violation with a concrete state trace. This is not a proof of real actor heap transfer or cancellation.
