// NPC yapay zekası: durum makinesi, hareket, tepki, dövüş, rehine/intihar mantığı.
import * as THREE from 'three';
import { Character, describe } from './character.js';
import { createKnife, createPistol, createBat, createPhone, createGasCan, createSprayCan } from './items.js';
import { clamp, dampAngle, angleDiff, rng } from './util.js';

const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

export const BARKS = {
  flee: [['Siktir! Polis!', 'tr'], ['Kaçın!', 'tr'], ['Yakalayamazsın beni!', 'tr'], ['Fuck!', 'en']],
  attack: [['Gel lan buraya!', 'tr'], ['Fuck off!', 'en'], ['Sana mı soracağım!', 'tr'], ['Defol git aynasız!', 'tr']],
  hitPlayer: [['Fuck off!', 'en'], ['Al bakalım!', 'tr'], ['Get the fuck out!', 'en'], ['Bas git!', 'tr']],
  shoot: [['Yaklaşma! Sıkarım!', 'tr'], ['Fuck you, cops!', 'en'], ['Geri çekil!', 'tr']],
  surrender: [['Tamam tamam! Ateş etme!', 'tr'], ['Teslim oluyorum!', 'tr'], ['Tamam abi, sakin!', 'tr'], ['Okay, okay! Don\'t shoot!', 'en']],
  scared: [['Ne yapıyorsun?! Silahı indir!', 'tr'], ['Aman Allah\'ım!', 'tr'], ['Lütfen ateş etmeyin!', 'tr'], ['İmdat!', 'tr'], ['Biri polisi... ah, siz zaten polissiniz!', 'tr']],
  panic: [['Silah sesi! Yere yatın!', 'tr'], ['Kaçın, ateş ediyorlar!', 'tr'], ['Çocuklar içeri girin!', 'tr'], ['Ne oluyor ya?!', 'tr']],
  fight: [['Seni gebertirim!', 'tr'], ['Bırak lan!', 'tr'], ['Gel bakalım!', 'tr'], ['Kafanı kırarım!', 'tr'], ['Ne bakıyorsun lan?!', 'tr']],
  argue: [['Sen kimsin de bana laf ediyorsun?!', 'tr'], ['Benim hakkımı yiyemezsin!', 'tr'], ['Bağırma bana!', 'tr'], ['Herkes duysun bu adamın yaptığını!', 'tr'], ['Sus artık!', 'tr']],
  pain: [['Ahh! Vuruldum!', 'tr'], ['Aaah! Yardım edin!', 'tr'], ['Fuck! Fuck!', 'en']],
  tased: [['Aaaargh!', 'tr'], ['Aaa! Tamam tamam!', 'tr']],
  cuffResist: [['Bırak beni!', 'tr'], ['Dokunma bana!', 'tr'], ['Get off me!', 'en']],
  hostage: [['Yaklaşmayın! Vururum onu!', 'tr'], ['Bir adım daha atarsan sıkarım!', 'tr'], ['Herkes geri çekilsin!', 'tr']],
  hostageVictim: [['Lütfen... yardım edin...', 'tr'], ['Ölmek istemiyorum!', 'tr']],
  bystanderCuriosity: [['Ne oluyor orada?', 'tr'], ['Polis geldi, iyi oldu.', 'tr'], ['Video çekiyorum bunu.', 'tr'], ['Abi şunları bir ayırın!', 'tr']],
  thanks: [['Çok teşekkür ederim memur bey.', 'tr'], ['Allah razı olsun.', 'tr'], ['Sağ olun, iyi ki geldiniz.', 'tr']],
  drunk: [['Hıh... ben gayet iyiyim memur bey...', 'tr'], ['Herkes beni seviyor!', 'tr'], ['Bir tane daha içelim!', 'tr']],
};
export function pickBark(k) { const l = BARKS[k]; return l[Math.floor(Math.random() * l.length)]; }

