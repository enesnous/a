// Olay yerleri: her biri sadece görev alanını inşa eder.
import * as THREE from 'three';
import { mat, boxGeo, rbox, cyl, sph, torus, plane, M, G, ownMat } from './kit.js';
import * as TX from './textures.js';
import { RNG } from './util.js';
import { createBus, createVan, createAmbulance, createCivilianCar, updateAmbulance } from './vehicles.js';

const STREETS = ['Bahçelievler', 'Gül', 'Lale', 'Menekşe', 'Çınar', 'Akasya', 'Papatya', 'Ihlamur', 'Nergis', 'Karanfil', 'Zambak', 'Defne', 'Ladin', 'Selvi', 'Kestane', 'Ardıç', 'Söğüt', 'Manolya', 'Erguvan', 'Mimoza', 'Sedir', 'Fesleğen', 'Begonya', 'Yasemin', 'Orkide', 'Kartopu', 'Gelincik', 'Mine', 'Sümbül', 'Kamelya'];
const DISTRICTS = ['Kadıköy', 'Üsküdar', 'Bağcılar', 'Esenler', 'Kartal', 'Pendik', 'Bakırköy', 'Fatih', 'Beyoğlu', 'Ümraniye', 'Maltepe', 'Sarıyer', 'Avcılar', 'Zeytinburnu', 'Gaziosmanpaşa'];

function base(w, rng, { size = 220, puddles = 16, ax = 0, az = 0, spread = 26, skyline = true, groundKind = 'asphalt' } = {}) {
  w.ground(size);
  for (let i = 0; i < puddles; i++) w.puddle(ax + rng.range(-spread, spread), az + rng.range(-spread, spread), rng.range(1.2, 4.5), rng.range(0.8, 2.6), rng.next() * 3);
  if (skyline) {
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2 + rng.range(-0.1, 0.1), r = rng.range(62, 80);
      const bx = ax + Math.cos(a) * r, bz = az + Math.sin(a) * r;
      w.building(bx, bz, rng.range(10, 22), rng.range(10, 18), rng.int(4, 10), { seed: rng.int(1, 9999), roofDetail: false });
    }
  }
}
function streetX(w, z, x1, x2, { width = 7, walk = 3, lights = [], shadowFirst = true, crossing = null, walkColor } = {}) {
  const len = x2 - x1, cx = (x1 + x2) / 2;
  w.road(cx, z, width, len, 'x', { crossing });
  for (const s of [-1, 1]) w.sidewalk(cx, z + s * (width / 2 + walk / 2), len, walk, 0.16, walkColor);
  lights.forEach((lx, i) => { const s = i % 2 ? 1 : -1; w.streetLight(lx, z + s * (width / 2 + 0.4), s > 0 ? Math.PI : 0, { shadow: shadowFirst && i === 0 }); });
}
function streetZ(w, x, z1, z2, { width = 7, walk = 3, lights = [], crossing = null } = {}) {
  const len = z2 - z1, cz = (z1 + z2) / 2;
  w.road(x, cz, width, len, 'z', { crossing });
  for (const s of [-1, 1]) w.sidewalk(x + s * (width / 2 + walk / 2), cz, walk, len);
  lights.forEach((lz, i) => { const s = i % 2 ? 1 : -1; w.streetLight(x + s * (width / 2 + 0.4), lz, s > 0 ? -Math.PI / 2 : Math.PI / 2, { shadow: i === 0 }); });
}
function rowX(w, rng, zFront, dir, x1, x2, { depth = 12, gap = 0.5, floors = [3, 6] } = {}) {
  let x = x1;
  while (x < x2 - 4) {
    const bw = Math.min(rng.range(7, 12), x2 - x);
    w.building(x + bw / 2, zFront + dir * depth / 2, bw, depth, rng.int(floors[0], floors[1]), { seed: rng.int(1, 99999), style: rng.int(0, 1) });
    x += bw + gap;
  }
}
function people(w, name, pts) { for (const p of pts) w.anchor(name, p[0], p[1], p[2] || 0); }

// ---------------- Dükkan sokağı (enterable) ----------------
function shopStreet(w, rng, type) {
  base(w, rng, { ax: 0, az: 4 });
  streetX(w, 0, -40, 40, { lights: [-14, 2, 16] });
  rowX(w, rng, -5, -1, -40, 40, { floors: [3, 6] });
  // dükkan odası: x -5..5, z 5..14
  const X0 = -5.5, X1 = 5.5, Z0 = 5, Z1 = 14, H = 3.3;
  const cfg = {
    bakkal: { name: 'BAKKAL', bg: '#0f3d1f', fg: '#ffe066', awn: '#2d6a4f', wall: '#f1e3c6', floor: TX.floorTiles('#d8d0c0', '#a89c88', 4, true) },
    market: { name: 'GÜNEŞ MARKET', bg: '#c8102e', fg: '#ffffff', awn: '#c8102e', wall: '#f4f4f0', floor: TX.floorTiles('#e8e8e4', '#cfcfca', 4, false) },
    tekel: { name: 'TEKEL BAYİ', bg: '#101820', fg: '#ff3b3b', awn: null, wall: '#2b2d33', floor: TX.floorTiles('#3a3a3e', '#2a2a2e', 4, true) },
    eczane: { name: 'ECZANE', bg: '#ffffff', fg: '#d0021b', awn: null, wall: '#f4fbff', floor: TX.floorTiles('#f2f6f8', '#dfe8ec', 4, false), cross: true },
    kirtasiye: { name: 'KIRTASİYE', bg: '#1d3557', fg: '#ffd166', awn: '#e63946', wall: '#fff3d6', floor: TX.woodFloor('#a0703f') },
    internetKafe: { name: 'NET CAFE', bg: '#14001f', fg: '#c77dff', awn: null, wall: '#1d1b2e', floor: TX.floorTiles('#24223a', '#1a1830', 4, true) },
    kiraathane: { name: 'KIRAATHANE', bg: '#3b1f0e', fg: '#ffcf6b', awn: '#7a2f2f', wall: '#d9c7a6', floor: TX.woodFloor('#6b4226') },
  }[type];
  const extM = mat(0xffffff, { map: TX.plaster('#cdbfa6').map, r: 0.85 });
  const inM = mat(0xffffff, { map: TX.plaster(cfg.wall).map, r: 0.85 });
  const fl = cfg.floor.map.clone(); fl.needsUpdate = true; fl.repeat.set((X1 - X0) / 2.5, (Z1 - Z0) / 2.5);
  M(plane(X1 - X0, Z1 - Z0), mat(0xffffff, { map: fl, r: 0.35, env: 0.8 }), 0, 0.02, (Z0 + Z1) / 2, -Math.PI / 2, 0, 0, w.static, false).receiveShadow = true;
  w.wallX(Z0, X0, X1, H, [{ at: 0, w: 1.6, sill: 0, top: 2.5 }, { at: -3.3, w: 3.2, sill: 0.45, top: 2.6 }, { at: 3.3, w: 3.2, sill: 0.45, top: 2.6 }], extM, inM);
  w.window('x', -3.3, Z0, 3.2, 0.45, 2.6); w.window('x', 3.3, Z0, 3.2, 0.45, 2.6);
  w.wallX(Z1, X0, X1, H, [{ at: 4, w: 1.0, sill: 0, top: 2.2 }], inM, extM);
  w.wallZ(X0, Z0, Z1, H, [], extM, inM); w.wallZ(X1, Z0, Z1, H, [], inM, extM);
  M(plane(X1 - X0, Z1 - Z0), mat('#f4f1ea', { r: 0.9 }), 0, H, (Z0 + Z1) / 2, Math.PI / 2, 0, 0, w.static, false);
  w.addCollider(X0, H, Z0, X1, H + 0.3, Z1);
  w.building(0, (Z0 + Z1) / 2, X1 - X0 + 0.4, Z1 - Z0 + 0.4, rng.int(2, 4), { seed: rng.int(1, 9999), y0: H });
  w.shopfront(0, Z0, X1 - X0, -1, cfg.name, { signBg: cfg.bg, signFg: cfg.fg, awning: cfg.awn, cross: cfg.cross });
  // komşu binalar
  w.building(-12.5, 10, 13, 10, rng.int(3, 5), { seed: rng.int(1, 9999) });
  w.building(12.5, 10, 13, 10, rng.int(3, 5), { seed: rng.int(1, 9999) });
  // iç mekan
  const strip = (x, z, l, c = '#ffffff', ei = 4) => M(boxGeo(0.12, 0.04, l), ownMat('#000', { e: c, ei: ei * 0.5 }), x, H - 0.03, z, 0, 0, 0, w.dynamic, false);
  switch (type) {
    case 'bakkal':
      w.shelfUnit(-4.95, 9.5, Math.PI / 2, 'market', 3, 6, 2.1);
      w.shelfUnit(-1.2, 10.2, 0, 'market', 7, 3.2, 1.5);
      w.drinkFridge(4.7, 12.8, -Math.PI / 2); w.drinkFridge(4.7, 11.6, -Math.PI / 2);
      w.counter(3.2, 7.4, Math.PI, 2.4);
      for (let i = 0; i < 6; i++) w.mesh(rbox(0.35, 0.12, 0.18, 0.05), mat('#d9a441', { r: 0.8 }), 1.2 + (i % 3) * 0.38, 1.12, 7.0 + Math.floor(i / 3) * 0.2);
      w.mesh(boxGeo(0.8, 1.2, 0.4), mat('#c8102e', {}), -4.5, 0.6, 6.0);
      w.anchor('counter', 3.2, 6.6); w.anchor('inside', -1, 8); w.anchor('inside', 1.5, 12.5); w.anchor('inside', -3, 12.8);
      strip(-2, 9.5, 6); strip(2, 9.5, 6);
      w.pointLight(0, 2.9, 8.5, 0xfff0d8, 9, 10); w.pointLight(0, 2.9, 12, 0xfff0d8, 7, 9);
      break;
    case 'market':
      for (let i = 0; i < 3; i++) w.shelfUnit(-3.6 + i * 2.6, 10.6, Math.PI / 2, 'market', 11 + i * 3, 4.6, 1.9);
      w.drinkFridge(4.9, 12.6, -Math.PI / 2); w.drinkFridge(4.9, 11.5, -Math.PI / 2); w.drinkFridge(4.9, 10.4, -Math.PI / 2);
      w.shelfUnit(-1, 13.5, 0, 'market', 33, 7, 1.9);
      w.counter(-3.4, 6.7, Math.PI, 1.8); w.counter(3.4, 6.7, Math.PI, 1.8);
      for (let i = 0; i < 4; i++) strip(-4 + i * 2.6, 10, 8, '#f4fbff', 5);
      w.anchor('counter', -3.4, 6.0); w.anchor('inside', -2.3, 9); w.anchor('inside', 0.3, 12); w.anchor('inside', 2.9, 9.5); w.anchor('inside', 3.6, 12.5);
      w.pointLight(-2, 3.0, 8.5, 0xf4fbff, 10, 10); w.pointLight(2, 3.0, 11.5, 0xf4fbff, 10, 10);
      break;
    case 'tekel':
      w.shelfUnit(0, 13.5, 0, 'tobacco', 5, 9, 2.4);
      w.counter(0, 11.6, 0, 5);
      w.drinkFridge(-4.9, 8, Math.PI / 2); w.drinkFridge(-4.9, 9.1, Math.PI / 2); w.drinkFridge(-4.9, 10.2, Math.PI / 2);
      M(plane(1.6, 0.4), ownMat('#000', { em: TX.sign('LOTO • İDDAA', { bg: '#0b3', fg: '#fff', w: 512, h: 96 }), e: '#fff', ei: 2 }), 3.5, 2.5, 13.2, 0, 0, 0, w.dynamic, false);
      strip(-1.5, 10, 7, '#ff4060', 3); strip(1.5, 10, 7, '#ffffff', 4);
      w.anchor('counter', 0, 12.6); w.anchor('inside', -2, 8); w.anchor('inside', 2.5, 9); w.anchor('inside', 0, 7);
      w.pointLight(0, 2.8, 10, 0xffe8e8, 9, 10);
      break;
    case 'eczane':
      w.shelfUnit(-4.95, 10.5, Math.PI / 2, 'pharmacy', 2, 6, 2.2); w.shelfUnit(4.95, 10.5, -Math.PI / 2, 'pharmacy', 4, 6, 2.2);
      w.shelfUnit(0, 13.6, 0, 'pharmacy', 8, 7, 2.2);
      w.counter(0, 11.4, 0, 4.5);
      for (let i = 0; i < 3; i++) strip(-2 + i * 2, 10, 7, '#f4fbff', 5);
      w.anchor('counter', 0, 12.3); w.anchor('inside', -2, 8); w.anchor('inside', 2, 9); w.anchor('inside', 0, 7);
      w.pointLight(0, 3.0, 9.5, 0xf4fbff, 12, 10);
      break;
    case 'kirtasiye':
      w.shelfUnit(-4.95, 10, Math.PI / 2, 'stationery', 3, 7, 2.2); w.shelfUnit(4.95, 10, -Math.PI / 2, 'stationery', 6, 7, 2.2);
      w.shelfUnit(0, 10.8, 0, 'stationery', 9, 4, 1.4);
      w.counter(0, 13.0, 0, 3);
      for (let i = 0; i < 8; i++) w.mesh(boxGeo(0.3, 0.05, 0.22), mat(rng.pick(['#e63946', '#f1c40f', '#3a86ff', '#7cb518', '#ff006e', '#ffffff']), { r: 0.6 }), -1 + i * 0.28, 1.1 + (i % 3) * 0.05, 13.0);
      w.mesh(rbox(0.6, 0.4, 0.5, 0.04), mat('#d8d8d8', {}), 1.6, 1.2, 13.1);
      strip(-2, 10, 7, '#fff8e8', 4); strip(2, 10, 7, '#fff8e8', 4);
      w.anchor('counter', 0, 13.8); w.anchor('inside', -2.5, 8); w.anchor('inside', 2.5, 8.5); w.anchor('inside', -2.6, 12.5);
      w.pointLight(0, 2.9, 9.5, 0xfff1d6, 10, 10);
      break;
    case 'internetKafe':
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) w.desk(-3.4 + c * 3.4, 8.2 + r * 2.0, Math.PI, true);
      w.counter(3.5, 13.0, 0, 2.6);
      strip(-4.8, 10, 8, '#b14aff', 6); strip(4.8, 10, 8, '#00e5ff', 6); strip(0, 10, 8, '#ff2bd6', 3);
      M(plane(3, 0.5), ownMat('#000', { em: TX.sign('LEVEL UP', { bg: '#14001f', fg: '#00e5ff', w: 512, h: 96 }), e: '#fff', ei: 2.5 }), -1, 2.6, 13.88, 0, 0, 0, w.dynamic, false);
      w.anchor('counter', 3.5, 13.8); w.anchor('inside', -3.4, 9); w.anchor('inside', 0, 11); w.anchor('inside', 3.4, 9); w.anchor('inside', -3.4, 11);
      w.pointLight(-3, 2.6, 10, 0xb14aff, 7, 9); w.pointLight(3, 2.6, 10, 0x00e5ff, 7, 9);
      break;
    case 'kiraathane':
      w.okeyTable(-2.8, 8.6); w.okeyTable(0.6, 8.6); w.okeyTable(-2.8, 11.6);
      w.counter(3.6, 12.6, -Math.PI / 2, 2.4, false);
      w.mesh(cyl(0.18, 0.2, 0.55, 14), mat('#c9ced6', { m: 1, r: 0.2 }), 3.8, 1.35, 12.2); w.mesh(cyl(0.12, 0.16, 0.3, 14), mat('#c9ced6', { m: 1, r: 0.2 }), 3.8, 1.75, 12.2);
      for (let i = 0; i < 8; i++) { const g = G(w.static, 3.4 + (i % 4) * 0.08, 1.06, 13 + Math.floor(i / 4) * 0.1); const gl = mat('#a33b12', { t: true, op: 0.85, r: 0.05 }); M(cyl(0.022, 0.016, 0.03, 10), gl, 0, 0.015, 0, 0, 0, 0, g, false); M(cyl(0.016, 0.022, 0.03, 10), gl, 0, 0.045, 0, 0, 0, 0, g, false); }
      w.tvUnit(0, 13.6, Math.PI, 7);
      for (let i = 0; i < 3; i++) w.teaTable(-8 + i * 3.4, 6.2 + (i % 2) * 0.2 - 0, '#e8e2d6', 3);
      w.anchor('counter', 3.0, 12.6); w.anchor('inside', -2.8, 9.6); w.anchor('inside', 0.6, 9.6); w.anchor('inside', -1.6, 11.6); w.anchor('inside', 1.6, 11.8);
      w.pointLight(-1.5, 2.9, 9, 0xffd8a0, 9, 10); w.pointLight(1.5, 2.9, 12, 0xffd8a0, 6, 9);
      break;
  }
  // önü
  w.bench(-8, 5.6, Math.PI); w.trashcan(7, 5.2); w.car(14, 2.6, -Math.PI / 2); w.car(-18, -2.6, Math.PI / 2);
  w.anchor('scene', 0, 3.6); w.anchor('front', 0, 4.4);
  people(w, 'crowd', [[-6, 4.8], [6, 5.2], [-9, -5.5], [10, -6], [3, 4.6], [-3.5, -5.8]]);
  w.anchor('escape', -45, 5); w.anchor('escape', 45, 5); w.anchor('escape', 4, 18);
  w.anchor('hide', 4, 13.3); w.anchor('back', 4, 15);
  w.bounds = { minX: -26, maxX: 26, minZ: -9, maxZ: 15 };
  return { carPos: [-8, 1.8, Math.PI / 2 - 0.35], interior: true };
}

