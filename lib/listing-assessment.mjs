export const riskLevels = ['unknown', 'low', 'medium', 'high'];
export const functionalityStates = ['not-tested', 'documented', 'verified', 'blocked'];

export function validateAssessment(input) {
  const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
  if (!riskLevels.includes(input.riskLevel)) fail('Choose a risk level.');
  if (!functionalityStates.includes(input.functionality)) fail('Choose a functionality assessment.');
  const result = { riskLevel: input.riskLevel, functionality: input.functionality };
  for (const [key, max] of [['permissions', 2000], ['findings', 3000], ['evidence', 3000]]) {
    if (typeof input[key] !== 'string' || input[key].trim().length < 10 || input[key].trim().length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(input[key])) fail(`Provide ${key} (10–${max} characters).`);
    result[key] = input[key].trim();
  }
  return result;
}

export function publicationBlocker(assessment) {
  if (!assessment) return 'Save a permissions, functionality and risk assessment before publication.';
  if (assessment.risk_level === 'unknown') return 'Resolve the unknown risk assessment before publication.';
  if (!['documented', 'verified'].includes(assessment.functionality)) return 'Resolve the blocked or untested functionality before publication. Documentation checks must state what was not tested.';
  return null;
}
