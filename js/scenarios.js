// Suç senaryoları ve görev değerlendirmesi.
import * as THREE from 'three';
import { randomAppearance, describe, shortDesc, policeAppearance } from './character.js';
import { createBag } from './items.js';
import { createCivilianCar, createVan } from './vehicles.js';
import { LOCATION_NAMES } from './locations.js';
import { RNG, clamp } from './util.js';
import { mat, boxGeo, cyl, M, ownMat, sph } from './kit.js';

const R = (rng, a) => a[Math.floor(rng.next() * a.length)];

export class Mission {
  constructor(game, crimeId, info, rng) {
    this.game = game; this.crimeId = crimeId; this.crime = CRIMES[crimeId]; this.info = info; this.rng = rng;
    this.objectives = []; this.log = []; this.keys = new Set(); this.notes = new Set(); this.flags = {};
    this.hooks = {}; this.ticks = []; this.time = 0; this.failed = null; this.dmgTaken = 0;
    this.title = this.crime.name; this.brief = []; this.mdt = [];
    this.parTime = 180; this.hostageTimer = 0; this.wantClear = false; this.focus = null;
    this.subtitle = '';
  }
  // ---- kayıt ----
  note(k) { this.notes.add(k); }
  bonus(key, pts, label) { if (this.keys.has(key)) return; this.keys.add(key); this.log.push({ pts, label }); if (pts > 0) this.game.toast(`+${pts}  ${label}`, 'ok'); }
  penaltyOnce(key, pts, label) { if (this.keys.has(key)) return; this.keys.add(key); this.log.push({ pts, label }); this.game.toast(`${pts}  ${label}`, 'bad'); }
  obj(id, text, pts = 20, o = {}) { const ob = { id, text, pts, done: false, failed: false, optional: !!o.optional, hidden: !!o.hidden }; this.objectives.push(ob); return ob; }
  getObj(id) { return this.objectives.find(o => o.id === id); }
  done(id) { const o = this.getObj(id); if (o && !o.done && !o.failed) { o.done = true; this.game.toast(`✓ ${o.text}`, 'ok'); this.game.audio.sfx('objective'); this.game.ui.objectives(this); } }
  failObj(id, why) { const o = this.getObj(id); if (o && !o.done && !o.failed) { o.failed = true; this.game.toast(`✗ ${o.text}${why ? ' — ' + why : ''}`, 'bad'); this.game.ui.objectives(this); } }
  failMission(reason) { if (this.failed) return; this.failed = reason; this.game.onMissionFailed(reason); }
  get ready() { return this.objectives.filter(o => !o.optional && !o.hidden).every(o => o.done || o.failed); }
  recordHit(npc, part, kind, wasThreat) {
    if (kind !== 'bullet') return;
    if (!npc.guilty) {
      if (npc.role === 'hostage') this.penaltyOnce('hitHostage' + npc.id, -40, 'Rehineyi vurdun!');
      else this.penaltyOnce('hitInnocent' + npc.id, -35, 'Masum bir kişiyi vurdun');
      npc.flags.shotByPlayer = true;
    } else if (!wasThreat) {
      this.penaltyOnce('hitUnarmed' + npc.id, npc.state === 'flee' ? -25 : -20, npc.state === 'flee' ? 'Kaçan silahsız şüpheliye ateş edildi' : 'Orantısız güç: tehdit oluşturmayan şüpheli vuruldu');
      npc.flags.unjust = true;
    } else { npc.flags.justified = true; }
  }
  recordTase(npc, compliant) {
    if (compliant) this.penaltyOnce('taseComp' + npc.id, -12, 'Teslim olmuş kişiye şok cihazı kullanıldı');
    else if (!npc.guilty && !['fight', 'attack'].includes(npc.state)) this.penaltyOnce('taseInn' + npc.id, -15, 'Masum kişiye şok cihazı kullanıldı');
    else if (npc.guilty && ['flee', 'attack', 'fight'].includes(npc.state)) this.bonus('taseGood' + npc.id, 4, 'Öldürücü olmayan güç kullanıldı');
  }
  onEvent(type, npc) {
    const g = this.game;
    switch (type) {
      case 'death':
        if (npc.flags.shotByPlayer && !npc.guilty) { this.failMission(npc.role === 'hostage' ? 'Rehine senin ateşinle hayatını kaybetti.' : 'Masum bir sivil senin ateşinle hayatını kaybetti.'); }
        else if (npc.guilty) { if (npc.flags.justified) this.bonus('neutral' + npc.id, 0, 'Silahlı şüpheli etkisiz hale getirildi (meşru müdafaa)'); else if (npc.flags.unjust) this.penaltyOnce('killUnjust' + npc.id, -30, 'Silahsız şüpheli hayatını kaybetti'); }
        break;
      case 'cuffed':
        if (npc.guilty) this.bonus('cuff' + npc.id, 0, '');
        else this.penaltyOnce('cuffInn' + npc.id, -18, 'Masum kişi kelepçelendi');
        npc.escort = true;
        break;
      case 'escaped': this.penaltyOnce('esc' + npc.id, -25, `${npc.name} olay yerinden kaçtı`); break;
      case 'released': if (npc.guilty) this.penaltyOnce('rel' + npc.id, -20, 'Suçlu serbest bırakıldı'); else this.bonus('relInn' + npc.id, 5, 'Masum kişi serbest bırakıldı'); break;
      case 'statement': this.bonus('st' + npc.id, 5, 'İfade alındı'); break;
      case 'idCheck': this.bonus('id' + npc.id, npc.guilty ? 4 : 2, 'Kimlik kontrolü yapıldı'); break;
      case 'firstAid': this.bonus('fa' + npc.id, 10, 'İlk yardım uygulandı'); break;
      case 'bledOut': if (!npc.guilty) this.penaltyOnce('bled' + npc.id, -20, 'Yaralı kan kaybından öldü'); else this.penaltyOnce('bledS' + npc.id, -10, 'Yaralı şüpheli kurtarılamadı'); break;
      case 'hostageKilled': this.failMission('Rehine hayatını kaybetti. Zamanında müdahale edemedik.'); break;
    }
    const h = this.hooks[type]; if (h) h.forEach(f => f(npc));
  }
  on(type, fn) { (this.hooks[type] ||= []).push(fn); }
  update(dt) {
    this.time += dt;
    for (const f of this.ticks) f(dt);
    if (this.hostageTimer > 0 && !this.failed) {
      this.hostageTimer -= dt;
      if (this.hostageTimer <= 0 && this.hostageTaker && this.hostageTaker.hostage) { this.hostageTaker.say('Süre doldu! Beni ciddiye almadınız!'); this.hostageTaker.executeHostage(); }
    }
  }
  evaluate(atCar) {
    const lines = [];
    let score = 0;
    for (const o of this.objectives) {
      if (o.hidden && !o.done) continue;
      if (o.done) { score += o.pts; lines.push({ pts: o.pts, label: o.text, ok: true }); }
      else if (!o.optional) { lines.push({ pts: 0, label: o.text + (o.failed ? ' (başarısız)' : ' (tamamlanmadı)'), ok: false }); }
    }
    for (const l of this.log) if (l.label) { score += l.pts; lines.push({ pts: l.pts, label: l.label, ok: l.pts >= 0 }); }
    // araca bindirilen şüpheliler
    const car = this.game.carPos();
    for (const n of this.game.npcs) if (n.cuffed && n.guilty && !n.removed && n.distTo(car) < 12) { score += 4; lines.push({ pts: 4, label: `${n.name} araca bindirildi`, ok: true }); }
    if (this.time < this.parTime && !this.failed && this.ready) { score += 6; lines.push({ pts: 6, label: `Hızlı müdahale (${Math.floor(this.time / 60)}:${String(Math.floor(this.time % 60)).padStart(2, '0')})`, ok: true }); }
    if (this.dmgTaken > 0) { const p = -Math.min(15, Math.round(this.dmgTaken / 7)); if (p) { score += p; lines.push({ pts: p, label: `Hasar alındı (${Math.round(this.dmgTaken)} can)`, ok: false }); } }
    else if (!this.failed && this.ready) { score += 4; lines.push({ pts: 4, label: 'Yara almadan tamamlandı', ok: true }); }
    const allReq = this.objectives.filter(o => !o.optional && !o.hidden);
    const success = !this.failed && allReq.every(o => o.done);
    score = clamp(Math.round(score), 0, 100);
    if (this.failed) score = Math.min(score, 30);
    else if (!success) score = Math.min(score, 59);
    const grade = this.failed ? 'F' : score >= 92 ? 'A+' : score >= 82 ? 'A' : score >= 72 ? 'B' : score >= 60 ? 'C' : score >= 45 ? 'D' : 'F';
    const gradeLabel = { 'A+': 'Kusursuz Müdahale', A: 'Çok İyi', B: 'İyi', C: 'Yeterli', D: 'Zayıf', F: 'Başarısız' }[grade];
    return { score, grade, gradeLabel, lines, success, failed: this.failed };
  }
}

// ---------------- Senaryo bağlamı ----------------
class S {
  constructor(game, mission, rng) { this.g = game; this.m = mission; this.rng = rng; this.w = game.world; this.info = mission.info; }
  a(name, i = null, jit = 0) {
    const l = this.w.anchors[name];
    let v;
    if (!l || !l.length) v = (this.w.anchors.scene ? this.w.anchors.scene[0] : new THREE.Vector3()).clone();
    else v = l[i === null ? Math.floor(this.rng.next() * l.length) : Math.min(i, l.length - 1)].clone();
    if (jit) { v.x += this.rng.range(-jit, jit); v.z += this.rng.range(-jit, jit); }
    return v;
  }
  app(o) { return randomAppearance(this.rng, o); }
  npc(role, pos, o = {}) { const n = this.g.spawnNPC(o.app || this.app(o.look || {}), role, pos, o); return n; }
  personality(o = {}) {
    const r = this.rng;
    const plan = o.plan || r.weighted(o.plans || [['comply', 4], ['flee', 3], ['fight', 2], ['bluff', 1.5]]);
    return Object.assign({ guilty: true, plan, compliance: r.range(0.25, 0.85), aggression: r.range(0.15, 0.8) }, o);
  }
  crowd(n, o = {}) {
    const out = [];
    const pts = (this.w.anchors[o.anchor || 'crowd'] || []).slice();
    const look = this.a('scene', 0);
    for (let i = 0; i < n && pts.length; i++) {
      const p = pts.splice(Math.floor(this.rng.next() * pts.length), 1)[0].clone();
      p.x += this.rng.range(-0.6, 0.6); p.z += this.rng.range(-0.6, 0.6);
      const b = this.npc('bystander', p, { compliance: 0.9, aggression: 0.05, wanderR: o.wander ?? (this.rng.chance(0.4) ? 2 : 0), prop: this.rng.chance(0.3) ? 'phone' : null, state: o.state || 'idle' });
      b.lookAt = look; b.lookAtPlayer = false;
      if (b.state === 'idle' && this.rng.chance(0.25)) b.flags.phone = true;
      out.push(b);
    }
    return out;
  }
  brief(...lines) { this.m.brief.push(...lines); }
  mdt(...lines) { this.m.mdt.push(...lines); }
  tick(fn) { this.m.ticks.push(fn); }
  arrest(npcs, id, text, pts = 30) {
    const ob = this.m.obj(id, text, pts);
    this.tick(() => {
      if (ob.done || ob.failed) return;
      if (npcs.some(n => n.flags.escaped)) { this.m.failObj(id, 'şüpheli kaçtı'); return; }
      if (npcs.some(n => n.flags.released)) { this.m.failObj(id, 'serbest bırakıldı'); return; }
      if (npcs.every(n => n.cuffed || n.state === 'dead')) { if (npcs.some(n => n.state === 'dead')) ob.pts = Math.round(pts * 0.6); this.m.done(id); }
    });
    return ob;
  }
  statement(npc, id = 'st', text = 'Mağdurun ifadesini al', pts = 10, optional = false) {
    const ob = this.m.obj(id, text, pts, { optional });
    this.m.on('statement', (n) => { if (n === npc) this.m.done(id); });
    return ob;
  }
  vehicleAt(anchor, kind = null, ry = Math.PI / 2) {
    const p = this.a(anchor, 0);
    const c = kind === 'van' ? createVan(this.rng.pick(['#e8e8e8', '#2a2f45', '#6b4a30'])) : createCivilianCar(this.rng, kind);
    c.position.set(p.x, 0, p.z); c.rotation.y = ry; this.w.dynamic.add(c);
    this.w.carCollider(p.x, p.z, ry, c, kind === 'van' ? 5.4 : 4.9, 2.0, kind === 'van' ? 2.3 : 1.5);
    return c;
  }
  driverFor(car, o = {}) {
    const ry = car.rotation.y;
    const side = new THREE.Vector3(Math.cos(ry), 0, -Math.sin(ry)); // aracın solu
    const p = car.position.clone().addScaledVector(side, 1.55);
    const n = this.npc('driver', p, o);
    n.yaw = ry + Math.PI / 2; n.flags.vehicle = true; n.flags.canBreath = true; n.car = car;
    return n;
  }
}

