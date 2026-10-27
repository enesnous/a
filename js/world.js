// Dünya kiti: çarpışma, kapılar, sokak elemanları, mobilyalar, evler, statik birleştirme.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat, boxGeo, rbox, cyl, sph, torus, plane, M, G, ownMat, basic, disposeTree } from './kit.js';
import * as TX from './textures.js';
import { RNG, rayAABB, clamp } from './util.js';
import { createCivilianCar } from './vehicles.js';

export class Door {
  constructor(world, x, z, axis, width, { locked = false, color = '#6b4a30', hinge = 1, label = 'Kapı', front = false, metal = false, height = 2.25, open = false } = {}) {
    this.world = world; this.locked = locked; this.broken = false; this.open = 0; this.target = 0; this.front = front; this.label = label;
    this.axis = axis; this.width = width; this.x = x; this.z = z; this.height = height;
    this.pivot = new THREE.Group();
    // menteşe noktası
    const half = width / 2;
    if (axis === 'x') this.pivot.position.set(x - half * hinge, 0, z); else this.pivot.position.set(x, 0, z - half * hinge);
    world.dynamic.add(this.pivot);
    const dm = mat(color, { r: 0.55, m: metal ? 0.6 : 0 });
    const pw = width - 0.04;
    const panel = new THREE.Group(); this.pivot.add(panel);
    const off = hinge * pw / 2;
    if (axis === 'x') panel.position.x = off; else panel.position.z = off;
    const rotY = axis === 'x' ? 0 : Math.PI / 2;
    const inner = G(panel, 0, 0, 0, rotY);
    M(boxGeo(pw, height - 0.03, 0.06), dm, 0, height / 2, 0, 0, 0, 0, inner);
    const dk = mat(TX.shade(color, -0.25), { r: 0.6 });
    M(boxGeo(pw * 0.7, height * 0.32, 0.075), dk, 0, height * 0.72, 0, 0, 0, 0, inner);
    M(boxGeo(pw * 0.7, height * 0.32, 0.075), dk, 0, height * 0.3, 0, 0, 0, 0, inner);
    const hm = mat('#c9a227', { m: 0.9, r: 0.3 });
    M(boxGeo(0.12, 0.03, 0.12), hm, -hinge * (pw / 2 - 0.1), 1.02, 0, 0, 0, 0, inner);
    if (front) { M(plane(0.18, 0.12), mat(0xffffff, { map: TX.sign(String(1 + Math.floor(Math.random() * 60)), { bg: '#1f3fa8', fg: '#fff', w: 128, h: 80, glow: false }) }), 0, 1.75, 0.04, 0, 0, 0, inner, false); M(sph(0.015, 6, 4), mat('#111', {}), 0, 1.5, 0.04, 0, 0, 0, inner, false); }
    this.panel = panel; this.hinge = hinge;
    const t = 0.08;
    this.col = axis === 'x' ? world.addCollider(x - half, 0, z - t, x + half, height, z + t, { door: this }) : world.addCollider(x - t, 0, z - half, x + t, height, z + half, { door: this });
    world.doors.push(this);
    this.dir = 1;
    if (open) { this.open = this.target = 1; }
  }
  get pos() { return new THREE.Vector3(this.x, 1, this.z); }
  toggle(fromSide = 1) { if (this.locked) return false; this.target = this.target > 0.5 ? 0 : 1; this.dir = fromSide; return true; }
  breach(fromSide = 1) {
    this.locked = false; this.broken = true; this.dir = fromSide; this.target = 1; this.open = 0.25;
    this.pivot.rotation.z = 0.04;
  }
  update(dt) {
    const sp = this.broken ? 9 : 3.5;
    this.open += Math.sign(this.target - this.open) * Math.min(Math.abs(this.target - this.open), dt * sp);
    const ang = this.open * (this.broken ? 1.75 : 1.5) * this.dir * -this.hinge;
    this.pivot.rotation.y = ang;
    this.col.on = this.open < 0.3;
  }
}

