// Araçlar: detaylı polis aracı (LED tepe lambası, iç mekan, MDT), sivil araçlar, otobüs, ambulans.
import * as THREE from 'three';
import { mat, boxGeo, rbox, cyl, sph, torus, plane, M, G, ownMat, basic, mergeDeep } from './kit.js';
import * as TX from './textures.js';

function wheel(parent, x, y, z, rimColor = '#b9bec6') {
  const w = G(parent, x, y, z);
  M(cyl(0.36, 0.36, 0.26, 22), mat('#141414', { r: 0.9 }), 0, 0, 0, 0, 0, Math.PI / 2, w);
  M(torus(0.3, 0.06, 8, 22), mat('#1b1b1b', { r: 0.8 }), Math.sign(x) * 0.12, 0, 0, 0, Math.PI / 2, 0, w);
  const rim = mat(rimColor, { m: 0.9, r: 0.3 });
  M(cyl(0.24, 0.24, 0.02, 20), rim, Math.sign(x) * 0.131, 0, 0, 0, 0, Math.PI / 2, w);
  for (let i = 0; i < 5; i++) M(boxGeo(0.03, 0.4, 0.05), rim, Math.sign(x) * 0.14, 0, 0, i * Math.PI / 5, 0, 0, w);
  M(cyl(0.06, 0.06, 0.03, 10), mat('#444', { m: 1, r: 0.3 }), Math.sign(x) * 0.15, 0, 0, 0, 0, Math.PI / 2, w);
  M(cyl(0.2, 0.2, 0.02, 16), mat('#5a5f66', { m: 0.8, r: 0.5 }), Math.sign(x) * 0.08, 0, 0, 0, 0, Math.PI / 2, w); // disk
  return w;
}