// Zaman çizelgesi kısayolu
function later(g, sec, fn) { g.later(sec, fn); }

function itemsFor(rng, kind) {
  return {
    drugs: [R(rng, ['Uyuşturucu madde (12 paket)', 'Bonzai (8 paket)', 'Esrar (45 gr)', 'Uyuşturucu hap (30 adet)'])],
    stolen: [R(rng, ['Çalıntı cüzdan', 'Çalıntı cep telefonu', 'Çalıntı kadın çantası', 'Çalıntı altın kolye'])],
    fake: [R(rng, ['Sahte banknotlar (4.200 ₺)', 'Sahte kimlik kartları', 'Sahte marka saatler (20 adet)'])],
    skimmer: ['Kart kopyalama cihazı', 'Boş banka kartları (15 adet)'],
    smuggle: R(rng, ['Kaçak sigara (40 karton)', 'Gümrük kaçağı telefon (25 adet)', 'Kaçak içki (60 şişe)', 'Bandrolsüz tütün (30 kg)']),
  }[kind];
}

function radioIntro(m, info, what) {
  return `Merkez'den 34-155 ekibine. ${info.address} — ${info.name} konumunda ${what} ihbarı var.`;
}

// ---------------- SUÇLAR ----------------
export const CRIMES = {};
function crime(id, name, locs, setup, weight = 1) { CRIMES[id] = { id, name, locs, setup, weight }; }

const FIGHT_LOCS = ['meydan', 'park', 'otobusDuragi', 'halisaha', 'cayBahcesi', 'kiraathane', 'sonDurak', 'dugun', 'pazarSokagi', 'semtPazari', 'sokakArasi', 'cikmazSokak', 'benzinlik', 'otopark', 'sahil', 'kopruAlti', 'internetKafe', 'hastane', 'otobusIci', 'siteGirisi', 'apartmanGirisi', 'okul', 'market', 'bakkal'];

function fightSetup(s, { groups = 1, label = 'kavga', weaponChance = 0.2 } = {}) {
  const m = s.m, rng = s.rng;
  const center = s.a('scene', 0);
  const aggressors = [], victims = [];
  for (let gi = 0; gi < groups; gi++) {
    const c = center.clone().add(new THREE.Vector3(gi * 2.2 - (groups - 1) * 1.1, 0, rng.range(-0.5, 0.5)));
    const armed = rng.chance(weaponChance) ? rng.pick(['knife', 'knife', 'bat', 'gun']) : null;
    const A = s.npc('suspect', c.clone().add(new THREE.Vector3(-0.5, 0, 0)), s.personality({ armed, plans: [['comply', 4], ['flee', 3], ['fight', 3], ['shoot', armed === 'gun' ? 3 : 0]], items: rng.chance(0.3) ? itemsFor(rng, 'drugs') : [], state: 'fight', mood: 'angry' }));
    const V = s.npc('victim', c.clone().add(new THREE.Vector3(0.5, 0, 0)), { compliance: 0.9, aggression: 0.3, state: 'fight', mood: 'angry' });
    A.target = V; V.target = A; A.partner = V; V.partner = A;
    V.flags.hurt = rng.chance(0.5);
    V.lines.statement = [R(rng, ['Bu adam üstüme yürüdü memur bey!', 'Sıramı aldı, bir şey dedim, yumruğu yapıştırdı!', 'Kız arkadaşıma laf attı, uyardım, saldırdı!', 'Arabama çarptı sonra bir de beni dövmeye kalktı!']), 'Ben sadece kendimi savundum.'];
    A.lines.excuse = [R(rng, ['O başlattı! Ben bir şey yapmadım!', 'Bana bakarak konuşuyordu, kimse bana öyle bakamaz!', 'Kendi işime bakıyordum, üstüme geldi!'])];
    aggressors.push(A); victims.push(V);
  }
  const by = s.crowd(rng.int(3, 6));
  const wit = by[0];
  if (wit) { wit.role = 'witness'; wit.lines.statement = [R(rng, ['Ben gördüm, şu adam başlattı.', 'İlk yumruğu atan şu, ' + shortDesc(aggressors[0].app) + ' olan.', 'Kavgayı o başlattı memur bey, ben şahidim.'])]; wit.knows = { npc: aggressors[0] }; }
  s.brief(radioIntro(m, s.info, label), `Birden fazla kişinin ${label === 'arbede' ? 'arbede yaşadığı' : 'birbirine girdiği'} bildirildi. Taraflardan biri ${rng.chance(0.5) ? 'yaralanmış olabilir' : 'oldukça agresif'}.`);
  if (aggressors.some(a => a.armed)) s.brief('İhbarcı, taraflardan birinin elinde silah gördüğünü söyledi. Dikkatli olun.');
  const ob = m.obj('stop', 'Kavgayı durdur', 15);
  s.tick(() => { if (!ob.done && ![...aggressors, ...victims].some(n => n.state === 'fight')) m.done('stop'); });
  s.arrest(aggressors, 'arrest', aggressors.length > 1 ? 'Saldırganları gözaltına al' : 'Saldırganı gözaltına al', 35);
  s.statement(victims[0], 'st', 'Mağdurun ifadesini al', 10);
  if (wit) m.obj('wit', 'Tanıkla konuş', 5, { optional: true }), m.on('statement', n => { if (n === wit) m.done('wit'); });
  m.on('cuffed', n => { if (victims.includes(n)) m.penaltyOnce('cuffVictim', -10, 'Mağdur kelepçelendi'); });
  m.focus = center;
}
crime('kavga', 'Kavga', FIGHT_LOCS, (s) => fightSetup(s, { label: 'kavga' }), 2);
crime('dovus', 'Dövüş', FIGHT_LOCS, (s) => fightSetup(s, { label: 'dövüş', weaponChance: 0.3 }));
crime('arbede', 'Arbede', FIGHT_LOCS, (s) => fightSetup(s, { groups: 2, label: 'arbede', weaponChance: 0.15 }));
crime('siddet', 'Şiddet', FIGHT_LOCS, (s) => fightSetup(s, { label: 'darp ve şiddet', weaponChance: 0.35 }));

const ARGUE_LOCS = ['bakkal', 'market', 'tekel', 'otopark', 'trafikIsiklari', 'siteGirisi', 'apartmanGirisi', 'semtPazari', 'pazarSokagi', 'kiraathane', 'cayBahcesi', 'otoYikama', 'hastane', 'eczane', 'kirtasiye', 'internetKafe', 'otobusIci', 'mustakil', 'meydan', 'benzinlik'];
function argueSetup(s, kind) {
  const m = s.m, rng = s.rng, c = s.a('scene', 0);
  const topics = {
    tartisma: ['park yeri', 'sıra', 'gürültü', 'borç'], anlasmazlik: ['kira', 'alışveriş ücreti', 'hasarlı ürün', 'otopark ücreti'],
    hakaret: ['hakaret'], tehdit: ['tehdit'],
  }[kind];
  const topic = rng.pick(topics);
  const guiltyMode = kind === 'tehdit' || kind === 'hakaret' || rng.chance(0.35);
  const A = s.npc(guiltyMode ? 'suspect' : 'party', c.clone().add(new THREE.Vector3(-0.8, 0, 0)), guiltyMode ? s.personality({ armed: kind === 'tehdit' && rng.chance(0.7) ? rng.pick(['knife', 'knife', 'gun']) : null, state: 'argue', mood: 'angry', plans: [['comply', 5], ['flee', 2], ['fight', 2], ['shoot', 1]] }) : { compliance: 0.8, aggression: 0.4, state: 'argue', mood: 'angry' });
  const B = s.npc('victim', c.clone().add(new THREE.Vector3(0.8, 0, 0)), { compliance: 0.9, aggression: 0.3, state: 'argue', mood: 'angry' });
  A.partner = B; B.partner = A; A.triggerDist = 3;
  A.lines.argue = { 'park yeri': ['Arabanı benim kapımın önüne park edemezsin!', 'Burası senin babanın malı mı?!'], 'sıra': ['Sıra bendeydi!', 'Gözünün önünde sıraya kaynak yaptın!'], 'gürültü': ['Gece yarısı ne bu gürültü?!', 'Çocuğum uyuyamıyor!'], 'borç': ['Paramı ne zaman vereceksin?!', 'Üç aydır oyalıyorsun beni!'], 'kira': ['Kira yine mi gecikti?!', 'Bu evden çıkacaksın!'], 'alışveriş ücreti': ['Bu fiyat fahiş!', 'Para üstümü eksik verdin!'], 'hasarlı ürün': ['Bozuk ürün sattın bana!', 'Değiştirmezsen burayı yıkarım!'], 'otopark ücreti': ['Yarım saat için bu para mı?!'], 'hakaret': ['Sen kime ne dediğini biliyor musun?!', 'Bir daha söyle de göreyim!', 'Ağzını topla!'], 'tehdit': ['Seni burada gebertirim!', 'Akşam evine geleceğim, görürsün!', 'Ailen de seni bulamaz!'] }[topic];
  B.lines.argue = ['Bağırma bana!', 'Polis gelince görürsün!', 'Sen de haklı değilsin!'];
  B.lines.statement = guiltyMode ? [kind === 'tehdit' ? 'Bu adam beni öldürmekle tehdit etti memur bey!' : kind === 'hakaret' ? 'Herkesin önünde bana ağza alınmayacak laflar etti.' : `${topic} yüzünden tartıştık, ama o işi büyüttü, üzerime yürüdü.`, A.armed ? 'Belinde bir şey var, gördüm!' : 'Şikayetçiyim.'] : [`${topic} meselesi yüzünden tartıştık.`, 'Şikayetçi değilim, sadece sakinleşsin yeter.'];
  A.lines.statement = guiltyMode ? ['Ben haklıyım! O başlattı!'] : [`O ${topic} konusunda haksızlık yapıyor.`, 'Tamam, sakinim. Şikayetçi değilim.'];
  if (A.armed && kind === 'tehdit') { A.weaponShownOnArgue = true; }
  s.crowd(rng.int(2, 4));
  s.brief(radioIntro(m, s.info, kind === 'tehdit' ? 'tehdit' : kind === 'hakaret' ? 'hakaret ve tartışma' : 'tartışma'), kind === 'tehdit' ? 'Bir şahsın diğerini öldürmekle tehdit ettiği bildirildi.' : `İki kişi arasında ${topic} nedeniyle tartışma çıktığı, olayın büyüyebileceği belirtildi.`);
  const talked = m.obj('talk', 'Taraflarla konuş', 15);
  s.tick(() => { if (!talked.done && A.flags.statement && B.flags.statement) m.done('talk'); });
  if (guiltyMode) s.arrest([A], 'arrest', kind === 'tehdit' ? 'Tehdit eden şahsı gözaltına al' : 'Saldırgan tarafı gözaltına al', 35);
  else {
    const calm = m.obj('calm', 'Tarafları sakinleştir ve uzlaştır', 30);
    s.tick(() => { if (!calm.done && A.flags.calmed && B.flags.calmed && A.state !== 'argue' && B.state !== 'argue') { m.done('calm'); A.mood = 'neutral'; B.mood = 'neutral'; A.say('Tamam, kusura bakma.'); later(s.g, 1.5, () => B.say('Önemli değil, geçmiş olsun.')); } });
    m.on('cuffed', n => { if (n === A || n === B) m.penaltyOnce('overArrest', -15, 'Gereksiz gözaltı'); });
  }
  m.focus = c;
}
crime('tartisma', 'Tartışma', ARGUE_LOCS, s => argueSetup(s, 'tartisma'));
crime('anlasmazlik', 'Anlaşmazlık', ARGUE_LOCS, s => argueSetup(s, 'anlasmazlik'));
crime('hakaret', 'Hakaret', ARGUE_LOCS, s => argueSetup(s, 'hakaret'));
crime('tehdit', 'Tehdit', [...ARGUE_LOCS, 'sokakArasi', 'cikmazSokak'], s => argueSetup(s, 'tehdit'));

