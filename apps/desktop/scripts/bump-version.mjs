/**
 * Bumps the desktop app version everywhere it is defined so the Tauri updater
 * always sees a newer build:
 *
 *   - src-tauri/tauri.conf.json  (source of truth for the updater)
 *   - package.json               (workspace version, kept in sync)
 *   - src-tauri/Cargo.toml       (crate version, kept in sync)
 *
 * Usage:
 *   node scripts/bump-version.mjs [patch|minor|major|ci|<x.y.z>] [--dry-run] [--build <n>]
 *
 * Default bump is `patch`. `ci` sets the patch segment to the CI build number
 * (Azure `BUILD_BUILDID`, `GITHUB_RUN_NUMBER`, or `--build <n>`) so every
 * pipeline build produces a unique, monotonically increasing version without
 * committing anything back. Set BUMP_SKIP=1 to leave versions untouched
 * (useful for local test builds wired through `tauri:build`).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argv } from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appDir = join(__dirname, '..');

const files = {
  tauri: join(appDir, 'src-tauri', 'tauri.conf.json'),
  pkg: join(appDir, 'package.json'),
  cargo: join(appDir, 'src-tauri', 'Cargo.toml'),
};

const dryRun = argv.includes('--dry-run');
function argValue(name) {
  const i = argv.indexOf(name);
  return i !== -1 && i + 1 < argv.length ? argv[i + 1] : undefined;
}

const bumpArg = argv.find(
  (a, i) => i > 1 && !a.startsWith('--')
) ?? 'patch';

if (process.env.BUMP_SKIP === '1') {
  console.log('[version] BUMP_SKIP=1 — leaving version unchanged');
  process.exit(0);
}

const tauriRaw = readFileSync(files.tauri, 'utf8');
const tauriMatch = /"version":\s*"([0-9]+\.[0-9]+\.[0-9]+[^"]*)"/.exec(tauriRaw);
if (!tauriMatch) {
  console.error('[version] could not find "version" in tauri.conf.json');
  process.exit(1);
}
const current = tauriMatch[1];

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(.*)$/;
function nextVersion(current, bump) {
  if (SEMVER.test(bump)) return bump;
  const m = SEMVER.exec(current);
  if (!m) throw new Error(`current version "${current}" is not semver`);
  const [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
  switch (bump) {
    case 'major': return `${major + 1}.0.0`;
    case 'minor': return `${major}.${minor + 1}.0`;
    case 'patch': return `${major}.${minor}.${patch + 1}`;
    case 'ci': {
      const buildNo =
        process.env.BUILD_BUILDID ||
        process.env.GITHUB_RUN_NUMBER ||
        argValue('--build');
      if (!buildNo || !/^\d+$/.test(buildNo)) {
        throw new Error('ci bump needs a numeric build number (BUILD_BUILDID / --build <n>)');
      }
      return `${major}.${minor}.${buildNo}`;
    }
    default:
      throw new Error(`unknown bump "${bump}" (expected patch|minor|major|x.y.z)`);
  }
}

const next = nextVersion(current, bumpArg);
console.log(`[version] ${current} -> ${next} (${bumpArg})`);

if (dryRun) process.exit(0);

// Replace only the first version field in each file so formatting is preserved.
writeFileSync(
  files.tauri,
  tauriRaw.replace(/"version":\s*"[^"]*"/, `"version": "${next}"`),
);

const pkgRaw = readFileSync(files.pkg, 'utf8');
writeFileSync(
  files.pkg,
  pkgRaw.replace(/"version":\s*"[^"]*"/, `"version": "${next}"`),
);

const cargoRaw = readFileSync(files.cargo, 'utf8');
const cargoReplaced = cargoRaw.replace(/^version = "[^"]*"/m, `version = "${next}"`);
if (cargoReplaced === cargoRaw) {
  console.error('[version] could not find `version =` in Cargo.toml');
  process.exit(1);
}
writeFileSync(files.cargo, cargoReplaced);
