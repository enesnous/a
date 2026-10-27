// Kayıtlı ses dosyalarıyla ses motoru (sentez/konuşma sentezi yok).
// Kaynaklar: Red Eclipse (CC-BY-SA 4.0), CDDA CC-Sounds (CC-BY-SA 4.0), Hedgewars (GPL), Battle for Wesnoth (GPL).

// İngilizce repliklerin metinleri (altyazı için)
export const LINES = {
  leavemealone: 'Leave me alone!', whatthe: 'What the...!', runaway: 'Run away!', takecover: 'Take cover!', incoming: 'Incoming!',
  coward: 'Coward!', illgetyou: "I'll get you!", youllregretthat: "You'll regret that!", comeonthen: 'Come on then!', cutitout: 'Cut it out!',
  watchit: 'Watch it!', stupid: 'Stupid!', nooo: 'Nooo!', ouch: 'Ouch!', ow1: 'Ow!', ow2: 'Ow!', ow3: 'Ow!', ooff1: 'Oof!', ooff2: 'Oof!',
  uhoh: 'Uh-oh!', ohdear: 'Oh dear...', oops: 'Oops!', hello: 'Hello.', hmm: 'Hmm?', laugh: '(gülüyor)', hurry: 'Hurry!', byebye: 'Bye bye!',
  solong: 'So long!', gonnagetyou: 'Gonna get you!', justyouwait: 'Just you wait!', drat: 'Drat!', bugger: 'Bugger!', excellent: 'Excellent!',
  brilliant: 'Brilliant!', yessir: 'Yes sir!', traitor: 'Traitor!', missed: 'Missed!',
};
// Tepki türü -> replik listesi (null = sadece ses efekti: çığlık/acı/nefes)
export const VOICE = {
  flee: ['runaway', 'byebye', 'solong', 'uhoh'],
  attack: ['illgetyou', 'comeonthen', 'gonnagetyou', 'justyouwait'],
  hitPlayer: ['youllregretthat', 'coward', 'stupid', 'illgetyou'],
  shoot: ['illgetyou', 'comeonthen', 'youllregretthat', 'justyouwait'],
  surrender: ['ohdear', 'nooo', 'leavemealone', 'cutitout'],
  scared: ['leavemealone', 'whatthe', 'uhoh', 'nooo', '@scream'],
  panic: ['takecover', 'incoming', 'runaway', '@scream', '@scream'],
  fight: ['coward', 'stupid', 'comeonthen', 'watchit'],
  argue: ['cutitout', 'watchit', 'stupid', 'bugger', 'drat', 'whatthe'],
  pain: ['@hurt', '@hurt', 'ouch', 'ow1', 'ooff1'],
  tased: ['@hurt', 'ow2', '@hurt'],
  cuffResist: ['leavemealone', 'cutitout', 'traitor'],
  hostage: ['justyouwait', 'illgetyou', 'youllregretthat', 'stupid'],
  hostageVictim: ['@breath', 'nooo', '@breath'],
  thanks: ['excellent', 'brilliant', 'hello'],
  drunk: ['laugh', 'hmm', '@mumble'],
  greet: ['hello', 'hmm'],
  die: ['@die'],
  bystanderCuriosity: ['hmm', 'whatthe', 'uhoh'],
};
const PACKS = ['mobster', 'default', 'british', 'surfer', 'hillbilly'];

function b64ToBuf(b64) { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; }