// ---------------- Müstakil ev ----------------
function mustakil(w, rng, o) {
  const seed = o.variant || rng.int(1, 30);
  const street = STREETS[(seed - 1) % STREETS.length];
  base(w, rng, { ax: 0, az: 0, puddles: 12 });
  const info = w.house(seed, 0, 4, { frontLocked: o.locked, backLocked: o.backLocked, dark: o.dark, family: o.family });
  streetX(w, -5, -45, 45, { lights: [info.x0 - 4, info.x1 + 6] });
  // komşular ve karşı sıra
  rowX(w, rng, -10, -1, -45, 45, { floors: [2, 4], depth: 10 });
  w.building(info.x0 - 12, 9, 10, 10, 2, { seed: seed + 11, color: rng.pick(['#e6c48a', '#c9d6df', '#d9b8a0']) });
  w.building(info.x1 + 12, 9, 10, 10, 2, { seed: seed + 12, color: rng.pick(['#b8c7a6', '#f0e6d8', '#d4a59a']) });
  w.car(info.x1 + 4, -2.3, -Math.PI / 2, null, rng); w.car(info.x0 - 9, -7.7, Math.PI / 2, null, rng);
  w.trashcan(info.x0 - 2.6, -0.2); w.dumpster(info.x1 + 9, -0.4, 0);
  people(w, 'crowd', [[info.x0 - 3, -1], [info.x1 + 3.5, -0.8], [info.x0 - 6, -8], [info.x1 + 1, -8.5]]);
  w.anchor('scene', info.frontDoorX, info.fz - 1.2);
  w.bounds = { minX: info.x0 - 9, maxX: info.x1 + 9, minZ: -11, maxZ: info.z1 + 5 };
  return { carPos: [info.frontDoorX - 7, -4.2, Math.PI / 2 - 0.42], house: info, address: `${street} Sokak No:${seed + 3}` };
}

