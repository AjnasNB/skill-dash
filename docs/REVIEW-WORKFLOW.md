# Reviewing applications and risks

SkillDash exposes three distinct collections: the source-pinned downloadable
skill catalog, imported tool/plugin metadata, and community listings. Community
review does not certify catalog downloads or third-party execution as safe.

The reviewer signs in with the configured `ADMIN_EMAIL` at `/account`, then opens
`/review`. Regular verified users may submit and vote, but cannot read private
contacts, review notes, assessments or the queue. Public browsing and MCP
discovery require no account. The MCP never installs software or reads private
project files.

## Inspect and assess

1. Open the submitted website and source. Check attribution, licensing, ownership
   attestation, claims, pricing, source revision and supporting files. Submission
   is not proof of upstream redistribution rights.
2. Record permissions: required accounts, credentials, billing, outbound network,
   local file access, browser control and supported operating systems/hosts.
3. Record functionality as **not tested**, **documentation checked**, **runtime
   verified**, or **blocked**. A reachable website is only evidence of reachability.
   A runtime claim must describe the actual command/action, environment and
   observed result. Never infer universal compatibility from one successful test.
4. Record a risk level, findings, remaining limits, next action and evidence.
   Unknown is an incomplete assessment. High risk can describe a documented
   sensitive capability; it is not automatically proof of malicious behavior.
5. Save the assessment. It is reviewer-only, records its author and time, sends
   no email and leaves the publication decision unchanged. It is the current
   assessment, not an immutable edit history.

The **Needs attention** filter selects unassessed entries, unknown/high risk, and
untested/blocked functionality. Summary counts cover the entire community queue;
the result count and pagination follow the selected publication and risk filters.
Legacy published entries are not silently reassessed or unpublished.

## Decide publication separately

For pending applications, fill agent compatibility and usage instructions, check
source/details/publication rights, and write a review note. Approval requires a
saved assessment with a known risk level and documented or verified functionality.
Unassessed, unknown, untested or blocked applications cannot be approved. Rejection
requires a note and does not require falsely marking source or functionality checks
complete. A decision queues the existing transactional owner notification.

Published and rejected applications remain available through their status filters.
These views show the saved publication note, date, reviewer and recorded checks;
assessments can be updated independently. Public responses do not include private
assessment fields or submission contacts.

## Deploy and verify

Apply migration `0004_listing_assessments.sql` to the intended D1 database before
deploying the dashboard. It creates an empty assessment table and does not change
existing publication decisions. Keep production review evidence and contacts out
of Git. Do not seed approvals or represent synthetic test data as real reviews.

Run `npm test`, `npm run check`, `npm run build` and
`node scripts/test-review-browser.mjs`. The browser smoke uses an isolated local
database and synthetic reviewer, and sends no email. Its screenshots are under
`artifacts/review-browser/`. Complete the existing deployment/repository gates
before production rollout.