const THEFT_LOCS = ['meydan', 'semtPazari', 'pazarSokagi', 'otobusDuragi', 'sonDurak', 'otobusIci', 'park', 'market', 'atm', 'sahil', 'hastane', 'cayBahcesi', 'otopark'];
function theftSetup(s, kind) {
  const m = s.m, rng = s.rng;
  const vic = s.npc('reporter', s.a('scene', 0, 1), { compliance: 1, mood: 'sad', look: { age: rng.int(30, 75) } });
  const crowd = s.crowd(rng.int(3, 6), { wander: 1.5 });
  const fleeNow = kind === 'kapkac' && rng.chance(0.6);
  const pos = fleeNow ? s.a('crowd', null, 1) : (crowd.length ? crowd[rng.int(0, crowd.length - 1)].pos.clone().add(new THREE.Vector3(1.2, 0, 0.6)) : s.a('crowd', null, 1));
  const sus = s.npc('suspect', pos, s.personality({ items: itemsFor(rng, 'stolen'), armed: kind === 'gasp' ? rng.pick(['knife', 'knife', 'gun']) : (rng.chance(0.15) ? 'knife' : null), plans: [['comply', 3], ['flee', kind === 'kapkac' ? 6 : 3], ['fight', 2], ['bluff', 3], ['shoot', kind === 'gasp' ? 1 : 0]], wanderR: 1.5 }));
  sus.triggerDist = kind === 'kapkac' ? 14 : 4.5;
  sus.lines.excuse = [R(rng, ['Ben mi? Ben sadece geçiyordum.', 'Otobüs bekliyorum abi.', 'Ne hırsızı? Yanlış adamdasınız.'])];
  const what = { hirsizlik: 'hırsızlık', kapkac: 'kapkaç', yankesicilik: 'yankesicilik', gasp: 'gasp' }[kind];
  vic.lines.statement = { hirsizlik: ['Çantamı sandalyenin yanına koymuştum, bir döndüm yok!', 'Az önce buralardaydı, hâlâ etrafta olabilir.'], kapkac: ['Arkadan koşarak geldi, çantamı kaptı ve kaçtı!', 'Düşüp dizimi yaraladım...'], yankesicilik: ['Kalabalıkta biri bana çarptı, sonra baktım cüzdanım yok!', 'Çok yakınımdaydı, kesin o aldı.'], gasp: ['Bıçak çekip telefonumu ve paramı aldı!', 'Hâlâ buralarda, çok korkuyorum!'] }[kind];
  vic.knows = { npc: sus }; vic.flags.hurt = kind === 'kapkac' || kind === 'gasp';
  s.brief(radioIntro(m, s.info, what), `İhbarcının ifadesine göre şüpheli ${shortDesc(sus.app)}.`);
  s.mdt(`Şüpheli eşkali: ${sus.desc}.`);
  s.statement(vic, 'st', 'Mağdurun ifadesini al', 10);
  s.arrest([sus], 'arrest', 'Şüpheliyi bul ve gözaltına al', 35);
  const ev = m.obj('ev', 'Çalınan eşyayı geri al (üst araması)', 15);
  m.on('evidence', n => { if (n === sus) m.done('ev'); });
  m.on('cuffed', n => { if (n === sus && !n.flags.frisked) later(s.g, 0.5, () => { n.flags.frisked = true; s.g.toast(`Gözaltı sonrası aramada bulundu: ${n.items.join(', ')}`, 'warn'); m.done('ev'); }); });
  m.on('cuffed', n => { if (!n.guilty && n.role === 'bystander') m.penaltyOnce('wrongMan', -15, 'Yanlış kişi gözaltına alındı'); });
  m.focus = vic.pos.clone();
}
crime('hirsizlik', 'Hırsızlık', THEFT_LOCS, s => theftSetup(s, 'hirsizlik'), 1.5);
crime('kapkac', 'Kapkaç', THEFT_LOCS, s => theftSetup(s, 'kapkac'));
crime('yankesicilik', 'Yankesicilik', ['otobusIci', 'semtPazari', 'pazarSokagi', 'sonDurak', 'otobusDuragi', 'meydan', 'dugun'], s => theftSetup(s, 'yankesicilik'));
crime('gasp', 'Gasp', ['sokakArasi', 'cikmazSokak', 'atm', 'park', 'otopark', 'kopruAlti', 'agaclik', 'otobusDuragi', 'sahil'], s => theftSetup(s, 'gasp'));

const SHOP_LOCS = ['bakkal', 'market', 'tekel', 'eczane', 'kirtasiye', 'benzinlik', 'internetKafe'];
crime('silahliSoygun', 'Silahlı Gasp', SHOP_LOCS, (s) => {
  const m = s.m, rng = s.rng;
  const clerk = s.npc('clerk', s.a('counter', 0), { compliance: 1, mood: 'scared', state: 'handsUp', look: { age: rng.int(25, 65) } });
  clerk.flags.handsUpT = 9999;
  const p = s.a('inside', 0); p.lerp(clerk.pos, 0.3);
  const rob = s.npc('suspect', p, s.personality({ armed: rng.pick(['gun', 'gun', 'knife']), state: 'idle', mood: 'angry', plans: [['comply', 2], ['flee', 3], ['shoot', 3], ['fight', 1], ['hostage', 3]], items: ['Kasadan alınan para (3.850 ₺)'], look: { hair: rng.pick(['Kapüşonlu', 'Bereli', 'Şapkalı']) } }));
  rob.lookAt = clerk.pos; rob.triggerDist = 9;
  rob.flags.robbing = true;
  const custs = s.npc('bystander', s.a('inside', 2), { state: 'cower', compliance: 1 }); custs.flags.cowerT = 999;
  s.crowd(rng.int(1, 3));
  if (rob.plan === 'hostage') { rob.plan = 'comply'; rob.flags.takesHostage = rob.armed === 'gun'; }
  s.brief(radioIntro(m, s.info, 'silahlı gasp'), 'Şüphelinin kasiyeri silahla tehdit ettiği bildirildi. Olay hâlâ devam ediyor olabilir!', `Şüpheli: ${shortDesc(rob.app)}.`);
  const ob = s.arrest([rob], 'arrest', 'Silahlı şüpheliyi etkisiz hale getir', 40);
  clerk.lines.statement = ['Silahı kafama dayadı, kasadaki bütün parayı istedi!', 'Allah razı olsun, tam zamanında geldiniz.'];
  s.statement(clerk, 'st', 'Kasiyerin ifadesini al', 10);
  const safe = m.obj('safe', 'Kasiyer ve müşteriler zarar görmesin', 15);
  m.on('death', n => { if (n === clerk || n === custs) m.failObj('safe', 'sivil öldü'); });
  m.on('cuffed', n => { if (n === rob) m.done('safe'); });
  m.on('death', n => { if (n === rob) m.done('safe'); });
  s.tick(() => {
    if (rob.flags.takesHostage && rob.triggered && !rob.flags.tookHostage && rob.alive && !rob.cuffed && rob.armed) {
      rob.flags.tookHostage = true; rob.hostage = clerk; clerk.captor = rob; clerk.setState('hostage'); rob.setState('hostageTaker'); rob.tension = 55;
      m.hostageTaker = rob; m.hostageTimer = 75; s.g.toast('Şüpheli kasiyeri rehin aldı!', 'bad'); s.g.ui.objectives(m);
      rob.say('Kimse yaklaşmasın! Kızı vururum!');
    }
    if (rob.state === 'shoot' && clerk.state === 'handsUp' && rng.chance(0.002)) { clerk.setState('cower'); }
  });
  m.on('hostageFreed', () => m.bonus('freed', 15, 'Rehine kurtarıldı'));
  m.focus = clerk.pos.clone();
}, 1.3);

crime('dolandiricilik', 'Dolandırıcılık', ['semtPazari', 'pazarSokagi', 'bakkal', 'tekel', 'market', 'meydan', 'otobusDuragi', 'cayBahcesi'], (s) => {
  const m = s.m, rng = s.rng;
  const vic = s.npc('reporter', s.a('scene', 0, 1), { mood: 'sad', look: { age: rng.int(60, 80), hairColor: rng.pick(['Beyaz', 'Kırlaşmış', 'Gri']) } });
  const kind = rng.pick(['altın', 'sahte para', 'telefon', 'piyango']);
  const sus = s.npc('suspect', s.a('crowd', null, 1), s.personality({ items: itemsFor(rng, 'fake'), plans: [['comply', 4], ['flee', 4], ['bluff', 4], ['fight', 1]], look: { top: rng.pick(['Takım elbise ceketi', 'Gömlek', 'Deri ceket']) } }));
  sus.triggerDist = 3.2; sus.lines.excuse = ['Ben dürüst bir esnafım memur bey.', 'Teyze yanlış anlamış, ben yardım ediyordum.'];
  vic.lines.statement = { 'altın': ['Bana sahte altın sattı! Kuyumcuya götürdüm, bakır çıktı!'], 'sahte para': ['Bu adam bana sahte para verdi, bakkal kabul etmedi!'], 'telefon': ['Kendini banka görevlisi diye tanıttı, şifremi aldı!'], 'piyango': ['İkramiye çıktı dedi, önce masraf ödemem lazım dedi, 5 bin lira aldı!'] }[kind];
  vic.knows = { npc: sus };
  s.crowd(rng.int(2, 5));
  s.brief(radioIntro(m, s.info, 'dolandırıcılık'), `Yaşlı bir vatandaşın ${kind} yoluyla dolandırıldığı bildirildi. Şüpheli hâlâ bölgede olabilir.`);
  s.mdt(`Şüpheli: ${sus.desc}.`);
  s.statement(vic, 'st', 'Mağdurun ifadesini al', 10);
  m.obj('ev', 'Delilleri bul (üst araması)', 15); m.on('evidence', n => { if (n === sus) m.done('ev'); });
  s.arrest([sus], 'arrest', 'Dolandırıcıyı gözaltına al', 35);
  m.focus = vic.pos.clone();
});
crime('sahtecilik', 'Sahtecilik', ['atm', 'semtPazari', 'pazarSokagi', 'tekel', 'bakkal', 'market'], (s) => {
  const m = s.m, rng = s.rng, g = s.g;
  const atm = s.info.key === 'atm';
  const vic = s.npc(atm ? 'reporter' : 'clerk', atm ? s.a('scene', 0, 1.5) : s.a('counter', 0), { mood: 'angry' });
  const sus = s.npc('suspect', atm ? s.a('hide', 0, 0.5) : s.a('inside', 0), s.personality({ items: atm ? itemsFor(rng, 'skimmer') : itemsFor(rng, 'fake'), plans: [['comply', 3], ['flee', 5], ['bluff', 3], ['fight', 1]], prop: 'phone' }));
  sus.triggerDist = 3.5;
  if (atm) {
    vic.lines.statement = ['Kartımı taktım, makine yuttu! Sonra biri yanıma gelip yardım teklif etti...', 'ATM\'de garip bir parça var, bakın.'];
    const p = s.a('atm', 0);
    const sk = M(boxGeo(0.3, 0.12, 0.12), ownMat('#2b2e33', { e: '#ff2020', ei: 0.4 }), p.x, 1.05, p.z + 0.45, 0, 0, 0, s.w.dynamic);
    s.w.interact({ pos: new THREE.Vector3(p.x, 1, p.z + 0.4), label: 'ATM\'yi incele', radius: 1.6, enabled: () => !m.flags.skimmer, action: () => { m.flags.skimmer = true; sk.visible = false; g.toast('ATM kart okuyucusuna takılmış kopyalama cihazı bulundu!', 'warn'); g.audio.sfx('frisk'); m.done('skim'); } });
    m.obj('skim', 'ATM\'yi incele', 15);
  } else {
    vic.lines.statement = ['Bu adam sahte 200\'lükle ödeme yaptı, fark ettim, şimdi itiraz ediyor!'];
    m.obj('ev', 'Sahte paraları bul (üst araması)', 15); m.on('evidence', n => { if (n === sus) m.done('ev'); });
  }
  vic.knows = { npc: sus };
  s.crowd(rng.int(2, 4));
  s.brief(radioIntro(m, s.info, atm ? 'ATM kart kopyalama (sahtecilik)' : 'sahte para'), atm ? 'Vatandaş, ATM üzerinde şüpheli bir düzenek ve etrafta dolaşan bir şahıs bildirdi.' : 'Kasiyer, bir müşterinin sahte banknot kullandığını bildirdi.');
  s.statement(vic, 'st', 'İhbarcının ifadesini al', 10);
  s.arrest([sus], 'arrest', 'Şüpheliyi gözaltına al', 35);
  m.focus = vic.pos.clone();
});