export class AudioEngine {
  constructor() { this.ctx = null; this.vol = 0.9; this.musicOn = true; this.listener = null; this.loops = {}; this.man = null; this.raw = null; this.buf = {}; this.ready = false; this.musicEl = null; this.musicName = null; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = this.vol;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 3;
    this.master.connect(comp); comp.connect(c.destination);
    this.rev = c.createConvolver(); this.rev.buffer = this.impulse(1.8, 2.6);
    const rg = c.createGain(); rg.gain.value = 0.28; this.rev.connect(rg); rg.connect(this.master);
    this.load();
    if (this.pendingMusic) { const m = this.pendingMusic; this.pendingMusic = null; this.music(m); }
  }
  impulse(sec, decay) { const c = this.ctx, len = c.sampleRate * sec, b = c.createBuffer(2, len, c.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); } return b; }
  async load() {
    try {
      const r = await fetch('snd/pack.json'); const j = await r.json();
      this.man = j.man; this.raw = j.data; this.ready = true;
      for (const k of ['gun', 'gunfar', 'shell', 'step', 'static', 'chatter', 'hurt_m', 'punch', 'knock', 'breach', 'cardoor']) this.decodeAll(k);
    } catch (e) { console.warn('ses paketi yüklenemedi', e); }
  }
  decodeAll(name) { const l = this.man && this.man[name]; if (l) l.forEach(f => this.decode(f)); }
  decode(file) {
    if (this.buf[file]) return this.buf[file];
    const b64 = this.raw && this.raw[file]; if (!b64 || !this.ctx) return null;
    const p = this.ctx.decodeAudioData(b64ToBuf(b64)).then(b => { this.buf[file] = b; return b; }).catch(() => null);
    this.buf[file] = p; return p;
  }
  has(name) { return !!(this.man && this.man[name]); }
  pick(name) { const l = this.man && this.man[name]; if (!l || !l.length) return null; return l[Math.floor(Math.random() * l.length)]; }
  out(pos, vol = 1, rev = 0.25, rolloff = 0.09) {
    const c = this.ctx, g = c.createGain(); let v = vol, pan = 0;
    if (pos && this.listener) {
      const L = this.listener; const dx = pos.x - L.pos.x, dz = pos.z - L.pos.z, d = Math.hypot(dx, dz);
      v = vol / (1 + d * rolloff); pan = Math.max(-1, Math.min(1, (dx * L.right.x + dz * L.right.z) / (d + 0.5))) * 0.8;
    }
    g.gain.value = v;
    if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(this.master); if (rev) { const r = c.createGain(); r.gain.value = rev; p.connect(r); r.connect(this.rev); } }
    else g.connect(this.master);
    return g;
  }
  // Tek seferlik ses: name = manifest anahtarı
  play(name, { pos = null, vol = 1, rate = 1, rev = 0.25, rolloff = 0.09, delay = 0, file = null } = {}) {
    if (!this.ctx || !this.ready) return;
    const f = file || this.pick(name); if (!f) return;
    const go = (b) => {
      if (!b) return;
      const s = this.ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = rate * (0.96 + Math.random() * 0.08);
      s.connect(this.out(pos, vol, rev, rolloff)); s.start(this.ctx.currentTime + delay);
    };
    const b = this.buf[f] || this.decode(f);
    if (b && b.then) b.then(go); else go(b);
  }
  // Eski isimlerle uyum
  sfx(name, pos = null, vol = 1) {
    const L = this.listener, d = pos && L ? Math.hypot(pos.x - L.pos.x, pos.z - L.pos.z) : 0;
    switch (name) {
      case 'gunshot': this.play(d > 28 ? 'gunfar' : 'gun', { pos, vol: 1.3 * vol, rev: 0.7, rolloff: 0.05 }); break;
      case 'shell': this.play('shell', { pos, vol: 0.35, delay: 0.25, rev: 0 }); break;
      case 'dry': this.play('dry', { pos, vol: 0.8, rev: 0 }); break;
      case 'reload': this.play('reload', { pos, vol: 0.9, rev: 0 }); this.play('mag', { pos, vol: 0.7, delay: 0.8, rev: 0 }); break;
      case 'taser': this.play('taser', { pos, vol: 0.9 }); this.play('taserloop', { pos, vol: 0.6, delay: 0.15 }); break;
      case 'cuffs': this.play('cuffs', { pos, vol: 0.9, rev: 0 }); this.play('tink', { pos, vol: 0.6, delay: 0.35, rev: 0 }); break;
      case 'knock': this.play('knock', { pos, vol: 1.1 }); this.play('knock', { pos, vol: 1.0, delay: 0.35 }); break;
      case 'breach': this.play('breach', { pos, vol: 1.4, rev: 0.6 }); break;
      case 'doorOpen': this.play('dooropen', { pos, vol: 0.8 }); break;
      case 'doorClose': this.play('doorclose', { pos, vol: 0.8 }); break;
      case 'punch': this.play('punch', { pos, vol: 1.0 }); break;
      case 'slash': this.play('slash', { pos, vol: 1.0 }); break;
      case 'shove': this.play('thud', { pos, vol: 0.8 }); break;
      case 'step': this.play('step', { pos, vol: 0.35 * vol, rev: 0, rolloff: 0.3 }); break;
      case 'stepin': this.play('stepin', { pos, vol: 0.4 * vol, rev: 0, rolloff: 0.3 }); break;
      case 'radio': this.play('static', { vol: 0.5, rev: 0 }); this.play('chatter', { vol: 0.7, delay: 0.2, rev: 0 }); break;
      case 'radioEnd': this.play('static', { vol: 0.35, rev: 0 }); break;
      case 'carDoor': this.play('cardoor', { pos, vol: 1.0 }); break;
      case 'objective': this.play('objective', { vol: 0.6, rev: 0 }); break;
      case 'fail': this.play('fail', { vol: 0.7, rev: 0 }); break;
      case 'hurt': this.play('pain_me', { vol: 1.0, rev: 0 }); break;
      case 'boom': this.play('boom', { pos, vol: 1.8, rev: 0.9, rolloff: 0.03 }); break;
      case 'boomFar': this.play('boomfar', { vol: 0.9 }); break;
      case 'frisk': this.play('swing', { pos, vol: 0.4 }); break;
      case 'equip': this.play('equip', { vol: 0.6, rev: 0 }); break;
      case 'click': this.play('tick', { vol: 0.6, rev: 0 }); break;
      case 'glass': this.play('glass', { pos, vol: 1 }); break;
      case 'ui': this.play('ui', { vol: 0.5, rev: 0 }); break;
      case 'ricochet': this.play('ricochet', { pos, vol: 0.7 }); break;
    }
  }
  // NPC sesi seç: {name, rate, vol, text}
  voicePick(npc, kind) {
    const list = VOICE[kind]; if (!list || !this.man) return null;
    const it = list[Math.floor(Math.random() * list.length)];
    const f = npc.app.gender === 'f', old = npc.app.age > 62, child = npc.role === 'child' && npc.app.age < 14;
    const rate = child ? 1.35 : f ? 1.16 : old ? 0.92 : 1;
    if (it.startsWith('@')) {
      const k = it.slice(1);
      const name = k === 'hurt' ? (old && !f ? 'hurt_old' : f ? 'hurt_f' : 'hurt_m') : k === 'die' ? (old && !f ? 'die_old' : f ? 'die_f' : 'die_m') : k === 'scream' ? (f ? 'scream_f' : 'scream_m') : k === 'breath' ? (f ? 'breath_f' : 'breath_m') : k;
      return { name, rate: 1, vol: k === 'scream' ? 0.8 : 1, text: null };
    }
    const pack = npc.guilty ? 'mobster' : PACKS[1 + (npc.id % 4)];
    let name = `v_${pack}_${it}`; if (!this.has(name)) name = `v_default_${it}`; if (!this.has(name)) name = `v_mobster_${it}`;
    return { name, rate, vol: 1.1, text: LINES[it] || null };
  }
  playVoice(v, pos) { if (v) this.play(v.name, { pos, vol: v.vol, rate: v.rate, rev: 0.15, rolloff: 0.11 }); }
  // Sürekli sesler
  loop(name, on, opts = {}) {
    if (!on) { const l = this.loops[name]; if (l) { try { l.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25); const s = l.s; setTimeout(() => { try { s && s.stop(); } catch (e) { } }, 900); } catch (e) { } delete this.loops[name]; } return; }
    if (!this.ctx || this.loops[name]) return;
    const file = this.pick(name); if (!file) { return; }
    const g = this.ctx.createGain(); g.gain.value = 0; g.connect(this.master);
    const entry = { g, s: null }; this.loops[name] = entry;
    const start = (b) => {
      if (!b || this.loops[name] !== entry) return;
      const s = this.ctx.createBufferSource(); s.buffer = b; s.loop = true; s.connect(g); s.start(); entry.s = s;
      g.gain.setTargetAtTime(opts.vol ?? 0.3, this.ctx.currentTime, 0.5);
    };
    const b = this.buf[file] || this.decode(file);
    if (b && b.then) b.then(start); else start(b);
  }
  setLoopVol(name, v) { const l = this.loops[name]; if (l && this.ctx) l.g.gain.setTargetAtTime(v, this.ctx.currentTime, 0.3); }
  // Arka plan müziği (HTML ses öğesi)
  music(name, vol = 0.22) {
    if (!this.ctx) { this.pendingMusic = name; return; }
    if (this.musicName === name && this.musicEl) { this.musicEl.volume = this.musicOn ? vol : 0; return; }
    if (this.musicEl) { const el = this.musicEl; this.fadeOut(el); }
    this.musicName = name; this.musicEl = null;
    if (!name) return;
    const el = new Audio('snd/' + name + '.mp3'); el.loop = true; el.volume = 0; this.musicEl = el;
    el.play().catch(() => { });
    const target = this.musicOn ? vol : 0; let v = 0;
    const iv = setInterval(() => { v = Math.min(target, v + 0.02); el.volume = v; if (v >= target) clearInterval(iv); }, 60);
    this.musicVol = vol;
  }
  fadeOut(el) { const iv = setInterval(() => { el.volume = Math.max(0, el.volume - 0.03); if (el.volume <= 0) { clearInterval(iv); el.pause(); } }, 60); }
  setMusicOn(on) { this.musicOn = on; if (this.musicEl) this.musicEl.volume = on ? (this.musicVol || 0.22) : 0; }
  stopSpeech() { }
  speak() { }
}
