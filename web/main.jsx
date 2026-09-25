import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  SquaresFour, MagnifyingGlass, ArrowUpRight, ArrowRight, Star, BookmarkSimple,
  GithubLogo, TerminalWindow, Copy, Check, DownloadSimple, X, Plus, SlidersHorizontal,
  Code, Palette, FilmSlate, Brain, Megaphone, ChartBar, Cloud, ShieldCheck,
  PencilSimple, Briefcase, FileText, Lightning, CheckCircle, SpinnerGap, BookOpen,
  ArrowLeft, CaretDown, Package, Command, Globe, WarningCircle,
} from '@phosphor-icons/react';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import { searchCatalog, CATEGORIES } from '../lib/search.mjs';
import { CopyButton } from './CopyButton.jsx';
import { COLLECTIONS, FAQ, collectionFor } from '../site/content.mjs';
import { metadata, skillMetadata, skillSchema, breadcrumbs, stripFrontmatter } from '../site/seo.mjs';
import './styles.css';
import './copy.css';

const icons = { Development: Code, Design: Palette, 'Video & audio': FilmSlate, 'AI & agents': Brain, Marketing: Megaphone, 'Data & research': ChartBar, 'Cloud & DevOps': Cloud, Security: ShieldCheck, Writing: PencilSimple, 'Product & business': Briefcase, Documents: FileText, Automation: Lightning };
const GitHub = 'https://github.com/AjnasNB/skill-dash';
const shortStars = n => n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${n}`;
const bytes = n => n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`;
const pretty = name => name.split('-').map(word => ({ ai: 'AI', ui: 'UI', ux: 'UX', api: 'API', seo: 'SEO', mcp: 'MCP', pdf: 'PDF', cli: 'CLI' }[word] || word[0]?.toUpperCase() + word.slice(1))).join(' ');
const skillFromLocation = () => location.pathname.startsWith('/skills/') ? decodeURIComponent(location.pathname.slice(8)) : null;
const bootstrap = (() => { try { return JSON.parse(document.getElementById('skill-library-bootstrap')?.textContent || 'null'); } catch { return null; } })();
const interceptLink = event => event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && !event.defaultPrevented;
const AsyncMarkdown = React.lazy(async () => {
  const [markdown, gfm] = await Promise.all([import('react-markdown'), import('remark-gfm')]);
  return { default: props => React.createElement(markdown.default, { ...props, remarkPlugins: [gfm.default] }) };
});
function Markdown(props) {
  return <React.Suspense fallback={<p className="loading-line">Preparing the skill preview…</p>}><AsyncMarkdown {...props} /></React.Suspense>;
}