// Ortak sedan gövdesi. Araç +z yönüne bakar. Sol (sürücü) taraf +x.
function sedanBody(g, o) {
  const { body = '#e9ecef', lower = body, roof = body, glass = mat('#0b1016', { r: 0.05, m: 0.4, t: true, op: 0.62, env: 1.4 }) } = o;
  const bm = mat(body, { r: 0.28, m: 0.35, env: 1.2 });
  const lm = mat(lower, { r: 0.28, m: 0.35, env: 1.2 });
  const rm = mat(roof, { r: 0.28, m: 0.35, env: 1.2 });
  const trim = mat('#0d0e10', { r: 0.5 });
  // alt gövde
  M(boxGeo(1.94, 0.5, 4.9), lm, 0, 0.62, 0, 0, 0, 0, g);
  M(boxGeo(1.9, 0.14, 1.55), bm, 0, 0.92, 1.62, 0.04, 0, 0, g); // kaput
  M(boxGeo(1.9, 0.14, 1.0), bm, 0, 0.93, -1.95, -0.03, 0, 0, g); // bagaj
  M(boxGeo(1.96, 0.12, 2.0), bm, 0, 0.92, -0.1, 0, 0, 0, g); // bel çizgisi (kapılar üstü)
  // tavan
  M(rbox(1.56, 0.08, 1.75, 0.03), rm, 0, 1.45, -0.25, 0, 0, 0, g);
  // direkler
  for (const s of [-1, 1]) {
    M(boxGeo(0.07, 0.62, 0.08), rm, s * 0.8, 1.17, 0.78, -0.62, 0, 0, g); // A
    M(boxGeo(0.07, 0.48, 0.1), rm, s * 0.82, 1.21, -0.12, 0, 0, 0, g); // B
    M(boxGeo(0.07, 0.56, 0.08), rm, s * 0.8, 1.18, -1.28, 0.75, 0, 0, g); // C
  }
  // camlar
  const ws = M(plane(1.56, 0.78), glass, 0, 1.18, 0.82, -0.9, 0, 0, g, false); // ön cam
  M(plane(1.56, 0.66), glass, 0, 1.19, -1.3, 0.85 + Math.PI, 0, 0, g, false); // arka cam (ters)
  for (const s of [-1, 1]) {
    M(plane(0.85, 0.44), glass, s * 0.82, 1.2, 0.35, 0, s * Math.PI / 2, 0, g, false);
    M(plane(0.95, 0.44), glass, s * 0.82, 1.2, -0.67, 0, s * Math.PI / 2, 0, g, false);
  }
  // tamponlar, ızgara
  M(rbox(1.98, 0.28, 0.25, 0.06), trim, 0, 0.5, 2.48, 0, 0, 0, g);
  M(rbox(1.98, 0.3, 0.25, 0.06), trim, 0, 0.52, -2.48, 0, 0, 0, g);
  M(boxGeo(0.9, 0.16, 0.04), mat('#050506', { r: 0.4 }), 0, 0.78, 2.46, 0, 0, 0, g);
  // aynalar, kollar
  for (const s of [-1, 1]) {
    M(rbox(0.18, 0.12, 0.08, 0.02), trim, s * 1.02, 1.0, 0.68, 0, 0, 0, g);
    M(boxGeo(0.16, 0.08, 0.01), mat('#9fb3c8', { m: 1, r: 0.05 }), s * 1.02, 1.0, 0.635, 0, 0, 0, g, false);
    M(boxGeo(0.03, 0.03, 0.14), mat('#202226', { m: 0.6, r: 0.3 }), s * 0.98, 0.9, 0.3, 0, 0, 0, g, false);
    M(boxGeo(0.03, 0.03, 0.14), mat('#202226', { m: 0.6, r: 0.3 }), s * 0.98, 0.9, -0.62, 0, 0, 0, g, false);
    M(boxGeo(0.02, 0.36, 0.02), trim, s * 0.975, 0.68, -0.12, 0, 0, 0, g, false); // kapı aralığı
    M(boxGeo(0.02, 0.36, 0.02), trim, s * 0.975, 0.68, 0.98, 0, 0, 0, g, false);
    M(boxGeo(0.02, 0.36, 0.02), trim, s * 0.975, 0.68, -1.18, 0, 0, 0, g, false);
  }
  // tekerlekler
  const rc = o.rim || '#b9bec6';
  g.userData.wheels = [wheel(g, 0.86, 0.36, 1.55, rc), wheel(g, -0.86, 0.36, 1.55, rc), wheel(g, 0.86, 0.36, -1.55, rc), wheel(g, -0.86, 0.36, -1.55, rc)];
  for (const s of [-1, 1]) for (const z of [1.55, -1.55]) M(boxGeo(0.12, 0.12, 0.95), lm, s * 0.92, 0.86, z, 0, 0, 0, g); // çamurluk
  // farlar (LED şerit) ve stoplar
  const head = ownMat('#ffffff', { e: '#eaf4ff', ei: o.lightsOn === false ? 0.15 : 3 });
  const tail = ownMat('#ff1a1a', { e: '#ff1010', ei: o.lightsOn === false ? 0.2 : 3 });
  for (const s of [-1, 1]) {
    M(boxGeo(0.42, 0.1, 0.06), mat('#0a0a0a', { r: 0.2 }), s * 0.66, 0.86, 2.43, 0, 0, 0, g);
    M(boxGeo(0.36, 0.03, 0.03), head, s * 0.66, 0.88, 2.465, 0, 0, 0, g, false);
    M(boxGeo(0.12, 0.05, 0.03), head, s * 0.78, 0.84, 2.465, 0, 0, 0, g, false);
    M(boxGeo(0.44, 0.08, 0.05), tail, s * 0.62, 0.9, -2.44, 0, 0, 0, g, false);
  }
  M(boxGeo(1.0, 0.04, 0.04), tail, 0, 0.9, -2.45, 0, 0, 0, g, false);
  // plaka
  const pm = mat(0xffffff, { map: TX.plate(o.plate || '34 ABC 123'), r: 0.4 });
  M(plane(0.52, 0.12), pm, 0, 0.52, 2.615, 0, 0, 0, g, false);
  M(plane(0.52, 0.12), pm, 0, 0.6, -2.615, 0, Math.PI, 0, g, false);
  g.userData.headMat = head; g.userData.tailMat = tail;
  return ws;
}

