import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { unzipSync } from 'fflate';

test('skill archives preserve published ZIP timestamps across host timezones', () => {
  const helper = new URL('../scripts/skill-archive.mjs', import.meta.url).href;
  const source = `
    import { createSkillArchive } from ${JSON.stringify(helper)};
    const zip = createSkillArchive({
      'example/SKILL.md': [Buffer.from('---\\nname: example\\n---\\nInstructions.\\n'), { os: 3, attrs: 0o644 << 16 }],
      'example/run.sh': [Buffer.from('#!/bin/sh\\nprintf example\\n'), { os: 3, attrs: 0o755 << 16 }],
    });
    process.stdout.write(Buffer.from(zip));
  `;
  const archives = ['UTC', 'Asia/Kolkata', 'America/Los_Angeles', 'Pacific/Auckland']
    .map(TZ => execFileSync(process.execPath, ['--input-type=module', '-e', source], { env: { ...process.env, TZ } }));
  for (const archive of archives) {
    assert.deepEqual(archive, archives[0], 'Different timezones must produce identical archive bytes');
    assert.equal(archive.readUInt16LE(10), 11200, 'Preserve the published 05:30:00 DOS time');
    assert.equal(archive.readUInt16LE(12), 20513, 'Preserve the published 2020-01-01 DOS date');
    assert.deepEqual(Object.keys(unzipSync(archive)), ['example/SKILL.md', 'example/run.sh']);
  }
});