function App() {
  const [catalog, setCatalog] = useState(bootstrap?.catalog || null), [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState(new URLSearchParams(location.search).get('q') || '');
  const [category, setCategory] = useState(() => { const value = new URLSearchParams(location.search).get('category'); return CATEGORIES.includes(value) ? value : ''; }), [sort, setSort] = useState('relevance'), [official, setOfficial] = useState(false);
  const [view, setView] = useState('discover'), [page, setPage] = useState(1), [filterOpen, setFilterOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(skillFromLocation), [modal, setModal] = useState(null), [toast, setToast] = useState('');
  const [saved, setSaved] = useState(() => { try { const value = JSON.parse(localStorage.getItem('skill-library-saved') || '[]'); return Array.isArray(value) ? value.filter(x => typeof x === 'string') : []; } catch { return []; } });
  const searchRef = useRef(null), toastTimer = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/catalog.json', { signal: controller.signal }).then(response => { if (!response.ok) throw new Error('The catalog is temporarily unavailable.'); return response.json(); })
      .then(setCatalog).catch(error => { if (error.name !== 'AbortError') setLoadError(error.message); });
    return () => controller.abort();
  }, []);
  useEffect(() => { setPage(1); }, [query, category, sort, official, view]);
  useEffect(() => {
    const onPop = () => { setSelectedId(skillFromLocation()); setQuery(new URLSearchParams(location.search).get('q') || ''); };
    const onKey = event => { if ((event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) || ((event.ctrlKey || event.metaKey) && event.key === 'k')) { event.preventDefault(); searchRef.current?.focus(); } };
    window.addEventListener('popstate', onPop); window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('popstate', onPop); window.removeEventListener('keydown', onKey); clearTimeout(toastTimer.current); };
  }, []);
  const notify = message => { setToast(message); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 3500); };
  const toggleSave = id => {
    const next = saved.includes(id) ? saved.filter(value => value !== id) : [...saved, id];
    setSaved(next);
    try { localStorage.setItem('skill-library-saved', JSON.stringify(next)); } catch { notify('Browser storage is unavailable. Saved skills will last for this visit.'); }
  };
  const openSkill = skill => { setSelectedId(skill.id); history.pushState({}, '', `/skills/${skill.id}`); };
  const closeSkill = () => { setSelectedId(null); const params = new URLSearchParams(); if (query) params.set('q', query); if (category) params.set('category', category); history.replaceState({}, '', params.size ? `/?${params}` : '/'); };
  const reset = () => { setQuery(''); setCategory(''); setOfficial(false); setSort('relevance'); };
  const result = useMemo(() => catalog ? searchCatalog(view === 'saved' ? catalog.skills.filter(skill => saved.includes(skill.id)) : catalog, { query, category, official, sort, offset: (page - 1) * 24, limit: 24 }) : { skills: [], total: 0 }, [catalog, query, category, official, sort, view, saved, page]);
  const selected = catalog?.skills.find(skill => skill.id === selectedId);
  useEffect(() => {
    const meta = selected ? skillMetadata(selected) : metadata({ robots: query || category ? 'noindex, follow' : 'index, follow, max-image-preview:large' });
    document.title = meta.title;
    for (const [selector, value] of [
      ['meta[name="description"]', meta.description], ['meta[name="robots"]', meta.robots],
      ['meta[property="og:title"]', meta.title], ['meta[property="og:description"]', meta.description],
      ['meta[property="og:url"]', meta.url], ['meta[property="og:type"]', meta.type],
      ['meta[name="twitter:title"]', meta.title], ['meta[name="twitter:description"]', meta.description],
    ]) document.querySelector(selector)?.setAttribute('content', value);
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', meta.url);
    const schema = document.getElementById('page-schema');
    if (schema) schema.textContent = JSON.stringify({ '@context': 'https://schema.org', '@graph': selected ? [
      skillSchema(selected), breadcrumbs([{ name: 'Skill Library', path: '/' }, { name: selected.category, path: `/collections/${collectionFor(selected.category).slug}` }, { name: pretty(selected.name), path: `/skills/${selected.id}` }]),
    ] : [{ '@type': 'WebSite', name: 'Skill Library', alternateName: 'Agent Skill Library', url: meta.url, description: meta.description }] });
  }, [selected, query, category]);
  const featured = useMemo(() => {
    if (!catalog) return [];
    const pick = ['hyperframes', 'impeccable', 'brainstorming'].map(name => catalog.skills.find(skill => skill.name === name)).filter(Boolean);
    return pick.length ? pick : catalog.skills.filter(skill => skill.featured).slice(0, 3);
  }, [catalog]);
  const collectionCounts = useMemo(() => CATEGORIES.map(name => ({ name, count: catalog?.categories.find(item => item.name === name)?.count || 0 })), [catalog]);
  const changeQuery = value => { setQuery(value); if (!selectedId) history.replaceState({}, '', value ? `/?q=${encodeURIComponent(value)}` : '/'); };
  const saveCommands = saved.map(id => `npx agent-skill-library install ${id} --agent codex`).join('\n');
  return <>
    <a href="#catalog" className="skip-link">Skip to skill search</a>
    <header className="site-header">
      <a className="wordmark" href="/" onClick={event => { event.preventDefault(); reset(); setView('discover'); setSelectedId(null); history.replaceState({}, '', '/'); }} aria-label="Skill Library home"><span className="brand-mark"><SquaresFour weight="fill" size={23} /></span>skill library<span className="beta-tag">OPEN</span></a>
      <nav aria-label="Main navigation">
        <button className={view === 'discover' ? 'active' : ''} onClick={() => setView('discover')}>Discover</button>
        <button className={view === 'collections' ? 'active' : ''} onClick={() => { reset(); setView('collections'); }}>Collections</button>
        <button onClick={() => setModal('agents')}>For agents <ArrowUpRight size={12} /></button>
      </nav>
      <div className="header-actions"><a href={GitHub} target="_blank" rel="noreferrer" className="icon-button" aria-label="Source on GitHub"><GithubLogo size={21} /></a><button className="button button-dark submit-trigger" onClick={() => setModal('submit')}><Plus size={16} /> Submit a skill</button></div>
    </header>
    <main>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <div className="open-label"><span /> OPEN SKILLS. ENDLESS POSSIBILITIES.</div>
          <h1 id="hero-title">Good agents.<br /><span>Great AI skills.</span></h1>
          <p>Search {catalog?.total.toLocaleString() || 'thousands of'} free AI agent skills. Read the instructions, copy a skill, or download its full folder for Codex, Claude Code and Delta Harness.</p>
          <div className="hero-meta"><span className="stack-marks"><Code /><Command /><TerminalWindow /></span><span>For Codex, Claude Code, Delta & more</span></div>
        </div>
        <div className="featured-stack">
          <div className="featured-heading"><span>Worth adding to your toolkit</span><ArrowUpRight size={17} /></div>
          {featured.map((skill, i) => {
            const Icon = icons[skill.category] || Code;
            return <a href={`/skills/${skill.id}`} key={skill.id} className={`featured-row featured-row-${i}`} onClick={event => { if (interceptLink(event)) { event.preventDefault(); openSkill(skill); } }}>
              <span className={`skill-icon category-${skill.category.split(' ')[0].toLowerCase()}`}><Icon size={25} weight="duotone" /></span>
              <span className="featured-text"><strong>{pretty(skill.name)}</strong><span>{skill.category} <span aria-hidden="true">·</span> {skill.repo.split('/')[0]}</span></span>
              <span className="featured-star"><Star size={13} />{shortStars(skill.stars)}</span><ArrowUpRight className="featured-arrow" size={18} />
            </a>;
          })}
          {!catalog && !loadError && <div className="featured-loading"><SpinnerGap className="spin" /> Loading the library</div>}
          <div className="featured-caption"><CheckCircle size={14} /> Pinned sources. Full files. Yours to use.</div>
        </div>
      </section>
      <section className="search-section" id="catalog" aria-label="Skill catalog">
        <div className="search-box">
          <MagnifyingGlass size={24} />
          <label htmlFor="skill-search" className="sr-only">Search skills by name or description</label>
          <input ref={searchRef} id="skill-search" value={query} onChange={event => changeQuery(event.target.value)} placeholder="What do you want your agent to do?" autoComplete="off" spellCheck="false" />
          {query ? <button className="icon-button" aria-label="Clear search" onClick={() => changeQuery('')}><X size={18} /></button> : <kbd>/</kbd>}
          <span className="search-count">{catalog ? catalog.total.toLocaleString() : '…'} skills</span>
        </div>
        <div className="search-under"><span>Search a skill, a tool, or describe a task.</span><span><span className="status-dot" /> From {catalog?.sourceCount || '…'} repositories with 1k+ stars</span></div>
        <div className="quick-search"><span>Try</span>{['Design a website', 'Make a video', 'Review my code', 'Build an AI agent'].map(label => <button key={label} onClick={() => { changeQuery(label); setView('discover'); setCategory(''); }}>{label}<ArrowUpRight size={12} /></button>)}</div>
      </section>
      {view === 'collections' && <section className="collections-panel" aria-label="Skill collections">
        <h2>A starting point for every project.</h2><p>Explore skills by the work you want to do.</p>
        <div className="collection-grid">{collectionCounts.filter(item => item.count).map(item => { const Icon = icons[item.name]; return <button key={item.name} onClick={() => { setCategory(item.name); setView('discover'); }}><Icon size={28} weight="duotone" /><strong>{item.name}</strong><span>{item.count} skills <ArrowRight size={15} /></span></button>; })}</div>
      </section>}
      <div className="catalog-layout">
        <aside className={filterOpen ? 'filters is-open' : 'filters'} aria-label="Filter skills">
          <div className="filter-heading">Your library<button className="mobile-only icon-button" aria-label="Close filters" onClick={() => setFilterOpen(false)}><X /></button></div>
          <button className={`filter-item ${view !== 'saved' && !category ? 'selected' : ''}`} onClick={() => { setView('discover'); setCategory(''); }}><SquaresFour size={18} /><span>All skills</span><small>{catalog?.total.toLocaleString() || '—'}</small></button>
          <button className={`filter-item ${view === 'saved' ? 'selected' : ''}`} onClick={() => { setView('saved'); setCategory(''); }}><BookmarkSimple size={18} /><span>Saved skills</span><small>{saved.length}</small></button>
          <div className="filter-heading categories-heading">Explore categories</div>
          {collectionCounts.filter(item => item.count).map(({ name, count }) => { const Icon = icons[name]; return <button className={`filter-item ${category === name ? 'selected' : ''}`} key={name} onClick={() => { setCategory(name); setView('discover'); setFilterOpen(false); }}><Icon size={18} /><span>{name}</span><small>{count}</small></button>; })}
          <div className="filter-check"><label><input type="checkbox" checked={official} onChange={event => setOfficial(event.target.checked)} /> Vendor collections only</label></div>
          <div className="agent-note"><TerminalWindow size={23} /><strong>Your agent can browse, too.</strong><p>Search and install from the terminal, or connect over MCP.</p><button onClick={() => setModal('agents')}>Get connected <ArrowUpRight size={14} /></button></div>
        </aside>
        <section className="results-section" aria-labelledby="results-title">
          <div className="results-heading"><div><h2 id="results-title">{view === 'saved' ? 'Saved skills' : query ? 'Search results' : category || 'Discover your next skill'}</h2><span role="status">{catalog ? `${result.total.toLocaleString()} ${result.total === 1 ? 'skill' : 'skills'}${query ? ` for “${query}”` : ' ready to explore'}` : 'Loading source-verified skills…'}</span></div>
            <div className="results-controls"><button className="button mobile-only" onClick={() => setFilterOpen(!filterOpen)}><SlidersHorizontal size={17} /> Filters</button><label className="sort-select"><span className="sr-only">Sort skills</span><select value={sort} onChange={event => setSort(event.target.value)}><option value="relevance">Recommended</option><option value="stars">Repository stars</option><option value="name">Name A–Z</option></select><CaretDown size={13} /></label></div>
          </div>
          {view === 'saved' && saved.length > 0 && <div className="saved-banner"><span>Saved on this browser.</span><CopyButton text={saveCommands} label="Copy install commands" /></div>}
          {loadError ? <div className="empty-state"><WarningCircle size={38} /><h3>We couldn’t load the library.</h3><p>{loadError}</p><button className="button button-dark" onClick={() => location.reload()}>Try again</button></div> :
            !catalog ? <div className="skill-grid" aria-busy="true">{Array.from({ length: 9 }, (_, i) => <div key={i} className="skeleton-card"><span /><span /><span /><span /></div>)}</div> :
              result.skills.length === 0 ? <div className="empty-state"><BookOpen size={38} /><h3>{view === 'saved' ? 'Make this library yours.' : 'No skills found yet.'}</h3><p>{view === 'saved' ? 'Bookmark a skill and it will be waiting here.' : 'Try a broader description, or clear your filters.'}</p><button className="button button-dark" onClick={() => { reset(); setView('discover'); }}>Explore skills <ArrowRight size={16} /></button></div> :
                <div className="skill-grid">{result.skills.map(skill => <SkillCard key={skill.id} skill={skill} saved={saved.includes(skill.id)} onOpen={() => openSkill(skill)} onSave={() => toggleSave(skill.id)} />)}</div>}
          {result.total > 24 && <div className="pagination"><span>Showing {(page - 1) * 24 + 1}–{Math.min(page * 24, result.total)} of {result.total.toLocaleString()}</span><div><button className="button" disabled={page === 1} onClick={() => { setPage(page - 1); document.querySelector('.results-heading')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }}><ArrowLeft size={15} /> Previous</button><span>{page} / {Math.ceil(result.total / 24)}</span><button className="button" disabled={page * 24 >= result.total} onClick={() => { setPage(page + 1); document.querySelector('.results-heading')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }}>Next <ArrowRight size={15} /></button></div></div>}
          <p className="provenance-note"><Star size={13} /> Stars belong to source repositories. Files are pinned and checksummed; inclusion is not a security audit.</p>
        </section>
      </div>
      <section className="install-strip"><div><TerminalWindow size={28} /><div><h2>One library. Wherever you build.</h2><p>Search, inspect, and install without leaving your terminal.</p></div></div><CopyButton className="terminal-command" label="Copy setup command" text="npx agent-skill-library setup --agent all --global"><span><span className="command-dollar">$</span> npx agent-skill-library setup --agent all --global</span></CopyButton></section>
      <LibraryExplainer />
    </main>
    <footer><a className="footer-brand" href="/">skill library<span>Built for builders. Open to everyone.</span></a><div><a href={GitHub} target="_blank" rel="noreferrer">GitHub <ArrowUpRight size={12} /></a><button onClick={() => setModal('agents')}>API & MCP</button><a href="/about">About the library</a><a href="/skills">All skills</a><a href="/for-agents">Integration guide</a></div><span>Updated {catalog?.generatedAt.slice(0, 10) || '…'}</span></footer>
    {selected && <SkillDialog key={selected.id} skill={selected} initialText={bootstrap?.preview?.id === selected.id ? bootstrap.preview.text : ''} onClose={closeSkill} saved={saved.includes(selected.id)} onSave={() => toggleSave(selected.id)} />}
    {selectedId && catalog && !selected && <Dialog onClose={closeSkill} title="Skill not found"><p>This skill is not part of the current catalog.</p><button className="button button-dark" onClick={closeSkill}>Back to the library</button></Dialog>}
    {modal === 'agents' && <Dialog onClose={() => setModal(null)} title="A library your agent can use." className="guide-dialog"><p className="dialog-intro">One npm package. No API key. Search works offline from the published catalog.</p><CodeBlock text={'npx agent-skill-library search "make a launch video"\nnpx agent-skill-library setup --agent all --global'} /><h3>Install where you work</h3><div className="target-list"><div><Code /><strong>Codex</strong><code>.agents/skills</code><span>Desktop, CLI, and repository-based cloud tasks</span></div><div><Command /><strong>Claude Code</strong><code>.claude/skills</code><span>Local sessions and repository-based cloud tasks</span></div><div><TerminalWindow /><strong>Delta Harness</strong><code>Application data / skills</code><span>Refresh the Skills panel after installing</span></div></div><p>Installs default to the current project. Add <code>--global</code> for personal skills. Commit project skills to share them with a cloud workspace.</p><h3>Connect an MCP client</h3><CodeBlock text={'{\n  "mcpServers": {\n    "skill-library": {\n      "command": "npx",\n      "args": ["-y", "agent-skill-library", "mcp"]\n    }\n  }\n}'} /><p>The MCP server exposes search, inspection, and installation planning. It does not run skill scripts.</p><div className="guide-links"><a href="/llms.txt" target="_blank">Agent instructions <ArrowUpRight /></a><a href="/openapi.json" target="_blank">API specification <ArrowUpRight /></a><a href="/catalog.json" target="_blank">Full catalog <ArrowUpRight /></a></div></Dialog>}
    {modal === 'submit' && <SubmitDialog onClose={() => setModal(null)} />}
    {modal === 'about' && <Dialog onClose={() => setModal(null)} title="Open sources. Clear provenance."><p>Skill Library indexes portable SKILL.md folders from public GitHub repositories with at least 1,000 stars at the recorded check time. Repeated copies of the same instructions are deduplicated.</p><p>Every downloadable skill has a pinned commit, file hashes, and a recognized upstream license. The complete skill folder and supplied license files travel together. Custom or unclear licenses are excluded from public downloads.</p><p>Skills are instructions and supporting resources, not permission to run code. Review them before use. Scripts are not executed during installation. Source authors retain their licenses and ownership; listing does not imply their endorsement.</p><p>Bookmarks stay in your browser. Submitted GitHub URLs enter a private review queue. We retain a one-day hash of the submitting IP for rate limiting; no raw IP or login is stored by the application.</p><a className="button button-dark" href={`${GitHub}/blob/main/THIRD-PARTY.md`} target="_blank" rel="noreferrer">Read the provenance policy <ArrowUpRight size={15} /></a></Dialog>}
    {toast && <div className="toast" role="status"><CheckCircle size={19} />{toast}</div>}
  </>;
}
function SkillCard({ skill, saved, onOpen, onSave }) {
  const Icon = icons[skill.category] || Code;
  return <article className="skill-card"><div className="card-top"><span className={`skill-icon category-${skill.category.split(' ')[0].toLowerCase()}`}><Icon size={22} weight="duotone" /></span><button className={`bookmark ${saved ? 'bookmarked' : ''}`} aria-label={`${saved ? 'Unsave' : 'Save'} ${skill.name}`} aria-pressed={saved} onClick={onSave}><BookmarkSimple size={19} weight={saved ? 'fill' : 'regular'} /></button></div><a className="card-main" href={`/skills/${skill.id}`} onClick={event => { if (interceptLink(event)) { event.preventDefault(); onOpen(); } }}><h3>{pretty(skill.name)}<ArrowUpRight size={15} /></h3><span className="card-owner">{skill.repo.split('/')[0]}{skill.official && <CheckCircle size={12} weight="fill" aria-label="Vendor collection" />}</span><p>{skill.description}</p></a><div className="card-bottom"><span className="category-label">{skill.category}</span><span className="stars" title={`${skill.stars.toLocaleString()} stars on ${skill.repo}`}><Star size={13} />{shortStars(skill.stars)}</span></div></article>;
}
function Dialog({ onClose, title, children, className = '' }) {
  const ref = useRef(null);
  useEffect(() => { const element = ref.current; element.showModal(); const handler = event => { event.preventDefault(); onClose(); }; element.addEventListener('cancel', handler); const previous = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { element.removeEventListener('cancel', handler); element.close(); document.body.style.overflow = previous; }; }, []);
  return <dialog ref={ref} className={`dialog ${className}`} onClick={event => { if (event.target === ref.current) { const box = ref.current.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose(); } }} aria-labelledby="dialog-title"><div className="dialog-header"><h2 id="dialog-title">{title}</h2><button autoFocus className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={21} /></button></div>{children}</dialog>;
}
function LibraryExplainer() {
  return <>
    <section id="categories" className="library-explainer">
      <h2>Explore AI skills by category</h2>
      <div className="topic-links">{COLLECTIONS.map(item => <a key={item.slug} href={`/collections/${item.slug}`}>{item.category}</a>)}</div>
    </section>
    <section className="library-explainer" aria-labelledby="faq-heading">
      <h2 id="faq-heading">AI agent skills, explained</h2>
      <div className="faq-grid">{FAQ.map(item => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</div>
      <ul className="reading-links">
        <li><a href="/guides/what-are-ai-agent-skills">A practical guide to AI agent skills</a></li>
        <li><a href="/guides/codex-skills">Install skills in Codex</a></li>
        <li><a href="/guides/claude-code-skills">Install skills in Claude Code</a></li>
        <li><a href="/guides/skill-safety">Inspect skills before use</a></li>
      </ul>
    </section>
  </>;
}
function CodeBlock({ text }) {
  return <div className="code-block"><pre><code>{text}</code></pre><CopyButton text={text} iconOnly /></div>;
}
function SkillDialog({ skill, onClose, saved, onSave, initialText = '' }) {
  const [text, setText] = useState(initialText), [error, setError] = useState(''), [agent, setAgent] = useState('codex'), [global, setGlobal] = useState(false), [retry, setRetry] = useState(0);
  useEffect(() => { if (initialText && !retry) { setText(initialText); return; } const controller = new AbortController(); setText(''); setError(''); fetch(`/documents/${skill.id}.md`, { signal: controller.signal }).then(response => { if (!response.ok) throw new Error('The skill instructions could not be loaded.'); return response.text(); }).then(setText).catch(error => { if (error.name !== 'AbortError') setError(error.message); }); return () => controller.abort(); }, [skill.id, retry, initialText]);
  const command = `npx agent-skill-library install ${skill.id} --agent ${agent}${global || agent === 'delta' ? ' --global' : ''}`;
  const body = stripFrontmatter(text);
  return <Dialog onClose={onClose} title={pretty(skill.name)} className="skill-dialog"><div className="detail-subtitle"><span>{skill.category}</span><span><Star size={14} /> {skill.stars.toLocaleString()} repository stars</span><button onClick={onSave}><BookmarkSimple weight={saved ? 'fill' : 'regular'} /> {saved ? 'Saved' : 'Save skill'}</button></div><p className="detail-description">{skill.description}</p><div className="detail-layout"><div className="instruction-column"><div className="instruction-heading"><h3><FileText size={17} /> SKILL.md</h3><CopyButton text={text} label="Copy skill" disabled={!text} /></div>{error ? <div className="inline-error" role="alert">{error}<button className="button" onClick={() => setRetry(retry + 1)}>Retry</button></div> : !text ? <p className="loading-line"><SpinnerGap className="spin" /> Loading instructions…</p> : <div className="markdown"><Markdown components={{ a: ({ href, children }) => { const safe = href && !/^(?:javascript|data|vbscript):/i.test(href); const url = safe && !/^[a-z]+:/i.test(href) && !href.startsWith('#') ? `${skill.sourceUrl}/${href}` : href; return safe ? <a href={url} target="_blank" rel="noreferrer">{children}</a> : <span>{children}</span>; }, img: ({ alt }) => <span className="image-reference">[Upstream image: {alt || 'view at source'}]</span> }}>{body}</Markdown></div>}</div><aside className="install-panel"><h3>Add to your agent</h3><div className="agent-tabs" role="group" aria-label="Installation target">{['codex', 'claude', 'delta'].map(value => <button key={value} aria-pressed={agent === value} className={agent === value ? 'selected' : ''} onClick={() => setAgent(value)}>{value === 'claude' ? 'Claude' : value[0].toUpperCase() + value.slice(1)}</button>)}</div><label className="personal-check"><input type="checkbox" checked={global || agent === 'delta'} disabled={agent === 'delta'} onChange={event => setGlobal(event.target.checked)} /> Personal library (all projects)</label><CodeBlock text={command} /><a className="button button-green download-button" href={`/bundles/${skill.id}.zip`} download={`${skill.name}.zip`}><DownloadSimple size={17} /> Download ZIP <span>{bytes(skill.bytes)}</span></a><p className="install-explanation">Includes {skill.fileCount} files, supporting resources, and license notices. Copying SKILL.md alone does not include its resources.</p><dl className="source-facts"><div><dt>Source</dt><dd><a href={skill.sourceUrl} target="_blank" rel="noreferrer">{skill.repo}<ArrowUpRight size={13} /></a></dd></div><div><dt>License</dt><dd>{skill.license}</dd></div><div><dt>Revision</dt><dd><code>{skill.revision.slice(0, 10)}</code></dd></div><div><dt>Verified</dt><dd>{skill.checkedAt.slice(0, 10)}</dd></div></dl><a className="manifest-link" href={`/manifests/${skill.id}.json`} target="_blank">Inspect file checksums <ArrowUpRight size={13} /></a><div className="source-notice"><ShieldCheck size={18} /><p>Inspect before you install. Star counts do not certify safety, and helper scripts never run automatically.</p></div></aside></div></Dialog>;
}
function SubmitDialog({ onClose }) {
  const [repo, setRepo] = useState(''), [path, setPath] = useState(''), [status, setStatus] = useState('idle'), [error, setError] = useState(''), [receipt, setReceipt] = useState(null);
  const submit = async event => { event.preventDefault(); setStatus('sending'); setError(''); try { const response = await fetch('/api/submissions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repo, path }), signal: AbortSignal.timeout(20000) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Submission failed. Please try again.'); setReceipt(result); setStatus('done'); } catch (error) { setError(error.message); setStatus('idle'); } };
  return <Dialog onClose={onClose} title="Share a useful skill." className="submit-dialog">{status === 'done' ? <div className="submission-success"><CheckCircle size={48} weight="duotone" /><h3>{receipt.status === 'published' ? 'Already in the library.' : 'Added to the review queue.'}</h3><p>{receipt.message}</p><code>{receipt.id}</code><button className="button button-dark" onClick={onClose}>Done</button></div> : <><p className="dialog-intro">Point us to a public GitHub skill. We check its source, license, and files before publication.</p><form onSubmit={submit}><label htmlFor="submit-repo">GitHub repository</label><input id="submit-repo" type="url" required placeholder="https://github.com/owner/repository" value={repo} maxLength={200} onChange={event => setRepo(event.target.value)} /><label htmlFor="submit-path">Skill folder in the repository</label><input id="submit-path" required placeholder="skills/my-skill" value={path} maxLength={300} onChange={event => setPath(event.target.value)} /><p className="field-help">The folder must contain SKILL.md. Enter “.” for the repository root.</p><div className="submission-policy"><CheckCircle size={17} /><span>Public repository · 1,000+ stars · Redistributable license</span></div>{error && <p className="inline-error" role="alert">{error}</p>}<button className="button button-green" disabled={status === 'sending'} type="submit">{status === 'sending' ? <><SpinnerGap className="spin" /> Submitting…</> : <>Submit for review <ArrowRight size={16} /></>}</button></form></>}</Dialog>;
}

createRoot(document.getElementById('root')).render(<App />);