crime('kacakcilik', 'Kaçakçılık', ['sanayi', 'otopark', 'otostop', 'yolCevirmesi', 'otoparkGirisi', 'kopruAlti', 'benzinlik'], (s) => {
  const m = s.m, rng = s.rng;
  const car = s.vehicleAt(s.w.anchors.vehicle ? 'vehicle' : 'scene', rng.chance(0.6) ? 'van' : null, rng.pick([0, Math.PI / 2, Math.PI]));
  const drv = s.driverFor(car, s.personality({ plans: [['comply', 3], ['flee', 4], ['fight', 2], ['shoot', 1], ['bluff', 3]], armed: rng.chance(0.25) ? 'gun' : null }));
  drv.flags.carItems = itemsFor(rng, 'smuggle'); drv.triggerDist = 4; drv.promil = rng.chance(0.2) ? rng.range(0.6, 1.4) : 0;
  drv.lines.excuse = ['Nakliye işi yapıyorum, kolilerde tekstil var.', 'Arkadaşın aracını götürüyorum, içinde ne var bilmiyorum.'];
  let mate = null;
  if (rng.chance(0.5)) { mate = s.npc('suspect', drv.pos.clone().add(new THREE.Vector3(1.2, 0, 1.0)), s.personality({ plans: [['comply', 4], ['flee', 4], ['fight', 2]] })); mate.triggerDist = 5; }
  s.crowd(rng.int(0, 2));
  s.brief(radioIntro(m, s.info, 'kaçakçılık'), `Bir araçtan kaçak mal indirildiği bildirildi. Araç: ${car.userData.plate || 'beyaz panelvan'}.`);
  m.obj('search', 'Aracı ara', 15); m.on('carSearch', n => { if (n === drv) m.done('search'); });
  s.arrest(mate ? [drv, mate] : [drv], 'arrest', 'Şüphelileri gözaltına al', 35);
  m.focus = drv.pos.clone();
  m.on('cuffed', n => { if (n === drv && !drv.flags.searchedCar) { drv.flags.searchedCar = true; s.g.toast(`Araçta bulundu: ${drv.flags.carItems}`, 'warn'); m.done('search'); } });
});

const DRUG_LOCS = ['park', 'sokakArasi', 'cikmazSokak', 'kopruAlti', 'agaclik', 'halisaha', 'otopark', 'sahil', 'okul', 'internetKafe', 'copKonteyner'];
crime('uyusturucuTicareti', 'Uyuşturucu Ticareti', DRUG_LOCS, (s) => {
  const m = s.m, rng = s.rng, c = s.a('scene', 0);
  const dealer = s.npc('suspect', c.clone().add(new THREE.Vector3(-0.6, 0, 0)), s.personality({ items: itemsFor(rng, 'drugs').concat(['Nakit para (6.300 ₺)']), plans: [['comply', 2], ['flee', 5], ['fight', 2], ['shoot', 1.5]], armed: rng.chance(0.35) ? rng.pick(['gun', 'knife']) : null, state: 'deal', look: { hair: rng.pick(['Kapüşonlu', 'Şapkalı', 'Bereli', 'Kısa saç']) } }));
  const buyer = s.npc('suspect', c.clone().add(new THREE.Vector3(0.6, 0, 0)), s.personality({ items: ['Uyuşturucu madde (1 paket)'], plans: [['comply', 5], ['flee', 3], ['bluff', 2]], state: 'idle', look: { age: rng.int(17, 30) } }));
  dealer.partner = buyer; dealer.lookAt = buyer.pos; buyer.lookAt = dealer.pos; dealer.triggerDist = 12; buyer.triggerDist = 8;
  dealer.fleePath = null;
  s.brief(radioIntro(m, s.info, 'uyuşturucu ticareti'), 'Bölgede madde satışı yapıldığına dair ihbar alındı. Satıcının silahlı olabileceği belirtildi.');
  s.mdt(`Satıcı eşkali: ${dealer.desc}.`);
  s.arrest([dealer], 'arrest', 'Satıcıyı gözaltına al', 35);
  m.obj('buyer', 'Alıcıyı yakala', 15); s.tick(() => { if (!m.getObj('buyer').done && (buyer.cuffed || buyer.state === 'dead')) m.done('buyer'); if (buyer.flags.escaped) m.failObj('buyer', 'kaçtı'); });
  m.obj('ev', 'Uyuşturucuyu ele geçir', 10); m.on('evidence', n => { if (n === dealer || n === buyer) m.done('ev'); });
  m.on('cuffed', n => { if (n === dealer) later(s.g, 0.6, () => { if (!n.flags.frisked) { n.flags.frisked = true; s.g.toast(`Gözaltı sonrası aramada: ${n.items.join(', ')}`, 'warn'); m.done('ev'); } }); });
  s.crowd(rng.int(0, 2));
  m.focus = c;
});
crime('uyusturucuKullanimi', 'Uyuşturucu Kullanımı', [...DRUG_LOCS, 'otobusDuragi'], (s) => {
  const m = s.m, rng = s.rng, c = s.a('scene', 0);
  const n = rng.int(1, 2); const users = [];
  const od = rng.chance(0.4);
  for (let i = 0; i < n; i++) {
    const u = s.npc('suspect', c.clone().add(new THREE.Vector3(i * 1.4 - 0.7, 0, 0)), s.personality({ items: itemsFor(rng, 'drugs'), plans: [['comply', 4], ['flee', 2], ['fight', 3]], state: od && i === 0 ? 'injured' : 'drunk', compliance: rng.range(0.3, 0.7), look: { age: rng.int(16, 35) } }));
    u.flags.drunk = true; u.speedRun *= 0.8; u.triggerDist = 3;
    if (od && i === 0) { u.bleed = 95; u.guilty = false; u.role = 'injured'; }
    users.push(u);
  }
  s.brief(radioIntro(m, s.info, 'madde kullanımı'), od ? 'Bir gencin bilincinin kapandığı, aşırı doz şüphesi olduğu bildirildi! Acil.' : 'Madde etkisinde olduğu düşünülen kişilerin çevreyi rahatsız ettiği bildirildi.');
  if (od) {
    m.obj('aid', 'Bilinci kapanan kişiye ilk yardım uygula', 30); m.on('firstAid', u => { if (u === users[0]) m.done('aid'); });
    m.obj('amb', 'Ambulans çağır', 15); m.on('ambulance', () => m.done('amb'));
    m.on('death', u => { if (u === users[0]) m.failObj('aid', 'hayatını kaybetti'); });
  }
  const g2 = users.filter(u => u.guilty);
  if (g2.length) s.arrest(g2, 'arrest', 'Madde kullanan şahsı gözaltına al', od ? 20 : 40);
  s.crowd(rng.int(1, 3));
  m.focus = c;
});

crime('gurultu', 'Gürültü', ['mustakil', 'apartmanGirisi', 'kiraathane', 'cayBahcesi', 'halisaha', 'dugun'], (s) => {
  const m = s.m, rng = s.rng, g = s.g;
  const house = s.info.house;
  const owner = s.npc('owner', house ? s.a('salon', 0) : s.a('scene', 0, 1), { compliance: rng.range(0.4, 0.95), aggression: rng.range(0.1, 0.6), mood: 'happy', state: 'dance' });
  owner.flags.musicOwner = true; owner.lines.statement = ['Doğum günü kutluyoruz memur bey, ne var bunda?'];
  for (let i = 0; i < rng.int(2, 4); i++) { const p = house ? s.a(rng.pick(['salon', 'mutfak']), null, 0.8) : s.a('crowd', null, 1); const d = s.npc('bystander', p, { state: 'dance', compliance: 0.8 }); }
  const neighbor = s.npc('reporter', house ? s.a('gate', 0, 1) : s.a('crowd', 0), { mood: 'angry', look: { age: rng.int(45, 75) } });
  neighbor.lines.statement = ['Saat gece yarısını geçti, üç saattir bu gürültü!', 'Çocuğum sınava hazırlanıyor, uyuyamıyoruz!'];
  let drunk = null;
  if (rng.chance(0.5)) { drunk = s.npc('suspect', house ? s.a('frontDoor', 0, 1) : s.a('scene', 0, 2), s.personality({ state: 'drunk', plans: [['comply', 3], ['fight', 4], ['flee', 1]], promil: rng.range(1.2, 2.4) })); drunk.flags.drunk = true; drunk.flags.canBreath = true; drunk.triggerDist = 3; }
  g.musicParty('party');
  s.brief(radioIntro(m, s.info, 'gürültü'), 'Komşular yüksek sesli müzik ve bağırış nedeniyle şikayetçi.', drunk ? 'Alkollü kişilerin taşkınlık yaptığı da belirtildi.' : '');
  s.statement(neighbor, 'st', 'Şikayetçi komşuyu dinle', 10);
  m.obj('music', 'Müziğin sesini kıstır', 30); m.on('musicDown', () => m.done('music'));
  m.on('cuffed', n => { if (n === owner) { g.musicParty(null); m.done('music'); } });
  if (drunk) s.arrest([drunk], 'arrest', 'Taşkınlık yapan alkollü şahsı etkisiz hale getir', 25);
  m.focus = owner.pos.clone();
}, 0.9);
crime('taskinlik', 'Taşkınlık', ['meydan', 'otobusDuragi', 'sonDurak', 'otobusIci', 'park', 'hastane', 'sahil', 'cayBahcesi', 'pazarSokagi', 'halisaha', 'kiraathane', 'dugun'], (s) => {
  const m = s.m, rng = s.rng;
  const n = rng.int(1, 3); const drunks = [];
  for (let i = 0; i < n; i++) { const d = s.npc('suspect', s.a('scene', 0, 2), s.personality({ state: 'drunk', promil: rng.range(1.0, 2.6), plans: [['comply', 4], ['fight', 4], ['flee', 1]], armed: rng.chance(0.15) ? 'bat' : null })); d.flags.drunk = true; d.flags.canBreath = true; d.triggerDist = 2.5; drunks.push(d); }
  const vic = s.npc('reporter', s.a('crowd', 0), { mood: 'angry' });
  vic.lines.statement = ['Etrafa saldırıyorlar, camları kırdılar!', 'Kadınlara laf atıyorlar memur bey.'];
  vic.knows = { npc: drunks[0] };
  s.crowd(rng.int(2, 4));
  s.brief(radioIntro(m, s.info, 'taşkınlık ve kamu düzenini bozma'), `${n > 1 ? n + ' alkollü şahsın' : 'Alkollü bir şahsın'} çevreye rahatsızlık verdiği, bağırıp çağırdığı bildirildi.`);
  s.statement(vic, 'st', 'İhbarcıyı dinle', 10);
  s.arrest(drunks, 'arrest', 'Taşkınlık yapanları gözaltına al', 40);
  m.focus = drunks[0].pos.clone();
});
crime('kamuDuzeni', 'Kamu Düzenini Bozma', ['meydan', 'otobusDuragi', 'sonDurak', 'otobusIci', 'park', 'hastane', 'cayBahcesi', 'pazarSokagi', 'semtPazari'], (s) => CRIMES.taskinlik.setup(s));

