# Search and AI discovery

Reviewed September 25, 2026.

Skill Library helps people and agents find, inspect and install reusable
`SKILL.md` folders. The primary discovery topic is **AI agent skills**. Related
topics include Codex skills, Claude Code skills, downloadable skill folders,
task-specific workflows and the library's API/CLI/MCP integration.

## Page and query map

| Search intent | Destination | Useful content |
| --- | --- | --- |
| AI skills / AI agent skills / agent skill marketplace | `/` | Search, product definition, categories, scope and FAQs |
| Browse all agent skills | `/skills`, with `?page=N` | Alphabetical directory linking to every skill |
| A specific skill or source | `/skills/{id}` | Complete instructions, source, revision, license, installation and download |
| Design, video, security or other workflow | `/collections/{category}` | Category-specific explanation and selected results |
| What is an AI agent skill? | `/guides/what-are-ai-agent-skills` | Folder structure, skills versus prompts/MCP, how to choose |
| Codex skills installation | `/guides/codex-skills` | Verified commands, scope and discovery behavior |
| Claude Code skills installation | `/guides/claude-code-skills` | Verified commands and project/personal scope |
| Are agent skills safe? | `/guides/skill-safety` | Review procedure and limits of provenance checks |
| Agent skill API or MCP | `/for-agents` | Real endpoints, CLI commands, MCP configuration and permissions |
| Who operates the library? | `/about` | Maintainer, attribution, selection and privacy information |

These are intent mappings, not paid keyword-volume or difficulty estimates.
The broad phrase “AI skills” can also refer to human training, so the pages
clearly say **AI agent skills** rather than promising to satisfy every use of
that phrase.

## Implementation

`scripts/build-pages.mjs` produces readable HTML using the pinned catalog and
instruction files. The same response is served to users and crawlers. The
homepage and skill pages keep their readable HTML while the interactive React
interface loads catalog data directly from its JSON endpoint;
guides, category hubs and directory pages do not require application JavaScript.
Upstream Markdown is rendered with `react-markdown`, and metadata/JSON payloads
are escaped. HTML templates and verification use `parse5`; rendered DOM text is
not reused as application data. No user-agent cloaking or executable upstream
HTML is used.

Skill cards are ordinary links, including in the interactive app. Directory
pagination links to all entries. Skill pages and guides have a single canonical,
specific title and description, social-card metadata and relevant schema.org
data. Repository stars are not encoded as user ratings. FAQs contain real,
visible answers; they are not a promise of FAQ rich-result eligibility.

The sitemap index at `/sitemap.xml` lists `/sitemaps/pages.xml` and
`/sitemaps/skills.xml`. Search/filter URLs are `noindex, follow`; canonical skill,
category and directory pages remain indexable. Stored `.html` page URLs redirect
to the public route. Unknown skills and out-of-range directory pages return 404.
Use an actual content-review date in sitemap metadata; do not refresh dates
simply to make unchanged content look new.

`/llms.txt` links to Markdown guides, the public JSON catalog, the API specification
and installation instructions. `/llms-full.txt` combines the guides for clients
that deliberately read this format. These files are convenience resources;
they do not replace crawlable pages, site authority or useful content.

The public `indexnow-key.txt` is an IndexNow ownership challenge, not a login
credential. After deploying the reviewed build, `npm run notify:indexnow` checks
that the live key matches and submits the sitemap URLs. It is a deliberate
maintainer operation. A 200/202 response acknowledges a notification, not
indexing, ranking or inclusion in an AI answer.

## Checks

```sh
npm run check
npm test
npm run hydrate
npm run build
npm run check:seo
# Run the local Worker on port 8797, then:
npm run test:copy-seo
```

The generated-page check verifies every canonical, unique title, JSON-LD payload,
skill source revision, readable instructions, sitemap entry and directory
link. The copy tests cover the visible button state after real clipboard writes,
delayed writes, denied access, repeat clicks, command changes and reduced motion.
The clean-download CI job runs the generated-page check after reconstruction.

For a deployment, also check HTTP status, response headers and actual responses
for representative homepage, guide, category, directory, skill, missing-page and
search URLs. Check crawler access through Cloudflare without weakening existing
security policies. A user-agent-string request is a smoke test, not proof that
requests from every crawler network will be admitted.

## Research basis

Primary documentation and publisher research consulted on September 25, 2026:

- [Google: AI features and your website](https://developers.google.com/search/docs/appearance/ai-features)
  and [optimization for generative AI features](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide):
  apply normal crawling and content-quality practices. Google does not require a
  special AI schema or `llms.txt` file. Important information should be accessible
  as text, with structured data matching the page.
- [Ahrefs: AI visibility guide](https://ahrefs.com/blog/ai-visibility/):
  assess mentions and citations across different platforms and questions; results
  vary. This informed the task-oriented page map and the measurement plan.
- [Ahrefs: what is llms.txt?](https://ahrefs.com/blog/what-is-llms-txt/):
  its published research does not establish an AI-search ranking benefit from
  the file. The library maintains it for explicit agent/documentation use.
- [Semrush: generative engine optimization](https://www.semrush.com/blog/generative-engine-optimization/):
  make useful topic-specific content accessible and establish credibility through
  real references and mentions. Avoid speculative formatting tricks.
- [OpenAI crawler documentation](https://developers.openai.com/api/docs/bots):
  `OAI-SearchBot` controls search crawling; `GPTBot` serves a separate training
  purpose. Existing `robots.txt` access is preserved rather than inventing a
  requirement to allow model training for search eligibility.
- [IndexNow documentation](https://www.indexnow.org/documentation):
  public key verification and a same-host batch of up to 10,000 URLs.
- [Agent Skills specification](https://agentskills.io/specification),
  [official skill authoring and Codex discovery documentation](https://learn.chatgpt.com/docs/build-skills),
  and [Claude Code skills documentation](https://code.claude.com/docs/en/skills):
  folder layout and compatibility details for the installation guides.

Public pages from [skills.sh](https://www.skills.sh/) and
[SkillsMP](https://skillsmp.com/) were reviewed as category context. Their catalog
size and popularity signals are not interchangeable with this library's
source/manifest checks. Skill Library's useful distinction is complete pinned
downloads, visible licenses/checksums and one portable installer; it does not
claim to be the largest directory or rank above those sites.

No authenticated Ahrefs/Semrush keyword, backlink or ranking report was accessed.
No volume, keyword-difficulty score, backlink count or number-one ranking is
claimed from these public pages.

## Measurement after publication

Use the verified Google Search Console property to submit the sitemap and inspect
the homepage, an installation guide, a category and representative skill pages.
Record indexing, impressions, clicks, queries and average position before making
further changes. Use available AI-search reports and a consistent set of prompts
to observe citations; separate mentions from actual visits.

Track real task outcomes as well: a visitor finds a relevant skill, reads it,
copies the intended file/command or downloads the complete folder. Useful new
guides, maintained source records, legitimate upstream references and real
community use can improve discovery over time. Do not manufacture reviews,
endorsements, links or bulk thin pages. No implementation can guarantee the first
result for a query or control a third-party assistant's recommendation.
