# TLC toolchain provenance and verification hold

The source-only TLC CI lane must use an actual, independently verified TLA+ Tools binary before any model execution is described as evidence. This document addresses a pre-existing download weakness.

## Official upstream only

TLA+ Tools are maintained at https://github.com/tlaplus/tlaplus and the documented release asset is:

    https://github.com/tlaplus/tlaplus/releases/download/v1.8.0/tla2tools.jar

The earlier workflow used an unverified third-party release, which has been rejected. The official repository reports that the v1.8.0 asset itself was replaced after publication: https://github.com/tlaplus/tlaplus/issues/1399

That upstream issue records a replacement SHA-256 integrity value:

    sha256-4i+P+0us3qCocfRE3ZT+X7DYATsziK456C4m+FLHNdU=

Its hexadecimal decoding is:

    e22f8ffb4bacdea0a871f444dd94fe5fb0d8013b3388ae39e82e26f852c735d5

The workflow treats this as an **observed candidate digest**, not a present-day independently re-downloaded attestation. It refuses to execute TLC if the official download differs. A mutable GitHub release tag is not an immutable artifact; a changed digest is a **security hold**, not a reason to silently update the pin.

Before enabling the TLC result as a required PR gate, an authorized maintainer should independently fetch the upstream artifact, verify the hash, review its provenance, and if policy requires, publish a trusted internal immutable digest-addressed mirror. The live environment used for this hardening could not access the GitHub binary, so no actual TLC parser or model checker was run here.

## CI evidence requirements

The TLC workflow checks out the original PR head and verifies its Git tree, fetches only the official upstream jar, checks the pinned SHA-256, and then runs all five baseline modules plus two expected unsafe actor-borrow mutants. The negative controls are required to produce an *invariant violation*; parse errors, execution errors, timeouts and other nonzero exits do not count.

The script writes a success marker only after all five baselines and both negative controls finish correctly. It always labels its marker `TLC_BOUNDED_MODEL_ONLY`, `UNATTESTED_TOOL_RUN` and `NOT_EXECUTED` for real AttoLang guest execution. A GitHub Actions artifact alone is not an authenticated or independently reviewed receipt.

The separate source-only admission test `tools/test-tlc-assurance-contract.mjs` checks official source selection, digest pinning, original-head checkout, script syntax and failure on a deliberately invalid jar digest. That test does not launch a real model checker.

## Stated limits

Even if TLC succeeds, these finite models do not establish unbounded liveness, implementation refinement, actor runtime isolation, compiler correctness, Java Native Image/AOT behavior, or cross-backend guest parity. Actual `.atto` compiler-backed execution is a separate verification layer.