const TRAFFIC_LOCS = ['yolCevirmesi', 'trafikIsiklari', 'otoparkGirisi', 'benzinlik', 'otostop', 'siteGirisi'];
function trafficSetup(s, kind) {
  const m = s.m, rng = s.rng;
  const car = s.vehicleAt(s.w.anchors.vehicle ? 'vehicle' : 'scene', null, Math.PI / 2 * (s.info.key === 'trafikIsiklari' ? -1 : 1) + (s.info.key === 'yolCevirmesi' ? Math.PI : 0));
  const truth = rng.weighted([['clean', kind === 'trafik' ? 3 : 1.5], ['drunk', 3], ['wanted', 2], ['contraband', 2], ['noLicense', 1.5]]);
  const drv = s.driverFor(car, s.personality({ guilty: truth !== 'clean', plans: truth === 'clean' ? [['comply', 1]] : [['comply', 4], ['flee', kind === 'dur' ? 6 : 2], ['fight', 2], ['shoot', truth === 'wanted' ? 1.5 : 0.3], ['bluff', 3]], armed: truth === 'wanted' && rng.chance(0.4) ? 'gun' : null, promil: truth === 'drunk' ? rng.range(0.7, 2.1) : rng.range(0, 0.2), wanted: truth === 'wanted' }));
  drv.triggerDist = 2.5;
  if (truth === 'contraband') drv.flags.carItems = rng.chance(0.5) ? itemsFor(rng, 'smuggle') : itemsFor(rng, 'drugs')[0];
  if (truth === 'noLicense') drv.lines.excuse = ['Ehliyetim evde kaldı memur bey...', 'Ehliyetim... alınmıştı aslında.'];
  else drv.lines.excuse = [R(rng, ['İşten eve dönüyorum.', 'Acelem vardı, kusura bakmayın.', 'Ne yaptım ki?'])];
  drv.flags.trafficTruth = truth;
  if (rng.chance(0.4)) { const pas = s.npc('bystander', drv.pos.clone().add(new THREE.Vector3(-1.2, 0, 2.6)), { compliance: 0.9 }); pas.lines.excuse = ['Ben sadece yolcuyum.']; }
  const what = { dur: 'dur ihtarına uymayan araç', trafik: 'trafik ihlali', direnis: 'polise direnme' }[kind];
  s.brief(radioIntro(m, s.info, what), kind === 'dur' ? `Plakası ${car.userData.plate} olan aracın önceki kontrol noktasında dur ihtarına uymadığı bildirildi. Araç bölgenizde durduruldu.` : `Kırmızı ışıkta geçen ve tehlikeli şekilde araç kullanan sürücü bildirildi. Plaka: ${car.userData.plate}.`);
  m.obj('id', 'Sürücünün ehliyet/kimliğini kontrol et', 10); m.on('idCheck', n => { if (n === drv) m.done('id'); });
  m.obj('gbt', 'GBT sorgusu yap', 10); m.on('gbt', n => { if (n === drv) m.done('gbt'); });
  m.obj('breath', 'Alkol testi yap', 10, { optional: true }); m.on('breath', n => { if (n === drv) m.done('breath'); });
  m.obj('search', 'Aracı ara', 5, { optional: true }); m.on('carSearch', n => { if (n === drv) m.done('search'); });
  if (truth === 'clean') {
    const rel = m.obj('resolve', 'Cezayı kes ve sürücüyü serbest bırak', 35);
    m.on('released', n => { if (n === drv) { m.done('resolve'); s.g.toast('Trafik cezası tutanağı düzenlendi.', 'info'); } });
    m.on('cuffed', n => { if (n === drv) m.penaltyOnce('cleanCuff', -20, 'Suçsuz sürücü gözaltına alındı'); });
  } else {
    s.arrest([drv], 'arrest', { drunk: 'Alkollü sürücüyü gözaltına al', wanted: 'Aranan sürücüyü gözaltına al', contraband: 'Sürücüyü gözaltına al', noLicense: 'Ehliyetsiz sürücüyü gözaltına al' }[truth], 35);
    if (truth === 'drunk') { m.getObj('breath').optional = false; m.getObj('breath').pts = 15; }
    if (truth === 'contraband') { m.getObj('search').optional = false; m.getObj('search').pts = 15; }
  }
  m.focus = drv.pos.clone();
}
crime('durIhtarı', 'Dur İhtarına Uymama', TRAFFIC_LOCS, s => trafficSetup(s, 'dur'));
crime('trafikIhlali', 'Trafik İhlali', TRAFFIC_LOCS, s => trafficSetup(s, 'trafik'));
crime('polisDirenme', 'Polise Direnme', [...TRAFFIC_LOCS, 'meydan', 'park', 'sokakArasi'], (s) => {
  const m = s.m, rng = s.rng;
  const sus = s.npc('suspect', s.a('scene', 0, 1), s.personality({ wanted: true, compliance: rng.range(0.05, 0.35), aggression: rng.range(0.5, 0.95), plans: [['flee', 4], ['fight', 5], ['shoot', 1]], armed: rng.chance(0.3) ? rng.pick(['knife', 'bat', 'gun']) : null, state: 'idle' }));
  sus.triggerDist = 2.2;
  sus.lines.excuse = ['Bana dokunamazsın!', 'Ne istiyorsunuz benden yine?!'];
  const other = s.npc('reporter', s.a('crowd', 0), { mood: 'scared' });
  other.lines.statement = ['Ekip arkadaşlarınızdan kaçtı, buraya saklandı.', 'Çok saldırgan, dikkat edin.']; other.knows = { npc: sus };
  s.crowd(rng.int(2, 4));
  s.brief(radioIntro(m, s.info, 'polise direnme'), 'Hakkında yakalama kararı bulunan şahıs başka bir ekipten kaçtı. Direnç gösterebilir.', `Eşkal: ${shortDesc(sus.app)}.`);
  s.arrest([sus], 'arrest', 'Direnen şahsı gözaltına al', 50);
  m.focus = sus.pos.clone();
});

crime('kaza', 'Trafik Kazası', ['trafikIsiklari', 'yolCevirmesi', 'otostop', 'otoparkGirisi', 'benzinlik'], (s) => {
  const m = s.m, rng = s.rng, g = s.g;
  const c1 = s.vehicleAt(s.w.anchors.vehicle ? 'vehicle' : 'scene', null, rng.range(0.6, 1.2));
  const p2 = c1.position.clone().add(new THREE.Vector3(2.2, 0, 2.4));
  const c2 = createCivilianCar(rng); c2.position.copy(p2); c2.rotation.y = rng.range(-0.6, 0.3) + Math.PI; s.w.dynamic.add(c2); s.w.carCollider(p2.x, p2.z, c2.rotation.y, c2);
  for (const c of [c1, c2]) { c.rotation.z = rng.range(-0.03, 0.03); }
  // duman
  const smoke = s.w.fire(c1.position.x + Math.sin(c1.rotation.y) * 2.2, 0.7, c1.position.z + Math.cos(c1.rotation.y) * 2.2, 0.35);
  const d1 = s.driverFor(c1, { guilty: rng.chance(0.5), plan: 'comply', compliance: 0.8, aggression: 0.5, promil: rng.chance(0.5) ? rng.range(0.6, 1.8) : 0, state: 'argue' });
  const inj = s.npc('injured', c2.position.clone().add(new THREE.Vector3(1.6, 0, -1.5)), { state: 'injured' }); inj.bleed = 110;
  const d2 = s.npc('victim', c2.position.clone().add(new THREE.Vector3(-1.5, 0, -1.2)), { state: 'argue', mood: 'angry' });
  d1.partner = d2; d2.partner = d1; d1.lines.argue = ['Kırmızıda sen geçtin!', 'Arabamı mahvettin!']; d2.lines.argue = ['Sen sarhoşsun!', 'Bak adam yerde yatıyor!'];
  d1.guilty = d1.promil > 0.5; if (d1.guilty) d1.plan = rng.weighted([['comply', 4], ['flee', 2], ['fight', 1]]);
  d1.lines.statement = ['Önüme aniden çıktı!', 'Ben yeşilde geçiyordum, o hızlıydı.']; d1.flags.canBreath = true;
  d2.lines.statement = ['O kırmızı ışıkta geçti, bize çarptı!', 'Eşim yaralandı, lütfen yardım edin!']; d2.flags.canBreath = true;
  s.crowd(rng.int(2, 4));
  s.brief(radioIntro(m, s.info, 'yaralanmalı trafik kazası'), 'İki aracın çarpıştığı, yaralılar olduğu bildirildi. Ambulans gerekebilir.');
  m.obj('aid', 'Yaralıya ilk yardım uygula', 25); m.on('firstAid', n => { if (n === inj) m.done('aid'); });
  m.on('death', n => { if (n === inj) m.failObj('aid', 'yaralı öldü'); });
  m.obj('amb', 'Ambulans çağır', 15); m.on('ambulance', () => m.done('amb'));
  m.obj('st', 'Sürücülerin ifadesini al', 10); s.tick(() => { if (d1.flags.statement && d2.flags.statement) m.done('st'); });
  m.obj('breath', 'Kusurlu sürücüye alkol testi yap', 10, { optional: !d1.guilty }); m.on('breath', n => { if (n === d1) m.done('breath'); });
  if (d1.guilty) s.arrest([d1], 'arrest', 'Alkollü sürücüyü gözaltına al', 20);
  m.focus = inj.pos.clone();
});

crime('kundaklama', 'Kundaklama', ['copKonteyner', 'otopark', 'sanayi', 'agaclik', 'sokakArasi', 'kopruAlti', 'cikmazSokak', 'mustakil'], (s) => {
  const m = s.m, rng = s.rng, g = s.g;
  const fp = s.a(s.info.house ? 'frontDoor' : 'scene', 0);
  const fire = s.w.fire(fp.x + 1, 0, fp.z + 1, 1.3);
  const sus = s.npc('suspect', s.a('crowd', null, 1), s.personality({ prop: 'gas', plans: [['flee', 5], ['comply', 3], ['fight', 2], ['bluff', 2]], items: ['Çakmak', 'Benzin bidonu'] }));
  sus.triggerDist = 9;
  const wit = s.npc('reporter', s.a('crowd', 0), { mood: 'scared' }); wit.lines.statement = ['Elinde bidonla geldi, döktü ve ateşe verdi!', 'Hâlâ buralarda, izliyordu!']; wit.knows = { npc: sus };
  s.crowd(rng.int(2, 4));
  m.wantClear = true;
  s.brief(radioIntro(m, s.info, 'kundaklama'), 'Bilinçli olarak yangın çıkarıldığı, şüphelinin bölgede olabileceği bildirildi.', `Şüpheli: ${shortDesc(sus.app)}, elinde bidon var.`);
  m.obj('fire', 'İtfaiyeyi çağır', 20); m.on('firedept', () => { m.done('fire'); });
  m.flags.fire = fire; m.flags.fireAt = new THREE.Vector3(fp.x + 1, 0, fp.z + 1);
  s.statement(wit, 'st', 'Tanığın ifadesini al', 10);
  s.arrest([sus], 'arrest', 'Kundaklayıcıyı yakala', 35);
  m.focus = m.flags.fireAt;
});
crime('malaZarar', 'Mala Zarar Verme', ['otopark', 'okul', 'siteGirisi', 'sokakArasi', 'cikmazSokak', 'otobusDuragi', 'otoYikama', 'halisaha', 'apartmanGirisi', 'meydan'], (s) => {
  const m = s.m, rng = s.rng;
  const n = rng.int(1, 2); const vs = [];
  for (let i = 0; i < n; i++) { const v = s.npc('suspect', s.a('scene', 0, 1.5), s.personality({ prop: rng.chance(0.5) ? 'spray' : null, armed: rng.chance(0.4) ? 'bat' : null, state: 'vandal', plans: [['flee', 5], ['comply', 3], ['fight', 2]], look: { age: rng.int(15, 26) } })); v.triggerDist = 10; vs.push(v); }
  const own = s.npc('reporter', s.a('crowd', 0), { mood: 'angry' }); own.lines.statement = ['Arabamın camlarını kırdılar, aynaları söktüler!', 'Duvarlara yazı yazıp etrafı dağıttılar.']; own.knows = { npc: vs[0] };
  s.crowd(rng.int(1, 3));
  s.brief(radioIntro(m, s.info, 'mala zarar verme'), `${n > 1 ? 'Birkaç gencin' : 'Bir şahsın'} araçlara ve çevreye zarar verdiği bildirildi.`);
  s.statement(own, 'st', 'Mağdurun ifadesini al', 10);
  s.arrest(vs, 'arrest', 'Zarar verenleri gözaltına al', 45);
  m.focus = vs[0].pos.clone();
});

