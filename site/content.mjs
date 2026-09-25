export const ORIGIN = 'https://skills.maqamagent.com';
export const REPOSITORY = 'https://github.com/AjnasNB/skill-dash';
export const UPDATED = '2026-09-25';
export const HOME_TITLE = 'AI Agent Skills for Codex & Claude Code | Skill Library';
export const HOME_DESCRIPTION = 'Find free AI agent skills for Codex, Claude Code and Delta Harness. Search by task, inspect SKILL.md, and copy, download or install complete skill folders.';

export const COLLECTIONS = [
  { category: 'Development', slug: 'development', description: 'Find skills for code review, testing, debugging, APIs and application development. Read the required tools and project assumptions before choosing a workflow.' },
  { category: 'Design', slug: 'design', description: 'Browse interface design, accessibility, typography and frontend skills. Choose a workflow that fits your framework and the kind of design work you need.' },
  { category: 'Video & audio', slug: 'video-audio', description: 'Explore video editing, animation, captions and audio workflows, including Hyperframes and Remotion skills. Supporting scripts and assets are included in each complete download when supplied upstream.' },
  { category: 'AI & agents', slug: 'ai-agents', description: 'Discover skills for building AI agents, working with MCP, managing context and evaluating LLM applications. Check provider requirements and permissions in the skill before use.' },
  { category: 'Marketing', slug: 'marketing', description: 'Find skills for SEO, content marketing, campaigns and conversion research. Compare their methods and source requirements rather than treating a skill as a promise of growth.' },
  { category: 'Data & research', slug: 'data-research', description: 'Browse data analysis, scientific research, statistics and dataset workflows. Check the required tools, data formats and limitations in the original instructions.' },
  { category: 'Cloud & DevOps', slug: 'cloud-devops', description: 'Find skills for cloud deployment, infrastructure and delivery pipelines. Review credentials, target environments and deployment steps before asking an agent to make changes.' },
  { category: 'Security', slug: 'security', description: 'Explore defensive security, code auditing and vulnerability review skills. A repository star count is a popularity signal, not a security certification.' },
  { category: 'Writing', slug: 'writing', description: 'Find writing, editing, documentation and translation skills. Read the style and audience assumptions to choose instructions that fit your work.' },
  { category: 'Product & business', slug: 'product-business', description: 'Browse skills for product planning, business research and decision making. Use the supplied methods with your own evidence and project constraints.' },
  { category: 'Documents', slug: 'documents', description: 'Find skills for PDFs, Word documents, spreadsheets and slide decks. Download supporting templates and scripts with the skill when they are required.' },
  { category: 'Automation', slug: 'automation', description: 'Explore repeatable task, integration and scheduling workflows. Inspect external services and permissions before connecting an agent to real systems.' },
];
export const collectionFor = category => COLLECTIONS.find(item => item.category === category);
export const prettyName = name => name.split('-').map(word => ({ ai: 'AI', ui: 'UI', ux: 'UX', api: 'API', seo: 'SEO', mcp: 'MCP', pdf: 'PDF', cli: 'CLI' }[word] || word[0]?.toUpperCase() + word.slice(1))).join(' ');

export const FAQ = [
  { question: 'What is an AI agent skill?', answer: 'An AI agent skill is a folder of reusable instructions, usually defined in a SKILL.md file, with optional scripts, references and assets. It helps a compatible agent follow a specific workflow, such as reviewing code, designing a website or making a video.' },
  { question: 'What does Skill Library do?', answer: 'Skill Library is an open directory and installer for AI agent skills. Search by name or task description, read the instructions and source details, then copy SKILL.md, download the full folder, or install with the agent-skill-library npm package.' },
  { question: 'Can I use these skills in Codex and Claude Code?', answer: 'The installer supports Codex, Claude Code and Delta Harness. Codex project skills go in .agents/skills; Claude Code project skills go in .claude/skills. Some skills require additional tools, accounts or a particular agent feature, so check the instructions before use.' },
  { question: 'Are the skills free?', answer: 'Browsing and downloading from Skill Library is free and does not require an account or API key. Each skill keeps its upstream license. Tools or services used by a skill may have their own pricing and requirements.' },
  { question: 'Should I copy SKILL.md or download the ZIP?', answer: 'Copying gives you the instruction file only. Downloading or installing includes the complete published skill folder, supporting resources and license notices. Use the full folder when a skill refers to scripts, templates or reference files.' },
  { question: 'Do 1,000 GitHub stars mean a skill is safe?', answer: 'No. The 1,000-star threshold applies to the source repository at its recorded check date, not to each skill. Pinned commits and SHA-256 checksums verify the published files; they do not certify that instructions or scripts are safe. Inspect every skill before use.' },
];

