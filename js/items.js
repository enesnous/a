// Detaylı silahlar ve eşyalar: Glock 17, şok cihazı, kelepçe, bıçak, tabanca vb.
import * as THREE from 'three';
import { mat, boxGeo, rbox, cyl, sph, torus, plane, M, G, ownMat, basic } from './kit.js';

// Glock: namlu +z, kabza orijinde
export function createGlock({ light = true, chrome = false, scale = 1.45 } = {}) {
  const g = new THREE.Group();
  const s = new THREE.Group(); s.scale.setScalar(scale); g.add(s);
  const slideM = chrome ? mat('#c9ccd1', { m: 1, r: 0.22 }) : mat('#1c1d20', { m: 0.65, r: 0.38 });
  const frameM = mat('#141517', { r: 0.78 });
  const dark = mat('#08090a', { r: 0.6 });
  const steel = mat('#3a3d42', { m: 0.9, r: 0.35 });
  // Kabza (18° eğimli)
  const grip = G(s, 0, 0, 0); grip.rotation.x = 0.32;
  M(rbox(0.03, 0.105, 0.05, 0.008), frameM, 0, -0.035, 0, 0, 0, 0, grip);
  for (let i = 0; i < 3; i++) M(boxGeo(0.031, 0.008, 0.006), dark, 0, -0.0 - i * 0.025, 0.026, 0, 0, 0, grip, false); // parmak yivleri
  for (let i = 0; i < 6; i++) M(boxGeo(0.0315, 0.004, 0.035), mat('#1b1c1f', { r: 0.95 }), 0, -0.07 + i * 0.012, -0.002, 0, 0, 0, grip, false); // pütür
  M(rbox(0.032, 0.014, 0.056, 0.004), dark, 0, -0.093, 0.002, 0, 0, 0, grip); // şarjör tabanı
  M(boxGeo(0.033, 0.016, 0.012), frameM, 0, 0.022, -0.03, -0.2, 0, 0, grip); // kuyruk
  // Gövde üst kısım (frame) + ray
  M(boxGeo(0.028, 0.02, 0.12), frameM, 0, 0.022, 0.06, 0, 0, 0, s);
  for (let i = 0; i < 3; i++) M(boxGeo(0.03, 0.004, 0.008), dark, 0, 0.012, 0.085 + i * 0.016, 0, 0, 0, s, false);
  // Tetik korkuluğu
  M(boxGeo(0.012, 0.006, 0.05), frameM, 0, -0.012, 0.045, 0, 0, 0, s);
  M(boxGeo(0.012, 0.03, 0.006), frameM, 0, 0.0, 0.07, 0.2, 0, 0, s);
  M(boxGeo(0.006, 0.022, 0.006), mat('#222', { r: 0.4 }), 0, 0.003, 0.035, -0.25, 0, 0, s); // tetik
  M(boxGeo(0.002, 0.014, 0.003), mat('#3a3a3a', {}), 0, 0.004, 0.0375, -0.25, 0, 0, s, false); // tetik emniyeti
  M(boxGeo(0.032, 0.008, 0.008), dark, 0, 0.018, 0.018, 0, 0, 0, s, false); // şarjör düğmesi
  M(boxGeo(0.032, 0.004, 0.012), steel, 0, 0.03, 0.05, 0, 0, 0, s, false); // sökme kolu
  M(boxGeo(0.002, 0.006, 0.02), steel, 0.016, 0.033, 0.03, 0, 0, 0, s, false); // sürgü kilidi
  // Sürgü (kayar)
  const slide = G(s, 0, 0, 0); g.userData.slide = slide;
  M(rbox(0.027, 0.03, 0.186, 0.004), slideM, 0, 0.048, 0.062, 0, 0, 0, slide);
  M(boxGeo(0.02, 0.006, 0.18), slideM, 0, 0.065, 0.062, 0, 0, 0, slide);
  for (let i = 0; i < 7; i++) { M(boxGeo(0.0285, 0.024, 0.0025), dark, 0, 0.048, -0.024 + i * 0.005, 0, 0, 0, slide, false); }
  for (let i = 0; i < 5; i++) { M(boxGeo(0.0285, 0.024, 0.0025), dark, 0, 0.048, 0.125 + i * 0.005, 0, 0, 0, slide, false); }
  M(boxGeo(0.002, 0.012, 0.036), dark, -0.0136, 0.056, 0.05, 0, 0, 0, slide, false); // atım penceresi
  M(boxGeo(0.012, 0.012, 0.034), mat('#4b4f55', { m: 0.9, r: 0.3 }), -0.004, 0.056, 0.05, 0, 0, 0, slide, false); // namlu kapağı
  // Nişangahlar (tritium – yeşil parlar)
  M(boxGeo(0.016, 0.008, 0.008), dark, 0, 0.071, -0.02, 0, 0, 0, slide, false);
  M(boxGeo(0.004, 0.008, 0.008), dark, 0, 0.071, 0.142, 0, 0, 0, slide, false);
  const trit = ownMat('#7dffa0', { e: '#66ff88', ei: 4 });
  M(sph(0.0016, 6, 4), trit, 0, 0.073, 0.1465, 0, 0, 0, slide, false);
  M(sph(0.0016, 6, 4), trit, 0.005, 0.073, -0.0245, 0, 0, 0, slide, false);
  M(sph(0.0016, 6, 4), trit, -0.005, 0.073, -0.0245, 0, 0, 0, slide, false);
  // Namlu ağzı
  M(cyl(0.0065, 0.0065, 0.01, 12), mat('#2a2c30', { m: 0.9, r: 0.3 }), 0, 0.048, 0.152, Math.PI / 2, 0, 0, slide, false);
  M(cyl(0.0045, 0.0045, 0.012, 10), mat('#000', { r: 1 }), 0, 0.048, 0.153, Math.PI / 2, 0, 0, slide, false);
  // Taktik fener
  if (light) {
    const tl = G(s, 0, 0.004, 0.1);
    M(rbox(0.026, 0.024, 0.06, 0.004), mat('#101113', { r: 0.6 }), 0, 0, 0, 0, 0, 0, tl);
    M(cyl(0.012, 0.012, 0.012, 14), mat('#111', { r: 0.4, m: 0.4 }), 0, 0, 0.034, Math.PI / 2, 0, 0, tl);
    const lens = M(cyl(0.010, 0.010, 0.002, 14), ownMat('#ffffff', { e: '#fff6e0', ei: 0.2 }), 0, 0, 0.041, Math.PI / 2, 0, 0, tl, false);
    g.userData.lens = lens;
    M(boxGeo(0.006, 0.006, 0.014), dark, 0.014, 0, -0.02, 0, 0, 0, tl, false);
  }
  g.userData.muzzle = new THREE.Vector3(0, 0.048 * scale, 0.16 * scale);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// Basit ama detaylı ruhsatsız tabanca (krom sürgülü)
export function createPistol() { return createGlock({ light: false, chrome: true, scale: 1.35 }); }

// Taser 7 (sarı)
export function createTaser() {
  const g = new THREE.Group(); const s = G(g); s.scale.setScalar(1.45);
  const yellow = mat('#f2c318', { r: 0.45 });
  const black = mat('#121316', { r: 0.7 });
  const grip = G(s, 0, 0, 0); grip.rotation.x = 0.25;
  M(rbox(0.032, 0.1, 0.048, 0.008), black, 0, -0.035, 0, 0, 0, 0, grip);
  for (let i = 0; i < 5; i++) M(boxGeo(0.0335, 0.004, 0.04), mat('#222', { r: 0.95 }), 0, -0.07 + i * 0.014, 0, 0, 0, 0, grip, false);
  M(rbox(0.038, 0.05, 0.16, 0.01), yellow, 0, 0.04, 0.065, 0, 0, 0, s);
  M(rbox(0.04, 0.054, 0.04, 0.008), black, 0, 0.04, 0.155, 0, 0, 0, s); // kartuş
  M(boxGeo(0.03, 0.016, 0.004), mat('#2b6be0', { r: 0.3 }), 0, 0.05, 0.176, 0, 0, 0, s, false);
  M(boxGeo(0.03, 0.016, 0.004), mat('#2b6be0', { r: 0.3 }), 0, 0.03, 0.176, 0, 0, 0, s, false);
  M(boxGeo(0.008, 0.024, 0.008), black, 0, 0.003, 0.035, -0.3, 0, 0, s); // tetik
  M(boxGeo(0.012, 0.006, 0.05), black, 0, -0.012, 0.045, 0, 0, 0, s);
  M(boxGeo(0.039, 0.01, 0.02), black, 0, 0.064, 0.0, 0, 0, 0, s); // emniyet
  g.userData.led = M(boxGeo(0.012, 0.006, 0.004), ownMat('#30ff6a', { e: '#30ff6a', ei: 3 }), 0, 0.058, -0.016, 0, 0, 0, s, false);
  g.userData.laserDot = M(sph(0.004, 8, 6), ownMat('#ff2020', { e: '#ff2020', ei: 6 }), 0.014, 0.022, 0.16, 0, 0, 0, s, false);
  g.userData.muzzle = new THREE.Vector3(0, 0.04 * 1.45, 0.18 * 1.45);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// Kelepçe
export function createCuffs() {
  const g = new THREE.Group(); const s = G(g); s.scale.setScalar(1.5);
  const steel = mat('#c9ced6', { m: 1, r: 0.22 });
  const mkCuff = (x) => {
    const c = G(s, x, 0, 0.05);
    c.rotation.y = Math.PI / 2;
    M(torus(0.034, 0.0065, 8, 22), steel, 0, 0, 0, 0, 0, 0, c);
    M(boxGeo(0.02, 0.02, 0.016), steel, 0.04, 0, 0, 0, 0, 0, c);
    M(boxGeo(0.004, 0.006, 0.017), mat('#222', {}), 0.05, 0, 0, 0, 0, 0, c, false);
    for (let i = 0; i < 8; i++) { const a = -0.6 + i * 0.14; M(boxGeo(0.004, 0.004, 0.014), mat('#8a9099', { m: 1, r: 0.3 }), Math.cos(a) * 0.028, Math.sin(a) * 0.028, 0, 0, 0, a, c, false); }
    return c;
  };
  mkCuff(-0.05); mkCuff(0.05);
  for (let i = 0; i < 3; i++) { const l = M(torus(0.008, 0.0022, 6, 12), steel, -0.016 + i * 0.016, 0, 0.05, 0, i % 2 ? Math.PI / 2 : 0, 0, s); }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function createKnife() {
  const g = new THREE.Group(); const s = G(g); s.scale.setScalar(1.4);
  M(rbox(0.026, 0.03, 0.11, 0.008), mat('#2b1a10', { r: 0.6 }), 0, 0, 0, 0, 0, 0, s);
  M(boxGeo(0.03, 0.04, 0.008), mat('#9aa0a8', { m: 1, r: 0.3 }), 0, 0, 0.058, 0, 0, 0, s);
  const blade = M(boxGeo(0.004, 0.03, 0.15), mat('#d6dbe2', { m: 1, r: 0.15 }), 0, 0.004, 0.135, 0, 0, 0, s);
  M(boxGeo(0.004, 0.012, 0.03), mat('#d6dbe2', { m: 1, r: 0.15 }), 0, 0.01, 0.214, 0.5, 0, 0, s);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
export function createBat() {
  const g = new THREE.Group();
  M(cyl(0.035, 0.022, 0.75, 12), mat('#a87a4a', { r: 0.5 }), 0, 0, 0.35, Math.PI / 2, 0, 0, g);
  M(cyl(0.024, 0.024, 0.12, 10), mat('#222', { r: 0.9 }), 0, 0, -0.03, Math.PI / 2, 0, 0, g);
  return g;
}
export function createPhone() {
  const g = new THREE.Group();
  M(rbox(0.07, 0.012, 0.14, 0.01), mat('#111', { r: 0.3, m: 0.3 }), 0, 0, 0.05, 0, 0, 0, g);
  M(plane(0.062, 0.128), ownMat('#9fd0ff', { e: '#6fb6ff', ei: 1.8 }), 0, 0.007, 0.05, -Math.PI / 2, 0, 0, g, false);
  return g;
}
export function createGasCan() {
  const g = new THREE.Group();
  M(rbox(0.18, 0.26, 0.1, 0.02), mat('#c0262c', { r: 0.4 }), 0, -0.16, 0.05, 0, 0, 0, g);
  M(cyl(0.015, 0.015, 0.08, 8), mat('#222', {}), 0.06, -0.02, 0.05, 0.6, 0, 0, g);
  return g;
}
export function createSprayCan() {
  const g = new THREE.Group();
  M(cyl(0.028, 0.028, 0.16, 12), mat('#2a9df4', { m: 0.5, r: 0.3 }), 0, 0, 0.06, Math.PI / 2, 0, 0, g);
  M(cyl(0.012, 0.012, 0.02, 8), mat('#fff', {}), 0, 0, 0.15, Math.PI / 2, 0, 0, g);
  return g;
}
export function createBag(color = '#3a2a1e') {
  const g = new THREE.Group();
  M(rbox(0.5, 0.36, 0.28, 0.06), mat(color, { r: 0.85 }), 0, 0.18, 0, 0, 0, 0, g);
  M(torus(0.12, 0.015, 6, 16, Math.PI), mat('#222', { r: 0.6 }), 0, 0.36, 0, 0, 0, 0, g);
  M(boxGeo(0.4, 0.02, 0.01), mat('#9aa0a8', { m: 1, r: 0.3 }), 0, 0.3, 0.141, 0, 0, 0, g);
  // kablo ve kırmızı LED (şüpheli paket)
  g.userData.led = M(sph(0.012, 6, 4), ownMat('#ff2020', { e: '#ff2020', ei: 5 }), 0.18, 0.37, 0.05, 0, 0, 0, g, false);
  M(cyl(0.004, 0.004, 0.2, 5), mat('#c0262c', {}), 0.12, 0.37, 0.05, 0, 0, Math.PI / 2, g);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
export function createTeaGlass() {
  const g = new THREE.Group();
  M(cyl(0.022, 0.016, 0.03, 10), mat('#a33b12', { t: true, op: 0.85, r: 0.05 }), 0, 0.015, 0, 0, 0, 0, g, false);
  M(cyl(0.016, 0.022, 0.03, 10), mat('#a33b12', { t: true, op: 0.85, r: 0.05 }), 0, 0.045, 0, 0, 0, 0, g, false);
  M(cyl(0.04, 0.04, 0.006, 12), mat('#d8d8d8', { m: 0.6, r: 0.3 }), 0, 0.0, 0, 0, 0, 0, g, false);
  return g;
}

// Taser telleri, mermi izi gibi efektler için ince çizgi
export function beam(color, opacity = 0.9) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1, 5, 1, true), basic(color, { t: true, op: opacity, add: true, tm: false }));
  m.geometry.translate(0, 0.5, 0); m.geometry.rotateX(Math.PI / 2);
  m.frustumCulled = false;
  return m;
}