let NPC_ID = 0;
export function resetNpcIds() { NPC_ID = 0; }
export const STATES = ['idle', 'talk', 'walk', 'leave', 'follow', 'goto', 'fight', 'argue', 'flee', 'attack', 'shoot', 'surrender', 'kneel', 'present', 'cuffed', 'cuffedDown', 'tased', 'down', 'injured', 'stable', 'dead', 'cower', 'handsUp', 'panic', 'hostageTaker', 'hostage', 'edge', 'jump', 'hide', 'sit', 'sitGround', 'dance', 'drunk', 'vandal', 'deal', 'celebrate'];
export class NPC {
  constructor(game, app, role, pos, o = {}) {
    this.id = ++NPC_ID;
    this.game = game; this.world = game.world;
    this.app = app; this.role = role; this.name = `${app.name} ${app.surname}`;
    this.char = new Character(app);
    this.root = this.char.root; game.scene.add(this.root);
    this.pos = this.root.position; this.pos.copy(pos); this.pos.y = this.world.heightAt(pos.x, pos.z, pos.y + 0.3);
    this.home = pos.clone();
    this.yaw = o.yaw ?? Math.random() * Math.PI * 2;
    this.state = o.state || 'idle'; this.stateT = 0;
    this.hp = 100; this.vy = 0;
    this.guilty = !!o.guilty; this.armed = o.armed || null; this.wanted = !!o.wanted;
    this.fakeId = !!o.fakeId; this.promil = o.promil || 0; this.items = o.items || [];
    this.compliance = o.compliance ?? 0.7; this.aggression = o.aggression ?? 0.2; this.fear = 0;
    this.plan = o.plan || 'comply';
    this.speedWalk = 1.45 + Math.random() * 0.3; this.speedRun = o.runSpeed ?? (4.4 + Math.random() * 0.8);
    this.wanderR = o.wanderR ?? 0;
    this.flags = {}; this.hooks = o.hooks || {};
    this.lines = o.lines || {};
    this.partner = null; this.target = null; this.path = null; this.dest = null;
    this.barkT = 2 + Math.random() * 4; this.attackT = 0; this.shootT = 1.5;
    this.aimedT = 0; this.stuckT = 0; this.lastPos = this.pos.clone(); this.side = 0;
    this.triggered = false; this.removed = false;
    this.speed = 0; this.mood = o.mood || 'neutral';
    this.tension = o.tension ?? 40; this.trust = 0;
    this.bleed = 0;
    this.age = app.age;
    this.desc = describe(app);
    if (this.armed) this.weaponMesh = this.armed === 'knife' ? createKnife() : this.armed === 'gun' ? createPistol() : this.armed === 'bat' ? createBat() : null;
    if (o.prop === 'phone') this.char.hold(createPhone());
    if (o.prop === 'gas') this.char.hold(createGasCan());
    if (o.prop === 'spray') this.char.hold(createSprayCan());
    this.weaponShown = false;
    this.root.rotation.y = this.yaw;
    this.setState(this.state, true);
  }
  get alive() { return !['dead'].includes(this.state) && !this.removed; }
  get down() { return ['tased', 'down', 'injured', 'stable', 'dead', 'kneel', 'surrender', 'cuffed', 'cuffedDown', 'lyingCuffed'].includes(this.state); }
  get cuffable() { return ['surrender', 'kneel', 'tased', 'down', 'cower', 'handsUp', 'present', 'stable', 'injured'].includes(this.state) || this.flags.presenting; }
  get isThreat() { return ['attack', 'shoot', 'hostageTaker'].includes(this.state) || (this.weaponShown && !['surrender', 'kneel', 'cuffed', 'down', 'tased', 'dead', 'injured', 'stable'].includes(this.state)); }
  setState(s, force = false) {
    if (this.state === s && !force) return;
    const prev = this.state; this.prevState = prev;
    this.state = s; this.stateT = 0;
    const c = this.char;
    const show = (on) => { if (!this.weaponMesh) return; if (on && !this.weaponShown) { c.hold(this.weaponMesh); this.weaponShown = true; } if (!on && this.weaponShown) { c.hold(null); this.weaponShown = false; } };
    switch (s) {
      case 'idle': case 'walk': case 'wander': case 'follow': case 'leave': c.setPose(this.flags.phone ? 'phone' : 'idle'); c.setExpression(this.mood === 'angry' ? 'angry' : this.mood === 'sad' ? 'sad' : this.mood === 'happy' ? 'happy' : 'neutral'); break;
      case 'talk': c.setPose('idle'); break;
      case 'fight': c.setPose('fight'); c.setExpression('angry'); break;
      case 'argue': c.setPose('argue'); c.setExpression('angry'); break;
      case 'flee': c.setPose('idle'); c.setExpression('scared'); break;
      case 'attack': c.setPose(this.armed === 'knife' || this.armed === 'bat' ? 'holdItem' : 'fight'); c.setExpression('angry'); show(this.armed === 'knife' || this.armed === 'bat'); break;
      case 'shoot': c.setPose('aim1'); c.setExpression('angry'); show(true); break;
      case 'surrender': c.setPose('handsUp'); c.setExpression('scared'); show(false); break;
      case 'kneel': c.setPose('kneel'); c.setExpression('scared'); show(false); break;
      case 'present': c.setPose('cuffed'); c.setExpression('sad'); show(false); break;
      case 'cuffed': c.setPose('cuffed'); c.setExpression('sad'); show(false); break;
      case 'cuffedDown': c.setPose('lyingCuffed'); c.setExpression('pain'); show(false); break;
      case 'tased': c.setPose('tased'); c.setExpression('tased'); show(false); break;
      case 'down': c.setPose('lying'); c.setExpression('pain'); show(false); break;
      case 'injured': c.setPose('injured'); c.setExpression('pain'); show(false); break;
      case 'stable': c.setPose('injured'); c.setExpression('sad'); break;
      case 'dead': c.setPose('dead'); c.setExpression('dead'); show(false); if (this.weaponMesh && prev !== 'dead') this.dropWeapon(); break;
      case 'cower': c.setPose('cower'); c.setExpression('scared'); break;
      case 'handsUp': c.setPose('handsUp'); c.setExpression('scared'); break;
      case 'panic': c.setPose('idle'); c.setExpression('scared'); break;
      case 'hostageTaker': c.setPose('hostageTaker'); c.setExpression('angry'); show(true); break;
      case 'hostage': c.setPose('hostage'); c.setExpression('scared'); break;
      case 'edge': c.setPose('edge'); c.setExpression('sad'); break;
      case 'sit': c.setPose('sit'); break;
      case 'sitGround': case 'hide': c.setPose('sitGround'); c.setExpression(this.role === 'child' ? 'sad' : 'scared'); break;
      case 'dance': c.setPose('dance'); c.setExpression('happy'); break;
      case 'drunk': c.setPose('idle'); c.setExpression('happy'); break;
      case 'vandal': c.setPose('holdItem'); c.setExpression('smug'); break;
      case 'deal': c.setPose('holdItem'); c.setExpression('smug'); break;
      case 'celebrate': c.setPose('aim1'); c.setExpression('happy'); show(true); break;
      case 'jump': c.setPose('handsUp'); c.setExpression('scared'); break;
    }
  }
  dropWeapon() {
    if (!this.weaponMesh) return;
    this.char.hold(null); this.weaponShown = false;
    const m = this.weaponMesh; m.position.set(this.pos.x + Math.sin(this.yaw) * 0.6, this.pos.y + 0.03, this.pos.z + Math.cos(this.yaw) * 0.6); m.rotation.set(0, Math.random() * 6, Math.PI / 2);
    this.game.scene.add(m); this.droppedWeapon = m; this.weaponMesh = null; this.armed = null;
    this.game.evidence(this, 'Silah düşürüldü');
  }
  bark(kind, force = false) {
    if (!force && this.barkT > 0) return;
    this.game.npcVoice(this, kind);
    this.barkT = 4 + Math.random() * 4;
  }
  // İstemci: liderden gelen durumu oynat
  applyNet(a) {
    // a = [i, x, y, z, yaw, stateIdx, flags]
    this.nt = this.nt || this.pos.clone();
    this.nt.set(a[1], a[2], a[3]); this.nyaw = a[4];
    const st = STATES[a[5]];
    const f = a[6];
    if (st && st !== this.state) { this.setState(st, true); }
    this.cuffed = !!(f & 1); this.flags.cuffed = this.cuffed;
    const ws = !!(f & 2);
    if (this.weaponMesh) { if (ws && !this.weaponShown) { this.char.hold(this.weaponMesh); this.weaponShown = true; } else if (!ws && this.weaponShown) { this.char.hold(null); this.weaponShown = false; } }
    this.guiltyKnown = !!(f & 4);
    this.flags.idChecked = !!(f & 8);
    this.triggered = !!(f & 16);
    if (f & 32) { if (!this.removed) this.remove(); }
  }
  netState() {
    let f = 0; if (this.cuffed) f |= 1; if (this.weaponShown) f |= 2; if (this.guilty && this.triggered) f |= 4; if (this.flags.idChecked) f |= 8; if (this.triggered) f |= 16; if (this.removed) f |= 32;
    const r = (v) => Math.round(v * 100) / 100;
    return [this.netIdx, r(this.pos.x), r(this.pos.y), r(this.pos.z), r(this.yaw), STATES.indexOf(this.state), f];
  }
  puppet(dt) {
    if (this.nt) {
      const dx = this.nt.x - this.pos.x, dz = this.nt.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d > 4) this.pos.copy(this.nt); else { const k = 1 - Math.exp(-10 * dt); this.pos.x += dx * k; this.pos.z += dz * k; this.pos.y += (this.nt.y - this.pos.y) * k; }
      this.speed = Math.min(7, d / Math.max(dt, 0.001) * 0.35);
      this.yaw = dampAngle(this.yaw, this.nyaw ?? this.yaw, 10, dt);
    }
    this.root.rotation.y = this.yaw; this.char.speed = this.speed; this.char.update(dt);
  }
  say(text, lang = 'tr') { this.game.say(this, text, lang); }
  faceTo(p, dt, speed = 8) { const a = Math.atan2(p.x - this.pos.x, p.z - this.pos.z); this.yaw = dt ? dampAngle(this.yaw, a, speed, dt) : a; }
  distTo(p) { return Math.hypot(p.x - this.pos.x, p.z - this.pos.z); }
  moveToward(p, spd, dt, stopAt = 0.4) {
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z, d = Math.hypot(dx, dz);
    if (d < stopAt) { this.speed = 0; return true; }
    let a = Math.atan2(dx, dz);
    if (this.side) a += this.side * 1.2;
    this.yaw = dampAngle(this.yaw, a, 10, dt);
    const step = Math.min(spd * dt, d);
    this.pos.x += Math.sin(this.yaw) * step; this.pos.z += Math.cos(this.yaw) * step;
    this.speed = spd;
    return false;
  }
  playerPos() { return (this.tp || this.game.player).pos; }
  seesPlayer(maxD = 22) {
    const p = this.tp || this.game.player; if (p.inCar || p.dead) return false;
    const d = this.distTo(p.pos); if (d > maxD) return false;
    tmp.set(this.pos.x, this.pos.y + 1.6, this.pos.z); tmp2.set(p.pos.x, p.pos.y + 1.5, p.pos.z);
    return this.world.los(tmp, tmp2);
  }
  // Polis ile ilk temas
  confront(trigger = 'approach') {
    if (!this.guilty || this.triggered || !this.alive) return;
    if (['cuffed', 'dead', 'injured', 'stable', 'tased', 'down', 'hostageTaker', 'edge', 'goto'].includes(this.state)) return;
    this.triggered = true;
    let plan = this.plan;
    const aimed = this.game.isAimedAt(this);
    if (aimed && plan !== 'comply' && Math.random() < 0.4 + this.compliance * 0.4) plan = 'comply';
    if (trigger === 'shout' && plan === 'flee' && Math.random() < 0.25) plan = 'comply';
    this.decide(plan, trigger);
  }
  decide(plan, trigger) {
    this.game.mission.note(`plan:${plan}`);
    switch (plan) {
      case 'comply': if (trigger !== 'approach') { this.setState('surrender'); this.bark('surrender', true); } else this.setState('idle'); break;
      case 'flee': this.startFlee(); break;
      case 'fight': this.setState('attack'); this.bark('attack', true); break;
      case 'shoot': if (this.armed === 'gun') { this.setState('shoot'); this.bark('shoot', true); } else { this.setState('attack'); this.bark('attack', true); } break;
      case 'bluff': this.setState('idle'); break;
    }
  }
  startFlee() {
    const esc = this.world.anchors.escape || [];
    if (!esc.length) { this.setState('attack'); return; }
    const pp = this.playerPos();
    let best = null, bs = -1e9;
    for (const e of esc) { const s = Math.hypot(e.x - pp.x, e.z - pp.z) - this.distTo(e) * 0.6; if (s > bs) { bs = s; best = e; } }
    this.path = [];
    const h = this.world.houseInfo;
    if (h && h.inside(this.pos)) { const hp = h.route(this.pos, 'back'); for (const d of Object.values(h.doors)) if (d !== h.doors.front) d.target = 1; this.path.push(...hp); }
    else if (this.fleePath) this.path.push(...this.fleePath.map(p => p.clone()));
    this.path.push(best.clone());
    this.setState('flee'); this.bark('flee', true);
    this.game.event('flee', this);
  }
  // Oyuncunun eylemleri
  onShout(by) {
    if (!this.alive) return;
    if (by) this.tp = by;
    const d = this.distTo(this.playerPos());
    if (this.guilty) {
      if (!this.triggered) { this.confront('shout'); return; }
      const aimed = this.game.isAimedAt(this) || (this.tp && this.tp.weaponDrawn);
      if (['flee', 'attack', 'idle', 'fight', 'argue', 'talk', 'drunk', 'vandal', 'deal', 'celebrate'].includes(this.state)) {
        const p = this.compliance * 0.5 + (aimed ? 0.3 : 0) + (this.hp < 60 ? 0.25 : 0) - this.aggression * 0.3;
        if (Math.random() < p) { this.setState('surrender'); this.bark('surrender', true); this.game.mission.note('shoutComply'); }
        else if (this.state === 'idle' || this.state === 'talk' || this.state === 'drunk') { if (Math.random() < 0.5) this.startFlee(); else { this.setState('attack'); this.bark('attack', true); } }
        else this.bark(this.state === 'flee' ? 'flee' : 'attack');
      } else if (this.state === 'surrender' && d < 9) { this.setState('kneel'); }
      else if (this.state === 'shoot') { if (Math.random() < this.compliance * 0.35 + (this.hp < 70 ? 0.3 : 0)) { this.setState('surrender'); this.dropWeapon(); this.bark('surrender', true); } }
    } else if (['fight', 'argue'].includes(this.state)) {
      if (Math.random() < 0.85) { this.setState('idle'); this.mood = 'angry'; this.say(this.role === 'victim' ? 'Memur bey, o başlattı!' : 'Tamam, tamam...'); }
    } else if (['idle', 'walk', 'wander', 'sit', 'dance', 'drunk', 'talk'].includes(this.state) && d < 10) {
      if (this.game.mission.wantClear && !['hostage', 'child', 'injured', 'jumper'].includes(this.role) && Math.random() < 0.9) { this.say(['Tamam, uzaklaşıyoruz.', 'Peki memur bey!', 'Ne oluyor? Tamam gidiyorum.'][Math.floor(Math.random() * 3)]); this.flags.cleared = true; this.leaveTo(this.awayPoint(17)); }
      else if (this.role !== 'hostage' && this.role !== 'child') { this.setState('handsUp'); this.flags.handsUpT = 3; }
    }
  }
  awayPoint(r) {
    const pp = this.game.mission.focus || this.playerPos();
    const dx = this.pos.x - pp.x, dz = this.pos.z - pp.z, d = Math.hypot(dx, dz) || 1;
    const b = this.world.bounds;
    return new THREE.Vector3(clamp(pp.x + dx / d * r, b.minX + 1, b.maxX - 1), 0, clamp(pp.z + dz / d * r, b.minZ + 1, b.maxZ - 1));
  }
  leaveTo(p) { this.dest = p.clone(); this.setState('leave'); }
  onAimed(dt) {
    this.aimedT += dt * 2.2;
    if (!this.alive) return;
    if (this.guilty) {
      if (!this.triggered && this.distTo(this.playerPos()) < 22) this.confront('aim');
      else if (this.state === 'flee' && this.aimedT > 1.2 && Math.random() < dt * this.compliance * 0.8) { this.setState('surrender'); this.bark('surrender', true); }
      else if (this.state === 'attack' && this.aimedT > 1.0 && Math.random() < dt * (0.15 + this.compliance * 0.5)) { this.setState('surrender'); this.dropWeapon(); this.bark('surrender', true); }
      return;
    }
    if (['hostage', 'injured', 'stable', 'dead', 'edge', 'cuffed', 'cower'].includes(this.role === 'hostage' ? 'hostage' : this.state)) return;
    if (this.aimedT > 0.4) {
      if (!['handsUp', 'cower'].includes(this.state)) { this.setState(Math.random() < 0.5 ? 'handsUp' : 'cower'); this.bark('scared', true); this.game.mission.penaltyOnce('aimInnocent' + this.id, -5, 'Masum kişiye silah doğrultuldu'); }
      this.flags.handsUpT = 3;
    }
  }
  onGunshot(p, byPlayer) {
    if (!this.alive) return;
    const d = this.distTo(p); if (d > 45) return;
    if (this.guilty && !this.triggered) { this.confront('shot'); return; }
    if (this.guilty) { if (this.state === 'flee' && byPlayer && Math.random() < 0.35) { this.setState('surrender'); this.bark('surrender', true); } return; }
    if (['hostage', 'injured', 'stable', 'dead', 'edge', 'cuffed', 'hide'].includes(this.state)) return;
    this.fear = Math.min(1, this.fear + 0.7 - d * 0.01);
    if (Math.random() < 0.55) { this.setState('cower'); this.flags.cowerT = 6 + Math.random() * 5; }
    else { this.panicFrom = p.clone(); this.setState('panic'); this.dest = this.awayPoint(10 + Math.random() * 6); }
    if (Math.random() < 0.4) this.bark('panic');
  }
  onShove(from) {
    if (!this.alive || this.down) return;
    const dx = this.pos.x - from.x, dz = this.pos.z - from.z, d = Math.hypot(dx, dz) || 1;
    this.pushV = new THREE.Vector3(dx / d * 4, 0, dz / d * 4);
    this.char.shake = 0.3;
    if (this.state === 'fight') { this.setState('idle'); this.mood = 'angry'; this.say('Tamam be! Tamam!'); if (this.partner && this.partner.state === 'fight') this.partner.setState('idle'); }
    else if (this.guilty && Math.random() < this.aggression) { this.setState('attack'); this.bark('attack', true); }
    else if (!this.guilty) { this.say('Hey! Ne itiyorsun?'); this.game.mission.penaltyOnce('shove' + this.id, -3, 'Sivili ittin'); }
  }
  takeHit(part, dmg, kind = 'bullet') {
    if (!this.alive) return;
    const wasThreat = this.isThreat;
    this.hp -= dmg;
    this.game.mission.recordHit(this, part, kind, wasThreat);
    if (this.hooks.onHit) this.hooks.onHit(this, part);
    if (this.hp <= 0) {
      if (part === 'head' || this.hp < -45) { this.die(); }
      else { this.setState('injured'); this.bleed = 70; this.bark('pain', true); this.game.event('injured', this); }
      return;
    }
    this.char.shake = 0.35; this.bark('pain', true);
    if (this.guilty) {
      if (this.state === 'hostageTaker') { if (Math.random() < 0.5) this.executeHostage(); else { this.releaseHostage(); this.setState('shoot'); } return; }
      if (Math.random() < 0.5) { this.setState('surrender'); this.dropWeapon(); }
      else if (!this.triggered) this.confront('shot');
    } else if (!['hostage', 'injured', 'stable'].includes(this.state)) { this.setState('cower'); this.flags.cowerT = 10; }
  }
  die() {
    if (this.hostage) this.releaseHostage();
    this.setState('dead'); this.hp = -100;
    this.game.event('death', this);
    if (this.hooks.onDeath) this.hooks.onDeath(this);
  }
  tase() {
    if (!this.alive) return;
    const wasCompliant = ['surrender', 'kneel', 'handsUp', 'cuffed', 'present', 'cower'].includes(this.state);
    this.game.mission.recordTase(this, wasCompliant);
    this.game.event('tased', this);
    if (this.hostage) { if (Math.random() < 0.35) { this.executeHostage(); } this.releaseHostage(); }
    this.setState('tased'); this.bark('tased', true);
    if (this.weaponMesh && this.weaponShown) this.dropWeapon();
    else if (this.weaponMesh && Math.random() < 0.5) this.dropWeapon();
  }
  cuff() {
    this.flags.presenting = false;
    if (['down', 'tased', 'injured', 'stable'].includes(this.state)) { this.setState(this.state === 'injured' || this.state === 'stable' ? this.state : 'cuffedDown'); this.flags.cuffed = true; }
    else this.setState('cuffed');
    this.flags.cuffed = true; this.cuffed = true;
    if (this.weaponMesh) this.dropWeapon();
    this.game.event('cuffed', this);
    if (this.hooks.onCuff) this.hooks.onCuff(this);
  }
  // cuff denemesi: direnç
  tryCuff() {
    if (this.cuffable || this.down) return true;
    if (!this.guilty) return Math.random() < 0.9;
    if (Math.random() < this.compliance + 0.15) return true;
    this.bark('cuffResist', true);
    if (Math.random() < 0.55) this.startFlee(); else { this.setState('attack'); }
    this.game.mission.note('resisted');
    this.flags.resisted = true;
    return false;
  }
  executeHostage() {
    const h = this.hostage; if (!h) return;
    if (this.armed === 'knife') this.game.sfx('slash', this.pos); else { this.game.sfx('gunshot', this.pos); this.game.fx.muzzle(this.handWorld()); }
    h.die(); this.hostage = null;
    this.game.event('hostageKilled', h);
    this.game.broadcastGunshot(this.pos, false);
    this.setState(Math.random() < 0.5 ? 'shoot' : 'surrender');
    if (this.state === 'surrender') { this.dropWeapon(); this.bark('surrender', true); } else this.bark('shoot', true);
  }
  releaseHostage() {
    const h = this.hostage; if (!h) return; this.hostage = null;
    if (h.alive) { h.setState('flee'); h.path = [this.game.carPos().clone()]; h.flags.rescued = true; h.say('Kurtulduuum!'); this.game.event('hostageFreed', h); }
  }
  handWorld() { const v = new THREE.Vector3(); this.char.handR.getWorldPosition(v); return v; }
  headWorld() { const v = new THREE.Vector3(); this.char.head.getWorldPosition(v); return v; }

  update(dt) {
    if (this.removed) return;
    if (this.game.isClient) { this.puppet(dt); return; }
    this.stateT += dt; this.barkT -= dt; this.aimedT = Math.max(0, this.aimedT - dt);
    const g = this.game; this.tp = g.nearestPlayer(this.pos); const p = this.tp, pp = p.pos;
    const dP = this.distTo(pp);
    this.speed = 0;
    // pasif tetik
    if (this.guilty && !this.triggered && !p.inCar && dP < (this.triggerDist ?? 6.5) && this.seesPlayer(this.triggerDist ?? 6.5)) this.confront('approach');
    switch (this.state) {
      case 'idle': case 'talk':
        if (this.talkingTo) { this.faceTo(this.talkingTo.pos, dt, 6); break; }
        if (this.lookAtPlayer || dP < 5) this.faceTo(pp, dt, 3);
        else if (this.lookAt) this.faceTo(this.lookAt, dt, 3);
        if (this.wanderR > 0 && this.stateT > 3 + Math.random() * 6) { this.dest = this.home.clone().add(new THREE.Vector3((Math.random() - 0.5) * this.wanderR * 2, 0, (Math.random() - 0.5) * this.wanderR * 2)); this.setState('walk'); }
        if (this.flags.drunk && Math.random() < dt * 0.15) this.bark('drunk');
        break;
      case 'walk': if (!this.dest || this.moveToward(this.dest, this.speedWalk, dt) || this.stateT > 12) this.setState('idle'); break;
      case 'goto': {
        if (!this.path || !this.path.length) { this.setState('idle'); if (this.onArrive) { const f = this.onArrive; this.onArrive = null; f(); } break; }
        if (this.moveToward(this.path[0], this.gotoRun ? this.speedRun : this.speedWalk * 1.2, dt, 0.45)) this.path.shift();
        if (this.stateT > 30) this.setState('idle');
        break;
      }
      case 'leave':
        if (!this.dest || this.moveToward(this.dest, this.speedWalk * 1.3, dt, 0.6) || this.stateT > 20) { if (this.flags.vanish) this.remove(); else this.setState('idle'); }
        break;
      case 'follow': {
        const leader = this.leader || p;
        const lp = leader.pos;
        if (this.distTo(lp) > 2.0) this.moveToward(lp, this.distTo(lp) > 5 ? this.speedRun * 0.8 : this.speedWalk * 1.2, dt, 1.6); else this.faceTo(lp, dt, 4);
        break;
      }
      case 'fight': {
        const t = this.target;
        if (!t || !t.alive || t.removed || t.state === 'flee' || t.cuffed || ['surrender', 'kneel', 'present', 'handsUp', 'cower', 'tased', 'down', 'injured', 'stable'].includes(t.state)) { this.setState('idle'); break; }
        if (!t.down && !['fight', 'cower'].includes(t.state) && t.role !== 'bystander' && this.stateT > 2 && Math.random() < dt * 0.5) { t.target = this; t.setState('fight'); }
        if (t) {
          if (this.distTo(t.pos) > 1.0) this.moveToward(t.pos, this.speedWalk * 1.6, dt, 0.95); else this.faceTo(t.pos, dt, 10);
          this.attackT -= dt;
          if (this.attackT <= 0 && this.distTo(t.pos) < 1.3) { this.attackT = 0.7 + Math.random() * 0.8; g.sfx('punch', this.pos); t.char.shake = 0.25; if (t.guilty === false && t.role === 'victim') t.hp -= 2; }
        }
        if (Math.random() < dt * 0.5) this.bark('fight');
        break;
      }
      case 'argue':
        if (this.partner) this.faceTo(this.partner.pos, dt, 4);
        if (this.barkT <= 0 && Math.random() < dt * 1.2 && dP < 30) { const l = this.lines.argue; if (l && l.length) this.say(l[Math.floor(Math.random() * l.length)]); else this.bark('argue'); this.barkT = 3 + Math.random() * 3; }
        break;
      case 'flee': {
        if (!this.path || !this.path.length) { this.setState('idle'); break; }
        const tgt = this.path[0];
        if (this.moveToward(tgt, this.speedRun * (this.hp < 60 ? 0.6 : 1) * (this.flags.drunk ? 0.7 : 1), dt, 0.8)) { this.path.shift(); if (!this.path.length && this.guilty) this.escape(); else if (!this.path.length) this.setState('idle'); }
        const b = this.world.bounds;
        if (this.guilty && (this.pos.x < b.minX - 3 || this.pos.x > b.maxX + 3 || this.pos.z < b.minZ - 3 || this.pos.z > b.maxZ + 3)) this.escape();
        if (this.flags.rescued && this.distTo(g.carPos()) < 3.5) { this.setState('cower'); this.flags.cowerT = 999; this.flags.safe = true; }
        break;
      }
      case 'attack': {
        if (p.dead) { this.setState('idle'); break; }
        if (this.armed === 'gun' && dP > 3.5) { this.setState('shoot'); break; }
        if (dP > 1.15) this.moveToward(pp, this.speedRun * (this.hp < 50 ? 0.6 : 0.95), dt, 1.0); else this.faceTo(pp, dt, 12);
        this.attackT -= dt;
        if (dP < 1.4 && this.attackT <= 0) {
          this.attackT = 0.75 + Math.random() * 0.5;
          this.char.setPose(this.armed === 'knife' || this.armed === 'bat' ? 'shove' : 'punch'); setTimeout(() => { if (this.state === 'attack') this.char.setPose(this.armed === 'knife' || this.armed === 'bat' ? 'holdItem' : 'fight'); }, 260);
          const dmg = this.armed === 'knife' ? 18 + Math.random() * 10 : this.armed === 'bat' ? 15 + Math.random() * 8 : 6 + Math.random() * 6;
          g.sfx(this.armed === 'knife' ? 'slash' : 'punch', this.pos);
          p.damage(dmg, this);
          if (Math.random() < 0.45) this.bark('hitPlayer', true);
        }
        if (this.stateT > 25 && Math.random() < dt * 0.2) this.startFlee();
        break;
      }
      case 'shoot': {
        if (p.dead) { this.setState('idle'); break; }
        this.faceTo(pp, dt, 9);
        const see = this.seesPlayer(40);
        if (!see && dP > 3) this.moveToward(pp, this.speedWalk * 1.4, dt, 6);
        else if (dP < 5) { // geri çekil
          tmp.set(this.pos.x - (pp.x - this.pos.x), 0, this.pos.z - (pp.z - this.pos.z));
          const sy = this.yaw; this.moveToward(tmp, this.speedWalk, dt); this.yaw = Math.atan2(pp.x - this.pos.x, pp.z - this.pos.z);
        }
        this.char.pitch = Math.atan2(pp.y + 1.3 - (this.pos.y + 1.4), dP) * 0.8;
        this.shootT -= dt;
        if (see && this.shootT <= 0) {
          this.shootT = 0.9 + Math.random() * 1.1;
          const hand = this.handWorld();
          tmp.set(pp.x, pp.y + 1.2 + (Math.random() - 0.5) * 0.8, pp.z);
          let hitP = clamp(0.72 - dP * 0.03, 0.18, 0.72) * (p.speedNow > 3 ? 0.6 : 1) * (p.aiming ? 0.9 : 1);
          const hit = Math.random() < hitP;
          if (!hit) tmp.add(new THREE.Vector3((Math.random() - 0.5) * 2.5, (Math.random() - 0.3) * 1.5, (Math.random() - 0.5) * 2.5));
          g.fx.muzzle(hand); g.fx.tracer(hand, tmp); g.sfx('gunshot', this.pos, 0.9);
          g.broadcastGunshot(this.pos, false);
          if (hit) { p.damage(12 + Math.random() * 12, this); if (Math.random() < 0.4) this.bark('hitPlayer', true); }
          else g.fx.impact(tmp);
        }
        if (this.barkT <= 0 && Math.random() < dt) this.bark('shoot');
        break;
      }
      case 'surrender':
        this.faceTo(pp, dt, 3);
        if (this.flags.fleeAfterSurrender && this.stateT > 4 && dP > 6 && Math.random() < dt * 0.15) { this.startFlee(); }
        break;
      case 'kneel': case 'present': this.faceTo(pp, dt, 2); break;
      case 'cuffed': {
        const ep = this.escortBy || p;
        if (this.escort && !ep.inCar) {
          const pp = ep.pos;
          tmp.set(pp.x - Math.sin(ep.yaw) * 1.3, 0, pp.z - Math.cos(ep.yaw) * 1.3);
          if (this.distTo(tmp) > 0.6) this.moveToward(tmp, this.distTo(tmp) > 3 ? this.speedRun * 0.7 : this.speedWalk * 1.3, dt, 0.4);
          else this.faceTo(pp, dt, 3);
        }
        break;
      }
      case 'cuffedDown': if (this.stateT > 1.8) this.setState('cuffed'); break;
      case 'tased':
        if (this.stateT > 3.2) { this.setState('down'); }
        break;
      case 'down':
        if (this.stateT > 7 && !this.cuffed) {
          // ayağa kalk
          if (this.guilty && Math.random() < 0.5 + this.aggression * 0.3 && this.plan !== 'comply') { if (Math.random() < 0.5) this.startFlee(); else this.setState('attack'); }
          else this.setState(this.guilty ? 'surrender' : 'cower');
        }
        break;
      case 'injured':
        this.bleed -= dt;
        if (this.bleed <= 0) { this.die(); g.event('bledOut', this); }
        if (Math.random() < dt * 0.2) this.say(this.guilty ? 'Ahh... yardım edin...' : 'Lütfen... ambulans...');
        break;
      case 'stable': break;
      case 'cower':
        if (this.flags.cowerT !== undefined) { this.flags.cowerT -= dt; if (this.flags.cowerT <= 0) { delete this.flags.cowerT; this.setState('idle'); } }
        else if (this.stateT > 8 && this.role !== 'hostage') this.setState('idle');
        break;
      case 'handsUp':
        this.faceTo(pp, dt, 4);
        if (this.flags.handsUpT !== undefined) { this.flags.handsUpT -= dt; if (this.flags.handsUpT <= 0 && !g.isAimedAt(this)) { delete this.flags.handsUpT; this.setState('idle'); } }
        break;
      case 'panic':
        if (!this.dest || this.moveToward(this.dest, this.speedRun * 0.85, dt, 0.8) || this.stateT > 6) { this.setState('cower'); this.flags.cowerT = 5 + Math.random() * 6; }
        break;
      case 'hostageTaker': this.updateHostage(dt, dP); break;
      case 'hostage':
        if (this.captor && this.captor.hostage === this) {
          const c = this.captor;
          this.yaw = c.yaw;
          this.pos.set(c.pos.x + Math.sin(c.yaw) * 0.45 - Math.cos(c.yaw) * 0.36, c.pos.y, c.pos.z + Math.cos(c.yaw) * 0.45 + Math.sin(c.yaw) * 0.36);
          if (Math.random() < dt * 0.1) this.bark('hostageVictim');
        }
        break;
      case 'edge': this.updateJumper(dt, dP); break;
      case 'jump': {
        const f = this.world.a('edgeFall');
        if (f) this.moveToward(f, 2.5, dt, 0.1);
        this.vy -= 18 * dt; this.pos.y += this.vy * dt;
        if (this.pos.y < -3) { this.remove(); g.event('jumped', this); }
        break;
      }
      case 'hide':
        if (dP < 3.2 && this.seesPlayer(4)) {
          if (this.guilty && !this.triggered) this.confront('found');
          else if (this.role === 'child') { this.setState('idle'); this.mood = 'sad'; }
          this.game.event('found', this);
        }
        break;
      case 'dance': case 'sit': case 'sitGround': case 'drunk': case 'vandal': case 'deal': case 'celebrate':
        if (this.state === 'celebrate') { this.shootT -= dt; if (this.shootT <= 0) { this.shootT = 1.5 + Math.random() * 3; const h = this.handWorld(); g.fx.muzzle(h); g.sfx('gunshot', this.pos, 0.8); g.fx.tracer(h, h.clone().add(new THREE.Vector3(Math.random() - 0.5, 8, Math.random() - 0.5))); g.broadcastGunshot(this.pos, false, true); } this.char.pitch = -1.2; }
        if (this.state === 'drunk') { this.pos.x += Math.sin(this.stateT * 0.9) * dt * 0.4; this.pos.z += Math.cos(this.stateT * 0.7) * dt * 0.3; this.speed = 0.4; this.yaw += Math.sin(this.stateT) * dt * 0.5; if (this.barkT <= 0) this.bark('drunk'); }
        break;
    }
    if (this.state === 'shoot' || this.state === 'celebrate') this.char.setPose('aim1');
    // itme
    if (this.pushV) { this.pos.addScaledVector(this.pushV, dt); this.pushV.multiplyScalar(Math.exp(-6 * dt)); if (this.pushV.lengthSq() < 0.01) this.pushV = null; }
    // ayrışma (diğer karakterlerle)
    if (!['hostage', 'jump'].includes(this.state)) {
      for (const o of g.npcs) {
        if (o === this || o.removed || o.state === 'hostage' || (this.state === 'hostageTaker' && o === this.hostage)) continue;
        const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z, d2 = dx * dx + dz * dz;
        if (d2 < 0.49 && d2 > 1e-6 && Math.abs(this.pos.y - o.pos.y) < 1) { const d = Math.sqrt(d2), push = (0.7 - d) * 0.5; this.pos.x += dx / d * push; this.pos.z += dz / d * push; }
      }
      if (!p.inCar) { const dx = this.pos.x - pp.x, dz = this.pos.z - pp.z, d2 = dx * dx + dz * dz; if (d2 < 0.5 && d2 > 1e-6) { const d = Math.sqrt(d2); this.pos.x += dx / d * (0.71 - d) * 0.6; this.pos.z += dz / d * (0.71 - d) * 0.6; } }
    }
    // çarpışma ve yerçekimi
    if (this.state !== 'jump' && this.state !== 'hostage') {
      this.world.collide(this.pos, 0.33);
      const h = this.world.heightAt(this.pos.x, this.pos.z, this.pos.y);
      if (this.pos.y > h + 0.02) { this.vy -= 20 * dt; this.pos.y = Math.max(h, this.pos.y + this.vy * dt); } else { this.pos.y = h; this.vy = 0; }
    }
    // takılma tespiti
    if (this.speed > 1) {
      const moved = Math.hypot(this.pos.x - this.lastPos.x, this.pos.z - this.lastPos.z);
      if (moved < this.speed * dt * 0.25) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt);
      if (this.stuckT > 0.5) { this.side = Math.random() < 0.5 ? -1 : 1; this.sideT = 0.8; this.stuckT = 0; }
    }
    if (this.sideT > 0) { this.sideT -= dt; if (this.sideT <= 0) this.side = 0; }
    this.lastPos.copy(this.pos);
    this.root.rotation.y = this.yaw;
    this.char.speed = this.speed;
    this.char.update(dt);
  }
  updateHostage(dt, dP) {
    const g = this.game, p = this.tp || g.player;
    const h = this.hostage;
    if (!h || !h.alive) { this.setState('shoot'); return; }
    this.faceTo(p.pos, dt, 4);
    // gerginlik
    let dT = -2;
    if (g.isAimedAt(this) || g.isAimedAt(h)) dT += 5;
    if (dP < 4.5) dT += 22; else if (dP < 7) dT += 6;
    if (p.speedNow > 3.5 && dP < 12) dT += 10;
    this.tFloor ??= 50;
    this.tension = clamp(this.tension + dT * dt, Math.min(this.tFloor, this.tension), 100);
    g.mission.hostageTension = this.tension;
    if (this.barkT <= 0 && dP < 25) { this.bark('hostage'); }
    if (this.tension >= 100) { this.say('Seni uyarmıştım!'); this.executeHostage(); }
    if (this.flags.release) { this.releaseHostage(); this.setState('surrender'); this.dropWeapon(); this.bark('surrender', true); g.event('hostageSurrender', this); }
  }
  updateJumper(dt, dP) {
    const g = this.game, p = this.tp || g.player;
    this.faceTo(p.pos, dt, 1.2);
    let dT = -0.8;
    if (dP < 2.2) dT += 18; else if (dP < 4) dT += 2;
    if (p.speedNow > 3.5 && dP < 10) dT += 12;
    if (g.isAimedAt(this)) dT += 15;
    if (p.weaponDrawn && dP < 10) dT += 3;
    this.tension = clamp(this.tension + dT * dt, 0, 100);
    g.mission.jumperTension = this.tension;
    if (this.tension >= 100 && !this.flags.jumped) { this.flags.jumped = true; this.say('Kimse beni anlamıyor... Hoşça kalın.'); this.vy = 2; this.setState('jump'); }
    if (this.trust >= 3 && !this.flags.saved) { this.flags.saved = true; this.say('Tamam... İneceğim. Yardım edin bana.'); const sp = this.world.a('scene'); this.dest = sp; this.leader = p; this.setState('follow'); g.event('jumperSaved', this); }
  }
  escape() {
    if (this.flags.escaped) return;
    this.flags.escaped = true; this.remove();
    this.game.event('escaped', this);
  }
  remove() {
    this.removed = true; this.game.scene.remove(this.root);
  }
}
