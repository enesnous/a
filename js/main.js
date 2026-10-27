// FIRST AID – ana oyun döngüsü: birinci şahıs, efektler, görev akışı, çok oyunculu senkron.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Character, policeAppearance } from './character.js';
import { createGlock, createTaser, createCuffs, beam } from './items.js';
import { createPoliceCar, updatePoliceLights } from './vehicles.js';
import { World } from './world.js';
import { buildLocation, LOCATION_NAMES } from './locations.js';
import { NPC, resetNpcIds } from './npc.js';
import { getOptions } from './dialogue.js';
import { Mission, CRIMES, pickMission, setupMission } from './scenarios.js';
import { UI } from './ui.js';
import { AudioEngine } from './audio.js';
import { Net, randomCode } from './net.js';
import { ViewModel } from './viewmodel.js';
import * as TX from './textures.js';
import { RNG, clamp, damp, dampAngle, raySphere, hash } from './util.js';
import { mat, cyl, disposeTree } from './kit.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const esc = (t) => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const A3 = (v) => [Math.round(v.x * 100) / 100, Math.round(v.y * 100) / 100, Math.round(v.z * 100) / 100];
const VA = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const TOP_SHORT = { 'Tişört': 'tişörtlü', 'Gömlek': 'gömlekli', 'Kapüşonlu sweatshirt': 'kapüşonlu', 'Şişme mont': 'şişme montlu', 'Takım elbise ceketi': 'ceketli', 'İş yeleği': 'iş yelekli', 'Deri ceket': 'deri ceketli', 'Eşofman üstü': 'eşofmanlı', 'Polo yaka tişört': 'polo yakalı' };
const ROLE_LABEL = { reporter: 'İhbarcı', victim: 'Mağdur', parent: 'Kayıp yakını', clerk: 'Kasiyer', owner: 'Ev sahibi', guard: 'Güvenlik', hostage: 'Rehine', jumper: 'Kişi', injured: 'Yaralı', child: 'Kayıp kişi' };
const SHOUTS = ['POLİS! KIPIRDAMA!', 'POLİS! ELLER YUKARI!', 'YERE ÇÖK! HEMEN!', 'DUR! POLİS!'];
const SEATS = [[0.42, 1.27, 0.0], [-0.42, 1.27, 0.0], [0.4, 1.22, -1.0], [-0.4, 1.22, -1.0], [0, 1.22, -1.0]];

// ---------------- Efektler (yayın destekli) ----------------
class FX {
  constructor(game) {
    this.g = game; this.scene = game.scene; this.items = [];
    this.flashMat = new THREE.SpriteMaterial({ map: TX.radial('#ffd27a'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffffff });
    this.muzzleLight = new THREE.PointLight(0xffb060, 0, 9, 2); this.scene.add(this.muzzleLight);
    this.shellGeo = cyl(0.006, 0.006, 0.022, 6); this.shellMat = mat('#c9a227', { m: 1, r: 0.3 });
    this.embers = null; this.rain = null;
  }
  bc(f, a, b, i) { this.g.netEvt({ k: 'fx', f, a: a ? A3(a) : null, b: b ? A3(b) : null, i }); }
  add(o, life, upd) { this.items.push({ o, life, t: 0, upd }); }
  muzzle(p, bc = true) {
    const s = new THREE.Sprite(this.flashMat); s.position.copy(p); const k = 0.45 + Math.random() * 0.3; s.scale.set(k, k, k); this.scene.add(s);
    this.add(s, 0.06, (it) => { it.o.material.opacity = 1 - it.t / it.life; });
    this.muzzleLight.position.copy(p); this.muzzleLight.intensity = 40; this._ml = 0.06;
    if (bc) this.bc('muzzle', p);
  }
  tracer(a, b, bc = true) {
    const m = beam('#ffe2a0', 0.8); m.position.copy(a); m.lookAt(b); m.scale.set(1.4, 1.4, a.distanceTo(b)); this.scene.add(m);
    this.add(m, 0.07, (it) => { it.o.material.opacity = 0.8 * (1 - it.t / it.life); });
    if (bc) this.bc('tracer', a, b);
  }
  particles(p, n, color, speed, life, size, grav = 9) {
    const pos = new Float32Array(n * 3), vel = [];
    for (let i = 0; i < n; i++) { pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z; vel.push(V((Math.random() - 0.5) * speed, Math.random() * speed * 0.8, (Math.random() - 0.5) * speed)); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color, size, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    const pts = new THREE.Points(g, m); this.scene.add(pts);
    this.add(pts, life, (it, dt) => { const a = it.o.geometry.attributes.position; for (let i = 0; i < n; i++) { vel[i].y -= grav * dt; a.array[i * 3] += vel[i].x * dt; a.array[i * 3 + 1] += vel[i].y * dt; a.array[i * 3 + 2] += vel[i].z * dt; } a.needsUpdate = true; it.o.material.opacity = 1 - it.t / it.life; });
  }
  impact(p, bc = true) {
    this.particles(p, 14, 0xffc27a, 5, 0.35, 0.05);
    const d = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.radial('#9a958c'), transparent: true, opacity: 0.5, depthWrite: false })); d.position.copy(p); d.scale.setScalar(0.25); this.scene.add(d);
    this.add(d, 0.8, (it) => { it.o.scale.setScalar(0.25 + it.t * 0.8); it.o.material.opacity = 0.5 * (1 - it.t / it.life); });
    if (Math.random() < 0.35) this.g.audio.sfx('ricochet', p);
    if (bc) this.bc('impact', p);
  }
  blood(p, bc = true) {
    const n = 12, pos = new Float32Array(n * 3), vel = [];
    for (let i = 0; i < n; i++) { pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z; vel.push(V((Math.random() - 0.5) * 2.5, Math.random() * 2, (Math.random() - 0.5) * 2.5)); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x5a0a0a, size: 0.05, transparent: true })); this.scene.add(pts);
    this.add(pts, 0.6, (it, dt) => { const a = it.o.geometry.attributes.position; for (let i = 0; i < n; i++) { vel[i].y -= 9 * dt; a.array[i * 3] += vel[i].x * dt; a.array[i * 3 + 1] += vel[i].y * dt; a.array[i * 3 + 2] += vel[i].z * dt; } a.needsUpdate = true; it.o.material.opacity = 1 - it.t / it.life; });
    if (bc) this.bc('blood', p);
  }
  shell(p, right) {
    const m = new THREE.Mesh(this.shellGeo, this.shellMat); m.position.copy(p); m.castShadow = false; this.scene.add(m);
    const v = right.clone().multiplyScalar(1.6 + Math.random()).add(V(0, 2.2 + Math.random(), 0)); const w = this.g.world;
    this.add(m, 4, (it, dt) => { v.y -= 12 * dt; it.o.position.addScaledVector(v, dt); it.o.rotation.x += dt * 20; it.o.rotation.z += dt * 13; const h = w ? w.heightAt(it.o.position.x, it.o.position.z, it.o.position.y) + 0.01 : 0; if (it.o.position.y < h) { it.o.position.y = h; v.y *= -0.3; v.x *= 0.5; v.z *= 0.5; } });
    this.g.audio.sfx('shell', p);
  }
  wires(from, npc, bc = true) {
    const mk = (dy) => { const b = beam('#bfe7ff', 0.9); this.scene.add(b); this.add(b, 1.6, (it) => { const t = npc.char.torso.getWorldPosition(V()).add(V(0, dy, 0)); it.o.position.copy(from); it.o.lookAt(t); it.o.scale.set(1, 1, from.distanceTo(t)); }); };
    mk(0); mk(-0.2);
    const sp = npc.char.torso.getWorldPosition(V()); this.particles(sp, 20, 0x9fdcff, 3, 0.5, 0.04, 0);
    if (bc) this.bc('wires', from, null, npc.netIdx);
  }
  explosion(p, bc = true) {
    for (let i = 0; i < 18; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.radial(i % 3 ? '#ff8a2a' : '#ffd27a'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); s.position.copy(p).add(V((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2)); this.scene.add(s); const v = V((Math.random() - 0.5) * 6, Math.random() * 6, (Math.random() - 0.5) * 6); this.add(s, 1.4, (it, dt) => { it.o.position.addScaledVector(v, dt); it.o.scale.setScalar(1 + it.t * 6); it.o.material.opacity = 1 - it.t / it.life; }); }
    this.particles(p, 60, 0xffa040, 14, 1.2, 0.12);
    this.muzzleLight.position.copy(p).add(V(0, 1, 0)); this.muzzleLight.intensity = 900; this._ml = 0.5;
    if (bc) this.bc('explosion', p);
  }
  fromNet(e) {
    const a = e.a ? VA(e.a) : null, b = e.b ? VA(e.b) : null;
    if (e.f === 'muzzle') this.muzzle(a, false);
    else if (e.f === 'tracer') this.tracer(a, b, false);
    else if (e.f === 'impact') this.impact(a, false);
    else if (e.f === 'blood') this.blood(a, false);
    else if (e.f === 'explosion') this.explosion(a, false);
    else if (e.f === 'wires') { const n = this.g.npcs[e.i]; if (n) this.wires(a, n, false); }
  }
  atmosphere(rain, center) {
    const n = 260, pos = new Float32Array(n * 3), seed = [];
    for (let i = 0; i < n; i++) { pos[i * 3] = center.x + (Math.random() - 0.5) * 50; pos[i * 3 + 1] = Math.random() * 10; pos[i * 3 + 2] = center.z + (Math.random() - 0.5) * 50; seed.push(Math.random() * 10); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const em = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xff9a4a, size: 0.06, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    em.userData.seed = seed; em.userData.center = center; this.scene.add(em); this.embers = em;
    if (rain) {
      const rn = 2400, rp = new Float32Array(rn * 6);
      for (let i = 0; i < rn; i++) { const x = (Math.random() - 0.5) * 40, y = Math.random() * 20, z = (Math.random() - 0.5) * 40; rp.set([x, y, z, x + 0.03, y - 0.45, z + 0.02], i * 6); }
      const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
      const r = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0x9fb3d0, transparent: true, opacity: 0.32, depthWrite: false }));
      r.frustumCulled = false; this.scene.add(r); this.rain = r;
    }
  }
  clearAtmos() { for (const k of ['embers', 'rain']) if (this[k]) { this.scene.remove(this[k]); this[k].geometry.dispose(); this[k] = null; } }
  update(dt, t, camPos) {
    for (let i = this.items.length - 1; i >= 0; i--) { const it = this.items[i]; it.t += dt; if (it.upd) it.upd(it, dt); if (it.t >= it.life) { this.scene.remove(it.o); if (it.o.isPoints) it.o.geometry.dispose(); this.items.splice(i, 1); } }
    if (this._ml > 0) { this._ml -= dt; if (this._ml <= 0) this.muzzleLight.intensity = 0; else this.muzzleLight.intensity *= 0.6; }
    if (this.embers) { const a = this.embers.geometry.attributes.position, s = this.embers.userData.seed, c = this.embers.userData.center; for (let i = 0; i < s.length; i++) { a.array[i * 3 + 1] += dt * (0.25 + (s[i] % 1) * 0.4); a.array[i * 3] += Math.sin(t * 0.6 + s[i]) * dt * 0.3; if (a.array[i * 3 + 1] > 11) { a.array[i * 3 + 1] = 0; a.array[i * 3] = c.x + (Math.random() - 0.5) * 50; a.array[i * 3 + 2] = c.z + (Math.random() - 0.5) * 50; } } a.needsUpdate = true; this.embers.material.opacity = 0.6 + Math.sin(t * 3) * 0.2; }
    if (this.rain) { this.rain.position.set(camPos.x, 0, camPos.z); const a = this.rain.geometry.attributes.position; for (let i = 0; i < a.count; i += 2) { let y = a.array[i * 3 + 1] - dt * 16; if (y < 0) y += 20; a.array[i * 3 + 1] = y; a.array[i * 3 + 4] = y - 0.45; } a.needsUpdate = true; }
  }
}