function interior(g, police) {
  const dash = mat('#121316', { r: 0.7 });
  M(boxGeo(1.7, 0.22, 0.5), dash, 0, 0.98, 0.78, 0.1, 0, 0, g);
  M(boxGeo(1.7, 0.06, 0.35), mat('#0d0e10', { r: 0.6 }), 0, 1.06, 0.62, 0.0, 0, 0, g);
  // gösterge paneli
  const gauge = ownMat('#a8d8ff', { e: '#4fa8ff', ei: 1.6 });
  M(plane(0.32, 0.1), gauge, 0.42, 1.1, 0.53, -0.4, Math.PI, 0, g, false);
  // direksiyon
  const sw = G(g, 0.42, 1.03, 0.42); sw.rotation.x = -0.45;
  M(torus(0.17, 0.022, 8, 24), mat('#18191c', { r: 0.6 }), 0, 0, 0, 0, 0, 0, sw);
  M(boxGeo(0.3, 0.03, 0.03), mat('#18191c', {}), 0, 0, 0, 0, 0, 0, sw);
  M(cyl(0.05, 0.05, 0.05, 12), mat('#222', {}), 0, 0, 0.02, Math.PI / 2, 0, 0, sw);
  M(cyl(0.03, 0.03, 0.3, 8), mat('#111', {}), 0, 0, 0.16, Math.PI / 2, 0, 0, sw);
  // koltuklar
  const seat = mat('#202226', { r: 0.9 });
  for (const x of [0.42, -0.42]) {
    M(rbox(0.52, 0.14, 0.55, 0.05), seat, x, 0.72, -0.05, 0, 0, 0, g);
    M(rbox(0.52, 0.66, 0.14, 0.05), seat, x, 1.05, -0.36, -0.12, 0, 0, g);
    M(rbox(0.3, 0.16, 0.1, 0.04), seat, x, 1.43, -0.42, -0.12, 0, 0, g);
  }
  M(rbox(1.5, 0.14, 0.6, 0.05), seat, 0, 0.72, -1.0, 0, 0, 0, g);
  M(rbox(1.5, 0.56, 0.14, 0.05), seat, 0, 1.0, -1.3, -0.15, 0, 0, g);
  // orta konsol
  M(boxGeo(0.22, 0.24, 0.9), mat('#101113', { r: 0.6 }), 0, 0.74, 0.2, 0, 0, 0, g);
  if (police) {
    // ayırıcı kafes
    const cage = new THREE.MeshStandardMaterial({ map: TX.fence(), transparent: true, alphaTest: 0.4, metalness: 0.7, roughness: 0.4, side: THREE.DoubleSide });
    M(plane(1.6, 0.6), cage, 0, 1.18, -0.5, 0, 0, 0, g, false);
    // telsiz konsolu LED'leri
    for (let i = 0; i < 6; i++) M(boxGeo(0.02, 0.012, 0.005), ownMat(['#ff3030', '#30ff60', '#30a0ff'][i % 3], { e: ['#ff3030', '#30ff60', '#30a0ff'][i % 3], ei: 4 }), -0.06 + i * 0.024, 0.87, 0.66, 0, 0, 0, g, false);
    // MDT dizüstü
    const mdt = G(g, 0.02, 1.12, 0.34); mdt.rotation.y = 0.35;
    M(boxGeo(0.4, 0.02, 0.28), mat('#1b1c1f', { r: 0.5 }), 0, 0, 0, 0, 0, 0, mdt);
    const scrMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveIntensity: 1.2, emissiveMap: TX.mdtScreen([{ t: 'Görev bekleniyor...' }]) });
    const scr = M(plane(0.38, 0.24), scrMat, 0, 0.13, -0.12, -0.25, Math.PI, 0, mdt, false);
    M(boxGeo(0.4, 0.27, 0.015), mat('#1b1c1f', { r: 0.5 }), 0, 0.13, -0.13, -0.25, 0, 0, mdt);
    g.userData.mdt = scrMat;
    M(cyl(0.015, 0.015, 0.3, 6), mat('#222', {}), 0, -0.15, 0.05, 0, 0, 0, mdt);
  }
}