export class World {
  constructor(scene, seed = 1) {
    this.scene = scene; this.rng = new RNG(seed);
    this.root = new THREE.Group(); scene.add(this.root);
    this.static = new THREE.Group(); this.root.add(this.static);
    this.dynamic = new THREE.Group(); this.root.add(this.dynamic);
    this.colliders = []; this.ramps = []; this.doors = []; this.interactables = []; this.updaters = []; this.lights = [];
    this.anchors = {}; this.mapShapes = []; this.bounds = { minX: -30, maxX: 30, minZ: -30, maxZ: 30 };
    this.budget = { point: 12, spot: 5, spotShadow: 1 };
    this.noise = []; // ortam ses kaynakları
    this.puddles = [];
  }
  addCollider(x1, y1, z1, x2, y2, z2, o = {}) {
    const c = { min: [Math.min(x1, x2), Math.min(y1, y2), Math.min(z1, z2)], max: [Math.max(x1, x2), Math.max(y1, y2), Math.max(z1, z2)], on: true, small: !!o.small, door: o.door || null, tag: o.tag || null };
    this.colliders.push(c); return c;
  }
  // y = alt yükseklik
  box(w, h, d, x, y, z, material, o = {}) {
    const { collide = true, rotY = 0, cast = true, parent = this.static, map = null, uvs = 0, small = false, recv = true } = o;
    const m = new THREE.Mesh(boxGeo(w, h, d, uvs), material);
    m.position.set(x, y + h / 2, z); m.rotation.y = rotY; m.castShadow = cast; m.receiveShadow = recv;
    parent.add(m);
    const c = Math.abs(Math.cos(rotY)), s = Math.abs(Math.sin(rotY));
    const hw = (w * c + d * s) / 2, hd = (w * s + d * c) / 2;
    if (collide) this.addCollider(x - hw, y, z - hd, x + hw, y + h, z + hd, { small });
    if (map) this.mapShapes.push({ x, z, w: hw * 2, d: hd * 2, c: map });
    return m;
  }
  mesh(geo, material, x, y, z, rx = 0, ry = 0, rz = 0, parent = this.static, cast = true) { return M(geo, material, x, y, z, rx, ry, rz, parent, cast); }
  ramp(x1, z1, x2, z2, h1, h2, axis) { this.ramps.push({ x1: Math.min(x1, x2), x2: Math.max(x1, x2), z1: Math.min(z1, z2), z2: Math.max(z1, z2), h1, h2, axis, ax1: axis === 'x' ? x1 : z1, ax2: axis === 'x' ? x2 : z2 }); }
  heightAt(x, z, y, step = 0.5) {
    let h = 0;
    for (const c of this.colliders) {
      if (!c.on) continue;
      if (x >= c.min[0] && x <= c.max[0] && z >= c.min[2] && z <= c.max[2] && c.max[1] <= y + step && c.max[1] > h) h = c.max[1];
    }
    for (const r of this.ramps) {
      if (x >= r.x1 && x <= r.x2 && z >= r.z1 && z <= r.z2) {
        const v = r.axis === 'x' ? x : z; const t = clamp((v - r.ax1) / (r.ax2 - r.ax1), 0, 1); const rh = r.h1 + (r.h2 - r.h1) * t;
        if (rh <= y + step + 0.35 && rh > h) h = rh;
      }
    }
    return h;
  }
  // Silindir karakteri dışarı it
  collide(p, r = 0.36, hgt = 1.7, step = 0.5) {
    for (let pass = 0; pass < 2; pass++) for (const c of this.colliders) {
      if (!c.on) continue;
      if (c.max[1] <= p.y + step || c.min[1] >= p.y + hgt) continue;
      const cx = clamp(p.x, c.min[0], c.max[0]), cz = clamp(p.z, c.min[2], c.max[2]);
      let dx = p.x - cx, dz = p.z - cz; const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 < 1e-8) { // merkez içeride: en yakın kenara it
        const l = p.x - c.min[0], rr = c.max[0] - p.x, f = p.z - c.min[2], b = c.max[2] - p.z, m = Math.min(l, rr, f, b);
        if (m === l) p.x = c.min[0] - r; else if (m === rr) p.x = c.max[0] + r; else if (m === f) p.z = c.min[2] - r; else p.z = c.max[2] + r;
      } else { const d = Math.sqrt(d2); p.x = cx + dx / d * r; p.z = cz + dz / d * r; }
    }
  }
  raycast(o, d, maxT, { ignoreSmall = false } = {}) {
    let best = maxT, hit = null;
    for (const c of this.colliders) {
      if (!c.on || (ignoreSmall && c.small)) continue;
      const t = rayAABB(o.x, o.y, o.z, d.x, d.y, d.z, c, best);
      if (t >= 0 && t < best) { best = t; hit = c; }
    }
    if (o.y + d.y * best < 0 && d.y < 0) { const tg = -o.y / d.y; if (tg < best) { best = tg; hit = { ground: true }; } }
    return hit ? { t: best, c: hit } : null;
  }
  los(a, b) {
    const d = new THREE.Vector3().subVectors(b, a); const L = d.length(); d.divideScalar(L);
    return !this.raycast(a, d, L - 0.3, { ignoreSmall: true });
  }
  pointLight(x, y, z, color, intensity, dist = 12, parent = this.dynamic) {
    if (this.budget.point <= 0) return null;
    this.budget.point--;
    const l = new THREE.PointLight(color, intensity, dist, 2); l.position.set(x, y, z); parent.add(l); this.lights.push(l); return l;
  }
  spotLight(x, y, z, tx, ty, tz, color, intensity, dist = 20, angle = 0.8, shadow = false) {
    if (this.budget.spot <= 0) return null;
    this.budget.spot--;
    const l = new THREE.SpotLight(color, intensity, dist, angle, 0.65, 1.7); l.position.set(x, y, z); l.target.position.set(tx, ty, tz);
    if (shadow && this.budget.spotShadow > 0) { this.budget.spotShadow--; l.castShadow = true; l.shadow.mapSize.set(1024, 1024); l.shadow.bias = -0.0004; l.shadow.camera.near = 0.5; l.shadow.camera.far = dist; }
    this.dynamic.add(l); this.dynamic.add(l.target); this.lights.push(l); return l;
  }
  glow(x, y, z, color, size = 1, op = 0.5) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.radial(color), color: 0xffffff, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.position.set(x, y, z); sp.scale.set(size, size, size); this.dynamic.add(sp); return sp;
  }
  anchor(name, x, z, y = 0) { (this.anchors[name] ||= []).push(new THREE.Vector3(x, y, z)); }
  a(name, i = 0) { const l = this.anchors[name]; if (!l || !l.length) return null; return l[Math.min(i, l.length - 1)].clone(); }
  interact(o) { this.interactables.push(Object.assign({ enabled: () => true, radius: 1.6 }, o)); }

  // ---------- Sokak elemanları ----------
  ground(size = 160, kind = 'asphalt') {
    const A = TX.asphalt();
    const m = new THREE.MeshStandardMaterial({ map: A.map, roughnessMap: A.roughnessMap, normalMap: A.normalMap, roughness: 1, metalness: 0.05, envMapIntensity: 1.3 });
    m.normalScale.set(0.8, 0.8);
    for (const t of [A.map, A.roughnessMap, A.normalMap]) t.repeat.set(size / 9, size / 9);
    const g = new THREE.Mesh(new THREE.PlaneGeometry(size, size), m); g.rotation.x = -Math.PI / 2; g.receiveShadow = true;
    this.dynamic.add(g); this.groundMesh = g;
    return g;
  }
  puddle(x, z, sx, sz, rot = 0) {
    const m = mat('#08090b', { r: 0.02, m: 0.2, t: true, op: 0.72, map: TX.blob(Math.floor(Math.abs(x * 7 + z * 13)) % 5 + 1), env: 2 });
    m.alphaMap = m.map; m.map = null; m.polygonOffset = true; m.polygonOffsetFactor = -1;
    const p = M(plane(sx, sz), m, x, 0.012, z, -Math.PI / 2, 0, rot, this.dynamic, false); p.receiveShadow = true;
    return p;
  }
  road(x, z, w, l, axis = 'x', { lines = true, crossing = null } = {}) {
    this.mapShapes.push({ x, z, w: axis === 'x' ? l : w, d: axis === 'x' ? w : l, c: '#2c3038' });
    if (!lines) return;
    const lm = mat('#e8e8e2', { r: 0.6, e: '#e8e8e2', ei: 0.04 });
    const n = Math.floor(l / 4);
    for (let i = 0; i < n; i++) {
      const o = -l / 2 + 2 + i * 4;
      if (axis === 'x') M(plane(2, 0.14), lm, x + o, 0.011, z, -Math.PI / 2, 0, 0, this.static, false);
      else M(plane(0.14, 2), lm, x, 0.011, z + o, -Math.PI / 2, 0, 0, this.static, false);
    }
    for (const s of [-1, 1]) {
      if (axis === 'x') M(plane(l, 0.12), lm, x, 0.011, z + s * (w / 2 - 0.3), -Math.PI / 2, 0, 0, this.static, false);
      else M(plane(0.12, l), lm, x + s * (w / 2 - 0.3), 0.011, z, -Math.PI / 2, 0, 0, this.static, false);
    }
    if (crossing !== null) {
      for (let i = 0; i < 7; i++) {
        const o = -w / 2 + 0.8 + i * (w - 1.6) / 6;
        if (axis === 'x') M(plane(2.6, 0.5), lm, crossing, 0.012, z + o, -Math.PI / 2, 0, 0, this.static, false);
        else M(plane(0.5, 2.6), lm, x + o, 0.012, crossing, -Math.PI / 2, 0, 0, this.static, false);
      }
    }
  }
  sidewalk(x, z, w, d, h = 0.16, color = '#8d8a84') {
    const T = TX.concreteTiles(color);
    const m = mat(0xffffff, { map: T.map, nm: T.normalMap, r: 0.55, env: 1.0 });
    const mm = new THREE.Mesh(boxGeo(w, h, d, 1.6), m); mm.position.set(x, h / 2, z); mm.receiveShadow = true; this.static.add(mm);
    this.addCollider(x - w / 2, 0, z - d / 2, x + w / 2, h, z + d / 2, { small: true });
    // kaldırım taşı
    const curb = mat('#b9b6ae', { r: 0.6 });
    this.mapShapes.push({ x, z, w, d, c: '#5d6068' });
    return mm;
  }
  curbLine(x, z, l, axis) { const curb = mat('#b5b1a8', { r: 0.6 }); if (axis === 'x') this.box(l, 0.17, 0.18, x, 0, z, curb, { collide: false, cast: false }); else this.box(0.18, 0.17, l, x, 0, z, curb, { collide: false, cast: false }); }
  streetLight(x, z, ry = 0, { color = 0xffd6a0, intensity = 55, shadow = false, h = 6.2 } = {}) {
    const pm = mat('#2b2e33', { m: 0.7, r: 0.4 });
    this.mesh(cyl(0.07, 0.11, h, 10), pm, x, h / 2, z);
    this.mesh(cyl(0.16, 0.2, 0.4, 10), pm, x, 0.2, z);
    const ax = Math.sin(ry), az = Math.cos(ry);
    const hx = x + ax * 1.4, hz = z + az * 1.4;
    const arm = this.mesh(boxGeo(0.08, 0.08, 1.5), pm, x + ax * 0.7, h - 0.05, z + az * 0.7, 0, ry, 0);
    this.mesh(rbox(0.36, 0.12, 0.7, 0.04), pm, hx, h - 0.1, hz, 0, ry, 0);
    const c = new THREE.Color(color);
    M(plane(0.28, 0.6), ownMat('#000', { e: c, ei: 7 }), hx, h - 0.165, hz, Math.PI / 2, 0, -ry, this.dynamic, false);
    this.glow(hx, h - 0.3, hz, '#' + c.getHexString(), 2.4, 0.35);
    this.spotLight(hx, h - 0.2, hz, hx, 0, hz, color, intensity, 18, 1.0, shadow);
    this.addCollider(x - 0.12, 0, z - 0.12, x + 0.12, h, z + 0.12, { small: true });
  }
  tree(x, z, s = 1, kind = 0) {
    const tm = mat('#4a3424', { r: 0.9 });
    this.mesh(cyl(0.14 * s, 0.2 * s, 2.4 * s, 8), tm, x, 1.2 * s, z);
    const greens = ['#2f5a2a', '#3a6b31', '#264d24', '#456f2c', '#335f3a'];
    const r = new RNG(Math.floor(x * 17 + z * 31) + 5);
    if (kind === 1) { // çam
      for (let i = 0; i < 4; i++) this.mesh(new THREE.ConeGeometry((1.6 - i * 0.32) * s, 1.4 * s, 7), mat(r.pick(greens), { r: 0.85 }), x, (1.8 + i * 0.9) * s, z);
    } else {
      for (let i = 0; i < 5; i++) {
        const w = r.range(1.4, 2.2) * s;
        this.mesh(rbox(w, w * 0.8, w, 0.25 * s, 2), mat(r.pick(greens), { r: 0.85 }), x + r.range(-0.7, 0.7) * s, (2.6 + r.range(0, 1.4)) * s, z + r.range(-0.7, 0.7) * s, 0, r.next() * 3, 0);
      }
    }
    this.addCollider(x - 0.22 * s, 0, z - 0.22 * s, x + 0.22 * s, 2.4 * s, z + 0.22 * s, { small: true });
    this.mapShapes.push({ x, z, w: 2.4 * s, d: 2.4 * s, c: '#284a26', round: true });
  }
  bench(x, z, ry = 0) {
    const g = G(this.static, x, 0, z, ry);
    const w = mat('#7a4f2c', { r: 0.7 }), ir = mat('#1b1c1f', { m: 0.6, r: 0.4 });
    for (let i = 0; i < 3; i++) M(boxGeo(1.8, 0.05, 0.12), w, 0, 0.46, -0.15 + i * 0.15, 0, 0, 0, g);
    for (let i = 0; i < 2; i++) M(boxGeo(1.8, 0.12, 0.04), w, 0, 0.7 + i * 0.16, -0.27, -0.15, 0, 0, g);
    for (const s of [-0.8, 0.8]) { M(boxGeo(0.06, 0.46, 0.5), ir, s, 0.23, -0.05, 0, 0, 0, g); M(boxGeo(0.06, 0.45, 0.05), ir, s, 0.7, -0.28, -0.15, 0, 0, g); }
    const c = Math.abs(Math.cos(ry)) > 0.5;
    this.addCollider(x - (c ? 0.9 : 0.3), 0, z - (c ? 0.3 : 0.9), x + (c ? 0.9 : 0.3), 0.5, z + (c ? 0.3 : 0.9), { small: true });
    return g;
  }
  trashcan(x, z) {
    this.mesh(cyl(0.25, 0.22, 0.85, 12), mat('#2d6a4f', { m: 0.4, r: 0.5 }), x, 0.425, z);
    this.mesh(cyl(0.27, 0.27, 0.06, 12), mat('#1b4332', { m: 0.4, r: 0.5 }), x, 0.88, z);
    this.addCollider(x - 0.25, 0, z - 0.25, x + 0.25, 0.9, z + 0.25, { small: true });
  }
  dumpster(x, z, ry = 0, color = '#2b5d34') {
    const g = G(this.static, x, 0, z, ry);
    M(boxGeo(1.9, 1.15, 1.1), mat(color, { m: 0.35, r: 0.55 }), 0, 0.75, 0, 0, 0, 0, g);
    M(boxGeo(1.95, 0.08, 1.15), mat(TX.shade(color, -0.3), { m: 0.4, r: 0.5 }), 0, 1.37, -0.02, -0.08, 0, 0, g);
    for (const [ax, az] of [[-0.8, -0.4], [0.8, -0.4], [-0.8, 0.4], [0.8, 0.4]]) M(cyl(0.08, 0.08, 0.06, 8), mat('#111', {}), ax, 0.1, az, Math.PI / 2, 0, 0, g);
    M(plane(0.6, 0.25), mat(0xffffff, { map: TX.sign('BELEDİYE', { bg: color, fg: '#fff', w: 256, h: 80, glow: false }) }), 0, 0.85, 0.56, 0, 0, 0, g, false);
    const c = Math.abs(Math.cos(ry)) > 0.5;
    this.addCollider(x - (c ? 0.98 : 0.58), 0, z - (c ? 0.58 : 0.98), x + (c ? 0.98 : 0.58), 1.4, z + (c ? 0.58 : 0.98));
  }
  bollard(x, z) { this.mesh(cyl(0.07, 0.08, 0.9, 8), mat('#202226', { m: 0.6, r: 0.4 }), x, 0.45, z); this.mesh(cyl(0.075, 0.075, 0.06, 8), mat('#e8e8e2', { e: '#ffffff', ei: 0.05 }), x, 0.75, z); this.addCollider(x - 0.08, 0, z - 0.08, x + 0.08, 0.9, z + 0.08, { small: true }); }
  cone(x, z) { const g = G(this.static, x, 0, z); M(new THREE.ConeGeometry(0.2, 0.62, 12), mat('#ff5a1f', { r: 0.5 }), 0, 0.35, 0, 0, 0, 0, g); M(boxGeo(0.44, 0.04, 0.44), mat('#ff5a1f', { r: 0.5 }), 0, 0.02, 0, 0, 0, 0, g); M(cyl(0.12, 0.15, 0.1, 12, true), mat('#eef', { e: '#ffffff', ei: 0.4 }), 0, 0.38, 0, 0, 0, 0, g, false); this.addCollider(x - 0.2, 0, z - 0.2, x + 0.2, 0.6, z + 0.2, { small: true }); }
  barrier(x, z, ry = 0) {
    const g = G(this.static, x, 0, z, ry);
    for (const s of [-0.9, 0.9]) M(boxGeo(0.08, 1.0, 0.5), mat('#ddd', {}), s, 0.5, 0, 0, 0, 0, g);
    for (let i = 0; i < 6; i++) M(boxGeo(0.3, 0.25, 0.05), mat(i % 2 ? '#e8e8e2' : '#d01c1c', { r: 0.5, e: i % 2 ? '#ffffff' : '#ff2020', ei: 0.05 }), -0.75 + i * 0.3, 0.8, 0, 0, 0, 0, g);
    const c = Math.abs(Math.cos(ry)) > 0.5;
    this.addCollider(x - (c ? 1 : 0.25), 0, z - (c ? 0.25 : 1), x + (c ? 1 : 0.25), 1, z + (c ? 0.25 : 1), { small: true });
    const l = ownMat('#ff8a00', { e: '#ff8a00', ei: 0 }); M(sph(0.06, 8, 6), l, 0.9, 1.05, 0, 0, 0, 0, g, false);
    this.updaters.push((dt, t) => { l.emissiveIntensity = Math.sin(t * 6) > 0 ? 8 : 0; });
  }
  fence(x1, z1, x2, z2, kind = 'iron', h = 1.2, color = '#1d1f22') {
    const axis = Math.abs(x2 - x1) > Math.abs(z2 - z1) ? 'x' : 'z';
    const L = axis === 'x' ? Math.abs(x2 - x1) : Math.abs(z2 - z1);
    const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
    const m = mat(color, { m: kind === 'iron' ? 0.6 : 0, r: kind === 'iron' ? 0.4 : 0.8 });
    if (kind === 'hedge') { this.box(axis === 'x' ? L : 0.7, h, axis === 'x' ? 0.7 : L, cx, 0, cz, mat('#2c5a2a', { r: 0.9 }), { map: '#2c4a2a' }); return; }
    if (kind === 'wall') { this.box(axis === 'x' ? L : 0.25, h, axis === 'x' ? 0.25 : L, cx, 0, cz, mat(color, { r: 0.85 }), { map: '#4b4e55' }); this.box(axis === 'x' ? L : 0.32, 0.08, axis === 'x' ? 0.32 : 0.32 + 0 * L + (axis === 'x' ? 0 : L - 0.32), cx, h, cz, mat('#9a968e', {}), { collide: false }); return; }
    const n = Math.max(2, Math.floor(L / (kind === 'wood' ? 0.18 : 0.15)));
    const g = G(this.static, cx, 0, cz, axis === 'x' ? 0 : Math.PI / 2);
    for (let i = 0; i <= n; i++) {
      const o = -L / 2 + i * L / n;
      if (kind === 'wood') M(boxGeo(0.1, h, 0.03), m, o, h / 2, 0, 0, 0, 0, g);
      else M(boxGeo(0.025, h, 0.025), m, o, h / 2, 0, 0, 0, 0, g);
    }
    M(boxGeo(L, 0.06, 0.05), m, 0, h - 0.1, 0, 0, 0, 0, g); M(boxGeo(L, 0.06, 0.05), m, 0, 0.2, 0, 0, 0, 0, g);
    if (axis === 'x') this.addCollider(Math.min(x1, x2), 0, cz - 0.06, Math.max(x1, x2), h, cz + 0.06); else this.addCollider(cx - 0.06, 0, Math.min(z1, z2), cx + 0.06, h, Math.max(z1, z2));
    this.mapShapes.push({ x: cx, z: cz, w: axis === 'x' ? L : 0.15, d: axis === 'x' ? 0.15 : L, c: '#6a6e76' });
  }
  // Bina (cepheli). front: hangi yöne bakıyor ('-z','+z','-x','+x')
  building(x, z, w, d, floors = 4, { color = null, seed = 1, shop = null, roofDetail = true, style = 0, brick = false, y0 = 0 } = {}) {
    const r = new RNG(seed);
    const col = color || r.pick(['#b8a48a', '#c9b79c', '#9fa7a8', '#c7a07a', '#d8cfc0', '#a88d76', '#c2c6b8', '#e0c9a6', '#b5776a', '#8e9aa6']);
    const H = floors * 3;
    const F = TX.facade(col, floors, Math.max(2, Math.round(w / 2.6)), seed, style);
    const Fd = TX.facade(col, floors, Math.max(2, Math.round(d / 2.6)), seed + 1, style);
    const fm = mat(0xffffff, { map: F.map, em: F.emissiveMap, ei: 1.3, r: 0.8 });
    const fmd = mat(0xffffff, { map: Fd.map, em: Fd.emissiveMap, ei: 1.3, r: 0.8 });
    const top = mat(TX.shade(col, -0.45), { r: 0.9 });
    const mesh = new THREE.Mesh(boxGeo(w, H, d), [fmd, fmd, top, top, fm, fm]);
    mesh.position.set(x, y0 + H / 2, z); mesh.castShadow = true; mesh.receiveShadow = true; this.static.add(mesh);
    this.addCollider(x - w / 2, y0, z - d / 2, x + w / 2, y0 + H, z + d / 2);
    if (!y0) this.mapShapes.push({ x, z, w, d, c: '#3f434c' });
    const T = y0 + H;
    this.box(w + 0.3, 0.3, d + 0.3, x, T, z, mat(TX.shade(col, -0.25), { r: 0.8 }), { collide: false });
    if (roofDetail) {
      this.box(1.2, 1.4, 1.2, x + r.range(-w / 3, w / 3), T + 0.3, z + r.range(-d / 3, d / 3), mat('#8a8f96', { m: 0.5, r: 0.5 }), { collide: false });
      for (let i = 0; i < 2; i++) this.mesh(cyl(0.5, 0.5, 1.2, 12), mat('#d8d8d0', { r: 0.6 }), x + r.range(-w / 3, w / 3), T + 0.9, z + r.range(-d / 3, d / 3));
      this.mesh(cyl(0.01, 0.01, 2, 4), mat('#444', {}), x + w / 3, T + 1.3, z);
      this.mesh(boxGeo(0.8, 0.02, 0.02), mat('#444', {}), x + w / 3, T + 1.9, z);
    }
    return mesh;
  }
  // Dükkan cephesi (+z veya -z yönünde) – tabela, vitrin, tente
  shopfront(x, z, w, facing, name, { signBg = '#0f1a2b', signFg = '#ffffff', awning = null, glow = '#ffe2b0', cross = false, open = true } = {}) {
    const s = facing; // +1: vitrin +z'ye bakıyor, -1: -z'ye
    const signTex = TX.sign(name, { bg: signBg, fg: signFg, w: 1024, h: 160, size: 0.6 });
    const sm = ownMat('#000', { em: signTex, e: '#ffffff', ei: 2.2 });
    const ry = s > 0 ? 0 : Math.PI;
    this.box(w, 0.9, 0.3, x, 3.0, z + s * 0.15, mat('#15171b', { r: 0.4 }), { collide: false });
    M(plane(w - 0.2, 0.75), sm, x, 3.45, z + s * 0.31, 0, ry, 0, this.dynamic, false);
    this.glow(x, 3.45, z + s * 0.8, signFg, w * 0.8, 0.12);
    if (awning) {
      const stripes = ownMat('#fff', {});
      const c = document.createElement('canvas'); c.width = 128; c.height = 32; const g = c.getContext('2d');
      for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f4f1ea' : awning; g.fillRect(i * 16, 0, 16, 32); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.x = w / 2;
      stripes.map = t; stripes.roughness = 0.8;
      M(boxGeo(w, 0.05, 1.4), stripes, x, 2.65, z + s * 0.75, s * 0.28, 0, 0, this.static);
    }
    if (cross) {
      const cm = ownMat('#000', { e: '#20ff60', ei: 0 });
      const cg = G(this.dynamic, x + w / 2 - 0.2, 3.4, z + s * 0.9);
      M(boxGeo(0.25, 0.75, 0.12), cm, 0, 0, 0, 0, 0, 0, cg, false); M(boxGeo(0.75, 0.25, 0.12), cm, 0, 0, 0, 0, 0, 0, cg, false);
      M(boxGeo(0.06, 0.06, 0.7), mat('#333', {}), 0, 0, -s * 0.4, 0, 0, 0, cg);
      this.updaters.push((dt, t) => { cm.emissiveIntensity = 3 + Math.sin(t * 3) * 2.5; });
      this.pointLight(x + w / 2 - 0.2, 3.4, z + s * 1.4, 0x30ff70, 6, 8);
    }
  }
  car(x, z, ry, kind = null, rng = this.rng) {
    const c = createCivilianCar(rng, kind); c.position.set(x, 0, z); c.rotation.y = ry; this.dynamic.add(c);
    this.carCollider(x, z, ry, c);
    this.mapShapes.push({ x, z, w: Math.abs(Math.cos(ry)) > 0.5 ? 2 : 4.9, d: Math.abs(Math.cos(ry)) > 0.5 ? 4.9 : 2, c: '#6c717c' });
    return c;
  }
  carCollider(x, z, ry, obj, L = 4.9, W = 1.9, H = 1.5) {
    const fx = Math.sin(ry), fz = Math.cos(ry);
    const list = [];
    for (const o of [-L / 3, 0, L / 3]) {
      const cx = x + fx * o, cz = z + fz * o;
      const hw = W / 2 * Math.abs(fz) + L / 6 * Math.abs(fx) + 0.05, hd = W / 2 * Math.abs(fx) + L / 6 * Math.abs(fz) + 0.05;
      list.push(this.addCollider(cx - hw, 0, cz - hd, cx + hw, H, cz + hd, { tag: 'car' }));
    }
    if (obj) obj.userData.colliders = list;
    return list;
  }
  stringLights(points, colors = ['#ffcf6b'], y = 3.2, n = 14, light = true) {
    for (let k = 0; k < points.length - 1; k++) {
      const a = points[k], b = points[k + 1];
      for (let i = 0; i <= n; i++) {
        const t = i / n, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t, yy = y - Math.sin(t * Math.PI) * 0.5;
        const c = colors[(i + k) % colors.length];
        M(sph(0.06, 6, 4), mat('#000000', { e: c, ei: 5 }), x, yy, z, 0, 0, 0, this.static, false);
      }
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      M(cyl(0.008, 0.008, L, 4), mat('#111', {}), (a[0] + b[0]) / 2, y - 0.25, (a[1] + b[1]) / 2, 0, -Math.atan2(b[1] - a[1], b[0] - a[0]), Math.PI / 2, this.static, false);
      if (light && k % 2 === 0) this.pointLight((a[0] + b[0]) / 2, y - 0.6, (a[1] + b[1]) / 2, new THREE.Color(colors[k % colors.length]).getHex(), 10, 9);
    }
  }
  // Duvar (x ekseni boyunca) – açıklıklarla, iki yüzlü malzeme
  wallX(z, x1, x2, h, openings, mA, mB, t = 0.18) {
    const segs = this._segments(x1, x2, openings);
    for (const s of segs) {
      const w = s.b - s.a, cx = (s.a + s.b) / 2;
      const y0 = s.y0 ?? 0, hh = (s.y1 ?? h) - y0;
      if (w < 0.01 || hh < 0.01) continue;
      this.box(w, hh, t / 2, cx, y0, z - t / 4, mA, { collide: false, uvs: 2.5 });
      this.box(w, hh, t / 2, cx, y0, z + t / 4, mB, { collide: false, uvs: 2.5 });
      this.addCollider(s.a, y0, z - t / 2, s.b, y0 + hh, z + t / 2);
    }
    this.mapShapes.push({ x: (x1 + x2) / 2, z, w: x2 - x1, d: 0.25, c: '#c8c2b4' });
  }
  wallZ(x, z1, z2, h, openings, mA, mB, t = 0.18) {
    const segs = this._segments(z1, z2, openings);
    for (const s of segs) {
      const w = s.b - s.a, cz = (s.a + s.b) / 2;
      const y0 = s.y0 ?? 0, hh = (s.y1 ?? h) - y0;
      if (w < 0.01 || hh < 0.01) continue;
      this.box(t / 2, hh, w, x - t / 4, y0, cz, mA, { collide: false, uvs: 2.5 });
      this.box(t / 2, hh, w, x + t / 4, y0, cz, mB, { collide: false, uvs: 2.5 });
      this.addCollider(x - t / 2, y0, s.a, x + t / 2, y0 + hh, s.b);
    }
    this.mapShapes.push({ x, z: (z1 + z2) / 2, w: 0.25, d: z2 - z1, c: '#c8c2b4' });
  }
  _segments(a, b, openings) {
    const ops = (openings || []).slice().sort((p, q) => p.at - q.at);
    const out = []; let cur = a;
    for (const o of ops) {
      const s = o.at - o.w / 2, e = o.at + o.w / 2;
      if (s > cur) out.push({ a: cur, b: s });
      if (o.sill > 0) out.push({ a: s, b: e, y0: 0, y1: o.sill });
      out.push({ a: s, b: e, y0: o.top ?? 2.3, y1: undefined });
      cur = e;
    }
    if (b > cur) out.push({ a: cur, b });
    return out;
  }
  window(axis, x, z, w, sill, top, lit = true) {
    const gm = mat('#9fb6c9', { r: 0.03, m: 0.5, t: true, op: 0.28, env: 1.5 });
    const fm = mat('#e9e6df', { r: 0.6 });
    const h = top - sill;
    if (axis === 'x') { M(plane(w, h), gm, x, sill + h / 2, z, 0, 0, 0, this.static, false); M(plane(w, h), gm, x, sill + h / 2, z, 0, Math.PI, 0, this.static, false); this.box(w + 0.1, 0.06, 0.28, x, sill - 0.06, z, fm, { collide: false }); this.box(0.05, h, 0.1, x, sill, z, fm, { collide: false }); }
    else { M(plane(w, h), gm, x, sill + h / 2, z, 0, Math.PI / 2, 0, this.static, false); M(plane(w, h), gm, x, sill + h / 2, z, 0, -Math.PI / 2, 0, this.static, false); this.box(0.28, 0.06, w + 0.1, x, sill - 0.06, z, fm, { collide: false }); this.box(0.1, h, 0.05, x, sill, z, fm, { collide: false }); }
  }
  ceilingLamp(x, y, z, color = 0xffd9a8, intensity = 9, on = true) {
    this.mesh(cyl(0.01, 0.01, 0.4, 4), mat('#222', {}), x, y - 0.2, z, 0, 0, 0, this.static, false);
    const sh = this.mesh(cyl(0.12, 0.3, 0.22, 14, true), mat('#f2e8d8', { r: 0.6, side: THREE.DoubleSide }), x, y - 0.5, z, 0, 0, 0, this.static, false);
    M(sph(0.08, 10, 8), ownMat('#000', { e: color, ei: on ? 3 : 0 }), x, y - 0.55, z, 0, 0, 0, this.dynamic, false);
    if (on) return this.pointLight(x, y - 0.7, z, color, intensity * 0.45, 9);
    return null;
  }

  // ---------- Mobilyalar ----------
  rug(x, z, w, d, seed = 1) {
    const m = mat(0xffffff, { map: TX.kilim(seed).map, r: 0.95 });
    const r = M(plane(w, d), m, x, 0.02, z, -Math.PI / 2, 0, 0, this.static, false); r.receiveShadow = true;
  }
  sofa(x, z, ry, color, len = 2.2) {
    const g = G(this.static, x, 0, z, ry); const m = mat(color, { r: 0.92 }); const d = mat(TX.shade(color, -0.2), { r: 0.92 });
    M(rbox(len, 0.42, 0.9, 0.06), m, 0, 0.21, 0, 0, 0, 0, g);
    M(rbox(len, 0.55, 0.22, 0.08), m, 0, 0.66, -0.36, 0, 0, 0, g);
    for (const s of [-1, 1]) M(rbox(0.22, 0.6, 0.9, 0.08), d, s * (len / 2 - 0.11), 0.3, 0, 0, 0, 0, g);
    const n = Math.round(len / 0.75);
    for (let i = 0; i < n; i++) M(rbox((len - 0.5) / n - 0.03, 0.14, 0.62, 0.06), d, -len / 2 + 0.25 + (i + 0.5) * (len - 0.5) / n, 0.48, 0.07, 0, 0, 0, g);
    const pc = ['#e9c46a', '#e76f51', '#f4f1ea', '#2a9d8f', '#8338ec'];
    for (let i = 0; i < 2; i++) M(rbox(0.38, 0.36, 0.12, 0.05), mat(pc[((Math.floor(x * 3) + i) % pc.length + pc.length) % pc.length], { r: 0.95 }), (i ? 1 : -1) * (len / 2 - 0.42), 0.68, -0.18, -0.2, 0, i ? 0.15 : -0.15, g);
    this._fcol(x, z, ry, len, 0.9, 0.9);
  }
  armchair(x, z, ry, color) { this.sofa(x, z, ry, color, 1.0); }
  _fcol(x, z, ry, w, d, h, small = true) {
    const c = Math.abs(Math.cos(ry)) > 0.5; const hw = (c ? w : d) / 2, hd = (c ? d : w) / 2;
    this.addCollider(x - hw, 0, z - hd, x + hw, h, z + hd, { small });
  }
  coffeeTable(x, z, ry = 0) {
    const g = G(this.static, x, 0, z, ry); const w = mat('#5a3b22', { r: 0.4 });
    M(rbox(1.1, 0.06, 0.6, 0.02), w, 0, 0.42, 0, 0, 0, 0, g);
    for (const [a, b] of [[-0.48, -0.24], [0.48, -0.24], [-0.48, 0.24], [0.48, 0.24]]) M(boxGeo(0.05, 0.4, 0.05), w, a, 0.2, b, 0, 0, 0, g);
    M(cyl(0.12, 0.08, 0.06, 12), mat('#d8d8d0', { r: 0.3 }), 0.2, 0.48, 0, 0, 0, 0, g);
    for (let i = 0; i < 3; i++) M(sph(0.045, 8, 6), mat(['#e63946', '#f1c40f', '#ff8c42'][i], { r: 0.4 }), 0.17 + i * 0.04, 0.53, (i - 1) * 0.04, 0, 0, 0, g);
    M(boxGeo(0.25, 0.02, 0.18), mat('#1d3557', { r: 0.7 }), -0.25, 0.46, 0.05, 0, 0.3, 0, g);
    const tg = G(g, -0.1, 0.45, -0.15); const glass = mat('#a33b12', { t: true, op: 0.85, r: 0.05 });
    M(cyl(0.022, 0.016, 0.03, 10), glass, 0, 0.015, 0, 0, 0, 0, tg, false); M(cyl(0.016, 0.022, 0.03, 10), glass, 0, 0.045, 0, 0, 0, 0, tg, false); M(cyl(0.04, 0.04, 0.006, 12), mat('#d8d8d8', { m: 0.6, r: 0.3 }), 0, 0, 0, 0, 0, 0, tg, false);
    this._fcol(x, z, ry, 1.1, 0.6, 0.45);
  }
  tvUnit(x, z, ry, seed = 1) {
    const g = G(this.static, x, 0, z, ry);
    M(boxGeo(1.8, 0.5, 0.45), mat('#2b2b2e', { r: 0.4 }), 0, 0.25, 0, 0, 0, 0, g);
    M(boxGeo(1.78, 0.02, 0.01), mat('#c9a227', { m: 0.8 }), 0, 0.38, 0.226, 0, 0, 0, g);
    M(boxGeo(1.3, 0.76, 0.06), mat('#0b0b0c', { r: 0.2, m: 0.4 }), 0, 0.98, -0.05, 0, 0, 0, g);
    const scr = M(plane(1.24, 0.7), ownMat('#000', { em: TX.screen('tv', seed), e: '#ffffff', ei: 1.4 }), 0, 0.98, -0.017, 0, 0, 0, this.dynamic, false);
    g.updateMatrixWorld(true); scr.applyMatrix4(g.matrixWorld);
    M(boxGeo(0.3, 0.04, 0.2), mat('#111', {}), 0, 0.52, -0.05, 0, 0, 0, g);
    M(boxGeo(0.12, 0.3, 0.12), mat('#3a3a3a', { r: 0.4 }), 0.75, 0.65, 0, 0, 0, 0, g);
    this.pointLight(x + Math.sin(ry) * 0.6, 1.0, z + Math.cos(ry) * 0.6, 0x7fb0ff, 2.5, 5);
    this._fcol(x, z, ry, 1.8, 0.45, 0.5);
  }
  bookshelf(x, z, ry, seed = 1) {
    const g = G(this.static, x, 0, z, ry);
    const w = mat('#4a3020', { r: 0.6 });
    M(boxGeo(1.2, 2.0, 0.38), w, 0, 1.0, 0, 0, 0, 0, g);
    M(plane(1.1, 1.85), mat(0xffffff, { map: TX.books(seed), r: 0.8 }), 0, 1.0, 0.195, 0, 0, 0, g, false);
    M(rbox(0.2, 0.25, 0.2, 0.05), mat('#2a9d8f', { r: 0.4 }), 0.3, 2.13, 0, 0, 0, 0, g);
    this._fcol(x, z, ry, 1.2, 0.38, 2.0, false);
  }
  plant(x, z, s = 1) {
    this.mesh(cyl(0.18 * s, 0.14 * s, 0.38 * s, 12), mat(this.rng.pick(['#b5523b', '#e8e2d6', '#2b2b2e', '#d9a441']), { r: 0.6 }), x, 0.19 * s, z);
    const gm = ['#2f6b2f', '#3d8b3d', '#285c3a'];
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; this.mesh(boxGeo(0.08 * s, 0.6 * s, 0.25 * s), mat(gm[i % 3], { r: 0.7 }), x + Math.cos(a) * 0.08 * s, 0.6 * s, z + Math.sin(a) * 0.08 * s, Math.cos(a) * 0.4, a, Math.sin(a) * 0.4); }
    this.addCollider(x - 0.18, 0, z - 0.18, x + 0.18, 0.4, z + 0.18, { small: true });
  }
  floorLamp(x, z, on = true) {
    this.mesh(cyl(0.15, 0.18, 0.04, 12), mat('#222', { m: 0.6 }), x, 0.02, z);
    this.mesh(cyl(0.015, 0.015, 1.55, 6), mat('#c9a227', { m: 0.8, r: 0.3 }), x, 0.8, z);
    this.mesh(cyl(0.16, 0.24, 0.3, 14, true), mat('#f4e8d0', { r: 0.6, side: THREE.DoubleSide, e: '#ffcc88', ei: on ? 0.5 : 0 }), x, 1.62, z, 0, 0, 0, this.static, false);
    if (on) this.pointLight(x, 1.5, z, 0xffc27a, 1.6, 5);
  }
  frame(axis, x, y, z, seed, s = 1, facing = 1) {
    const ry = axis === 'x' ? (facing > 0 ? 0 : Math.PI) : (facing > 0 ? Math.PI / 2 : -Math.PI / 2);
    const g = G(this.static, x, y, z, ry);
    M(boxGeo(0.9 * s, 0.7 * s, 0.04), mat('#c9a227', { m: 0.6, r: 0.4 }), 0, 0, 0, 0, 0, 0, g, false);
    M(plane(0.8 * s, 0.6 * s), mat(0xffffff, { map: TX.painting(seed), r: 0.8 }), 0, 0, 0.022, 0, 0, 0, g, false);
  }
  bed(x, z, ry, color, single = false) {
    const g = G(this.static, x, 0, z, ry); const W = single ? 1.0 : 1.7;
    M(boxGeo(W + 0.1, 0.35, 2.1), mat('#5a3b22', { r: 0.6 }), 0, 0.17, 0, 0, 0, 0, g);
    M(boxGeo(W + 0.1, 1.0, 0.08), mat('#4a3020', { r: 0.6 }), 0, 0.5, -1.05, 0, 0, 0, g);
    M(rbox(W, 0.22, 2.0, 0.06), mat('#f2efe8', { r: 0.95 }), 0, 0.45, 0, 0, 0, 0, g);
    M(rbox(W + 0.04, 0.1, 1.4, 0.04), mat(color, { r: 0.95 }), 0, 0.58, 0.3, 0, 0, 0, g);
    for (let i = 0; i < (single ? 1 : 2); i++) M(rbox(single ? 0.6 : 0.65, 0.16, 0.38, 0.06), mat('#ffffff', { r: 0.95 }), single ? 0 : (i ? 0.4 : -0.4), 0.64, -0.75, 0, 0, 0, g);
    this._fcol(x, z, ry, W + 0.1, 2.1, 0.6);
  }
  wardrobe(x, z, ry, color = '#6b4a30') {
    const g = G(this.static, x, 0, z, ry); const m = mat(color, { r: 0.55 });
    M(boxGeo(1.6, 2.2, 0.6), m, 0, 1.1, 0, 0, 0, 0, g);
    M(boxGeo(0.01, 2.1, 0.01), mat('#111', {}), 0, 1.1, 0.305, 0, 0, 0, g, false);
    for (const s of [-1, 1]) M(boxGeo(0.03, 0.25, 0.04), mat('#c9a227', { m: 0.9, r: 0.3 }), s * 0.08, 1.1, 0.32, 0, 0, 0, g, false);
    M(plane(0.6, 1.6), mat('#9fb3c8', { m: 1, r: 0.05 }), -0.4, 1.2, 0.305, 0, 0, 0, g, false);
    this._fcol(x, z, ry, 1.6, 0.6, 2.2, false);
  }
  nightstand(x, z, ry, lamp = true) {
    const g = G(this.static, x, 0, z, ry);
    M(boxGeo(0.45, 0.5, 0.4), mat('#5a3b22', { r: 0.5 }), 0, 0.25, 0, 0, 0, 0, g);
    M(boxGeo(0.06, 0.02, 0.02), mat('#c9a227', { m: 0.9 }), 0, 0.35, 0.205, 0, 0, 0, g, false);
    if (lamp) { M(cyl(0.05, 0.08, 0.2, 10), mat('#d8d0c0', {}), 0, 0.6, 0, 0, 0, 0, g); M(cyl(0.1, 0.15, 0.18, 12, true), ownMat('#f4e8d0', { e: '#ffcc88', ei: 1.2, side: THREE.DoubleSide }), 0, 0.78, 0, 0, 0, 0, g, false); }
    this._fcol(x, z, ry, 0.45, 0.4, 0.5);
  }
  kitchen(x1, z1, x2, z2, color, upper = true) {
    // x1..x2 boyunca, z1 duvarına dayalı tezgah
    const L = x2 - x1, cx = (x1 + x2) / 2, dz = z2 > z1 ? 1 : -1;
    const g = G(this.static, cx, 0, z1 + dz * 0.32, dz > 0 ? 0 : Math.PI);
    const cab = mat(color, { r: 0.45 }), top = mat('#d8d4cc', { r: 0.25, m: 0.1 });
    M(boxGeo(L, 0.86, 0.6), cab, 0, 0.43, 0, 0, 0, 0, g);
    M(boxGeo(L + 0.04, 0.05, 0.64), top, 0, 0.885, 0.01, 0, 0, 0, g);
    for (let i = 0; i < Math.floor(L / 0.6); i++) { M(boxGeo(0.56, 0.78, 0.01), mat(TX.shade(color, 0.1), { r: 0.45 }), -L / 2 + 0.3 + i * 0.6, 0.43, 0.305, 0, 0, 0, g, false); M(boxGeo(0.1, 0.02, 0.03), mat('#9aa0a8', { m: 1 }), -L / 2 + 0.3 + i * 0.6, 0.75, 0.32, 0, 0, 0, g, false); }
    // üst dolaplar
    if (upper) { M(boxGeo(L, 0.7, 0.35), cab, 0, 1.95, -0.12, 0, 0, 0, g); M(boxGeo(L, 0.02, 0.3), ownMat('#000', { e: '#fff4dd', ei: 2 }), 0, 1.59, -0.1, 0, 0, 0, g, false); }
    // ocak & lavabo
    M(boxGeo(0.6, 0.02, 0.5), mat('#111', { r: 0.2, m: 0.3 }), L / 2 - 0.6, 0.92, 0, 0, 0, 0, g);
    for (const [a, b] of [[-0.14, -0.12], [0.14, -0.12], [-0.14, 0.12], [0.14, 0.12]]) M(torus(0.07, 0.01, 6, 14), mat('#333', { m: 0.6 }), L / 2 - 0.6 + a, 0.935, b, Math.PI / 2, 0, 0, g, false);
    M(boxGeo(0.5, 0.04, 0.38), mat('#c9ced6', { m: 1, r: 0.2 }), -L / 2 + 0.7, 0.9, 0, 0, 0, 0, g);
    M(cyl(0.015, 0.015, 0.3, 6), mat('#c9ced6', { m: 1, r: 0.2 }), -L / 2 + 0.7, 1.05, -0.2, 0, 0, 0, g);
    // çaydanlık (Türk usulü ikili)
    M(cyl(0.11, 0.12, 0.2, 14), mat('#c9ced6', { m: 1, r: 0.2 }), L / 2 - 0.74, 1.03, -0.12, 0, 0, 0, g);
    M(cyl(0.08, 0.1, 0.16, 14), mat('#c9ced6', { m: 1, r: 0.2 }), L / 2 - 0.74, 1.21, -0.12, 0, 0, 0, g);
    M(rbox(0.3, 0.2, 0.25, 0.04), mat('#e63946', { r: 0.4 }), 0, 1.0, -0.1, 0, 0, 0, g);
    if (dz > 0) this.addCollider(x1, 0, z1, x2, 0.9, z1 + 0.64, { small: true }); else this.addCollider(x1, 0, z1 - 0.64, x2, 0.9, z1, { small: true });
  }
  fridge(x, z, ry, color = '#e8e8e8') {
    const g = G(this.static, x, 0, z, ry);
    M(rbox(0.75, 1.9, 0.7, 0.04), mat(color, { r: 0.3, m: 0.3 }), 0, 0.95, 0, 0, 0, 0, g);
    M(boxGeo(0.7, 0.01, 0.02), mat('#888', {}), 0, 1.3, 0.355, 0, 0, 0, g, false);
    M(boxGeo(0.03, 0.4, 0.04), mat('#bbb', { m: 1 }), 0.3, 1.55, 0.37, 0, 0, 0, g, false);
    for (let i = 0; i < 4; i++) M(boxGeo(0.08, 0.08, 0.01), mat(['#e63946', '#f1c40f', '#2a9d8f', '#3a86ff'][i], {}), -0.2 + i * 0.1, 1.6 + (i % 2) * 0.12, 0.357, 0, 0, 0, g, false);
    this._fcol(x, z, ry, 0.75, 0.7, 1.9, false);
  }
  diningSet(x, z, color = '#7a4f2c', chairs = 4) {
    const w = mat(color, { r: 0.5 });
    this.mesh(rbox(1.5, 0.06, 0.9, 0.02), w, x, 0.76, z);
    for (const [a, b] of [[-0.68, -0.38], [0.68, -0.38], [-0.68, 0.38], [0.68, 0.38]]) this.mesh(boxGeo(0.06, 0.74, 0.06), w, x + a, 0.37, z + b);
    this.mesh(plane(1.3, 0.75), mat(0xffffff, { map: TX.kilim(Math.floor(x * 10) % 7).map, r: 0.9 }), x, 0.795, z, -Math.PI / 2, 0, 0, this.static, false);
    this.mesh(cyl(0.14, 0.1, 0.08, 12), mat('#e9e6df', {}), x, 0.84, z);
    for (let i = 0; i < 3; i++) this.mesh(sph(0.05, 8, 6), mat(['#e63946', '#f1c40f', '#7cb518'][i], {}), x - 0.03 + i * 0.03, 0.9, z);
    const pos = [[-0.4, -0.7, 0], [0.4, -0.7, 0], [-0.4, 0.7, Math.PI], [0.4, 0.7, Math.PI], [-1.0, 0, Math.PI / 2], [1.0, 0, -Math.PI / 2]];
    for (let i = 0; i < chairs; i++) this.chair(x + pos[i][0], z + pos[i][1], pos[i][2], color);
    this.addCollider(x - 0.75, 0, z - 0.45, x + 0.75, 0.8, z + 0.45, { small: true });
  }
  chair(x, z, ry, color = '#7a4f2c', plastic = false) {
    const g = G(this.static, x, 0, z, ry); const m = mat(color, { r: plastic ? 0.4 : 0.6 });
    M(boxGeo(0.44, 0.05, 0.44), m, 0, 0.46, 0, 0, 0, 0, g);
    M(boxGeo(0.44, 0.5, 0.05), m, 0, 0.72, -0.2, 0, 0, 0, g);
    for (const [a, b] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) M(boxGeo(0.04, 0.46, 0.04), m, a, 0.23, b, 0, 0, 0, g);
  }
  desk(x, z, ry, pc = true) {
    const g = G(this.static, x, 0, z, ry);
    M(boxGeo(1.4, 0.05, 0.7), mat('#d8cfc0', { r: 0.5 }), 0, 0.75, 0, 0, 0, 0, g);
    for (const s of [-1, 1]) M(boxGeo(0.05, 0.75, 0.66), mat('#888', { m: 0.5 }), s * 0.66, 0.375, 0, 0, 0, 0, g);
    if (pc) {
      M(boxGeo(0.62, 0.38, 0.03), mat('#0b0b0c', { r: 0.3 }), 0, 1.05, -0.2, 0, 0, 0, g);
      const s = M(plane(0.58, 0.34), ownMat('#000', { em: TX.screen('pc', Math.floor(x * 7)), e: '#fff', ei: 1.5 }), 0, 1.05, -0.183, 0, 0, 0, this.dynamic, false);
      g.updateMatrixWorld(true); s.applyMatrix4(g.matrixWorld);
      M(boxGeo(0.45, 0.02, 0.15), mat('#222', {}), 0, 0.78, 0.05, 0, 0, 0, g);
      M(boxGeo(0.2, 0.45, 0.45), mat('#151518', { r: 0.4 }), 0.5, 1.0, -0.05, 0, 0, 0, g);
      M(boxGeo(0.01, 0.3, 0.01), ownMat('#000', { e: '#ff2bd6', ei: 4 }), 0.39, 1.0, 0.18, 0, 0, 0, g, false);
    }
    this.chair(x + Math.sin(ry) * 0.6, z + Math.cos(ry) * 0.6, ry + Math.PI, '#222');
    this._fcol(x, z, ry, 1.4, 0.7, 0.8);
  }
  bathroom(x, z, w, d, sideZ) {
    const tile = TX.floorTiles('#e9f1f5', '#cfe0ea', 6, false);
    this.mesh(rbox(0.75, 0.55, 1.6, 0.08), mat('#f8f8f8', { r: 0.2 }), x - w / 2 + 0.45, 0.28, z, 0, 0, 0);
    this.addCollider(x - w / 2 + 0.07, 0, z - 0.8, x - w / 2 + 0.83, 0.56, z + 0.8, { small: true });
    this.mesh(rbox(0.42, 0.42, 0.55, 0.08), mat('#f8f8f8', { r: 0.2 }), x + w / 2 - 0.35, 0.21, z + d / 2 - 0.5, 0, 0, 0);
    this.mesh(rbox(0.42, 0.4, 0.18, 0.04), mat('#f8f8f8', { r: 0.2 }), x + w / 2 - 0.35, 0.6, z + d / 2 - 0.25, 0, 0, 0);
    this.mesh(rbox(0.5, 0.18, 0.4, 0.06), mat('#f8f8f8', { r: 0.2 }), x + w / 2 - 0.35, 0.85, z - d / 2 + 0.4, 0, 0, 0);
    this.mesh(plane(0.5, 0.7), mat('#b9cadb', { m: 1, r: 0.05 }), x + w / 2 - 0.1, 1.5, z - d / 2 + 0.4, 0, -Math.PI / 2, 0, this.static, false);
  }
  shelfUnit(x, z, ry, kind, seed, len = 2.4, h = 1.9) {
    const g = G(this.static, x, 0, z, ry);
    M(boxGeo(len, h, 0.45), mat('#e8e8e8', { r: 0.4, m: 0.3 }), 0, h / 2, 0, 0, 0, 0, g);
    M(plane(len - 0.08, h - 0.1), mat(0xffffff, { map: TX.shelfGoods(kind, seed), r: 0.6 }), 0, h / 2, 0.23, 0, 0, 0, g, false);
    M(plane(len - 0.08, h - 0.1), mat(0xffffff, { map: TX.shelfGoods(kind, seed + 50), r: 0.6 }), 0, h / 2, -0.23, 0, Math.PI, 0, g, false);
    M(boxGeo(len, 0.3, 0.5), mat('#c8102e', { r: 0.4, e: '#ff2a2a', ei: 0.2 }), 0, h + 0.15, 0, 0, 0, 0, g);
    this._fcol(x, z, ry, len, 0.5, h, false);
  }
  drinkFridge(x, z, ry) {
    const g = G(this.static, x, 0, z, ry);
    M(boxGeo(1.0, 2.0, 0.7), mat('#c8102e', { r: 0.4 }), 0, 1.0, 0, 0, 0, 0, g);
    M(plane(0.86, 1.6), ownMat('#000', { em: TX.shelfGoods('drinks', Math.floor(x * 3) + 9), e: '#ffffff', ei: 1.3 }), 0, 1.05, 0.352, 0, 0, 0, g, false);
    M(plane(0.86, 1.6), mat('#ccddee', { t: true, op: 0.15, r: 0.02, m: 0.3 }), 0, 1.05, 0.358, 0, 0, 0, g, false);
    M(plane(0.8, 0.18), ownMat('#000', { em: TX.sign('SOĞUK İÇECEK', { bg: '#c8102e', fg: '#fff', w: 256, h: 48 }), e: '#fff', ei: 1.5 }), 0, 1.92, 0.352, 0, 0, 0, g, false);
    this._fcol(x, z, ry, 1.0, 0.7, 2.0, false);
  }
  counter(x, z, ry, len = 2.0, register = true) {
    const g = G(this.static, x, 0, z, ry);
    M(boxGeo(len, 1.0, 0.65), mat('#3a3e45', { r: 0.5 }), 0, 0.5, 0, 0, 0, 0, g);
    M(boxGeo(len + 0.05, 0.05, 0.7), mat('#d8d4cc', { r: 0.25 }), 0, 1.02, 0, 0, 0, 0, g);
    if (register) {
      M(boxGeo(0.4, 0.12, 0.35), mat('#1b1c1f', { r: 0.4 }), -len / 4, 1.1, 0, 0, 0, 0, g);
      M(boxGeo(0.3, 0.22, 0.03), mat('#111', {}), -len / 4, 1.3, -0.1, -0.3, 0, 0, g);
      M(plane(0.26, 0.18), ownMat('#000', { e: '#3aff9a', ei: 1.5 }), -len / 4, 1.3, -0.084, -0.3, 0, 0, g, false);
      for (let i = 0; i < 6; i++) M(boxGeo(0.12, 0.2, 0.06), mat(['#e63946', '#f1c40f', '#2a9d8f'][i % 3], {}), len / 4 - 0.3 + i * 0.13, 1.14, 0.2, 0, 0, 0, g);
    }
    this._fcol(x, z, ry, len, 0.65, 1.05, false);
  }
  stall(x, z, ry, color, seed = 1) {
    const g = G(this.static, x, 0, z, ry); const r = new RNG(seed);
    M(boxGeo(2.6, 0.8, 1.2), mat('#6b4a30', { r: 0.8 }), 0, 0.4, 0, 0, 0, 0, g);
    for (const [a, b] of [[-1.25, -0.55], [1.25, -0.55], [-1.25, 0.55], [1.25, 0.55]]) M(cyl(0.03, 0.03, 2.4, 6), mat('#888', { m: 0.6 }), a, 1.2, b, 0, 0, 0, g);
    M(boxGeo(2.9, 0.04, 1.7), mat(color, { r: 0.85, side: THREE.DoubleSide }), 0, 2.4, 0, 0.12, 0, 0, g);
    const prod = ['#e63946', '#ff8c42', '#f1c40f', '#7cb518', '#2a9d8f', '#8338ec', '#c0392b', '#f4a261'];
    for (let i = 0; i < 4; i++) {
      M(boxGeo(0.6, 0.12, 0.5), mat('#8a5a3a', { r: 0.9 }), -0.95 + i * 0.63, 0.86, 0.1, -0.2, 0, 0, g);
      const pc = r.pick(prod);
      for (let k = 0; k < 9; k++) M(sph(0.07, 8, 6), mat(pc, { r: 0.5 }), -1.15 + i * 0.63 + (k % 3) * 0.16, 0.98 + Math.floor(k / 3) * 0.02, -0.05 + Math.floor(k / 3) * 0.15, 0, 0, 0, g, false);
    }
    M(sph(0.08, 8, 6), ownMat('#000', { e: '#ffe7b3', ei: 6 }), 0, 2.25, 0, 0, 0, 0, g, false);
    this._fcol(x, z, ry, 2.6, 1.2, 0.85, false);
  }
  teaTable(x, z, color = '#e8e2d6', chairs = 4) {
    this.mesh(cyl(0.4, 0.4, 0.04, 16), mat(color, { r: 0.5 }), x, 0.72, z);
    this.mesh(cyl(0.04, 0.06, 0.7, 8), mat('#555', { m: 0.6 }), x, 0.36, z);
    const tg = G(this.static, x + 0.1, 0.74, z); const glass = mat('#a33b12', { t: true, op: 0.85, r: 0.05 });
    M(cyl(0.022, 0.016, 0.03, 10), glass, 0, 0.015, 0, 0, 0, 0, tg, false); M(cyl(0.016, 0.022, 0.03, 10), glass, 0, 0.045, 0, 0, 0, 0, tg, false);
    for (let i = 0; i < chairs; i++) { const a = i / chairs * Math.PI * 2; this.chair(x + Math.cos(a) * 0.75, z + Math.sin(a) * 0.75, -a - Math.PI / 2, this.rng.pick(['#e63946', '#2a9d8f', '#f4f1ea', '#3a86ff']), true); }
    this.addCollider(x - 0.4, 0, z - 0.4, x + 0.4, 0.75, z + 0.4, { small: true });
  }
  okeyTable(x, z) {
    this.mesh(boxGeo(1.0, 0.04, 1.0), mat('#1f6f3a', { r: 0.9 }), x, 0.74, z);
    this.mesh(boxGeo(1.04, 0.06, 1.04), mat('#5a3b22', { r: 0.5 }), x, 0.7, z);
    for (const [a, b] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) this.mesh(boxGeo(0.05, 0.7, 0.05), mat('#5a3b22', {}), x + a, 0.35, z + b);
    for (let s = 0; s < 4; s++) { const a = s * Math.PI / 2; this.mesh(boxGeo(0.6, 0.06, 0.08), mat('#d8c39a', { r: 0.6 }), x + Math.cos(a) * 0.4, 0.8, z + Math.sin(a) * 0.4, 0, a + Math.PI / 2, 0); for (let k = 0; k < 7; k++) this.mesh(boxGeo(0.05, 0.07, 0.015), mat('#f4f1ea', { r: 0.4 }), x + Math.cos(a) * 0.36 + Math.cos(a + Math.PI / 2) * (k - 3) * 0.07, 0.86, z + Math.sin(a) * 0.36 + Math.sin(a + Math.PI / 2) * (k - 3) * 0.07, 0, a + Math.PI / 2, 0, this.static, false); }
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; this.chair(x + Math.cos(a) * 0.85, z + Math.sin(a) * 0.85, -a - Math.PI / 2, '#5a3b22'); }
    this.addCollider(x - 0.52, 0, z - 0.52, x + 0.52, 0.8, z + 0.52, { small: true });
  }
  fire(x, y, z, scale = 1) {
    const g = G(this.dynamic, x, y, z);
    const flames = [];
    for (let i = 0; i < 10; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.radial(i % 2 ? '#ffb347' : '#ff5a1f'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffffff }));
      sp.position.set((Math.random() - 0.5) * 0.6 * scale, Math.random() * scale, (Math.random() - 0.5) * 0.6 * scale); sp.scale.setScalar(scale * 0.9);
      g.add(sp); flames.push({ sp, ph: Math.random() * 6, sp0: 0.6 + Math.random() * 0.8 });
    }
    const l = this.pointLight(x, y + 1, z, 0xff7a2a, 25 * scale, 14);
    g.userData.light = l;
    this.updaters.push((dt, t) => {
      if (!g.visible) { if (l) l.intensity = 0; return; }
      for (const f of flames) { f.ph += dt * f.sp0 * 2; const k = f.ph % 1; f.sp.position.y = k * 1.4 * scale; f.sp.scale.setScalar(scale * (1.1 - k) * 1.2); f.sp.material.opacity = 1 - k; }
      if (l) l.intensity = (18 + Math.sin(t * 17) * 5 + Math.sin(t * 31) * 4) * scale;
    });
    return g;
  }

  // ---------- Müstakil ev (30 varyasyon) ----------
  house(seed, ox = 0, oz = 4, opts = {}) {
    const r = new RNG(seed * 97 + 13);
    const W = r.int(11, 14), D = r.int(9, 11), H = 2.85;
    const x0 = ox - W / 2, x1 = ox + W / 2, z0 = oz, z1 = oz + D;
    const extCols = ['#e8d9b8', '#d9b8a0', '#b8c7a6', '#c9d6df', '#e6c48a', '#d4a59a', '#f0e6d8', '#a9b8c9', '#c98f6a', '#e3d3a8', '#b5a8c9', '#d8c3a5'];
    const ext = r.pick(extCols);
    const brick = r.chance(0.3);
    const B = brick ? TX.bricks(r.pick(['#8a4b38', '#9a5a40', '#7a3f30', '#a8654a'])) : TX.plaster(ext);
    const extM = mat(0xffffff, { map: B.map, nm: B.normalMap, r: 0.85 });
    const roomCols = ['#f2e8cf', '#cfe3d8', '#f6d6c8', '#d9e4f5', '#efe0a8', '#e7c6d3', '#c8d8c0', '#f1d8b0', '#bfd7ea', '#e8d5f0', '#f4c7a1', '#a8d5ba', '#ffd6a5', '#cdb4db', '#b8e0d2'];
    const floors = [TX.woodFloor(r.pick(['#8b5a33', '#a0703f', '#6b4226', '#b58552'])), TX.floorTiles(r.pick(['#d8d4cc', '#e9e2d0', '#c9d6df']), r.pick(['#9c968c', '#7a8a96', '#b5523b']), 4, r.chance(0.5)), TX.woodFloor('#c49a6c')];
    const fd = Math.round(D * 0.55 * 2) / 2;
    const zm = z0 + fd;
    const sx = Math.round((x0 + W * r.range(0.52, 0.6)) * 2) / 2;
    const bx1 = Math.round((x0 + W * r.range(0.36, 0.45)) * 2) / 2, bx2 = Math.round((x0 + W * r.range(0.68, 0.76)) * 2) / 2;
    const rooms = {
      salon: { x0, x1: sx, z0, z1: zm }, mutfak: { x0: sx, x1, z0, z1: zm },
      yatak: { x0, x1: bx1, z0: zm, z1 }, banyo: { x0: bx1, x1: bx2, z0: zm, z1 }, oda: { x0: bx2, x1, z0: zm, z1 },
    };
    const RM = {};
    for (const k in rooms) { const c = r.pick(roomCols); const P = TX.plaster(c); RM[k] = mat(0xffffff, { map: P.map, r: 0.9 }); rooms[k].col = c; }
    RM.banyo = mat(0xffffff, { map: TX.floorTiles('#eaf4f8', '#d2e4ee', 4, false).map, r: 0.3 });
    // zeminler
    const floorMesh = (rm, tx) => { const w = rm.x1 - rm.x0, d = rm.z1 - rm.z0; const t = tx.map.clone(); t.needsUpdate = true; t.repeat.set(w / 2.5, d / 2.5); const m = M(plane(w, d), mat(0xffffff, { map: t, r: 0.5, env: 0.6 }), (rm.x0 + rm.x1) / 2, 0.172, (rm.z0 + rm.z1) / 2, -Math.PI / 2, 0, 0, this.static, false); m.receiveShadow = true; };
    this.box(W + 0.2, 0.17, D + 0.2, ox, 0, oz + D / 2, mat('#9a968e', { r: 0.8 }), { collide: true, small: true });
    const fl = r.pick(floors);
    floorMesh(rooms.salon, fl); floorMesh(rooms.mutfak, floors[1]); floorMesh(rooms.yatak, r.pick([floors[0], floors[2]])); floorMesh(rooms.banyo, TX.floorTiles('#e0e8ec', '#b8c8d0', 6, true)); floorMesh(rooms.oda, r.pick(floors));
    const base = 0.17;
    const g = G(this.static, 0, base, 0); // duvarları zemine oturt
    const wallH = H;
    const doorW = 1.0;
    const frontDoorX = Math.round((x0 + 1.4 + r.range(0, Math.max(0.2, (sx - x0) - 3))) * 2) / 2;
    const backDoorX = Math.round((bx2 + 0.8 + r.range(0, Math.max(0.1, x1 - bx2 - 1.8))) * 2) / 2;
    let bathDoorX = bx1 + 0.6; if (Math.abs(bathDoorX - sx) < 0.7) bathDoorX = bx2 - 0.6; if (Math.abs(bathDoorX - sx) < 0.7) bathDoorX = (bx1 + bx2) / 2 + (sx > (bx1 + bx2) / 2 ? -0.9 : 0.9);
    const bedDoorX = (x0 + bx1) / 2, odaDoorX = (bx2 + x1) / 2;
    // Dış duvarlar
    const winTop = 2.2, sill = 0.95;
    const gl = frontDoorX - 0.5 - x0, gr = sx - (frontDoorX + 0.5);
    const salonWinX = gl > gr ? x0 + gl / 2 : frontDoorX + 0.5 + gr / 2;
    const frontOps = [{ at: frontDoorX, w: doorW, sill: 0, top: 2.3 }, { at: (sx + x1) / 2, w: 1.4, sill, top: winTop, win: true }];
    if (Math.max(gl, gr) > 1.7) frontOps.push({ at: salonWinX, w: 1.2, sill, top: winTop, win: true });
    const backOps = [{ at: (x0 + bx1) / 2, w: 1.2, sill, top: winTop, win: true }, { at: backDoorX, w: doorW, sill: 0, top: 2.3 }];
    const leftOps = [{ at: (z0 + zm) / 2 + 1.6, w: 1.0, sill, top: winTop, win: true }, { at: (zm + z1) / 2, w: 1.0, sill, top: winTop, win: true }];
    const rightOps = [{ at: (z0 + zm) / 2 + 0.4, w: 1.0, sill, top: winTop, win: true }];
    this._withBase(base, () => {
      this.wallX(z0, x0, x1, wallH, frontOps, extM, RM.salon);
      this.wallX(z1, x0, x1, wallH, backOps, RM.yatak, extM);
      this.wallZ(x0, z0, z1, wallH, leftOps, extM, RM.salon);
      this.wallZ(x1, z0, z1, wallH, rightOps, RM.mutfak, extM);
      // iç duvarlar
      this.wallZ(sx, z0, zm, wallH, [{ at: zm - 1.0, w: 0.95, sill: 0, top: 2.2 }], RM.salon, RM.mutfak, 0.12);
      this.wallX(zm, x0, sx, wallH, [bedDoorX, bathDoorX, odaDoorX].filter(v => v < sx - 0.5).map(v => ({ at: v, w: v === bathDoorX ? 0.85 : 0.95, sill: 0, top: 2.2 })), RM.salon, RM.yatak, 0.12);
      this.wallX(zm, sx, x1, wallH, [bedDoorX, bathDoorX, odaDoorX].filter(v => v > sx + 0.5).map(v => ({ at: v, w: v === bathDoorX ? 0.85 : 0.95, sill: 0, top: 2.2 })), RM.mutfak, RM.oda, 0.12);
      this.wallZ(bx1, zm, z1, wallH, [], RM.yatak, RM.banyo, 0.12);
      this.wallZ(bx2, zm, z1, wallH, [], RM.banyo, RM.oda, 0.12);
    });
    // pencere camları
    for (const o of frontOps) if (o.win) this.window('x', o.at, z0, o.w, sill + base, winTop + base);
    for (const o of backOps) if (o.win) this.window('x', o.at, z1, o.w, sill + base, winTop + base);
    for (const o of leftOps) this.window('z', x0, o.at, o.w, sill + base, winTop + base);
    for (const o of rightOps) this.window('z', x1, o.at, o.w, sill + base, winTop + base);
    // kapılar
    const doorCol = r.pick(['#6b4a30', '#7a2f2f', '#2f4f7a', '#3a5a3a', '#e8e2d6', '#4a3020']);
    const doors = {};
    doors.front = new Door(this, frontDoorX, z0, 'x', doorW, { locked: !!opts.frontLocked, color: doorCol, label: 'Ön kapı', front: true, height: 2.3 });
    doors.front.pivot.position.y = base;
    doors.back = new Door(this, backDoorX, z1, 'x', doorW, { locked: !!opts.backLocked, color: '#5a3b22', label: 'Arka kapı', height: 2.3 }); doors.back.pivot.position.y = base;
    doors.bath = new Door(this, bathDoorX, zm, 'x', 0.85, { color: '#f0ece4', label: 'Banyo kapısı', height: 2.2, open: r.chance(0.5) }); doors.bath.pivot.position.y = base;
    doors.bed = new Door(this, bedDoorX, zm, 'x', 0.95, { color: '#f0ece4', label: 'Yatak odası kapısı', height: 2.2, open: true }); doors.bed.pivot.position.y = base;
    for (const d of Object.values(doors)) { d.col.min[1] += 0; }
    // tavan ve çatı
    const ceilM = mat('#f4f1ea', { r: 0.9, side: THREE.DoubleSide });
    M(plane(W, D), ceilM, ox, base + wallH, oz + D / 2, Math.PI / 2, 0, 0, this.static, false);
    this.addCollider(x0, base + wallH, z0, x1, base + wallH + 0.2, z1);
    const twoStory = r.chance(0.35);
    let roofBase = base + wallH;
    if (twoStory) {
      const F = TX.facade(ext, 1, Math.round(W / 2.6), seed, 0);
      const fm = mat(0xffffff, { map: F.map, em: F.emissiveMap, ei: 1.2, r: 0.85 });
      const Fs = TX.facade(ext, 1, Math.round(D / 2.6), seed + 3, 0);
      const fs = mat(0xffffff, { map: Fs.map, em: Fs.emissiveMap, ei: 1.2, r: 0.85 });
      const top = mat(TX.shade(ext, -0.3), {});
      const up = new THREE.Mesh(boxGeo(W + 0.18, 2.9, D + 0.18), [fs, fs, top, top, fm, fm]); up.position.set(ox, roofBase + 1.45, oz + D / 2); up.castShadow = true; this.static.add(up);
      roofBase += 2.9;
    }
    this.box(W + 0.5, 0.18, D + 0.5, ox, roofBase, oz + D / 2, mat('#e9e6df', { r: 0.7 }), { collide: false });
    const roofCol = r.pick(['#8e3b2a', '#6b2d1f', '#3b3f46', '#7a4a2a', '#2f3b4f', '#a0522d']);
    const roofKind = r.int(0, 2);
    if (roofKind < 2) {
      const cone = new THREE.ConeGeometry(Math.SQRT1_2 * 1, 1, 4, 1); cone.rotateY(Math.PI / 4);
      const rm = M(cone, mat(roofCol, { r: 0.7 }), ox, roofBase + 0.18 + 1.2, oz + D / 2, 0, 0, 0, this.static);
      rm.scale.set(W + 1.0, 2.4, D + 1.0);
      if (roofKind === 1) { this.mesh(boxGeo(0.7, 1.4, 0.7), mat('#8a4b38', { r: 0.8 }), ox + W / 4, roofBase + 1.6, oz + D / 3); this.mesh(cyl(0.6, 0.6, 0.15, 16), mat('#e8e8e8', { m: 0.5 }), ox - W / 4, roofBase + 1.3, oz + D * 0.6, 0.6, 0, 0); }
    } else {
      this.box(W + 0.5, 0.6, 0.2, ox, roofBase + 0.18, z0 - 0.15, extM, { collide: false }); this.box(W + 0.5, 0.6, 0.2, ox, roofBase + 0.18, z1 + 0.15, extM, { collide: false });
      this.mesh(cyl(0.55, 0.55, 1.1, 14), mat('#d8d8d0', {}), ox + 2, roofBase + 0.8, oz + D / 2, 0, 0, Math.PI / 2);
      this.box(1.4, 0.06, 0.9, ox - 2, roofBase + 0.6, oz + D / 2, mat('#1b2c4a', { r: 0.1, m: 0.7, e: '#0a1a3a', ei: 0.2 }), { collide: false });
    }
    // giriş merdiveni, saçak, kapı lambası
    this.box(1.8, 0.17, 0.9, frontDoorX, 0, z0 - 0.45, mat('#b9b6ae', { r: 0.7 }), { small: true });
    this.box(2.0, 0.08, 1.2, frontDoorX, base + 2.5, z0 - 0.55, mat('#e9e6df', {}), { collide: false });
    const porchOn = !opts.dark || r.chance(0.5);
    M(rbox(0.16, 0.26, 0.12, 0.03), ownMat('#000', { e: '#ffd28a', ei: porchOn ? 6 : 0 }), frontDoorX + 0.8, base + 1.95, z0 - 0.1, 0, 0, 0, this.dynamic, false);
    if (porchOn) this.pointLight(frontDoorX + 0.8, base + 1.9, z0 - 0.6, 0xffc37a, 6, 8);
    // zil/isimlik
    M(plane(0.22, 0.12), mat(0xffffff, { map: TX.sign((opts.family || 'AİLE').toLocaleUpperCase('tr-TR'), { bg: '#c9a227', fg: '#1a1a1a', w: 256, h: 96, glow: false }) }), frontDoorX - 0.75, base + 1.45, z0 - 0.1, 0, Math.PI, 0, this.static, false);
    // --- iç mekan eşyaları ---
    const S = rooms.salon, K = rooms.mutfak, Y = rooms.yatak, BN = rooms.banyo, O = rooms.oda;
    this._withBase(base, () => {
      const sc = r.pick(['#3d5a80', '#9d0208', '#6a994e', '#5e548e', '#bc6c25', '#264653', '#7f5539', '#c1121f', '#495057']);
      const scz = (S.z0 + S.z1) / 2;
      this.tvUnit(S.x0 + 0.35, scz, Math.PI / 2, seed);
      this.rug(S.x0 + 2.4, scz, 2.4, Math.min(3.2, S.z1 - S.z0 - 1.4), seed);
      this.coffeeTable(S.x0 + 2.3, scz, Math.PI / 2);
      this.sofa(S.x0 + 3.7, scz, -Math.PI / 2, sc, Math.min(2.6, S.z1 - S.z0 - 2.2));
      const armC = r.pick(['#e9c46a', '#a8dadc', '#e76f51', '#d4a373']);
      const zmDoors = [bedDoorX, bathDoorX].filter(v => v < sx);
      if (Math.abs(S.x0 + 2.3 - frontDoorX) > 1.5) this.armchair(S.x0 + 2.3, S.z0 + 0.75, 0, armC);
      else if (zmDoors.every(v => Math.abs(S.x0 + 2.3 - v) > 1.5)) this.armchair(S.x0 + 2.3, S.z1 - 0.75, Math.PI, armC);
      if (S.x1 - S.x0 > 5.2) this.bookshelf(S.x1 - 0.3, S.z0 + 1.0, -Math.PI / 2, seed);
      this.plant(S.x0 + 0.4, S.z1 - 0.4, 1.2); this.plant(S.x1 - 0.4, S.z0 + 2.3, 0.9);
      this.floorLamp(S.x0 + 0.45, S.z0 + 0.5, !opts.dark);
      this.frame('z', S.x0 + 0.1, 1.95, scz, seed, 1.2, 1);
      this.frame('z', S.x1 - 0.1, 1.7, S.z0 + 2.6, seed + 3, 1, -1);
      // mutfak
      const kc = r.pick(['#e8e2d6', '#3d5a80', '#a3b18a', '#c1121f', '#f4f1ea', '#6d6875', '#2a9d8f']);
      this.kitchen(K.x0 + 0.3, K.z0, K.x1 - 0.95, K.z1, kc, false);
      this.fridge(K.x1 - 0.45, K.z0 + 0.45, -Math.PI / 2, r.pick(['#e8e8e8', '#c0c4c8', '#1b1c1f', '#e63946']));
      this.diningSet((K.x0 + K.x1) / 2 + 0.2, (K.z0 + K.z1) / 2 + 0.2, r.pick(['#7a4f2c', '#d8cfc0', '#3a3e45']));
      this.frame('z', K.x1 - 0.1, 1.7, (K.z0 + K.z1) / 2 + 1.4, seed + 7, 0.8, -1);
      // yatak odası
      this.bed((Y.x0 + Y.x1) / 2, Y.z1 - 1.12, Math.PI, r.pick(['#9d0208', '#3d5a80', '#e9c46a', '#6a994e', '#cdb4db', '#f4a261']));
      this.nightstand(Y.x0 + 0.4, Y.z1 - 0.35, Math.PI, !opts.dark);
      this.wardrobe(Y.x1 - 0.35, Y.z0 + 1.35, -Math.PI / 2);
      this.rug((Y.x0 + Y.x1) / 2 - 0.3, Y.z0 + 1.3, 1.6, 1.0, seed + 2);
      this.frame('x', Y.x0 + 0.9, 1.8, Y.z1 - 0.1, seed + 5, 0.8, -1);
      // banyo
      this.bathroom((BN.x0 + BN.x1) / 2, (BN.z0 + BN.z1) / 2, BN.x1 - BN.x0, BN.z1 - BN.z0);
      // oda: çocuk odası veya çalışma
      if (r.chance(0.5)) {
        this.bed(O.x1 - 1.12, (O.z0 + O.z1) / 2 + 0.3, -Math.PI / 2, r.pick(['#4cc9f0', '#f72585', '#ffd60a', '#80ed99']), true);
        for (let i = 0; i < 5; i++) this.mesh(rbox(0.25, 0.25, 0.25, 0.05), mat(r.pick(['#e63946', '#f1c40f', '#3a86ff', '#7cb518', '#ff006e']), { r: 0.4 }), O.x0 + 0.5 + r.range(0, 0.8), 0.125, O.z0 + 1.2 + r.range(0, 1.0), 0, r.next() * 3, 0);
        this.rug(O.x0 + 1.0, (O.z0 + O.z1) / 2, 1.2, 1.5, seed + 4);
      } else {
        this.desk(O.x1 - 0.4, O.z0 + 1.3, -Math.PI / 2, true);
        this.bookshelf(O.x0 + 0.3, (O.z0 + O.z1) / 2, Math.PI / 2, seed + 9);
      }
    });
    // ışıklar
    const dark = !!opts.dark;
    const warm = r.pick([0xffd9a8, 0xfff1d6, 0xffc98a]);
    this.ceilingLamp((S.x0 + S.x1) / 2, base + wallH, (S.z0 + S.z1) / 2, warm, 10, !dark || r.chance(0.4));
    this.ceilingLamp((K.x0 + K.x1) / 2, base + wallH, (K.z0 + K.z1) / 2, 0xfff6e8, 9, !dark || r.chance(0.5));
    this.ceilingLamp((Y.x0 + Y.x1) / 2, base + wallH, (Y.z0 + Y.z1) / 2, warm, 7, !dark && r.chance(0.6));
    this.ceilingLamp((BN.x0 + BN.x1) / 2, base + wallH, (BN.z0 + BN.z1) / 2, 0xeef6ff, 6, !dark && r.chance(0.5));
    this.ceilingLamp((O.x0 + O.x1) / 2, base + wallH, (O.z0 + O.z1) / 2, warm, 7, !dark && r.chance(0.5));
    // bahçe
    const fenceKind = r.pick(['iron', 'wood', 'hedge', 'wall']);
    const fz = oz - 3.2, gateX = frontDoorX;
    const fcol = fenceKind === 'wood' ? r.pick(['#f4f1ea', '#8a5a3a', '#3d5a80']) : fenceKind === 'wall' ? ext : '#1d1f22';
    this.fence(x0 - 2, fz, gateX - 0.9, fz, fenceKind, fenceKind === 'wall' ? 1.1 : 1.15, fcol);
    this.fence(gateX + 0.9, fz, x1 + 2, fz, fenceKind, fenceKind === 'wall' ? 1.1 : 1.15, fcol);
    this.fence(x0 - 2, fz, x0 - 2, z1 + 4, fenceKind === 'hedge' ? 'hedge' : 'wood', 1.6, '#8a5a3a');
    this.fence(x1 + 2, fz, x1 + 2, z1 + 1.5, fenceKind === 'hedge' ? 'hedge' : 'wood', 1.6, '#8a5a3a');
    this.fence(x0 - 2, z1 + 4, x1 - 1, z1 + 4, 'wood', 1.6, '#8a5a3a');
    const gm = mat(0xffffff, { map: TX.grass().map, r: 0.95 }); gm.map.repeat.set(4, 4);
    const lawn = M(plane(W + 4, D + 7.2), gm, ox, 0.015, oz + D / 2 + 0.4, -Math.PI / 2, 0, 0, this.static, false); lawn.receiveShadow = true;
    // patika
    for (let i = 0; i < 4; i++) this.mesh(boxGeo(0.9, 0.03, 0.55), mat('#a8a398', { r: 0.8 }), gateX + (i % 2 ? 0.1 : -0.1), 0.015, fz + 0.5 + i * 0.75);
    this.tree(x0 - 0.5, fz + 1.4, r.range(0.8, 1.1), r.int(0, 1));
    if (r.chance(0.6)) this.tree(x1 + 0.8, z1 + 2.2, 0.9, 0);
    this.bench(x1 - 1.2, fz + 1.3, 0);
    if (r.chance(0.5)) { this.mesh(boxGeo(0.4, 0.5, 0.3), mat('#c0262c', { r: 0.4 }), gateX + 1.1, 0.9, fz - 0.05); this.mesh(cyl(0.04, 0.04, 0.9, 6), mat('#333', {}), gateX + 1.1, 0.45, fz - 0.05); }
    // çapalar
    this.anchor('frontDoor', frontDoorX, z0 - 1.2); this.anchor('gate', gateX, fz - 0.8);
    this.anchor('salon', (S.x0 + S.x1) / 2, (S.z0 + S.z1) / 2 - 0.2, base); this.anchor('salon', S.x0 + 1.4, S.z1 - 1.6, base);
    this.anchor('mutfak', (K.x0 + K.x1) / 2, K.z0 + 1.0, base); this.anchor('yatak', (Y.x0 + Y.x1) / 2 - 0.3, Y.z0 + 0.8, base);
    this.anchor('banyo', (BN.x0 + BN.x1) / 2 + 0.2, (BN.z0 + BN.z1) / 2 - 0.4, base); this.anchor('oda', (O.x0 + O.x1) / 2 - 0.4, (O.z0 + O.z1) / 2 - 0.3, base);
    this.anchor('hide', Y.x1 - 0.5, Y.z1 - 0.4, base); this.anchor('hide', (BN.x0 + BN.x1) / 2, BN.z1 - 0.5, base); this.anchor('hide', O.x1 - 0.4, O.z0 + 0.4, base); this.anchor('hide', K.x1 - 0.5, K.z0 + 0.5, base);
    this.anchor('backDoor', backDoorX, z1 + 1.0); this.anchor('backyard', ox - 2, z1 + 2.2);
    this.anchor('escape', x1 + 3.5, z1 + 2.5); this.anchor('escape', x0 - 4, z1 + 6);
    this.anchor('inside', (S.x0 + S.x1) / 2, (S.z0 + S.z1) / 2, base);
    this.houseInfo = { x0, x1, z0, z1, base, doors, rooms, frontDoorX, fz, W, D, ox, oz };
    // ev içi rota grafiği
    const V3 = (x, z, y = base) => new THREE.Vector3(x, y, z);
    const kitchenDoorZ = zm - 1.0;
    const nodes = {
      salon: V3((S.x0 + S.x1) / 2, (S.z0 + S.z1) / 2), mutfak: V3((K.x0 + K.x1) / 2, (K.z0 + K.z1) / 2 + 0.6), yatak: V3((Y.x0 + Y.x1) / 2, Y.z0 + 0.8), banyo: V3((BN.x0 + BN.x1) / 2, BN.z0 + 0.8), oda: V3((O.x0 + O.x1) / 2, O.z0 + 0.9),
      front: V3(frontDoorX, z0 - 1.4, 0), back: V3(backDoorX, z1 + 1.4, 0),
    };
    const bathSide = bathDoorX < sx ? 'salon' : 'mutfak', odaSide = odaDoorX < sx ? 'salon' : 'mutfak';
    const edges = [
      ['salon', 'mutfak', [V3(sx - 0.7, kitchenDoorZ), V3(sx + 0.7, kitchenDoorZ)]],
      ['salon', 'yatak', [V3(bedDoorX, zm - 0.7), V3(bedDoorX, zm + 0.7)]],
      [bathSide, 'banyo', [V3(bathDoorX, zm - 0.7), V3(bathDoorX, zm + 0.7)]],
      [odaSide, 'oda', [V3(odaDoorX, zm - 0.7), V3(odaDoorX, zm + 0.7)]],
      ['salon', 'front', [V3(frontDoorX, z0 + 0.8), V3(frontDoorX, z0 - 0.8, 0)]],
      ['oda', 'back', [V3(backDoorX, z1 - 0.8), V3(backDoorX, z1 + 0.8, 0)]],
    ];
    const roomOf = (p) => { for (const k of ['salon', 'mutfak', 'yatak', 'banyo', 'oda']) { const R = rooms[k]; if (p.x >= R.x0 && p.x <= R.x1 && p.z >= R.z0 && p.z <= R.z1) return k; } return p.z < z0 ? 'front' : 'back'; };
    this.houseInfo.inside = (p) => p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1;
    this.houseInfo.roomOf = roomOf;
    this.houseInfo.route = (from, to) => {
      const start = roomOf(from); if (start === to) return [nodes[to].clone()];
      const prev = { [start]: null }, q = [start];
      while (q.length) { const c = q.shift(); if (c === to) break; for (const [a, b] of edges) { const n = a === c ? b : b === c ? a : null; if (n && !(n in prev)) { prev[n] = c; q.push(n); } } }
      if (!(to in prev)) return [nodes[to].clone()];
      const chain = []; for (let c = to; c; c = prev[c]) chain.unshift(c);
      const pts = [];
      for (let i = 0; i < chain.length - 1; i++) {
        const a = chain[i], b = chain[i + 1];
        const e = edges.find(e => (e[0] === a && e[1] === b) || (e[0] === b && e[1] === a));
        const wp = e[0] === a ? e[2] : e[2].slice().reverse();
        pts.push(...wp.map(v => v.clone()));
      }
      pts.push(nodes[to].clone());
      return pts;
    };
    // kaçış yolu: arka kapı -> arka bahçe -> çit boşluğu
    this.escapePath = [new THREE.Vector3(backDoorX, base, z1 - 0.8), new THREE.Vector3(backDoorX, 0, z1 + 1.2), new THREE.Vector3(x1 + 1.0, 0, z1 + 2.8), new THREE.Vector3(x1 + 6, 0, z1 + 2.8)];
    return this.houseInfo;
  }
  _withBase(base, fn) {
    // duvar ve eşyaları ev tabanının üstüne yerleştir
    const s0 = this.static.children.length, d0 = this.dynamic.children.length, c0 = this.colliders.length;
    fn();
    for (let i = s0; i < this.static.children.length; i++) this.static.children[i].position.y += base;
    for (let i = d0; i < this.dynamic.children.length; i++) this.dynamic.children[i].position.y += base;
    for (let i = c0; i < this.colliders.length; i++) { this.colliders[i].min[1] += base; this.colliders[i].max[1] += base; }
  }

  update(dt, t) {
    for (const d of this.doors) d.update(dt);
    for (const u of this.updaters) u(dt, t);
  }
  // Statik meshleri malzemeye göre birleştir (çizim çağrısı azaltma)
  bake() {
    this.static.updateMatrixWorld(true);
    const buckets = new Map();
    const remove = [];
    this.static.traverse(o => {
      if (!o.isMesh || Array.isArray(o.material) || o.userData.noBake) return;
      const g = o.geometry; if (!g.index) return;
      const key = o.material.uuid + (o.castShadow ? 'c' : '') + (o.receiveShadow ? 'r' : '');
      if (!buckets.has(key)) buckets.set(key, { m: o.material, cast: o.castShadow, recv: o.receiveShadow, geos: [] });
      const gg = g.clone(); gg.applyMatrix4(o.matrixWorld);
      for (const k of Object.keys(gg.attributes)) if (!['position', 'normal', 'uv'].includes(k)) gg.deleteAttribute(k);
      if (!gg.attributes.uv) return;
      buckets.get(key).geos.push(gg); remove.push(o);
    });
    for (const o of remove) o.parent.remove(o);
    // boş grupları temizle
    const merged = new THREE.Group();
    for (const b of buckets.values()) {
      for (let i = 0; i < b.geos.length; i += 400) {
        const geo = mergeGeometries(b.geos.slice(i, i + 400), false);
        if (!geo) continue;
        const m = new THREE.Mesh(geo, b.m); m.castShadow = b.cast; m.receiveShadow = b.recv; merged.add(m);
      }
    }
    const rest = this.static.children.slice();
    this.root.remove(this.static);
    this.static = new THREE.Group(); this.root.add(this.static);
    this.static.add(merged);
    for (const c of rest) if (c.children.length || c.isMesh) this.static.add(c);
  }
  dispose() {
    this.scene.remove(this.root);
    disposeTree(this.root);
  }
}
