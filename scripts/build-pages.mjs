import fs from 'node:fs/promises';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { searchCatalog } from '../lib/search.mjs';
import { ORIGIN, REPOSITORY, UPDATED, COLLECTIONS, GUIDES, FAQ, HOME_DESCRIPTION, prettyName, collectionFor } from '../site/content.mjs';
import { escapeHtml as e, jsonForHtml, metadata, skillMetadata, renderHead, breadcrumbs, skillSchema, stripFrontmatter } from '../site/seo.mjs';

const root = path.resolve(import.meta.dirname, '..');
const link = (href, text) => `<a href="${e(href)}">${e(text)}</a>`;
const header = `<header class="site-header"><a class="wordmark" href="/" aria-label="Skill Library home"><span class="brand-mark">▦</span>skill library<span class="beta-tag">OPEN</span></a><nav aria-label="Main navigation">${link('/skills', 'All skills')}${link('/#categories', 'Categories')}${link('/for-agents', 'For agents')}</nav><a class="button" href="${REPOSITORY}">GitHub ↗</a></header>`;
const footer = `<footer><a class="footer-brand" href="/">skill library<span>Open AI skills. Clear provenance.</span></a><div>${link('/about', 'About')}${link('/guides/skill-safety', 'Skill safety')}${link('/for-agents', 'API & MCP')}${link('/skills', 'All skills')}</div></footer>`;
const trail = items => `<nav class="breadcrumbs" aria-label="Breadcrumb">${items.map((item, i) => i === items.length - 1 ? `<span aria-current="page">${e(item.name)}</span>` : link(item.path, item.name)).join('<span aria-hidden="true">/</span>')}</nav>`;
const itemList = skills => ({ '@type': 'ItemList', itemListElement: skills.map((skill, index) => ({ '@type': 'ListItem', position: index + 1, name: prettyName(skill.name), url: `${ORIGIN}/skills/${skill.id}` })) });
const cards = skills => `<div class="skill-grid">${skills.map(skill => `<article class="skill-card"><a class="card-main" href="/skills/${skill.id}"><h3>${e(prettyName(skill.name))} ↗</h3><span class="card-owner">${e(skill.repo)}</span><p>${e(skill.description)}</p></a><div class="card-bottom"><span class="category-label">${e(skill.category)}</span><span class="stars">${Number(skill.stars).toLocaleString('en-US')} repo stars</span></div></article>`).join('')}</div>`;
const sections = guide => guide.sections.map(section => `<section class="reading-section"><h2>${e(section.title)}</h2>${(section.paragraphs || []).map(p => `<p>${e(p)}</p>`).join('')}${section.steps ? `<ol>${section.steps.map(step => `<li>${e(step)}</li>`).join('')}</ol>` : ''}${section.code ? `<pre><code>${e(section.code)}</code></pre>` : ''}</section>`).join('');
const readingLinks = links => `<ul class="reading-links">${links.map(item => `<li>${link(item.href, item.label)}</li>`).join('')}</ul>`;
const faqs = () => `<section class="library-explainer" aria-labelledby="faq-heading"><h2 id="faq-heading">AI agent skills, explained</h2><div class="faq-grid">${FAQ.map(item => `<details><summary>${e(item.question)}</summary><p>${e(item.answer)}</p></details>`).join('')}</div>${readingLinks([{ href: '/guides/what-are-ai-agent-skills', label: 'A practical guide to AI agent skills' }, { href: '/guides/codex-skills', label: 'Install skills in Codex' }, { href: '/guides/claude-code-skills', label: 'Install skills in Claude Code' }])}</section>`;
const guideMarkdown = guide => `# ${guide.title}\n\n${guide.intro}\n\n${guide.sections.map(section => `## ${section.title}\n\n${(section.paragraphs || []).join('\n\n')}${section.steps ? `\n\n${section.steps.map((step, i) => `${i + 1}. ${step}`).join('\n')}` : ''}${section.code ? `\n\n\`\`\`text\n${section.code}\n\`\`\`` : ''}`).join('\n\n')}\n\n## References\n\n${guide.links.map(item => `- [${item.label}](${item.href.startsWith('/') ? ORIGIN + item.href : item.href})`).join('\n')}\n\nMaintained by Ajnas NB. Reviewed ${UPDATED}.\n`;

