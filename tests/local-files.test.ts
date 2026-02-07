#!/usr/bin/env tsx

import assert from 'node:assert';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { collectSkillScanFiles } from '../src/scanner/local-files.js';

async function makeTempDir() {
  return await mkdtemp(join(tmpdir(), 'playbooks-cli-scan-'));
}

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`✗ ${name}`);
    console.error(`  ${(err as Error).message}`);
    failed++;
  }
}

await test('collectSkillScanFiles: includes SKILL.md first when maxFiles is tight', async () => {
  const dir = await makeTempDir();

  await writeFile(join(dir, 'SKILL.md'), '---\nname: x\ndescription: y\n---\n', 'utf-8');
  await mkdir(join(dir, 'scripts'), { recursive: true });
  await writeFile(join(dir, 'scripts', 'a.ts'), 'eval("1")', 'utf-8');
  await writeFile(join(dir, 'README.md'), 'hi', 'utf-8');

  const res = await collectSkillScanFiles(dir, {
    maxFiles: 1,
    maxFileBytes: 160_000,
    maxTotalBytes: 1_200_000,
  });
  assert.strictEqual(res.files.length, 1);
  assert.strictEqual(res.files[0]?.path, 'SKILL.md');
});

if (failed > 0) process.exit(1);
console.log(`\n${passed} passed, ${failed} failed`);
