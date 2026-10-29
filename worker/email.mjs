// Azure Communication Services Email REST API, signed with Web Crypto for Workers.
const encoder = new TextEncoder();
const base64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const problem = (code, permanent = false) => Object.assign(new Error(code), { code, permanent });
export const usesAzure = env => env.EMAIL_PROVIDER === 'azure';
function endpoint(env) {
  const url = new URL(env.AZURE_EMAIL_ENDPOINT);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.communication.azure.com') || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) throw problem('EMAIL_CONFIGURATION', true);
  return url.origin;
}
export function emailAvailable(env) {
  if (!env.EMAIL_FROM) return false;
  if (!usesAzure(env)) return Boolean(env.EMAIL?.send);
  try { return Boolean(endpoint(env) && env.AZURE_EMAIL_ACCESS_KEY); } catch { return false; }
}
export async function azureHeaders(url, method, body, accessKey, date = new Date().toUTCString()) {
  const contentHash = base64(await crypto.subtle.digest('SHA-256', encoder.encode(body)));
  const key = await crypto.subtle.importKey('raw', Uint8Array.from(atob(accessKey), c => c.charCodeAt(0)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = base64(await crypto.subtle.sign('HMAC', key, encoder.encode(`${method}\n${url.pathname}${url.search}\n${date};${url.host};${contentHash}`)));
  return { 'x-ms-date': date, 'x-ms-content-sha256': contentHash, Authorization: `HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=${signature}`, 'Content-Type': 'application/json' };
}
async function azureRequest(env, method, path, payload, operationId, fetcher) {
  const url = new URL(endpoint(env) + path + '?api-version=2023-03-31');
  const body = payload ? JSON.stringify(payload) : '';
  const headers = await azureHeaders(url, method, body, env.AZURE_EMAIL_ACCESS_KEY);
  headers['x-ms-client-request-id'] = operationId;
  if (method === 'POST') headers['Operation-Id'] = operationId;
  let response;
  try { response = await fetcher(url, { method, headers, ...(body ? { body } : {}), redirect: 'error', signal: AbortSignal.timeout(10000) }); }
  catch { throw problem('AZURE_EMAIL_UNCERTAIN'); }
  if (method === 'GET' && response.status === 404) return { status: 'NotFound', messageId: operationId };
  if (!response.ok) throw problem(`AZURE_EMAIL_HTTP_${response.status}`, response.status >= 400 && response.status < 500 && ![408,409,429].includes(response.status));
  let result;
  try { result = await response.json(); } catch { throw problem('AZURE_EMAIL_UNCERTAIN'); }
  // Never follow a provider-supplied URL or disclose its error body to logs.
  if (result.id !== operationId || !['NotStarted','Running','Succeeded','Failed','Canceled'].includes(result.status)) throw problem('AZURE_EMAIL_UNCERTAIN');
  return { status: result.status, messageId: operationId };
}
export async function emailStatus(env, operationId, fetcher = fetch) {
  if (!uuid.test(operationId)) throw problem('EMAIL_OPERATION_ID', true);
  return azureRequest(env, 'GET', `/emails/operations/${operationId}`, null, operationId, fetcher);
}
export async function sendEmail(env, recipient, subject, text, html, operationId = crypto.randomUUID(), fetcher = fetch) {
  if (!emailAvailable(env)) throw problem('EMAIL_UNAVAILABLE');
  if (!usesAzure(env)) return { status: 'Succeeded', ...await env.EMAIL.send({ to: recipient, from: { email: env.EMAIL_FROM, name: 'SkillDash' }, replyTo: env.ADMIN_EMAIL, subject, text, html }) };
  if (!uuid.test(operationId)) throw problem('EMAIL_OPERATION_ID', true);
  return azureRequest(env, 'POST', '/emails:send', {
    senderAddress: env.EMAIL_FROM, recipients: { to: [{ address: recipient }] },
    content: { subject, plainText: text, html },
    ...(env.ADMIN_EMAIL ? { replyTo: [{ address: env.ADMIN_EMAIL, displayName: 'SkillDash' }] } : {}),
    userEngagementTrackingDisabled: true,
  }, operationId, fetcher);
}