export async function buildPublicPages(output, catalog) {
  const template = await fs.readFile(path.join(output, 'index.html'), 'utf8');
  if (!template.includes('<!-- SEO_HEAD -->') || !template.includes('<div id="root"></div>')) throw new Error('SEO template markers are missing.');
  const featured = searchCatalog(catalog, { limit: 24 }).skills;
  const bootstrap = skill => ({ catalog: { total: catalog.total, sourceCount: catalog.sourceCount, generatedAt: catalog.generatedAt, categories: catalog.categories, skills: skill && !featured.some(item => item.id === skill.id) ? [...featured, skill] : featured } });
  const render = ({ meta, body, graph = [], interactive = false, initial = null, alternate = null }) => {
    let html = template.replace('<!-- SEO_HEAD -->', () => renderHead(meta, graph) + '<link rel="stylesheet" href="/reading.css">' + (alternate ? `<link rel="alternate" type="text/markdown" href="${ORIGIN}${alternate}">` : ''))
      .replace('<div id="root"></div>', () => `<div id="root">${body}</div>${initial ? `<script type="application/json" id="skill-library-bootstrap">${jsonForHtml(initial)}</script>` : ''}`);
    if (!interactive) html = html.replace(/<script\b[^>]*type="module"[^>]*>[\s\S]*?<\/script>/g, '').replace(/<link\b[^>]*rel="modulepreload"[^>]*>/g, '');
    return html;
  };
  const write = async (file, value) => { await fs.mkdir(path.dirname(path.join(output, file)), { recursive: true }); await fs.writeFile(path.join(output, file), value); };
  const staticPaths = [{ path: '/', lastmod: UPDATED }];
  const count = catalog.total.toLocaleString('en-US');
  const categoryLinks = `<section id="categories" class="library-explainer"><h2>Explore AI skills by category</h2><div class="topic-links">${COLLECTIONS.map(item => link(`/collections/${item.slug}`, item.category)).join('')}</div></section>`;
  const home = `${header}<main><section class="hero static-hero"><div class="hero-copy"><div class="open-label">OPEN SKILLS. ENDLESS POSSIBILITIES.</div><h1>Good agents.<br><span>Great AI skills.</span></h1><p>Search ${count} free AI agent skills. Read the instructions, copy a skill, or download its full folder for Codex, Claude Code and Delta Harness.</p></div><div class="home-start"><h2>Find a workflow for your next task</h2><p>${e(HOME_DESCRIPTION)}</p>${link('/guides/what-are-ai-agent-skills', 'Learn how AI skills work →')}</div></section><form class="search-box" action="/" role="search"><label for="static-search" class="sr-only">Search skills by name or description</label><input id="static-search" name="q" placeholder="What do you want your agent to do?"><button class="button" type="submit">Search</button></form><section class="reading-section"><h2>Discover your next skill</h2><p>${count} skills from ${catalog.sourceCount} source repositories. Star counts were recorded on ${e(catalog.generatedAt.slice(0, 10))} and belong to repositories, not individual skills.</p>${cards(featured)}${readingLinks([{ href: '/skills', label: `Browse all ${count} skills` }])}</section>${categoryLinks}${faqs()}</main>${footer}`;
  const website = { '@type': 'WebSite', '@id': `${ORIGIN}/#website`, name: 'Skill Library', alternateName: 'Agent Skill Library', url: `${ORIGIN}/`, description: HOME_DESCRIPTION, creator: { '@type': 'Person', name: 'Ajnas NB', url: 'https://github.com/AjnasNB' }, potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: `${ORIGIN}/?q={search_term_string}` }, 'query-input': 'required name=search_term_string' } };
  await write('index.html', render({ meta: metadata(), body: home, graph: [website, itemList(featured)], interactive: true, initial: bootstrap() }));

  for (const guide of GUIDES) {
    const items = [{ name: 'Skill Library', path: '/' }, { name: guide.title, path: guide.path }];
    const meta = metadata({ path: guide.path, title: `${guide.title} | Skill Library`, description: guide.description, type: 'article' });
    const body = `${header}<main class="reading-page">${trail(items)}<article><header class="reading-header"><span class="eyebrow">SKILL LIBRARY GUIDE</span><h1>${e(guide.title)}</h1><p class="reading-lead">${e(guide.intro)}</p><p class="byline">By ${link('https://github.com/AjnasNB', 'Ajnas NB')} · Reviewed <time datetime="${UPDATED}">September 25, 2026</time></p></header>${sections(guide)}<section class="reading-section"><h2>References and next steps</h2>${readingLinks(guide.links)}</section></article></main>${footer}`;
    const graph = [breadcrumbs(items), { '@type': 'Article', headline: guide.title, description: guide.description, url: `${ORIGIN}${guide.path}`, mainEntityOfPage: `${ORIGIN}${guide.path}`, author: { '@type': 'Person', name: 'Ajnas NB', url: 'https://github.com/AjnasNB' }, dateModified: UPDATED, image: `${ORIGIN}/social-card.png` }];
    await write(`${guide.path.slice(1)}.html`, render({ meta, body, graph, alternate: `${guide.path}.md` }));
    await write(`${guide.path.slice(1)}.md`, guideMarkdown(guide));
    staticPaths.push({ path: guide.path, lastmod: UPDATED });
  }

  for (const collection of COLLECTIONS) {
    const result = searchCatalog(catalog, { category: collection.category, limit: 24 });
    const route = `/collections/${collection.slug}`;
    const title = `${collection.category} skills for AI agents`;
    const items = [{ name: 'Skill Library', path: '/' }, { name: collection.category, path: route }];
    const body = `${header}<main class="directory-page">${trail(items)}<header class="reading-header"><span class="eyebrow">${result.total.toLocaleString('en-US')} SKILLS</span><h1>${e(title)}</h1><p class="reading-lead">${e(collection.description)}</p><p>Compare the description, license and required tools. These skills can be installed with Skill Library; individual agent and tool requirements vary.</p></header>${cards(result.skills)}<div class="reading-section">${link(`/?category=${encodeURIComponent(collection.category)}`, `Search all ${result.total.toLocaleString('en-US')} ${collection.category.toLowerCase()} skills →`)}</div>${categoryLinks}</main>${footer}`;
    await write(`${route.slice(1)}.html`, render({ meta: metadata({ path: route, title: `${title} | Skill Library`, description: collection.description }), body, graph: [breadcrumbs(items), itemList(result.skills)] }));
    staticPaths.push({ path: route, lastmod: UPDATED });
  }

  const pages = Math.ceil(catalog.total / 48);
  for (let page = 1; page <= pages; page++) {
    const route = page === 1 ? '/skills' : `/skills?page=${page}`;
    const result = searchCatalog(catalog, { limit: 48, offset: (page - 1) * 48, sort: 'name' });
    const pagination = `<nav class="pagination" aria-label="Skill directory pages">${page > 1 ? link(page === 2 ? '/skills' : `/skills?page=${page - 1}`, '← Previous') : '<span></span>'}<span>Page ${page} of ${pages}</span>${page < pages ? link(`/skills?page=${page + 1}`, 'Next →') : '<span></span>'}</nav>`;
    const body = `${header}<main class="directory-page">${trail([{ name: 'Skill Library', path: '/' }, { name: 'All AI agent skills', path: '/skills' }])}<header class="reading-header"><span class="eyebrow">THE COMPLETE DIRECTORY</span><h1>All AI agent skills</h1><p class="reading-lead">Browse ${count} skills alphabetically. Each page links to complete instructions, source details and downloads.</p><p>Showing ${(page - 1) * 48 + 1}–${Math.min(page * 48, catalog.total)} of ${count}. ${link('/#catalog', 'Search by task instead →')}</p></header>${pagination}${cards(result.skills)}${pagination}</main>${footer}`;
    await write(`directory/page-${page}.html`, render({ meta: metadata({ path: route, title: `All ${count} AI Agent Skills${page > 1 ? ` — Page ${page}` : ''} | Skill Library`, description: `Browse source-pinned AI agent skills for Codex, Claude Code and Delta Harness. Alphabetical directory, page ${page} of ${pages}, with instructions and complete downloads.` }), body, graph: [itemList(result.skills)] }));
    staticPaths.push({ path: route, lastmod: UPDATED });
  }

  const relatedByCategory = new Map(COLLECTIONS.map(item => [item.category, searchCatalog(catalog, { category: item.category, limit: 4 }).skills]));
  for (const skill of catalog.skills) {
    const text = await fs.readFile(path.join(root, '.cache/documents', `${skill.id}.md`), 'utf8');
    const collection = collectionFor(skill.category);
    const items = [{ name: 'Skill Library', path: '/' }, { name: skill.category, path: `/collections/${collection.slug}` }, { name: prettyName(skill.name), path: `/skills/${skill.id}` }];
    const markdown = renderToStaticMarkup(React.createElement(ReactMarkdown, {
      remarkPlugins: [remarkGfm],
      components: {
        a: ({ href, children }) => React.createElement('a', { href: href && !/^[a-z]+:/i.test(href) && !href.startsWith('#') ? `${skill.sourceUrl}/${href}` : href, rel: 'noreferrer' }, children),
        img: ({ alt }) => React.createElement('span', { className: 'image-reference' }, `[Upstream image: ${alt || 'view at source'}]`),
      },
    }, stripFrontmatter(text)));
    const related = relatedByCategory.get(skill.category).filter(item => item.id !== skill.id).slice(0, 3);
    const body = `${header}<main class="reading-page static-skill">${trail(items)}<article><header class="reading-header"><span class="eyebrow">${e(skill.category)} · AI AGENT SKILL</span><h1>${e(prettyName(skill.name))}</h1><p class="reading-lead">${e(skill.description)}</p></header><dl class="source-facts"><div><dt>Source</dt><dd>${link(skill.sourceUrl, skill.repo)}</dd></div><div><dt>Repository stars</dt><dd>${Number(skill.stars).toLocaleString('en-US')} at the recorded check</dd></div><div><dt>Source checked</dt><dd>${e(skill.checkedAt.slice(0, 10))}</dd></div><div><dt>License</dt><dd>${e(skill.license)}</dd></div><div><dt>Pinned commit</dt><dd><code>${e(skill.revision)}</code></dd></div></dl><section class="reading-section"><h2>Install this skill</h2><p>Choose an agent. Project installs use .agents/skills for Codex or .claude/skills for Claude Code. Delta uses the personal library. Review required tools in the instructions below.</p><pre><code>npx agent-skill-library install ${skill.id} --agent codex\nnpx agent-skill-library install ${skill.id} --agent claude\nnpx agent-skill-library install ${skill.id} --agent delta --global</code></pre><div class="reading-actions"><a class="button button-green" href="/bundles/${skill.id}.zip" download>Download complete ZIP</a>${link(`/documents/${skill.id}.md`, 'Read raw SKILL.md')}${link(`/manifests/${skill.id}.json`, 'Inspect checksums')}</div><p>The archive contains ${skill.fileCount} files, including supporting resources and license notices. Copying SKILL.md alone does not include these resources. ${link('/guides/skill-safety', 'Review skills before use.')}</p></section><section class="reading-section"><h2>Skill instructions</h2><div class="markdown">${markdown}</div></section><section class="reading-section"><h2>Related ${e(skill.category.toLowerCase())} skills</h2>${cards(related)}${readingLinks([{ href: `/collections/${collection.slug}`, label: `Browse ${skill.category.toLowerCase()} skills` }, { href: '/guides/codex-skills', label: 'Codex installation guide' }, { href: '/guides/claude-code-skills', label: 'Claude Code installation guide' }])}</section></article></main>${footer}`;
    const initial = bootstrap(skill);
    initial.preview = { id: skill.id, text };
    await write(`skills/${skill.id}.html`, render({ meta: skillMetadata(skill), body, graph: [breadcrumbs(items), skillSchema(skill)], interactive: true, initial, alternate: `/documents/${skill.id}.md` }));
  }

  await write('404.html', render({ meta: metadata({ title: 'Page not found | Skill Library', robots: 'noindex, follow' }), body: `${header}<main class="reading-page"><header class="reading-header"><h1>That page is not in the library.</h1><p class="reading-lead">The skill or guide may have moved. Search the current catalog or browse a category.</p>${readingLinks([{ href: '/', label: 'Search Skill Library' }, { href: '/skills', label: 'Browse all AI agent skills' }])}</header>${categoryLinks}</main>${footer}` }));
  const xml = entries => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map(item => `<url><loc>${e(ORIGIN + item.path)}</loc><lastmod>${e(item.lastmod)}</lastmod></url>`).join('\n')}\n</urlset>\n`;
  await write('sitemaps/pages.xml', xml(staticPaths));
  await write('sitemaps/skills.xml', xml(catalog.skills.map(skill => ({ path: `/skills/${skill.id}`, lastmod: UPDATED }))));
  await write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${ORIGIN}/sitemaps/pages.xml</loc></sitemap><sitemap><loc>${ORIGIN}/sitemaps/skills.xml</loc></sitemap></sitemapindex>\n`);
  await write('llms-full.txt', `# Skill Library\n\n${HOME_DESCRIPTION}\n\nCatalog: ${catalog.total} skills from ${catalog.sourceCount} repositories; source snapshot ${catalog.generatedAt}.\n\n${GUIDES.map(guide => guideMarkdown(guide)).join('\n\n---\n\n')}`);
  const summary = { generatedAt: new Date().toISOString(), skillPages: catalog.total, directoryPages: pages, collectionPages: COLLECTIONS.length, guidePages: GUIDES.length, sitemapUrls: staticPaths.length + catalog.total };
  await write('seo-build.json', JSON.stringify(summary, null, 2));
  console.log(`Rendered ${catalog.total} skill pages, ${pages} directory pages, ${COLLECTIONS.length} collections and ${GUIDES.length} guides.`);
  return summary;
}