// ---------------- Açık alanlar ----------------
const L = {};
L.benzinlik = (w, rng) => {
  base(w, rng, { ax: 0, az: 4 });
  streetX(w, -8, -45, 45, { lights: [-16, 20] });
  rowX(w, rng, -14, -1, -45, 45);
  const conc = TX.concreteTiles('#9a9790', 2);
  const cm = mat(0xffffff, { map: conc.map, nm: conc.normalMap, r: 0.5, env: 1 });
  w.box(30, 0.06, 18, 0, 0, 6, cm, { collide: false, cast: false });
  // kanopi
  w.box(18, 0.9, 10, 0, 5.2, 5, mat('#f4f4f0', { r: 0.4 }), { collide: false, map: '#555a63' });
  w.box(18.1, 0.35, 10.1, 0, 5.75, 5, mat('#c8102e', { r: 0.4, e: '#ff2020', ei: 0.25 }), { collide: false });
  for (const [x, z] of [[-6, 2], [6, 2], [-6, 8], [6, 8]]) { w.box(0.5, 5.2, 0.5, x, 0, z, mat('#e8e8e4', { r: 0.4 })); }
  for (let i = 0; i < 6; i++) M(boxGeo(2.2, 0.03, 0.5), ownMat('#000', { e: '#f4fbff', ei: 6 }), -5.5 + (i % 3) * 5.5, 5.18, 2.5 + Math.floor(i / 3) * 5, 0, 0, 0, w.dynamic, false);
  w.pointLight(-4, 4.8, 5, 0xf4fbff, 18, 14); w.pointLight(4, 4.8, 5, 0xf4fbff, 18, 14);
  // pompalar
  for (const x of [-3, 3]) for (const z of [2.5, 7.5]) {
    const g = G(w.static, x, 0, z);
    M(boxGeo(1.6, 0.25, 0.8), mat('#c8c8c4', {}), 0, 0.12, 0, 0, 0, 0, g);
    M(rbox(0.9, 1.9, 0.5, 0.05), mat('#e8e8e4', { r: 0.4 }), 0, 1.2, 0, 0, 0, 0, g);
    M(boxGeo(0.92, 0.3, 0.52), mat('#c8102e', {}), 0, 2.0, 0, 0, 0, 0, g);
    M(plane(0.5, 0.3), ownMat('#000', { em: TX.sign('44.90', { bg: '#001', fg: '#3aff6a', w: 128, h: 64 }), e: '#fff', ei: 2 }), 0, 1.45, 0.26, 0, 0, 0, w.dynamic, false);
    M(cyl(0.03, 0.03, 0.9, 6), mat('#111', {}), 0.5, 1.2, 0.2, 0, 0, 0.3, g);
    w.addCollider(x - 0.5, 0, z - 0.3, x + 0.5, 2.2, z + 0.3);
  }
  // market binası
  const sm = mat(0xffffff, { map: TX.plaster('#e8e8e4').map, r: 0.6 });
  w.box(12, 3.6, 6, 0, 0, 16, sm, { map: '#3f434c' });
  M(plane(10, 2.2), ownMat('#000', { em: TX.shelfGoods('market', 41), e: '#ffffff', ei: 0.9 }), 0, 1.4, 12.98, 0, 0, 0, w.dynamic, false);
  w.shopfront(0, 13, 12, -1, 'PETROL • MARKET', { signBg: '#c8102e', signFg: '#ffffff' });
  // fiyat totemi
  w.box(1.6, 6, 0.6, 13, 0, -2.5, mat('#c8102e', { r: 0.4 }));
  M(plane(1.4, 2.4), ownMat('#000', { em: TX.sign('BENZİN 44.90', { bg: '#101010', fg: '#ffb020', w: 256, h: 320, size: 0.18 }), e: '#fff', ei: 2.4 }), 13, 4.2, -2.18, 0, 0, 0, w.dynamic, false);
  w.car(-3, 5, 0, null, rng); w.car(9, 13, Math.PI / 2, null, rng);
  w.bench(-5, 12.6, Math.PI); w.trashcan(5, 12.4);
  w.anchor('scene', 3, 5); w.anchor('vehicle', -3, 5); w.anchor('counter', 0, 14);
  people(w, 'crowd', [[-1, 11.8], [5, 10.5], [-7, 9], [8, 3], [0, -4]]);
  w.anchor('escape', -45, 0); w.anchor('escape', 45, 4); w.anchor('escape', 0, 30);
  w.anchor('hide', -5.5, 18.5); w.anchor('hide', 7, 18.5);
  w.bounds = { minX: -22, maxX: 22, minZ: -12, maxZ: 20 };
  return { carPos: [-10, -6.5, Math.PI / 2 - 0.55] };
};
L.meydan = (w, rng) => {
  base(w, rng, { ax: 0, az: 0 });
  const T = TX.concreteTiles('#a8a196', 3);
  w.box(34, 0.12, 26, 0, 0, 2, mat(0xffffff, { map: T.map, nm: T.normalMap, r: 0.45, env: 1.2 }), { collide: false, cast: false });
  w.mapShapes.push({ x: 0, z: 2, w: 34, d: 26, c: '#55585e' });
  streetX(w, -14, -45, 45, { lights: [-14, 14] });
  rowX(w, rng, -20, -1, -45, 45);
  // havuzlu anıt
  w.mesh(cyl(4, 4.2, 0.6, 32), mat('#b9b6ae', { r: 0.5 }), 0, 0.3, 2); w.addCollider(-4, 0, -2, 4, 0.6, 6);
  w.mesh(cyl(3.6, 3.6, 0.05, 32), mat('#0d2a3a', { r: 0.02, m: 0.3, env: 2 }), 0, 0.5, 2, 0, 0, 0, w.static, false);
  w.mesh(cyl(0.6, 0.8, 3.5, 12), mat('#8d8a84', { r: 0.5 }), 0, 2.2, 2); w.mesh(boxGeo(0.4, 1.2, 0.3), mat('#4a4f57', { m: 0.6, r: 0.3 }), 0, 4.5, 2);
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2; w.spotLight(Math.cos(a) * 3.5, 0.6, 2 + Math.sin(a) * 3.5, 0, 4.5, 2, 0xfff0d0, 25, 8, 0.4); }
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + 0.4; w.tree(Math.cos(a) * 11, 2 + Math.sin(a) * 9, rng.range(0.9, 1.2)); }
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; w.bench(Math.cos(a) * 6.5, 2 + Math.sin(a) * 6.5, -a + Math.PI / 2); }
  w.streetLight(-8, 10, 0); w.streetLight(8, 10, 0);
  w.mesh(cyl(0.05, 0.05, 9, 8), mat('#ddd', { m: 0.8 }), -12, 4.5, 12);
  const flag = M(plane(2.4, 1.6), mat(0xffffff, { map: TX.sign('☾ ★', { bg: '#e30a17', fg: '#ffffff', w: 256, h: 170, glow: false, size: 0.5 }), side: THREE.DoubleSide, r: 0.8 }), -10.8, 8.2, 12, 0, 0, 0, w.dynamic, false);
  w.updaters.push((dt, t) => { flag.rotation.y = Math.sin(t * 1.3) * 0.15; });
  w.building(-20, 18, 12, 10, 3, { seed: 22 }); w.building(20, 18, 12, 10, 3, { seed: 23 });
  w.building(0, 21, 18, 8, 4, { seed: 24 });
  w.shopfront(0, 17, 18, -1, 'SİMİT SARAYI', { signBg: '#4a1f0e', signFg: '#ffcf6b', awning: '#7a2f2f' });
  w.anchor('scene', 3, 9); w.anchor('scene', -4, 10);
  people(w, 'crowd', [[6, 8], [-7, 6], [9, -2], [-9, -3], [2, 12], [-3, -6], [10, 6]]);
  w.anchor('escape', -45, -14); w.anchor('escape', 45, -14); w.anchor('escape', -30, 25);
  w.anchor('hide', -11, 10); w.anchor('hide', 11, -4);
  w.bounds = { minX: -24, maxX: 24, minZ: -20, maxZ: 16 };
  return { carPos: [-6, -12.5, Math.PI / 2 - 0.6] };
};
L.park = (w, rng) => {
  base(w, rng, { ax: 0, az: 4, puddles: 8 });
  streetX(w, -12, -45, 45, { lights: [-10, 12] });
  rowX(w, rng, -18, -1, -45, 45);
  const gm = mat(0xffffff, { map: TX.grass().map, r: 0.95 }); gm.map.repeat.set(10, 8);
  M(plane(44, 30), gm, 0, 0.015, 8, -Math.PI / 2, 0, 0, w.static, false).receiveShadow = true;
  w.mapShapes.push({ x: 0, z: 8, w: 44, d: 30, c: '#24402a' });
  const pm = mat('#8b7d6b', { r: 0.9 });
  M(plane(3, 30), pm, 0, 0.02, 8, -Math.PI / 2, 0, 0, w.static, false); M(plane(40, 3), pm, 0, 0.021, 8, -Math.PI / 2, 0, 0, w.static, false);
  w.fence(-22, -7, -2, -7, 'iron'); w.fence(2, -7, 22, -7, 'iron');
  for (let i = 0; i < 16; i++) w.tree(rng.range(-20, 20), rng.range(-4, 22), rng.range(0.8, 1.3), rng.chance(0.25) ? 1 : 0);
  for (const [x, z, r] of [[-3, 0, Math.PI / 2], [3, 3, -Math.PI / 2], [-6, 9.6, Math.PI], [6, 6.4, 0], [-3, 15, Math.PI / 2]]) w.bench(x, z, r);
  w.streetLight(-2, 4, Math.PI / 2, { shadow: true }); w.streetLight(2, 14, -Math.PI / 2); w.streetLight(-14, 9.5, 0);
  // oyun parkı
  const pg = G(w.static, 11, 0, 14);
  M(boxGeo(0.12, 2.6, 0.12), mat('#e63946', { m: 0.5, r: 0.4 }), -1.2, 1.3, 0, 0, 0, 0, pg); M(boxGeo(0.12, 2.6, 0.12), mat('#e63946', { m: 0.5, r: 0.4 }), 1.2, 1.3, 0, 0, 0, 0, pg); M(boxGeo(2.6, 0.12, 0.12), mat('#e63946', { m: 0.5 }), 0, 2.6, 0, 0, 0, 0, pg);
  for (const x of [-0.6, 0.6]) { M(boxGeo(0.02, 1.8, 0.02), mat('#999', { m: 0.8 }), x, 1.7, 0, 0, 0, 0, pg); M(boxGeo(0.5, 0.06, 0.25), mat('#f1c40f', {}), x, 0.8, 0, 0, 0, 0, pg); }
  M(boxGeo(1.2, 0.1, 3.4), mat('#3a86ff', { r: 0.3 }), 4, 1.0, 0, 0.5, 0, 0, pg); M(boxGeo(1.2, 2.0, 1.2), mat('#f1c40f', {}), 4, 1.0, -2.0, 0, 0, 0, pg);
  w.addCollider(8.5, 0, 12.5, 13.5, 2.6, 15.5, { small: true });
  w.trashcan(1.8, -4); w.trashcan(-8, 9);
  w.anchor('scene', -2, 9); w.anchor('scene', 5, 15);
  people(w, 'crowd', [[-6, 10.3], [6, 7.1], [-3.6, 0], [8, 12], [-12, 5], [12, 2]]);
  w.anchor('escape', -40, 14); w.anchor('escape', 40, 20); w.anchor('escape', 0, 40);
  w.anchor('hide', -17, 20); w.anchor('hide', 16, 21); w.anchor('hide', -12, 17);
  w.bounds = { minX: -24, maxX: 24, minZ: -18, maxZ: 24 };
  return { carPos: [-7, -10.5, Math.PI / 2 - 0.55] };
};
L.yolCevirmesi = (w, rng) => {
  base(w, rng, { ax: 0, az: 0 });
  streetX(w, 0, -60, 60, { width: 10, lights: [-14, 0, 14] });
  rowX(w, rng, -8, -1, -60, 60, { floors: [2, 5] }); rowX(w, rng, 8, 1, -60, 60, { floors: [2, 5] });
  for (let i = 0; i < 6; i++) w.cone(4 - i * 1.4, -1.2 + i * 0.45);
  w.barrier(-4, 2.6, 0); w.barrier(-4, -2.6, 0);
  w.mesh(boxGeo(0.06, 2.2, 0.06), mat('#222', {}), -6, 1.1, 4.2); M(plane(1.2, 1.2), mat(0xffffff, { map: TX.sign('DUR', { bg: '#d0021b', fg: '#fff', w: 128, h: 128 }) }), -6, 2.4, 4.24, 0, 0, 0, w.dynamic, false);
  w.mesh(boxGeo(0.06, 2.2, 0.06), mat('#222', {}), -7.5, 1.1, 4.2); M(plane(1.4, 0.7), mat(0xffffff, { map: TX.sign('POLİS', { bg: '#1f3fa8', fg: '#fff', w: 256, h: 128 }) }), -7.5, 2.4, 4.24, 0, 0, 0, w.dynamic, false);
  w.anchor('vehicle', 2, -2.2); w.anchor('scene', 2, -2.2);
  w.anchor('queue', 12, -2.2); w.anchor('queue', 19, -2.2);
  people(w, 'crowd', [[-10, 6], [10, -6.5], [16, 6.4], [-14, -6.4]]);
  w.anchor('escape', 60, -2); w.anchor('escape', 40, 20); w.anchor('escape', -20, -20);
  w.anchor('hide', 22, 7);
  w.bounds = { minX: -26, maxX: 30, minZ: -10, maxZ: 10 };
  return { carPos: [-9, 1.6, Math.PI / 2 + 0.5], roadblock: true };
};
L.otopark = (w, rng) => {
  base(w, rng, { ax: 0, az: 4, puddles: 20 });
  streetX(w, -14, -45, 45, { lights: [-12, 14] });
  rowX(w, rng, -20, -1, -45, 45);
  const lm = mat('#e8e8e2', { r: 0.6, e: '#ffffff', ei: 0.03 });
  for (let r = 0; r < 3; r++) for (let i = 0; i < 10; i++) {
    const x = -18 + i * 3.4, z = -4 + r * 9;
    M(plane(0.12, 5), lm, x - 1.7, 0.012, z, -Math.PI / 2, 0, 0, w.static, false);
    if (rng.chance(0.62)) w.car(x, z, rng.chance(0.5) ? 0 : Math.PI, null, rng);
  }
  w.fence(-22, -8, 22, -8, 'iron', 1.1); w.fence(-22, 22, 22, 22, 'wall', 2.4, '#8d8a84'); w.fence(-22, -8, -22, 22, 'wall', 2.4, '#8d8a84'); w.fence(22, -8, 22, 10, 'wall', 2.4, '#8d8a84');
  for (const [x, z] of [[-12, 0.5], [6, 0.5], [-12, 9.5], [6, 9.5]]) w.streetLight(x, z, 0, { shadow: x === -12 && z === 0.5, intensity: 45, color: 0xd8e6ff });
  M(plane(4, 1), ownMat('#000', { em: TX.sign('OTOPARK  P', { bg: '#1f3fa8', fg: '#fff', w: 512, h: 128 }), e: '#fff', ei: 2 }), 0, 3.2, -8.3, 0, Math.PI, 0, w.dynamic, false);
  w.mesh(boxGeo(0.1, 3.5, 0.1), mat('#333', {}), -2, 1.75, -8.3); w.mesh(boxGeo(0.1, 3.5, 0.1), mat('#333', {}), 2, 1.75, -8.3);
  w.anchor('scene', 2, 4.5); w.anchor('vehicle', -1.4, 5);
  people(w, 'crowd', [[-8, 4.5], [10, 4], [0, 13.5], [-15, 13.5]]);
  w.anchor('escape', 30, 15); w.anchor('escape', -45, -14); w.anchor('escape', 45, -14);
  w.anchor('hide', -20, 20); w.anchor('hide', 15, 20);
  w.bounds = { minX: -23, maxX: 28, minZ: -19, maxZ: 22 };
  return { carPos: [-4, -10, Math.PI / 2 - 0.9] };
};
L.otobusDuragi = (w, rng) => {
  base(w, rng, { ax: 0, az: 0 });
  streetX(w, 0, -50, 50, { lights: [-12, 12] });
  rowX(w, rng, 6.5, 1, -50, 50); rowX(w, rng, -6.5, -1, -50, 50);
  const g = G(w.static, 2, 0.16, 4.6);
  const gl = mat('#cfe3f0', { t: true, op: 0.25, r: 0.05, m: 0.3 });
  M(boxGeo(5, 0.1, 1.8), mat('#2b2e33', { m: 0.6 }), 0, 2.6, 0, 0, 0, 0, g);
  for (const x of [-2.4, 2.4]) M(boxGeo(0.1, 2.6, 0.1), mat('#2b2e33', { m: 0.6 }), x, 1.3, 0.8, 0, 0, 0, g);
  M(plane(4.8, 2.2), gl, 0, 1.4, 0.85, 0, 0, 0, g, false);
  M(boxGeo(4, 0.06, 0.45), mat('#7a4f2c', {}), 0, 0.45, 0.45, 0, 0, 0, g);
  const ad = M(plane(1.4, 2.0), ownMat('#000', { em: TX.screen('ad', 3), e: '#fff', ei: 1.8 }), 2.3, 1.3, 0.2, 0, -Math.PI / 2, 0, w.dynamic, false); ad.position.add(new THREE.Vector3(2, 0.16, 4.6));
  M(plane(1.8, 0.4), ownMat('#000', { em: TX.sign('DURAK  •  500T  15F  34', { bg: '#001', fg: '#ffa31a', w: 512, h: 96 }), e: '#fff', ei: 2.5 }), 2, 2.4, 3.86, 0, 0, 0, w.dynamic, false);
  w.addCollider(-0.5, 0, 5.2, 4.5, 2.8, 5.6);
  w.pointLight(2, 2.4, 4.2, 0xe8f4ff, 6, 7);
  w.anchor('scene', 2, 3.6); w.anchor('package', 3.6, 4.4);
  people(w, 'crowd', [[0.5, 3.8], [3.5, 3.6], [-3, 4.2], [7, 4.4], [-8, -4.4]]);
  w.anchor('escape', -50, 4); w.anchor('escape', 50, 4); w.anchor('escape', 0, -30);
  w.anchor('hide', 14, 4.8);
  w.bounds = { minX: -24, maxX: 24, minZ: -9, maxZ: 9 };
  return { carPos: [-10, -1.8, Math.PI / 2 - 0.25] };
};
L.trafikIsiklari = (w, rng) => {
  base(w, rng, { ax: 0, az: 0 });
  streetX(w, 0, -50, -6, { lights: [-14] }); streetX(w, 0, 6, 50, { lights: [14] });
  streetZ(w, 0, -50, -6, { lights: [-14] }); streetZ(w, 0, 6, 50, { lights: [14] });
  w.road(0, 0, 12, 12, 'x', { lines: false });
  for (const [x, z] of [[-6.5, -6.5], [6.5, -6.5], [-6.5, 6.5], [6.5, 6.5]]) w.sidewalk(x * 1.0, z * 1.0, 1, 1);
  for (const [x, z] of [[-17, -17], [17, -17], [-17, 17], [17, 17]]) w.building(x, z, 20, 20, rng.int(4, 7), { seed: rng.int(1, 9999) });
  const lights = [];
  for (const [x, z, ry] of [[-6, -6, Math.PI / 4], [6, 6, -Math.PI * 3 / 4], [6, -6, -Math.PI / 4], [-6, 6, Math.PI * 3 / 4]]) {
    const g = G(w.static, x, 0, z, ry);
    M(cyl(0.08, 0.1, 3.4, 8), mat('#222', { m: 0.6 }), 0, 1.7, 0, 0, 0, 0, g);
    M(rbox(0.36, 1.0, 0.3, 0.05), mat('#16171a', {}), 0, 3.6, 0, 0, 0, 0, g);
    const ls = [['#ff2a2a', 3.9], ['#ffb020', 3.6], ['#30ff70', 3.3]].map(([c, y]) => { const m = ownMat('#000', { e: c, ei: 0 }); const mm = M(sph(0.1, 10, 8), m, 0, y, 0.16, 0, 0, 0, w.dynamic, false); g.updateMatrixWorld(true); mm.applyMatrix4(g.matrixWorld); return m; });
    lights.push({ ls, phase: Math.abs(Math.sin(ry)) > 0.6 ? 0 : 1 });
    w.addCollider(x - 0.1, 0, z - 0.1, x + 0.1, 3.4, z + 0.1, { small: true });
  }
  w.updaters.push((dt, t) => { const c = (t % 16); for (const l of lights) { const s = (c + l.phase * 8) % 16; const st = s < 7 ? 2 : s < 8 ? 1 : 0; l.ls.forEach((m, i) => m.emissiveIntensity = i === st ? 8 : 0.03); } });
  w.anchor('scene', 3, -3); w.anchor('vehicle', 2, -2.5); w.anchor('vehicle2', -2.5, 1.8);
  people(w, 'crowd', [[-7.5, -8], [8, -7.5], [-8, 8.5], [7.5, 9], [-12, -7.5]]);
  w.anchor('escape', -50, -5); w.anchor('escape', 50, 5); w.anchor('escape', 5, 50);
  w.bounds = { minX: -22, maxX: 22, minZ: -22, maxZ: 22 };
  return { carPos: [-12, -1.8, Math.PI / 2 + 0.05] };
};
L.siteGirisi = (w, rng) => {
  base(w, rng, { ax: 0, az: 4 });
  streetX(w, -6, -45, 45, { lights: [-12, 12] });
  rowX(w, rng, -12, -1, -45, 45);
  w.fence(-26, -2, -4, -2, 'wall', 2.6, '#cfc6b4'); w.fence(4, -2, 26, -2, 'wall', 2.6, '#cfc6b4');
  w.box(3, 2.8, 2.6, 6.5, 0, 1, mat('#e8e2d6', { r: 0.5 }));
  M(plane(2, 1.2), mat('#ffe9b0', { e: '#ffd890', ei: 1.4, t: true, op: 0.7 }), 6.5, 1.6, -0.31, 0, Math.PI, 0, w.dynamic, false);
  const arm = G(w.dynamic, 4.2, 1.0, -2.6);
  M(boxGeo(7.6, 0.12, 0.12), mat('#e8e8e2', { e: '#ff3030', ei: 0.06 }), -3.8, 0, 0, 0, 0, 0, arm);
  for (let i = 0; i < 6; i++) M(boxGeo(0.5, 0.13, 0.13), mat('#d0021b', {}), -0.8 - i * 1.2, 0, 0, 0, 0, 0, arm);
  w.mesh(boxGeo(0.35, 1.0, 0.35), mat('#f1c40f', {}), 4.2, 0.5, -2.6);
  const armC = w.addCollider(-3.8, 0, -2.7, 4.2, 1.2, -2.5, { small: true });
  w.armBarrier = { arm, col: armC };
  M(plane(6, 1), ownMat('#000', { em: TX.sign('YAŞAMKENT SİTESİ', { bg: '#2b2e33', fg: '#ffd890', w: 768, h: 128 }), e: '#fff', ei: 2.2 }), -10, 2.9, -2.2, 0, Math.PI, 0, w.dynamic, false);
  for (let i = 0; i < 4; i++) w.building(-14 + i * 9.5, 16, 8, 8, rng.int(5, 8), { seed: rng.int(1, 9999), style: 1 });
  const gm = mat(0xffffff, { map: TX.grass().map, r: 0.95 }); gm.map.repeat.set(8, 4);
  M(plane(50, 9), gm, 0, 0.015, 4, -Math.PI / 2, 0, 0, w.static, false);
  for (let i = 0; i < 6; i++) w.tree(-20 + i * 8, 5 + (i % 2) * 2, 0.9);
  w.streetLight(-3, 3, Math.PI / 2, { shadow: true }); w.streetLight(3, 8, -Math.PI / 2);
  w.anchor('scene', 0, -3.6); w.anchor('guard', 5.5, -0.8); w.anchor('vehicle', 0, -5);
  people(w, 'crowd', [[-6, -3.4], [8, -3.6], [2, 6], [-8, 7]]);
  w.anchor('escape', -45, -6); w.anchor('escape', 45, -6); w.anchor('escape', 0, 30);
  w.anchor('hide', -16, 11); w.anchor('hide', 15, 11);
  w.bounds = { minX: -24, maxX: 24, minZ: -14, maxZ: 22 };
  return { carPos: [-7, -7.5, Math.PI / 2 - 0.5] };
};
L.semtPazari = (w, rng) => {
  base(w, rng, { ax: 0, az: 2, puddles: 10 });
  streetX(w, -14, -45, 45, { lights: [-14, 14] });
  rowX(w, rng, -20, -1, -45, 45);
  const cols = ['#e63946', '#2a9d8f', '#f4a261', '#3a86ff', '#ffbe0b', '#8338ec', '#06d6a0', '#ef476f'];
  for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) w.stall(-15 + i * 6, -5 + r * 7, r % 2 ? Math.PI : 0, cols[(i + r * 2) % cols.length], i + r * 10);
  w.stringLights([[-18, -2], [-6, -1.5], [6, -2], [18, -1.5]], ['#ffcf6b', '#ff6b6b', '#6bd5ff', '#b6ff6b'], 3.4);
  w.stringLights([[-18, 9], [-6, 9.5], [6, 9], [18, 9.5]], ['#ffcf6b', '#ffffff'], 3.4, 14, true);
  for (let i = 0; i < 12; i++) w.mesh(rbox(0.5, 0.35, 0.4, 0.04), mat('#8a5a3a', { r: 0.9 }), rng.range(-17, 17), 0.17, rng.range(-7, 14), 0, rng.next() * 3, 0);
  w.anchor('scene', 0, 2); w.anchor('scene', -6, 9);
  people(w, 'crowd', [[-12, 2], [-3, 2.4], [6, 1.6], [12, 2], [-9, 9], [3, 9.4], [9, -2], [-4, -2.6]]);
  w.anchor('escape', -45, 4); w.anchor('escape', 45, 4); w.anchor('escape', 0, 30);
  w.anchor('hide', -17, 15); w.anchor('hide', 18, 15);
  w.bounds = { minX: -22, maxX: 22, minZ: -19, maxZ: 18 };
  return { carPos: [-6, -12, Math.PI / 2 - 0.5] };
};
L.pazarSokagi = (w, rng) => {
  base(w, rng, { ax: 0, az: 0, puddles: 10 });
  w.road(0, 0, 8, 80, 'x', { lines: false });
  for (const s of [-1, 1]) w.sidewalk(0, s * 5.5, 80, 3);
  rowX(w, rng, 7, 1, -40, 40, { floors: [3, 5] }); rowX(w, rng, -7, -1, -40, 40, { floors: [3, 5] });
  for (let i = 0; i < 6; i++) { const x = -15 + i * 6; w.shopfront(x, 7, 5.5, -1, ['MANAV', 'KASAP', 'BALIKÇI', 'ŞARKÜTERİ', 'KURUYEMİŞ', 'FIRIN'][i], { signBg: ['#2d6a4f', '#7a1f1f', '#1d3557', '#5e2b1f', '#6b4a30', '#7a4a1a'][i], signFg: '#fff6d0', awning: ['#2d6a4f', '#c1121f', '#1d3557', '#bc6c25', '#6b4a30', '#e9c46a'][i] }); }
  for (let i = 0; i < 5; i++) w.stall(-12 + i * 6, 2.4, Math.PI, ['#e63946', '#2a9d8f', '#ffbe0b', '#3a86ff', '#8338ec'][i], 40 + i);
  w.stringLights([[-20, 0], [-7, 0.4], [7, 0], [20, 0.4]], ['#ffcf6b', '#ff6b6b', '#ffffff'], 4.0);
  w.streetLight(-18, -4.4, 0, { shadow: true }); w.streetLight(18, 4.4, Math.PI);
  w.anchor('scene', 0, -1.5); w.anchor('scene', 6, 0);
  people(w, 'crowd', [[-9, -1.4], [-3, -0.8], [3, -1.6], [9, -1], [-6, 4.8], [6, 4.6], [12, -5]]);
  w.anchor('escape', -40, 0); w.anchor('escape', 40, 0);
  w.anchor('hide', -19, 5); w.anchor('hide', 19, -5);
  w.bounds = { minX: -24, maxX: 24, minZ: -7, maxZ: 7 };
  return { carPos: [-22, -1.5, Math.PI / 2 + 0.05] };
};
L.apartmanGirisi = (w, rng) => {
  base(w, rng, { ax: 0, az: 2 });
  streetX(w, -3, -45, 45, { lights: [-10, 12] });
  rowX(w, rng, -9, -1, -45, 45);
  w.building(0, 8.5, 14, 10, 7, { seed: rng.int(1, 9999), style: 1 });
  w.building(-15, 8.5, 14, 10, 6, { seed: rng.int(1, 9999), style: 1 });
  w.building(15, 8.5, 14, 10, 5, { seed: rng.int(1, 9999), style: 1 });
  w.box(3.2, 0.32, 1.6, 0, 0, 2.7, mat('#b9b6ae', { r: 0.6 }), { small: true });
  w.box(3.6, 0.15, 2.0, 0, 3.0, 2.6, mat('#d8d4cc', {}), { collide: false });
  M(plane(1.8, 2.4), mat('#0f1a24', { r: 0.1, m: 0.5, t: true, op: 0.85 }), 0, 1.5, 3.48, 0, Math.PI, 0, w.static, false);
  M(boxGeo(0.25, 0.4, 0.06), ownMat('#222', { e: '#4fa8ff', ei: 1.5 }), 1.3, 1.4, 3.45, 0, 0, 0, w.dynamic, false);
  M(plane(1.4, 0.3), ownMat('#000', { em: TX.sign('GÜVEN APT. NO:27', { bg: '#1f3fa8', fg: '#fff', w: 512, h: 96 }), e: '#fff', ei: 1.4 }), 0, 2.8, 3.46, 0, Math.PI, 0, w.dynamic, false);
  w.pointLight(0, 2.8, 2.4, 0xffd8a0, 7, 7);
  w.trashcan(-2.6, 2.4); w.plant(2.4, 2.6, 1.1); w.dumpster(-6, 2.5, 0); w.car(9, -0.4, -Math.PI / 2, null, rng); w.car(-10, -5.6, Math.PI / 2, null, rng);
  w.anchor('scene', 0, 1.2); w.anchor('door', 0, 3.4);
  people(w, 'crowd', [[-4, 1], [4, 1.2], [-8, -6], [6, -6.5], [1.5, 1.6]]);
  w.anchor('escape', -45, 0); w.anchor('escape', 45, 0);
  w.anchor('hide', -8, 2.8); w.anchor('hide', 8, 2.8);
  w.bounds = { minX: -22, maxX: 22, minZ: -12, maxZ: 3.3 };
  return { carPos: [-6, -4.5, Math.PI / 2 - 0.4] };
};
L.cikmazSokak = (w, rng) => {
  base(w, rng, { ax: 0, az: 10, puddles: 14, spread: 14 });
  w.road(0, 10, 6, 30, 'z', { lines: false });
  w.sidewalk(-4, 10, 2, 30); w.sidewalk(4, 10, 2, 30);
  for (let i = 0; i < 3; i++) { w.building(-10, 0 + i * 10, 10, 9.5, rng.int(3, 5), { seed: rng.int(1, 9999), brick: true }); w.building(10, 0 + i * 10, 10, 9.5, rng.int(3, 5), { seed: rng.int(1, 9999) }); }
  w.building(0, 30, 22, 8, 5, { seed: rng.int(1, 9999) });
  const gw = mat(0xffffff, { map: TX.graffiti(rng.int(1, 9)), t: true, op: 0.95, dw: false });
  M(plane(5, 2.5), gw, 0, 1.8, 25.95, 0, 0, 0, w.dynamic, false);
  M(plane(4, 2), mat(0xffffff, { map: TX.graffiti(rng.int(10, 20)), t: true, op: 0.9 }), -4.98, 1.6, 14, 0, Math.PI / 2, 0, w.dynamic, false);
  w.dumpster(-3.6, 22, Math.PI / 2, '#5a3d2b'); w.dumpster(3.6, 18, -Math.PI / 2);
  for (let i = 0; i < 5; i++) w.mesh(rbox(0.6, 0.45, 0.5, 0.06), mat(rng.pick(['#2b2b2b', '#6b4a30', '#1b1b1b']), { r: 0.9 }), rng.range(-2, 2), 0.22, rng.range(18, 25), 0, rng.next() * 3, 0);
  w.streetLight(-4.6, 8, Math.PI / 2, { shadow: true }); w.streetLight(4.6, 20, -Math.PI / 2, { color: 0xffa860, intensity: 35 });
  const fl = w.lights[w.lights.length - 1];
  if (fl) w.updaters.push((dt, t) => { fl.intensity = (Math.sin(t * 23) > 0.6 || Math.sin(t * 3.1) > 0.95) ? 2 : 35; });
  w.car(-2.2, 3, 0, null, rng);
  w.anchor('scene', 0, 20); w.anchor('scene', 1, 23);
  people(w, 'crowd', [[-3.6, 6], [3.6, 9], [-3.6, 13]]);
  w.anchor('escape', 0, -25); w.anchor('hide', 3.5, 24.5); w.anchor('hide', -3.5, 24.8);
  w.bounds = { minX: -5, maxX: 5, minZ: -6, maxZ: 25.5 };
  return { carPos: [1.5, -2, 0.15] };
};
L.sokakArasi = (w, rng) => {
  base(w, rng, { ax: 0, az: 0, puddles: 14, spread: 18 });
  w.road(0, 0, 5, 60, 'x', { lines: false });
  for (let i = 0; i < 5; i++) { w.building(-20 + i * 10, 7.5, 9.6, 10, rng.int(3, 6), { seed: rng.int(1, 9999), brick: i % 2 === 0 }); w.building(-20 + i * 10, -7.5, 9.6, 10, rng.int(3, 6), { seed: rng.int(1, 9999) }); }
  for (let i = 0; i < 4; i++) M(plane(3.5, 1.8), mat(0xffffff, { map: TX.graffiti(rng.int(1, 30)), t: true, op: 0.9 }), -15 + i * 10, 1.5, 2.48, 0, Math.PI, 0, w.dynamic, false);
  w.dumpster(-8, -1.8, 0); w.dumpster(6, 1.8, Math.PI, '#5a3d2b');
  for (let i = 0; i < 4; i++) w.mesh(cyl(0.3, 0.3, 0.9, 12), mat(rng.pick(['#2a4f8a', '#7a2f2f', '#3a3a3a']), { m: 0.4, r: 0.5 }), rng.range(-18, 18), 0.45, rng.pick([-2, 2]));
  const pipes = mat('#5a5f66', { m: 0.7, r: 0.4 });
  for (let i = 0; i < 6; i++) w.mesh(cyl(0.06, 0.06, 6, 8), pipes, -18 + i * 7, 3, 2.42);
  for (let i = 0; i < 3; i++) { w.mesh(rbox(0.5, 0.18, 0.12, 0.03), ownMat('#000', { e: '#ffe0a0', ei: 5 }), -12 + i * 12, 3.2, 2.4); w.pointLight(-12 + i * 12, 3.0, 2.0, 0xffc98a, 9, 9); }
  w.anchor('scene', 0, 0); w.anchor('scene', 3, 0.5);
  people(w, 'crowd', [[-6, -1.4], [8, 1.4], [-14, 0.6]]);
  w.anchor('escape', -35, 0); w.anchor('escape', 35, 0);
  w.anchor('hide', -9.5, -1.6); w.anchor('hide', 7.5, 1.6);
  w.bounds = { minX: -24, maxX: 24, minZ: -2.4, maxZ: 2.4 };
  return { carPos: [-19, 0, Math.PI / 2] };
};
L.eczane = (w, rng) => shopStreet(w, rng, 'eczane');
L.bakkal = (w, rng) => shopStreet(w, rng, 'bakkal');
L.market = (w, rng) => shopStreet(w, rng, 'market');
L.tekel = (w, rng) => shopStreet(w, rng, 'tekel');
L.kirtasiye = (w, rng) => shopStreet(w, rng, 'kirtasiye');
L.internetKafe = (w, rng) => shopStreet(w, rng, 'internetKafe');
L.kiraathane = (w, rng) => shopStreet(w, rng, 'kiraathane');
L.atm = (w, rng) => {
  base(w, rng, { ax: 0, az: 2 });
  streetX(w, -2, -45, 45, { lights: [-12, 12] });
  rowX(w, rng, -8, -1, -45, 45);
  w.building(0, 8.5, 12, 10, 5, { seed: rng.int(1, 9999), color: '#d8d4cc' });
  w.building(-13, 8.5, 12, 10, 4, { seed: rng.int(1, 9999) }); w.building(13, 8.5, 12, 10, 4, { seed: rng.int(1, 9999) });
  w.shopfront(0, 3.5, 12, -1, 'ANADOLU BANKASI', { signBg: '#0b3d6e', signFg: '#ffffff' });
  for (const x of [-1.2, 1.2]) {
    const g = G(w.static, x, 0, 3.5);
    M(boxGeo(1.0, 2.0, 0.3), mat('#3a3e45', { m: 0.5, r: 0.3 }), 0, 1.0, -0.15, 0, 0, 0, g);
    M(boxGeo(1.05, 0.12, 0.45), mat('#0b3d6e', {}), 0, 2.0, -0.2, 0, 0, 0, g);
    M(boxGeo(0.6, 0.2, 0.25), mat('#2b2e33', {}), 0, 1.0, -0.38, 0.3, 0, 0, g);
    w.mesh(plane(0.5, 0.36), ownMat('#000', { em: TX.screen('atm', 1), e: '#fff', ei: 1.6 }), x, 1.45, 3.19, -0.15, Math.PI, 0, w.dynamic, false);
    w.addCollider(x - 0.5, 0, 3.0, x + 0.5, 2.1, 3.5);
  }
  w.pointLight(0, 2.6, 2.6, 0xe8f4ff, 8, 8);
  w.mesh(boxGeo(0.1, 0.1, 0.06), ownMat('#000', { e: '#ff2020', ei: 4 }), 4, 2.7, 3.4);
  w.car(8, -0.2, -Math.PI / 2, null, rng); w.bench(-5, 2.0, Math.PI); w.trashcan(4.5, 2.4);
  w.anchor('scene', -1.2, 2.4); w.anchor('atm', -1.2, 2.6); w.anchor('package', 1.2, 2.9);
  people(w, 'crowd', [[-6, 1.4], [6, 1.6], [-10, -6], [10, -5.4], [3, 1.2]]);
  w.anchor('escape', -45, 0); w.anchor('escape', 45, 0); w.anchor('escape', 0, -30);
  w.anchor('hide', -7, 3); w.anchor('hide', 7, 3);
  w.bounds = { minX: -22, maxX: 22, minZ: -11, maxZ: 3.4 };
  return { carPos: [-8, -3.5, Math.PI / 2 - 0.4] };
};
L.agaclik = (w, rng) => {
  base(w, rng, { ax: 0, az: 10, puddles: 6, skyline: false });
  const dm = mat(0xffffff, { map: TX.dirt().map, r: 1 }); dm.map.repeat.set(20, 20);
  M(plane(140, 140), dm, 0, 0.012, 20, -Math.PI / 2, 0, 0, w.dynamic, false).receiveShadow = true;
  w.road(0, -10, 6, 80, 'x', { lines: true });
  w.mapShapes.push({ x: 0, z: 18, w: 60, d: 50, c: '#1f3320' });
  for (let i = 0; i < 70; i++) { const x = rng.range(-30, 30), z = rng.range(-4, 40); if (Math.abs(x - 2) < 3 && z < 14) continue; w.tree(x, z, rng.range(0.9, 1.6), rng.chance(0.6) ? 1 : 0); }
  for (let i = 0; i < 20; i++) w.mesh(rbox(rng.range(0.4, 1.2), rng.range(0.3, 0.8), rng.range(0.4, 1), 0.15), mat('#5a5f66', { r: 0.9 }), rng.range(-25, 25), 0.2, rng.range(-3, 35), rng.next(), rng.next() * 3, 0);
  w.streetLight(-6, -12.8, 0, { shadow: true, color: 0xffa860 });
  w.fire(4, 0, 16, 0.8);
  for (let i = 0; i < 4; i++) { const a = i / 4 * 6.28; w.mesh(rbox(0.5, 0.25, 0.25, 0.08), mat('#4a3424', {}), 4 + Math.cos(a) * 0.6, 0.12, 16 + Math.sin(a) * 0.6, 0, a, 0); }
  w.mesh(rbox(2.4, 1.2, 2, 0.4), mat('#2f5a2a', { r: 0.9 }), 7, 0.6, 18, 0, 0.4, 0);
  w.anchor('scene', 4, 14.5); w.anchor('scene', 2.5, 17);
  people(w, 'crowd', [[1, -6.5], [-4, -7]]);
  w.anchor('escape', 0, 50); w.anchor('escape', -40, 25); w.anchor('escape', 40, 25);
  w.anchor('hide', -6, 22); w.anchor('hide', 12, 26); w.anchor('hide', -12, 12); w.anchor('hide', 15, 8);
  w.bounds = { minX: -28, maxX: 28, minZ: -14, maxZ: 38 };
  return { carPos: [-2, -9, 0.45], dark: true };
};
L.sanayi = (w, rng) => {
  base(w, rng, { ax: 0, az: 0, puddles: 22 });
  const conc = TX.concreteTiles('#6f6c66', 2); w.box(60, 0.04, 30, 0, 0, 0, mat(0xffffff, { map: conc.map, r: 0.7 }), { collide: false, cast: false });
  for (let i = 0; i < 5; i++) for (const s of [-1, 1]) {
    const x = -20 + i * 10, z = s * 11;
    w.box(9.6, 5, 8, x, 0, z, mat('#8a8f96', { r: 0.6, m: 0.3 }), { map: '#3f434c' });
    const sh = mat('#b9bec6', { m: 0.6, r: 0.45 });
    const shut = M(boxGeo(5, 3.6, 0.1), sh, x, 1.8, z - s * 4.05, 0, 0, 0, w.static);
    for (let k = 0; k < 12; k++) M(boxGeo(5, 0.03, 0.12), mat('#7a7f86', { m: 0.6 }), x, 0.2 + k * 0.3, z - s * 4.08, 0, 0, 0, w.static, false);
    M(plane(4.6, 0.8), ownMat('#000', { em: TX.sign(['OTO TAMİR', 'KAPORTA', 'ELEKTRİK', 'LASTİKÇİ', 'MOTOR', 'BOYA'][(i + (s > 0 ? 3 : 0)) % 6] + ' ' + (i + 1), { bg: '#1b1c1f', fg: rng.pick(['#ffd23f', '#4fc3ff', '#ff6b6b', '#ffffff']), w: 512, h: 96 }), e: '#fff', ei: 1.6 }), x, 4.3, z - s * 4.06, 0, s > 0 ? Math.PI : 0, 0, w.dynamic, false);
  }
  for (let i = 0; i < 10; i++) w.mesh(cyl(0.3, 0.3, 0.9, 12), mat(rng.pick(['#2a4f8a', '#c0262c', '#2d6a4f', '#3a3a3a']), { m: 0.4, r: 0.5 }), rng.range(-22, 22), 0.45, rng.pick([-6.4, 6.4]) + rng.range(-0.4, 0.4));
  for (let i = 0; i < 8; i++) w.mesh(torus(0.32, 0.12, 8, 16), mat('#111', { r: 0.9 }), -14 + rng.range(-1, 1), 0.12 + i * 0.24, -6.6, Math.PI / 2, 0, 0);
  w.car(6, -4, 0.2, null, rng); w.car(-8, 4.5, Math.PI - 0.1, null, rng);
  const van = createVan('#e8e8e8'); van.position.set(10, 0, 3.5); van.rotation.y = Math.PI / 2; w.dynamic.add(van); w.carCollider(10, 3.5, Math.PI / 2, van, 5.4, 2.0, 2.3);
  for (const x of [-15, 0, 15]) w.streetLight(x, x === 0 ? 6.8 : -6.8, x === 0 ? Math.PI : 0, { shadow: x === 0, color: 0xd8e6ff, intensity: 45 });
  w.anchor('scene', 6, 3.5); w.anchor('vehicle', 10, 3.5); w.anchor('van', 7, 3.5);
  people(w, 'crowd', [[-10, -5.8], [-2, 5.8], [16, -5.8], [-18, 5.8]]);
  w.anchor('escape', -45, 0); w.anchor('escape', 45, 0);
  w.anchor('hide', -20, -6.5); w.anchor('hide', 20, 6.5);
  w.bounds = { minX: -26, maxX: 26, minZ: -6.9, maxZ: 6.9 };
  return { carPos: [-22, -2, Math.PI / 2 + 0.2] };
};
L.halisaha = (w, rng) => {
  base(w, rng, { ax: 0, az: 10 });
  streetX(w, -6, -45, 45, { lights: [-14, 14] });
  const tm = mat(0xffffff, { map: TX.turf().map, r: 0.9 }); tm.map.repeat.set(1, 3);
  M(plane(20, 34), tm, 0, 0.02, 18, -Math.PI / 2, 0, Math.PI / 2, w.static, false).receiveShadow = true;
  w.mapShapes.push({ x: 0, z: 18, w: 34, d: 20, c: '#2f6b34' });
  const lm = mat('#f4f4f0', { r: 0.6 });
  M(plane(32, 0.1), lm, 0, 0.03, 9, -Math.PI / 2, 0, 0, w.static, false); M(plane(32, 0.1), lm, 0, 0.03, 27, -Math.PI / 2, 0, 0, w.static, false); M(plane(0.1, 18), lm, 0, 0.03, 18, -Math.PI / 2, 0, 0, w.static, false);
  M(torus(2.5, 0.05, 4, 40), lm, 0, 0.03, 18, Math.PI / 2, 0, 0, w.static, false);
  for (const s of [-1, 1]) {
    const gx = s * 16;
    w.mesh(boxGeo(0.1, 2, 0.1), mat('#fff', {}), gx, 1, 16.5); w.mesh(boxGeo(0.1, 2, 0.1), mat('#fff', {}), gx, 1, 19.5); w.mesh(boxGeo(0.1, 0.1, 3.1), mat('#fff', {}), gx, 2, 18);
    M(plane(3, 2), new THREE.MeshStandardMaterial({ map: TX.fence(), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }), gx + s * 0.6, 1, 18, 0, Math.PI / 2, 0, w.static, false);
  }
  const fm = new THREE.MeshStandardMaterial({ map: TX.fence(), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, metalness: 0.6 }); fm.map.repeat.set(10, 2);
  for (const [x, z, ww, ry] of [[0, 8, 36, 0], [0, 28, 36, 0], [-18, 18, 20, Math.PI / 2], [18, 18, 20, Math.PI / 2]]) {
    const ops = x === 0 && z === 8;
    M(plane(ww, 4), fm, x, 2, z, 0, ry, 0, w.static, false);
    if (ops) { w.addCollider(-18, 0, 7.9, -1, 4, 8.1); w.addCollider(1, 0, 7.9, 18, 4, 8.1); } else if (ry === 0) w.addCollider(-18, 0, z - 0.1, 18, 4, z + 0.1); else w.addCollider(x - 0.1, 0, 8, x + 0.1, 4, 28);
  }
  for (const [x, z] of [[-17, 8.5], [17, 27.5]]) { w.mesh(cyl(0.12, 0.15, 9, 8), mat('#333', { m: 0.6 }), x, 4.5, z); M(boxGeo(2, 0.6, 0.3), ownMat('#222', { e: '#f4fbff', ei: 5 }), x, 9, z, 0.5, 0, 0, w.dynamic, false); }
  w.spotLight(-17, 9, 8.5, -4, 0, 18, 0xf4fbff, 90, 30, 0.75, true); w.spotLight(17, 9, 27.5, 4, 0, 18, 0xf4fbff, 90, 30, 0.75);
  w.box(6, 2.8, 3, -12, 0, 3.5, mat('#c9b79c', {}));
  M(plane(5, 0.8), ownMat('#000', { em: TX.sign('YILDIZ HALI SAHA', { bg: '#0b3', fg: '#fff', w: 512, h: 96 }), e: '#fff', ei: 2 }), -12, 2.4, 1.98, 0, Math.PI, 0, w.dynamic, false);
  w.mesh(sph(0.11, 12, 10), mat('#ffffff', { r: 0.4 }), 3, 0.13, 20);
  w.anchor('scene', 0, 16); w.anchor('scene', 3, 18);
  people(w, 'crowd', [[-5, 13], [6, 14], [-8, 22], [8, 23], [-2, 25], [4, 11], [-11, 17]]);
  w.anchor('escape', 0, -20); w.anchor('escape', -45, -6); w.anchor('escape', 45, -6);
  w.anchor('hide', -15, 3.5);
  w.bounds = { minX: -22, maxX: 22, minZ: -12, maxZ: 27.8 };
  return { carPos: [-5, -4.5, 0.3] };
};
L.okul = (w, rng) => {
  base(w, rng, { ax: 0, az: 4 });
  streetX(w, -3, -45, 45, { lights: [-12, 12], crossing: 0 });
  rowX(w, rng, -9, -1, -45, 45);
  w.fence(-24, 2, -2.5, 2, 'wall', 2.0, '#d8cfc0'); w.fence(2.5, 2, 24, 2, 'wall', 2.0, '#d8cfc0');
  for (const x of [-2.5, 2.5]) w.box(0.6, 2.6, 0.6, x, 0, 2, mat('#c8102e', {}));
  M(plane(6, 0.9), ownMat('#000', { em: TX.sign('ATATÜRK İLKOKULU', { bg: '#0b3d6e', fg: '#fff', w: 768, h: 128 }), e: '#fff', ei: 1.6 }), 0, 3.0, 1.68, 0, Math.PI, 0, w.dynamic, false);
  w.mesh(boxGeo(5.2, 0.2, 0.6), mat('#c8102e', {}), 0, 2.6, 2);
  w.building(0, 14, 26, 10, 3, { seed: 77, color: '#e6c48a' });
  const pg = mat('#7a2f2f', { r: 0.9 }); M(plane(26, 6), pg, 0, 0.02, 5.5, -Math.PI / 2, 0, 0, w.static, false);
  w.streetLight(-6, 4.5, 0, { shadow: true }); w.streetLight(6, 4.5, 0);
  for (let i = 0; i < 4; i++) w.tree(-10 + i * 7, 6, 0.9);
  M(plane(1, 1), mat(0xffffff, { map: TX.sign('OKUL', { bg: '#ffd23f', fg: '#111', w: 128, h: 128, glow: false }) }), -6, 2.2, 0.2, 0, Math.PI, 0, w.dynamic, false);
  w.mesh(boxGeo(0.06, 2.6, 0.06), mat('#333', {}), -6, 1.3, 0.25);
  w.anchor('scene', 0, 0.8); w.anchor('package', 3.4, 1.4); w.anchor('gate', 0, 3);
  people(w, 'crowd', [[-4, 0.9], [4, 1.1], [-8, -6], [7, -6.5], [-1.5, 6]]);
  w.anchor('escape', -45, 0); w.anchor('escape', 45, 0);
  w.anchor('hide', -9, 7); w.anchor('hide', 10, 7);
  w.bounds = { minX: -22, maxX: 22, minZ: -11, maxZ: 9 };
  return { carPos: [-8, -4, Math.PI / 2 - 0.45] };
};
L.sonDurak = (w, rng) => {
  base(w, rng, { ax: 0, az: 4 });
  const conc = TX.concreteTiles('#77746e', 2); w.box(50, 0.05, 26, 0, 0, 6, mat(0xffffff, { map: conc.map, r: 0.6 }), { collide: false, cast: false });
  streetX(w, -10, -45, 45, { lights: [-14, 14] });
  for (let i = 0; i < 3; i++) { const b = createBus(false, ['15F  SON DURAK', '500T  SON DURAK', '34AS  SON DURAK'][i]); b.position.set(-10 + i * 7, 0, 7); w.dynamic.add(b); w.carCollider(-10 + i * 7, 7, 0, b, 11.5, 2.5, 3.4); w.mapShapes.push({ x: -10 + i * 7, z: 7, w: 2.6, d: 11.5, c: '#3a7a4f' }); }
  w.box(16, 3.2, 4, 12, 0, 16, mat('#d8d4cc', {})); w.shopfront(12, 14, 16, -1, 'DURAK ÇAY OCAĞI', { signBg: '#3b1f0e', signFg: '#ffcf6b', awning: '#7a2f2f' });
  for (let i = 0; i < 3; i++) w.teaTable(7 + i * 3.6, 11, '#e8e2d6', 3);
  w.box(8, 0.1, 3, -2, 3.2, -1, mat('#2b2e33', { m: 0.5 }), { collide: false });
  for (const x of [-5.6, 1.6]) w.box(0.12, 3.2, 0.12, x, 0, -1, mat('#2b2e33', { m: 0.5 }));
  M(boxGeo(7.6, 0.04, 0.3), ownMat('#000', { e: '#eef6ff', ei: 4 }), -2, 3.17, -1, 0, 0, 0, w.dynamic, false);
  w.pointLight(-2, 2.9, -1, 0xeef6ff, 9, 9); w.bench(-4, -1.6, 0); w.bench(0, -1.6, 0);
  w.streetLight(4, 4, Math.PI / 2, { shadow: true }); w.streetLight(-16, 14, Math.PI / 2);
  w.anchor('scene', 0, 2.4); w.anchor('bus', -3, 7); w.anchor('package', -2.5, -1.3);
  people(w, 'crowd', [[-4, -0.6], [1, -0.4], [8, 12], [11.6, 12], [-6, 14], [6, 2]]);
  w.anchor('escape', -45, -10); w.anchor('escape', 45, -10); w.anchor('escape', 30, 25);
  w.anchor('hide', -14, 14); w.anchor('hide', 20, 19);
  w.bounds = { minX: -22, maxX: 24, minZ: -16, maxZ: 19 };
  return { carPos: [-12, -8.5, Math.PI / 2 - 0.5] };
};
L.otobusIci = (w, rng) => {
  base(w, rng, { ax: 0, az: 0 });
  streetX(w, 0, -50, 50, { lights: [-12, 12] });
  rowX(w, rng, 6.5, 1, -50, 50); rowX(w, rng, -6.5, -1, -50, 50);
  const bus = createBus(true, '15F  KADIKÖY'); bus.position.set(4, 0, 1.6); bus.rotation.y = Math.PI / 2; w.dynamic.add(bus);
  // otobüs kabuğu çarpışmaları (iç mekan)
  const bx = 4, bz = 1.6, Lh = 5.75, Wh = 1.25;
  w.addCollider(bx - Lh, 0, bz + Wh - 0.08, bx + Lh, 3.3, bz + Wh + 0.08); // sağ duvar (kaldırım tarafı değil)
  w.addCollider(bx - Lh, 0, bz - Wh - 0.08, bx - 0.4, 3.3, bz - Wh + 0.08); w.addCollider(bx + 1.6, 0, bz - Wh - 0.08, bx + Lh, 3.3, bz - Wh + 0.08); // kapı boşluğu
  w.addCollider(bx - Lh - 0.1, 0, bz - Wh, bx - Lh, 3.3, bz + Wh); w.addCollider(bx + Lh, 0, bz - Wh, bx + Lh + 0.1, 3.3, bz + Wh);
  w.addCollider(bx - Lh, 0, bz - Wh, bx + Lh, 0.55, bz + Wh, { small: true });
  w.addCollider(bx - Lh, 3.3, bz - Wh, bx + Lh, 3.5, bz + Wh);
  // koltuk sıraları
  for (let i = 0; i < 9; i++) { const x = bx - Lh + 1.2 + i * 1.05; w.addCollider(x - 0.25, 0, bz + 0.3, x + 0.25, 1.1, bz + 1.2, { small: true }); if (i !== 3 && i !== 4) w.addCollider(x - 0.25, 0, bz - 1.2, x + 0.25, 1.1, bz - 0.3, { small: true }); }
  w.ramp(bx - 0.4, bz - Wh - 1.2, bx + 1.6, bz - Wh, 0.16, 0.55, 'z');
  w.pointLight(bx - 2, 2.9, bz, 0xeef6ff, 8, 8); w.pointLight(bx + 3, 2.9, bz, 0xeef6ff, 7, 8);
  w.mapShapes.push({ x: bx, z: bz, w: 11.5, d: 2.5, c: '#3a7a4f' });
  w.anchor('scene', bx, bz, 0.55); w.anchor('inside', bx - 2.5, bz + 0.0, 0.55); w.anchor('inside', bx + 2.5, bz, 0.55); w.anchor('inside', bx - 4, bz, 0.55); w.anchor('inside', bx + 4.6, bz, 0.55);
  w.anchor('driver', bx + 5.0, bz + 0.7, 0.55);
  people(w, 'crowd', [[-6, -4.5], [12, -4.4], [0, -4.8]]);
  w.anchor('escape', -50, -4); w.anchor('escape', 50, -4);
  w.bounds = { minX: -20, maxX: 22, minZ: -9, maxZ: 3 };
  return { carPos: [-6, -1.8, Math.PI / 2 - 0.15], busInterior: true };
};
L.cayBahcesi = (w, rng) => {
  base(w, rng, { ax: 0, az: 6, puddles: 8 });
  streetX(w, -6, -45, 45, { lights: [-14, 14] });
  rowX(w, rng, -12, -1, -45, 45);
  const gm = mat(0xffffff, { map: TX.dirt().map, r: 0.95 }); gm.map.repeat.set(6, 4);
  M(plane(30, 18), gm, 0, 0.015, 9, -Math.PI / 2, 0, 0, w.static, false);
  w.mapShapes.push({ x: 0, z: 9, w: 30, d: 18, c: '#4a3c2c' });
  w.fence(-15, 0, -2, 0, 'wood', 1.0, '#7a4f2c'); w.fence(2, 0, 15, 0, 'wood', 1.0, '#7a4f2c');
  for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) w.teaTable(-9 + i * 6, 4 + r * 4.4, rng.pick(['#e8e2d6', '#d8cfc0']), 4);
  for (let i = 0; i < 6; i++) w.tree(-13 + i * 5.2, 17, 1.1);
  w.stringLights([[-14, 2], [0, 3], [14, 2]], ['#ffcf6b', '#ffe2a8'], 3.6); w.stringLights([[-14, 11], [0, 12], [14, 11]], ['#ffcf6b', '#ff9e6b'], 3.6);
  w.box(6, 3, 3, 10, 0, 16.5, mat('#c9b79c', {}));
  w.shopfront(10, 15, 6, -1, 'ÇINAR ÇAY BAHÇESİ', { signBg: '#2d4a1f', signFg: '#ffe2a8' });
  w.anchor('scene', 0, 8.4); w.anchor('scene', 3, 8.4);
  people(w, 'crowd', [[-9, 4.8], [-3, 4.8], [3, 9.2], [9, 9.2], [-9, 13.2], [3, 13.2]]);
  w.anchor('escape', -45, -6); w.anchor('escape', 45, -6); w.anchor('escape', 0, 30);
  w.anchor('hide', -14, 17); w.anchor('hide', 14, 12);
  w.bounds = { minX: -20, maxX: 20, minZ: -12, maxZ: 19 };
  return { carPos: [-6, -5, Math.PI / 2 - 0.65], seated: true };
};
L.otoYikama = (w, rng) => {
  base(w, rng, { ax: 0, az: 6, puddles: 26 });
  streetX(w, -6, -45, 45, { lights: [-14, 14] });
  rowX(w, rng, -12, -1, -45, 45);
  w.box(16, 0.4, 9, 0, 4.2, 8, mat('#e8e8e4', {}), { collide: false });
  for (const [x, z] of [[-7.8, 3.6], [7.8, 3.6], [-7.8, 12.4], [7.8, 12.4], [0, 3.6], [0, 12.4]]) w.box(0.3, 4.2, 0.3, x, 0, z, mat('#3a86ff', { m: 0.4 }));
  for (let i = 0; i < 4; i++) M(boxGeo(2.5, 0.04, 0.3), ownMat('#000', { e: '#bfe0ff', ei: 5 }), -4 + (i % 2) * 8, 4.18, 6 + Math.floor(i / 2) * 4, 0, 0, 0, w.dynamic, false);
  w.pointLight(-4, 3.8, 8, 0xbfe0ff, 14, 12); w.pointLight(4, 3.8, 8, 0xbfe0ff, 14, 12);
  M(plane(8, 1), ownMat('#000', { em: TX.sign('KÖPÜK OTO YIKAMA', { bg: '#0b3d6e', fg: '#7fdcff', w: 768, h: 96 }), e: '#fff', ei: 2.4 }), 0, 4.95, 3.5, 0, Math.PI, 0, w.dynamic, false);
  w.car(-4, 8, 0, null, rng); w.car(4, 8.5, 0.05, null, rng);
  for (let i = 0; i < 30; i++) w.mesh(sph(rng.range(0.1, 0.25), 8, 6), mat('#ffffff', { r: 0.3, t: true, op: 0.8 }), -4 + rng.range(-1.2, 1.2), rng.range(0.6, 1.5), 8 + rng.range(-2.4, 2.4), 0, 0, 0, w.static, false);
  w.mesh(cyl(0.3, 0.3, 1.2, 12), mat('#e63946', {}), 7, 0.6, 5); w.mesh(cyl(0.02, 0.02, 2, 6), mat('#111', {}), 6.6, 1, 5.4, 0, 0, 1.2);
  w.box(5, 3, 4, -12, 0, 10, mat('#d8d4cc', {}));
  w.anchor('scene', -1.5, 7); w.anchor('vehicle', 4, 8.5);
  people(w, 'crowd', [[-6, 6], [2, 11.5], [6, 4.5], [-9, 3]]);
  w.anchor('escape', -45, -6); w.anchor('escape', 45, -6); w.anchor('escape', 0, 30);
  w.anchor('hide', -12, 13); w.anchor('hide', 10, 14);
  w.bounds = { minX: -20, maxX: 20, minZ: -12, maxZ: 16 };
  return { carPos: [-8, -5, Math.PI / 2 - 0.5] };
};
L.hastane = (w, rng) => {
  base(w, rng, { ax: 0, az: 6 });
  streetX(w, -8, -45, 45, { lights: [-14, 14] });
  w.building(0, 16, 30, 12, 6, { seed: 55, color: '#e9eef2', style: 1 });
  w.box(12, 0.4, 6, 0, 3.6, 7, mat('#e8e8e4', {}), { collide: false });
  for (const x of [-5.6, 5.6]) w.box(0.3, 3.6, 0.3, x, 0, 4.4, mat('#cfd6dc', {}));
  M(plane(8, 1.2), ownMat('#000', { em: TX.sign('ACİL', { bg: '#c8102e', fg: '#fff', w: 512, h: 128 }), e: '#fff', ei: 3 }), 0, 4.3, 3.98, 0, Math.PI, 0, w.dynamic, false);
  w.glow(0, 4.3, 3.5, '#ff3030', 6, 0.25);
  M(plane(6, 2.8), mat('#cfe3f0', { t: true, op: 0.35, r: 0.05, e: '#cfe8ff', ei: 0.5 }), 0, 1.4, 9.99, 0, Math.PI, 0, w.static, false);
  w.pointLight(0, 3.3, 7, 0xf4fbff, 14, 12);
  const amb = createAmbulance(); amb.position.set(-8, 0, 6); amb.rotation.y = 0.2; w.dynamic.add(amb); w.carCollider(-8, 6, 0.2, amb, 5.4, 2, 2.4); w.updaters.push((dt) => updateAmbulance(amb, dt));
  w.car(10, 6, 0, null, rng); w.bench(4, 9.2, Math.PI); w.trashcan(6.6, 9.2);
  w.anchor('scene', 0, 6); w.anchor('scene', 2, 7.5);
  people(w, 'crowd', [[-3, 8.4], [3, 8.6], [-12, 3], [8, 2], [0, 9.2]]);
  w.anchor('escape', -45, -8); w.anchor('escape', 45, -8);
  w.anchor('hide', 14, 9.6); w.anchor('hide', -14, 9.6);
  w.bounds = { minX: -22, maxX: 22, minZ: -14, maxZ: 9.8 };
  return { carPos: [-4, -6, Math.PI / 2 - 0.55] };
};
L.copKonteyner = (w, rng) => {
  base(w, rng, { ax: 0, az: 2, puddles: 16 });
  streetX(w, -4, -45, 45, { lights: [-10, 10] });
  rowX(w, rng, 6, 1, -45, 45, { floors: [3, 5] }); rowX(w, rng, -10, -1, -45, 45);
  for (let i = 0; i < 4; i++) w.dumpster(-5 + i * 2.3, 2.4, 0, ['#2b5d34', '#1f3fa8', '#7a6a2a', '#2b5d34'][i]);
  for (let i = 0; i < 9; i++) w.mesh(rbox(rng.range(0.4, 0.7), rng.range(0.3, 0.5), rng.range(0.4, 0.6), 0.1), mat(rng.pick(['#111', '#1b1b1b', '#2c3e50', '#6b4a30']), { r: 0.5 }), rng.range(-6, 4), 0.2, rng.range(0.8, 1.4), 0, rng.next() * 3, 0);
  w.mesh(boxGeo(1.4, 0.8, 0.6), mat('#6b4a30', { r: 0.9 }), 6, 0.4, 2.6, 0, 0.4, 0);
  w.mesh(rbox(1.8, 0.6, 0.9, 0.2), mat('#7a2f2f', { r: 0.95 }), 3.5, 0.3, 4.2);
  w.anchor('scene', -1, 1.0); w.anchor('package', 1.5, 1.2);
  people(w, 'crowd', [[-8, 0.8], [7, 0.6], [-4, -8.6], [5, -8.5]]);
  w.anchor('escape', -45, 0); w.anchor('escape', 45, 0);
  w.anchor('hide', 8, 3.5); w.anchor('hide', -9, 3.5);
  w.bounds = { minX: -20, maxX: 20, minZ: -11, maxZ: 5.5 };
  return { carPos: [-10, -2.6, Math.PI / 2 - 0.3] };
};
L.otoparkGirisi = (w, rng) => {
  base(w, rng, { ax: 0, az: 4 });
  streetX(w, -6, -45, 45, { lights: [-12, 14] });
  rowX(w, rng, -12, -1, -45, 45);
  w.building(-11, 12, 16, 16, 4, { seed: rng.int(1, 999), color: '#8d8a84' }); w.building(11, 12, 16, 16, 4, { seed: rng.int(1, 999), color: '#8d8a84' });
  w.box(6, 1, 16, 0, 3.2, 12, mat('#77746e', {}), { collide: false });
  w.ramp(-3, 4, 3, 20, 0, -1.6, 'z');
  M(boxGeo(6, 0.05, 16), mat('#3a3d42', { r: 0.6 }), 0, -0.02, 12, -0.1, 0, 0, w.static, false);
  const arm = G(w.dynamic, 2.6, 1.1, 2.6);
  M(boxGeo(5, 0.1, 0.1), mat('#f4f4f0', { e: '#ff3030', ei: 0.05 }), -2.5, 0, 0, 0, 0, 0, arm);
  for (let i = 0; i < 4; i++) M(boxGeo(0.5, 0.11, 0.11), mat('#d0021b', {}), -0.8 - i * 1.1, 0, 0, 0, 0, 0, arm);
  w.mesh(boxGeo(0.4, 1.1, 0.4), mat('#f1c40f', {}), 2.6, 0.55, 2.6);
  w.mesh(boxGeo(0.5, 1.4, 0.4), mat('#2b2e33', {}), -2.4, 0.7, 2.4); w.mesh(plane(0.3, 0.2), ownMat('#000', { e: '#3aff6a', ei: 2 }), -2.4, 1.2, 2.19, 0, Math.PI, 0, w.dynamic, false);
  w.addCollider(-2.6, 0, 2.5, 2.8, 1.2, 2.7, { small: true });
  M(plane(4, 0.8), ownMat('#000', { em: TX.sign('KAPALI OTOPARK', { bg: '#1f3fa8', fg: '#fff', w: 512, h: 96 }), e: '#fff', ei: 2.2 }), 0, 3.9, 3.96, 0, Math.PI, 0, w.dynamic, false);
  for (let i = 0; i < 3; i++) M(boxGeo(5, 0.04, 0.2), ownMat('#000', { e: '#ffcf6b', ei: 4 }), 0, 3.15, 5 + i * 4, 0, 0, 0, w.dynamic, false);
  w.pointLight(0, 3, 6, 0xffd8a0, 10, 10);
  w.car(0.6, 8.5, 0, null, rng);
  w.anchor('scene', 0, 2); w.anchor('vehicle', 0.6, 8.5);
  people(w, 'crowd', [[-4.5, 2.8], [4.5, 2.6], [-8, -8.5], [8, -8]]);
  w.anchor('escape', 0, 30); w.anchor('escape', -45, -6); w.anchor('escape', 45, -6);
  w.anchor('hide', 2.4, 18);
  w.bounds = { minX: -20, maxX: 20, minZ: -12, maxZ: 19 };
  return { carPos: [-7, -5.4, Math.PI / 2 - 0.55] };
};
L.otostop = (w, rng) => {
  base(w, rng, { ax: 0, az: 0, puddles: 8, skyline: false });
  const dm = mat(0xffffff, { map: TX.dirt().map, r: 1 }); dm.map.repeat.set(30, 30);
  M(plane(200, 200), dm, 0, 0.008, 0, -Math.PI / 2, 0, 0, w.dynamic, false).receiveShadow = true;
  M(plane(140, 9), mat(0xffffff, { map: TX.asphalt().map, r: 0.5, nm: TX.asphalt().normalMap }), 0, 0.012, 0, -Math.PI / 2, 0, 0, w.static, false);
  w.road(0, 0, 9, 140, 'x');
  const gr = mat('#c9ced6', { m: 0.8, r: 0.3 });
  for (let i = 0; i < 30; i++) { w.mesh(boxGeo(0.1, 0.7, 0.1), gr, -45 + i * 3, 0.35, 5.4); }
  w.mesh(boxGeo(90, 0.3, 0.05), gr, 0, 0.6, 5.42); w.addCollider(-45, 0, 5.3, 45, 0.8, 5.5);
  for (let i = 0; i < 24; i++) w.tree(rng.range(-40, 40), rng.pick([rng.range(9, 25), rng.range(-25, -9)]), rng.range(1, 1.5), 1);
  w.mesh(boxGeo(0.08, 2.4, 0.08), mat('#333', {}), 4, 1.2, 4.9);
  M(plane(1.8, 0.9), mat(0xffffff, { map: TX.sign('İSTANBUL 42', { bg: '#1f6f3a', fg: '#fff', w: 256, h: 128, glow: false }) }), 4, 2.6, 4.85, 0, Math.PI, 0, w.dynamic, false);
  w.streetLight(-2, 5.2, Math.PI, { shadow: true, color: 0xffa860 });
  w.anchor('scene', 2, 4.3); w.anchor('vehicle', 8, 3);
  people(w, 'crowd', [[-6, 4.6]]);
  w.anchor('escape', -60, 4); w.anchor('escape', 60, 4); w.anchor('escape', 0, 40);
  w.anchor('hide', 10, 14); w.anchor('hide', -12, 12);
  w.bounds = { minX: -24, maxX: 24, minZ: -8, maxZ: 20 };
  return { carPos: [-8, 2.6, Math.PI / 2 + 0.05], dark: true };
};
L.ustGecit = (w, rng) => {
  base(w, rng, { ax: 0, az: 0 });
  streetX(w, 0, -50, 50, { width: 12, lights: [-16, 16] });
  rowX(w, rng, 9.5, 1, -50, 50); rowX(w, rng, -9.5, -1, -50, 50);
  // köprü tabliyesi z -8..8 x -1.4..1.4, yükseklik 5.2
  const cm = mat('#8d8a84', { r: 0.7 }); const rail = mat('#c9ced6', { m: 0.8, r: 0.3 });
  const deckY = 5.2;
  w.box(2.8, 0.4, 14, 0, deckY - 0.4, 0, cm, { collide: false });
  w.addCollider(-1.4, deckY - 0.4, -7, 1.4, deckY, 7, { small: true });
  for (const s of [-1, 1]) { w.box(0.08, 1.1, 14, s * 1.38, deckY, 0, rail, { collide: false }); for (let i = 0; i < 15; i++) w.mesh(boxGeo(0.05, 1.1, 0.05), rail, s * 1.38, deckY + 0.55, -7 + i); w.addCollider(s * 1.38 - 0.06, deckY, -7, s * 1.38 + 0.06, deckY + 1.1, 7, { small: true }); }
  M(plane(2.6, 14), mat('#4a4f57', { r: 0.6 }), 0, deckY + 0.01, 0, -Math.PI / 2, 0, 0, w.static, false);
  for (const z of [-7.5, 7.5]) w.box(0.8, deckY - 0.4, 0.8, 1.8, 0, z, cm);
  // merdivenler (rampa) her iki uçta x boyunca
  for (const s of [-1, 1]) {
    const z0 = s * 7.8;
    for (let i = 0; i < 20; i++) { const top = deckY - i * 0.26; w.mesh(boxGeo(0.35, top, 2.0), cm, -1.4 - i * 0.35 - 0.17, top / 2, z0, 0, 0, 0); }
    w.box(2.8, 0.4, 2.0, 0, deckY - 0.4, z0, cm, { collide: false });
    w.addCollider(-1.4, deckY - 0.4, z0 - 1.0, 1.4, deckY, z0 + 1.0, { small: true });
    w.ramp(-8.4, z0 - 1.0, -1.4, z0 + 1.0, 0, deckY, 'x');
    w.ramps[w.ramps.length - 1].ax1 = -8.4; w.ramps[w.ramps.length - 1].ax2 = -1.4;
    w.addCollider(-8.4, 0, z0 - 1.1 - 0.05, -1.4, deckY + 1, z0 - 1.0, { small: true }); w.addCollider(-8.4, 0, z0 + 1.0, -1.4, deckY + 1, z0 + 1.1, { small: true });
  }
  for (let i = 0; i < 4; i++) { M(boxGeo(0.1, 0.04, 2.4), ownMat('#000', { e: '#eef6ff', ei: 5 }), 0, deckY + 2.4, -5 + i * 3.3, 0, 0, 0, w.dynamic, false); }
  w.box(2.8, 0.1, 14, 0, deckY + 2.5, 0, mat('#2b2e33', { m: 0.5 }), { collide: false });
  w.pointLight(0, deckY + 2.0, 0, 0xeef6ff, 9, 10);
  for (let i = 0; i < 6; i++) { const c = createCivilianCar(rng); c.position.set(-30 + i * 11, 0, i % 2 ? -3 : 3); c.rotation.y = i % 2 ? -Math.PI / 2 : Math.PI / 2; w.dynamic.add(c); const sp = (i % 2 ? -1 : 1) * rng.range(7, 11); w.updaters.push((dt) => { c.position.x += sp * dt; if (c.position.x > 50) c.position.x = -50; if (c.position.x < -50) c.position.x = 50; }); }
  w.addCollider(1.44, deckY - 0.4, -7, 1.75, deckY, 7, { small: true });
  w.box(0.32, 0.12, 14, 1.6, deckY - 0.12, 0, cm, { collide: false });
  w.anchor('edge', 1.6, 0.5, deckY); w.anchor('scene', 0, 0, deckY); w.anchor('edgeFall', 2.6, 0.5);
  people(w, 'crowd', [[-6, 9], [-3, 8.6], [-8, -8.8], [4, -9]]);
  w.anchor('escape', -50, 9); w.anchor('escape', 50, -9);
  w.bounds = { minX: -20, maxX: 20, minZ: -12, maxZ: 12 };
  return { carPos: [-12, 8.6, Math.PI / 2 + 0.3], elevated: deckY };
};
L.dugun = (w, rng) => {
  base(w, rng, { ax: 0, az: 0 });
  w.road(0, 0, 10, 70, 'x', { lines: false });
  for (const s of [-1, 1]) w.sidewalk(0, s * 6.5, 70, 3);
  rowX(w, rng, 8, 1, -35, 35, { floors: [2, 4] }); rowX(w, rng, -8, -1, -35, 35, { floors: [2, 4] });
  const cols = ['#ff3b3b', '#ffd23f', '#3bff8a', '#3bc8ff', '#ff3bd8', '#ffffff'];
  for (let i = 0; i < 4; i++) w.stringLights([[-16 + i * 8, -5], [-12 + i * 8, 0], [-8 + i * 8, 5]], cols, 4.2, 12, i % 2 === 0);
  for (let i = 0; i < 6; i++) { const x = -14 + i * 5.5; w.mesh(boxGeo(2.4, 0.06, 0.9), mat('#f4f1ea', { r: 0.8 }), x, 0.76, 4.0); w.mesh(boxGeo(2.4, 0.74, 0.04), mat('#f4f1ea', {}), x, 0.37, 4.4); w.addCollider(x - 1.2, 0, 3.55, x + 1.2, 0.8, 4.45, { small: true }); for (let k = 0; k < 3; k++) w.chair(x - 0.8 + k * 0.8, 3.2, 0, '#e8e2d6', true); }
  const sp = mat('#111', { r: 0.4 });
  for (const x of [-4, 4]) { w.mesh(boxGeo(0.7, 1.4, 0.6), sp, x, 0.7, -4.2); w.mesh(cyl(0.22, 0.22, 0.02, 16), mat('#333', { m: 0.6 }), x, 0.9, -3.89, Math.PI / 2, 0, 0); w.addCollider(x - 0.35, 0, -4.5, x + 0.35, 1.4, -3.9, { small: true }); }
  M(plane(5, 1), ownMat('#000', { em: TX.sign('ELİF ♥ MURAT', { bg: '#3a0a2a', fg: '#ffb3e6', w: 768, h: 128 }), e: '#fff', ei: 2.5 }), 0, 4.0, -5.2, 0, 0, 0, w.dynamic, false);
  w.pointLight(-4, 3, 0, 0xff60c0, 10, 12); w.pointLight(4, 3, 0, 0x60c0ff, 10, 12);
  const disco = [w.lights[w.lights.length - 2], w.lights[w.lights.length - 1]];
  w.updaters.push((dt, t) => { if (disco[0]) disco[0].color.setHSL((t * 0.2) % 1, 1, 0.6); if (disco[1]) disco[1].color.setHSL((t * 0.2 + 0.5) % 1, 1, 0.6); });
  w.anchor('scene', 0, 0); w.anchor('dance', 0, 0.5);
  people(w, 'crowd', [[-10, 3.2], [-4.5, 3.2], [1, 3.2], [7, 3.2], [-12, -3], [10, -3], [-6, -2], [6, -1.5]]);
  w.anchor('escape', -35, 0); w.anchor('escape', 35, 0);
  w.anchor('hide', -16, 6.4); w.anchor('hide', 16, -6.4);
  w.bounds = { minX: -22, maxX: 22, minZ: -7.9, maxZ: 7.9 };
  w.music = 'wedding';
  return { carPos: [-19, -2, Math.PI / 2 + 0.1] };
};
L.sahil = (w, rng) => {
  base(w, rng, { ax: 0, az: -6, puddles: 8, skyline: false });
  // deniz
  const sea = new THREE.MeshStandardMaterial({ color: 0x06121e, roughness: 0.06, metalness: 0.4, envMapIntensity: 2, normalMap: TX.asphalt().normalMap });
  sea.normalMap = sea.normalMap.clone(); sea.normalMap.needsUpdate = true; sea.normalMap.repeat.set(30, 30); sea.normalScale.set(0.6, 0.6);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(400, 200), sea); water.rotation.x = -Math.PI / 2; water.position.set(0, -1.2, 108); w.dynamic.add(water);
  w.updaters.push((dt, t) => { sea.normalMap.offset.set(t * 0.01, t * 0.006); });
  w.mapShapes.push({ x: 0, z: 30, w: 120, d: 44, c: '#0d2238' });
  const T = TX.concreteTiles('#a29a8c', 3);
  w.box(120, 0.2, 14, 0, 0, 1, mat(0xffffff, { map: T.map, nm: T.normalMap, r: 0.45, env: 1.2 }), { collide: false, cast: false });
  w.box(120, 1.4, 0.6, 0, -1.2, 8.3, mat('#77746e', {}), { collide: false });
  const rail = mat('#c9ced6', { m: 0.8, r: 0.3 });
  w.mesh(boxGeo(80, 0.06, 0.06), rail, 0, 1.1, 7.9); w.mesh(boxGeo(80, 0.06, 0.06), rail, 0, 0.6, 7.9);
  for (let i = 0; i < 40; i++) w.mesh(boxGeo(0.06, 1.1, 0.06), rail, -40 + i * 2, 0.55, 7.9);
  w.addCollider(-40, 0, 7.8, -2, 1.2, 8.0); w.addCollider(2, 0, 7.8, 40, 1.2, 8.0);
  // iskele
  w.box(3, 0.3, 14, 0, -0.1, 15, mat('#6b4a30', { r: 0.8 }), { collide: false }); w.addCollider(-1.5, -0.3, 8, 1.5, 0.2, 22, { small: true });
  for (const s of [-1, 1]) { w.mesh(boxGeo(0.06, 1.0, 14), rail, s * 1.45, 0.7, 15); w.addCollider(s * 1.45 - 0.05, 0, 8, s * 1.45 + 0.05, 1.2, 22, { small: true }); }
  w.addCollider(-1.5, 0, 21.9, 1.5, 1.2, 22.1, { small: true });
  for (let i = 0; i < 5; i++) w.mesh(cyl(0.15, 0.15, 3, 8), mat('#4a3424', {}), i % 2 ? 1.4 : -1.4, -1.4, 9 + i * 3);
  // uzak şehir ışıkları
  for (let i = 0; i < 160; i++) { const x = rng.range(-180, 180), z = rng.range(150, 190), y = rng.range(0, 14); w.mesh(boxGeo(rng.range(0.8, 3), rng.range(0.4, 1.2), 0.5), ownMat('#000', { e: rng.pick(['#ffcf87', '#fff1cf', '#ffb36b', '#c9e2ff']), ei: rng.range(2, 5) }), x, y, z, 0, 0, 0, w.dynamic, false); }
  w.mesh(cyl(0.3, 0.4, 2.5, 12), mat('#e8e8e2', {}), 0, 0.2, 22.4);
  for (let i = -3; i <= 3; i++) if (i) { w.streetLight(i * 7, 7.2, Math.PI, { shadow: i === 1, color: 0xfff0d0 }); w.bench(i * 7 + 2.5, 6.6, Math.PI); }
  for (let i = 0; i < 6; i++) w.tree(-18 + i * 7.2, -4, 1.0);
  streetX(w, -10, -60, 60, { lights: [] });
  rowX(w, rng, -16, -1, -60, 60);
  w.addCollider(-1.5, -0.3, 22.1, 1.5, 0.2, 22.6, { small: true }); w.box(3, 0.3, 0.5, 0, -0.1, 22.35, mat('#6b4a30', { r: 0.8 }), { collide: false });
  w.anchor('edge', 0.2, 22.35, 0.2); w.anchor('edgeFall', 0.2, 25);
  w.anchor('scene', 0, 6); w.anchor('scene', 4, 4);
  people(w, 'crowd', [[-6, 5.5], [6, 5.6], [-12, 2], [12, 3], [3, 6.2]]);
  w.anchor('escape', -60, 2); w.anchor('escape', 60, 2);
  w.anchor('hide', -20, -3); w.anchor('hide', 22, -3);
  w.bounds = { minX: -26, maxX: 26, minZ: -14, maxZ: 22 };
  return { carPos: [-6, -8.5, Math.PI / 2 - 0.6], dock: true };
};
L.kopruAlti = (w, rng) => {
  base(w, rng, { ax: 0, az: 0, puddles: 18, skyline: true });
  const deck = mat('#6f6c66', { r: 0.8 });
  w.box(70, 1.6, 16, 0, 8, 0, deck, { collide: false });
  for (const x of [-16, 0, 16]) for (const z of [-5, 5]) { w.box(1.6, 8, 1.6, x, 0, z, mat('#8d8a84', { r: 0.8 })); M(plane(1.5, 2), mat(0xffffff, { map: TX.graffiti(Math.abs(x + z) + 3), t: true, op: 0.9 }), x, 1.6, z + 0.81, 0, 0, 0, w.dynamic, false); }
  for (let i = 0; i < 6; i++) w.box(70, 0.8, 0.5, 0, 7.2, -7 + i * 2.8, mat('#77746e', { r: 0.8 }), { collide: false });
  const sea = mat('#06121e', { r: 0.05, m: 0.4, env: 2 });
  M(plane(80, 10), sea, 0, -0.2, 14, -Math.PI / 2, 0, 0, w.dynamic, false);
  w.box(80, 0.5, 0.4, 0, -0.3, 9, mat('#77746e', {}), { collide: false }); w.addCollider(-40, 0, 8.9, 40, 1.0, 9.1);
  w.fire(-3, 0, 2, 0.7);
  w.mesh(cyl(0.3, 0.3, 0.9, 12), mat('#7a3a1a', { m: 0.5, r: 0.6 }), -3, 0.45, 2);
  for (let i = 0; i < 3; i++) { const g = G(w.static, 4 + i * 3.4, 0, -2 + (i % 2) * 3.4); M(new THREE.ConeGeometry(1.3, 1.6, 4), mat(['#2a4f8a', '#7a6a2a', '#3a5a3a'][i], { r: 0.9 }), 0, 0.8, 0, 0, Math.PI / 4, 0, g); w.addCollider(4 + i * 3.4 - 0.9, 0, -2 + (i % 2) * 3.4 - 0.9, 4 + i * 3.4 + 0.9, 1.4, -2 + (i % 2) * 3.4 + 0.9, { small: true }); }
  for (let i = 0; i < 8; i++) w.mesh(rbox(0.6, 0.4, 0.5, 0.06), mat(rng.pick(['#6b4a30', '#2b2b2b', '#5a5f66']), { r: 0.9 }), rng.range(-10, 12), 0.2, rng.range(-6, 6), 0, rng.next() * 3, 0);
  w.streetLight(-12, -7.2, 0, { color: 0xffa860, intensity: 30, shadow: true });
  w.anchor('scene', -2, 0.5); w.anchor('scene', 5, 1);
  people(w, 'crowd', [[-6, 3], [7, 2.6], [-5, -2]]);
  w.anchor('escape', -45, 0); w.anchor('escape', 45, 0);
  w.anchor('hide', 15, -4); w.anchor('hide', -16, 4);
  w.bounds = { minX: -24, maxX: 24, minZ: -9, maxZ: 8.8 };
  return { carPos: [-16, -4, Math.PI / 2 - 0.2], dark: true };
};

