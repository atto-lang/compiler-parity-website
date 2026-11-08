# AttoLang Engineering Command Center

An interactive, dependency-free site for coordinating the **AttoLang** (formerly Oreslang) engineering program across `ores-truffle-oreslang`, `lru-cache-atto`, related runtime teams and five compiler/runtime backends. Repository names and `.ores` source compatibility are preserved; canonical new examples are `.atto`.

> **Evidence posture: HOLD.** This is a useful operational interface, *not* proof of compiled guest parity, formal verification, sandbox security or merge authorization. The initial dataset is a **selected, point-in-time GitHub readback from November 8, 2026**, not a complete organization inventory and not an automatically refreshed live feed.

## Open it

The site is static. Open `index.html` in a browser, or for local hosting:

```sh
cd attolang-command-center
python3 -m http.server 8000 --bind 127.0.0.1
# Navigate to http://127.0.0.1:8000
```

It requires no build step or third-party JavaScript. `app.js`, `data.js` and `styles.css` must remain next to `index.html`. A local preview runs without credentials or network access. Filter/search, navigation, details, LRU physical-addressing examples, task statuses, agent handoff notes, checklists and JSON/CSV export are interactive. Task/checklist state persists **only in that browser**; it does not update GitHub or communicate with other agents.

## Navigation

| View | Purpose |
|---|---|
| Overview | Blocked PRs, job evidence pipeline, compact risks and next decisive actions |
| PR coordination | Draft/ready/merged lanes, SHA/tree registry, stacked PR dependencies and a five-merge/three-repository safety gate |
| CI evidence | Jobs, run IDs, attempts, executed step counts, canaries, host tests and execution stage distinctions |
| Backend parity | Java/GraalVM, LLVM, .NET NativeAOT, Wasm and Forge/Cranelift matrix; fixture atlas |
| Runtime semantics | TLS/Task-LS/ALS, per-actor stacks, actor isolation, ownership/borrow, structured concurrency, cancellation, generation fencing, pub-sub, AOT/GC and layouts |
| Formal & security | TLA+/TLC assurance gaps, adversarial anti-replay, sandbox threats and negative mutation queue |
| LRU layout lab | SoA, AoS2, AoS3, padded AoS4, AoSoA selectors and tile/slot math; configurable capacity/tile width |
| Action queue | Prioritized exact-head, missing receipt, formalization, semantic-conflict, draft-to-ready, adversarial and post-merge tasks |
| Agent handoffs | Ownership roster, worktree scope, acceptance criteria and local notes |
| Playbooks | Reusable checklists for admission, native guests, integrity, formal models, merge wave and LRU layouts |

Global filters include repository, PR, backend, semantic area, fixture, layout, evidence class, severity, blocker, agent, search and from/to dates. `⌘/Ctrl+K` focuses search. Click rows and cards to open the inspector. Import/export a `schemaVersion: 2` snapshot from the header.

## Fail-closed evidence policy

**Never classify a zero-step run as source compilation failure.** The UI's `jobClass` rules distinguish:

| Class | What it establishes |
|---|---|
| `RUNNER_ADMISSION` | Job `steps=[]`, `steps=null` or `steps=0`. No test execution evidence. If job is a source-free canary, preserve that flag *in addition* to this admission classification. |
| `UNINSPECTED` | Job steps were not fetched; a workflow conclusion by itself doesn't identify a failure stage. |
| `SOURCE_FREE_CANARY` | **Stepped** source-free probe, not access to the source compiler. |
| `HOST_ONLY` | Stepped reference model / source-side tests, not native `.atto` execution. |
| `PREFLIGHT` | Stepped setup, admission, source integrity or environment checks. |
| `SOURCE_COMPILE` | Claimed compile stage after observed steps; requires separate native/guest proof. |
| `NATIVE_LINK` | Claimed link stage after observed steps; requires separate guest proof. |
| `GUEST_CANDIDATE` | Claimed real guest step, **not independently attested**. |
| `EXECUTED_UNCLASSIFIED` | Steps were observed but their semantic phase was not independently established. |
| `RECEIPT_VERIFIED` | **Reserved** for an independently authenticated exact-head source/compiler/fixture/binary/guest receipt verifier. The current site never assigns this state from imported JSON. |

The **merge-eligible counter is deliberately always zero** without an independently authenticated, trusted verifier. A forged JSON document containing `approved`, `attestedGuestReceipt:true`, `merged:true`, `mergeable:true` etc. cannot make a PR eligible in this UI. “Done” in a checklist or action queue remains *local workflow state*, not proof.

### Required independently verified guest receipt

The minimum shape binds: repository and exact PR head SHA; root Git tree; immutable fixture blob IDs; compiler Git head/tree and executable hash; workflow path/ID; run ID and attempt; unambiguous job ID/name; assigned runner; ordered successfully started checkout, compilation, link and guest execution steps; positive guest exit/stdout/stderr; semantic-negative diagnostics; artifact SHA-256; independent reviewer checks; and anti-replay/forgery mutation controls. A source-free canary or host test cannot be upgraded to this class merely by setting a field.

All imported JSON remains **unattested input**. Never host private-source PR metadata publicly or paste a GitHub token in JavaScript. Externally corroborate receipts before publishing any proof status.

