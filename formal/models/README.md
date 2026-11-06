# Executable bounded safety models — AttoLang design checks

This directory introduces small, executable finite-state safety models as a first formalization bridge. Run:

    node formal/models/check-bounded-safety.cjs

Use Node 22. The JSON report includes exact reachable-state and transition counts, explicit bounds, and shortest counterexample traces for negative mutations.

These are **bounded design checks**. They do not prove unbounded behavior, temporal fairness, compiled AttoLang execution, real actor runtime semantics, production refinement, or five-backend parity.

## Model 1 — ACT-01 / OWN-01

A single arena has one active actor owner (A initially, then B after one transfer), up to two reader borrows, at most one exclusive writer, and generations 0/1. Actions acquire/release read and write rights and transfer ownership only when quiescent.

Invariants: no simultaneous writer and readers; reader count within bound; writer belongs to current owner; writer generation matches the active arena generation.

Required counterexamples: mutant permits a writer while readers exist; mutant permits an old-generation writer after ownership transfer.

Limitations: atomic actions only, no actor scheduler, OS threads, memory reclamation, compiler borrow checker, exception unwinding, or suspended continuation semantics.

## Model 2 — PUB-01 / CANCEL-01 / GEN-01

Two publishers, at most two sequence numbers per publisher per generation, a single-slot subscription queue, and two subscription generations. Transitions publish, commit delivery+ACK, cancel and clear a queued message, leave/rejoin into the next generation, and close the group.

Invariants: ACK never precedes committed delivery; queued generations never become stale; cancelled publishers have no outstanding queued message; sequence bounds hold; committed delivery is neither duplicated nor out-of-order in the abstract trace; closed groups have no queued delivery.

Required counterexamples: ACK before commit, retained old-generation queue after rejoin, retained cancelled publisher queue.

Limitations: atomic delivery+ACK, no crash/recovery, no network protocol, no multi-subscriber quorum. **Cancellation safety** is checked; eventual unblock, starvation-freedom and temporal liveness still need fairness assumptions and scheduler models.

## Reproducibility and evidence class

The checker performs breadth-first reachable-state enumeration, deduplicates JSON state encodings, and caps exploration at **60,000** states. Reaching that cap is not a pass. Any baseline invariant violation, explored-bound exhaustion, or surviving unsafe mutation makes the command fail.

Local isolated source-level evaluation explored:

| Model | States | Edges |
| --- | ---: | ---: |
| Actor isolation | 8 | 13 |
| RELIABLE pub-sub / cancel / rejoin | 384 | 600 |

Five deliberately unsafe mutations produced finite shortest counterexample traces. These counts reflect an isolated source-only evaluator; hosted Actions and original-head checkout receipts are separately unverified until the corresponding jobs really execute.

When admitted, CI uploads an assurance-model-results.json artifact with classification BOUNDED_DESIGN_MODEL_ONLY. The dashboard treats an imported report as an unauthenticated browser claim; it is never promoted to a compiler-backed guest result.

## Required refinements

1. Map model transitions to exact portable .atto fixtures with positive and compile-negative cases.
2. Execute matching traces using Java/GraalVM, LLVM, .NET NativeAOT, Wasm and Forge/Cranelift and retain separate receipts.
3. Add temporal cancellation/interruption liveness, scheduler fairness and per-tenant quota models.
4. Cross-check the design with a second formal checker such as TLC, Apalache or Alloy before claiming stronger assurance.
5. Bind compiler digest, fixture Git blobs, original checkout head/tree, run attempt, job steps and real guest exit/output under independent review.

A valid bounded model result means only that the stated safety predicates hold for all reachable states *inside this specific bounded abstraction*.