crime('supheliPaket', 'Şüpheli Paket', ['otobusDuragi', 'okul', 'atm', 'sonDurak', 'hastane', 'meydan', 'copKonteyner', 'market', 'siteGirisi', 'otobusIci'], (s) => {
  const m = s.m, rng = s.rng, g = s.g;
  const p = s.a(s.w.anchors.package ? 'package' : 'scene', 0);
  const bag = createBag(rng.pick(['#3a2a1e', '#1b1c1f', '#2a4f8a', '#5a1e3a'])); bag.position.set(p.x, s.w.heightAt(p.x, p.z, p.y + 0.6), p.z); bag.rotation.y = rng.next() * 3; s.w.dynamic.add(bag);
  const real = rng.chance(0.3);
  s.w.updaters.push((dt, t) => { bag.userData.led.visible = Math.sin(t * 6) > 0; });
  const crowd = s.crowd(rng.int(4, 7), { wander: 1.5 });
  const rep = s.npc('reporter', s.a('crowd', 0, 1), { mood: 'scared' }); rep.lines.statement = ['Yarım saattir burada sahipsiz duruyor.', 'Bir adam bırakıp hızla uzaklaştı. İçinden tık tık ses geliyor gibi...'];
  m.wantClear = true; m.focus = p.clone();
  s.brief(radioIntro(m, s.info, 'şüpheli paket'), 'Sahipsiz bir çanta bildirildi. Pakete dokunmayın, alanı güvenli hale getirin.');
  const clr = m.obj('clear', 'Alanı boşalt (Q ile uyar)', 30);
  m.obj('eod', 'Bomba İmha Ekibini çağır (T telsiz)', 30);
  s.statement(rep, 'st', 'İhbarcıyı dinle', 10, true);
  m.flags.package = { bag, real, pos: p };
  s.tick(() => {
    const near = g.npcs.filter(n => !n.removed && n.alive && n.role !== 'suspect' && n.distTo(p) < 12);
    if (!clr.done && near.length === 0) m.done('clear');
  });
  s.w.interact({ pos: p.clone().setY(0.5), label: 'Paketi incele (riskli)', radius: 1.5, enabled: () => !m.flags.inspected && !m.flags.eodDone, action: () => {
    m.flags.inspected = true; g.audio.sfx('frisk');
    if (real) { later(g, 0.8, () => g.explode(p)); }
    else { g.toast('Paketin içinden kıyafetler ve bir radyo çıktı. Ama prosedür ihlal edildi!', 'warn'); m.penaltyOnce('touchPkg', -20, 'Şüpheli pakete dokunuldu'); m.done('eod'); bag.userData.led.visible = false; }
  } });
  m.on('eod', () => {
    if (!m.getObj('clear').done) m.penaltyOnce('eodNoClear', -10, 'Alan boşaltılmadan ekip çağrıldı');
    later(g, 14, () => { m.flags.eodDone = true; g.radio(real ? 'Bomba İmha: Paket içinde düzenek tespit edildi, kontrollü imha edildi. Tebrikler ekip!' : 'Bomba İmha: Paket zararsız, içinde kişisel eşyalar var. Alan güvenli.'); s.w.dynamic.remove(bag); m.done('eod'); g.audio.sfx(real ? 'boomFar' : 'objective'); });
  });
});

crime('supheliSahis', 'Şüpheli Şahıs', ['okul', 'atm', 'siteGirisi', 'otopark', 'apartmanGirisi', 'eczane', 'kirtasiye', 'otostop', 'park', 'hastane', 'mustakil'], (s) => {
  const m = s.m, rng = s.rng;
  const truth = rng.weighted([['innocent', 4], ['wanted', 3], ['armed', 2], ['drugs', 2]]);
  const sus = s.npc(truth === 'innocent' ? 'party' : 'suspect', s.a(s.info.house ? 'gate' : 'scene', 0, 1.5), s.personality({ guilty: truth !== 'innocent', wanted: truth === 'wanted', armed: truth === 'armed' ? rng.pick(['knife', 'gun']) : null, items: truth === 'drugs' ? itemsFor(rng, 'drugs') : [], plans: truth === 'innocent' ? [['comply', 1]] : [['comply', 4], ['flee', 3], ['fight', 2], ['bluff', 4], ['shoot', truth === 'armed' ? 1.5 : 0]], prop: rng.chance(0.5) ? 'phone' : null, wanderR: 2 }));
  sus.triggerDist = 2.4;
  sus.lines.excuse = truth === 'innocent' ? [R(rng, ['Kızımı okuldan almayı bekliyorum.', 'Taksi çağırdım, onu bekliyorum.', 'Arkadaşım burada oturuyor, gelmesini bekliyorum.'])] : [R(rng, ['Öyle takılıyorum, yasak mı?', 'Birini bekliyorum.', 'Sana ne?'])];
  if (truth === 'innocent') { sus.guilty = false; sus.plan = 'comply'; sus.compliance = 0.95; }
  const rep = s.npc('reporter', s.a('crowd', 0), { mood: 'scared' }); rep.lines.statement = ['Bir saattir burada dolaşıp etrafı kolluyor.', 'İnsanların evlerine bakıyor, tedirgin olduk.']; rep.knows = { npc: sus };
  s.crowd(rng.int(1, 3));
  s.brief(radioIntro(m, s.info, 'şüpheli şahıs'), `Uzun süredir bölgede dolaşan şüpheli bir şahıs bildirildi: ${shortDesc(sus.app)}.`);
  m.obj('id', 'Şahsın kimliğini kontrol et', 15); m.on('idCheck', n => { if (n === sus) m.done('id'); });
  m.obj('gbt', 'GBT sorgusu yap', 15); m.on('gbt', n => { if (n === sus) m.done('gbt'); });
  if (truth === 'innocent') {
    m.obj('rel', 'Şahsı uyararak serbest bırak', 30); m.on('released', n => { if (n === sus) m.done('rel'); });
    m.on('cuffed', n => { if (n === sus) m.failObj('rel', 'masum kişi gözaltına alındı'); });
  } else s.arrest([sus], 'arrest', 'Şüpheliyi gözaltına al', 30);
  s.statement(rep, 'st', 'İhbarcıyı dinle', 5, true);
  m.focus = sus.pos.clone();
});
crime('gbtKontrolu', 'GBT Kontrolü', ['park', 'cayBahcesi', 'meydan', 'sonDurak', 'otobusDuragi', 'sahil', 'halisaha', 'yolCevirmesi', 'kiraathane'], (s) => {
  const m = s.m, rng = s.rng;
  const n = rng.int(3, 4); const ppl = [];
  const wantedIdx = rng.chance(0.7) ? rng.int(0, n - 1) : -1;
  for (let i = 0; i < n; i++) {
    const w = i === wantedIdx;
    const p = s.npc(w ? 'suspect' : 'party', s.a('scene', 0, 2.5), w ? s.personality({ wanted: true, plans: [['comply', 3], ['flee', 4], ['fight', 2], ['bluff', 4]], armed: rng.chance(0.25) ? 'knife' : null }) : { compliance: 0.9, aggression: 0.1 });
    p.triggerDist = 1.5; p.lookAtPlayer = true; if (!w) p.guilty = false; ppl.push(p);
  }
  s.crowd(rng.int(1, 3));
  s.brief(radioIntro(m, s.info, 'rutin GBT (Genel Bilgi Toplama) kontrolü talebi'), 'Bölgede asayiş uygulaması: Gruptaki şahısların kimliklerini kontrol edip GBT sorgusu yapın.');
  const idOb = m.obj('ids', 'Tüm şahısların GBT sorgusunu yap', 35);
  s.tick(() => { if (!idOb.done && ppl.every(p => p.flags.gbt || p.cuffed || p.flags.escaped || p.state === 'dead')) m.done('ids'); });
  if (wantedIdx >= 0) { s.arrest([ppl[wantedIdx]], 'arrest', 'Aranan şahsı gözaltına al', 30); ppl[wantedIdx].hidden = true; m.getObj('arrest').hidden = true; m.on('gbt', x => { if (x === ppl[wantedIdx]) { m.getObj('arrest').hidden = false; s.g.ui.objectives(m); } }); }
  else { m.obj('clean', 'Temiz çıkan şahısları serbest bırak', 15, { optional: true }); }
  m.on('cuffed', x => { if (!x.guilty && ppl.includes(x)) m.penaltyOnce('gbtInn', -15, 'Temiz şahıs gözaltına alındı'); });
  m.focus = s.a('scene', 0);
});

crime('intihar', 'İntihar Girişimi', ['ustGecit', 'sahil'], (s) => {
  const m = s.m, rng = s.rng, g = s.g;
  const e = s.a('edge', 0);
  const j = s.npc('jumper', e, { state: 'edge', compliance: 0.5, look: { age: rng.int(19, 60) } });
  j.tension = 55; j.yaw = s.info.key === 'ustGecit' ? Math.PI / 2 : 0; m.jumper = j;
  const crowd = s.crowd(rng.int(3, 5));
  crowd.forEach(c => { c.flags.phone = true; c.setState('idle'); c.lookAt = e; });
  const fam = s.npc('reporter', s.a('crowd', 0, 1), { mood: 'sad' }); fam.lines.statement = [`Kardeşim ${j.app.name}... Son zamanlarda çok bunalımdaydı.`, 'İşini kaybetti, kimseyle konuşmuyordu. Lütfen ona yardım edin!'];
  s.brief(radioIntro(m, s.info, 'intihar girişimi'), 'Bir şahsın yüksek bir noktada atlamak üzere olduğu bildirildi. Yavaş yaklaşın, silah çekmeyin, sakin konuşun.');
  m.obj('talk', 'Kişiyi ikna et ve güvenli alana al', 60);
  s.statement(fam, 'st', 'Yakınıyla konuşup bilgi al', 10, true);
  m.on('jumperSaved', () => { m.done('talk'); m.bonus('empathy', 10, 'Empatik iletişim kuruldu'); });
  m.on('jumped', () => { m.failMission('Kişi atladı. İkna edilemedi.'); });
  m.parTime = 240; m.focus = e.clone(); m.flags.helpline = true;
});

crime('kayip', 'Kayıp Bildirimi', ['park', 'meydan', 'semtPazari', 'sahil', 'agaclik', 'halisaha', 'pazarSokagi', 'sonDurak', 'hastane', 'market', 'cayBahcesi'], (s) => {
  const m = s.m, rng = s.rng, g = s.g;
  const elderly = rng.chance(0.3);
  const app = elderly ? s.app({ age: rng.int(72, 88), hairColor: rng.pick(['Beyaz', 'Gri']) }) : s.app({ age: rng.int(6, 10) });
  const kid = s.npc('child', s.a('hide', null, 0.3), { app, state: 'hide', compliance: 1 });
  if (!elderly) { kid.char.root.scale.setScalar(0.68); }
  const par = s.npc('parent', s.a('scene', 0, 1), { mood: 'sad', look: { age: elderly ? rng.int(35, 55) : rng.int(28, 45) } });
  par.lines.statement = elderly ? [`Babam ${kid.app.name}, alzheimer hastası. Bir saat önce evden çıkmış!`, `Üzerinde ${kid.app.topColor.toLocaleLowerCase('tr-TR')} ${kid.app.top.toLocaleLowerCase('tr-TR')} var.`] : [`Oğlum/kızım ${kid.app.name}, 8 yaşında! Bir anda gözden kayboldu!`, `Üzerinde ${kid.app.topColor.toLocaleLowerCase('tr-TR')} ${kid.app.top.toLocaleLowerCase('tr-TR')} vardı. Lütfen bulun onu!`];
  par.knows = { npc: kid };
  s.crowd(rng.int(2, 4));
  s.brief(radioIntro(m, s.info, 'kayıp kişi'), elderly ? 'Alzheimer hastası yaşlı bir vatandaşın kaybolduğu bildirildi.' : 'Küçük bir çocuğun ailesinden ayrı düştüğü bildirildi. Acil.', `Kayıp kişi: ${describe(kid.app, true)}.`);
  s.statement(par, 'st', 'Ailenin ifadesini al', 10);
  m.obj('find', 'Kayıp kişiyi bul', 30); m.on('found', n => { if (n === kid) m.done('find'); }); m.on('childFollow', n => { if (n === kid) m.done('find'); });
  m.obj('return', 'Ailesine teslim et', 30);
  s.tick(() => { if (!m.getObj('return').done && kid.state === 'follow' && kid.distTo(par.pos) < 3) { m.done('return'); kid.setState('idle'); kid.mood = 'happy'; kid.setState('idle'); par.mood = 'happy'; par.setState('idle'); par.say(R(rng, ['Yavrum! Çok şükür!', 'Allah razı olsun sizden memur bey!'])); } });
  m.focus = par.pos.clone(); m.parTime = 240;
});

