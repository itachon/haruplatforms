import type { Finding } from '../types.js';

const color = (code: number) => (s: string) =>
  process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s;

export const c = {
  bold: color(1),
  dim: color(2),
  red: color(31),
  green: color(32),
  yellow: color(33),
  cyan: color(36),
};

export const log = {
  step: (msg: string) => console.log(`\n${c.cyan('▶')} ${c.bold(msg)}`),
  info: (msg: string) => console.log(`  ${msg}`),
  ok: (msg: string) => console.log(`  ${c.green('✔')} ${msg}`),
  warn: (msg: string) => console.log(`  ${c.yellow('!')} ${msg}`),
  error: (msg: string) => console.error(`  ${c.red('✖')} ${msg}`),
};

const ICONS = { ok: c.green('✔'), info: c.cyan('i'), warn: c.yellow('!'), error: c.red('✖') };

export function printFindings(findings: Finding[]): void {
  for (const f of findings) {
    console.log(`  ${ICONS[f.level]} ${f.message}`);
    if (f.hint) console.log(`    ${c.dim(f.hint)}`);
  }
}