export function createPoliceCar() {
  const g = new THREE.Group();
  const ws = sedanBody(g, { body: '#f1f3f5', lower: '#f1f3f5', roof: '#f1f3f5', plate: '34 POL 155', rim: '#2a2c30' });
  // siyah kaput/bagaj ve kapı alt bandı (fotoğraftaki gibi siyah-beyaz)
  const black = mat('#0d0f12', { r: 0.25, m: 0.4, env: 1.2 });
  M(boxGeo(1.952, 0.52, 1.25), black, 0, 0.62, 1.86, 0, 0, 0, g);
  M(boxGeo(1.952, 0.52, 1.0), black, 0, 0.62, -1.98, 0, 0, 0, g);
  M(boxGeo(1.91, 0.15, 1.56), black, 0, 0.925, 1.62, 0.04, 0, 0, g);
  M(boxGeo(1.91, 0.15, 1.01), black, 0, 0.935, -1.95, -0.03, 0, 0, g);
  // mavi şerit ve POLİS yazısı
  const pol = mat(0xffffff, { map: TX.sign('POLİS', { bg: '#f1f3f5', fg: '#14306e', w: 512, h: 128, glow: false, size: 0.7, weight: 900 }), r: 0.3, m: 0.2 });
  const stripe = mat('#1f4fd8', { r: 0.3, m: 0.3 });
  for (const s of [-1, 1]) {
    M(plane(1.7, 0.42), pol, s * 0.976, 0.66, -0.12, 0, s * Math.PI / 2, 0, g, false);
    M(boxGeo(0.01, 0.06, 2.4), stripe, s * 0.975, 0.42, -0.12, 0, 0, 0, g, false);
    M(plane(0.6, 0.12), mat(0xffffff, { map: TX.sign('155', { bg: '#0d0f12', fg: '#ffffff', w: 256, h: 64, glow: false }) }), s * 0.977, 0.7, 1.75, 0, s * Math.PI / 2, 0, g, false);
  }
  M(plane(0.9, 0.24), mat(0xffffff, { map: TX.sign('POLİS', { bg: '#f1f3f5', fg: '#14306e', w: 512, h: 128, glow: false }) }), 0, 1.494, -0.6, -Math.PI / 2, 0, 0, g, false);
  // itme tamponu (push bar)
  const pb = mat('#0a0a0b', { r: 0.4, m: 0.6 });
  for (const x of [-0.42, 0.42]) M(boxGeo(0.06, 0.55, 0.06), pb, x, 0.62, 2.66, 0, 0, 0, g);
  M(boxGeo(1.0, 0.06, 0.06), pb, 0, 0.88, 2.66, 0, 0, 0, g);
  M(boxGeo(1.0, 0.06, 0.06), pb, 0, 0.5, 2.66, 0, 0, 0, g);
  M(boxGeo(0.06, 0.06, 0.2), pb, 0.42, 0.6, 2.56, 0, 0, 0, g); M(boxGeo(0.06, 0.06, 0.2), pb, -0.42, 0.6, 2.56, 0, 0, 0, g);
  // tepe lambası
  const bar = G(g, 0, 1.5, 0.05);
  M(rbox(1.42, 0.07, 0.32, 0.03), mat('#0b0b0c', { r: 0.4 }), 0, 0.02, 0, 0, 0, 0, bar);
  M(boxGeo(0.06, 0.06, 0.24), mat('#111', {}), 0.6, -0.03, 0, 0, 0, 0, bar);
  M(boxGeo(0.06, 0.06, 0.24), mat('#111', {}), -0.6, -0.03, 0, 0, 0, 0, bar);
  const leds = [];
  const domeM = mat('#ffffff', { r: 0.05, t: true, op: 0.18, m: 0.1 });
  M(rbox(1.4, 0.1, 0.3, 0.04), domeM, 0, 0.1, 0, 0, 0, 0, bar, false);
  for (let i = 0; i < 7; i++) {
    const x = 0.62 - i * 0.1;
    const lm = ownMat('#ff1a1a', { e: '#ff0a0a', ei: 0 }); const rm = ownMat('#1a4dff', { e: '#0a3cff', ei: 0 });
    for (const zs of [1, -1]) { M(boxGeo(0.075, 0.055, 0.03), lm, x, 0.09, zs * 0.12, 0, 0, 0, bar, false); M(boxGeo(0.075, 0.055, 0.03), rm, -x, 0.09, zs * 0.12, 0, 0, 0, bar, false); }
    leds.push({ m: lm, side: 0, i }, { m: rm, side: 1, i });
  }
  const take = ownMat('#ffffff', { e: '#ffffff', ei: 0 });
  M(boxGeo(0.1, 0.05, 0.03), take, 0, 0.09, 0.13, 0, 0, 0, bar, false);
  // ızgara içi gizli LED'ler
  const gr = ownMat('#ff1a1a', { e: '#ff0a0a', ei: 0 }), gb = ownMat('#1a4dff', { e: '#0a3cff', ei: 0 });
  M(boxGeo(0.12, 0.04, 0.02), gr, 0.3, 0.78, 2.48, 0, 0, 0, g, false); M(boxGeo(0.12, 0.04, 0.02), gb, -0.3, 0.78, 2.48, 0, 0, 0, g, false);
  M(boxGeo(0.2, 0.04, 0.02), gr, 0.4, 1.36, -1.22, 0.75, 0, 0, g, false); M(boxGeo(0.2, 0.04, 0.02), gb, -0.4, 1.36, -1.22, 0.75, 0, 0, g, false);
  // A-direği projektörü
  M(cyl(0.06, 0.07, 0.12, 12), mat('#16171a', { m: 0.5, r: 0.3 }), 0.92, 1.3, 0.6, Math.PI / 2, 0, 0, g);
  M(cyl(0.055, 0.055, 0.005, 12), ownMat('#fff', { e: '#fff8e0', ei: 0.6 }), 0.92, 1.3, 0.665, Math.PI / 2, 0, 0, g, false);
  // anten
  M(cyl(0.006, 0.01, 0.55, 5), mat('#111', {}), -0.4, 1.75, -1.0, 0, 0, 0, g, false);
  interior(g, true);
  // ışıklar
  const red = new THREE.PointLight(0xff1a1a, 0, 22, 2); red.position.set(0.55, 1.75, 0.05); g.add(red);
  const blue = new THREE.PointLight(0x2050ff, 0, 22, 2); blue.position.set(-0.55, 1.75, 0.05); g.add(blue);
  const headL = new THREE.SpotLight(0xeaf2ff, 40, 32, 0.55, 0.6, 1.6); headL.position.set(0, 0.85, 2.5); headL.target.position.set(0, 0, 12); g.add(headL); g.add(headL.target);
  g.userData.police = { leds, take, gr, gb, red, blue, headL, on: true, t: 0 };
  g.traverse(o => { if (o.isMesh) { o.castShadow = o.castShadow && !o.material.transparent; o.receiveShadow = true; } });
  mergeDeep(g);
  return g;
}

