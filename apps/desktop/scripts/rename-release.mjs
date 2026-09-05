import { existsSync, readFileSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const tauriDir = join(__dirname, '..', 'src-tauri');
const targetDir = join(tauriDir, 'target');

const config = JSON.parse(readFileSync(join(tauriDir, 'tauri.conf.json'), 'utf8'));
const productName = config.productName ?? 'teamspace-one';
const escapedName = productName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const BUNDLE_TYPES = [
  { dir: 'dmg', ext: 'dmg' },
  { dir: 'nsis', ext: 'exe' },
  { dir: 'msi', ext: 'msi' },
  { dir: 'appimage', ext: 'AppImage' },
  { dir: 'deb', ext: 'deb' },
  { dir: 'rpm', ext: 'rpm' },
];

function* walkBundleDirs(root) {
  const candidates = [];

  const releaseBundle = join(root, 'release', 'bundle');
  if (existsSync(releaseBundle)) {
    candidates.push(releaseBundle);
  }

  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'release') continue;
    const nestedReleaseBundle = join(root, entry.name, 'release', 'bundle');
    if (existsSync(nestedReleaseBundle)) {
      candidates.push(nestedReleaseBundle);
    }
  }

  for (const bundleDir of candidates) {
    let bundleEntries;
    try {
      bundleEntries = readdirSync(bundleDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const bundleEntry of bundleEntries) {
      if (bundleEntry.isDirectory()) {
        yield join(bundleDir, bundleEntry.name);
      }
    }
  }
}

let renamed = 0;

for (const bundleDir of walkBundleDirs(targetDir)) {
  const type = BUNDLE_TYPES.find(
    (t) => bundleDir.endsWith(`/${t.dir}`) || bundleDir.endsWith(`\\${t.dir}`)
  );
  if (!type) continue;

  let files;
  try {
    files = readdirSync(bundleDir);
  } catch {
    continue;
  }

  const pattern = new RegExp(`^${escapedName}_.*\\.${type.ext}$`);
  for (const file of files) {
    if (pattern.test(file)) {
      const source = join(bundleDir, file);
      const target = join(bundleDir, `${productName}.${type.ext}`);
      rmSync(target, { force: true });
      renameSync(source, target);
      console.log(`Renamed ${file} -> ${productName}.${type.ext}`);
      renamed++;
    }
  }
}

if (renamed === 0) {
  console.warn(`No release bundles found for "${productName}" in ${targetDir}`);
  process.exit(1);
}
