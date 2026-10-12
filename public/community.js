import {renderAgentFields} from './agent-fields.mjs';
const $ = selector => document.querySelector(selector);
const message = (text, error = false) => { const node = $('#community-message'); if (node) { node.textContent = text; node.classList.toggle('inline-error', error); node.setAttribute('role', error ? 'alert' : 'status'); } };
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function api(path, data, method = 'POST') {
  const response = await fetch(path, { method: data === undefined ? 'GET' : method, credentials: 'same-origin', headers: data === undefined ? {} : { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(20000) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || result.message || 'The request could not be completed.'); return result;
}
async function busy(button, action) { button.disabled = true; try { await action(); } catch (error) { message(error.message, true); } finally { button.disabled = false; } }
async function copy(value) { try { await navigator.clipboard.writeText(value); message('Copied.'); } catch { message('Copy was blocked. Select and copy the text manually.', true); } }
let user = null;
let loginToken = null;
function captureLinkToken() {
  const incoming = new URLSearchParams(location.hash.slice(1)).get('token');
  if (incoming) { loginToken = incoming; history.replaceState({}, '', location.pathname + location.search); }
}
captureLinkToken();
window.addEventListener('hashchange', () => { captureLinkToken(); accountState().catch(error => message(error.message, true)); });
const typeLabel = value => value === 'mcp' ? 'MCP server' : value;
function listingCards(rows) { return rows.map(row => `<article class="community-card"><span class="eyebrow">${escape(typeLabel(row.type))} · ${escape(row.category)}</span><h2><a href="/listings/${escape(row.slug)}">${escape(row.name)}</a></h2><p>${escape(row.tagline)}</p><p class="maker">By ${escape(row.maker)} · ${escape(row.pricing)}</p><span class="reviewed-label">Reviewed listing</span><p>${Number(row.votes)} community votes</p></article>`).join(''); }
async function accountState() {
  const state = await api('/api/auth/session'); user = state.user;
  if ($('#sign-in-form')) {
    $('#sign-in-form').hidden = Boolean(user || loginToken);
    if (loginToken) { $('#complete-sign-in').hidden = false; $('#complete-sign-in').textContent = user ? 'Switch to the account in this link' : 'Complete sign-in'; }
    if (user) {
      $('#account-state').innerHTML = `<p>Signed in as ${escape(user.displayName)}. Email verified.</p><div class="reading-actions"><a class="button button-green" href="/publish">Publish your work</a>${user.admin ? '<a class="button" href="/review">Review submissions</a>' : ''}<button class="button" id="sign-out">Sign out</button></div>`;
      $('#sign-out').addEventListener('click', event => busy(event.currentTarget, async () => { await api('/api/auth/logout', {}); location.assign('/account'); }));
      const mine = await api('/api/community/mine'); $('#my-listings').hidden = false;
      $('#my-listings-content').innerHTML = mine.listings.length ? mine.listings.map(row => `<article class="community-card"><h3>${escape(row.name)}</h3><p>Status: ${escape(row.status)}${row.review_note ? ` · ${escape(row.review_note)}` : ''}</p>${row.status === 'published' ? `<a href="/listings/${escape(row.slug)}">Open your public page and badge</a>` : '<p>The share page becomes public after approval.</p>'}</article>`).join('') : '<p>No submissions yet. <a href="/publish">Publish your first project.</a></p>';
    } else if (!state.signInAvailable) message('Email sign-in is temporarily unavailable. Browsing remains open.', true);
  }
  if ($('#publish-form')) {
    $('#publish-form').hidden = !user; $('#publish-auth').hidden = Boolean(user);
    if(user)$('#contact-email').value=user.email;
    if(!$('#publish-form').dataset.prefilled){const params=new URLSearchParams(location.search);if(params.get('type')==='skill')$('#listing-type').value='skill';for(const name of ['repository','skillPath']){const value=params.get(name);if(value&&value.length<=300)$('#publish-'+name).value=value;}$('#publish-form').dataset.prefilled='true';}
    updateSkillRequirements();
  }
  if ($('#vote-button') && user) {
    $('#vote-auth').textContent = 'Your email is verified. One vote per account.';
    const vote = await api(`/api/community/listings/${$('#vote-button').dataset.id}/vote`);
    $('#vote-button').setAttribute('aria-pressed', String(vote.voted)); $('#vote-count').textContent = vote.votes;
  }
  if ($('#review-queue') && user?.admin) {
    $('#review-auth').hidden = true;
    const review = await api('/api/community/review');
    $('#review-queue').innerHTML = review.listings.length ? review.listings.map(row => `<article class="community-card"><h2>${escape(row.name)}</h2><p>${escape(row.type)} · ${escape(row.category)} · ${escape(row.pricing)} · by ${escape(row.maker)}</p><p>${escape(row.tagline)}</p><p class="preserve-lines">${escape(row.description)}</p><p><a href="${escape(row.website)}" target="_blank" rel="noopener noreferrer">Open website ↗</a>${row.source_url ? ` · <a href="${escape(row.source_url)}" target="_blank" rel="noopener noreferrer">Open source / documentation ↗</a>` : ''}</p><p>Private verified contact email: ${escape(row.contact_email)}${row.contact_phone ? ` · Phone (not verified): ${escape(row.contact_phone)}` : ' · No phone provided'}</p><form class="review-form" data-id="${row.id}">${renderAgentFields(JSON.parse(row.agent_details||'{}'),row.type,'review-'+row.id,true)}<label><input type="checkbox" name="source"> I checked that the public source or website exists and matches the listing.</label><label><input type="checkbox" name="details"> I verified the claims, pricing and submission details.</label><label><input type="checkbox" name="rights"> I checked attribution and publication rights.</label><label>Review note<textarea name="note" required minlength="10" maxlength="1000" rows="3"></textarea></label><div class="reading-actions"><button class="button button-green" type="submit" name="status" value="published">Approve and publish</button><button class="button" type="submit" name="status" value="rejected" formnovalidate>Reject</button></div></form></article>`).join('') : '<p>The review queue is clear.</p>';
    for (const form of document.querySelectorAll('.review-form')) form.addEventListener('submit', event => {
      event.preventDefault(); const button = event.submitter, data = new FormData(form);
      busy(button, async () => { await api(`/api/community/review/${form.dataset.id}`, { status: button.value, note: data.get('note'), checks: { source: data.has('source'), details: data.has('details'), rights: data.has('rights') }, agentDetails: Object.fromEntries(['repository','skillPath','compatibility','prerequisites','installation'].map(name=>[name,data.get(name)||''])) }); message(button.value === 'published' ? 'Listing approved and published.' : 'Submission rejected.'); await accountState(); });
    });
    $('#notification-status').innerHTML = review.notifications.length ? review.notifications.map(item => `<p>${escape(item.kind)} · ${escape(item.status)} · attempts ${Number(item.attempts)}${item.last_error ? ` · ${escape(item.last_error)}` : ''}</p>`).join('') : '<p>No pending or failed notification deliveries.</p>';
  }
}
$('#sign-in-form')?.addEventListener('submit', event => {
  event.preventDefault(); const data = new FormData(event.currentTarget);
  busy(event.currentTarget.querySelector('button'), async () => { const result = await api('/api/auth/start', { email: data.get('email'), displayName: data.get('displayName') }); message(result.message); });
});
$('#complete-sign-in')?.addEventListener('click', event => busy(event.currentTarget, async () => {
  await api('/api/auth/verify', { token: loginToken }); location.replace('/account');
}));
$('#publish-form')?.addEventListener('submit', event => {
  event.preventDefault(); const form = event.currentTarget, data = Object.fromEntries(new FormData(form)); data.rights = data.rights === 'on'; data.agentDetails = Object.fromEntries(['repository','skillPath','compatibility','prerequisites','installation'].map(name=>[name,data[name]||''])); for(const name of Object.keys(data.agentDetails))delete data[name];
  busy(form.querySelector('button[type="submit"]'), async () => { const result = await api('/api/community/listings', data); message(result.message); form.reset(); $('#my-submission-link')?.remove(); const link = document.createElement('a'); link.id = 'my-submission-link'; link.href = '/account'; link.textContent = 'Track your submission'; $('#community-message').after(link); });
});
$('#community-search')?.addEventListener('submit', event => {
  event.preventDefault(); const form = event.currentTarget, data = new FormData(form);
  busy(form.querySelector('button'), async () => { const query = new URLSearchParams({ q: data.get('q'), type: data.get('type') }); const result = await api('/api/community/listings?' + query); $('#community-count').textContent = `${result.total} reviewed listings match your search.`; $('#community-results').innerHTML = listingCards(result.listings) || '<p>No matching listings. Try another name or type.</p>'; });
});
$('#vote-button')?.addEventListener('click', event => busy(event.currentTarget, async () => {
  if (!user) { message('Sign in with a verified email to vote.', true); const link = document.createElement('a'); link.href = '/account'; link.textContent = 'Sign in / Join free'; if (!$('#vote-auth a')) $('#vote-auth').append(' ', link); return; }
  const button = event.currentTarget, voted = button.getAttribute('aria-pressed') !== 'true';
  const result = await api(`/api/community/listings/${button.dataset.id}/vote`, { voted }, 'PUT'); button.setAttribute('aria-pressed', String(result.voted)); $('#vote-count').textContent = result.votes; message(result.voted ? 'Vote saved.' : 'Vote removed.');
}));
$('#share-listing')?.addEventListener('click', () => copy(location.origin + location.pathname));
$('#copy-badge')?.addEventListener('click', () => copy($('#listing-badge-code').value));
accountState().catch(error => message(error.message, true));

function updateSkillRequirements(){for(const name of ['repository','skillPath']){const field=$('#publish-'+name);if(field)field.required=$('#listing-type')?.value==='skill';}}
$('#listing-type')?.addEventListener('change',updateSkillRequirements);