// Tepe lambası ışık deseni
export function updatePoliceLights(car, dt, intensity = 1) {
  const p = car.userData.police; if (!p) return;
  p.t += dt;
  const t = p.t;
  if (!p.on) { for (const l of p.leds) l.m.emissiveIntensity = 0; p.red.intensity = p.blue.intensity = 0; return; }
  const phase = Math.floor(t * 7.5) % 8; // çift çakar desen
  const leftOn = (phase === 0 || phase === 2), rightOn = (phase === 4 || phase === 6);
  const sweep = (t * 9) % 7;
  for (const l of p.leds) {
    const on = l.side === 0 ? leftOn : rightOn;
    const s = Math.abs(l.i - sweep) < 1.5 ? 1 : 0.35;
    l.m.emissiveIntensity = on ? 9 * s : 0.05;
  }
  p.take.emissiveIntensity = (Math.floor(t * 3) % 6 === 0) ? 8 : 0;
  p.gr.emissiveIntensity = leftOn ? 10 : 0; p.gb.emissiveIntensity = rightOn ? 10 : 0;
  p.red.intensity = (leftOn ? 20 : 1.5) * intensity; p.blue.intensity = (rightOn ? 26 : 1.5) * intensity;
}

const CIV_COLORS = ['#b3001b', '#1d3557', '#e8e8e8', '#222222', '#6c757d', '#2a9d8f', '#f4a261', '#8d99ae', '#5e2b1f', '#264653', '#a8dadc'];
export function createCivilianCar(rng, kind = null) {
  const g = new THREE.Group();
  const taxi = kind === 'taxi' || (!kind && rng.chance(0.15));
  const color = taxi ? '#f2c318' : rng.pick(CIV_COLORS);
  const plate = `${rng.int(1, 81).toString().padStart(2, '0')} ${String.fromCharCode(65 + rng.int(0, 25))}${String.fromCharCode(65 + rng.int(0, 25))} ${rng.int(100, 999)}`;
  sedanBody(g, { body: color, plate, lightsOn: rng.chance(0.3) });
  interior(g, false);
  if (taxi) {
    const ts = G(g, 0, 1.53, -0.2);
    M(rbox(0.5, 0.14, 0.18, 0.03), mat('#111', {}), 0, 0, 0, 0, 0, 0, ts);
    M(plane(0.46, 0.11), ownMat('#000', { em: TX.sign('TAKSİ', { bg: '#111', fg: '#ffd23f', w: 256, h: 64 }), e: '#ffffff', ei: 2.5 }), 0, 0, 0.092, 0, 0, 0, ts, false);
    M(plane(0.46, 0.11), ownMat('#000', { em: TX.sign('TAKSİ', { bg: '#111', fg: '#ffd23f', w: 256, h: 64 }), e: '#ffffff', ei: 2.5 }), 0, 0, -0.092, 0, Math.PI, 0, ts, false);
    for (let i = 0; i < 10; i++) for (const s of [-1, 1]) M(boxGeo(0.01, 0.06, 0.06), mat(i % 2 ? '#111' : '#f2c318', {}), s * 0.976, 0.72, -1.2 + i * 0.07, 0, 0, 0, g, false);
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = o.castShadow && !o.material.transparent; o.receiveShadow = true; } });
  g.userData.color = color; g.userData.plate = plate;
  mergeDeep(g);
  return g;
}

