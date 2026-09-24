export const CATEGORIES = [
  'Development', 'Design', 'Video & audio', 'AI & agents', 'Marketing',
  'Data & research', 'Cloud & DevOps', 'Security', 'Writing',
  'Product & business', 'Documents', 'Automation',
];

const stopWords = new Set('a an the and or for to of in on with this that please help me make create build need want using use my our your some how can'.split(' '));
const groups = [
  ['video', 'film', 'movie', 'reel', 'brag', 'hyperframes', 'remotion', 'editing'],
  ['design', 'ui', 'ux', 'interface', 'frontend', 'aesthetic', 'visual'],
  ['deploy', 'deployment', 'hosting', 'cloud', 'wrangler', 'vercel'],
  ['test', 'testing', 'tests', 'qa', 'playwright', 'verification'],
  ['search', 'research', 'find', 'discover', 'retrieval'],
  ['writing', 'write', 'copy', 'copywriting', 'content'],
  ['presentation', 'slides', 'powerpoint', 'pptx', 'deck'],
  ['spreadsheet', 'excel', 'xlsx', 'csv'],
  ['database', 'sql', 'postgres', 'postgresql', 'sqlite'],
];

export function words(text) {
  return [...new Set(String(text).toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}+#.]+/gu) ?? [])]
    .filter(word => word.length > 1 && !stopWords.has(word));
}

export function categoryFor(name, description) {
  const text = `${name} ${description}`.toLowerCase();
  const rules = [
    ['Video & audio', /\b(video|hyperframes|remotion|audio|music|sound|podcast|captions|brag|reel|voiceover)\b/],
    ['Documents', /\b(pdf|docx|pptx|xlsx|spreadsheet|powerpoint|slides|word documents)\b/],
    ['Design', /\b(design|ui|ux|figma|typography|aesthetic|webgl|three\.?js|css|animation|accessibility)\b/],
    ['Security', /\b(security|vulnerabilit\w*|penetration|owasp|threat|forensic\w*|malware|zero.trust)\b/],
    ['Marketing', /\b(marketing|seo|campaign|conversion|advertising|social media|growth|copywriting)\b/],
    ['Cloud & DevOps', /\b(devops|cloudflare|kubernetes|docker|terraform|aws|azure|vercel|deploy\w*|infrastructure|ci.cd)\b/],
    ['Data & research', /\b(research|scientific|biology|chemistry|physics|genomic\w*|data science|pandas|statistics|bioinformatics|dataset)\b/],
    ['AI & agents', /\b(llm|agent|agents|mcp|prompt|rag|machine learning|inference|embedding|context engineering)\b/],
    ['Product & business', /\b(product management|business|strategy|pricing|finance|roadmap|stakeholder|entrepreneur|sales|startup)\b/],
    ['Writing', /\b(writing|write|documentation|editorial|proofread|storytelling|content|translation)\b/],
    ['Automation', /\b(automation|workflow|integrat\w*|zapier|n8n|scheduling|scraping)\b/],
  ];
  return rules.find(([, pattern]) => pattern.test(text))?.[0] ?? 'Development';
}

export function searchCatalog(catalog, options = {}) {
  const { query = '', category = '', minStars = 0, official = false, sort = 'relevance', offset = 0, limit = 24 } = options;
  const all = Array.isArray(catalog) ? catalog : catalog.skills;
  const raw = String(query).trim().toLowerCase();
  const terms = words(raw);
  const expansions = new Set(groups.filter(group => terms.some(term => group.includes(term))).flat());
  const scored = [];
  for (const skill of all) {
    if ((category && skill.category !== category) || skill.stars < Number(minStars) || (official && !skill.official)) continue;
    const name = skill.name.toLowerCase();
    const desc = skill.description.toLowerCase();
    const extra = `${skill.repo} ${skill.category} ${(skill.tags ?? []).join(' ')}`.toLowerCase();
    let score = 0, matched = 0;
    for (const term of terms) {
      const points = name === term ? 32 : name.includes(term) ? 14 : desc.includes(term) ? 6 : extra.includes(term) ? 3 : 0;
      score += points;
      if (points) matched++;
    }
    if (raw && name === raw) score += 100;
    else if (raw && desc.includes(raw)) score += 15;
    for (const term of expansions) {
      if (!terms.includes(term) && `${name} ${desc}`.includes(term)) score += 0.5;
    }
    if (terms.length && !score) continue;
    if (terms.length) score *= 0.5 + matched / terms.length;
    scored.push({ skill, score });
  }
  scored.sort((a, b) =>
    (sort === 'name' ? a.skill.name.localeCompare(b.skill.name) :
      sort === 'stars' ? b.skill.stars - a.skill.stars :
        b.score - a.score || Number(Boolean(b.skill.featured)) - Number(Boolean(a.skill.featured)) ||
        Number(Boolean(b.skill.official)) - Number(Boolean(a.skill.official)) || b.skill.stars - a.skill.stars)
    || a.skill.id.localeCompare(b.skill.id));
  const start = Math.max(0, Math.floor(Number(offset) || 0));
  const count = Math.min(100, Math.max(1, Math.floor(Number(limit) || 24)));
  return { total: scored.length, offset: start, limit: count, skills: scored.slice(start, start + count).map(x => x.skill) };
}

export function resolveSkill(catalog, input) {
  const all = Array.isArray(catalog) ? catalog : catalog.skills;
  const exact = all.find(skill => skill.id === input);
  if (exact) return exact;
  const named = all.filter(skill => skill.name.toLowerCase() === String(input).toLowerCase());
  if (named.length === 1) return named[0];
  if (named.length > 1) throw new Error(`Several sources provide "${input}". Use a full ID:\n${named.map(s => `  ${s.id} (${s.repo})`).join('\n')}`);
  throw new Error(`Skill "${input}" was not found. Run skill-library search "${input}".`);
}
