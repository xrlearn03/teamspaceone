import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
globalThis.self = globalThis;
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const file = process.argv[2] || '/Volumes/SSD/MVP/apps/desktop-next/public/assets/ai-interviewer.glb';
const loader = new GLTFLoader();
const data = fs.readFileSync(file);

loader.parse(data.buffer, '', (gltf) => {
  console.log('Meshes:', gltf.scene.children.length);
  const meshes = [];
  gltf.scene.traverse((obj) => {
    if (obj.isMesh) {
      meshes.push(obj);
      const dict = obj.morphTargetDictionary || {};
      const names = Object.keys(dict);
      console.log(`Mesh: ${obj.name}  morphs: ${names.length}`);
      if (names.length) console.log('  morph targets:', names.slice(0, 30));
    }
  });
  console.log('Total meshes:', meshes.length);
  if (!meshes.length) console.log('No meshes found');
}, (err) => {
  console.error('GLTF parse error:', err);
});