export const LOCATION_NAMES = {
  mustakil: 'Müstakil Ev', benzinlik: 'Benzinlik', meydan: 'Mahalle Meydanı', park: 'Semt Parkı', yolCevirmesi: 'Yol Çevirmesi', otopark: 'Otopark', bakkal: 'Mahalle Bakkalı', kiraathane: 'Kıraathane', market: 'Market', otobusDuragi: 'Otobüs Durağı', trafikIsiklari: 'Trafik Işıkları', siteGirisi: 'Site Girişi', semtPazari: 'Semt Pazarı', apartmanGirisi: 'Apartman Girişi', cikmazSokak: 'Çıkmaz Sokak', eczane: 'Eczane Önü', atm: 'ATM', agaclik: 'Ağaçlık Alan', sanayi: 'Sanayi Sitesi', halisaha: 'Halı Saha', tekel: 'Tekel Bayi', okul: 'Okul Önü', sonDurak: 'Son Durak', otobusIci: 'Otobüs İçi', cayBahcesi: 'Çay Bahçesi', otoYikama: 'Oto Yıkama', hastane: 'Hastane Acil', copKonteyner: 'Çöp Konteynerleri', otoparkGirisi: 'Otopark Girişi', internetKafe: 'İnternet Kafe', kirtasiye: 'Kırtasiye', otostop: 'Otostop Noktası', pazarSokagi: 'Pazar Sokağı', ustGecit: 'Üst Geçit', dugun: 'Sokak Düğünü', sokakArasi: 'Sokak Arası', sahil: 'Sahil Kenarı', kopruAlti: 'Köprü Altı',
};

export function buildLocation(w, key, rng, opts = {}) {
  let info;
  if (key === 'mustakil') info = mustakil(w, rng, opts);
  else info = L[key](w, rng, opts);
  info.key = key; info.name = LOCATION_NAMES[key];
  if (!info.address) info.address = `${rng.pick(DISTRICTS)}, ${rng.pick(STREETS)} ${rng.pick(['Sokak', 'Caddesi', 'Sokağı'])} No:${rng.int(1, 120)}`;
  info.district = rng.pick(DISTRICTS);
  return info;
}
