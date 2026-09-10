/**
 * Generates the static Tauri updater manifest (`update.json`) from the signed
 * updater artifacts produced by `tauri build` (requires
 * `bundle.createUpdaterArtifacts: true` in tauri.conf.json and
 * `TAURI_SIGNING_PRIVATE_KEY` set during the build).
 *
 * Scans `src-tauri/target` bundle directories for `*.sig` files, maps each
 * updater artifact to its `<os>-<arch>` platform key, and writes a manifest in
 * the format documented at https://v2.tauri.app/plugin/updater/:
 *
 *   {
 *     "version": "0.1.1",
 *     "notes": "...",
 *     "pub_date": "<RFC 3339>",
 *     "platforms": {
 *       "windows-x86_64": { "signature": "...", "url": "..." },
 *       "darwin-x86_64":  { "signature": "...", "url": "..." },
 *       "darwin-aarch64": { "signature": "...", "url": "..." }
 *     }
 *   }
 *
 * Usage:
 *   node scripts/generate-update-manifest.mjs \
 *     --base-url https://teamspaceone.in/downloads \
 *     --out ../../apps/web/public/downloads/update.json
 *
 * Options:
 *   --base-url   Public base URL the update bundles are hosted at (required).
 *   --out        Manifest output path (default: apps/web/public/downloads/update.json).
 *   --root       Tauri target dir (default: src-tauri/target).
 *   --version    Manifest version (default: version from tauri.conf.json).
 *   --notes      Release notes string (default: empty).
 *   --pub-date   RFC 3339 date (default: now).
 *   --copy-to    Also copy the installer + updater bundles into this dir
 *                (e.g. ../../web/public/downloads) so one folder can be
 *                deployed to the web host.
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argv } from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs() {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    const inline = key.indexOf('=');
    if (inline !== -1) {
      args[key.slice(2, inline)] = key.slice(inline + 1);
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      args[key.slice(2)] = argv[++i];
    } else {
      args[key.slice(2)] = true;
    }
  }
  return args;
}

const args = parseArgs();

const tauriDir = join(__dirname, '..', 'src-tauri');
const config = JSON.parse(readFileSync(join(tauriDir, 'tauri.conf.json'), 'utf8'));

const baseUrl = args['base-url'] ?? process.env.UPDATER_BASE_URL;
if (!baseUrl) {
  console.log('Skipping update manifest: set --base-url or UPDATER_BASE_URL to generate one.');
  process.exit(0);
}

const rootDir = args.root ? join(__dirname, '..', args.root) : join(tauriDir, 'target');
const version = (args.version ?? config.version ?? '').replace(/^v/, '');
if (!version) {
  console.error('Missing --version and no version found in tauri.conf.json');
  process.exit(1);
}
const notes = typeof args.notes === 'string' ? args.notes : '';
const pubDate = typeof args['pub-date'] === 'string' ? args['pub-date'] : new Date().toISOString();
const outPath = args.out
  ? join(__dirname, '..', args.out)
  : join(__dirname, '..', '..', 'web', 'public', 'downloads', 'update.json');
const copyTo = args['copy-to'] ? join(__dirname, '..', args['copy-to']) : null;
const installerDmgName = args['dmg-name'] ?? `${productName}.dmg`;
const installerExeName = args['exe-name'] ?? 'Teamspace-One-Setup.exe';

/** Recursively find every *.sig updater signature under dir. */
function* findSigFiles(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* findSigFiles(full);
    } else if (entry.isFile() && entry.name.endsWith('.sig')) {
      yield full;
    }
  }
}

/**
 * Map an updater artifact path to one or more Tauri platform keys
 * (`<os>-<arch>`). A universal macOS bundle expands to both arches.
 */
function platformKeysFor(artifactPath) {
  const lower = artifactPath.replaceAll('\\', '/').toLowerCase();
  const file = basename(lower);

  let os = null;
  if (lower.includes('/macos/') || file.endsWith('.app.tar.gz')) os = 'darwin';
  else if (lower.includes('nsis') || lower.includes('msi') || file.endsWith('.nsis.zip') || file.endsWith('.msi.zip') || file.endsWith('.exe')) os = 'windows';
  else if (file.endsWith('.appimage') || file.endsWith('.appimage.tar.gz')) os = 'linux';

  if (!os) return [];

  if (file.includes('universal') && os === 'darwin') {
    return ['darwin-x86_64', 'darwin-aarch64'];
  }
  if (file.includes('aarch64') || file.includes('arm64')) return [`${os}-aarch64`];
  if (file.includes('i686') || file.includes('x86')) return [`${os}-i686`];
  // x64 / x86_64 / amd64, and the default when no arch token is present.
  return [`${os}-x86_64`];
}

const platforms = {};
let found = 0;
const copied = new Set();

if (copyTo) {
  mkdirSync(copyTo, { recursive: true });
}

for (const sigPath of findSigFiles(rootDir)) {
  const artifactPath = sigPath.slice(0, -'.sig'.length);
  if (!existsSync(artifactPath) || !statSync(artifactPath).isFile()) continue;

  const signature = readFileSync(sigPath, 'utf8').trim();
  const url = `${baseUrl.replace(/\/+$/, '')}/${encodeURIComponent(basename(artifactPath))}`;

  for (const key of platformKeysFor(artifactPath)) {
    platforms[key] = { signature, url };
    found++;
    console.log(`  ${key} -> ${basename(artifactPath)}`);

    if (copyTo && !copied.has(artifactPath)) {
      copyFileSync(artifactPath, join(copyTo, basename(artifactPath)));
      copyFileSync(sigPath, join(copyTo, basename(sigPath)));
      copied.add(artifactPath);
    }
  }
}

/** Also stage the standalone installers used by the marketing download buttons. */
function* findInstallerFiles(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* findInstallerFiles(full);
    } else if (entry.isFile() && (entry.name.endsWith('.dmg') || (entry.name.endsWith('.exe') && !entry.name.endsWith('.sig')))) {
      yield full;
    }
  }
}

if (copyTo) {
  for (const installerPath of findInstallerFiles(rootDir)) {
    const lower = installerPath.replaceAll('\\', '/').toLowerCase();
    const isDmg = lower.endsWith('.dmg');
    const isNsisExe = lower.includes('/nsis/') && lower.endsWith('.exe');
    if (!isDmg && !isNsisExe) continue;

    const destName = isDmg ? installerDmgName : installerExeName;
    copyFileSync(installerPath, join(copyTo, destName));
    console.log(`  staged installer -> ${destName}`);
  }
}

if (found === 0) {
  console.error(`No updater .sig artifacts found under ${rootDir}.`);
  console.error('Run `pnpm --filter @teamspace-one/desktop tauri:build` with TAURI_SIGNING_PRIVATE_KEY set first.');
  process.exit(1);
}

const manifest = {
  version,
  notes,
  pub_date: pubDate,
  platforms,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Wrote ${outPath} (version ${version}, ${found} platform entries)`);