export function createVan(color = '#e8e8e8', label = null) {
  const g = new THREE.Group();
  const bm = mat(color, { r: 0.3, m: 0.3, env: 1.1 });
  M(rbox(2.0, 2.0, 5.4, 0.12), bm, 0, 1.3, 0, 0, 0, 0, g);
  M(boxGeo(2.02, 0.3, 5.42), mat('#1b1c1f', { r: 0.6 }), 0, 0.4, 0, 0, 0, 0, g);
  const glass = mat('#0b1016', { r: 0.05, m: 0.4, t: true, op: 0.7 });
  M(plane(1.8, 0.8), glass, 0, 1.75, 2.71, -0.2, 0, 0, g, false);
  for (const s of [-1, 1]) M(plane(0.7, 0.6), glass, s * 1.01, 1.8, 2.0, 0, s * Math.PI / 2, 0, g, false);
  for (const [x, z] of [[0.9, 1.8], [-0.9, 1.8], [0.9, -1.8], [-0.9, -1.8]]) wheel(g, x, 0.38, z);
  const head = ownMat('#fff', { e: '#eaf4ff', ei: 3 }), tail = ownMat('#f11', { e: '#f11', ei: 2 });
  for (const s of [-1, 1]) { M(boxGeo(0.3, 0.12, 0.04), head, s * 0.7, 0.9, 2.71, 0, 0, 0, g, false); M(boxGeo(0.14, 0.3, 0.04), tail, s * 0.85, 1.0, -2.71, 0, 0, 0, g, false); }
  M(boxGeo(0.02, 1.6, 0.02), mat('#222', {}), 0, 1.3, -2.71, 0, 0, 0, g, false);
  if (label) for (const s of [-1, 1]) M(plane(3, 0.5), mat(0xffffff, { map: TX.sign(label, { bg: color, fg: '#c8102e', w: 512, h: 96, glow: false }) }), s * 1.006, 1.45, -0.5, 0, s * Math.PI / 2, 0, g, false);
  g.traverse(o => { if (o.isMesh) { o.castShadow = !o.material.transparent; o.receiveShadow = true; } });
  if (!label || !label.startsWith('AMBULANS')) mergeDeep(g);
  return g;
}

