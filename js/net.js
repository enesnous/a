// Çok oyunculu kodlu lobi. claude.ai içinde "room" yeteneği, diğer sitelerde (ör. Vercel)
// PeerJS/WebRTC kullanılır. Lobi lideri (en erken katılan) NPC'leri ve görevi yönetir.
export const TOPICS = ['start', 'snap', 'act', 'evt', 'end', 'lobby'];

export class Net {
  constructor(game) {
    this.g = game; this.room = null; this.lobby = null; this.code = null; this.handlers = {};
    this.available = false; this.peers = []; this.joinT = 0; this.nick = 'Memur';
    this.unsubs = [];
  }
  async init() {
    try {
      if (window.claude && window.claude.use) this.room = await window.claude.use('room');
    } catch (e) { this.room = null; }
    if (!this.room) {
      try { await loadPeerJS(); this.room = { join: (name) => new PeerLobby(name).start() }; } catch (e) { this.room = null; }
    }
    this.available = !!this.room;
    return this.available;
  }
  get active() { return !!this.lobby; }
  async join(code) {
    if (!this.room) throw new Error('room');
    await this.leave();
    code = String(code).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
    if (!code) throw new Error('code');
    this.lobby = await this.room.join('fa-' + code);
    this.code = code.toUpperCase(); this.joinT = Date.now();
    for (const t of TOPICS) this.unsubs.push(this.lobby.on(t, (msg) => this.dispatch(t, msg), () => { }));
    this.unsubs.push(this.lobby.onPeers((ch) => { this.peers = ch.peers; this.g.onPeersChanged(ch); }, () => { }));
    this.presence({ nick: this.nick, t: this.joinT, st: 'lobby' });
    return this.code;
  }
  async leave() {
    for (const u of this.unsubs) { try { u(); } catch (e) { } }
    this.unsubs = [];
    if (this.lobby) { try { await this.lobby.leave(); } catch (e) { } }
    this.lobby = null; this.code = null; this.peers = [];
  }
  presence(patch) { if (this.lobby) this.lobby.presence(patch).catch(() => { }); }
  send(topic, data) { if (this.lobby) this.lobby.emit(topic, data).catch(() => { }); }
  on(topic, fn) { this.handlers[topic] = fn; }
  dispatch(topic, msg) {
    if (msg.isMe && msg.sameTab) return; // kendi yankımız
    const d = msg.data || {};
    if (d.to && d.to !== this.myPeer()) return;
    const h = this.handlers[topic]; if (h) { try { h(d, msg); } catch (e) { console.error(e); } }
  }
  me() { return this.peers.find(p => p.isMe && p.sameTab); }
  myPeer() { const m = this.me(); return m ? m.peer : null; }
  // Lobidekiler (oyun açık olanlar)
  members() { return this.peers.filter(p => p.kind === 'viewer' && p.presence && p.presence.nick); }
  remotes() { return this.members().filter(p => !(p.isMe && p.sameTab)); }
  hostPeer() {
    const ms = this.members(); if (!ms.length) return null;
    return ms.slice().sort((a, b) => (a.presence.t || 9e15) - (b.presence.t || 9e15) || (a.peer < b.peer ? -1 : 1))[0];
  }
  get isHost() {
    if (!this.lobby) return true;
    if (this.lobby.connected && !this.lobby.connected()) return false; // yeniden bağlanırken liderlik değişmez
    const h = this.hostPeer(); return !h || (h.isMe && h.sameTab); }
}

export function randomCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = ''; for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

