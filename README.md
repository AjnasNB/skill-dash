# Skill Library

An open skill marketplace, npm CLI, and read-only MCP server for **Codex**, **Claude Code**, and **Delta Harness**.

**[Browse the library](https://skills.maqamagent.com)** · [Agent instructions](https://skills.maqamagent.com/llms.txt) · [API schema](https://skills.maqamagent.com/openapi.json)

Search thousands of real skill folders by name, description, and related task vocabulary. Preview instructions, bookmark skills, copy `SKILL.md`, or download the full ZIP with references and licenses.

Every catalog source is a public GitHub repository with **1,000+ repository stars** at the recorded check time. Stars belong to repositories, not individual skills. Source commits and file checksums are pinned. The catalog does not claim security certification or endorsement by source authors.

## Use from npm

Node.js 20.19 or newer:

```sh
npx agent-skill-library search "make a launch video"
npx agent-skill-library search "accessible React interfaces" --json
npx agent-skill-library show anthropics--skills--frontend-design --content
npx agent-skill-library install anthropics--skills--frontend-design --agent codex
```

Or install the CLI:

```sh
npm install -g agent-skill-library
skill-library search "test a website"
```

Use an exact ID from search results when several sources share a name. Name-only installation works when the name is unambiguous. Search is local and works offline; reading or installing a skill needs access to its pinned GitHub files.

## Teach your agent to use the library

```sh
npx agent-skill-library setup --agent all --global
```

This installs a small discovery skill in the three personal libraries. It does not install thousands of skills, alter model settings, or start an MCP process. Install only the skills relevant to your task.

| Target | Project installation | Personal installation |
| --- | --- | --- |
| Codex desktop / CLI | `.agents/skills/<name>` | `~/.agents/skills/<name>` |
| Claude Code | `.claude/skills/<name>` | `~/.claude/skills/<name>` |
| Delta Harness | Not applicable | Delta application-data directory, under `skills/<name>` |

Add `--global` for personal installation. Delta and `--agent all` require it. Use `--cwd <directory>` for another project. On Windows, Delta uses `%APPDATA%\Delta Harness\skills`; `DELTA_DATA_DIR` overrides the application profile. Start a new Codex/Claude session or refresh Delta's Skills panel.

For repository-based cloud tasks, commit the project skill folders. A personal install on your computer is not automatically available in a remote environment. Claude Code support does not imply that every Claude chat product automatically reads filesystem skills.

```sh
npx agent-skill-library install FULL-SKILL-ID --agent claude --global
npx agent-skill-library install FULL-SKILL-ID --agent delta --global
npx agent-skill-library install FULL-SKILL-ID --agent codex --dry-run
npx agent-skill-library list --agent codex --global --json
```

The installer downloads to a staging directory, checks every SHA-256, and then places the complete folder in the destination. Supporting scripts are never executed. Script executable bits are preserved. Linked installation paths, traversal, ambiguous Windows names, and unexpected download hosts are rejected.

Unmanaged skills are never overwritten. An existing managed revision needs `--force` to replace; local edits are protected by default, and extra local files block replacement even with `--force`. Back up your edits before requesting replacement.

## MCP

```json
{
  "mcpServers": {
    "skill-library": {
      "command": "npx",
      "args": ["-y", "agent-skill-library", "mcp"]
    }
  }
}
```

The stdio server provides `search_skills`, `read_skill`, and `plan_skill_install`. It inspects and plans; it does not execute downloaded instructions or write installations. Configure the command in your client's MCP settings. No service API key is required.

## Public API and submissions

```sh
curl "https://skills.maqamagent.com/api/skills?q=video&limit=10"
curl "https://skills.maqamagent.com/api/categories"
```

Skill routes: `/api/skills/{id}`, `/content`, `/manifest`, and `/download`. Direct assets are available at `/documents/{id}.md`, `/manifests/{id}.json`, and `/bundles/{id}.zip`.

```sh
npx agent-skill-library submit https://github.com/OWNER/REPO --path skills/NAME
```

The website and CLI submit GitHub sources to a D1 review queue. Submissions are not automatically published. The collector checks repository stars, license files, valid frontmatter, source revisions, and complete supporting files before inclusion. Public submission is limited to ten per network per day. No raw IP or credentials are stored by the application; expiring hashes are used for rate limiting.

Maintainers can inspect the queue with `npx wrangler d1 execute agent-skill-library --remote --command "SELECT id, repo, skill_path, status FROM submissions WHERE status = 'pending'"`, review the source, and add its approved prefix to `registry/sources.json`. Running `npm run sync` produces a reviewable catalog diff; commit and deploy only after checks pass.

## Develop and reproduce

```sh
npm ci
npm run check
npm test
npm run hydrate
npm run build
npm run preview
```

`hydrate` reproduces the exact ZIPs from the committed manifests, rechecking hashes. It may download the pinned upstream repository archives on a clean checkout. It does not update the catalog. `sync` intentionally refreshes stars and source revisions, deduplicates exact instruction content, and regenerates manifests and assets. GitHub authentication through `gh auth login` or `GH_TOKEN` avoids low anonymous API limits.

```sh
npm run sync
npm run check
npm test
npm run build
npm run test:browser
```

Deployment uses Cloudflare Workers static assets plus a small search/submission Worker and D1. Review `wrangler.jsonc` and create your own D1 database/custom domain before deploying a fork:

```sh
npx wrangler d1 migrations apply agent-skill-library --local
npx wrangler dev
# For this configured production project:
npx wrangler d1 migrations apply agent-skill-library --remote
npm run deploy
```

Frontend-only development is available through `npm run dev:web`; full API and submission behavior uses Wrangler.

## Provenance and compatibility

See [THIRD-PARTY.md](THIRD-PARTY.md), [the source configuration](registry/sources.json), and [the sync report](registry/sync-summary.json). The library code is MIT; upstream skills retain their own licenses. The generic SKILL.md format travels between clients, but specialized skills may still require their own runtimes, tools, credentials, or subscriptions.

The locally distributed Brag skill is not republished here: its public upstream and bundled audio redistribution rights were not established. Search for “brag” or “launch video” to discover the licensed Hyperframes video workflows. Delta can also discover a user's existing local Brag installation.

## Contribute and report security issues

See [CONTRIBUTING.md](CONTRIBUTING.md) for source submissions and development,
[the branch policy](.github/REPOSITORY-SECURITY.md) for protected pull/push workflows,
and [SECURITY.md](SECURITY.md) for private vulnerability reports.
