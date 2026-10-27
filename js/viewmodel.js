// Birinci şahıs: kameraya bağlı eller ve silahlar.
import * as THREE from 'three';
import { createGlock, createTaser, createCuffs } from './items.js';
import { mat, boxGeo, rbox, M, G } from './kit.js';
import { damp } from './util.js';

export class ViewModel {
  constructor(camera) {
    this.cam = camera;
    this.root = new THREE.Group(); camera.add(this.root);
    this.sway = new THREE.Group(); this.root.add(this.sway);
    const sleeve = mat('#1b2640', { r: 0.85 }), glove = mat('#111214', { r: 0.6 }), vest = mat('#16181c', { r: 0.9 });
    const mkArm = () => {
      const g = new THREE.Group();
      M(rbox(0.075, 0.085, 0.09, 0.02), glove, 0, 0, 0, 0, 0, 0, g, false);
      M(boxGeo(0.085, 0.09, 0.34), sleeve, 0, -0.01, 0.2, 0, 0, 0, g, false);
      M(boxGeo(0.088, 0.093, 0.03), mat('#0d1220', {}), 0, -0.01, 0.045, 0, 0, 0, g, false);
      return g;
    };
    // silahlar (kamera -z yönüne bakar => modeli 180° çevir)
    const wrap = (obj, s) => { const g = new THREE.Group(); obj.rotation.y = Math.PI; obj.scale.setScalar(s); g.add(obj); return g; };
    this.glock = createGlock({ scale: 1.0 }); this.taser = createTaser(); this.cuffs = createCuffs();
    this.items = [null, wrap(this.glock, 1), wrap(this.taser, 0.72), wrap(this.cuffs, 0.7)];
    this.armR = mkArm(); this.armL = mkArm();
    this.holder = new THREE.Group(); this.sway.add(this.holder);
    for (const it of this.items) if (it) { it.visible = false; this.holder.add(it); }
    this.holder.add(this.armR); this.sway.add(this.armL);
    this.armR.rotation.set(0.1, 0.25, 0); this.armR.position.set(0.012, -0.045, 0.03);
    this.slot = 0; this.k = 0; this.bob = 0; this.recoil = 0; this.lower = 1; this.equipT = 0; this.pushT = 0;
    this.root.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; o.renderOrder = 10; } });
    this.light = new THREE.PointLight(0xc8d8ff, 0.5, 1.4, 2); this.light.position.set(0.25, 0.15, -0.1); this.root.add(this.light);
    this.root.visible = false;
  }
  set(slot) {
    if (slot === this.slot) return;
    this.slot = slot; this.equipT = 0.25;
    this.items.forEach((it, i) => { if (it) it.visible = i === [0, 1, 3, 2][slot]; });
  }
  kick(a = 1) { this.recoil = Math.min(1.5, this.recoil + a); }
  push() { this.pushT = 0.3; }
  muzzleWorld() {
    const g = this.slot === 1 ? this.glock : this.taser;
    return g.localToWorld(g.userData.muzzle.clone());
  }
  update(dt, { aiming, speed, reloading, mx = 0, my = 0 }) {
    this.root.visible = true;
    const has = this.slot !== 0;
    this.k = damp(this.k, aiming ? 1 : 0, 14, dt);
    this.lower = damp(this.lower, (reloading ? 0.6 : 0) + (this.equipT > 0 ? 1 : 0), 10, dt);
    if (this.equipT > 0) this.equipT -= dt;
    this.recoil = damp(this.recoil, 0, 12, dt);
    this.bob += dt * speed * 2.1;
    const bobA = Math.min(1, speed / 4) * (1 - this.k * 0.8);
    const bx = Math.sin(this.bob) * 0.012 * bobA, by = -Math.abs(Math.cos(this.bob)) * 0.014 * bobA;
    // sallanma (fare hareketine gecikmeli)
    this.sway.position.x = damp(this.sway.position.x, -mx * 0.00045 * (1 - this.k * 0.7), 8, dt);
    this.sway.position.y = damp(this.sway.position.y, my * 0.00045 * (1 - this.k * 0.7), 8, dt);
    // kalça / nişan pozisyonları
    const hip = this.slot === 2 ? [0.16, -0.2, -0.36] : this.slot === 3 ? [0.14, -0.2, -0.4] : [0.17, -0.17, -0.38];
    const ads = this.slot === 1 ? [0, -0.073, -0.3] : this.slot === 3 ? [0, -0.055, -0.3] : hip;
    const k = this.slot === 2 ? 0 : this.k;
    const h = this.holder;
    h.position.set(hip[0] + (ads[0] - hip[0]) * k + bx, hip[1] + (ads[1] - hip[1]) * k + by - this.lower * 0.25, hip[2] + (ads[2] - hip[2]) * k + this.recoil * 0.05);
    h.rotation.set(this.recoil * 0.18 + this.lower * 0.6, (1 - k) * 0.06, (1 - k) * -0.04);
    h.visible = has;
    // sol el: nişanda kabzayı destekler, itmede öne çıkar
    if (this.pushT > 0) this.pushT -= dt;
    const push = this.pushT > 0 ? Math.sin((0.3 - this.pushT) / 0.3 * Math.PI) : 0;
    const supp = has && this.slot !== 2 ? 1 : 0;
    this.armL.visible = supp > 0 || push > 0;
    if (push > 0) { this.armL.position.set(-0.08, -0.16, -0.32 - push * 0.15); this.armL.rotation.set(0, -0.2, 0); }
    else { this.armL.position.set(h.position.x - 0.025, h.position.y - 0.03, h.position.z + 0.05); this.armL.rotation.set(0.15, -0.35, 0.2); }
    if (!has && push > 0) { this.armR.visible = false; }
  }
  hide() { this.root.visible = false; }
}
