// Arayüz: HUD (sol üst talimat, sağ üst harita, sol alt can, sağ alt envanter), altyazı, diyalog, menüler.
import { idCard } from './textures.js';

const ICONS = {
  hand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12"/><path d="M11 11.5V4a1.5 1.5 0 0 1 3 0v7.5"/><path d="M14 11.5V5.5a1.5 1.5 0 0 1 3 0V13"/><path d="M17 9.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.2a6 6 0 0 1-4.6-2.2L5 15.2a1.6 1.6 0 0 1 2.4-2.1L8 14"/></svg>',
  glock: '<svg viewBox="0 0 32 24" fill="currentColor"><path d="M3 6h22l1 1v3h-2v1H13l-1 1v1l-1.2 7.4a1 1 0 0 1-1 .6H6.2a.8.8 0 0 1-.8-1L7 12H5L3 10z"/><rect x="25" y="7" width="4" height="2" rx=".5"/><path d="M12 12h4l-.5 2.5h-3" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
  cuffs: '<svg viewBox="0 0 32 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="14" r="5.5"/><circle cx="24" cy="14" r="5.5"/><path d="M12.5 10.5c1-1.5 2-2 3.5-2s2.5.5 3.5 2" stroke-dasharray="2 1.6"/><rect x="5" y="5" width="4" height="3" rx=".5" fill="currentColor" stroke="none"/><rect x="23" y="5" width="4" height="3" rx=".5" fill="currentColor" stroke="none"/></svg>',
  taser: '<svg viewBox="0 0 32 24"><path d="M4 7h20l3 1.5v3L24 13H13l-1.5 7.5a1 1 0 0 1-1 .5H7.2a.8.8 0 0 1-.8-1L8 13H6L4 11z" fill="#f2c318"/><rect x="24" y="8" width="5" height="4" rx="1" fill="#111"/><path d="M27 4l-2 3h2l-2 3" stroke="#7ad3ff" stroke-width="1.2" fill="none"/></svg>',
};
const SLOTS = [{ k: 'none', n: 'Boş', i: 'hand' }, { k: 'glock', n: 'Glock 17', i: 'glock' }, { k: 'cuffs', n: 'Kelepçe', i: 'cuffs' }, { k: 'taser', n: 'Şok Cihazı', i: 'taser' }];

