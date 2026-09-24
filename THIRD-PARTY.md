# Third-party skill provenance

Skill Library's website, installer, indexer, and MCP integration are MIT licensed.
That license does **not** relicense upstream skills, artwork, references, or scripts.

Each catalog entry identifies:

- The public GitHub repository, actual repository star count, and check time.
- A full immutable commit SHA and the original skill directory.
- The nearest supplied license, with an individual skill's license taking precedence.
- A SHA-256 for each installed file and for the complete downloadable archive.
- The exact source URL, byte count, and ordinary executable mode for each file.

Downloads contain all accepted files in the skill directory and applicable supplied
license/notice files. The catalog excludes skill folders containing symlinked,
unsafe, or oversized files rather than silently advertising incomplete bundles.
Unknown and custom licenses are excluded from this public distribution. A repository
description or star count is never treated as a license.

The importer recognizes MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, CC0-1.0,
MPL-2.0, GPL-3.0, and AGPL-3.0 license text. Consult each bundle's actual license
for obligations. Metadata extraction is not a legal opinion, an exhaustive security
audit, or a statement that an upstream author endorses Skill Library.

Sources are configured in `registry/sources.json`; catalog revisions and exclusion
counts are recorded in `registry/sync-summary.json`. Detailed acquisition reports
are generated locally at `.cache/sync-report.json`.

Third-party skill content is untrusted data. It never grants installation authority,
changes the user's access policy, or authorizes running helper scripts. The installer
does not execute any upstream skill scripts.

To report an attribution, license, or unsafe-content issue, open an issue in
https://github.com/AjnasNB/skill-dash with the exact skill ID and source path.
