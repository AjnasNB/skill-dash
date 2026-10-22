import { ORIGIN, REPOSITORY, HOME_TITLE, HOME_DESCRIPTION, FAQ, prettyName } from './content.mjs';
import packageInfo from '../package.json' with { type: 'json' };

export const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
export const jsonForHtml = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
export const compactDescription = value => {
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text.length <= 170 ? text : `${text.slice(0, 167).replace(/\s+\S*$/, '')}…`;
};
export function metadata({ path = '/', title = HOME_TITLE, description = HOME_DESCRIPTION, type = 'website', robots = 'index, follow, max-image-preview:large' } = {}) {
  return { title, description: compactDescription(description), url: `${ORIGIN}${path}`, type, robots };
}
export function skillMetadata(skill) {
  // The registry appends a content suffix when one repository repeats a skill name.
  const source = /-[a-f0-9]{8}$/.test(skill.id) ? `${skill.repo}/${skill.path}` : skill.repo;
  return metadata({ path: `/skills/${skill.id}`, title: `${prettyName(skill.name)} AI Skill — ${source} | SkillDash`, description: skill.description, type: 'article' });
}
export function homeSchema() {
  const creator = { '@type': 'Person', name: 'Ajnas NB', url: 'https://github.com/AjnasNB' };
  return [
    { '@type': 'WebSite', '@id': `${ORIGIN}/#website`, name: 'SkillDash', alternateName: ['Skill Dash', 'Skill Library', 'Agent Skill Library'], url: `${ORIGIN}/`, description: HOME_DESCRIPTION, creator,
      potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: `${ORIGIN}/?q={search_term_string}` }, 'query-input': 'required name=search_term_string' } },
    { '@type': 'SoftwareApplication', '@id': `${ORIGIN}/#software`, name: 'SkillDash', applicationCategory: 'DeveloperApplication', softwareVersion: packageInfo.version, isAccessibleForFree: true, url: `${ORIGIN}/`, description: HOME_DESCRIPTION, author: creator, downloadUrl: 'https://www.npmjs.com/package/agent-skill-library', sameAs: [REPOSITORY], offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } },
    { '@type': 'Organization', '@id': `${ORIGIN}/#organization`, name: 'SkillDash', url: `${ORIGIN}/`, logo: `${ORIGIN}/favicon.svg`, sameAs: [REPOSITORY, 'https://www.npmjs.com/package/agent-skill-library'] },
    { '@type': 'FAQPage', '@id': `${ORIGIN}/#faq-heading`, mainEntity: FAQ.map(item => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })) },
  ];
}
export function renderHead(meta, graph = []) {
  return `<title>${escapeHtml(meta.title)}</title>
<meta name="description" content="${escapeHtml(meta.description)}">
<meta name="robots" content="${escapeHtml(meta.robots)}">
<link rel="canonical" href="${escapeHtml(meta.url)}">
<link rel="alternate" type="text/markdown" href="${ORIGIN}/agent.md" title="SkillDash agent instructions">
<link rel="describedby" type="application/json" href="${ORIGIN}/.well-known/agent.json">
<link rel="service-desc" type="application/vnd.oai.openapi+json" href="${ORIGIN}/openapi.json">
<meta property="og:site_name" content="SkillDash">
<meta property="og:title" content="${escapeHtml(meta.title)}">
<meta property="og:description" content="${escapeHtml(meta.description)}">
<meta property="og:url" content="${escapeHtml(meta.url)}">
<meta property="og:type" content="${meta.type === 'article' ? 'article' : 'website'}">
<meta property="og:image" content="${ORIGIN}/social-card.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="SkillDash — the free Skill Library and AI products directory">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(meta.title)}">
<meta name="twitter:description" content="${escapeHtml(meta.description)}">
<meta name="twitter:image" content="${ORIGIN}/social-card.png">
${graph.length ? `<script type="application/ld+json" id="page-schema">${jsonForHtml({ '@context': 'https://schema.org', '@graph': graph })}</script>` : ''}`;
}
export function breadcrumbs(items) {
  return { '@type': 'BreadcrumbList', itemListElement: items.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, item: `${ORIGIN}${item.path}` })) };
}
export function skillSchema(skill) {
  return {
    '@type': 'DigitalDocument', '@id': `${ORIGIN}/skills/${skill.id}#skill`,
    name: prettyName(skill.name), description: skill.description,
    url: `${ORIGIN}/skills/${skill.id}`, identifier: skill.id, version: skill.revision,
    genre: skill.category, isAccessibleForFree: true,
    license: `https://spdx.org/licenses/${encodeURIComponent(skill.license)}.html`,
    citation: skill.sourceUrl,
    associatedMedia: [
      { '@type': 'MediaObject', contentUrl: `${ORIGIN}/documents/${skill.id}.md`, encodingFormat: 'text/markdown' },
      { '@type': 'MediaObject', contentUrl: `${ORIGIN}/bundles/${skill.id}.zip`, encodingFormat: 'application/zip' },
    ],
  };
}
export function stripFrontmatter(text) {
  return text.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}
