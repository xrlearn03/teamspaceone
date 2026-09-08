import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../../');

const ip = process.argv[2];
if (!ip) {
  console.error('Usage: node update-desktop.mjs <external-ip>');
  process.exit(1);
}

const envFile = resolve(repoRoot, 'apps/desktop/.env.production');
let env = readFileSync(envFile, 'utf8');

env = env.replace(/^VITE_GATEWAY_URL=.*$/m, `VITE_GATEWAY_URL=http://${ip}:3000`);
env = env.replace(/^VITE_REALTIME_URL=.*$/m, `VITE_REALTIME_URL=http://${ip}:3005`);
env = env.replace(/^VITE_LIVEKIT_URL=.*$/m, `VITE_LIVEKIT_URL=ws://${ip}:7880`);
env = env.replace(/^VITE_SFU_URL=.*$/m, `VITE_SFU_URL=ws://${ip}:8443`);

writeFileSync(envFile, env);

const capsFile = resolve(repoRoot, 'apps/desktop/src-tauri/capabilities/default.json');
const caps = JSON.parse(readFileSync(capsFile, 'utf8'));

const remoteKeep = [
  'http://localhost:*/*',
  'ws://localhost:*/*',
  'tauri://localhost/*',
  'http://tauri.localhost/*',
];
const remoteAdd = [`http://${ip}:*/*`, `ws://${ip}:*/*`];
caps.remote.urls = [...new Set([...remoteKeep, ...remoteAdd])];

const httpPerm = caps.permissions.find(
  (p) => typeof p === 'object' && p.identifier === 'http:default',
);
if (httpPerm) {
  httpPerm.allow = [
    { url: 'http://localhost:3000/*' },
    { url: 'http://localhost:3005/*' },
    { url: 'http://localhost:1420/*' },
    { url: 'http://localhost:5173/*' },
    { url: `http://${ip}:3000/*` },
    { url: `http://${ip}:3005/*` },
  ];
}

writeFileSync(capsFile, JSON.stringify(caps, null, 2) + '\n');

console.log(`Wired desktop client to ${ip}`);
console.log('  apps/desktop/.env.production');
console.log('  apps/desktop/src-tauri/capabilities/default.json');