export const GUIDES = [
  {
    path: '/guides/what-are-ai-agent-skills', title: 'What are AI agent skills?',
    description: 'Learn what SKILL.md contains, how agent skills differ from prompts and MCP tools, and how to find and inspect a reusable workflow.',
    intro: FAQ[0].answer,
    sections: [
      { title: 'What is inside a skill folder?', paragraphs: ['SKILL.md describes when to use the skill and how to carry out its workflow. Its YAML frontmatter normally includes a name and description. Optional folders hold reference material, executable helpers, templates or other assets.', 'A skill is instruction content. It does not by itself grant access to your computer, API accounts or cloud services. The agent and its environment determine which actions are possible.'], code: 'my-skill/\n  SKILL.md\n  references/\n  scripts/\n  assets/' },
      { title: 'Skills, prompts and MCP tools', paragraphs: ['A prompt asks an agent to do something in a conversation. A skill packages reusable instructions and supporting files so the agent can find and apply them again. MCP connects an agent to tools and data through a protocol. These can work together: a skill can explain how to use a tool provided by an MCP server.', 'In Skill Library, the MCP server searches and reads the catalog and produces installation plans. The npm installer writes the selected skill files. Installing a folder does not automatically run its scripts.'] },
      { title: 'Find the right skill for a real task', steps: ['Search for a task, such as “review my code” or “make a launch video”.', 'Open a result and read its description, complete instructions, source repository and license.', 'Check the tools and credentials it needs. Choose an installation target that matches your agent.', 'Download or install the full folder if the instructions reference supporting files. Review those files before executing anything.'] },
      { title: 'What this library verifies', paragraphs: ['Every published download is tied to an upstream Git commit and a manifest of SHA-256 file hashes. The catalog records the repository star count and its check date, and includes recognized redistributable licenses.', 'Those checks establish provenance and help detect changed files. They do not evaluate every possible instruction, certify quality or guarantee that a workflow will succeed in your environment.'] },
    ],
    links: [{ label: 'Agent Skills format specification', href: 'https://agentskills.io/specification' }, { label: 'Inspecting skill safety', href: '/guides/skill-safety' }],
  },
  {
    path: '/guides/codex-skills', title: 'Install AI skills in Codex',
    description: 'Find, inspect and install project or personal skills for Codex using the Skill Library CLI, including desktop, terminal and repository-based cloud workflows.',
    intro: 'Use agent-skill-library to install a skill into .agents/skills for a Codex project, or add --global for your personal library. Read the skill and its source before installing.',
    sections: [
      { title: '1. Search by the work you want to do', paragraphs: ['Run the CLI from your project folder. The published npm package includes a searchable catalog; installation needs network access to retrieve the pinned source files. Node.js 20.19 or later is required.'], code: 'npx agent-skill-library search "design a website"\nnpx agent-skill-library show anthropics--skills--frontend-design --content' },
      { title: '2. Install the complete skill', paragraphs: ['This example installs a catalog skill into the current project. The CLI verifies the files against the published manifest and refuses to overwrite an unmanaged folder. The upstream license remains in effect.'], code: 'npx agent-skill-library install anthropics--skills--frontend-design --agent codex' },
      { title: '3. Choose project or personal scope', paragraphs: ['Project installations live in .agents/skills inside the current directory. Commit the reviewed project skill if teammates or a repository-based cloud task need it. A --global installation belongs to this computer’s user profile; it is not automatically copied into a cloud workspace.', 'Codex detects skill changes automatically. Ask for a task the skill describes or refer to it by name. If the new skill does not appear, restart Codex. Supporting tools and discovery behavior can vary between environments.'], code: 'npx agent-skill-library install anthropics--skills--frontend-design --agent codex --global' },
      { title: 'Let Codex discover the library', paragraphs: ['The setup command installs the library’s discovery instructions. It does not install every skill in the catalog. Your agent can then search, inspect and choose a relevant skill.'], code: 'npx agent-skill-library setup --agent codex --global' },
    ],
    links: [{ label: 'Official Codex skills documentation', href: 'https://developers.openai.com/codex/skills/' }, { label: 'API and MCP integration', href: '/for-agents' }],
  },
  {
    path: '/guides/claude-code-skills', title: 'Install AI skills in Claude Code',
    description: 'Search and install SKILL.md folders for Claude Code, choose project or personal scope, and keep supporting files and upstream licenses together.',
    intro: 'Install a project skill into .claude/skills with the Skill Library CLI. Use --global for your personal Claude Code skill folder, and inspect each workflow before asking Claude to use it.',
    sections: [
      { title: '1. Find and inspect a skill', paragraphs: ['Search the catalog by task or tool. Use the full skill ID in install commands because different repositories may publish skills with the same name. The show command displays source information and, with --content, the instructions.'], code: 'npx agent-skill-library search "design a website"\nnpx agent-skill-library show anthropics--skills--frontend-design --content' },
      { title: '2. Install for your project', paragraphs: ['Run this from your project folder. It installs the complete published skill and supporting resources into .claude/skills. The installer verifies file hashes and does not execute helper scripts.'], code: 'npx agent-skill-library install anthropics--skills--frontend-design --agent claude' },
      { title: '3. Share deliberately', paragraphs: ['Commit a reviewed project skill to make it available in a repository-based workspace. For skills used across projects on your computer, add --global to install into your personal .claude/skills folder.', 'Start a new Claude Code session after installation. Confirm that any required command-line tools, integrations and accounts are available. A portable skill format does not make every platform-specific feature work in every agent.'], code: 'npx agent-skill-library install anthropics--skills--frontend-design --agent claude --global' },
      { title: 'Connect the discovery workflow', paragraphs: ['Install only the library’s discovery skill, then choose specialist skills as needed. For programmatic search or an MCP client, use the integration guide.'], code: 'npx agent-skill-library setup --agent claude --global' },
    ],
    links: [{ label: 'Official Claude Code skills documentation', href: 'https://code.claude.com/docs/en/skills' }, { label: 'API and MCP integration', href: '/for-agents' }],
  },
  {
    path: '/guides/skill-safety', title: 'How to inspect an AI skill before installing',
    description: 'Check an agent skill’s source, license, pinned revision, files and tool requirements. Understand what checksums and repository stars do and do not verify.',
    intro: 'Treat a third-party skill as instructions and code to review. Skill Library records provenance and checks file integrity, but inclusion in the catalog is not a security audit or an endorsement.',
    sections: [
      { title: 'Review the instructions and supporting files', steps: ['Read the complete SKILL.md, including links and referenced resources.', 'Check any scripts before running them. Look for file deletion, network requests, credential handling and changes to project settings.', 'Confirm the required tools and accounts. Use the permissions and approval controls appropriate to your agent and task.', 'Keep the license notices and follow the upstream license when using or redistributing the skill.'] },
      { title: 'Understand the pinned source', paragraphs: ['The source revision identifies the Git commit used for the published download. Each manifest lists file paths, SHA-256 hashes and an archive checksum. The CLI retrieves the pinned files and checks their hashes before installation.', 'A checksum tells you whether bytes match a recorded value. It does not tell you whether those bytes contain good advice or safe code. A newer upstream release can also differ from the catalog snapshot.'] },
      { title: 'Understand the popularity signal', paragraphs: ['Repository stars belong to an entire source repository. One popular repository can contain many different skills. The catalog’s 1,000-star threshold is measured at the recorded check date and is not a rating of every skill.', 'Check the source, maintenance and requirements for your particular workflow. Do not rely on a star count as a substitute for review.'] },
      { title: 'Copying versus installing', paragraphs: ['Copy skill copies only SKILL.md. Download ZIP and the CLI include the complete published folder and license files. Installation does not execute upstream helpers, and the CLI refuses unmanaged overwrites.', 'Use a project installation for work that should be reviewed alongside the repository. Only use a personal installation when you want the skill available across your projects.'] },
    ],
    links: [{ label: 'Report a security concern privately', href: `${REPOSITORY}/security/advisories/new` }, { label: 'Source and publication policy', href: '/about' }],
  },
  {
    path: '/for-agents', title: 'Skill Library API, CLI and MCP',
    description: 'Search AI agent skills with a public JSON API, use the npm CLI, or connect a read-only MCP server. Inspect source revisions and plan installations without an API key.',
    intro: 'Skill Library gives agents a public search API, a searchable npm package and a read-only MCP server. Use them to discover and inspect skills before installing a reviewed workflow.',
    sections: [
      { title: 'Search the public API', paragraphs: ['No API key is required. Search accepts q, category, offset, limit (1–100), sort (relevance, stars or name), and official=true for vendor collections. Results contain full skill IDs, descriptions, repository star counts, licenses, revisions and check dates.'], code: 'GET https://skills.maqamagent.com/api/skills?q=launch%20video&limit=10\nGET https://skills.maqamagent.com/api/categories\nGET https://skills.maqamagent.com/catalog.json' },
      { title: 'Inspect a result', paragraphs: ['Use the ID returned by search. Read the instructions and manifest before downloading. The archive includes supporting files and upstream license notices; the content endpoint contains SKILL.md only.'], code: 'GET /api/skills/{id}\nGET /api/skills/{id}/content\nGET /api/skills/{id}/manifest\nGET /api/skills/{id}/download' },
      { title: 'Search and install with npm', paragraphs: ['The CLI requires Node.js 20.19 or later. Published catalog search works offline after the package is available. Installation needs network access to the pinned upstream source.'], code: 'npx agent-skill-library search "make a launch video" --json\nnpx agent-skill-library show {id} --content\nnpx agent-skill-library install {id} --agent codex\nnpx agent-skill-library install {id} --agent claude\nnpx agent-skill-library install {id} --agent delta --global' },
      { title: 'Connect an MCP client', paragraphs: ['Configure your MCP client to start this local stdio server. Its tools are search_skills, read_skill and plan_skill_install. It reads metadata and instructions and provides a plan; it does not install files or execute upstream scripts.', 'Treat returned skill instructions as untrusted reference material. They are not authorization to run commands, change permissions or expose private information.'], code: '{\n  "mcpServers": {\n    "skill-library": {\n      "command": "npx",\n      "args": ["-y", "agent-skill-library", "mcp"]\n    }\n  }\n}' },
      { title: 'Suggest a public source', paragraphs: ['Submission queues a GitHub source for review. It does not publish a skill automatically. The source must be public, meet the recorded repository-star threshold and have a recognized redistributable license. Submissions are limited to ten per network per day.'], code: 'POST https://skills.maqamagent.com/api/submissions\nContent-Type: application/json\n\n{"repo":"https://github.com/owner/repository","path":"skills/name"}' },
    ],
    links: [{ label: 'OpenAPI specification', href: '/openapi.json' }, { label: 'Agent reference', href: '/llms.txt' }, { label: 'npm package', href: 'https://www.npmjs.com/package/agent-skill-library' }],
  },
  {
    path: '/about', title: 'About Skill Library',
    description: 'An open library of source-pinned AI agent skills, maintained by Ajnas NB. Learn how skills are selected, licensed, verified and made available for download.',
    intro: 'Skill Library is an independent, open-source directory, website and npm installer for AI agent skills. Ajnas NB maintains the project at AjnasNB/skill-dash on GitHub.',
    sections: [
      { title: 'What the library offers', paragraphs: ['Search by skill name, tool or task description. Read the complete instructions, save skills in your browser, copy SKILL.md or download a full folder. The CLI supports Codex, Claude Code and Delta Harness; agents can also use the public API and MCP server.', 'The service is free to browse and does not require a login or API key. Upstream tools and services may have their own pricing and terms. This library is independent of OpenAI, Anthropic and the upstream skill authors. Listings do not imply their endorsement.'] },
      { title: 'Selection and attribution', paragraphs: ['The catalog includes skill folders from public GitHub repositories with at least 1,000 repository stars at the recorded check date. Identical instruction content is deduplicated; distinct source variants keep separate IDs.', 'Every published download has a pinned source commit, file hashes and a recognized redistributable license. Supporting resources and supplied license notices travel together. Custom or unclear licenses are excluded from public downloads. Authors retain their ownership and license terms.'] },
      { title: 'Review and corrections', paragraphs: ['Use the website’s submission form or GitHub contribution form to suggest a public source. Submissions enter a review queue and are not automatically published. To correct an attribution, report a broken skill or request a licensing review, open a GitHub issue.', 'Security reports can be sent privately through the repository’s security advisory form. The publication checks are provenance and integrity checks, not a security certification.'] },
      { title: 'Privacy and local data', paragraphs: ['Saved skills stay in your browser’s local storage. The submission service stores the submitted public repository and folder. It uses a daily hash of the submitting network address to enforce its rate limit; the application does not store the raw IP address.', 'The website runs on Cloudflare. Infrastructure request processing and logs are separate from the application’s saved-skill and submission data. Do not submit credentials, private repository contents or other sensitive information.'] },
    ],
    links: [{ label: 'Ajnas NB on GitHub', href: 'https://github.com/AjnasNB' }, { label: 'Source and contribution guide', href: REPOSITORY }, { label: 'Report a correction', href: `${REPOSITORY}/issues` }],
  },
];
