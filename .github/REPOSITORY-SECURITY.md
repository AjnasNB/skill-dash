# Repository security and branch workflow

`main` is the default branch of this public repository. Anyone may read, clone,
fork, and propose a pull request. Only authorized collaborators may push branches,
and only the maintainer may publish the official package or deploy the service.

## Enforced rules

- All current and future branches reject force pushes and deletion, with no
  bypass actors. Normal forward-only feature-branch pushes remain available to
  collaborators.
- Changes to `main` or the default branch must use a pull request, pass required
  GitHub Actions checks against the latest base, resolve review conversations,
  and squash merge into linear history. There is no bypass for this merge gate.
- Contributor changes require one current approval, code-owner review, and
  approval of the latest push by someone other than its author. New commits
  dismiss old approvals.
- Existing tags cannot be rewritten or deleted. Automatic branch deletion is
  disabled because every branch is protected from deletion.

The owner, `AjnasNB`, has one narrow exception: the maintainer-review ruleset
allows the owner to merge through a pull request without a second person's
approval. GitHub does not allow self-approval. This exception is recorded as
a ruleset bypass and does not bypass CI, the pull-request requirement, resolved
conversations, or branch/tag history protections. It never permits a direct
push to `main`.

Required checks include Windows and Linux validation, the supply-chain audit,
dependency review, CodeQL, secret scanning, and a clean reconstruction of all
downloadable skill bundles. Checks are bound to the GitHub Actions integration.
GitHub's **Settings → Rules → Rulesets** is the source of enforced settings;
this document explains the intended policy.

## Development workflow

```sh
git switch main
git pull --ff-only origin main
git switch -c feat/descriptive-change
# Make and verify the change.
npm run check
npm test
git add path/to/changed-file
git commit -s -m "feat: describe the change"
git push -u origin feat/descriptive-change
gh pr create --base main
```

Without collaborator access, push to your fork and target `AjnasNB/skill-dash:main`.
To synchronize an already-published branch, fetch and merge `origin/main`, then
push normally. Do not rewrite published commits with rebase or any form of
force push. Squash merging produces linear history on `main`.

## Automation, secrets, and publication

Actions are pinned to complete commit SHAs. Workflow tokens default to read-only,
cannot approve pull requests, and are not persisted by checkout. External fork
workflows need maintainer approval. Pull-request workflows never receive deployment
or npm publishing credentials and do not use `pull_request_target`.

Secret scanning, push protection, dependency alerts and automatic security-update
pull requests, and private vulnerability reporting are enabled. Code-owner review
also covers workflow files, manifests, source configuration, and lockfiles.

Releases and deployments are deliberate maintainer operations from an exact
reviewed `main` commit. Before publishing, check the version, run `npm pack`,
inspect the tarball, and verify that no unpublished local modifications are
included. Before deploying, reproduce all downloads, run the full build and
browser smoke test, and check the configured Cloudflare account/domain.
Never publish automatically merely because a user submits a skill.

Repository administrators retain GitHub's ability to edit settings. Record any
necessary exception and restore the policy afterwards. Do not weaken a failing
check just to merge a change.