// ---------- PeerJS (WebRTC) arka ucu ----------
// Yıldız yapı: lobi kodunun "merkez" kimliğini ilk alan sekme mesajları diğerlerine aktarır.
// Merkez ayrılırsa kalanlar yeniden bağlanır; ilk sıradaki merkez olur.
function loadPeerJS() {
  if (window.peerjs && window.peerjs.Peer) return Promise.resolve();
  return new Promise((res, rej) => {
    const sc = document.createElement('script');
    sc.src = new URL('../vendor/peerjs.min.js', import.meta.url).href;
    sc.onload = () => (window.peerjs && window.peerjs.Peer ? res() : rej(new Error('peerjs')));
    sc.onerror = () => rej(new Error('peerjs'));
    document.head.appendChild(sc);
  });
}
const dbg = (...a) => { if (window.FA_NET_DEBUG) console.warn('[net]', ...a); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

class PeerLobby {
  constructor(name) {
    this.name = name; this.hubId = 'firstaid-v2-' + name;
    this.topicH = {}; this.peerH = []; this.pres = {}; this.list = new Map(); // peer -> presence
    this.peer = null; this.me = null; this.isHub = false; this.conns = new Map(); this.hubConn = null;
    this.closed = false; this.connected = false; this.seen = new Map(); this.hubSeen = 0;
  }
  async start() {
    await this.connect(0);
    // sekme kapanınca hemen ayrıl (merkez kimliği boşalsın, diğerleri beklemesin)
    this.onHide = () => { try { if (this.isHub) this.broadcast({ t: 'bye' }); else if (this.hubConn) this.hubConn.send({ t: 'bye' }); } catch (e) { } this.close(); };
    window.addEventListener('pagehide', this.onHide);
    // canlılık: 2 sn'de bir ping; 20 sn ses gelmeyen bağlantı kopmuş sayılır
    this.hb = setInterval(() => {
      const now = Date.now();
      if (this.isHub) {
        this.broadcast({ t: 'ping' });
        for (const [id, c] of this.conns) if (now - (this.seen.get(id) || now) > 20000) { try { c.close(); } catch (e) { } this.dropConn(id); }
      } else if (this.hubConn) {
        try { this.hubConn.send({ t: 'ping' }); } catch (e) { }
        if (now - this.hubSeen > 20000) { const c = this.hubConn; this.hubConn = null; try { c.close(); } catch (e) { } this.hubLost(); }
      }
    }, 2000);
    return this.api();
  }
  api() {
    return {
      name: this.name,
      emit: async (topic, data) => this.emit(topic, data),
      on: (t, f) => { (this.topicH[t] ||= []).push(f); return () => { this.topicH[t] = this.topicH[t].filter(x => x !== f); }; },
      presence: async (patch) => this.setPresence(patch),
      peers: () => this.snapshot(),
      onPeers: (f) => { this.peerH.push(f); setTimeout(() => f({ peers: this.snapshot(), joined: [], left: [], updated: [] }), 0); return () => { this.peerH = this.peerH.filter(x => x !== f); }; },
      connected: () => this.connected,
      leave: async () => this.close(),
    };
  }
  newPeer(id) {
    return new Promise((res, rej) => {
      const P = window.peerjs.Peer;
      const o = Object.assign({ debug: 0 }, window.FA_PEER_OPTS || {});
      const p = id ? new P(id, o) : new P(o);
      let done = false;
      const t = setTimeout(() => { if (!done) { done = true; try { p.destroy(); } catch (e) { } rej(new Error('timeout')); } }, 12000);
      p.on('open', () => { if (done) return; done = true; clearTimeout(t); res(p); });
      p.on('error', (e) => { if (done) return; done = true; clearTimeout(t); try { p.destroy(); } catch (x) { } rej(e); });
    });
  }
  // Merkez olmayı dener; kimlik alınmışsa merkeze istemci olarak bağlanır.
  async connect(delay) {
    for (let attempt = 0; !this.closed && attempt < 12; attempt++) {
      if (delay) await sleep(delay); delay = 1500;
      try {
        const p = await this.newPeer(this.hubId);
        this.becomeHub(p); return;
      } catch (e) {
        if (!(e && e.type === 'unavailable-id')) { if (attempt > 2) throw e; continue; }
      }
      try { await this.becomeClient(); return; } catch (e) { /* merkez kapanmış olabilir: tekrar dene */ }
    }
    if (!this.closed) throw new Error('bağlantı kurulamadı');
  }
  setup(p) {
    const old = this.me;
    this.peer = p; this.me = p.id; this.connected = true;
    if (old && old !== this.me) this.list.delete(old);
    this.list.set(this.me, this.pres);
    p.on('disconnected', () => { if (!this.closed && !p.destroyed) try { p.reconnect(); } catch (e) { } });
  }
  becomeHub(p) {
    dbg('becomeHub');
    this.isHub = true; this.setup(p);
    const removed = [...this.list.keys()].filter(k => k !== this.me);
    for (const k of removed) this.list.delete(k);
    if (removed.length) this.notify([], removed, []);
    p.on('connection', (c) => {
      c.on('open', () => {
        this.conns.set(c.peer, c); this.seen.set(c.peer, Date.now());
        // tam liste, istemcinin ilk mesajı gelince gönderilir (açılışta gönderilen mesaj kaybolabiliyor)
      });
      c.on('data', (m) => this.hubData(c.peer, m));
      const gone = () => { if (this.conns.get(c.peer) === c) this.dropConn(c.peer); };
      c.on('close', gone); c.on('error', gone);
    });
    this.notify([], [], [this.me]);
  }
  dropConn(id) {
    if (this.closed || !this.conns.has(id)) return;
    this.conns.delete(id); this.seen.delete(id);
    const had = this.list.delete(id);
    this.broadcast({ t: 'gone', peer: id });
    if (had) this.notify([], [id], []);
  }
  hubData(from, m) {
    this.seen.set(from, Date.now());
    if (!m || typeof m !== 'object' || m.t === 'ping') return;
    if (m.t === 'bye') { this.dropConn(from); return; }
    if (m.t === 'hello') { const c = this.conns.get(from); if (c && c.open) c.send({ t: 'all', list: [...this.list.entries()] }); return; }
    if (m.t === 'p') {
      const isNew = !this.list.has(from);
      this.list.set(from, m.presence || {});
      this.broadcast({ t: 'p', peer: from, presence: m.presence || {} }, from);
      this.notify(isNew ? [from] : [], [], isNew ? [] : [from]);
    } else if (m.t === 'e') {
      const fw = { t: 'e', topic: m.topic, data: m.data, peer: from };
      const to = m.data && m.data.to;
      if (to && to !== this.me) { const c = this.conns.get(to); if (c && c.open) c.send(fw); return; }
      if (!to) this.broadcast(fw, from);
      this.deliver(m.topic, m.data, from);
    }
  }
  broadcast(msg, except) { for (const [id, c] of this.conns) if (id !== except && c.open) { try { c.send(msg); } catch (e) { } } }
  async becomeClient() {
    dbg('becomeClient');
    const p = await this.newPeer(null);
    this.isHub = false; this.setup(p);
    await new Promise((res, rej) => {
      const c = p.connect(this.hubId, { reliable: true, serialization: 'json' });
      let ok = false;
      const t = setTimeout(() => { if (!ok) { try { p.destroy(); } catch (e) { } rej(new Error('timeout')); } }, 10000);
      p.on('error', (e) => { if (!ok) { clearTimeout(t); try { p.destroy(); } catch (x) { } rej(e); } });
      c.on('open', () => {
        ok = true; clearTimeout(t); this.hubConn = c; this.hubSeen = Date.now();
        c.send({ t: 'p', presence: this.pres });
        // tam listeyi iste; gelmezse tekrar iste
        const ask = () => { if (this.hubConn === c && !this.gotAll) { try { c.send({ t: 'hello' }); } catch (e) { } setTimeout(ask, 1000); } };
        this.gotAll = false; ask();
        res();
      });
      c.on('data', (m) => { if (this.hubConn === c) this.clientData(m); });
      c.on('close', () => { if (ok && this.hubConn === c) { this.hubConn = null; this.hubLost(); } });
    });
  }
  clientData(m) {
    this.hubSeen = Date.now(); if (m && m.t !== 'ping' && m.t !== 'e' && m.t !== 'p') dbg('rx ' + JSON.stringify(m).slice(0, 200));
    if (!m || typeof m !== 'object' || m.t === 'ping') return;
    if (m.t === 'bye') { const c = this.hubConn; this.hubConn = null; try { c && c.close(); } catch (e) { } this.hubLost(); return; }
    if (m.t === 'all') {
      this.gotAll = true;
      const before = new Set(this.list.keys());
      this.list = new Map(m.list); this.list.set(this.me, this.pres);
      const joined = [...this.list.keys()].filter(k => !before.has(k));
      const left = [...before].filter(k => !this.list.has(k));
      this.notify(joined, left, []);
    } else if (m.t === 'p') {
      const isNew = !this.list.has(m.peer);
      this.list.set(m.peer, m.presence || {});
      this.notify(isNew ? [m.peer] : [], [], isNew ? [] : [m.peer]);
    } else if (m.t === 'gone') {
      if (this.list.delete(m.peer)) this.notify([], [m.peer], []);
    } else if (m.t === 'e') this.deliver(m.topic, m.data, m.peer);
  }
  async hubLost() {
    if (this.closed || this.reconnecting) return;
    dbg('hubLost');
    this.reconnecting = true;
    this.connected = false; this.hubConn = null;
    // liste hemen silinmez: yeniden bağlanınca gelen tam liste ya da merkez olunca farklar bildirilir
    const old = [...this.list.keys()];
    const rank = old.filter(k => k !== this.hubId).sort((a, b) => ((this.list.get(a) || {}).t || 9e15) - ((this.list.get(b) || {}).t || 9e15)).indexOf(this.me);
    try { this.peer.destroy(); } catch (e) { }
    try { await this.connect(300 + Math.max(0, rank) * 1200); } catch (e) { console.warn('lobby reconnect failed', e); }
    this.reconnecting = false;
  }
  setPresence(patch) {
    for (const k in patch) { if (patch[k] === null || patch[k] === undefined) delete this.pres[k]; else this.pres[k] = patch[k]; }
    this.list.set(this.me, this.pres);
    if (this.isHub) this.broadcast({ t: 'p', peer: this.me, presence: this.pres });
    else if (this.hubConn && this.hubConn.open) this.hubConn.send({ t: 'p', presence: this.pres });
    this.notify([], [], [this.me]);
  }
  emit(topic, data) {
    data = data === undefined ? null : JSON.parse(JSON.stringify(data));
    if (this.isHub) {
      const fw = { t: 'e', topic, data, peer: this.me };
      const to = data && data.to;
      if (to) { const c = this.conns.get(to); if (c && c.open) c.send(fw); }
      else this.broadcast(fw);
    } else if (this.hubConn && this.hubConn.open) this.hubConn.send({ t: 'e', topic, data });
  }
  deliver(topic, data, from) {
    const msg = { topic, data, peer: from, isMe: from === this.me, sameTab: from === this.me, kind: 'viewer', by: null, guest: false };
    for (const f of this.topicH[topic] || []) { try { f(msg); } catch (e) { console.error(e); } }
  }
  snapshot() {
    return [...this.list.entries()].map(([peer, presence]) => ({ peer, presence: { ...presence }, isMe: peer === this.me, sameTab: peer === this.me, kind: 'viewer', by: null, guest: false, updatedAt: Date.now() }));
  }
  notify(joined, left, updated) {
    const peers = this.snapshot(), by = (ids) => ids.map(id => peers.find(p => p.peer === id) || { peer: id, presence: {} });
    const ch = { peers, joined: by(joined), left: left.map(id => ({ peer: id, presence: {} })), updated: by(updated) };
    for (const f of this.peerH) { try { f(ch); } catch (e) { console.error(e); } }
  }
  close() {
    this.closed = true; this.connected = false; clearInterval(this.hb);
    if (this.onHide) window.removeEventListener('pagehide', this.onHide);
    try { if (this.peer) this.peer.destroy(); } catch (e) { }
    this.conns.clear(); this.list.clear(); this.hubConn = null;
  }
}