crime('ruhsatsizSilah', 'Ruhsatsız Silah', ['dugun', 'kiraathane', 'cayBahcesi', 'meydan', 'sanayi', 'otopark', 'tekel', 'halisaha'], (s) => {
  const m = s.m, rng = s.rng, g = s.g;
  const wed = s.info.key === 'dugun';
  const sus = s.npc('suspect', s.a('scene', 0, 1), s.personality({ armed: 'gun', state: wed ? 'celebrate' : 'argue', plans: [['comply', 5], ['flee', 2], ['shoot', 2], ['fight', 1]], look: { top: wed ? 'Takım elbise ceketi' : undefined } }));
  sus.triggerDist = 5;
  if (!wed) { const v = s.npc('victim', sus.pos.clone().add(new THREE.Vector3(1.2, 0, 0)), { state: 'argue', mood: 'scared' }); sus.partner = v; v.partner = sus; sus.lines.argue = ['Bak bu ne, görüyor musun?!', 'Kafana sıkarım senin!']; v.lines.statement = ['Silahını çıkarıp bana doğrulttu!']; s.statement(v, 'st', 'Mağdurun ifadesini al', 10); sus.setState('argue'); sus.char.hold(sus.weaponMesh); sus.weaponShown = true; }
  if (wed) { for (let i = 0; i < 6; i++) s.npc('bystander', s.a('dance', 0, 2.5), { state: 'dance', compliance: 0.9 }); g.musicParty('wedding'); }
  s.crowd(rng.int(2, 5));
  s.brief(radioIntro(m, s.info, wed ? 'düğünde havaya ateş açma' : 'ruhsatsız silah'), wed ? 'Sokak düğününde bir şahsın havaya ateş açtığı bildirildi. Kalabalık var, dikkatli olun!' : 'Bir şahsın tartışma sırasında silah çektiği bildirildi.', `Şüpheli: ${shortDesc(sus.app)}.`);
  s.arrest([sus], 'arrest', 'Silahlı şahsı etkisiz hale getir', 40);
  m.obj('gun', 'Silaha el koy', 15); s.tick(() => { if (!m.getObj('gun').done && (!sus.weaponMesh || sus.cuffed)) m.done('gun'); });
  m.obj('safe', 'Kalabalıkta kimse yaralanmasın', 15);
  m.on('death', n => { if (!n.guilty) m.failObj('safe'); }); m.on('injured', n => { if (!n.guilty) m.failObj('safe'); });
  s.tick(() => { if (m.getObj('arrest').done && !m.getObj('safe').failed) m.done('safe'); });
  m.focus = sus.pos.clone();
});

crime('sahtePolis', 'Sahte Polis', ['atm', 'meydan', 'otobusDuragi', 'siteGirisi', 'apartmanGirisi', 'eczane', 'yolCevirmesi', 'mustakil'], (s) => {
  const m = s.m, rng = s.rng;
  const vic = s.npc('reporter', s.a('scene', 0, 0.5), { mood: 'scared', look: { age: rng.int(65, 82), hairColor: 'Beyaz' } });
  const fake = s.npc('suspect', vic.pos.clone().add(new THREE.Vector3(1.0, 0, 0.3)), s.personality({ fakeId: true, plans: [['comply', 3], ['flee', 5], ['fight', 1], ['bluff', 4]], items: ['Sahte polis kimliği', 'Vatandaştan alınan para (12.000 ₺)', 'Sahte rozet'], look: { top: 'Takım elbise ceketi', topColor: 'Lacivert', bottom: 'Kumaş pantolon' } }));
  fake.flags.fakeCop = true; fake.lookAt = vic.pos; fake.triggerDist = 2.5;
  fake.lines.excuse = ['Meslektaşım, ben de emniyettenim. Vatandaşın hesabını koruma altına alıyoruz.', 'Terörle mücadele şubeden geliyorum, gizli operasyon.'];
  vic.lines.statement = ['Bu bey polis olduğunu söyledi, paramı korumaya alacakmış...', 'Bankadan para çekmemi istedi, şüphelendim ve 155\'i aradım.'];
  vic.knows = { npc: fake };
  s.crowd(rng.int(1, 3));
  s.brief(radioIntro(m, s.info, 'sahte polis'), 'Kendini polis olarak tanıtan bir şahsın yaşlı bir vatandaşı dolandırmaya çalıştığı bildirildi.');
  s.statement(vic, 'st', 'Mağdurun ifadesini al', 10);
  m.obj('id', 'Şahsın kimliğini kontrol et', 15); m.on('idCheck', n => { if (n === fake) m.done('id'); });
  s.arrest([fake], 'arrest', 'Sahte polisi gözaltına al', 40);
  m.focus = vic.pos.clone();
});

const HOSTAGE_LOCS = ['bakkal', 'market', 'tekel', 'eczane', 'benzinlik', 'otobusIci', 'mustakil', 'kirtasiye', 'internetKafe', 'atm'];
crime('rehine', 'Rehin Alma', HOSTAGE_LOCS, (s) => {
  const m = s.m, rng = s.rng, g = s.g;
  const house = s.info.house;
  const base = house ? s.a('salon', 0) : s.a(s.w.anchors.inside ? 'inside' : 'scene', 0);
  const taker = s.npc('suspect', base, s.personality({ armed: rng.chance(0.85) ? 'gun' : 'knife', compliance: rng.range(0.2, 0.6), aggression: rng.range(0.4, 0.9), plans: [['comply', 1]], look: { hair: rng.pick(['Kapüşonlu', 'Bereli', 'Kısa saç', 'Dağınık saç']) } }));
  const hos = s.npc('hostage', base.clone().add(new THREE.Vector3(0, 0, 0.5)), { look: { gender: rng.chance(0.5) ? 'f' : 'm' }, compliance: 1 });
  taker.hostage = hos; hos.captor = taker; hos.setState('hostage'); taker.setState('hostageTaker'); taker.tension = rng.range(55, 70);
  taker.triggered = true;
  if (house) { const fam = s.npc('reporter', s.a('gate', 0, 1), { mood: 'sad' }); fam.lines.statement = ['Eski eşim! Evimize zorla girdi, kızımı rehin aldı!', 'Çok kıskançtır, silahı da var...']; s.statement(fam, 'st', 'Ailenin ifadesini al', 5, true); }
  s.crowd(rng.int(2, 4));
  m.hostageTaker = taker; m.hostageTimer = rng.int(85, 120);
  s.brief(radioIntro(m, s.info, 'REHİN ALMA'), `Silahlı bir şahıs bir kişiyi rehin aldı! Müzakere edin ya da kesin bir atış fırsatı kollayın. Rehinenin hayatı önceliğimiz.`);
  m.obj('save', 'Rehineyi sağ kurtar', 50);
  s.arrest([taker], 'arrest', 'Rehine alanı etkisiz hale getir', 30);
  m.on('hostageFreed', () => { m.done('save'); m.hostageTimer = 0; });
  m.on('hostageSurrender', () => m.done('save'));
  s.tick(() => { if (!m.getObj('save').done && hos.alive && !hos.captor?.hostage && (taker.state === 'dead' || taker.cuffed || !taker.hostage)) { if (hos.alive) m.done('save'); m.hostageTimer = 0; } });
  if (house) { s.info.house.doors.front.locked = rng.chance(0.6); }
  m.focus = base.clone(); m.parTime = 200;
}, 1.4);

crime('kacakGocmen', 'Kaçak Göçmen', ['sanayi', 'otostop', 'sonDurak', 'otobusIci', 'kopruAlti', 'yolCevirmesi', 'otopark', 'agaclik'], (s) => {
  const m = s.m, rng = s.rng;
  const n = rng.int(3, 5); const migs = [];
  const center = s.a('scene', 0);
  for (let i = 0; i < n; i++) { const mg = s.npc('migrant', center.clone().add(new THREE.Vector3(rng.range(-2, 2), 0, rng.range(-1.5, 1.5))), { compliance: rng.range(0.5, 0.95), aggression: 0.05, state: rng.chance(0.5) ? 'sitGround' : 'idle', mood: 'sad', look: { skin: rng.pick(['Esmer', 'Koyu ten', 'Bronz']) } }); mg.guilty = false; mg.lines.statement = [R(rng, ['Savaştan kaçtık... lütfen...', 'Çalışmaya geldik. Kötü bir şey yapmadık.', 'Bizi buraya bir minibüs bıraktı, para aldılar.'])]; migs.push(mg); }
  let smug = null;
  if (rng.chance(0.55)) { smug = s.npc('suspect', center.clone().add(new THREE.Vector3(3, 0, 1)), s.personality({ plans: [['flee', 5], ['comply', 2], ['fight', 2], ['shoot', 1]], armed: rng.chance(0.3) ? 'gun' : null, items: ['Nakit (40.000 ₺)', 'Sahte belgeler'], prop: 'phone' })); smug.triggerDist = 9; }
  s.brief(radioIntro(m, s.info, 'düzensiz göçmen'), `Bölgede ${n} kişilik bir grup bildirildi.${smug ? ' Organizatör olabileceği düşünülen bir şahıs da yanlarında.' : ''} İnsani yaklaşın.`);
  const ob = m.obj('talk', 'Grupla konuş ve kimlik sor', 10); m.on('idCheck', x => { if (migs.includes(x)) m.done('talk'); });
  const esc = m.obj('escort', 'Göçmenleri araca götür (Benimle gelin)', 40);
  s.tick(() => { const car = s.g.carPos(); const ok = migs.filter(x => x.alive && !x.flags.escaped); if (!esc.done && ok.length && ok.every(x => x.distTo(car) < 8 && (x.state === 'follow' || x.cuffed))) m.done('escort'); });
  m.on('tased', x => { if (migs.includes(x)) m.penaltyOnce('migForce', -15, 'Göçmene gereksiz güç uygulandı'); });
  m.on('cuffed', x => { if (migs.includes(x)) { x.guilty = false; } });
  if (smug) s.arrest([smug], 'arrest', 'Göçmen kaçakçısını gözaltına al', 25);
  m.focus = center;
});

