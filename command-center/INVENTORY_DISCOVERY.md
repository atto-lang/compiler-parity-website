# Private open-PR inventory discovery

`tools/discover-inventory.mjs` is a bounded, read-only collector for the explicit AttoLang/Oreslang repository allowlist. It discovers open PRs via paginated GitHub REST list endpoints, independently reads each selected PR's current commit/root tree, and reads submitted reviews separately from requested reviewers.

## Safety boundaries

- CLI uses the source-defined `DEFAULT_REPOS` allowlist; the injected allowlist parameter is intended for controlled tests.
- Only GET endpoints are enabled. The API helper rejects all routes except the existing read endpoints and the exact open-PR/review pagination routes.
- Each response is capped at 2 MiB; the reader has a global 220-request ceiling, a 15-second timeout, no redirects, strict UTF-8/JSON decoding, and an exact allowlist. Each run is capped at 95 PRs and five PR-list pages per repository.
- The output file is created exclusively with mode `0600`; it will not overwrite a previous snapshot. Keep it outside Git and in private storage.
- No source files, Git blobs, artifacts, caches, runner secrets or tokens are copied to another organization. No GitHub mutations are performed.
- Imported inventory values remain untrusted metadata. This tool cannot certify compiler output, artifact bytes, guest semantics, TLC proofs, reviewer authority, branch protection or merge readiness.

## Usage

Export the current command-center snapshot from the browser, save it in a private working directory, then run from a trusted machine with a least-privilege read-only token authorized for the allowlisted repositories:

```sh
GITHUB_TOKEN='…' node tools/discover-inventory.mjs \
  --input ./attolang-command-center-snapshot.json \
  --output ./attolang-command-center-inventory.private.json
```

The token is read only by the local process. Do not run this script in `pull_request` CI with privileged secrets, and never put the token in browser JavaScript or the static site.

Import the generated JSON in the command center. The `inventory` object reports repositories queried, per-repository page completeness, discovered PR count, tree/review detail coverage, request failures and a top-level `complete` boolean.

## Completeness interpretation

`inventory.complete=true` means every requested repository's open-PR list was fully paginated within configured bounds and every discovered PR's current head/root tree plus submitted-review first-page history was read completely. It does **not** mean workflow history is complete; job/run data remains separately refreshed by the existing bounded collector. A repository page cap, global PR cap, API error, missing root tree or truncated review page yields an explicit partial inventory.

Existing PR IDs are retained when a repository/number pair is refreshed, preserving fixture/job/action references. Existing seeded PRs not present in a fully scanned open-PR list are retained as `CONFIRMED_NOT_OPEN` rather than deleted; entries not seen in an incomplete scan are marked stale/unconfirmed.