## Refresh GitHub metadata privately

`tools/refresh.mjs` is a read-only, bounded API collector. It updates PR head/tree and job metadata for the tracked PRs. It does **not** read or mirror code, mutate GitHub, download artifacts, verify executable guest output, or merge PRs. It caps response size to 2 MiB, requests to 160, and fetches only the latest two exact-head workflow runs with first-page jobs. Those limits are explicit; incomplete pagination is **unverified**, never silently treated as exhaustive.

Use a read-only GitHub token authorized to see the selected private repositories. Run from a trusted workstation/private CI runner, not untrusted PR code:

```sh
GITHUB_TOKEN='…' node tools/refresh.mjs --input ./exported-command-center.json --output ./snapshot.private.json
```

Import `snapshot.private.json` in the site's **Import** button. The collector writes mode `0600` and marks `METADATA_CORROBORATED_CANDIDATE_ONLY`. It does not claim native guests or semantic parity. **Do not commit the generated private snapshot to a public branch.** A privileged carrier would require explicit source-policy authorization before any cross-organization checkout/mirroring; this collector does not perform that action.

For a true ongoing hosted dashboard, a trusted private data pipeline should add authenticated artifact-byte and step-log verification, signed snapshot publishing to an access-controlled store, and audit-logged merge coordination. This static preview intentionally does not provide those credentials or capabilities.

## Initial snapshot and limitations

- 17 selected draft PRs from Java, LLVM, .NET, Wasm, Forge, platform conformance, LRU cache and the existing private `compiler-parity-website` assurance work.
- 10 selected job records, including GitHub read-back examples of real zero-step source-org jobs and a **23-step LRU host model**, clearly distinct from compiler-backed native LRU guests.
- Root tree hashes shown only where re-read from GitHub's exact commit endpoint. A blank tree is not made up.
- All seeded five-backend guest parity is **UNPROVEN**. No signed or independently corroborated guest receipt was supplied.
- The assurance PRs (`compiler-parity-website` #7 and #10) already contain separate TLC/collector work. This standalone site does not modify those active branches.
- Date ranges and task filters operate on the snapshot's stored timestamps, not newly fetched GitHub events.
- LRU geometric cell counts are logical *int-cell layout models*: they exclude table hash buckets, link arrays, object headers, real machine alignment and allocator effects.

## Test and review

```sh
node tests/site-smoke.cjs
node --test tests/evidence.test.mjs
node --check tools/evidence-core.mjs
node --check tools/github-api.mjs
node --check tools/refresh.mjs
node --check tools/verify-run.mjs
```

The smoke test checks dataset integrity, ten view renders, zero-step/unknown/host/canary/guest classification, fail-closed merge gating and SoA/AoS/AoSoA logical geometry. These are **Node host/source-only tests**. They are not a real browser security test, compiled Atto guest, NativeAOT receipt, TLC run or formal parity test. Run actual browser accessibility and responsive checks before public deployment.

## Private deployment guidance

Use an access-controlled static host (e.g. company-internal storage behind SSO) only after reviewing what GitHub metadata can be disclosed. This prototype makes no network calls at runtime (`connect-src 'none'` Content Security Policy) and has no merge/approval/Actions permissions. Do **not** enable public GitHub Pages or public mirror of a private org's PR information without a separate security/ownership review.
## Reviewer-side independent GitHub metadata corroboration

The collector requires **--input** with a previously exported `schemaVersion:2` JSON snapshot; it never evaluates JavaScript or requires a copied private source tree. The default site seed is available only inside the static HTML; export it once in the UI, then run refresh privately on a trusted machine.

The separate `tools/verify-run.mjs` uses a **reviewer-authored pin** containing `repo`, `number`, full `head`, full `tree`, `workflowPath`, `runId`, `attempt`, `jobId`, `jobName` and ordered `requiredSteps` (exact checkout and real execution step names). Run:

```sh
GITHUB_TOKEN='…' node tools/verify-run.mjs --pin /trusted/reviewer-pin.json
```

This verifier independently reads the current PR, Git commit tree, run identity and one attempted job. It rejects stale heads, wrong attempts, duplicate jobs and step names, zero or failed/unstarted steps, mismatched workflow/job identities and unbounded pagination. A positive verdict is **`GITHUB_METADATA_CORROBORATED_CANDIDATE_ONLY`**. It cannot authenticate artifact ZIP bytes, compiler binary fingerprints, guest stdout, negative semantic diagnostics, independent review authority or branch protection; those are explicit separate blockers. **No `RECEIPT_VERIFIED` claim is produced.**

`command-center-ci.yml` is deliberately source-only, checks out the exact PR head, and runs UI/adversarial Node tests with **read-only contents permissions and no GitHub token passed to the test processes**. Its job cannot create/approve/merge PRs or publish private metadata. A workflow failure with zero job steps remains runner admission failure, not a code test failure.

**Branch coordination:** This isolated directory does not modify existing dashboard root files, collector/TLC PR #3/#5/#7/#10 branches, public Pages, or compiler source repos. Current branch protection was not established by the site; independent governance remains mandatory before merge.
