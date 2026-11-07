# Actor ownership and borrow safety: bounded design-to-guest contract v1

This is a specification of acceptance, not a claim that the AttoLang compiler has passed it.

## Formal states

TLA+ module \`formal/specs/ActorBorrowGeneration.tla\` and the JS bounded model \`models.actorBorrow\` are designed around a shared abstraction:

- Actor owner A initially, then B after exactly one controlled \`rt take\`.
- Up to two simultaneous readers, with no exclusive writer while either read borrow is active.
- A writer belongs to the actor owning the arena and to the same generation.
- Ownership transfer happens only when there are no active borrows or writer rights.
- A stale owner/writer from generation 0 must not reacquire mutable access in generation 1.

Three unsafe TLA+ configurations must produce reachable invariant counterexamples: \`ActorBorrowGeneration.overlap-mutant.cfg\` and \`ActorBorrowGeneration.stale-mutant.cfg\`. Model-checker receipt checks must distinguish a source-authored TLA+ specification from an actual TLC execution.

## Compiler-backed refinement fixture contract

The portable fixture names, stdout and diagnostics below are **proposed acceptance vectors** until the AttoLang compiler and runtime implementation expose the relevant isolated ownership operations in the canonical .atto grammar. Do not mark them as compiled or executed.

| ID | Kind | Required result | Relevant invariant |
| --- | --- | --- | --- |
| ACT-BORROW-001 | positive | two read borrows can coexist and are released before exclusive write | ACT-01, OWN-01 |
| ACT-BORROW-002 | negative | compile-time rejection of mutable access while a read borrow is active | ACT-01, OWN-01 |
| ACT-BORROW-003 | positive | transferred owner may write after all borrows release | OWN-01, GEN-01 |
| ACT-BORROW-004 | negative | stale actor alias cannot reacquire mutable authority after \`rt take\` | OWN-01, GEN-01 |
| ACT-BORROW-005 | runtime | actor supervisor reclaim after interruption/cancellation never revives stale generation | CANCEL-01, GEN-01 |

Do not invent canonical native AttoLang syntax or pass from a host-side simulation. Each compiler's own executable must compile the same Git blob, produce a recorded output or expected diagnostic, and run any positive program on the intended backend. The backend must report its compiler digest, binary/wasm module digest, actual observed exit code, relevant output digest and run attempt.

## Mandatory evidence fields

- Immutable target repository and full PR head SHA, commit root tree, canonical fixture blob SHA.
- Bounded model version/hash and trace mapping version.
- Compiler/runtime SHA and build toolchain identity per backend.
- Run/job/attempt identity and nonempty executed steps.
- Explicit original checkout HEAD and root tree, compared with expected PR head/tree in the same job.
- Guest binary/module SHA, command invoked, real guest exit code and stdout/stderr hash; compile-negative diagnostic hash.
- Negative mutation receipt demonstrating the gate rejects tampered source/output.
- Independent reviewer assertion, security hold and branch protection.

The dashboard must keep these four independent statuses visible: \`MODEL_SOURCE_ONLY\`, \`MODEL_CHECK_EXECUTED\`, \`COMPILER_BUILD_EXECUTED\`, \`GUEST_EXECUTED\`. Only the last, with separately authenticated provenance, can become a per-backend guest result.

This contract itself is source-authored design evidence. Nothing about inclusion in a PR, passing a mock, or receiving a green run qualifies the five-backend guest result.

The reader-generation abstraction requires `NoOldReader`: active read leases must match the current owner epoch. A transfer while any reader is live is a distinct unsafe mutation and must be caught independently of writer-exclusivity or stale-writer controls.