crime('izinsizBarinma', 'İzinsiz Barınma', ['mustakil', 'kopruAlti', 'sanayi', 'cikmazSokak', 'agaclik'], (s) => {
  const m = s.m, rng = s.rng;
  const house = s.info.house;
  const n = rng.int(1, 3); const sq = [];
  for (let i = 0; i < n; i++) {
    const p = house ? s.a(rng.pick(['salon', 'yatak', 'oda', 'mutfak']), null, 0.5) : s.a('scene', 0, 2);
    const wanted = rng.chance(0.25);
    const q = s.npc('squatter', p, { guilty: wanted, wanted, compliance: rng.range(0.3, 0.9), aggression: rng.range(0.1, 0.7), plan: wanted ? rng.pick(['flee', 'fight', 'comply']) : 'comply', state: rng.chance(0.5) ? 'sitGround' : 'idle', armed: rng.chance(0.15) ? 'knife' : null });
    q.lines.excuse = [R(rng, ['Gidecek yerim yok memur bey.', 'Burası boştu, kimseye zararımız yok.', 'Kış geldi, soğukta mı kalalım?'])];
    sq.push(q);
  }
  const own = s.npc('reporter', house ? s.a('gate', 0, 1) : s.a('crowd', 0), { mood: 'angry' }); own.lines.statement = house ? ['Ev benim, yurt dışındaydım. Döndüm, içeride yabancılar var!', 'Kapının kilidini kırmışlar.'] : ['Burada aylardır kalıyorlar, ateş yakıyorlar, tehlikeli.'];
  s.brief(radioIntro(m, s.info, 'izinsiz barınma'), house ? 'Ev sahibi, evinde izinsiz kalan kişiler olduğunu bildirdi.' : 'Bölgede izinsiz barınan kişiler bildirildi.');
  s.statement(own, 'st', 'Mülk sahibini dinle', 10);
  const ev = m.obj('evict', 'Alanı tahliye et (ikna et veya gözaltına al)', 40);
  s.tick(() => { if (!ev.done && sq.every(q => q.flags.leaving || q.cuffed || q.flags.escaped || q.removed || q.state === 'dead')) m.done('evict'); });
  for (const q of sq) if (q.wanted) { m.obj('w' + q.id, 'Aranan şahsı gözaltına al', 15, { hidden: true }); m.on('gbt', x => { if (x === q) { m.getObj('w' + q.id).hidden = false; s.g.ui.objectives(m); } }); m.on('cuffed', x => { if (x === q) m.done('w' + q.id); }); }
  if (house) { s.info.house.doors.front.locked = false; }
  m.focus = sq[0].pos.clone();
});

crime('eveBaskin', 'Eve Baskın', ['mustakil'], (s) => {
  const m = s.m, rng = s.rng, g = s.g;
  const h = s.info.house;
  h.doors.front.locked = true; h.doors.back.locked = rng.chance(0.5);
  const crimeTxt = rng.pick(['uyuşturucu ticareti', 'silahlı yağma', 'kasten yaralama', 'organize hırsızlık']);
  const n = rng.int(1, 2); const sus = [];
  for (let i = 0; i < n; i++) {
    const room = rng.pick(['salon', 'mutfak', 'yatak', 'oda']);
    const plan = rng.weighted([['comply', 3], ['flee', 3], ['fight', 2], ['shoot', 2], ['hide', 2]]);
    const armed = plan === 'shoot' ? 'gun' : rng.chance(0.3) ? rng.pick(['knife', 'bat', 'gun']) : null;
    const x = s.npc('suspect', plan === 'hide' ? s.a('hide', null) : s.a(room, null, 0.5), s.personality({ wanted: true, plan: plan === 'hide' ? rng.pick(['comply', 'fight', 'flee']) : plan, armed, state: plan === 'hide' ? 'hide' : (rng.chance(0.5) ? 'sit' : 'idle'), items: crimeTxt === 'uyuşturucu ticareti' ? itemsFor(rng, 'drugs') : ['Çalıntı mücevherler'] }));
    x.triggerDist = 5.5; x.fleePath = s.w.escapePath; sus.push(x);
  }
  let fam = null;
  if (rng.chance(0.55)) { fam = s.npc('bystander', s.a(rng.pick(['yatak', 'mutfak', 'oda']), null, 0.5), { compliance: 0.95, state: 'idle', look: { gender: 'f' } }); fam.guilty = false; fam.lines.excuse = ['Ben bir şey bilmiyorum! Çocuklar uyuyor!']; }
  // delil
  const ev = s.a('mutfak', 0); const pk = M(boxGeo(0.4, 0.15, 0.3), mat(crimeTxt === 'uyuşturucu ticareti' ? '#f4f1ea' : '#c9a227', { r: 0.6 }), ev.x + 0.3, ev.y + 0.95, ev.z + 0.6, 0, 0.4, 0, s.w.dynamic);
  s.w.interact({ pos: pk.position.clone(), label: 'Delili incele', radius: 1.4, enabled: () => !m.flags.ev, action: () => { m.flags.ev = true; g.toast(crimeTxt === 'uyuşturucu ticareti' ? 'Delil: 2 kg uyuşturucu madde ve hassas terazi' : 'Delil: Çalıntı mücevherler ve tabanca şarjörleri', 'warn'); m.done('ev'); pk.visible = false; g.audio.sfx('frisk'); } });
  s.brief(radioIntro(m, s.info, 'baskın operasyonu'), `${crimeTxt} suçundan aranan ${n > 1 ? n + ' şüphelinin' : 'şüphelinin'} bu evde saklandığı tespit edildi. Arama kararı çıkarıldı.`, 'Kapıyı çalabilir (E) ya da kırabilirsiniz (F). Arka kapıdan kaçış ihtimaline dikkat!');
  s.mdt(`Şüpheli: ${sus[0].desc}.`);
  m.obj('enter', 'Eve gir', 10); s.tick(() => { if (!m.getObj('enter').done && g.allPlayers().some(pl => { const p = pl.pos; return p.x > h.x0 && p.x < h.x1 && p.z > h.z0 && p.z < h.z1; })) m.done('enter'); });
  s.arrest(sus, 'arrest', n > 1 ? 'Şüphelileri gözaltına al' : 'Şüpheliyi gözaltına al', 45);
  m.obj('ev', 'Delilleri bul', 15);
  if (fam) { m.obj('fam', 'Ev sakinlerine zarar verme', 10); s.tick(() => { if (m.getObj('arrest').done && fam.alive && !fam.flags.shotByPlayer) m.done('fam'); }); m.on('death', x => { if (x === fam) m.failObj('fam'); }); }
  // kapı çalındığında
  m.on('knock', () => {
    for (const x of sus) {
      if (x.state === 'hide') continue;
      const r = rng.next();
      if (x.plan === 'comply' && r < 0.7 && !x.flags.opening) { x.flags.opening = true; x.say('Tamam! Geliyorum, açıyorum!'); later(g, 1.0, () => { if (!x.alive || x.cuffed || x.triggered) return; const pts = h.route(x.pos, 'front'); pts.pop(); pts.pop(); x.path = pts; x.setState('goto'); x.onArrive = () => { h.doors.front.locked = false; if (h.doors.front.open < 0.5) h.doors.front.toggle(-1); s.g.audio.sfx('doorOpen', x.pos); x.setState('surrender'); x.say('Tamam, buradayım! Silahım yok!'); }; }); }
      else if (x.plan === 'flee') later(g, 1.5, () => { if (x.alive && !x.cuffed && !x.triggered) { x.triggered = true; x.startFlee(); } });
      else if (x.plan === 'shoot' && x.armed === 'gun') later(g, 1, () => { x.say('Gelin bakalım! Hazırım!'); });
    }
  });
  m.focus = s.a('inside', 0); m.parTime = 210;
}, 3);

crime('aileIciSiddet', 'Aile İçi Şiddet', ['mustakil'], (s) => {
  const m = s.m, rng = s.rng, g = s.g;
  const h = s.info.house;
  h.doors.front.locked = rng.chance(0.5);
  const room = rng.pick(['salon', 'mutfak']);
  const ag = s.npc('suspect', s.a(room, 0, 0.3), s.personality({ armed: rng.chance(0.35) ? rng.pick(['knife', 'bat']) : null, state: 'argue', promil: rng.range(0, 1.8), plans: [['comply', 3], ['fight', 4], ['flee', 1], ['hostage', 1.5]] }));
  const vic = s.npc('victim', ag.pos.clone().add(new THREE.Vector3(1.1, 0, 0.2)), { state: 'cower', mood: 'scared', look: { gender: 'f' } });
  vic.flags.cowerT = 999; vic.flags.hurt = true; ag.partner = vic; ag.lookAt = vic.pos; ag.flags.canBreath = true;
  ag.lines.argue = ['Sana kaç kere söyledim!', 'Bu evde benim sözüm geçer!', 'Kimseyi çağıramazsın!'];
  vic.lines.statement = ['Yıllardır böyle... Bu gece içip geldi, bana vurdu.', 'Lütfen beni ve çocukları koruyun.'];
  if (ag.plan === 'hostage') { ag.plan = 'comply'; ag.flags.takesHostage = true; }
  const nb = s.npc('reporter', s.a('gate', 0, 1), { mood: 'scared' }); nb.lines.statement = ['Çığlıklar geliyordu, cam kırılma sesi duydum!'];
  s.brief(radioIntro(m, s.info, 'aile içi şiddet'), 'Komşular, evden çığlık ve kavga sesleri geldiğini bildirdi. Mağdur tehlikede olabilir.');
  m.obj('enter', 'Eve gir', 10); s.tick(() => { if (!m.getObj('enter').done && g.allPlayers().some(pl => { const p = pl.pos; return p.x > h.x0 && p.x < h.x1 && p.z > h.z0 && p.z < h.z1; })) m.done('enter'); });
  s.arrest([ag], 'arrest', 'Şiddet uygulayan şahsı gözaltına al', 40);
  s.statement(vic, 'st', 'Mağdurla konuş', 15);
  s.statement(nb, 'st2', 'Komşuyu dinle', 5, true);
  m.on('death', x => { if (x === vic) m.failMission('Mağdur hayatını kaybetti.'); });
  s.tick(() => {
    if (ag.flags.takesHostage && ag.triggered && !ag.flags.tookHostage && ag.alive && !ag.cuffed && ag.armed) {
      ag.flags.tookHostage = true; ag.hostage = vic; vic.captor = ag; vic.setState('hostage'); ag.setState('hostageTaker'); ag.tension = 60; m.hostageTaker = ag; m.hostageTimer = 70;
      g.toast('Saldırgan eşini rehin aldı!', 'bad'); ag.say('Yaklaşmayın! Onu da kendimi de öldürürüm!');
    }
    if (ag.state === 'argue' && rng.chance(0.004)) { g.sfx('punch', ag.pos); vic.char.shake = 0.4; vic.say('Ahh! Yapma!'); }
  });
  m.focus = ag.pos.clone();
}, 1.5);

crime('catisma', 'Silahlı Çatışma', ['sanayi', 'otopark', 'sokakArasi', 'kopruAlti', 'cikmazSokak', 'agaclik', 'benzinlik'], (s) => {
  const m = s.m, rng = s.rng;
  const n = rng.int(2, 3); const sus = [];
  for (let i = 0; i < n; i++) { const x = s.npc('suspect', s.a('scene', 0, 3), s.personality({ armed: 'gun', plans: [['shoot', 6], ['flee', 2], ['comply', 1.5]], compliance: rng.range(0.1, 0.5), aggression: rng.range(0.6, 1), items: ['Ruhsatsız tabanca', 'Fişekler'] })); x.triggerDist = 22; sus.push(x); }
  s.crowd(rng.int(1, 3), { state: 'cower' }).forEach(b => b.flags.cowerT = 999);
  s.brief(radioIntro(m, s.info, 'SİLAHLI ÇATIŞMA'), `${n} silahlı şahsın ateş açtığı bildirildi! Siper alın, gerekirse karşılık verin. Siviller bölgede olabilir.`);
  s.arrest(sus, 'arrest', 'Silahlı şüphelileri etkisiz hale getir', 60);
  m.obj('civ', 'Sivillerin zarar görmemesini sağla', 15);
  m.on('death', x => { if (!x.guilty) m.failObj('civ'); });
  s.tick(() => { if (m.getObj('arrest').done && !m.getObj('civ').failed) m.done('civ'); });
  m.focus = s.a('scene', 0);
}, 0.9);

// ---------------- Görev seçimi ----------------
export function compatible(crimeId) { return CRIMES[crimeId].locs; }
export function pickMission(rng, history = []) {
  const entries = Object.values(CRIMES).map(c => [c, c.weight * (history.slice(-4).some(h => h.crime === c.id) ? 0.1 : 1)]);
  const c = rng.weighted(entries);
  let locs = c.locs.filter(l => !history.slice(-3).some(h => h.loc === l));
  if (!locs.length) locs = c.locs;
  const loc = rng.pick(locs);
  return { crime: c.id, loc, variant: loc === 'mustakil' ? rng.int(1, 30) : 0 };
}
export function setupMission(game, mission, rng) {
  const ctx = new S(game, mission, rng);
  mission.crime.setup(ctx);
  // genel: araca dön
  mission.obj('return', 'Araca dön ve görevi bitir', 0, { hidden: true });
  return ctx;
}
