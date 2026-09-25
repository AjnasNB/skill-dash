# Contributing to Skill Library

Open a focused pull request against `main`. Public access does not grant push
access: use a fork if you are not a collaborator. Report vulnerabilities through
[SECURITY.md](SECURITY.md), not a public issue.

## Run the library

```sh
npm ci
npm run check
npm test
npm run hydrate
npm run build
npm run preview
```

`hydrate` recreates downloads from the committed manifests and verifies hashes.
It does not refresh upstream revisions. `sync` intentionally changes the catalog
and requires review of the resulting diff.

## Propose a source

Use the website's **Submit a skill** form or the CLI's `submit` command. Maintainers
review the private queue; submitting does not grant publication or repository
access. An eligible source needs:

- a public GitHub repository with at least 1,000 repository stars;
- a recognized license covering the instructions and supporting files;
- valid `SKILL.md` frontmatter with a useful name and description;
- a complete skill folder that can be pinned to a full commit SHA;
- no credentials, personal data, private agent context, or unlicensed assets.

Stars are measured on the repository, not the individual skill. Copied content
does not become redistributable merely because the containing repository has
a license. Describe third-party exceptions for maintainer review.

For an approved source, update `registry/sources.json`, run `npm run sync`, and
review the catalog, license, revision, file, and checksum changes. Run the checks,
tests, and complete build before requesting review. Keep source refreshes separate
from unrelated application changes.

## Pull and push safely

Follow [the branch workflow](.github/REPOSITORY-SECURITY.md). Commit changes on a
feature branch, push normally, and open a pull request. Do not force-push or delete
published branches. Maintainers merge only after required checks pass against the
current `main`; publishing and deployment are separate maintainer actions.
