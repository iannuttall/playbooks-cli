#!/usr/bin/env tsx

/**
 * Unit tests for flows/install-summary.ts
 *
 * Run with: npx tsx tests/install-summary.test.ts
 */

import assert from 'node:assert';
import { type InstallResult, formatResultSummary } from '../src/flows/install-summary.js';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`✗ ${name}`);
    console.error(`  ${(err as Error).message}`);
    failed++;
  }
}

test('copy mode: dedupes identical target paths', () => {
  const sharedPath = '/tmp/.agents/skills/private-skill';
  const results: InstallResult[] = [
    {
      skill: 'private-skill',
      agentId: 'codex',
      agent: 'Codex',
      success: true,
      path: sharedPath,
      mode: 'copy',
    },
    {
      skill: 'private-skill',
      agentId: 'amp',
      agent: 'Amp',
      success: true,
      path: sharedPath,
      mode: 'copy',
    },
    {
      skill: 'private-skill',
      agentId: 'cursor',
      agent: 'Cursor',
      success: true,
      path: sharedPath,
      mode: 'copy',
    },
  ];

  const summary = formatResultSummary(results);
  const pathLines = summary.lines.filter((l) => l.includes(sharedPath));
  assert.strictEqual(pathLines.length, 1);
});

test('copy mode: keeps distinct target paths', () => {
  const results: InstallResult[] = [
    {
      skill: 'private-skill',
      agentId: 'codex',
      agent: 'Codex',
      success: true,
      path: '/tmp/.agents/skills/private-skill',
      mode: 'copy',
    },
    {
      skill: 'private-skill',
      agentId: 'cursor',
      agent: 'Cursor',
      success: true,
      path: '/tmp/.cursor/skills/private-skill',
      mode: 'copy',
    },
  ];

  const summary = formatResultSummary(results);
  assert(summary.lines.some((l) => l.includes('/tmp/.agents/skills/private-skill')));
  assert(summary.lines.some((l) => l.includes('/tmp/.cursor/skills/private-skill')));
});

if (failed > 0) process.exit(1);
console.log(`\n${passed} passed, ${failed} failed`);
