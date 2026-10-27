// Ortak malzeme ve geometri önbelleği.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const matCache = new Map();
export function mat(color, o = {}) {
  const key = JSON.stringify([typeof color === 'number' ? color : String(color), o.r, o.m, o.e, o.ei, o.t, o.op, o.ds, o.map && o.map.uuid, o.nm && o.nm.uuid, o.em && o.em.uuid, o.rm && o.rm.uuid, o.at, o.side, o.fog, o.env, o.dw, o.ns]);
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({
    color, roughness: o.r ?? 0.75, metalness: o.m ?? 0,
  });
  if (o.map) m.map = o.map;
  if (o.nm) { m.normalMap = o.nm; if (o.ns) m.normalScale.set(o.ns, o.ns); }
  if (o.rm) m.roughnessMap = o.rm;
  if (o.e !== undefined) { m.emissive = new THREE.Color(o.e); m.emissiveIntensity = o.ei ?? 1; }
  if (o.em) { m.emissiveMap = o.em; if (o.e === undefined) { m.emissive = new THREE.Color(0xffffff); m.emissiveIntensity = o.ei ?? 1; } }
  if (o.t) { m.transparent = true; m.opacity = o.op ?? 0.5; m.depthWrite = o.dw ?? false; }
  if (o.at) m.alphaTest = o.at;
  if (o.side) m.side = o.side;
  if (o.env !== undefined) m.envMapIntensity = o.env;
  matCache.set(key, m);
  return m;
}
// Kendine ait (önbelleksiz) malzeme – animasyonlu LED vb. için
export function ownMat(color, o = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: o.r ?? 0.5, metalness: o.m ?? 0 });
  if (o.e !== undefined) { m.emissive = new THREE.Color(o.e); m.emissiveIntensity = o.ei ?? 1; }
  if (o.map) m.map = o.map;
  if (o.em) m.emissiveMap = o.em;
  if (o.t) { m.transparent = true; m.opacity = o.op ?? 0.5; m.depthWrite = false; }
  if (o.side) m.side = o.side;
  return m;
}
export function basic(color, o = {}) {
  const m = new THREE.MeshBasicMaterial({ color, transparent: !!o.t, opacity: o.op ?? 1, depthWrite: o.dw ?? !o.t, blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending, side: o.side ?? THREE.FrontSide, map: o.map || null, fog: o.fog ?? true, toneMapped: o.tm ?? true });
  return m;
}

const geoCache = new Map();
// Dünya ölçekli UV'li kutu (uvs: metre / doku tekrarı)
export function boxGeo(w, h, d, uvs = 0) {
  const key = `b${w.toFixed(3)},${h.toFixed(3)},${d.toFixed(3)},${uvs}`;
  if (geoCache.has(key)) return geoCache.get(key);
  const g = new THREE.BoxGeometry(w, h, d);
  if (uvs > 0) {
    const uv = g.attributes.uv;
    const spans = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
      const i = f * 4 + k; uv.setXY(i, uv.getX(i) * spans[f][0] / uvs, uv.getY(i) * spans[f][1] / uvs);
    }
  }
  geoCache.set(key, g);
  return g;
}
export function rbox(w, h, d, r = 0.04, seg = 2) {
  const key = `rb${w},${h},${d},${r},${seg}`;
  if (!geoCache.has(key)) geoCache.set(key, new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)));
  return geoCache.get(key);
}
export function cyl(rt, rb, h, seg = 16, open = false) {
  const key = `c${rt},${rb},${h},${seg},${open}`;
  if (!geoCache.has(key)) geoCache.set(key, new THREE.CylinderGeometry(rt, rb, h, seg, 1, open));
  return geoCache.get(key);
}
export function sph(r, ws = 16, hs = 12) {
  const key = `s${r},${ws},${hs}`;
  if (!geoCache.has(key)) geoCache.set(key, new THREE.SphereGeometry(r, ws, hs));
  return geoCache.get(key);
}
export function torus(r, t, rs = 8, ts = 24, arc = Math.PI * 2) {
  const key = `t${r},${t},${rs},${ts},${arc}`;
  if (!geoCache.has(key)) geoCache.set(key, new THREE.TorusGeometry(r, t, rs, ts, arc));
  return geoCache.get(key);
}
export function plane(w, h, uvs = 0) {
  const key = `p${w},${h},${uvs}`;
  if (!geoCache.has(key)) {
    const g = new THREE.PlaneGeometry(w, h);
    if (uvs > 0) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / uvs, uv.getY(i) * h / uvs); }
    geoCache.set(key, g);
  }
  return geoCache.get(key);
}

// Hızlı mesh: konum, dönüş
export function M(geo, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, parent = null, shadow = true) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  m.castShadow = shadow; m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}
export function G(parent, x = 0, y = 0, z = 0, ry = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; if (parent) parent.add(g); return g;
}

// Bir grubun doğrudan mesh çocuklarını malzemeye göre birleştir (eklem içi)
function cleanGeo(g, m) {
  const gg = g.clone(); gg.applyMatrix4(m);
  for (const k of Object.keys(gg.attributes)) if (!['position', 'normal', 'uv'].includes(k)) gg.deleteAttribute(k);
  gg.morphAttributes = {};
  return gg.attributes.uv ? gg : null;
}
function flush(buckets, parent) {
  for (const b of buckets.values()) {
    if (b.geos.length < 2) { b.orig[0].userData.keepMerged = true; continue; }
    const geo = mergeGeometries(b.geos, false); if (!geo) continue;
    for (const o of b.orig) o.parent.remove(o);
    const m = new THREE.Mesh(geo, b.m); m.castShadow = b.cast; m.receiveShadow = true; parent.add(m);
  }
}
export function mergeChildren(group) {
  const buckets = new Map();
  for (const c of group.children.slice()) {
    if (!c.isMesh || Array.isArray(c.material) || !c.geometry.index || c.userData.keep) continue;
    c.updateMatrix();
    const g = cleanGeo(c.geometry, c.matrix); if (!g) continue;
    const key = c.material.uuid + (c.castShadow ? 1 : 0);
    if (!buckets.has(key)) buckets.set(key, { m: c.material, cast: c.castShadow, geos: [], orig: [] });
    const b = buckets.get(key); b.geos.push(g); b.orig.push(c);
  }
  flush(buckets, group);
}
export function mergeDeep(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map(); const tmp = new THREE.Matrix4();
  root.traverse(c => {
    if (!c.isMesh || Array.isArray(c.material) || !c.geometry.index || c.userData.keep) return;
    tmp.multiplyMatrices(inv, c.matrixWorld);
    const g = cleanGeo(c.geometry, tmp); if (!g) return;
    const key = c.material.uuid + (c.castShadow ? 1 : 0);
    if (!buckets.has(key)) buckets.set(key, { m: c.material, cast: c.castShadow, geos: [], orig: [] });
    const b = buckets.get(key); b.geos.push(g); b.orig.push(c);
  });
  flush(buckets, root);
}

// GPU kaynaklarını serbest bırak (önbellekteki geometriler kullanılırsa yeniden yüklenir)
export function disposeTree(root) {
  root.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of ms) for (const k of ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'alphaMap']) if (m[k]) m[k].dispose();
    if (o.isLight && o.shadow && o.shadow.map) { o.shadow.map.dispose(); o.shadow.map = null; }
  });
}