// ---------------- Yerel oyuncu ----------------
class Player {
  constructor(game) {
    this.g = game; this.local = true; this.nick = 'Sen';
    this.app = policeAppearance(new RNG(7));
    this.char = new Character(this.app); this.root = this.char.root; game.scene.add(this.root); this.root.visible = false;
    this.pos = this.root.position; this.yaw = 0; this.vy = 0; this.hp = 100;
    this.slot = 0; this.ammo = 17; this.reserve = 51; this.taserLoaded = 2; this.taserSpare = 4;
    this.inCar = true; this.dead = false; this.aiming = false; this.aimingAt = null; this.speedNow = 0;
    this.fireT = 0; this.reloadT = 0; this.action = null; this.stepAcc = 0; this.flash = false;
    this.torch = new THREE.SpotLight(0xfff4e0, 0, 28, 0.42, 0.45, 1.5); game.scene.add(this.torch); game.scene.add(this.torch.target);
  }
  get weaponDrawn() { return this.slot === 1 || this.slot === 3; }
  reset() { this.hp = 100; this.dead = false; this.ammo = 17; this.reserve = 51; this.taserLoaded = 2; this.taserSpare = 4; this.action = null; this.equip(0, true); this.vy = 0; this.reloadT = 0; }
  equip(i, silent = false) {
    if (this.reloadT > 0) return;
    this.slot = i; this.g.vm.set(i);
    if (!silent) this.g.audio.sfx('equip');
    this.g.ui.setSlot(i, this);
  }
  damage(d, from) {
    if (this.dead || this.inCar) return;
    this.hp -= d; if (this.g.mission) this.g.mission.dmgTaken += d;
    this.g.dmgFx = Math.min(1, this.g.dmgFx + d / 35); this.g.shake = Math.max(this.g.shake, 0.25);
    this.g.audio.sfx('hurt');
    this.g.ui.hp(this.hp);
    if (this.g.dialog) this.g.closeDialog(); if (this.g.radioOpen) this.g.toggleRadio(false);
    if (this.hp <= 0) {
      this.dead = true; this.action = null; this.g.ui.progress(null);
      this.g.toast('Ağır yaralandın! Ekip arkadaşların görevi sürdürüyor…', 'bad');
      this.g.checkAllDead();
    }
  }
}

