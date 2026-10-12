const invalid = message => Object.assign(new Error(message), { status: 400 });
function bounded(value, name, max = 1000) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) throw invalid(`${name} must be text of at most ${max} characters.`);
  return value.trim();
}
export function validateAgentDetails(input = {}, type = '') {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid('Provide agent details as an object.');
  const details = {
    repository: bounded(input.repository, 'Skill repository', 300),
    skillPath: bounded(input.skillPath, 'Skill folder', 300),
    compatibility: bounded(input.compatibility, 'Agent compatibility', 500),
    prerequisites: bounded(input.prerequisites, 'Prerequisites', 1000),
    installation: bounded(input.installation, 'Usage and installation instructions', 3000),
  };
  if (details.repository) {
    let url;
    try { url = new URL(details.repository); } catch { throw invalid('Use https://github.com/owner/repository for the skill source.'); }
    if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.username || url.password || url.port || url.search || url.hash || !/^\/[A-Za-z0-9_-][A-Za-z0-9_.-]*\/[A-Za-z0-9_-][A-Za-z0-9_.-]*\/?$/.test(url.pathname)) throw invalid('Use https://github.com/owner/repository for the skill source.');
    details.repository = url.href.replace(/\/$/, '');
  }
  if (details.skillPath && details.skillPath !== '.' && (!/^[A-Za-z0-9_. /-]+$/.test(details.skillPath) || details.skillPath.split('/').some(p => !p || p === '.' || p === '..' || p === '.git' || p === 'node_modules'))) throw invalid('Use a relative skill folder without parent traversal; use . for the repository root.');
  if (type === 'skill' && (!details.repository || !details.skillPath)) throw invalid('A skill submission needs its public GitHub repository and SKILL.md folder.');
  return details;
}
export function validateContact(input, verifiedEmail) {
  const email = bounded(input.contactEmail || verifiedEmail, 'Contact email', 254).toLowerCase();
  if (email !== verifiedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw invalid('Use your verified account email for follow-up. Sign in to a different email account to change it.');
  const phone = bounded(input.phone, 'Phone number', 40);
  return { email, phone, phoneValidation: phone ? 'not-verified' : 'not-provided' };
}
export function readAgentDetails(value) {
  try { const details = JSON.parse(value || '{}'); return details && typeof details === 'object' && !Array.isArray(details) ? details : {}; } catch { return {}; }
}