export function createAmbulance() {
  const g = createVan('#f4f4f2', 'AMBULANS 112');
  for (const s of [-1, 1]) M(boxGeo(0.01, 0.18, 5.3), mat('#c8102e', {}), s * 1.007, 1.0, 0, 0, 0, 0, g, false);
  const bar = G(g, 0, 2.34, 2.2);
  M(boxGeo(1.4, 0.08, 0.3), mat('#111', {}), 0, 0, 0, 0, 0, 0, bar);
  const r = ownMat('#f11', { e: '#f11', ei: 0 }), w = ownMat('#fff', { e: '#fff', ei: 0 });
  M(boxGeo(0.6, 0.1, 0.26), r, 0.35, 0.08, 0, 0, 0, 0, bar, false); M(boxGeo(0.6, 0.1, 0.26), w, -0.35, 0.08, 0, 0, 0, 0, bar, false);
  const pl = new THREE.PointLight(0xff2020, 0, 18, 2); pl.position.set(0, 2.7, 2.2); g.add(pl);
  g.userData.amb = { r, w, pl, t: 0 };
  mergeDeep(g);
  return g;
}
export function updateAmbulance(g, dt) {
  const a = g.userData.amb; if (!a) return; a.t += dt;
  const on = Math.floor(a.t * 6) % 2 === 0;
  a.r.emissiveIntensity = on ? 12 : 0; a.w.emissiveIntensity = on ? 0 : 10; a.pl.intensity = on ? 30 : 8; a.pl.color.set(on ? 0xff2020 : 0xffffff);
}

