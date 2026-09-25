import { zipSync } from 'fflate';

// ZIP stores a wall-clock DOS timestamp without a timezone. Preserve the
// published catalog's 2020-01-01 05:30 timestamp on every build machine.
// An ISO/UTC Date would be converted through the host's timezone by fflate.
export function createSkillArchive(files) {
  return zipSync(files, { level: 6, mtime: new Date(2020, 0, 1, 5, 30, 0) });
}
