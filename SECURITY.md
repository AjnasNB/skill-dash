# Security policy

The latest stable `agent-skill-library` package and the production service at
`skills.maqamagent.com` receive security fixes.

Report a vulnerability through
[GitHub private vulnerability reporting](https://github.com/AjnasNB/skill-dash/security/advisories/new).
Include the affected version, a minimal reproduction with synthetic data, and
the expected and observed behavior. Do not publish credentials, private skill
content, personal data, or exploit details in an issue.

Relevant reports include installation outside the selected root, linked-path
bypasses, integrity-check failures, local data being overwritten, unintended
execution, submission-queue disclosure, and browser/API security failures.

Skills are third-party instructions and may include supporting scripts. Repository
stars, licensing checks, pinned revisions, and hashes do not certify that those
instructions are safe or suitable. Inspect a skill before enabling it in an agent;
its runtime tools and permissions remain the user's responsibility. The installer
and MCP server never execute downloaded supporting scripts.

The service stores source submissions in a private review queue. Submissions
are not automatically published, and public APIs do not list the queue. The
application stores temporary rate-limit hashes instead of raw client IP addresses.

Branch, review, workflow, and release controls are documented in
[the repository security policy](.github/REPOSITORY-SECURITY.md).
