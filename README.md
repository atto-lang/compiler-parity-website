# AttoLang Engineering Command Center

## AttoLang naming migration (2026-11-18)

**AttoLang** is the new public name for **Oreslang**. This `ores-truffle-oreslang/compiler-parity-website` repository is a legacy-named checkout. The corresponding AttoLang project for new work is [atto-lang/atto-compilers-parity-testing](https://github.com/atto-lang/atto-compilers-parity-testing). Do not assume that matching project names mean GitHub history, PRs, issues, code or feature completeness has been transferred. This repository's historical visualizations are not themselves executed compiler tests.

The authoritative language specification is **[atto-spec](https://github.com/atto-lang/atto-spec)** (not old Oreslang README/spec prose); portable test fixtures belong in [atto-platform-conformance](https://github.com/atto-lang/atto-platform-conformance), and portable libraries in [atto-common-source](https://github.com/atto-lang/atto-common-source). The evolving language contracts include canonical `.atto` source, `snake_case` callable names, `borrow!`/`take!`/`copy!`/`copy!!`/`share!`, [implicit borrowing](https://github.com/atto-lang/atto-spec/blob/main/language/implicit-argument-borrow-v1.md), [file/module `define const` with guarded one-time `os.read_env`](https://github.com/atto-lang/atto-spec/blob/main/language/file-module-const-v1.md), and [bitwise `<<<`/`>>>`/`ashr` versus stream `<<`/`>>`](https://github.com/atto-lang/atto-spec/blob/main/language/bitwise-and-stream-operators-v1.md). These are **target rules**, not automatic execution claims for this repo.

Treat historical `.ores` fixtures, `oreslang-*` commands, package IDs, ABIs and examples below as compatibility instructions until verified changes supersede them. No Python project tooling/tests; prefer Rust support tooling. Compiler/runtime support and parity require exact source SHA/tree, target/toolchain, executed positive and negative guest tests; host-only or zero-step CI is **not executed** evidence.

An interactive, responsive, dependency-free static site for the AttoLang / Oreslang engineering workflow, grounded in a **point-in-time GitHub connector snapshot from November 4, 2026**.

## Open the site

Open `index.html` in a modern browser. If your browser restricts local files, serve this folder:

```bash
python3 -m http.server 8000
# Open http://localhost:8000
```

The deployable source is `index.html` plus `styles.css`, `data.js`, and `app.js`. **No runtime dependencies or API keys** are needed. The site does **not** automatically poll GitHub or trigger Actions, PR updates, approvals or merges.

## Views

| View | What it does |
| --- | --- |
| Overview | Evidence-wall warning, metrics, stepped/admission split, progressive verification funnel and priority actions |
| Pull request registry | Repositories, PRs, branches' exact head SHA, available tree SHA, review/draft status and next gates |
| Execution ledger | Workflow ID, job, attempt when available, step count, conclusion, host/compiler evidence classification |
| .atto fixture atlas | Canonical import, compiler/macro, LRU layout, security and adversarial fixtures; backend-oriented coverage |
| Backend parity | Java/GraalVM, LLVM, .NET NativeAOT, Wasm, and Forge/Cranelift evidence without collapsing authored/host/guest results |
| Layout lab | Interactive SoA, AoS2, AoS3, AoS4, and tiled AoSoA selectors, memory examples and invariants |
| Integrity & exact head | Compare claimed full Git head/tree against snapshot, structural checks, negative mutation checklist |
| Action queue | Prioritized P0/P1/P2 work with concrete, auditable acceptance criteria and locally editable status |
| Reusable checklists | Admission, compiler guest, adversarial receipt and independent merge-review templates with local checkboxes |

There are shared filters for **repository, PR, backend, workflow, fixture, layout, evidence class, gate, search and date range**. Choose **More filters** to expose the second row. Use **⌘/Ctrl + K** for command search. PRs, workflows, fixture cases and actions open a detailed inspector.

## Evidence semantics — fail closed

- `steps=[]`, `steps=null` or zero observed job steps means **runner admission was not established**. Do not report these jobs as source compilation failures.
- A workflow's `conclusion=failure` without inspected job steps means **unknown stage**, not automatically runner admission or compiler failure.
- Real stepped Rust reference, Node host-side tests and source-free GraalVM Native Image probes are **host-only evidence**. Those cannot establish `.atto` compiler or guest parity.
- `ATTO_GUEST_COMPILER_EXECUTION=NOT_EXECUTED` means **guest parity is not proven**.
- Authored fixtures, source-tree inspection, host-only mutation tests, an `ore`/`atto` launcher stub, and expected exit values are all distinct from actual guest execution.
- A native guest receipt needs an independently audited run and job attempt, nonzero steps, full head/tree identity, source compiler, native/AOT linking where required, exact fixture blobs, native guest exit/output and negative mutation controls.
- Workflow phase counters count `sourceCompiled` and `nativeLinked` only when a **bound audited receipt** is present. The import schema can carry `proof` fields for future auditable updates, but the site does **not** independently query a remote API to validate a claimed receipt. Always verify imported receipts against GitHub before trusting or publishing.
- Requested reviewers and Git mergeability do not substitute for submitted independent approval, branch protection, exact-head CI or a verified merge commit.

## Seed provenance

The initial **11 PRs, 13 workflow records, 19 fixture/test groups, 8 parity features, 5 layout options, and 11 prioritized actions** are from connected GitHub metadata and the corresponding PR descriptions. Example heads include Java #2422 `892c3220…`, LLVM #1415 `5031fb86…`, .NET #346 `e085c74a…`, Wasm #288 `61f6e997…`, Forge #183 `7678de0a…`, and LRU #15 `3cf9592a…`. All full stored head SHA values use the GitHub connector metadata.

**Important limitations:** Most root tree SHAs were not returned by the available GitHub connector method. When a root tree appears, it is attributed explicitly to PR description readback, **not** independently verified by this site. Some workflow jobs were inspected and had `steps=null`; others were not inspected, and are marked unknown. Run attempts and workflow-reported heads were not returned in the selected result fields. A workflow-success badge only means a workflow concluded successfully; it does **not** imply compiler-backed guest parity. All 11 seeded PRs are draft and no initial exact-head guest execution is certified.

This seed is a useful triage baseline, **not a claim that GitHub state is still current**. The app visibly marks data as a snapshot.

## Updating the command center

- Use **New record** to add a PR, workflow, or action. The entry lives in browser `localStorage` and does not update GitHub.
- Use **Import** to load a JSON snapshot conforming to `schemaVersion: 1` and the arrays `prs`, `workflows`, `fixtures`, `parity`, `layouts`, `actions`. Import *replaces* the local snapshot; export before replacing.
- Use **Export** for complete JSON with local action/checklist state, or filtered PR CSV. Local edits and checklist marks survive refresh in the same browser.
- For canonical re-verification, fetch PR `head_sha`, root `commit.tree.sha`, fixture blob SHAs, `run_attempt`, each job's `steps` and receipt assertions through an **authorized GitHub connector / CI reporter outside this static browser**; then import the snapshot. Do not put GitHub tokens in a static site or publicly expose private repo metadata.
- For multi-organization CI where source is private, do not mirror code without explicit approval. If an authorized source-free or exact-tree carrier is used, retain source identity, stepful evidence and controls against false guest claims.

## Tests and deployment

Run the local smoke tests with Node 18+:

```bash
node tests/smoke.cjs
```

The nine views are syntax/structurally smoke-tested. This **is not** a visual-browser or compiler-backed guest test. No real AttoLang program is executed by the dashboard.

You can host this repository on GitHub Pages, Cloudflare Pages, Netlify or any static host. **The repository is private; do not enable publicly reachable Pages without reviewing the PR metadata and hosting access policy.** Hosting is not automatically enabled.

## License

This generated dashboard is provided for your internal engineering workflow. No third-party UI libraries are bundled.