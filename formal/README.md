# AttoLang assurance models — bounded, executable, non-promoting

This directory contains four **bounded design-state machines** in check-models.mjs,
four reference TLA+ modules under specs/, and explicit negative mutations.
These are NOT proofs of implementation refinement, unbounded liveness,
a verified compiler, or an AttoLang guest execution.

## Run the executable state models (Node 22+)

    node formal/check-models.mjs --json
    node --test tests/formal-models.test.mjs

The checker exhaustively explores finite reachable model states within explicit
depth/state limits, reports depth truncation, and fails closed if the state cap
is exceeded. Six behavior-changing unsafe mutants must each produce a
counterexample action trace. Syntax-invalid mutants do not count.

| Model | Explicit bound | Safety obligation | Negative controls |
| --- | --- | --- | --- |
| Actor ownership | Two actors, one slot, one transfer | Owner-only read/write; exclusive writer | Foreign writer |
| Cancellation | One waiter and charged resource | Exactly-once completion and enabled wakeup | Lost wakeup; double completion |
| RELIABLE pub-sub | Two publishers, two sends each, capacity one, two generations | No early ACK, stale queue or duplicate ACK | Early ACK; stale generation |
| Hot reload | One ActorRef, two generations, one ticket | No stale ticket/retired execution | Retain old-generation ticket |

Cancellation checks only an **enabledness progress condition**. Eventual
termination additionally assumes a fair scheduler. The TLA+ CancellationAwait
module includes a weak-fairness variant, but TLC has not been executed.

## Optional independent TLC checking

Once trusted Java and a pinned tla2tools.jar are available:

    java -cp /path/to/tla2tools.jar tlc2.TLC -config formal/specs/ActorIsolation.cfg formal/specs/ActorIsolation.tla
    java -cp /path/to/tla2tools.jar tlc2.TLC -config formal/specs/CancellationAwait.cfg formal/specs/CancellationAwait.tla
    java -cp /path/to/tla2tools.jar tlc2.TLC -config formal/specs/ReliablePubSub.cfg formal/specs/ReliablePubSub.tla
    java -cp /path/to/tla2tools.jar tlc2.TLC -config formal/specs/HotReloadFencing.cfg formal/specs/HotReloadFencing.tla

TLA+ parser validity, exact TLC state counts and equivalence to the JavaScript
reference models are **NOT VERIFIED** here. Add paired trace/state-count tests,
pin the TLC distribution digest, then record actual model-checker receipts.

## Mandatory implementation refinement

For every invariant, define an explicit mapping from bounded model states to
the runtime implementation (actor heap, ownership epoch, scheduler, subscription
generation, tenant resource ledger, or native hot-reload ticket). Run genuine
production compilers on canonical byte-identical .atto fixtures across
Java/GraalVM, LLVM, .NET NativeAOT, Wasm and Forge/Cranelift. Require real
compiler artifacts, native guest exit/stdout, negative controls, exact source
tree/blob, workflow attempt and non-zero executed steps, plus independent review.

steps=[] / steps=null / numeric zero are runner admission failures, not failed
compiler tests. Missing workflow job data means NOT_INSPECTED, never counted
as a runner failure. A source head and root tree alone do not prove the tested
checkout or guest execution.

## Read-only collector / private artifacts

The collector at tools/collect-assurance.mjs reads an explicit bounded set of
repositories/PRs from formal-data.js. It only requests GitHub API metadata,
does not copy source, and writes to ignored private-artifacts/. It cannot attest
a compiler binary, actual checkout, signed receipt, or real guest result.

Scheduled collection requires a separately provisioned, read-only
ATTO_ASSURANCE_READ_TOKEN GitHub Actions secret with authorized repository
access. Its produced JSON stays in private Actions artifacts, never site files.

Browser-imported JSON is UNTRUSTED, even when created by the collector.
The dashboard demotes imported guest-proof and head-binding claims. A separate,
independent evidence-attestation verification pipeline must be built before
promoting any stronger claim.

Do not enable public hosting of this private metadata without an explicit
access/security review. The draft PR still requires successful exact-head
stepped CI, independent submitted review and applicable branch protection.