// ---------------- Uzak oyuncu (avatar + liderde vekil) ----------------
class Remote {
  constructor(game, peer) {
    this.g = game; this.peer = peer.peer; this.local = false;
    const app = policeAppearance(new RNG(hash(peer.peer) % 100000));
    this.char = new Character(app); this.root = this.char.root; game.scene.add(this.root);
    this.pos = this.root.position; this.tgt = V(); this.yaw = 0; this.pitch = 0; this.slot = 0; this.aiming = false; this.hp = 100; this.st = 'car';
    this.aimingAt = null; this.speedNow = 0; this.nick = 'Memur'; this.items = [null, createGlock(), createCuffs(), createTaser()]; this.heldSlot = -1;
    this.tag = this.makeTag(); this.root.add(this.tag);
    this.first = true;
  }
  makeTag() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64; this.tagCanvas = c;
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false })); s.position.y = 2.35; s.scale.set(1.3, 0.33, 1); s.renderOrder = 20;
    return s;
  }
  drawTag() {
    const g = this.tagCanvas.getContext('2d'); g.clearRect(0, 0, 256, 64);
    g.fillStyle = 'rgba(10,16,28,0.75)'; g.beginPath(); g.roundRect(8, 8, 240, 48, 12); g.fill();
    g.fillStyle = this.st === 'dead' ? '#ff6b75' : '#7fd0ff'; g.font = `800 26px ${TX.FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText((this.st === 'dead' ? '✚ ' : '') + this.nick.slice(0, 16), 128, 33);
    this.tag.material.map.needsUpdate = true;
  }
  get inCar() { return this.st === 'car' || this.st === 'lobby'; }
  get dead() { return this.st === 'dead'; }
  get weaponDrawn() { return this.slot === 1 || this.slot === 3; }
  apply(pr) {
    if (pr.p) { this.tgt.set(pr.p[0], pr.p[1], pr.p[2]); if (this.first) { this.pos.copy(this.tgt); this.first = false; } }
    this.yaw = pr.y ?? this.yaw; this.pitch = pr.pi ?? 0; this.aiming = !!pr.a; this.speedNow = pr.sp || 0;
    const stChanged = pr.st !== this.st; this.st = pr.st || 'car';
    const nickChanged = pr.nick && pr.nick !== this.nick; if (pr.nick) this.nick = String(pr.nick).slice(0, 18);
    if (stChanged || nickChanged) this.drawTag();
    this.hp = pr.hp ?? 100;
    this.aimingAt = (pr.at >= 0 && this.g.npcs[pr.at]) ? this.g.npcs[pr.at] : null;
    if (pr.s !== this.slot || this.heldSlot === -1) { this.slot = pr.s || 0; this.char.hold(this.items[this.slot]); this.heldSlot = this.slot; }
  }
  // Lider: bu oyuncuya hasar (istemciye bildir)
  damage(d) { if (this.dead || this.inCar) return; if (this.g.mission) this.g.mission.dmgTaken += d; this.g.netEvt({ k: 'dmg', to: this.peer, d }); }
  update(dt) {
    const k = 1 - Math.exp(-12 * dt);
    if (this.pos.distanceTo(this.tgt) > 5) this.pos.copy(this.tgt); else this.pos.lerp(this.tgt, k);
    this.root.rotation.y = this.yaw; this.root.visible = !this.inCar;
    this.char.setPose(this.dead ? 'lyingUp' : this.slot === 1 || this.slot === 3 ? (this.aiming ? 'aim' : 'holdLow') : this.slot === 2 ? 'holdItem' : 'idle');
    this.char.pitch = this.aiming ? this.pitch : 0; this.char.speed = this.speedNow; this.char.update(dt);
  }
  dispose() { this.g.scene.remove(this.root); disposeTree(this.root); }
}

// ---------------- Oyun ----------------
class Game {
  constructor() {
    this.quality = 2; this.sens = 1;
    const canvas = document.createElement('canvas'); document.getElementById('app').appendChild(canvas); this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.15;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    TX.setAnisotropy(Math.min(8, r.capabilities.getMaxAnisotropy()));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.03, 260); this.scene.add(this.camera);
    this.scene.fog = new THREE.FogExp2(0x0a0f1a, 0.016);
    this.scene.background = TX.sky(); this.scene.backgroundIntensity = 0.75;
    this.buildEnv();
    this.hemi = new THREE.HemisphereLight(0x3a4c7a, 0x0b0b12, 0.5); this.scene.add(this.hemi);
    const moon = this.moon = new THREE.DirectionalLight(0xa8bcff, 0.45); moon.position.set(-30, 50, -20); moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048); moon.shadow.camera.left = -40; moon.shadow.camera.right = 40; moon.shadow.camera.top = 40; moon.shadow.camera.bottom = -40; moon.shadow.camera.far = 140; moon.shadow.bias = -0.0005; moon.shadow.normalBias = 0.02;
    this.scene.add(moon); this.scene.add(moon.target);
    this.composer = null; this.setupComposer();
    this.ui = new UI(this); this.audio = new AudioEngine(); this.net = new Net(this);
    this.fx = new FX(this); this.vm = new ViewModel(this.camera);
    this.player = new Player(this);
    this.npcs = []; this.timers = []; this.world = null; this.mission = null; this.remotes = new Map();
    this.cam = { yaw: 0, pitch: -0.1, carYaw: 0, carPitch: 0 };
    this.keys = new Set(); this.mouse = { dx: 0, dy: 0, l: false, r: false };
    this.state = 'menu'; this.t = 0; this.shake = 0; this.dmgFx = 0; this.history = [];
    this.role = 'solo'; this.mid = null; this.mode = 'patrol'; this.hostDialogs = new Map(); this.snapT = 0;
    this.career = this.loadCareer(); this.ui.career(this.career);
    this.dialog = null; this.radioOpen = false; this.leaveConfirmT = 0;
    this.nick = this.loadNick(); this.ui.setNick(this.nick);
    this.bindInput(); this.bindMenus(); this.bindNet();
    window.addEventListener('resize', () => this.resize()); this.resize();
    this.menuScene();
    this.last = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
    this.net.init().then(ok => this.ui.netAvailable(ok));
  }
  get isClient() { return this.role === 'client'; }
  crimeName(id) { return CRIMES[id] ? CRIMES[id].name : id; }
  locName(k) { return LOCATION_NAMES[k] || k; }
  get isHostNet() { return this.role === 'host'; }
  buildEnv() {
    const pm = new THREE.PMREMGenerator(this.renderer);
    const es = new THREE.Scene();
    const skyM = new THREE.MeshBasicMaterial({ map: TX.sky(), side: THREE.BackSide }); skyM.map.mapping = THREE.UVMapping;
    es.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyM));
    const add = (c, x, y, z, s) => { const m = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.5, s), new THREE.MeshBasicMaterial({ color: c })); m.position.set(x, y, z); es.add(m); };
    add(0xff2030, 12, 4, 6, 4); add(0x2050ff, -12, 4, 6, 4); add(0xffc070, 0, 10, -20, 8); add(0xffc070, 20, 6, -10, 5); add(0xa0c0ff, -18, 8, -14, 6); add(0xffffff, 0, 30, 0, 10);
    this.envTex = pm.fromScene(es, 0.03).texture;
    this.scene.environment = this.envTex; this.scene.environmentIntensity = 0.45;
  }
  setupComposer() {
    const r = this.renderer;
    r.setPixelRatio([0.7, 1, Math.min(1.5, window.devicePixelRatio || 1)][this.quality - 1]);
    const rt = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, samples: this.quality >= 2 ? 4 : 0 });
    this.composer = new EffectComposer(r, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.45, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    const sz = this.quality === 3 ? 4096 : this.quality === 2 ? 2048 : 1024; this.moon.shadow.mapSize.set(sz, sz);
    if (this.moon.shadow.map) { this.moon.shadow.map.dispose(); this.moon.shadow.map = null; }
    this.resize();
  }
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false); this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    if (this.composer) { this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.composer.setSize(w, h); }
  }
  loadCareer() { try { return JSON.parse(localStorage.getItem('fa-career')) || { missions: 0, points: 0 }; } catch (e) { return { missions: 0, points: 0 }; } }
  saveCareer() { try { localStorage.setItem('fa-career', JSON.stringify(this.career)); } catch (e) { } }
  loadNick() { try { return localStorage.getItem('fa-nick') || ('Memur' + Math.floor(100 + Math.random() * 900)); } catch (e) { return 'Memur' + Math.floor(100 + Math.random() * 900); } }
  saveNick(n) { this.nick = n; this.net.nick = n; try { localStorage.setItem('fa-nick', n); } catch (e) { } this.net.presence({ nick: n }); }

  // ---------- Girdi ----------
  bindInput() {
    const c = this.canvas;
    document.addEventListener('keydown', (e) => {
      if (e.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.repeat && e.code !== 'KeyE') return;
      this.keys.add(e.code);
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
      this.onKey(e.code, e);
    });
    document.addEventListener('keyup', (e) => { this.keys.delete(e.code); if (e.code === 'KeyE') this.onKeyUpE(); });
    document.addEventListener('mousemove', (e) => { if (document.pointerLockElement === c) { this.mouse.dx += e.movementX; this.mouse.dy += e.movementY; } });
    c.addEventListener('mousedown', (e) => {
      this.audio.init();
      if (document.pointerLockElement !== c && (this.state === 'play' || this.state === 'incar')) { this.lock(); return; }
      if (e.button === 0) { this.mouse.l = true; this.onFire(); }
      if (e.button === 2) this.mouse.r = true;
    });
    document.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse.l = false; if (e.button === 2) this.mouse.r = false; });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('wheel', (e) => {
      if (this.state !== 'play') return;
      if (this.dialog || this.radioOpen) { const n = this.dialog ? this.dialog.opts.length : this.radioOpts.length; this.menuSel = ((this.menuSel || 0) + Math.sign(e.deltaY) + n * 4) % n; this.highlightMenu(); return; }
      this.player.equip((this.player.slot + Math.sign(e.deltaY) + 4) % 4);
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== c && this.state === 'play' && !this.mission?.failed) this.pause(true);
    });
    document.addEventListener('click', () => this.audio.init(), { once: false });
  }
  lock() { try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => { }); } catch (e) { } }
  highlightMenu() { const sel = this.dialog ? '#d-opts li' : '#r-opts li'; document.querySelectorAll(sel).forEach((li, i) => li.classList.toggle('sel', i === this.menuSel)); }
  onKey(code) {
    if (this.state === 'incar') { if (code === 'KeyE' || code === 'Space') this.exitCar(); if (code === 'KeyH') this.toggleSiren(); return; }
    if (this.state !== 'play') return;
    const p = this.player;
    const digit = code.startsWith('Digit') ? +code.slice(5) : code.startsWith('Numpad') ? +code.slice(6) : -1;
    if (this.dialog) { if (digit === 0 || code === 'Backspace') this.closeDialog(); else if (digit > 0) this.chooseDialog(digit - 1); return; }
    if (this.radioOpen) { if (code === 'KeyT' || digit === 0) this.toggleRadio(false); else if (digit > 0) this.chooseRadio(digit - 1); return; }
    if (p.dead) return;
    if (digit >= 1 && digit <= 4) p.equip(digit - 1);
    if (code === 'KeyR') this.reload();
    if (code === 'KeyQ') this.shout();
    if (code === 'KeyF') this.kick();
    if (code === 'KeyT') this.toggleRadio(true);
    if (code === 'KeyL') { p.flash = !p.flash; this.audio.sfx('click'); }
    if (code === 'KeyH') this.toggleSiren();
    if (code === 'KeyE') this.interact();
    if (code === 'Space' && p.vy === 0 && !p.action) p.vy = 5.2;
  }
  onKeyUpE() { const a = this.player.action; if (a && a.type === 'aid' && a.hold) { this.player.action = null; this.ui.progress(null); } }

  bindMenus() {
    const $ = (id) => document.getElementById(id);
    const go = (f) => () => { this.audio.init(); this.audio.sfx('ui'); this.applySettings(); f(); };
    $('btn-play').onclick = go(() => { this.role = 'solo'; this.mode = 'patrol'; this.newMission(); });
    $('btn-select').onclick = go(() => { this.selectFor = 'solo'; this.ui.show('menu', false); this.ui.show('select', true); this.fillSelect(); });
    $('btn-controls').onclick = go(() => { this.ui.show('menu', false); this.ui.show('controls', true); });
    $('btn-credits').onclick = go(() => { this.ui.show('menu', false); this.ui.show('credits', true); });
    $('cr-back').onclick = go(() => { this.ui.show('credits', false); this.ui.show('menu', true); });
    $('ctl-back').onclick = go(() => { this.ui.show('controls', false); this.ui.show(this.state === 'menu' ? 'menu' : 'pause', true); });
    $('sel-back').onclick = go(() => { this.ui.show('select', false); this.ui.show(this.selectFor === 'lobby' ? 'lobby' : 'menu', true); });
    $('sel-crime').onchange = () => this.fillLocs();
    $('sel-loc').onchange = () => { $('sel-var-l').hidden = $('sel-loc').value !== 'mustakil'; };
    $('sel-go').onclick = go(() => {
      const spec = { crime: $('sel-crime').value, loc: $('sel-loc').value, variant: clamp(+$('sel-var').value || 1, 1, 30) };
      this.ui.show('select', false);
      if (this.selectFor === 'lobby') { this.lobbySpec = spec; this.ui.show('lobby', true); this.ui.lobby(this); }
      else { this.role = 'solo'; this.mode = 'single'; this.startMission(spec); }
    });
    $('p-resume').onclick = go(() => this.pause(false));
    $('p-restart').onclick = go(() => { this.ui.show('pause', false); if (!this.isClient) this.startMission(this.spec); });
    $('p-menu').onclick = go(() => { this.ui.show('pause', false); this.leaveToMenu(); });
    $('e-next').onclick = go(() => { this.ui.show('end', false); if (this.role === 'solo') this.newMission(); else if (this.net.isHost) this.hostStart(null); });
    $('e-retry').onclick = go(() => { this.ui.show('end', false); if (this.role === 'solo') this.startMission(this.spec); else if (this.net.isHost) this.hostStart(this.spec); });
    $('e-menu').onclick = go(() => { this.ui.show('end', false); if (this.role !== 'solo' && this.net.active) { if (this.net.isHost) this.net.send('lobby', {}); this.toLobby(); } else this.leaveToMenu(); });
    // çok oyunculu
    $('nick').onchange = () => this.saveNick(($('nick').value || '').trim().slice(0, 18) || this.nick);
    $('btn-host').onclick = go(() => this.joinLobby(randomCode()));
    $('btn-join').onclick = go(() => { const c = ($('join-code').value || '').trim(); if (c.length < 3) { this.ui.toast('Geçerli bir lobi kodu yaz.', 'warn'); return; } this.joinLobby(c); });
    $('lb-leave').onclick = go(async () => { await this.net.leave(); this.role = 'solo'; this.ui.show('lobby', false); this.ui.show('menu', true); this.music('music_menu'); });
    $('lb-mode-single').onclick = go(() => { this.mode = 'single'; this.ui.lobby(this); this.net.presence({ mode: this.mode }); });
    $('lb-mode-patrol').onclick = go(() => { this.mode = 'patrol'; this.ui.lobby(this); this.net.presence({ mode: this.mode }); });
    $('lb-pick').onclick = go(() => { this.selectFor = 'lobby'; this.ui.show('lobby', false); this.ui.show('select', true); this.fillSelect(); });
    $('lb-random').onclick = go(() => { this.lobbySpec = null; this.ui.lobby(this); });
    $('lb-start').onclick = go(() => { if (this.net.isHost) this.hostStart(this.lobbySpec); });
    $('lb-copy').onclick = () => { try { navigator.clipboard.writeText(this.net.code).then(() => this.ui.toast('Kod kopyalandı', 'ok')).catch(() => { }); } catch (e) { } };
  }
  applySettings() {
    const q = +document.getElementById('set-q').value; this.sens = +document.getElementById('set-s').value;
    this.audio.setMusicOn(document.getElementById('set-m').value === '1');
    if (q !== this.quality) { this.quality = q; this.setupComposer(); }
  }
  fillSelect() {
    const sc = document.getElementById('sel-crime');
    sc.innerHTML = Object.values(CRIMES).sort((a, b) => a.name.localeCompare(b.name, 'tr')).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    this.fillLocs();
  }
  fillLocs() {
    const c = CRIMES[document.getElementById('sel-crime').value];
    const sl = document.getElementById('sel-loc');
    sl.innerHTML = c.locs.map(l => `<option value="${l}">${LOCATION_NAMES[l]}</option>`).join('');
    document.getElementById('sel-var-l').hidden = sl.value !== 'mustakil';
  }
  pause(on) {
    if (on) { this.state = 'paused'; this.ui.show('pause', true); this.ui.pauseNote(this.net.active); }
    else { this.ui.show('pause', false); this.state = 'play'; this.lock(); this.last = performance.now(); }
  }
  music(name) { this.audio.music(name, name === 'music_menu' ? 0.32 : 0.16); }
  leaveToMenu() {
    if (this.net.active) this.net.leave();
    this.role = 'solo'; this.toMenu();
  }
  toMenu() {
    this.clearMission(); this.state = 'menu'; this.mission = null; this.ui.show('hud', false); this.ui.show('lobby', false); this.ui.show('menu', true); this.ui.career(this.career);
    if (document.pointerLockElement) document.exitPointerLock();
    this.menuScene(); this.music('music_menu');
  }

  // ---------- Lobi ----------
  async joinLobby(code) {
    if (!this.net.available) { this.ui.toast('Çok oyunculu bu görünümde kullanılamıyor.', 'bad'); return; }
    this.net.nick = this.nick;
    try { await this.net.join(code); } catch (e) { this.ui.toast('Lobiye bağlanılamadı: ' + (e.code || e.message || e), 'bad'); return; }
    this.ui.show('menu', false); this.ui.show('lobby', true); this.lobbySpec = null; this.state = 'lobby';
    this.ui.lobby(this);
  }
  toLobby() {
    this.clearMission(); this.mission = null; this.state = 'lobby'; this.role = 'solo';
    if (document.pointerLockElement) document.exitPointerLock();
    this.ui.show('hud', false); this.ui.show('end', false); this.ui.show('pause', false); this.ui.show('lobby', true); this.ui.lobby(this);
    this.net.presence({ st: 'lobby', mid: null });
    this.menuScene(); this.music('music_menu');
  }
  onPeersChanged(ch) {
    if (this.state === 'lobby') this.ui.lobby(this);
    // uzak avatarlar
    const seen = new Set();
    for (const p of this.net.remotes()) {
      seen.add(p.peer);
      const pr = p.presence || {};
      if (this.mission && pr.mid === this.mid) {
        let r = this.remotes.get(p.peer);
        if (!r) { r = new Remote(this, p); this.remotes.set(p.peer, r); }
        r.apply(pr);
      } else if (this.remotes.has(p.peer)) { this.remotes.get(p.peer).dispose(); this.remotes.delete(p.peer); }
    }
    for (const [k, r] of this.remotes) if (!seen.has(k)) { r.dispose(); this.remotes.delete(k); }
    // geç katılan: liderden görev bilgisini gönder
    if (this.isHostNet && this.mission && this.startMsg && this.startMsg.mid === this.mid && ch && ch.joined && ch.joined.length) for (const j of ch.joined) if (!(j.isMe && j.sameTab)) this.net.send('start', { ...this.startMsg, to: j.peer });
    if (this.role === 'client' && this.net.isHost && this.mission) { // lider ayrıldı -> biz lider olduk
      this.role = 'host'; this.toast('Ekip lideri ayrıldı. Artık lider sensin; görev yeniden başlatılıyor.', 'warn');
      this.later(1.5, () => { if (this.net.isHost) this.hostStart(this.spec); else this.role = 'client'; });
    }
  }
  hostStart(spec) {
    if (!spec) spec = pickMission(new RNG(Date.now()), this.history);
    const multi = this.net.active && this.net.remotes().length > 0;
    this.role = multi ? 'host' : (this.net.active ? 'host' : 'solo');
    const seed = Math.floor(Math.random() * 1e9), mid = Math.random().toString(36).slice(2, 10);
    this.startMsg = { mid, spec, seed, mode: this.mode };
    if (this.net.active) {
      const sm = this.startMsg; this.net.send('start', sm);
      // mesajlar kaybolabilir: birkaç kez daha gönder (aynı görev tekrar başlatılmaz)
      for (const ms of [1200, 3500]) setTimeout(() => { if (this.startMsg === sm && this.mid === sm.mid && this.role === 'host') this.net.send('start', sm); }, ms);
    }
    this.startMission(spec, seed, mid);
  }
  bindNet() {
    const n = this.net;
    n.on('start', (d) => {
      if (!d || !d.spec || !d.mid) return;
      if (this.net.isHost && this.role === 'host') return;
      if (this.mid === d.mid) return;
      this.role = 'client'; this.mode = d.mode || 'patrol'; this.ui.show('end', false); this.ui.show('lobby', false);
      this.startMission(d.spec, d.seed, d.mid);
    });
    n.on('lobby', () => { if (this.role === 'client' || this.state === 'end') this.toLobby(); });
    n.on('snap', (d) => { if (this.isClient && d.mid === this.mid) this.applySnap(d); });
    n.on('end', (d) => { if (this.isClient && d.mid === this.mid && this.state !== 'end') this.showEnd(d.res); });
    n.on('act', (d, msg) => { if (!this.isClient && d.mid === this.mid) this.onAct(d, msg); });
    n.on('evt', (d, msg) => this.onEvt(d, msg));
  }
  netEvt(e) { if (this.net.active && this.mission && this.role !== 'solo') { e.mid = this.mid; this.net.send('evt', e); } }
  netAct(a) { a.mid = this.mid; this.net.send('act', a); }
  remoteFor(peer) { return this.remotes.get(peer) || null; }

  // ---------- Ana menü arka planı ----------
  menuScene() {
    this.clearMission();
    const w = this.world = new World(this.scene, 3);
    w.ground(160);
    for (let i = 0; i < 10; i++) w.puddle((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 12, 1.5 + Math.random() * 3, 1 + Math.random() * 2, Math.random() * 3);
    for (let i = 0; i < 22; i++) { const a = Math.random() * Math.PI - 0.2, r = 14 + Math.random() * 14; w.tree(Math.cos(a) * r, -Math.sin(a) * r - 4, 1 + Math.random() * 0.8, 1); }
    w.streetLight(-7, -6, 0.4, { shadow: true, color: 0xffb070 });
    const car = this.policeCar = createPoliceCar(); car.position.set(6.4, 0, -1.8); car.rotation.y = -Math.PI / 2 - 0.45; this.scene.add(car);
    const cop = new Character(policeAppearance(new RNG(3))); cop.root.position.set(1.3, 0, 1.6); cop.root.rotation.y = Math.PI * 0.6; cop.setPose('aim1'); cop.hold(createGlock()); this.scene.add(cop.root);
    const sus = new Character({ ...policeAppearance(new RNG(9)), police: false, hair: 'Kapüşonlu', top: 'Kapüşonlu sweatshirt', topColor: 'Bordo', bottom: 'Kot pantolon', bottomColor: 'Lacivert', face: 'Temiz tıraşlı', skin: 'Açık buğday', hairColor: 'Siyah', shoe: '#1b1b1b', accent: '#fff' });
    sus.root.position.set(3.0, 0, 1.1); sus.root.rotation.y = -Math.PI * 0.45; sus.setPose('handsUp'); sus.setExpression('scared'); this.scene.add(sus.root);
    this.menuChars = [cop, sus];
    w.bake();
    this.fx.clearAtmos(); this.fx.atmosphere(true, V(0, 0, 0));
    this.moon.target.position.set(0, 0, 0); this.moon.position.set(-30, 50, -20);
    this.vm.hide();
  }

  // ---------- Görev yaşam döngüsü ----------
  clearMission() {
    for (const n of this.npcs) { n.remove(); disposeTree(n.root); if (n.droppedWeapon) this.scene.remove(n.droppedWeapon); } this.npcs = [];
    if (this.menuChars) { for (const c of this.menuChars) { this.scene.remove(c.root); disposeTree(c.root); } this.menuChars = null; }
    if (this.world) { this.world.dispose(); this.world = null; }
    if (this.policeCar) { this.scene.remove(this.policeCar); disposeTree(this.policeCar); this.policeCar = null; }
    for (const [k, r] of this.remotes) r.dispose(); this.remotes.clear();
    for (const k of ['rain', 'nightrain', 'night', 'siren', 'fire', 'alarm']) this.audio.loop(k, false);
    if (this.partyMusic) { this.audio.fadeOut(this.partyMusic); this.partyMusic = null; }
    this.timers = []; this.dialog = null; this.radioOpen = false; this.ui.dialog(null); this.ui.radio(null); this.ui.progress(null); this.hostDialogs.clear();
    this.fx.items.forEach(it => this.scene.remove(it.o)); this.fx.items = [];
  }
  newMission() { this.startMission(pickMission(new RNG(Date.now()), this.history)); }
  startMission(spec, seed, mid) {
    this.spec = spec; this.ui.show('menu', false); this.ui.show('lobby', false); this.ui.show('loading', true); this.ui.show('hud', false);
    document.getElementById('ld-t').textContent = `${CRIMES[spec.crime].name} — ${LOCATION_NAMES[spec.loc]} hazırlanıyor…`;
    setTimeout(() => { try { this.buildMission(spec, seed, mid); } catch (err) { console.error(err); document.getElementById('ld-t').textContent = 'Hata: ' + err.message; } }, 40);
  }
  buildMission(spec, seed = Math.floor(Math.random() * 1e9), mid = Math.random().toString(36).slice(2, 10)) {
    this.clearMission(); this.ui.show('menu', false);
    this.mid = mid; resetNpcIds();
    const rng = new RNG(seed);
    const w = this.world = new World(this.scene, seed);
    const opts = { variant: spec.variant };
    if (spec.crime === 'eveBaskin' || spec.crime === 'izinsizBarinma') opts.dark = true;
    if (['eveBaskin', 'aileIciSiddet'].includes(spec.crime)) opts.locked = true;
    opts.family = rng.pick(['YILMAZ', 'KAYA', 'DEMİR', 'ŞAHİN', 'ÇELİK', 'AYDIN', 'ARSLAN', 'DOĞAN', 'KILIÇ', 'KURT']);
    const info = buildLocation(w, spec.loc, rng, opts);
    const car = this.policeCar = createPoliceCar(); const [cx, cz, cry] = info.carPos;
    car.position.set(cx, 0, cz); car.rotation.y = cry; this.scene.add(car); w.carCollider(cx, cz, cry, car);
    w.mapShapes.push({ x: cx, z: cz, w: 2, d: 4.9, c: '#cfd8e6' });
    this.mission = new Mission(this, spec.crime, info, rng);
    setupMission(this, this.mission, rng);
    this.npcs.forEach((n, i) => n.netIdx = i);
    w.doors.forEach((d, i) => d.netIdx = i);
    w.bake();
    this.buildMinimap();
    const b = w.bounds, center = V((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
    this.moon.target.position.copy(center); this.moon.position.copy(center).add(V(-25, 50, -18));
    const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / 2 + 12;
    const sc = this.moon.shadow.camera; sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.updateProjectionMatrix();
    const rain = rng.chance(0.55) && !info.busInterior;
    this.fx.clearAtmos(); this.fx.atmosphere(rain, center);
    this.scene.fog.density = info.dark ? 0.028 : 0.016;
    this.hemi.intensity = info.dark ? 0.32 : 0.5;
    this.audio.loop(rain ? 'nightrain' : 'night', true, { vol: rain ? 0.22 : 0.18 });
    if (rain) this.audio.loop('rain', true, { vol: 0.1 });
    // oyuncu araçta
    const p = this.player; p.reset(); p.inCar = true; p.root.visible = false; p.torch.intensity = 0;
    this.seat = this.mySeat();
    this.cam.carYaw = 0; this.cam.carPitch = -0.05;
    this.updateMDT();
    this.ui.show('loading', false); this.ui.show('hud', true); this.ui.objectives(this.mission); this.ui.hp(100); this.ui.setSlot(0, p);
    this.ui.team(this);
    this.state = 'incar';
    this.ui.incar('', true);
    this.audio.loop('siren', true, { vol: 0.16 }); this.sirenOn = true;
    this.later(3.0, () => { if (this.sirenOn) this.toggleSiren(); });
    this.playBriefing();
    this.ui.fade(false, 700);
    this.history.push({ crime: spec.crime, loc: spec.loc });
    this.music('music_game');
    this.net.presence({ mid: this.mid, st: 'car', hp: 100, nick: this.nick });
    this.onPeersChanged(null);
    this.lock();
  }
  mySeat() {
    if (!this.net.active) return 0;
    const ms = this.net.members().filter(p => (p.isMe && p.sameTab) || (p.presence && p.presence.mid === this.mid) || this.role === 'host');
    const sorted = ms.slice().sort((a, b) => (a.presence.t || 0) - (b.presence.t || 0));
    const i = sorted.findIndex(p => p.isMe && p.sameTab);
    return clamp(i < 0 ? 0 : i, 0, SEATS.length - 1);
  }
  updateMDT() {
    const m = this.mission;
    const lines = [{ t: `${m.title.toLocaleUpperCase('tr-TR')} — ${m.info.name}`, c: '#ffd166' }, { t: m.info.address, c: '#9fd3ff' }, ...m.brief.slice(1).map(t => ({ t })), ...m.mdt.map(t => ({ t, c: '#ffb3b3' }))];
    const mdt = this.policeCar.userData.mdt; if (mdt) { mdt.emissiveMap = TX.mdtScreen(lines); mdt.needsUpdate = true; }
  }
  playBriefing() {
    const lines = this.mission.brief.filter(Boolean);
    let html = '', i = 0;
    this.audio.sfx('radio');
    const el = document.getElementById('ic-text');
    const nextLine = () => {
      if (this.state !== 'incar') return;
      if (i >= lines.length) { this.audio.sfx('radioEnd'); el.innerHTML = html + `<p class="ack">— Anlaşıldı Merkez, olay yerine intikal ettik.</p>`; return; }
      const line = lines[i++]; let k = 0;
      const type = () => { if (this.state !== 'incar') return; k += 2; el.innerHTML = html + `<p>${line.slice(0, k)}</p>`; if (k < line.length) setTimeout(type, 16); else { html += `<p>${line}</p>`; setTimeout(nextLine, 700); } };
      type();
    };
    nextLine();
  }
  exitCar() {
    if (!this.mission || this.state !== 'incar') return;
    const p = this.player, car = this.policeCar;
    this.ui.fade(true, 200);
    this.state = 'exiting';
    setTimeout(() => {
      const ry = car.rotation.y; const left = V(Math.cos(ry), 0, -Math.sin(ry)), fwd = V(Math.sin(ry), 0, Math.cos(ry));
      const sides = [left.clone().multiplyScalar(2.3), left.clone().multiplyScalar(-2.3), left.clone().multiplyScalar(2.3).addScaledVector(fwd, -1.6), left.clone().multiplyScalar(-2.3).addScaledVector(fwd, -1.6), fwd.clone().multiplyScalar(-3.6)];
      const pos = car.position.clone().add(sides[this.seat] || sides[0]);
      p.pos.copy(pos); p.pos.y = this.world.heightAt(pos.x, pos.z, 1);
      const f = this.mission.focus || car.position.clone().addScaledVector(fwd, 10);
      p.yaw = Math.atan2(f.x - pos.x, f.z - pos.z); p.inCar = false;
      this.cam.yaw = p.yaw; this.cam.pitch = -0.06;
      this.ui.incar('', false);
      this.state = 'play';
      this.audio.sfx('carDoor', pos);
      this.ui.fade(false, 400);
      this.lock();
      this.toast('Talimatlar sol üstte. Konuşmak için E, uyarmak için Q.', 'info');
    }, 220);
  }
  finishMission() {
    const m = this.mission; if (!m || this.isClient) return;
    const res = m.evaluate(true);
    if (this.role === 'host') {
      const em = { mid: this.mid, res }; this.net.send('end', em);
      for (const ms of [800, 2500]) setTimeout(() => { if (this.mid === em.mid && this.role === 'host') this.net.send('end', em); }, ms);
    }
    this.showEnd(res);
  }
  showEnd(res) {
    const m = this.mission; if (!m || this.state === 'end') return;
    this.state = 'end';
    this.career.missions++; this.career.points += res.score; this.saveCareer();
    if (document.pointerLockElement) document.exitPointerLock();
    this.audio.loop('siren', false);
    this.vm.hide();
    this.ui.show('hud', false); this.ui.end(res, m, this.career, { role: this.role, host: this.net.isHost, mode: this.mode });
    this.audio.sfx(res.success ? 'objective' : 'fail');
    this.net.presence({ st: 'end' });
  }
  onMissionFailed(reason) {
    this.toast(reason, 'bad'); this.audio.sfx('fail');
    this.later(3.2, () => { if (['play', 'incar', 'paused'].includes(this.state)) this.finishMission(); });
  }
  checkAllDead() {
    if (this.isClient) { this.net.presence({ st: 'dead', hp: 0 }); return; }
    const all = this.allPlayers(true);
    if (all.every(p => p.dead)) this.mission.failMission(all.length > 1 ? 'Tüm ekip ağır yaralandı. Görev başarısız.' : 'Görev sırasında ağır yaralandın. Ekip arkadaşların seni hastaneye kaldırdı.');
  }
  buildMinimap() {
    const w = this.world, b = w.bounds;
    const pad = 40, s = this.mapScale = 4;
    const ox = b.minX - pad, oz = b.minZ - pad, W = (b.maxX - b.minX + pad * 2) * s, H = (b.maxZ - b.minZ + pad * 2) * s;
    this.mapOrigin = V(ox, 0, oz);
    const c = document.createElement('canvas'); c.width = Math.min(2048, W); c.height = Math.min(2048, H); const g = c.getContext('2d');
    g.fillStyle = '#121822'; g.fillRect(0, 0, c.width, c.height);
    const shapes = w.mapShapes.slice().sort((a, b2) => (a.c === '#2c3038' ? -1 : 0) - (b2.c === '#2c3038' ? -1 : 0));
    for (const sh of shapes) { g.fillStyle = sh.c; const x = (sh.x - sh.w / 2 - ox) * s, y = (sh.z - sh.d / 2 - oz) * s; if (sh.round) { g.beginPath(); g.arc((sh.x - ox) * s, (sh.z - oz) * s, sh.w / 2 * s, 0, 7); g.fill(); } else g.fillRect(x, y, sh.w * s, sh.d * s); }
    g.strokeStyle = 'rgba(127,208,255,0.35)'; g.setLineDash([8, 6]); g.lineWidth = 2; g.strokeRect((b.minX - ox) * s, (b.minZ - oz) * s, (b.maxX - b.minX) * s, (b.maxZ - b.minZ) * s);
    this.mapImg = c;
    document.getElementById('map-loc').textContent = this.mission.info.name;
  }

  // ---------- Oyuncu listesi (NPC hedefleme) ----------
  allPlayers(includeCar = false) {
    const l = [this.player];
    for (const r of this.remotes.values()) l.push(r);
    return includeCar ? l : l.filter(p => !p.inCar);
  }
  nearestPlayer(pos) {
    let best = null, bd = 1e9;
    for (const p of this.allPlayers()) { if (p.dead) continue; const d = Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z); if (d < bd) { bd = d; best = p; } }
    return best || this.player;
  }
  isAimedAt(npc) {
    if (!npc) return false;
    if (this.player.aimingAt === npc && !this.player.inCar) return true;
    for (const r of this.remotes.values()) if (r.aimingAt === npc && !r.inCar) return true;
    return false;
  }

  // ---------- Yardımcılar (NPC/senaryo API) ----------
  spawnNPC(app, role, pos, o) { const n = new NPC(this, app, role, pos, o); this.npcs.push(n); return n; }
  carPos() { return this.policeCar ? this.policeCar.position : V(); }
  later(sec, fn) { this.timers.push({ t: sec, fn }); }
  event(type, npc) { if (this.isClient) return; if (type === 'idCheck') this.lastIdNpc = npc; if (this.mission) this.mission.onEvent(type, npc); }
  evidence() { }
  toast(t, k, bc = true) { this.ui.toast(t, k); if (bc && !this.isClient) this.netEvt({ k: 'toast', t, c: k }); }
  toastTo(actor, t, k) { if (!actor || actor.local) this.ui.toast(t, k); else this.netEvt({ k: 'toast', t, c: k, to: actor.peer }); }
  showIdTo(actor, info) { if (!actor || actor.local) this.ui.showId(info); else this.netEvt({ k: 'id', to: actor.peer, info }); }
  sfx(name, pos, vol, bc = true) { this.audio.sfx(name, pos, vol); if (bc && name !== 'step') this.netEvt({ k: 'sfx', n: name, p: pos ? A3(pos) : null, v: vol }); }
  music(name) { this.audio.music(name, name === 'music_menu' ? 0.32 : 0.16); }
  // senaryolardan (gürültü/düğün)
  musicParty(kind) {
    if (this.partyMusic) { this.audio.fadeOut(this.partyMusic); this.partyMusic = null; }
    if (kind) { const el = new Audio('snd/music_game2.mp3'); el.loop = true; el.volume = 0.5; el.play().catch(() => { }); this.partyMusic = el; this.music(null); }
    else this.music('music_game');
    this.netEvt({ k: 'party', on: !!kind });
  }
  labelFor(n) {
    if (n.flags.idChecked) return n.name;
    if (ROLE_LABEL[n.role]) return ROLE_LABEL[n.role];
    const a = n.app; const who = a.gender === 'f' ? (a.age < 22 ? 'genç kız' : a.age > 62 ? 'yaşlı kadın' : 'kadın') : (a.age < 22 ? 'genç' : a.age > 62 ? 'yaşlı adam' : 'adam');
    const col = a.topColor.toLocaleLowerCase('tr-TR');
    return `${col.charAt(0).toLocaleUpperCase('tr-TR') + col.slice(1)} ${TOP_SHORT[a.top] || ''} ${who}`;
  }
  listenerPos() { return this.player.inCar ? this.carPos() : this.player.pos; }
  // Türkçe metin satırları: sadece altyazı (seslendirme yok)
  say(npc, text, lang = 'tr', bc = true) {
    if (bc) this.netEvt({ k: 'say', i: npc.netIdx, t: text });
    const d = npc.distTo(this.listenerPos());
    const important = (npc.talkingTo && npc.talkingTo.local) || ['hostageTaker', 'edge'].includes(npc.state);
    if (d > 24 && !important) return;
    this.ui.sub(this.labelFor(npc), text, npc.guilty && npc.triggered ? 'hot' : '');
  }
  // Kayıtlı İngilizce ses tepkileri
  npcVoice(npc, kind, v = null, bc = true) {
    if (!v) v = this.audio.voicePick(npc, kind);
    if (!v) return;
    const d = npc.distTo(this.listenerPos());
    if (d < 40) this.audio.playVoice(v, npc.headWorld ? npc.headWorld() : npc.pos);
    if (v.text && d < 24) this.ui.sub(this.labelFor(npc), `<i>${esc(v.text)}</i>`, npc.guilty && npc.triggered ? 'hot' : '', true);
    if (bc) this.netEvt({ k: 'voice', i: npc.netIdx, v });
  }
  sayQueue(npc, lines) { lines.forEach((l, i) => this.later(i * 2.6, () => { if (npc.alive) npc.say(l); })); }
  playerSay(text, actor) {
    if (!actor || actor.local) { this.ui.sub('Sen', text, 'me'); this.netEvt({ k: 'psay', n: this.nick, t: text }); }
    else this.ui.sub(actor.nick || 'Ekip', text, 'me');
  }
  radio(text) { this.audio.sfx('radio'); this.ui.sub('MERKEZ', text, 'radio'); this.netEvt({ k: 'radio', t: text }); }
  broadcastGunshot(pos, byPlayer, celebratory = false) {
    if (this.isClient) return;
    for (const n of this.npcs) { if (celebratory && n.state === 'dance' && Math.random() < 0.9) continue; n.onGunshot(pos, byPlayer); }
  }
  explode(p) {
    this.fx.explosion(p); this.sfx('boom', p); this.shake = 1.2; this.ui.flash('#ffb060', 0.8);
    for (const n of this.npcs) if (n.alive && n.distTo(p) < 7) { n.hp = -100; n.die(); }
    for (const pl of this.allPlayers()) { const d = Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z); if (d < 9) pl.damage(120 - d * 10, null); }
    this.mission.failMission('Şüpheli paket patladı! Pakete müdahale edilmemeliydi.');
  }
  radioGBT(npc, actor = this.player) {
    if (this.isClient) { this.netAct({ k: 'gbt', i: npc.netIdx }); return; }
    if (!npc.flags.idChecked) { this.toastTo(actor, 'Önce kimlik kontrolü yapmalısın.', 'warn'); return; }
    if (npc.flags.gbt) return;
    npc.flags.gbt = true;
    this.playerSay(`Merkez, GBT sorgusu: ${npc.app.name} ${npc.app.surname}.`, actor);
    this.audio.sfx('radio');
    this.later(3.2, () => {
      let msg;
      if (npc.fakeId) msg = 'Bu kimlik bilgileriyle kayıt bulunamadı! Kimlik sahte olabilir, dikkat!';
      else if (npc.wanted) msg = `${npc.app.name} ${npc.app.surname} hakkında ${['yağma', 'kasten yaralama', 'uyuşturucu ticareti', 'hırsızlık', 'dolandırıcılık'][npc.id % 5]} suçundan yakalama kararı mevcut! Gözaltına alın.`;
      else msg = `${npc.app.name} ${npc.app.surname}, kaydı temiz. Herhangi bir arama kaydı yok.`;
      this.radio(msg);
      if (npc.wanted || npc.fakeId) { npc.flags.wantedKnown = true; if (npc.guilty && npc.alive && !npc.cuffed && !['surrender', 'kneel', 'present'].includes(npc.state) && npc.plan !== 'comply' && Math.random() < 0.6) { npc.triggered = true; if (npc.plan === 'flee' || Math.random() < 0.5) npc.startFlee(); else npc.setState(npc.armed === 'gun' ? 'shoot' : 'attack'); } }
      this.event('gbt', npc);
    });
  }
  radioRequest(kind, actor = this.player) {
    if (this.isClient) { this.netAct({ k: 'radio', kind }); return; }
    const m = this.mission;
    const say = (t) => this.playerSay(t, actor);
    if (kind === 'ambulans') {
      if (m.flags.ambulance) { this.toastTo(actor, 'Ambulans zaten yolda.', 'info'); return; }
      m.flags.ambulance = true; say('Merkez, olay yerine acil ambulans istiyorum!'); this.later(2.5, () => this.radio('Anlaşıldı, 112 yönlendirildi. Tahmini varış 30 saniye.'));
      this.event('ambulance');
      this.later(32, () => { this.radio('Ambulans olay yerinde.'); for (const n of this.npcs) if (n.alive && ['injured', 'stable'].includes(n.state)) { this.toast(`${this.labelFor(n)} hastaneye kaldırıldı.`, 'ok'); n.flags.hospital = true; if (n.state === 'injured') this.mission.bonus('amb' + n.id, 5, 'Yaralı hastaneye yetiştirildi'); n.remove(); } });
    } else if (kind === 'itfaiye') {
      if (m.flags.fireCalled) return; m.flags.fireCalled = true;
      say('Merkez, yangın var, itfaiye istiyorum!'); this.later(2.5, () => this.radio('Anlaşıldı, itfaiye yönlendirildi.'));
      this.event('firedept');
      this.later(22, () => { if (m.flags.fire) { m.flags.fire.visible = false; this.radio('İtfaiye: Yangın söndürüldü.'); this.audio.loop('fire', false); } });
    } else if (kind === 'eod') {
      if (m.flags.eodCalled) return; m.flags.eodCalled = true;
      say('Merkez, şüpheli paket var, bomba imha ekibi istiyorum.'); this.later(2.5, () => this.radio('Anlaşıldı. Bomba imha ekibi yolda, alanı güvende tutun.'));
      this.event('eod');
    } else if (kind === 'destek') {
      say('Merkez, destek ekip talep ediyorum.'); this.later(2.5, () => this.radio('Tüm ekipler meşgul, en yakın destek 5 dakika uzakta. Durumu idare edin.'));
    } else if (kind === 'durum') {
      say('Merkez, olay yerindeyiz, durum kontrol altında.'); this.later(2.2, () => this.radio('Anlaşıldı 34-155.')); this.mission.bonus('radioReport', 2, 'Telsiz prosedürüne uyuldu');
    }
  }
  startFirstAid(npc, actor = this.player) {
    if (!actor || actor.local) this.player.action = { type: 'aid', npc, t: 0, dur: 4, hold: false };
    else this.netEvt({ k: 'aid', to: actor.peer, i: npc.netIdx });
  }
  completeFirstAid(npc) {
    if (!npc.alive || npc.state !== 'injured') return;
    npc.setState('stable'); npc.bleed = 1e9; this.event('firstAid', npc);
    npc.say(npc.guilty ? 'Sağ ol... memur bey.' : 'Teşekkür ederim... daha iyiyim.');
  }
  toggleSiren() { this.sirenOn = !this.sirenOn; this.audio.loop('siren', this.sirenOn, { vol: 0.16 }); }

  // ---------- Diyalog (yerel + uzak) ----------
  openDialog(npc) {
    if (this.isClient) { this.netAct({ k: 'dlg', i: npc.netIdx }); return; }
    this.openDialogFor(this.player, npc);
  }
  openDialogFor(actor, npc) {
    const opts = getOptions(npc, this, actor);
    if (!opts.length) return;
    npc.talkingTo = actor;
    if (npc.state === 'idle' || npc.state === 'walk') npc.setState('talk');
    if (Math.random() < 0.6 && !['hostageTaker', 'edge', 'injured'].includes(npc.state)) this.npcVoice(npc, 'greet');
    if (actor.local) { this.dialog = { npc, opts }; this.menuSel = 0; this.ui.dialog(npc, this.labelFor(npc), opts); this.highlightMenu(); }
    else { this.hostDialogs.set(actor.peer, { npc, opts }); this.netEvt({ k: 'dlg', to: actor.peer, i: npc.netIdx, label: this.labelFor(npc), opts: opts.map(o => o.label) }); }
  }
  pickDialogFor(actor, idx) {
    const D = actor.local ? this.dialog : this.hostDialogs.get(actor.peer); if (!D) return;
    const o = D.opts[idx]; if (!o) return;
    if (!actor.local && !o.label.startsWith('İlk yardım') && o.label !== 'Görüşürüz.') this.ui.sub(actor.nick, o.label, 'me');
    const r = o.fn();
    if (r === 'close') this.closeDialogFor(actor);
    else {
      const opts = getOptions(D.npc, this, actor);
      if (!opts.length) return this.closeDialogFor(actor);
      D.opts = opts;
      if (actor.local) { this.menuSel = Math.min(this.menuSel || 0, opts.length - 1); this.ui.dialog(D.npc, this.labelFor(D.npc), opts); this.highlightMenu(); }
      else this.netEvt({ k: 'dlg', to: actor.peer, i: D.npc.netIdx, label: this.labelFor(D.npc), opts: opts.map(o => o.label) });
    }
  }
  closeDialogFor(actor) {
    const D = actor.local ? this.dialog : this.hostDialogs.get(actor.peer);
    if (D) { if (D.npc.talkingTo === actor) D.npc.talkingTo = null; if (D.npc.state === 'talk') D.npc.setState('idle'); }
    if (actor.local) { this.dialog = null; this.ui.dialog(null); }
    else { this.hostDialogs.delete(actor.peer); this.netEvt({ k: 'dlgx', to: actor.peer }); }
  }
  chooseDialog(i) {
    if (!this.dialog) return; const o = this.dialog.opts[i]; if (!o) return;
    if (!o.label.startsWith('İlk yardım') && o.label !== 'Görüşürüz.') this.ui.sub('Sen', o.label, 'me');
    if (this.isClient) {
      const close = o.label === 'Görüşürüz.';
      this.netAct({ k: 'dlgPick', c: i });
      if (close) { this.dialog = null; this.ui.dialog(null); }
      return;
    }
    this.pickDialogFor(this.player, i);
  }
  closeDialog() {
    if (this.isClient) { if (this.dialog) this.netAct({ k: 'dlgClose' }); this.dialog = null; this.ui.dialog(null); return; }
    this.closeDialogFor(this.player);
  }
  toggleRadio(on) {
    this.radioOpen = on;
    if (!on) { this.ui.radio(null); return; }
    const m = this.mission;
    this.radioOpts = [
      { label: 'Ambulans iste', fn: () => this.radioRequest('ambulans'), dim: m.flags.ambulance },
      { label: 'GBT sorgula' + (this.lastIdNpc ? ` — ${this.lastIdNpc.name}` : ''), fn: () => { if (this.lastIdNpc) this.radioGBT(this.lastIdNpc); else this.toast('Önce birinin kimliğini kontrol et.', 'warn', false); }, dim: !this.lastIdNpc },
      { label: 'İtfaiye iste', fn: () => this.radioRequest('itfaiye'), dim: m.flags.fireCalled },
      { label: 'Bomba İmha Ekibi iste', fn: () => this.radioRequest('eod'), dim: m.flags.eodCalled },
      { label: 'Destek ekip iste', fn: () => this.radioRequest('destek') },
      { label: 'Merkez\'e durum bildir', fn: () => this.radioRequest('durum') },
    ];
    this.menuSel = 0; this.ui.radio(this.radioOpts); this.highlightMenu();
    this.audio.sfx('radioEnd');
  }
  chooseRadio(i) { const o = this.radioOpts && this.radioOpts[i]; if (!o) return; this.toggleRadio(false); o.fn(); }

  // ---------- Ağ: lider tarafı eylemler ----------
  onAct(a, msg) {
    const actor = this.remoteFor(msg.peer); if (!actor) return;
    const n = a.i !== undefined ? this.npcs[a.i] : null;
    switch (a.k) {
      case 'hit': if (n && n.alive) { n.lastHitBy = 'player'; if (!n.guilty) n.flags.shotByPlayer = true; n.takeHit(a.part, a.dmg, 'bullet'); } break;
      case 'tase': if (n && n.alive) n.tase(); break;
      case 'shove': if (n && n.alive) { n.tp = actor; n.onShove(actor.pos); } break;
      case 'shot': this.broadcastGunshot(actor.pos, true); this.mission.note('fired'); break;
      case 'shout': for (const x of this.npcs) if (x.alive && !x.removed && x.distTo(actor.pos) < 16) x.onShout(actor); this.mission.note('shout'); break;
      case 'cuff': if (n) this.hostCuff(n, actor); break;
      case 'aid': if (n) this.completeFirstAid(n); break;
      case 'dlg': if (n) this.openDialogFor(actor, n); break;
      case 'dlgPick': this.pickDialogFor(actor, a.c); break;
      case 'dlgClose': this.closeDialogFor(actor); break;
      case 'door': { const d = this.world.doors[a.d]; if (d) this.doorAction(d, a.op, a.side, actor); break; }
      case 'inter': { const it = this.world.interactables[a.j]; if (it && it.enabled()) it.action(); break; }
      case 'radio': this.radioRequest(a.kind, actor); break;
      case 'gbt': if (n) this.radioGBT(n, actor); break;
      case 'finish': this.finishMission(); break;
    }
  }
  hostCuff(n, actor) {
    if (n.cuffed || !n.alive) return;
    if (!n.tryCuff()) { this.toastTo(actor, 'Şüpheli kelepçelenmeye direniyor!', 'warn'); return; }
    if (n.state !== 'down' && n.state !== 'tased' && !['injured', 'stable'].includes(n.state)) n.setState('present');
    this.sfx('cuffs', n.pos);
    if (actor.local) this.player.action = { type: 'cuff', npc: n, t: 0, dur: 1.1 };
    else { this.netEvt({ k: 'prog', to: actor.peer, label: 'Kelepçeleniyor', dur: 1.1 }); this.later(1.1, () => { if (n.alive && !n.cuffed) { n.cuff(); n.escortBy = actor; this.toast(`${this.labelFor(n)} kelepçelendi`, 'ok'); } }); }
  }
  doorAction(dr, op, side, actor) {
    const dp = V(dr.x, 1, dr.z);
    if (op === 'knock') { this.sfx('knock', dp); this.playerSay(['Polis! Kapıyı açın!', 'Açın kapıyı, polis!', 'Polis! İçeride kimse var mı?'][Math.floor(Math.random() * 3)], actor); this.event('knock'); this.mission.bonus('knock', 4, 'Kapı çalınarak usule uygun giriş denendi'); }
    else if (op === 'toggle') { if (dr.toggle(side)) this.sfx(dr.target > 0.5 ? 'doorOpen' : 'doorClose', dp); }
    else if (op === 'breach') {
      const first = !dr.kicked; dr.kicked = true;
      const ok = !dr.locked || Math.random() < (first ? 0.6 : 0.85);
      if (ok) { dr.breach(side); this.sfx('breach', dp); this.event('knock'); this.event('breach'); }
      else { this.sfx('knock', dp); this.toastTo(actor, 'Kapı direndi! Tekrar tekmele (F).', 'warn'); }
      if (ok && actor.local) { this.shake = 0.6; } else if (ok) this.netEvt({ k: 'shake', to: actor.peer, v: 0.6 });
      if (ok) this.fx.particles(dp, 30, 0xb08a5a, 4, 0.8, 0.05);
    }
  }
  // ---------- Ağ: istemci tarafı olaylar ----------
  onEvt(e, msg) {
    if (!this.mission || e.mid !== this.mid) return;
    switch (e.k) {
      case 'fx': this.fx.fromNet(e); break;
      case 'sfx': this.audio.sfx(e.n, e.p ? VA(e.p) : null, e.v); break;
      case 'voice': { const n = this.npcs[e.i]; if (n) this.npcVoice(n, null, e.v, false); break; }
      case 'say': { const n = this.npcs[e.i]; if (n && this.isClient) this.say(n, e.t, 'tr', false); break; }
      case 'toast': if (this.isClient || e.to) this.ui.toast(e.t, e.c); break;
      case 'radio': if (this.isClient) { this.audio.sfx('radio'); this.ui.sub('MERKEZ', e.t, 'radio'); } break;
      case 'psay': this.ui.sub(e.n || 'Ekip', e.t, 'me'); break;
      case 'id': this.ui.showId(e.info); break;
      case 'dlg': { const n = this.npcs[e.i]; if (!n) break; this.dialog = { npc: n, opts: e.opts.map(l => ({ label: l })) }; this.menuSel = Math.min(this.menuSel || 0, e.opts.length - 1); this.ui.dialog(n, e.label, this.dialog.opts); this.highlightMenu(); break; }
      case 'dlgx': this.dialog = null; this.ui.dialog(null); break;
      case 'dmg': this.player.damage(e.d); break;
      case 'prog': this.player.action = { type: 'netprog', label: e.label, t: 0, dur: e.dur }; break;
      case 'aid': { const n = this.npcs[e.i]; if (n) this.player.action = { type: 'aid', npc: n, t: 0, dur: 4, hold: false }; break; }
      case 'shake': this.shake = Math.max(this.shake, e.v); break;
      case 'party': if (this.isClient) this.musicParty(e.on); break;
    }
  }
  // Lider -> istemciler: anlık durum
  sendSnap() {
    const m = this.mission, w = this.world;
    const ht = m.hostageTaker;
    const snap = {
      mid: this.mid,
      n: this.npcs.map(n => n.netState()),
      d: w.doors.map(d => [d.target > 0.5 ? 1 : 0, d.locked ? 1 : 0, d.broken ? 1 : 0, d.dir]),
      o: m.objectives.map(o => (o.done ? 1 : 0) | (o.failed ? 2 : 0) | (o.hidden ? 4 : 0)),
      t: [Math.round(m.hostageTimer * 10) / 10, ht && ht.hostage ? Math.round(ht.tension) : -1, m.jumper && m.jumper.state === 'edge' ? Math.round(m.jumper.tension) : -1],
      f: m.flags.fire ? (m.flags.fire.visible ? 1 : 0) : -1,
      x: m.failed || null, r: m.ready ? 1 : 0,
    };
    this.net.send('snap', snap);
  }
  applySnap(s) {
    for (const a of s.n) { const n = this.npcs[a[0]]; if (n) n.applyNet(a); }
    const w = this.world;
    s.d.forEach((v, i) => { const d = w.doors[i]; if (!d) return; d.locked = !!v[1]; if (v[2] && !d.broken) { d.broken = true; d.open = Math.max(d.open, 0.25); } d.dir = v[3]; d.target = v[0]; });
    const m = this.mission; let ch = false;
    s.o.forEach((v, i) => { const o = m.objectives[i]; if (!o) return; const done = !!(v & 1), failed = !!(v & 2), hidden = !!(v & 4); if (o.done !== done || o.failed !== failed || o.hidden !== hidden) { if (done && !o.done) { this.audio.sfx('objective'); this.ui.toast(`✓ ${o.text}`, 'ok'); } o.done = done; o.failed = failed; o.hidden = hidden; ch = true; } });
    if (ch) this.ui.objectives(m);
    m.hostageTimer = s.t[0];
    m.netTimers = s.t;
    if (m.flags.fire && s.f === 0) m.flags.fire.visible = false;
    if (s.x && !m.failed) { m.failed = s.x; this.ui.toast(s.x, 'bad'); this.audio.sfx('fail'); }
    m.netReady = !!s.r;
  }

  // ---------- Etkileşim ----------
  interact() { const c = this.candidate; if (c) c.run(); }
  findCandidate() {
    const p = this.player, pp = p.pos, w = this.world;
    const fwd = V(Math.sin(this.cam.yaw), 0, Math.cos(this.cam.yaw));
    let best = null, bs = 1e9;
    const consider = (score, label, run) => { if (score < bs) { bs = score; best = { label, run }; } };
    const front = (v) => { const d = V(v.x - pp.x, 0, v.z - pp.z); const L = d.length() || 1; return d.dot(fwd) / L; };
    for (const n of this.npcs) {
      if (n.removed) continue;
      const d = n.distTo(pp); const f = front(n.pos);
      if (n.state === 'hostageTaker' && d < 16 && f > 0.3) { consider(d * 0.3, `<kbd>E</kbd> Müzakere et`, () => this.openDialog(n)); continue; }
      if (n.state === 'edge' && d < 7) { consider(d * 0.3, `<kbd>E</kbd> Konuş`, () => this.openDialog(n)); continue; }
      if (d > 2.4 || f < 0.35 || Math.abs(n.pos.y - pp.y) > 1.2) continue;
      if (n.state === 'dead') continue;
      const sc = d - f * 0.8;
      if (n.state === 'injured') { consider(sc, `<kbd>E</kbd> basılı tut — İlk yardım uygula`, () => { this.player.action = { type: 'aid', npc: n, t: 0, dur: 4, hold: true }; }); continue; }
      if (p.slot === 2 && !n.cuffed && (n.cuffable || n.flags.presenting || n.down)) { consider(sc - 0.5, `<kbd>E</kbd> Kelepçele — ${this.labelFor(n)}`, () => this.startCuff(n)); continue; }
      if (['attack', 'shoot', 'flee', 'tased', 'jump'].includes(n.state)) continue;
      consider(sc, `<kbd>E</kbd> Konuş — ${this.labelFor(n)}${n.cuffed ? ' (kelepçeli)' : ''}`, () => this.openDialog(n));
    }
    w.interactables.forEach((it, j) => { if (!it.enabled()) return; const d = Math.hypot(it.pos.x - pp.x, it.pos.z - pp.z); if (d < it.radius) consider(d + 0.3, `<kbd>E</kbd> ${it.label}`, () => { if (this.isClient) this.netAct({ k: 'inter', j }); else it.action(); }); });
    for (const dr of w.doors) {
      const d = Math.hypot(dr.x - pp.x, dr.z - pp.z);
      if (d > 1.9) continue;
      const lab = dr.locked ? `<kbd>E</kbd> Kapıyı çal · <kbd>F</kbd> Kır` : `<kbd>E</kbd> ${dr.target > 0.5 ? 'Kapat' : 'Aç'}${dr.target < 0.5 ? ' · <kbd>F</kbd> Tekmele' : ''}`;
      consider(d + 0.6, lab, () => this.doorDo(dr, dr.locked ? 'knock' : 'toggle'));
    }
    const car = this.policeCar;
    if (car) {
      const ry = car.rotation.y; const L = V(Math.cos(ry), 0, -Math.sin(ry));
      const d = Math.min(...[1.3, -1.3].map(s => { const dp = car.position.clone().addScaledVector(L, s); return Math.hypot(dp.x - pp.x, dp.z - pp.z); }));
      if (d < 2.5) {
        const m = this.mission; const ready = this.isClient ? m.netReady || m.failed : m.ready || m.failed;
        consider(d + 0.4, ready ? `<kbd>E</kbd> Araca bin — görevi bitir` : (this.leaveConfirmT > 0 ? `<kbd>E</kbd> Eksik görevlerle bitirmek için tekrar bas` : `<kbd>E</kbd> Araca bin (görev tamamlanmadı)`), () => {
          if (ready || this.leaveConfirmT > 0) { this.audio.sfx('carDoor', car.position); if (this.isClient) this.netAct({ k: 'finish' }); else { this.ui.fade(true, 300); setTimeout(() => { this.ui.fade(false, 300); this.finishMission(); }, 320); } }
          else this.leaveConfirmT = 3;
        });
      }
    }
    return best;
  }
  doorSide(dr) { const p = this.player.pos; return dr.axis === 'x' ? (p.z < dr.z ? 1 : -1) : (p.x < dr.x ? -1 : 1); }
  doorDo(dr, op) {
    const side = this.doorSide(dr);
    if (this.isClient) { this.netAct({ k: 'door', d: dr.netIdx, op, side }); if (op === 'knock') this.playerSay('Polis! Kapıyı açın!'); return; }
    this.doorAction(dr, op, side, this.player);
  }
  startCuff(n) {
    if (this.isClient) { this.netAct({ k: 'cuff', i: n.netIdx }); return; }
    this.hostCuff(n, this.player);
  }
  kick() {
    const p = this.player, pp = p.pos;
    let door = null, bd = 2.0;
    for (const dr of this.world.doors) { const d = Math.hypot(dr.x - pp.x, dr.z - pp.z); if (d < bd && dr.target < 0.5) { bd = d; door = dr; } }
    if (!door) { this.shove(); return; }
    this.vm.push();
    if (!door.kickedLocal) { door.kickedLocal = true; this.playerSay('FBI! OPEN UP!'); }
    this.later(0.2, () => this.doorDo(door, 'breach'));
  }
  shove() {
    const p = this.player, pp = p.pos, fwd = V(Math.sin(this.cam.yaw), 0, Math.cos(this.cam.yaw));
    this.vm.push();
    for (const n of this.npcs) {
      if (!n.alive || n.removed) continue; const d = n.distTo(pp);
      if (d < 1.8 && V(n.pos.x - pp.x, 0, n.pos.z - pp.z).normalize().dot(fwd) > 0.5) { this.sfx('shove', n.pos); if (this.isClient) this.netAct({ k: 'shove', i: n.netIdx }); else { n.tp = p; n.onShove(pp); } break; }
    }
  }
  shout() {
    const p = this.player;
    if (this.shoutT > 0) return; this.shoutT = 1.6;
    const armedNear = this.npcs.some(n => n.alive && n.weaponShown && n.distTo(p.pos) < 16);
    this.playerSay(armedNear ? 'POLİS! SİLAHI BIRAK!' : SHOUTS[Math.floor(Math.random() * SHOUTS.length)]);
    if (this.isClient) { this.netAct({ k: 'shout' }); return; }
    for (const n of this.npcs) if (n.alive && !n.removed && n.distTo(p.pos) < 16) n.onShout(p);
    this.mission.note('shout');
  }
  reload() {
    const p = this.player;
    if (p.reloadT > 0) return;
    if (p.slot === 1 && p.ammo < 17 && p.reserve > 0) { p.reloadT = 1.6; this.audio.sfx('reload'); this.reloadKind = 'glock'; }
    if (p.slot === 3 && p.taserLoaded < 2 && p.taserSpare > 0) { p.reloadT = 1.4; this.audio.sfx('reload'); this.reloadKind = 'taser'; }
  }
  onFire() {
    if (this.state !== 'play') return;
    if (this.dialog) { this.chooseDialog(this.menuSel || 0); return; }
    if (this.radioOpen) { this.chooseRadio(this.menuSel || 0); return; }
    const p = this.player; if (p.dead || p.reloadT > 0 || (p.action && p.action.type !== 'netprog')) return;
    if (p.slot === 0) { this.shove(); return; }
    if (p.slot === 2) { this.interact(); return; }
    if (p.fireT > 0) return;
    if (p.slot === 1) this.fireGlock();
    if (p.slot === 3) this.fireTaser();
  }
  aimRay(spread = 0) {
    const dir = V(); this.camera.getWorldDirection(dir);
    if (spread) { dir.x += (Math.random() - 0.5) * spread; dir.y += (Math.random() - 0.5) * spread; dir.z += (Math.random() - 0.5) * spread; dir.normalize(); }
    return { o: this.camera.getWorldPosition(V()), d: dir };
  }
  traceNPC(o, d, maxT, extraR = 0) {
    let best = null, bt = maxT;
    for (const n of this.npcs) {
      if (n.removed || n.state === 'dead') continue;
      if (n.distTo(o) > maxT + 2) continue;
      for (const s of n.char.hitSpheres()) { const t = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, s.p.x, s.p.y, s.p.z, s.r + extraR); if (t >= 0 && t < bt) { bt = t; best = { npc: n, part: s.part, t, p: o.clone().addScaledVector(d, t) }; } }
    }
    return best;
  }
  fireGlock() {
    const p = this.player;
    if (p.ammo <= 0) { this.audio.sfx('dry'); this.toast('Şarjör boş — R', 'warn', false); p.fireT = 0.25; return; }
    p.ammo--; p.fireT = 0.14; this.ui.setSlot(p.slot, p);
    const spread = p.aiming ? (p.speedNow > 2 ? 0.025 : 0.004) : 0.05;
    const { o, d } = this.aimRay(spread);
    const muzzle = this.vm.muzzleWorld();
    const wh = this.world.raycast(o, d, 120);
    const nh = this.traceNPC(o, d, wh ? wh.t : 120);
    const end = nh ? nh.p : o.clone().addScaledVector(d, wh ? wh.t : 80);
    this.fx.muzzle(muzzle); this.fx.tracer(muzzle, end); this.sfx('gunshot', p.pos);
    const right = V(-Math.cos(this.cam.yaw), 0, Math.sin(this.cam.yaw)); this.fx.shell(muzzle.clone().addScaledVector(right, 0.05), right);
    const sl = this.vm.glock.userData.slide; sl.position.z = -0.03; this.later(0.06, () => { sl.position.z = 0; });
    this.vm.kick(1); this.cam.pitch += 0.02 + Math.random() * 0.012; this.cam.yaw += (Math.random() - 0.5) * 0.014; this.shake = Math.max(this.shake, 0.05);
    if (nh) {
      const dmg = nh.part === 'head' ? 120 : nh.part === 'body' ? 38 : 24;
      this.fx.blood(nh.p); this.hitMarkT = 0.15;
      if (this.isClient) this.netAct({ k: 'hit', i: nh.npc.netIdx, part: nh.part, dmg });
      else { nh.npc.lastHitBy = 'player'; if (!nh.npc.guilty) nh.npc.flags.shotByPlayer = true; nh.npc.takeHit(nh.part, dmg, 'bullet'); }
    } else if (wh) this.fx.impact(end);
    if (this.isClient) this.netAct({ k: 'shot' }); else { this.broadcastGunshot(p.pos, true); this.mission.note('fired'); }
  }
  fireTaser() {
    const p = this.player;
    if (p.taserLoaded <= 0) { this.audio.sfx('dry'); this.toast('Kartuş yok — R', 'warn', false); p.fireT = 0.3; return; }
    p.taserLoaded--; p.fireT = 0.9; this.ui.setSlot(p.slot, p);
    const { o, d } = this.aimRay(p.aiming ? 0.008 : 0.035);
    const wh = this.world.raycast(o, d, 12);
    const nh = this.traceNPC(o, d, Math.min(wh ? wh.t : 12, 11), 0.12);
    this.sfx('taser', p.pos); this.vm.kick(0.5);
    const from = this.vm.muzzleWorld();
    if (nh && nh.npc.distTo(p.pos) < 10) { this.fx.wires(from, nh.npc); if (this.isClient) this.netAct({ k: 'tase', i: nh.npc.netIdx }); else nh.npc.tase(); }
    else { const end = o.clone().addScaledVector(d, wh ? wh.t : 8); const b = beam('#bfe7ff', 0.8); b.position.copy(from); b.lookAt(end); b.scale.set(1, 1, from.distanceTo(end)); this.scene.add(b); this.fx.add(b, 1.0, null); }
  }

  // ---------- Kare ----------
  frame() {
    const now = performance.now(); let dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    if (this.state === 'end' || (this.state === 'paused' && !(this.net.active && this.role !== 'solo'))) dt = 0;
    this.t += dt;
    try { this.update(dt); } catch (e) { console.error(e); }
    this.composer.render();
  }
  update(dt) {
    const p = this.player, cam = this.camera;
    for (let i = this.timers.length - 1; i >= 0; i--) { const t = this.timers[i]; t.t -= dt; if (t.t <= 0) { this.timers.splice(i, 1); try { t.fn(); } catch (e) { console.error(e); } } }
    if (this.shoutT > 0) this.shoutT -= dt;
    if (this.leaveConfirmT > 0) this.leaveConfirmT -= dt;
    if (this.policeCar) updatePoliceLights(this.policeCar, dt);
    if (this.world) this.world.update(dt, this.t);
    if (this.state === 'menu' || this.state === 'lobby') {
      const a = this.t * 0.06; cam.position.set(-1.8 + Math.sin(a) * 1.2, 1.45 + Math.sin(this.t * 0.3) * 0.1, 6.6 + Math.cos(a) * 0.4); cam.lookAt(3.2, 1.15, 0.2); cam.fov = 55; cam.updateProjectionMatrix();
      if (this.menuChars) this.menuChars.forEach(c => c.update(dt));
      this.fx.update(dt, this.t, cam.position);
      this.audio.listener = { pos: cam.position, right: V(1, 0, 0) };
      return;
    }
    if (!this.mission || this.state === 'end') return;
    const m = this.mission;
    for (const r of this.remotes.values()) r.update(dt);
    const sens = 0.0022 * this.sens * (p.aiming ? 0.6 : 1);
    const mdx = this.mouse.dx, mdy = this.mouse.dy; this.mouse.dx = this.mouse.dy = 0;
    // lider: ağ eşitleme
    if (this.isHostNet) {
      this.snapT -= dt; if (this.snapT <= 0) { this.snapT = 0.1; this.sendSnap(); }
      for (const r of this.remotes.values()) if (r.aimingAt && !r.inCar) r.aimingAt.onAimed(dt);
      if (!m.failed && this.state !== 'incar' && this.allPlayers(true).every(pl => pl.dead)) this.checkAllDead();
      for (const [peer, D] of this.hostDialogs) { const r = this.remotes.get(peer); const n = D.npc; const lim = n.state === 'hostageTaker' ? 18 : n.state === 'edge' ? 9 : 4.5; if (!r || !n.alive || n.removed || n.distTo(r.pos) > lim || ['attack', 'shoot', 'flee', 'tased', 'jump'].includes(n.state)) this.closeDialogFor(r || { peer, local: false }); }
    }
    if (this.state === 'incar' || this.state === 'exiting') {
      this.cam.carYaw = clamp(this.cam.carYaw - mdx * sens, -1.8, 1.8); this.cam.carPitch = clamp(this.cam.carPitch - mdy * sens, -0.5, 0.4);
      const car = this.policeCar; const s = SEATS[this.seat] || SEATS[0]; const head = car.localToWorld(V(s[0], s[1], s[2]));
      cam.position.copy(head);
      const yaw = car.rotation.y + this.cam.carYaw, pit = this.cam.carPitch;
      cam.lookAt(head.clone().add(V(Math.sin(yaw) * Math.cos(pit), Math.sin(pit), Math.cos(yaw) * Math.cos(pit))));
      cam.fov = 64; cam.updateProjectionMatrix();
      this.vm.hide();
      for (const n of this.npcs) n.update(dt);
      if (!this.isClient) m.update(dt);
      this.fx.update(dt, this.t, cam.position);
      this.audio.listener = { pos: cam.position, right: V(-Math.cos(yaw), 0, Math.sin(yaw)) };
      this.ui.drawMap(this); this.ui.timers(m);
      this.pushPresence(dt, 'car');
      return;
    }
    const menuOpen = !!(this.dialog || this.radioOpen);
    const paused = this.state === 'paused';
    if (!menuOpen && !p.dead && !paused) { this.cam.yaw -= mdx * sens; this.cam.pitch = clamp(this.cam.pitch - mdy * sens, -1.35, 1.3); }
    p.aiming = this.mouse.r && (p.slot === 1 || p.slot === 3) && !menuOpen && !p.dead && !p.action && !paused;
    const fwd = V(Math.sin(this.cam.yaw), 0, Math.cos(this.cam.yaw)), right = V(-Math.cos(this.cam.yaw), 0, Math.sin(this.cam.yaw));
    const mv = V();
    if (!menuOpen && !p.dead && !paused && !(p.action && p.action.type === 'cuff')) {
      if (this.keys.has('KeyW')) mv.add(fwd); if (this.keys.has('KeyS')) mv.sub(fwd);
      if (this.keys.has('KeyD')) mv.add(right); if (this.keys.has('KeyA')) mv.sub(right);
    }
    if (mv.lengthSq() > 0 && p.action && p.action.type === 'aid') { p.action = null; this.ui.progress(null); }
    const run = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const spd = p.aiming ? 2.1 : run ? 6.0 : 3.2;
    if (mv.lengthSq() > 0) mv.normalize().multiplyScalar(spd);
    p.vel = p.vel || V(); p.vel.x = damp(p.vel.x, mv.x, 12, dt); p.vel.z = damp(p.vel.z, mv.z, 12, dt);
    p.pos.x += p.vel.x * dt; p.pos.z += p.vel.z * dt;
    p.speedNow = Math.hypot(p.vel.x, p.vel.z);
    this.world.collide(p.pos, 0.36);
    const b = this.world.bounds; p.pos.x = clamp(p.pos.x, b.minX - 2, b.maxX + 2); p.pos.z = clamp(p.pos.z, b.minZ - 2, b.maxZ + 2);
    const gh = this.world.heightAt(p.pos.x, p.pos.z, p.pos.y);
    p.vy -= 20 * dt; p.pos.y += p.vy * dt; if (p.pos.y <= gh) { p.pos.y = gh; p.vy = 0; }
    p.yaw = this.cam.yaw; p.root.rotation.y = p.yaw;
    // adım sesi (ev içinde farklı zemin)
    p.stepAcc += p.speedNow * dt; if (p.stepAcc > (run ? 1.05 : 0.8)) { p.stepAcc = 0; const inside = this.world.houseInfo && this.world.houseInfo.inside(p.pos); this.audio.sfx(inside || this.mission.info.interior && p.pos.z > 5 ? 'stepin' : 'step', null, run ? 1.3 : 1); }
    // eylemler
    if (p.fireT > 0) p.fireT -= dt;
    if (p.reloadT > 0) { p.reloadT -= dt; if (p.reloadT <= 0) { if (this.reloadKind === 'glock') { const take = Math.min(17 - p.ammo, p.reserve); p.ammo += take; p.reserve -= take; } else { const take = Math.min(2 - p.taserLoaded, p.taserSpare); p.taserLoaded += take; p.taserSpare -= take; } this.ui.setSlot(p.slot, p); } }
    if (p.action) {
      const a = p.action; a.t += dt;
      if (a.type === 'aid') {
        if (a.hold && !this.keys.has('KeyE')) { p.action = null; this.ui.progress(null); }
        else if (!a.npc.alive || a.npc.state !== 'injured' || a.npc.distTo(p.pos) > 2.6) { p.action = null; this.ui.progress(null); }
        else { this.ui.progress(a.t / a.dur, 'İlk yardım'); if (a.t >= a.dur) { if (this.isClient) this.netAct({ k: 'aid', i: a.npc.netIdx }); else this.completeFirstAid(a.npc); p.action = null; this.ui.progress(null); } }
      } else if (a.type === 'cuff') {
        this.ui.progress(a.t / a.dur, 'Kelepçeleniyor');
        a.npc.faceTo(p.pos, dt, 2);
        if (a.t >= a.dur) { if (a.npc.alive && !a.npc.cuffed) { a.npc.cuff(); a.npc.escortBy = p; this.toast(`${this.labelFor(a.npc)} kelepçelendi`, 'ok'); } p.action = null; this.ui.progress(null); }
      } else if (a.type === 'netprog') {
        this.ui.progress(a.t / a.dur, a.label); if (a.t >= a.dur) { p.action = null; this.ui.progress(null); }
      }
    }
    // birinci şahıs kamera
    const eye = p.dead ? 0.35 : (p.action && p.action.type === 'aid') ? 1.05 : 1.66;
    this.cam.eye = damp(this.cam.eye || eye, eye, 8, dt);
    const pit = this.cam.pitch;
    const dir = V(Math.sin(this.cam.yaw) * Math.cos(pit), Math.sin(pit), Math.cos(this.cam.yaw) * Math.cos(pit));
    cam.position.set(p.pos.x, p.pos.y + this.cam.eye, p.pos.z);
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt * 2.5); const s = this.shake * 0.06; cam.position.add(V((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s)); }
    cam.lookAt(cam.position.clone().add(dir));
    cam.fov = damp(cam.fov, p.aiming ? 52 : 74, 12, dt); cam.updateProjectionMatrix();
    p.root.visible = false;
    if (!p.dead) this.vm.update(dt, { aiming: p.aiming, speed: p.speedNow, reloading: p.reloadT > 0, mx: mdx, my: mdy }); else this.vm.hide();
    // fener
    if (p.flash && p.slot === 1 && !p.dead) { const lp = this.vm.glock.userData.lens.getWorldPosition(V()); p.torch.position.copy(lp); p.torch.target.position.copy(cam.position).addScaledVector(dir, 20); p.torch.intensity = 26; this.vm.glock.userData.lens.material.emissiveIntensity = 6; }
    else { p.torch.intensity = 0; if (this.vm.glock.userData.lens) this.vm.glock.userData.lens.material.emissiveIntensity = 0.2; }
    // nişan hedefi + silah görünce telaş
    p.aimingAt = null;
    if ((p.slot === 1 || p.slot === 3) && !menuOpen && !p.dead) {
      const { o, d } = this.aimRay(0); const wh = this.world.raycast(o, d, 40, { ignoreSmall: true });
      const nh = this.traceNPC(o, d, wh ? wh.t : 40, 0.25);
      if (nh && (p.aiming || nh.t < 12)) { p.aimingAt = nh.npc; if (!this.isClient) nh.npc.onAimed(dt); }
    }
    if (!this.isClient) this.gunFear(dt);
    this.ui.cross(!p.dead && !menuOpen, p.slot === 1 || p.slot === 3 ? (p.aiming ? (p.speedNow > 2 ? 0.025 : 0.004) : 0.05) : -1, this.hitMarkT > 0);
    if (this.hitMarkT > 0) this.hitMarkT -= dt;
    // NPC'ler & görev
    for (const n of this.npcs) n.update(dt);
    if (this.dialog && !this.isClient) {
      const n = this.dialog.npc; const lim = n.state === 'hostageTaker' ? 18 : n.state === 'edge' ? 9 : 4.5;
      if (!n.alive || n.removed || n.distTo(p.pos) > lim || ['attack', 'shoot', 'flee', 'tased', 'jump'].includes(n.state)) this.closeDialog();
    }
    if (!this.isClient) m.update(dt);
    if (m.flags.fire && m.flags.fire.visible) { const d = Math.hypot(p.pos.x - m.flags.fireAt.x, p.pos.z - m.flags.fireAt.z); this.audio.loop('fire', d < 30, { vol: 0.2 }); if (d < 30) this.audio.setLoopVol('fire', clamp(0.5 - d / 60, 0.02, 0.4)); }
    this.candidate = (!menuOpen && !p.dead && !p.action && !paused) ? this.findCandidate() : null;
    this.ui.prompt(this.candidate ? this.candidate.label : (p.reloadT > 0 ? 'Şarjör değiştiriliyor…' : p.dead ? 'Ağır yaralısın — ekibin görevi sürdürüyor' : null));
    this.uiT = (this.uiT || 0) - dt; if (this.uiT <= 0) { this.uiT = 0.3; this.ui.objectives(m); this.ui.team(this); }
    this.ui.timers(m);
    this.dmgFx = Math.max(0, this.dmgFx - dt * 0.8); this.ui.damage(this.dmgFx + (p.hp < 35 ? 0.25 + Math.sin(this.t * 4) * 0.1 : 0));
    this.ui.drawMap(this);
    this.fx.update(dt, this.t, cam.position);
    this.audio.listener = { pos: cam.position, right };
    this.pushPresence(dt, p.dead ? 'dead' : 'play');
  }
  gunFear(dt) {
    for (const pl of this.allPlayers()) {
      if (!pl.weaponDrawn || pl.dead) continue;
      for (const n of this.npcs) {
        if (n.guilty || !n.alive || n.removed || n === pl.aimingAt || n.role !== 'bystander') continue;
        if (['idle', 'walk', 'talk', 'sit', 'dance'].includes(n.state) && n.distTo(pl.pos) < 6) {
          n.fear += dt * (pl.aiming ? 0.6 : 0.25);
          if (n.fear > 0.6 && !n.flags.gunScare) { n.flags.gunScare = true; if (Math.random() < 0.5) { n.leaveTo(n.awayPoint(9)); n.flags.vanish = false; } n.char.setExpression('scared'); if (Math.random() < 0.7) n.bark('scared', true); }
        } else n.fear = Math.max(0, n.fear - dt * 0.05);
      }
    }
  }
  pushPresence(dt, st) {
    if (!this.net.active || this.role === 'solo') return;
    this.presT = (this.presT || 0) - dt; if (this.presT > 0) return; this.presT = 0.05;
    const p = this.player;
    this.net.presence({ mid: this.mid, st, p: A3(p.pos), y: Math.round(this.cam.yaw * 100) / 100, pi: Math.round(this.cam.pitch * 100) / 100, s: p.slot, a: p.aiming ? 1 : 0, at: p.aimingAt ? p.aimingAt.netIdx : -1, hp: Math.max(0, Math.round(p.hp)), sp: Math.round(p.speedNow * 10) / 10 });
  }
}

async function boot() {
  try { await document.fonts.load('700 20px Inter'); await document.fonts.load('400 20px Inter'); } catch (e) { }
  window.__game = new Game();
}
if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', boot); else boot();