const esc = (t) => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class UI {
  constructor(game) {
    this.g = game;
    const root = this.root = document.getElementById('ui');
    root.innerHTML = `
      <div id="vignette"></div><div id="dmg"></div><div id="flash"></div><div id="fade"></div>
      <div id="hud" hidden>
        <section id="brief" class="panel">
          <div class="b-top"><span class="dot"></span><span id="b-title">GÖREV</span><span id="b-num"></span></div>
          <div id="b-loc"></div>
          <ul id="b-obj"></ul>
          <div id="b-timer" hidden><span>Rehine süresi</span><b id="b-time">0:00</b></div>
          <div id="b-tension" hidden><span id="b-tlabel">Gerginlik</span><i><em id="b-tbar"></em></i></div>
        </section>
        <section id="map" class="panel"><canvas id="mapc" width="380" height="380"></canvas><span class="n">K</span><div id="map-loc"></div></section>
        <section id="team" hidden></section>
        <section id="health" class="panel">
          <svg viewBox="0 0 24 24" class="heart"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.2 0 3.6 1.2 4.3 2.4h2c.7-1.2 2.1-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z" fill="currentColor"/></svg>
          <div class="hb"><div class="row"><span>CAN</span><b id="hp-n">100</b></div><i><em id="hp-bar"></em></i></div>
        </section>
        <section id="inv"></section>
        <div id="cross"><i></i><i></i><i></i><i></i><b></b></div>
        <div id="prompt" hidden></div>
        <div id="progress" hidden><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="16"/><circle id="prog-c" cx="20" cy="20" r="16"/></svg><span id="prog-t"></span></div>
        <div id="subs"></div>
        <div id="dialog" class="panel" hidden><div id="d-who"></div><ol id="d-opts"></ol><div class="hint">1–8 ile seç · 0 kapat · tekerlek + sol tık</div></div>
        <div id="radio" class="panel" hidden><div class="r-top">TELSİZ — 34-155</div><ol id="r-opts"></ol><div class="hint">1–6 ile seç · T veya 0 kapat</div></div>
        <div id="toasts"></div>
        <img id="idcard" hidden alt="Kimlik kartı">
        <div id="incar" hidden><div class="ic-panel"><div class="ic-head"><span class="led"></span> MERKEZ TELSİZİ</div><div id="ic-text"></div><div id="ic-key"><kbd>E</kbd> Araçtan in · <kbd>H</kbd> Siren · Etrafa bakmak için ekrana tıkla</div><div id="ic-team"></div></div></div>
      </div>
      <div id="menu" class="screen">
        <div class="m-wrap">
          <div class="m-badge">POLİS MÜDAHALE SİMÜLASYONU</div>
          <h1>FIRST<span> AID</span></h1>
          <p class="m-sub">İhbar gelir. Olay yerine gidersin. Doğru kararı verirsin. Ve araca dönersin.</p>
          <section class="mp panel">
            <div class="mp-h"><span class="mp-dot"></span>EKİPLE OYNA</div>
            <label>Takma adın <input id="nick" maxlength="18" autocomplete="off"></label>
            <div class="mp-row"><button id="btn-host" class="primary">Lobi Kur</button><span class="or">ya da</span><input id="join-code" maxlength="8" placeholder="KOD" autocomplete="off"><button id="btn-join">Katıl</button></div>
            <p id="mp-note" class="mp-note">Arkadaşına lobi kodunu ver; aynı kodla girenler aynı ekipte olur.</p>
          </section>
          <div class="m-btns">
            <button id="btn-play">Tek Başına Devriye</button>
            <button id="btn-select">Görev Seç</button>
            <div class="m-btns row"><button id="btn-controls">Kontroller</button><button id="btn-credits">Ses &amp; Müzik Kaynakları</button></div>
          </div>
          <div class="m-set">
            <label>Kalite <select id="set-q"><option value="1">Düşük</option><option value="2" selected>Orta</option><option value="3">Yüksek</option></select></label>
            <label>Müzik <select id="set-m"><option value="1" selected>Açık</option><option value="0">Kapalı</option></select></label>
            <label>Fare hassasiyeti <input id="set-s" type="range" min="0.4" max="2" step="0.1" value="1"></label>
          </div>
          <div class="m-career" id="m-career"></div>
        </div>
      </div>
      <div id="lobby" class="screen" hidden>
        <div class="m-wrap narrow lobby">
          <div class="lb-top"><div><span class="lb-k">LOBİ KODU</span><b id="lb-code">----</b></div><button id="lb-copy" title="Kodu kopyala">Kopyala</button></div>
          <ul id="lb-list"></ul>
          <div id="lb-hostctl">
            <div class="lb-l">Oyun türü</div>
            <div class="seg"><button id="lb-mode-single">Tek Görev</button><button id="lb-mode-patrol">Devriye (görev görev devam)</button></div>
            <div class="lb-l">Görev</div>
            <div class="seg"><button id="lb-random">Rastgele</button><button id="lb-pick">Görev Seç…</button></div>
            <div id="lb-spec" class="lb-spec"></div>
            <button id="lb-start" class="primary">Görevi Başlat</button>
          </div>
          <p id="lb-wait" class="mp-note" hidden>Ekip lideri görevi başlattığında otomatik olarak araca bineceksin.</p>
          <button id="lb-leave">Lobiden Ayrıl</button>
        </div>
      </div>
      <div id="credits" class="screen" hidden>
        <div class="m-wrap narrow">
          <h2>Ses &amp; Müzik Kaynakları</h2>
          <p class="mp-note">Oyundaki tüm sesler açık lisanslı oyun projelerinden alınmış gerçek kayıtlardır; sentez veya seslendirme yoktur.</p>
          <ul class="cr">
            <li><b>Red Eclipse</b> — tabanca, kovan, acı/ölüm sesleri, adımlar, arayüz sesleri, müzik (Derek "JoJo" Stegall). CC-BY-SA 4.0</li>
            <li><b>CDDA CC-Sounds</b> (Cataclysm: DDA ses paketi, freesound.org kaynaklı) — tabanca, şarjör, kapı açma/kırma, siren, telsiz cızırtısı ve konuşma uğultusu, erkek/kadın acı sesleri, çığlık, yağmur, gece. CC-BY-SA 4.0</li>
            <li><b>Hedgewars</b> ses paketleri (Mobster, Default, British, Surfer, HillBilly) — İngilizce kısa replikler ("Leave me alone!", "What the…!", "Run away!", "Take cover!" vb.). GPL</li>
            <li><b>Battle for Wesnoth</b> — insan, kadın ve yaşlı acı/ölüm sesleri. GPL-2+</li>
          </ul>
          <div class="m-btns row"><button id="cr-back" class="primary">Tamam</button></div>
        </div>
      </div>
      <div id="select" class="screen" hidden>
        <div class="m-wrap narrow">
          <h2>Görev Seç</h2>
          <label>Suç <select id="sel-crime"></select></label>
          <label>Olay yeri <select id="sel-loc"></select></label>
          <label id="sel-var-l">Ev numarası (1–30) <input id="sel-var" type="number" min="1" max="30" value="1"></label>
          <div class="m-btns row"><button id="sel-go" class="primary">Göreve Çık</button><button id="sel-back">Geri</button></div>
        </div>
      </div>
      <div id="controls" class="screen" hidden>
        <div class="m-wrap narrow">
          <h2>Kontroller</h2>
          <table class="keys">
            <tr><td>W A S D</td><td>Hareket</td></tr><tr><td>Shift</td><td>Koş</td></tr><tr><td>Fare</td><td>Etrafa bak</td></tr>
            <tr><td>Sağ tık</td><td>Nişan al</td></tr><tr><td>Sol tık</td><td>Ateş et / kullan / it</td></tr>
            <tr><td>1 2 3 4</td><td>Boş · Glock · Kelepçe · Şok cihazı</td></tr><tr><td>R</td><td>Şarjör / kartuş değiştir</td></tr>
            <tr><td>E</td><td>Konuş · kapı · kelepçele · araç (basılı: ilk yardım)</td></tr><tr><td>Q</td><td>Sözlü uyarı (POLİS! ELLER YUKARI!)</td></tr>
            <tr><td>F</td><td>Kapıyı tekmeyle kır</td></tr><tr><td>T</td><td>Telsiz (ambulans, GBT, itfaiye, bomba imha)</td></tr>
            <tr><td>L</td><td>Silah feneri</td></tr><tr><td>H</td><td>Siren</td></tr><tr><td>Esc</td><td>Duraklat</td></tr>
          </table>
          <div class="m-btns row"><button id="ctl-back" class="primary">Tamam</button></div>
        </div>
      </div>
      <div id="pause" class="screen" hidden>
        <div class="m-wrap narrow"><h2>Duraklatıldı</h2><p id="p-note" class="mp-note" hidden>Ekip oyununda oyun durmaz; ekibin devam ediyor.</p><div class="m-btns"><button id="p-resume" class="primary">Devam Et</button><button id="p-restart">Görevi Yeniden Başlat</button><button id="p-menu">Ana Menü</button></div></div>
      </div>
      <div id="end" class="screen" hidden>
        <div class="m-wrap end">
          <div id="e-status"></div>
          <div class="e-grid">
            <div class="e-grade"><b id="e-grade">A</b><span id="e-glabel"></span></div>
            <div class="e-score"><span>PUAN</span><b id="e-score">0</b><small>/ 100</small></div>
          </div>
          <div id="e-reason"></div>
          <ul id="e-lines"></ul>
          <div id="e-help" hidden>Gerçek hayatta zor bir dönemden geçiyorsan yalnız değilsin: Acil durumda 112'yi arayabilirsin.</div>
          <div id="e-career"></div>
          <p id="e-wait" class="mp-note" hidden>Ekip lideri bir sonraki görevi başlatınca otomatik geçilecek.</p>
          <div class="m-btns row"><button id="e-next" class="primary">Sonraki Görev</button><button id="e-retry">Tekrar Dene</button><button id="e-menu">Ana Menü</button></div>
        </div>
      </div>
      <div id="loading" class="screen" hidden><div class="ld"><div class="spin"></div><span id="ld-t">Olay yeri hazırlanıyor…</span></div></div>
    `;
    this.$ = (id) => document.getElementById(id);
    this.buildInv();
    this.subs = []; this.toastsList = [];
    this.mapc = this.$('mapc'); this.mapx = this.mapc.getContext('2d');
  }
  buildInv() {
    const inv = this.$('inv');
    inv.innerHTML = SLOTS.map((s, i) => `<div class="slot" data-i="${i}"><span class="k">${i + 1}</span><span class="ic">${ICONS[s.i]}</span><span class="nm">${s.n}</span><span class="am" id="am-${i}"></span></div>`).join('');
  }
  show(id, on = true) { this.$(id).hidden = !on; }
  setSlot(i, p) {
    document.querySelectorAll('.slot').forEach((el, k) => el.classList.toggle('on', k === i));
    this.$('am-1').textContent = `${p.ammo}/${p.reserve}`; this.$('am-3').textContent = `${p.taserLoaded}/${p.taserSpare}`;
    this.$('am-2').textContent = '';
  }
  hp(v) { this.$('hp-n').textContent = Math.max(0, Math.round(v)); const b = this.$('hp-bar'); b.style.width = Math.max(0, v) + '%'; b.parentElement.parentElement.parentElement.classList.toggle('low', v < 35); }
  objectives(m) {
    this.$('b-title').textContent = m.title.toLocaleUpperCase('tr-TR');
    this.$('b-num').textContent = `#${this.g.career.missions + 1}`;
    this.$('b-loc').textContent = `${m.info.name} · ${m.info.address}`;
    const list = m.objectives.filter(o => !o.hidden || o.done).filter(o => o.id !== 'return');
    let html = list.map(o => `<li class="${o.done ? 'done' : o.failed ? 'fail' : ''}${o.optional ? ' opt' : ''}"><i></i><span>${o.text}${o.optional ? ' <em>(isteğe bağlı)</em>' : ''}</span></li>`).join('');
    if (m.ready && !m.failed) html += `<li class="go"><i></i><span>Araca dön ve görevi bitir</span></li>`;
    this.$('b-obj').innerHTML = html;
  }
  timers(m) {
    if (m.netTimers) return this.timersNet(m);
    const ht = m.hostageTaker && m.hostageTaker.hostage && m.hostageTimer > 0;
    this.show('b-timer', !!ht);
    if (ht) { const t = Math.max(0, m.hostageTimer); this.$('b-time').textContent = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`; this.$('b-timer').classList.toggle('urgent', t < 20); }
    const tens = ht ? m.hostageTaker.tension : (m.jumper && m.jumper.state === 'edge' ? m.jumper.tension : null);
    this.show('b-tension', tens !== null);
    if (tens !== null) { this.$('b-tbar').style.width = tens + '%'; this.$('b-tlabel').textContent = ht ? 'Rehineci gerginliği' : 'Kişinin gerginliği'; this.$('b-tension').classList.toggle('hot', tens > 70); }
  }
  timersNet(m) {
    const [time, ht, jt] = m.netTimers;
    const on = ht >= 0 && time > 0;
    this.show('b-timer', on);
    if (on) { this.$('b-time').textContent = `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`; this.$('b-timer').classList.toggle('urgent', time < 20); }
    const tens = ht >= 0 ? ht : jt >= 0 ? jt : null;
    this.show('b-tension', tens !== null);
    if (tens !== null) { this.$('b-tbar').style.width = tens + '%'; this.$('b-tlabel').textContent = ht >= 0 ? 'Rehineci gerginliği' : 'Kişinin gerginliği'; this.$('b-tension').classList.toggle('hot', tens > 70); }
  }
  setNick(n) { this.$('nick').value = n; }
  netAvailable(ok) {
    for (const id of ['btn-host', 'btn-join', 'join-code']) this.$(id).disabled = !ok;
    if (!ok) this.$('mp-note').textContent = 'Ekip moduna bağlanılamadı. İnternet bağlantını kontrol edip sayfayı yenile.';
  }
  pauseNote(multi) { this.$('p-note').hidden = !multi; this.$('p-restart').hidden = multi && !this.g.net.isHost; }
  lobby(g) {
    const n = g.net; this.$('lb-code').textContent = n.code || '----';
    const host = n.hostPeer();
    const ms = n.members();
    this.$('lb-list').innerHTML = ms.length ? ms.map(p => { const pr = p.presence || {}; const me = p.isMe && p.sameTab; const isH = host && host.peer === p.peer; return `<li class="${me ? 'me' : ''}"><span class="av">${esc((pr.nick || '?').slice(0, 1)).toUpperCase()}</span><span class="nm">${esc(pr.nick || 'Memur')}${me ? ' <em>(sen)</em>' : ''}</span>${isH ? '<span class="tag">LİDER</span>' : ''}${pr.st && pr.st !== 'lobby' ? `<span class="st">${pr.st === 'play' ? 'görevde' : pr.st === 'car' ? 'araçta' : pr.st}</span>` : ''}</li>`; }).join('') : '<li class="dim">Bağlanılıyor…</li>';
    const isHost = n.isHost;
    this.$('lb-hostctl').hidden = !isHost; this.$('lb-wait').hidden = isHost;
    this.$('lb-mode-single').classList.toggle('on', g.mode === 'single'); this.$('lb-mode-patrol').classList.toggle('on', g.mode !== 'single');
    this.$('lb-random').classList.toggle('on', !g.lobbySpec); this.$('lb-pick').classList.toggle('on', !!g.lobbySpec);
    this.$('lb-spec').textContent = 'Her görevde rastgele bir suç ve olay yeri seçilir.';
    if (g.lobbySpec) { const c = g.crimeName(g.lobbySpec.crime), l = g.locName(g.lobbySpec.loc); this.$('lb-spec').textContent = `${c} — ${l}${g.lobbySpec.loc === 'mustakil' ? ' #' + g.lobbySpec.variant : ''}`; }
  }
  team(g) {
    const t = this.$('team'); const rs = [...g.remotes.values()];
    t.hidden = !rs.length;
    if (rs.length) t.innerHTML = rs.map(r => `<div class="tm ${r.dead ? 'dead' : ''}"><span>${esc(r.nick)}</span><i><em style="width:${Math.max(0, r.hp)}%"></em></i></div>`).join('');
    const ic = this.$('ic-team'); if (ic) ic.textContent = rs.length ? 'Ekip: ' + rs.map(r => r.nick).join(', ') : '';
  }
  prompt(t) { const p = this.$('prompt'); if (!t) { p.hidden = true; return; } p.hidden = false; if (p._t !== t) { p.innerHTML = t; p._t = t; } }
  progress(f, label) { const p = this.$('progress'); if (f === null) { p.hidden = true; return; } p.hidden = false; this.$('prog-c').style.strokeDashoffset = String(100.5 * (1 - f)); this.$('prog-t').textContent = label; }
  cross(on, spread = 0, hit = false) { const c = this.$('cross'); c.classList.toggle('on', on); c.classList.toggle('dot', spread < 0); c.style.setProperty('--s', (6 + Math.max(0, spread) * 220) + 'px'); c.classList.toggle('hit', hit); }
  sub(who, text, cls = '', html = false) {
    const el = document.createElement('div'); el.className = 'sub ' + cls;
    el.innerHTML = `<b>${esc(who)}</b><span>${html ? text : esc(text)}</span>`;
    const box = this.$('subs'); box.appendChild(el);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    const dur = Math.max(2600, text.length * 70);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, dur);
  }
  toast(t, kind = 'info') {
    const el = document.createElement('div'); el.className = 'toast ' + kind; el.textContent = t;
    const box = this.$('toasts'); box.appendChild(el); while (box.children.length > 5) box.removeChild(box.firstChild);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 3800);
  }
  dialog(npc, label, opts) {
    const d = this.$('dialog');
    if (!npc) { d.hidden = true; return; }
    d.hidden = false;
    this.$('d-who').innerHTML = `<b>${esc(label)}</b>`;
    this.$('d-opts').innerHTML = opts.map((o, i) => `<li data-i="${i}"><span>${i + 1}</span>${esc(o.label)}</li>`).join('');
    this.$('d-opts').querySelectorAll('li').forEach(li => li.onclick = () => this.g.chooseDialog(+li.dataset.i));
  }
  radio(opts) {
    const r = this.$('radio');
    if (!opts) { r.hidden = true; return; }
    r.hidden = false;
    this.$('r-opts').innerHTML = opts.map((o, i) => `<li data-i="${i}" class="${o.dim ? 'dim' : ''}"><span>${i + 1}</span>${o.label}</li>`).join('');
    this.$('r-opts').querySelectorAll('li').forEach(li => li.onclick = () => this.g.chooseRadio(+li.dataset.i));
  }
  showId(info) {
    const img = this.$('idcard'); img.src = idCard(info); img.hidden = false; img.classList.remove('out');
    clearTimeout(this._idT); this._idT = setTimeout(() => { img.classList.add('out'); setTimeout(() => img.hidden = true, 400); }, 4500);
  }
  incar(text, on = true) { this.show('incar', on); if (on) this.$('ic-text').innerHTML = text; }
  damage(v) { const d = this.$('dmg'); d.style.opacity = Math.min(1, v); }
  flash(c = '#fff', o = 0.6) { const f = this.$('flash'); f.style.background = c; f.style.transition = 'none'; f.style.opacity = o; requestAnimationFrame(() => { f.style.transition = 'opacity .5s'; f.style.opacity = 0; }); }
  fade(on, ms = 500) { const f = this.$('fade'); f.style.transition = `opacity ${ms}ms`; f.style.opacity = on ? 1 : 0; }
  end(res, m, career, o = {}) {
    this.show('end', true);
    const multi = o.role && o.role !== 'solo';
    this.$('e-next').hidden = multi && !o.host; this.$('e-retry').hidden = multi && !o.host; this.$('e-wait').hidden = !(multi && !o.host);
    this.$('e-next').textContent = multi && o.mode === 'single' ? 'Yeni Görev' : 'Sonraki Görev';
    this.$('e-menu').textContent = multi ? 'Lobiye Dön' : 'Ana Menü';
    const st = this.$('e-status');
    st.textContent = res.failed ? 'GÖREV BAŞARISIZ' : res.success ? 'GÖREV TAMAMLANDI' : 'GÖREV YARIM KALDI';
    st.className = res.failed ? 'bad' : res.success ? 'ok' : 'warn';
    this.$('e-grade').textContent = res.grade; this.$('e-grade').className = 'g' + res.grade.replace('+', 'p');
    this.$('e-glabel').textContent = res.gradeLabel;
    this.$('e-score').textContent = res.score;
    this.$('e-reason').textContent = res.failed ? res.failed : `${m.title} · ${m.info.name}`;
    this.$('e-lines').innerHTML = res.lines.map(l => `<li class="${l.ok ? 'ok' : 'bad'}"><span>${l.label}</span><b>${l.pts > 0 ? '+' : ''}${l.pts}</b></li>`).join('');
    this.$('e-help').hidden = !m.flags.helpline;
    this.$('e-career').textContent = `Kariyer: ${career.missions} görev · ${career.points} toplam puan · Ortalama ${career.missions ? Math.round(career.points / career.missions) : 0}`;
  }
  career(c) { this.$('m-career').textContent = c.missions ? `Kariyer: ${c.missions} görev · ${c.points} puan` : ''; }
  // Mini harita
  drawMap(game) {
    const g = this.mapx, W = 380, w = game.world, p = game.player;
    if (!game.mapImg) return;
    const s = game.mapScale; // px/m (yüksek çözünürlük)
    const view = 2.2; // görünen ölçek
    g.save();
    g.clearRect(0, 0, W, W);
    g.fillStyle = '#0b0f16'; g.fillRect(0, 0, W, W);
    g.translate(W / 2, W / 2);
    const yaw = game.cam.yaw;
    g.rotate(yaw + Math.PI);
    const k = view / s;
    g.scale(k, k);
    g.translate(-(p.pos.x - game.mapOrigin.x) * s, -(p.pos.z - game.mapOrigin.z) * s);
    g.drawImage(game.mapImg, 0, 0);
    // odak noktası
    const toM = (v) => [(v.x - game.mapOrigin.x) * s, (v.z - game.mapOrigin.z) * s];
    const m = game.mission;
    if (m && m.focus) { const [x, y] = toM(m.focus); g.fillStyle = 'rgba(255,200,60,0.18)'; g.beginPath(); g.arc(x, y, 9 * s, 0, 7); g.fill(); g.strokeStyle = '#ffc83c'; g.lineWidth = 2 / k; g.stroke(); }
    // araç
    const car = game.policeCar;
    if (car) { const [x, y] = toM(car.position); g.save(); g.translate(x, y); g.rotate(-car.rotation.y); g.fillStyle = '#e8eef8'; g.fillRect(-1 * s, -2.4 * s, 2 * s, 4.8 * s); g.fillStyle = Math.sin(performance.now() / 120) > 0 ? '#ff3344' : '#3366ff'; g.fillRect(-0.7 * s, -0.3 * s, 1.4 * s, 0.6 * s); g.restore(); }
    for (const r of game.remotes.values()) {
      if (r.inCar) continue; const [x, y] = toM(r.pos);
      g.save(); g.translate(x, y); g.rotate(-r.yaw); g.fillStyle = r.dead ? '#ff6b75' : '#3ddcff'; g.beginPath(); g.moveTo(0, 1.6 * s); g.lineTo(1.1 * s, -1.1 * s); g.lineTo(-1.1 * s, -1.1 * s); g.closePath(); g.fill(); g.restore();
    }
    for (const n of game.npcs) {
      if (n.removed) continue;
      const [x, y] = toM(n.pos);
      let c = '#d8dde6';
      if (n.state === 'dead') c = '#555b66';
      else if (n.cuffed) c = '#58b0ff';
      else if (n.isThreat || (n.guilty && n.triggered && ['flee', 'attack', 'shoot'].includes(n.state))) c = '#ff3b4a';
      else if (['victim', 'reporter', 'parent', 'clerk', 'hostage', 'injured', 'jumper', 'child'].includes(n.role)) c = '#ffd25a';
      g.fillStyle = c; g.beginPath(); g.arc(x, y, 0.9 * s, 0, 7); g.fill();
    }
    g.restore();
    // oyuncu oku (merkez)
    g.save(); g.translate(W / 2, W / 2); g.rotate(-(p.yaw - yaw));
    g.fillStyle = '#7fd0ff'; g.strokeStyle = '#06121f'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, -14); g.lineTo(10, 10); g.lineTo(0, 5); g.lineTo(-10, 10); g.closePath(); g.stroke(); g.fill();
    g.restore();
    // kuzey işareti
    const n = document.querySelector('#map .n');
    if (n) { const a = yaw - Math.PI * 1.5; n.style.transform = `translate(${Math.cos(a) * 80}px, ${Math.sin(a) * 80}px)`; }
  }
}