export function createBus(interiorDetail = false, route = '34 SON DURAK') {
  const g = new THREE.Group();
  const L = 11.5, W = 2.5, H = 3.0;
  const bm = mat('#2f7d4f', { r: 0.35, m: 0.3 });
  const white = mat('#e9ecef', { r: 0.35, m: 0.2 });
  const glass = mat('#0b1016', { r: 0.05, m: 0.4, t: true, op: interiorDetail ? 0.35 : 0.7 });
  // gövde parçaları (iç mekan için kabuk şeklinde)
  M(boxGeo(W, 0.25, L), mat('#1b1c1f', {}), 0, 0.42, 0, 0, 0, 0, g); // taban
  M(boxGeo(W, 0.08, L), mat('#3a3e45', { r: 0.9 }), 0, 0.58, 0, 0, 0, 0, g);
  M(boxGeo(W, 0.12, L), white, 0, H + 0.3, 0, 0, 0, 0, g); // tavan
  for (const s of [-1, 1]) {
    M(boxGeo(0.08, 0.7, L), bm, s * W / 2, 0.95, 0, 0, 0, 0, g);
    M(boxGeo(0.08, 0.4, L), white, s * W / 2, H + 0.05, 0, 0, 0, 0, g);
    for (let i = 0; i < 6; i++) M(boxGeo(0.09, 1.55, 0.12), white, s * W / 2, 2.07, -L / 2 + 0.4 + i * 2.1, 0, 0, 0, g);
    M(plane(L - 0.4, 1.5), glass, s * (W / 2 + 0.045), 2.07, 0, 0, s * Math.PI / 2, 0, g, false);
  }
  M(boxGeo(W, H - 0.3, 0.1), bm, 0, 1.85, -L / 2, 0, 0, 0, g);
  M(boxGeo(W, 0.9, 0.1), bm, 0, 1.05, L / 2, 0, 0, 0, g);
  M(plane(W - 0.2, 1.7), glass, 0, 2.3, L / 2 + 0.06, 0, 0, 0, g, false);
  const route_ = ownMat('#000', { em: TX.sign(route, { bg: '#100a00', fg: '#ffa31a', w: 512, h: 64 }), e: '#ffffff', ei: 3 });
  M(plane(2.0, 0.26), route_, 0, H + 0.1, L / 2 + 0.07, 0, 0, 0, g, false);
  for (const [x, z] of [[1.1, 3.6], [-1.1, 3.6], [1.1, -3.4], [-1.1, -3.4]]) { const w = wheel(g, x, 0.48, z); w.scale.setScalar(1.3); }
  const head = ownMat('#fff', { e: '#eaf4ff', ei: 4 });
  for (const s of [-1, 1]) M(boxGeo(0.4, 0.15, 0.05), head, s * 0.9, 0.9, L / 2 + 0.06, 0, 0, 0, g, false);
  // iç mekan
  const seat = mat('#2b4a8a', { r: 0.8 });
  const pole = mat('#f2c318', { m: 0.5, r: 0.3 });
  for (let i = 0; i < 9; i++) for (const s of [-1, 1]) {
    if (s === 1 && (i === 3 || i === 4)) continue; // kapı boşluğu
    const z = -L / 2 + 1.2 + i * 1.05;
    M(rbox(0.85, 0.12, 0.45, 0.04), seat, s * 0.72, 1.05, z, 0, 0, 0, g);
    M(rbox(0.85, 0.6, 0.1, 0.04), seat, s * 0.72, 1.4, z - 0.22, 0, 0, 0, g);
    M(boxGeo(0.06, 0.5, 0.06), mat('#333', {}), s * 0.72, 0.8, z, 0, 0, 0, g);
  }
  for (let i = 0; i < 6; i++) { M(cyl(0.025, 0.025, 2.6, 8), pole, 0.32, 1.95, -L / 2 + 1.5 + i * 1.8, 0, 0, 0, g); M(cyl(0.025, 0.025, 2.6, 8), pole, -0.32, 1.95, -L / 2 + 1.0 + i * 1.8, 0, 0, 0, g); }
  M(cyl(0.02, 0.02, L - 1, 8), pole, 0.32, H - 0.1, 0, Math.PI / 2, 0, 0, g); M(cyl(0.02, 0.02, L - 1, 8), pole, -0.32, H - 0.1, 0, Math.PI / 2, 0, 0, g);
  const strip = ownMat('#fff', { e: '#eef6ff', ei: 3 });
  M(boxGeo(0.25, 0.03, L - 1), strip, 0, H + 0.22, 0, 0, 0, 0, g, false);
  // şoför yeri
  M(boxGeo(0.9, 0.9, 0.5), mat('#1c1d20', {}), -0.7, 1.1, L / 2 - 0.6, 0, 0, 0, g);
  M(torus(0.22, 0.03, 8, 20), mat('#111', {}), -0.7, 1.55, L / 2 - 0.85, -1.1, 0, 0, g);
  g.userData.bus = { L, W, H };
  g.traverse(o => { if (o.isMesh) { o.castShadow = !o.material.transparent; o.receiveShadow = true; } });
  mergeDeep(g);
  return g;
}
