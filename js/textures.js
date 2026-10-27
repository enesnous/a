// Prosedürel kanvas dokuları: zeminler, cepheler, tabelalar, yüzler, kıyafetler.
import * as THREE from 'three';
import { RNG } from './util.js';

export const FONT = 'Inter, system-ui, sans-serif';
let ANISO = 4;
export function setAnisotropy(a) { ANISO = a; }
const cache = new Map();

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, { srgb = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = ANISO;
  t.needsUpdate = true;
  return t;
}
function cached(key, fn) {
  if (!cache.has(key)) { if (cache.size > 450) { let i = 0; for (const k of cache.keys()) { cache.delete(k); if (++i > 120) break; } } cache.set(key, fn()); }
  return cache.get(key);
}
function shade(hex, f) {
  const c = new THREE.Color(hex);
  if (f >= 0) c.lerp(new THREE.Color(1, 1, 1), f); else c.multiplyScalar(1 + f);
  return '#' + c.getHexString();
}
export { shade };

// Yükseklik dizisinden normal map üretir
function normalFromHeight(hgt, w, h, strength = 2) {
  const c = canvas(w, h), ctx = c.getContext('2d'), img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const l = hgt[y * w + ((x - 1 + w) % w)], r = hgt[y * w + ((x + 1) % w)];
    const u = hgt[((y - 1 + h) % h) * w + x], d = hgt[((y + 1) % h) * w + x];
    let nx = (l - r) * strength, ny = (u - d) * strength, nz = 1;
    const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
    const i = (y * w + x) * 4;
    img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255; img.data[i + 2] = (nz * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return tex(c, { srgb: false });
}
function noiseField(w, h, rng, blobs = 400, rmin = 1, rmax = 3) {
  const a = new Float32Array(w * h);
  for (let i = 0; i < a.length; i++) a[i] = rng.next() * 0.35;
  for (let b = 0; b < blobs; b++) {
    const cx = rng.next() * w, cy = rng.next() * h, r = rng.range(rmin, rmax), v = rng.range(-0.6, 0.9);
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const dd = ((x - cx) ** 2 + (y - cy) ** 2) / (r * r); if (dd > 1) continue;
      const xi = (x + w) % w, yi = (y + h) % h; a[yi * w + xi] += v * (1 - dd);
    }
  }
  return a;
}

// ---------------- Islak asfalt ----------------
export function asphalt() {
  return cached('asphalt', () => {
    const S = 512, rng = new RNG(77);
    const c = canvas(S, S), g = c.getContext('2d');
    g.fillStyle = '#2b2d31'; g.fillRect(0, 0, S, S);
    const img = g.getImageData(0, 0, S, S);
    for (let i = 0; i < S * S; i++) {
      const n = (rng.next() - 0.5) * 22 + (rng.next() < 0.02 ? rng.range(6, 18) : 0);
      img.data[i * 4] += n; img.data[i * 4 + 1] += n; img.data[i * 4 + 2] += n * 1.05;
    }
    g.putImageData(img, 0, 0);
    // lekeler
    for (let i = 0; i < 26; i++) {
      const x = rng.next() * S, y = rng.next() * S, r = rng.range(20, 90);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const dark = rng.chance(0.6);
      gr.addColorStop(0, dark ? 'rgba(10,10,12,0.35)' : 'rgba(80,80,85,0.18)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // çatlaklar
    g.strokeStyle = 'rgba(12,12,14,0.85)';
    for (let i = 0; i < 14; i++) {
      let x = rng.next() * S, y = rng.next() * S; g.lineWidth = rng.range(0.8, 2.2); g.beginPath(); g.moveTo(x, y);
      const n = rng.int(6, 18); let a = rng.next() * 6.28;
      for (let k = 0; k < n; k++) { a += rng.range(-0.8, 0.8); x += Math.cos(a) * rng.range(4, 14); y += Math.sin(a) * rng.range(4, 14); g.lineTo(x, y); }
      g.stroke();
    }
    // pürüzlülük haritası (su birikintileri düşük pürüzlülük)
    const rc = canvas(S, S), rg = rc.getContext('2d');
    rg.fillStyle = 'rgb(150,150,150)'; rg.fillRect(0, 0, S, S);
    const rimg = rg.getImageData(0, 0, S, S);
    for (let i = 0; i < S * S; i++) { const n = (rng.next() - 0.5) * 50; rimg.data[i * 4 + 1] = Math.max(0, Math.min(255, 150 + n)); rimg.data[i * 4] = rimg.data[i * 4 + 1]; rimg.data[i * 4 + 2] = rimg.data[i * 4 + 1]; }
    rg.putImageData(rimg, 0, 0);
    for (let i = 0; i < 18; i++) {
      const x = rng.next() * S, y = rng.next() * S, r = rng.range(18, 70);
      rg.save(); rg.translate(x, y); rg.scale(1, rng.range(0.4, 1)); rg.rotate(rng.next() * 3);
      const gr = rg.createRadialGradient(0, 0, 0, 0, 0, r); gr.addColorStop(0, 'rgba(15,15,15,1)'); gr.addColorStop(0.7, 'rgba(25,25,25,0.9)'); gr.addColorStop(1, 'rgba(25,25,25,0)');
      rg.fillStyle = gr; rg.beginPath(); rg.arc(0, 0, r, 0, 7); rg.fill(); rg.restore();
    }
    const h = noiseField(256, 256, rng, 2600, 0.6, 2.2);
    return { map: tex(c), roughnessMap: tex(rc, { srgb: false }), normalMap: normalFromHeight(h, 256, 256, 1.6) };
  });
}

export function concreteTiles(color = '#8d8a84', tile = 4) {
  return cached('tiles' + color + tile, () => {
    const S = 256, rng = new RNG(13);
    const c = canvas(S, S), g = c.getContext('2d');
    const step = S / tile;
    for (let y = 0; y < tile; y++) for (let x = 0; x < tile; x++) {
      g.fillStyle = shade(color, rng.range(-0.12, 0.08)); g.fillRect(x * step, y * step, step, step);
      for (let k = 0; k < 120; k++) { g.fillStyle = `rgba(${rng.chance(0.5) ? '0,0,0' : '255,255,255'},${rng.range(0.03, 0.09)})`; g.fillRect(x * step + rng.next() * step, y * step + rng.next() * step, 2, 2); }
    }
    g.strokeStyle = 'rgba(20,20,20,0.75)'; g.lineWidth = 3;
    for (let i = 0; i <= tile; i++) { g.beginPath(); g.moveTo(i * step, 0); g.lineTo(i * step, S); g.stroke(); g.beginPath(); g.moveTo(0, i * step); g.lineTo(S, i * step); g.stroke(); }
    const hc = new Float32Array(128 * 128);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) { const gx = (x % (128 / tile)) < 1.5, gy = (y % (128 / tile)) < 1.5; hc[y * 128 + x] = (gx || gy) ? 0 : 1 + rng.next() * 0.05; }
    return { map: tex(c), normalMap: normalFromHeight(hc, 128, 128, 1.2) };
  });
}

export function bricks(color = '#8a4b38', mortar = '#b9b2a4') {
  return cached('brick' + color + mortar, () => {
    const S = 256, rng = new RNG(5), c = canvas(S, S), g = c.getContext('2d');
    g.fillStyle = mortar; g.fillRect(0, 0, S, S);
    const bh = S / 8, bw = S / 4;
    for (let r = 0; r < 8; r++) for (let k = -1; k < 5; k++) {
      const x = k * bw + (r % 2 ? bw / 2 : 0);
      g.fillStyle = shade(color, rng.range(-0.2, 0.15)); g.fillRect(x + 2, r * bh + 2, bw - 4, bh - 4);
      for (let n = 0; n < 30; n++) { g.fillStyle = `rgba(0,0,0,${rng.range(0.05, 0.15)})`; g.fillRect(x + 2 + rng.next() * (bw - 6), r * bh + 2 + rng.next() * (bh - 6), 2, 2); }
    }
    const hc = new Float32Array(128 * 128);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      const r = Math.floor(y / 16), xx = (x + (r % 2 ? 16 : 0)) % 32, yy = y % 16;
      hc[y * 128 + x] = (xx < 1 || yy < 1) ? 0 : 1;
    }
    return { map: tex(c), normalMap: normalFromHeight(hc, 128, 128, 1.5) };
  });
}

export function plaster(color) {
  return cached('plaster' + color, () => {
    const S = 128, rng = new RNG(9), c = canvas(S, S), g = c.getContext('2d');
    g.fillStyle = color; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${rng.chance(0.5) ? '0,0,0' : '255,255,255'},${rng.range(0.02, 0.06)})`; g.fillRect(rng.next() * S, rng.next() * S, rng.range(1, 3), rng.range(1, 3)); }
    return { map: tex(c) };
  });
}

export function woodFloor(color = '#8b5a33') {
  return cached('wood' + color, () => {
    const S = 256, rng = new RNG(21), c = canvas(S, S), g = c.getContext('2d');
    const pw = S / 6;
    for (let i = 0; i < 6; i++) {
      let y = 0;
      while (y < S) {
        const len = rng.range(60, 160);
        g.fillStyle = shade(color, rng.range(-0.18, 0.12)); g.fillRect(i * pw, y, pw, len);
        for (let k = 0; k < 14; k++) { g.strokeStyle = `rgba(30,15,5,${rng.range(0.08, 0.2)})`; g.lineWidth = 1; g.beginPath(); const xx = i * pw + rng.next() * pw; g.moveTo(xx, y); g.bezierCurveTo(xx + rng.range(-4, 4), y + len * 0.3, xx + rng.range(-4, 4), y + len * 0.6, xx, y + len); g.stroke(); }
        g.fillStyle = 'rgba(20,10,5,0.7)'; g.fillRect(i * pw, y, pw, 1.5);
        y += len;
      }
      g.fillStyle = 'rgba(20,10,5,0.7)'; g.fillRect(i * pw, 0, 1.5, S);
    }
    return { map: tex(c) };
  });
}

export function floorTiles(a = '#d8d4cc', b = '#9c968c', n = 4, checker = true) {
  return cached('ftile' + a + b + n + checker, () => {
    const S = 256, rng = new RNG(3), c = canvas(S, S), g = c.getContext('2d'), st = S / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      g.fillStyle = shade((checker && (x + y) % 2) ? b : a, rng.range(-0.05, 0.05)); g.fillRect(x * st, y * st, st, st);
    }
    g.strokeStyle = 'rgba(60,60,60,0.6)'; g.lineWidth = 2;
    for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * st, 0); g.lineTo(i * st, S); g.stroke(); g.beginPath(); g.moveTo(0, i * st); g.lineTo(S, i * st); g.stroke(); }
    return { map: tex(c) };
  });
}

// Türk kilimi desenli halı
export function kilim(seed = 1) {
  seed = ((seed % 10) + 10) % 10;
  return cached('kilim' + seed, () => {
    const rng = new RNG(seed * 31 + 7), S = 256, c = canvas(S, S), g = c.getContext('2d');
    const pals = [['#8e1b1b', '#e0b35a', '#1d2f5e', '#f1e6cf', '#2c5a3a'], ['#5a1e3a', '#d98c3a', '#2a4c6b', '#efe3c8', '#7a2b1a'], ['#1e3d59', '#c94f3d', '#e8c872', '#f4ecd8', '#3b6b4c'], ['#6b2d14', '#c99a46', '#24323f', '#efe0c0', '#9d3a2a']];
    const p = rng.pick(pals);
    g.fillStyle = p[0]; g.fillRect(0, 0, S, S);
    g.fillStyle = p[3]; g.fillRect(10, 10, S - 20, S - 20);
    g.fillStyle = p[0]; g.fillRect(18, 18, S - 36, S - 36);
    for (let r = 0; r < 4; r++) for (let k = 0; k < 2; k++) {
      const cx = 64 + k * 128, cy = 32 + r * 64, s = 26;
      g.fillStyle = p[(r + k) % 2 ? 1 : 2];
      g.beginPath(); g.moveTo(cx, cy - s); g.lineTo(cx + s * 1.5, cy); g.lineTo(cx, cy + s); g.lineTo(cx - s * 1.5, cy); g.closePath(); g.fill();
      g.fillStyle = p[3]; g.beginPath(); g.moveTo(cx, cy - s * 0.5); g.lineTo(cx + s * 0.75, cy); g.lineTo(cx, cy + s * 0.5); g.lineTo(cx - s * 0.75, cy); g.closePath(); g.fill();
      g.fillStyle = p[4]; g.fillRect(cx - 4, cy - 4, 8, 8);
    }
    for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(0,0,0,${rng.range(0.02, 0.08)})`; g.fillRect(rng.next() * S, rng.next() * S, 2, 1); }
    return { map: tex(c, { repeat: false }) };
  });
}

export function grass(color = '#2f4a26') {
  return cached('grass' + color, () => {
    const S = 256, rng = new RNG(17), c = canvas(S, S), g = c.getContext('2d');
    g.fillStyle = color; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 5000; i++) { g.strokeStyle = shade(color, rng.range(-0.35, 0.35)); g.lineWidth = 1; const x = rng.next() * S, y = rng.next() * S; g.beginPath(); g.moveTo(x, y); g.lineTo(x + rng.range(-2, 2), y - rng.range(2, 6)); g.stroke(); }
    for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(60,45,25,0.25)'; g.beginPath(); g.arc(rng.next() * S, rng.next() * S, rng.range(3, 12), 0, 7); g.fill(); }
    return { map: tex(c) };
  });
}

export function turf() {
  return cached('turf', () => {
    const S = 256, rng = new RNG(4), c = canvas(S, S), g = c.getContext('2d');
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#2f7a34' : '#378a3c'; g.fillRect(0, i * 32, S, 32); }
    for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(${rng.chance(0.5) ? '0,0,0' : '200,255,200'},0.07)`; g.fillRect(rng.next() * S, rng.next() * S, 1, 2); }
    return { map: tex(c) };
  });
}

export function dirt() {
  return cached('dirt', () => {
    const S = 256, rng = new RNG(8), c = canvas(S, S), g = c.getContext('2d');
    g.fillStyle = '#4a3c2c'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 4000; i++) { g.fillStyle = shade('#4a3c2c', rng.range(-0.4, 0.3)); g.fillRect(rng.next() * S, rng.next() * S, rng.range(1, 3), rng.range(1, 3)); }
    for (let i = 0; i < 300; i++) { g.fillStyle = 'rgba(40,60,25,0.35)'; g.fillRect(rng.next() * S, rng.next() * S, 2, 4); }
    return { map: tex(c) };
  });
}

// Bina cephesi: pencereler, yanan ışıklar (emissive)
export function facade(wall = '#b8a48a', floors = 4, cols = 4, seed = 1, style = 0) {
  seed = ((seed % 12) + 12) % 12; floors = Math.min(floors, 10);
  return cached(`fac${wall}${floors}${cols}${seed}${style}`, () => {
    const rng = new RNG(seed), W = 256, H = 64 * floors;
    const c = canvas(W, H), g = c.getContext('2d'), e = canvas(W, H), ge = e.getContext('2d');
    g.fillStyle = wall; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(0,0,0,${rng.range(0.02, 0.07)})`; g.fillRect(rng.next() * W, rng.next() * H, 2, 2); }
    ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
    const cw = W / cols;
    for (let f = 0; f < floors; f++) {
      g.fillStyle = shade(wall, -0.18); g.fillRect(0, f * 64 + 60, W, 4);
      for (let k = 0; k < cols; k++) {
        const x = k * cw + cw * 0.2, y = f * 64 + 14, w = cw * 0.6, h = 36;
        const lit = rng.chance(0.42);
        const warm = rng.pick(['#ffcf87', '#ffd9a0', '#fff1cf', '#c9e2ff', '#ffb36b']);
        g.fillStyle = '#121418'; g.fillRect(x - 2, y - 2, w + 4, h + 4);
        g.fillStyle = lit ? warm : '#1d2430'; g.fillRect(x, y, w, h);
        if (lit) {
          const cur = rng.pick(['#7a2f2f', '#2f4f7a', '#7a6a2f', '#4f7a4f', '#6a3f6a', null]);
          ge.fillStyle = warm; ge.fillRect(x, y, w, h);
          if (cur) { g.fillStyle = cur; g.fillRect(x, y, w * 0.22, h); g.fillRect(x + w * 0.78, y, w * 0.22, h); ge.fillStyle = shade(warm, -0.6); ge.fillRect(x, y, w * 0.22, h); ge.fillRect(x + w * 0.78, y, w * 0.22, h); }
          if (rng.chance(0.3)) { ge.fillStyle = 'rgba(0,0,0,0.6)'; ge.fillRect(x + w * 0.4, y + h * 0.3, w * 0.18, h * 0.7); }
        } else { g.fillStyle = 'rgba(120,140,170,0.15)'; g.fillRect(x + 3, y + 3, w * 0.3, h - 6); }
        g.fillStyle = '#d8d4cc'; g.fillRect(x, y + h / 2 - 1, w, 2); g.fillRect(x + w / 2 - 1, y, 2, h);
        if (style === 1 && rng.chance(0.4)) { g.fillStyle = '#ddd'; g.fillRect(x + w + 4, y + 18, 14, 10); g.fillStyle = '#999'; g.fillRect(x + w + 6, y + 20, 10, 6); }
        g.fillStyle = shade(wall, -0.3); g.fillRect(x - 4, y + h + 2, w + 8, 4);
      }
    }
    return { map: tex(c, { repeat: false }), emissiveMap: tex(e, { repeat: false }) };
  });
}

// LED/neon tabela
export function sign(text, { bg = '#101418', fg = '#ffffff', w = 512, h = 128, border = null, size = 0.62, weight = 800, glow = true, sub = null } = {}) {
  return cached(`sign${text}${bg}${fg}${w}${h}${border}${size}${sub}`, () => {
    const c = canvas(w, h), g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    if (border) { g.strokeStyle = border; g.lineWidth = h * 0.06; g.strokeRect(h * 0.05, h * 0.05, w - h * 0.1, h - h * 0.1); }
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    let fs = h * size; g.font = `${weight} ${fs}px ${FONT}`;
    while (g.measureText(text).width > w * 0.9 && fs > 8) { fs -= 2; g.font = `${weight} ${fs}px ${FONT}`; }
    if (glow) { g.shadowColor = fg; g.shadowBlur = h * 0.08; }
    g.fillText(text, w / 2, sub ? h * 0.42 : h / 2);
    if (sub) { g.font = `600 ${h * 0.2}px ${FONT}`; g.shadowBlur = 0; g.fillText(sub, w / 2, h * 0.8); }
    return tex(c, { repeat: false });
  });
}

export function plate(text) {
  return cached('plate' + text, () => {
    const c = canvas(256, 56), g = c.getContext('2d');
    g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, 256, 56);
    g.fillStyle = '#1f3fa8'; g.fillRect(0, 0, 30, 56);
    g.fillStyle = '#fff'; g.font = `700 16px ${FONT}`; g.textAlign = 'center'; g.fillText('TR', 15, 44);
    g.strokeStyle = '#111'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, 253, 53);
    g.fillStyle = '#111'; g.font = `800 34px ${FONT}`; g.textBaseline = 'middle'; g.fillText(text, 143, 30);
    return tex(c, { repeat: false });
  });
}

// ---------------- Karakter yüzleri ----------------
export function face(expr = 'neutral', opts = {}) {
  const { brow = '#2a1d15', beard = 'none', hairColor = '#222', female = false, police = false } = opts;
  return cached(`face${expr}${brow}${beard}${hairColor}${female}${police}`, () => {
    const S = 256, c = canvas(S, S), g = c.getContext('2d');
    g.clearRect(0, 0, S, S);
    const ink = '#15100d';
    const eyeY = 112, ex = 62;
    // kirli sakal / sakal dokusu
    if (beard === 'stubble' || beard === 'long' || beard === 'goatee') {
      const rng = new RNG(42);
      g.fillStyle = hairColor;
      const dens = beard === 'stubble' ? 0.28 : 0.5;
      for (let i = 0; i < 1400; i++) {
        const x = rng.range(30, 226), y = rng.range(150, 250);
        const inJaw = ((x - 128) ** 2) / (100 * 100) + ((y - 150) ** 2) / (100 * 100) < 1 && !(y < 196 && Math.abs(x - 128) < 40 && y > 170);
        if (inJaw && (beard !== 'goatee' || Math.abs(x - 128) < 40)) { g.globalAlpha = dens; g.fillRect(x, y, 2.5, 2.5); }
      }
      g.globalAlpha = 1;
    }
    // gözler
    const drawEye = (x, scale = 1) => {
      if (expr === 'dead') {
        g.strokeStyle = ink; g.lineWidth = 9; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x - 14, eyeY - 14); g.lineTo(x + 14, eyeY + 14); g.moveTo(x + 14, eyeY - 14); g.lineTo(x - 14, eyeY + 14); g.stroke(); return;
      }
      if (expr === 'pain' || expr === 'tased') {
        g.strokeStyle = ink; g.lineWidth = 8; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x - 15, eyeY - 8); g.lineTo(x + 2, eyeY); g.lineTo(x - 15, eyeY + 8); if (x > 128) { g.moveTo(x + 15, eyeY - 8); g.lineTo(x - 2, eyeY); g.lineTo(x + 15, eyeY + 8); } g.stroke(); return;
      }
      const h = (expr === 'scared' ? 26 : 22) * scale, w = (expr === 'scared' ? 16 : 13) * scale;
      g.fillStyle = ink; g.beginPath(); g.ellipse(x, eyeY, w, h, 0, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x - w * 0.3, eyeY - h * 0.4, w * 0.35, h * 0.3, 0, 0, 7); g.fill();
      if (female) { g.strokeStyle = ink; g.lineWidth = 4; g.beginPath(); g.moveTo(x + (x < 128 ? -w : w), eyeY - h * 0.6); g.lineTo(x + (x < 128 ? -w - 9 : w + 9), eyeY - h - 2); g.stroke(); }
    };
    drawEye(128 - ex); drawEye(128 + ex);
    // kaşlar
    g.strokeStyle = brow; g.lineWidth = 11; g.lineCap = 'round';
    const browL = (y1, y2) => { g.beginPath(); g.moveTo(128 - ex - 24, y1); g.lineTo(128 - ex + 20, y2); g.stroke(); g.beginPath(); g.moveTo(128 + ex + 24, y1); g.lineTo(128 + ex - 20, y2); g.stroke(); };
    if (expr === 'angry') browL(68, 84);
    else if (expr === 'scared' || expr === 'sad') browL(80, 64);
    else if (expr !== 'dead') browL(72, 70);
    // ağız
    g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = 9;
    g.beginPath();
    switch (expr) {
      case 'happy': g.arc(128, 168, 34, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); break;
      case 'angry': g.moveTo(92, 188); g.quadraticCurveTo(128, 168, 164, 188); g.stroke(); g.fillStyle = '#fff'; g.fillRect(104, 178, 48, 7); break;
      case 'scared': g.ellipse(128, 186, 20, 26, 0, 0, 7); g.fill(); g.fillStyle = '#7a2020'; g.beginPath(); g.ellipse(128, 194, 12, 10, 0, 0, 7); g.fill(); break;
      case 'pain': case 'tased': g.ellipse(128, 186, 26, 14, 0, 0, 7); g.fill(); g.fillStyle = '#fff'; g.fillRect(104, 176, 48, 6); break;
      case 'dead': g.moveTo(100, 188); g.lineTo(156, 188); g.stroke(); break;
      case 'sad': g.arc(128, 206, 30, 1.2 * Math.PI, 1.8 * Math.PI); g.stroke(); break;
      case 'smug': g.moveTo(98, 182); g.quadraticCurveTo(140, 192, 162, 170); g.stroke(); break;
      case 'shout': g.ellipse(128, 184, 24, 22, 0, 0, 7); g.fill(); g.fillStyle = '#fff'; g.fillRect(108, 166, 40, 7); break;
      default: g.moveTo(102, 182); g.quadraticCurveTo(128, 194, 154, 182); g.stroke();
    }
    if (female && expr !== 'dead') { g.fillStyle = 'rgba(210,90,100,0.35)'; g.beginPath(); g.ellipse(60, 160, 18, 10, 0, 0, 7); g.ellipse(196, 160, 18, 10, 0, 0, 7); g.fill(); }
    const t = tex(c, { repeat: false });
    return t;
  });
}

// ---------------- Kıyafet dokuları ----------------
export function topTexture(type, color, opts = {}) {
  const { back = false, police = false, accent = '#ffffff' } = opts;
  return cached(`top${type}${color}${back}${police}${accent}`, () => {
    const S = 128, c = canvas(S, S), g = c.getContext('2d'), rng = new RNG(type.length * 7 + color.length);
    g.fillStyle = color; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(${rng.chance(0.5) ? '0,0,0' : '255,255,255'},${rng.range(0.02, 0.05)})`; g.fillRect(rng.next() * S, rng.next() * S, 2, 2); }
    const dk = shade(color, -0.35), lt = shade(color, 0.25);
    switch (type) {
      case 'hoodie':
        if (!back) {
          g.fillStyle = dk; g.fillRect(28, 78, 72, 34); g.fillStyle = shade(color, -0.15); g.fillRect(31, 81, 66, 28);
          g.strokeStyle = '#e8e8e8'; g.lineWidth = 3; g.beginPath(); g.moveTo(54, 6); g.lineTo(52, 44); g.moveTo(74, 6); g.lineTo(76, 44); g.stroke();
          g.fillStyle = dk; g.beginPath(); g.moveTo(34, 0); g.lineTo(64, 22); g.lineTo(94, 0); g.fill();
        }
        g.fillStyle = dk; g.fillRect(0, 118, S, 10); break;
      case 'shirt':
        if (!back) {
          g.fillStyle = shade(color, 0.35); g.beginPath(); g.moveTo(40, 0); g.lineTo(64, 18); g.lineTo(88, 0); g.lineTo(80, 0); g.lineTo(64, 10); g.lineTo(48, 0); g.fill();
          g.fillStyle = dk; g.fillRect(63, 14, 2, 114);
          g.fillStyle = '#eee'; for (let y = 24; y < 128; y += 22) { g.beginPath(); g.arc(68, y, 2.5, 0, 7); g.fill(); }
          g.strokeStyle = dk; g.lineWidth = 2; g.strokeRect(80, 30, 22, 20);
        }
        // kareli desen
        g.strokeStyle = `rgba(0,0,0,0.12)`; g.lineWidth = 2;
        for (let i = 0; i < S; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(S, i); g.stroke(); }
        break;
      case 'puffer':
        for (let y = 8; y < S; y += 20) { const gr = g.createLinearGradient(0, y - 8, 0, y + 10); gr.addColorStop(0, lt); gr.addColorStop(0.6, color); gr.addColorStop(1, dk); g.fillStyle = gr; g.fillRect(0, y - 8, S, 18); }
        if (!back) { g.fillStyle = '#c8c8c8'; g.fillRect(62, 0, 4, S); }
        break;
      case 'suit':
        if (!back) {
          g.fillStyle = '#f0f0f0'; g.beginPath(); g.moveTo(40, 0); g.lineTo(64, 70); g.lineTo(88, 0); g.fill();
          g.fillStyle = opts.tie || '#8b1d2c'; g.beginPath(); g.moveTo(60, 6); g.lineTo(68, 6); g.lineTo(71, 60); g.lineTo(64, 70); g.lineTo(57, 60); g.fill();
          g.fillStyle = dk; g.beginPath(); g.moveTo(34, 0); g.lineTo(58, 76); g.lineTo(50, 40); g.lineTo(40, 0); g.fill(); g.beginPath(); g.moveTo(94, 0); g.lineTo(70, 76); g.lineTo(78, 40); g.lineTo(88, 0); g.fill();
          g.fillStyle = '#222'; g.beginPath(); g.arc(64, 90, 3, 0, 7); g.arc(64, 108, 3, 0, 7); g.fill();
          g.strokeStyle = dk; g.lineWidth = 2; g.beginPath(); g.moveTo(80, 36); g.lineTo(100, 36); g.stroke();
        }
        break;
      case 'vest': // iş yeleği (reflektörlü)
        g.fillStyle = color; g.fillRect(0, 0, S, S);
        g.fillStyle = '#d8dde2'; g.fillRect(0, 70, S, 12); g.fillRect(0, 96, S, 12);
        if (!back) { g.fillRect(24, 0, 10, 70); g.fillRect(94, 0, 10, 70); g.fillStyle = dk; g.fillRect(62, 0, 4, S); }
        else { g.fillRect(24, 0, 10, 70); g.fillRect(94, 0, 10, 70); }
        break;
      case 'leather':
        g.fillStyle = shade(color, -0.1); g.fillRect(0, 0, S, S);
        for (let i = 0; i < 24; i++) { g.strokeStyle = `rgba(255,255,255,${rng.range(0.04, 0.1)})`; g.lineWidth = rng.range(1, 3); g.beginPath(); const x = rng.next() * S, y = rng.next() * S; g.moveTo(x, y); g.quadraticCurveTo(x + rng.range(-20, 20), y + rng.range(-8, 8), x + rng.range(-30, 30), y + rng.range(-4, 4)); g.stroke(); }
        if (!back) {
          g.fillStyle = '#9aa0a8'; g.fillRect(70, 0, 3, S);
          g.fillStyle = dk; g.beginPath(); g.moveTo(36, 0); g.lineTo(60, 36); g.lineTo(54, 0); g.fill(); g.beginPath(); g.moveTo(92, 0); g.lineTo(78, 36); g.lineTo(76, 0); g.fill();
          g.fillStyle = '#9aa0a8'; g.fillRect(24, 58, 18, 2); g.fillRect(88, 58, 18, 2);
        }
        break;
      case 'track':
        g.fillStyle = accent; g.fillRect(0, 0, 8, S); g.fillRect(S - 8, 0, 8, S);
        if (!back) { g.fillStyle = '#bbb'; g.fillRect(63, 0, 3, S); g.fillStyle = shade(color, 0.3); g.fillRect(50, 0, 28, 8); g.fillStyle = accent; g.font = `800 14px ${FONT}`; g.fillText('★', 86, 30); }
        break;
      case 'polo':
        if (!back) {
          g.fillStyle = shade(color, -0.2); g.beginPath(); g.moveTo(38, 0); g.lineTo(64, 14); g.lineTo(90, 0); g.lineTo(84, 0); g.lineTo(64, 8); g.lineTo(44, 0); g.fill();
          g.fillStyle = dk; g.fillRect(62, 10, 4, 30); g.fillStyle = '#eee'; for (let y = 16; y < 40; y += 10) { g.beginPath(); g.arc(64, y, 2, 0, 7); g.fill(); }
          g.fillStyle = accent; g.fillRect(84, 30, 10, 8);
        }
        g.fillStyle = dk; g.fillRect(0, 120, S, 8);
        break;
      case 'police':
        g.fillStyle = color; g.fillRect(0, 0, S, S);
        if (!back) {
          g.fillStyle = shade(color, 0.2); g.beginPath(); g.moveTo(38, 0); g.lineTo(64, 18); g.lineTo(90, 0); g.fill();
          g.fillStyle = '#0e1116'; g.fillRect(63, 16, 2, 112);
          g.fillStyle = '#d4af37'; g.fillRect(30, 30, 14, 18);
        }
        break;
      case 'tvest': // taktik polis yeleği
        g.fillStyle = '#16181c'; g.fillRect(0, 0, S, S);
        for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(255,255,255,${rng.range(0.01, 0.04)})`; g.fillRect(rng.next() * S, rng.next() * S, 2, 2); }
        g.strokeStyle = '#2a2e35'; g.lineWidth = 2;
        for (let y = 8; y < S; y += 10) { g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke(); }
        g.fillStyle = '#eef3ff'; g.font = `900 ${back ? 30 : 22}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('POLİS', 64, back ? 40 : 30);
        if (back) { g.font = `700 12px ${FONT}`; g.fillText('ÇEVİK KUVVET', 64, 66); }
        break;
      default: // tişört
        if (!back) {
          g.strokeStyle = dk; g.lineWidth = 4; g.beginPath(); g.arc(64, -6, 26, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
          if (rng.chance(0.6)) {
            g.fillStyle = accent; g.font = `900 22px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
            g.fillText(rng.pick(['34', 'İST', 'NY', '★', 'GO', '1923', 'ATK', 'RAP']), 64, 62);
          }
        }
    }
    return tex(c, { repeat: false });
  });
}

export function pantsTexture(type, color) {
  return cached(`pants${type}${color}`, () => {
    const S = 64, c = canvas(S, S), g = c.getContext('2d'), rng = new RNG(type.length + 5);
    g.fillStyle = color; g.fillRect(0, 0, S, S);
    if (type === 'jeans') {
      for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${rng.chance(0.5) ? '255,255,255' : '0,0,30'},${rng.range(0.04, 0.12)})`; g.fillRect(rng.next() * S, rng.next() * S, 1, rng.range(1, 3)); }
      g.strokeStyle = '#c98b3a'; g.lineWidth = 1; g.setLineDash([2, 2]); g.beginPath(); g.moveTo(4, 0); g.lineTo(4, S); g.stroke(); g.setLineDash([]);
      const gr = g.createLinearGradient(0, 10, 0, 40); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, S, S);
    } else if (type === 'track') {
      g.fillStyle = '#e8e8e8'; g.fillRect(S - 6, 0, 3, S); g.fillRect(S - 11, 0, 3, S);
    } else if (type === 'cargo') {
      g.strokeStyle = shade(color, -0.35); g.lineWidth = 2; g.strokeRect(10, 26, 30, 16); g.fillStyle = shade(color, -0.2); g.fillRect(10, 26, 30, 5);
    } else {
      g.fillStyle = shade(color, -0.15); g.fillRect(S / 2 - 1, 0, 2, S);
    }
    return tex(c, { repeat: false });
  });
}

// Raf ürünleri (market, bakkal): renkli kutu/şişe sıraları
export function shelfGoods(kind = 'market', seed = 1) {
  seed = ((seed % 16) + 16) % 16;
  return cached('goods' + kind + seed, () => {
    const rng = new RNG(seed), W = 512, H = 512, c = canvas(W, H), g = c.getContext('2d');
    g.fillStyle = '#20232a'; g.fillRect(0, 0, W, H);
    const rows = 4, rh = H / rows;
    const cols = kind === 'pharmacy' ? ['#ffffff', '#e9f3ff', '#3aa0d8', '#e84d4d', '#5bbf6a', '#f2f2f2'] : kind === 'tobacco' ? ['#c8102e', '#ffffff', '#1d3c8f', '#d4af37', '#2c2c2c', '#f2c14e'] : kind === 'stationery' ? ['#ff5a5f', '#ffd23f', '#3bceac', '#0ead69', '#540d6e', '#ee4266', '#2d7dd2'] : ['#e63946', '#f1c40f', '#2ecc71', '#3498db', '#e67e22', '#9b59b6', '#ecf0f1', '#c0392b', '#16a085', '#f39c12'];
    for (let r = 0; r < rows; r++) {
      let x = 4; const base = r * rh + rh - 10;
      g.fillStyle = '#c9ccd1'; g.fillRect(0, base, W, 10);
      g.fillStyle = '#f5d742'; g.fillRect(0, base + 1, W, 4);
      while (x < W - 10) {
        const t = rng.next(), col = rng.pick(cols);
        if (t < 0.45) { // kutu
          const w = rng.range(26, 52), h = rng.range(50, rh - 22);
          g.fillStyle = col; g.fillRect(x, base - h, w, h);
          g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(x + 4, base - h * 0.62, w - 8, h * 0.22);
          g.fillStyle = shade(col, -0.4); g.fillRect(x + 6, base - h * 0.56, (w - 12) * rng.range(0.4, 0.9), 3);
          g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + w - 4, base - h, 4, h);
          x += w + 2;
        } else if (t < 0.8) { // şişe
          const w = rng.range(14, 22), h = rng.range(56, rh - 24);
          g.fillStyle = col; g.beginPath(); g.moveTo(x, base); g.lineTo(x, base - h * 0.7); g.quadraticCurveTo(x, base - h * 0.85, x + w * 0.35, base - h * 0.88); g.lineTo(x + w * 0.35, base - h); g.lineTo(x + w * 0.65, base - h); g.lineTo(x + w * 0.65, base - h * 0.88); g.quadraticCurveTo(x + w, base - h * 0.85, x + w, base - h * 0.7); g.lineTo(x + w, base); g.fill();
          g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(x + 1, base - h * 0.5, w - 2, h * 0.2);
          g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + 2, base - h * 0.8, 3, h * 0.7);
          x += w + 3;
        } else { // poşet/paket
          const w = rng.range(30, 46), h = rng.range(36, 60);
          g.fillStyle = col; g.beginPath(); g.moveTo(x, base); g.lineTo(x + 3, base - h); g.lineTo(x + w - 3, base - h); g.lineTo(x + w, base); g.fill();
          g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.arc(x + w / 2, base - h / 2, w * 0.22, 0, 7); g.fill();
          x += w + 2;
        }
      }
    }
    return tex(c, { repeat: false });
  });
}

export function books(seed = 1) {
  seed = ((seed % 10) + 10) % 10;
  return cached('books' + seed, () => {
    const rng = new RNG(seed), W = 256, H = 256, c = canvas(W, H), g = c.getContext('2d');
    g.fillStyle = '#3b2a1e'; g.fillRect(0, 0, W, H);
    const rows = 4, rh = H / rows;
    for (let r = 0; r < rows; r++) {
      let x = 2; const base = r * rh + rh - 6;
      g.fillStyle = '#5a3f2a'; g.fillRect(0, base, W, 6);
      while (x < W - 6) {
        const w = rng.range(6, 16), h = rng.range(rh * 0.55, rh - 10);
        const col = rng.pick(['#8b1e2d', '#1f3b73', '#2e6b3a', '#c49a2c', '#5b2c6f', '#d35400', '#1b1b1b', '#e8e0c8', '#2c7a7b', '#a33']);
        if (rng.chance(0.08)) { g.fillStyle = col; g.save(); g.translate(x, base); g.rotate(-0.3); g.fillRect(0, -h, w, h); g.restore(); x += w + 8; continue; }
        g.fillStyle = col; g.fillRect(x, base - h, w, h);
        g.fillStyle = 'rgba(255,215,120,0.7)'; g.fillRect(x + 1, base - h + 6, w - 2, 2); g.fillRect(x + 1, base - 10, w - 2, 2);
        x += w + 1;
      }
    }
    return tex(c, { repeat: false });
  });
}

export function painting(seed = 1) {
  seed = ((seed % 16) + 16) % 16;
  return cached('paint' + seed, () => {
    const rng = new RNG(seed * 13), W = 128, H = 96, c = canvas(W, H), g = c.getContext('2d');
    const kind = rng.int(0, 2);
    if (kind === 0) { // manzara
      const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, rng.pick(['#f6a96b', '#86b8e8', '#e3779a'])); gr.addColorStop(1, '#fbe3c4'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      g.fillStyle = rng.pick(['#3d6b4f', '#5a4a6b', '#2f4f6f']); g.beginPath(); g.moveTo(0, H); for (let x = 0; x <= W; x += 16) g.lineTo(x, H * 0.55 + rng.range(-18, 12)); g.lineTo(W, H); g.fill();
      g.fillStyle = '#fff6d0'; g.beginPath(); g.arc(rng.range(20, 100), 24, 10, 0, 7); g.fill();
    } else if (kind === 1) { // soyut
      g.fillStyle = rng.pick(['#f4efe6', '#1d1d24', '#e9dfc8']); g.fillRect(0, 0, W, H);
      for (let i = 0; i < 7; i++) { g.fillStyle = rng.pick(['#e63946', '#1d3557', '#f1c40f', '#2a9d8f', '#e76f51', '#264653']); g.globalAlpha = 0.85; if (rng.chance(0.5)) g.fillRect(rng.next() * W, rng.next() * H, rng.range(10, 60), rng.range(10, 50)); else { g.beginPath(); g.arc(rng.next() * W, rng.next() * H, rng.range(6, 26), 0, 7); g.fill(); } }
      g.globalAlpha = 1;
    } else { // çini
      g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 6; i++) { g.strokeStyle = rng.pick(['#1f4e9c', '#2a9d8f', '#c0392b']); g.lineWidth = 3; g.beginPath(); g.arc(64, 48, 8 + i * 7, 0, 7); g.stroke(); }
      g.fillStyle = '#c0392b'; for (let k = 0; k < 8; k++) { const a = k / 8 * 6.28; g.beginPath(); g.ellipse(64 + Math.cos(a) * 22, 48 + Math.sin(a) * 22, 6, 3, a, 0, 7); g.fill(); }
    }
    return tex(c, { repeat: false });
  });
}

export function screen(kind = 'tv', seed = 1) {
  seed = ((seed % 8) + 8) % 8;
  return cached('screen' + kind + seed, () => {
    const rng = new RNG(seed), W = 256, H = 144, c = canvas(W, H), g = c.getContext('2d');
    if (kind === 'tv') {
      const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#1d4e89'); gr.addColorStop(1, '#0b1b33'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      g.fillStyle = '#c9e4ff'; g.fillRect(20, 20, 90, 70); g.fillStyle = '#e8b04a'; g.beginPath(); g.arc(65, 50, 18, 0, 7); g.fill();
      g.fillStyle = '#d01c1c'; g.fillRect(0, H - 34, W, 22); g.fillStyle = '#fff'; g.font = `800 13px ${FONT}`; g.fillText('SON DAKİKA  •  HAVA DURUMU: YAĞMURLU 12°C', 6, H - 19);
      g.fillStyle = '#fff'; g.font = `700 16px ${FONT}`; g.fillText('HABER 24', 140, 40);
    } else if (kind === 'pc') {
      g.fillStyle = '#0d1117'; g.fillRect(0, 0, W, H);
      g.fillStyle = rng.pick(['#1f6feb', '#8957e5', '#2ea043', '#f85149']); g.fillRect(0, 0, W, 16);
      for (let i = 0; i < 9; i++) { g.fillStyle = `rgba(200,220,255,${rng.range(0.3, 0.8)})`; g.fillRect(12, 26 + i * 12, rng.range(40, 220), 5); }
    } else if (kind === 'game') {
      g.fillStyle = '#2b1b3d'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#5cdb5c'; g.fillRect(0, H * 0.65, W, H); for (let i = 0; i < 6; i++) { g.fillStyle = rng.pick(['#ff4d6d', '#ffd166', '#06d6a0', '#118ab2']); g.fillRect(rng.next() * W, H * 0.3 + rng.next() * 40, 18, 18); }
      g.fillStyle = '#fff'; g.font = `800 14px ${FONT}`; g.fillText('SKOR 12840', 8, 18);
    } else if (kind === 'atm') {
      g.fillStyle = '#0b3d6e'; g.fillRect(0, 0, W, H); g.fillStyle = '#fff'; g.font = `800 20px ${FONT}`; g.textAlign = 'center'; g.fillText('HOŞ GELDİNİZ', W / 2, 50); g.font = `500 13px ${FONT}`; g.fillText('Lütfen kartınızı takınız', W / 2, 80); g.fillStyle = '#2bb3ff'; g.fillRect(W / 2 - 50, 100, 100, 20);
    } else if (kind === 'ad') {
      const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, rng.pick(['#ff7a59', '#5f6cff', '#16c79a'])); gr.addColorStop(1, '#101020'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      g.fillStyle = '#fff'; g.font = `900 28px ${FONT}`; g.textAlign = 'center'; g.fillText(rng.pick(['YENİ SEZON', 'KAMPANYA', '%50 İNDİRİM', 'KONSER']), W / 2, 70); g.font = `500 13px ${FONT}`; g.fillText('Bu hafta sonu kaçırma', W / 2, 98);
    }
    return tex(c, { repeat: false });
  });
}

export function graffiti(seed = 1) {
  seed = ((seed % 12) + 12) % 12;
  return cached('graf' + seed, () => {
    const rng = new RNG(seed * 9), W = 256, H = 128, c = canvas(W, H), g = c.getContext('2d');
    g.clearRect(0, 0, W, H);
    const word = rng.pick(['SOKAK', 'MAHALLE', 'BOOM', 'ÇAKAL', 'REİS', 'SİYAH', 'KRAL', 'LOS', 'NOX', 'İSYAN']);
    g.font = `900 italic 58px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 12; g.strokeStyle = rng.pick(['#111', '#2b1055', '#0b3d2e']); g.strokeText(word, W / 2, H / 2);
    const gr = g.createLinearGradient(0, 30, 0, 100); gr.addColorStop(0, rng.pick(['#ff3cac', '#f9c80e', '#2de2e6', '#ff6b35'])); gr.addColorStop(1, rng.pick(['#784ba0', '#ea3546', '#3a86ff', '#43aa8b'])); g.fillStyle = gr; g.fillText(word, W / 2, H / 2);
    for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(rng.range(30, 220), rng.range(80, 100), 2, rng.range(6, 24)); }
    return tex(c, { repeat: false });
  });
}

export function blob(seed = 1) {
  return cached('blob' + seed, () => {
    const rng = new RNG(seed), S = 128, c = canvas(S, S), g = c.getContext('2d');
    g.clearRect(0, 0, S, S);
    for (let i = 0; i < 6; i++) { const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1); }
    g.fillStyle = '#fff';
    for (let i = 0; i < 7; i++) { g.beginPath(); g.ellipse(64 + rng.range(-22, 22), 64 + rng.range(-14, 14), rng.range(16, 38), rng.range(10, 24), rng.next() * 3, 0, 7); g.fill(); }
    const t = tex(c, { srgb: false, repeat: false });
    return t;
  });
}

export function radial(color = '#ffffff') {
  return cached('radial' + color, () => {
    const S = 128, c = canvas(S, S), g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, color); gr.addColorStop(0.25, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    return tex(c, { repeat: false });
  });
}

export function sky() {
  return cached('sky', () => {
    const W = 1024, H = 512, rng = new RNG(99), c = canvas(W, H), g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#04060c'); gr.addColorStop(0.42, '#0b1224'); gr.addColorStop(0.5, '#1a2238'); gr.addColorStop(0.52, '#151b2b'); gr.addColorStop(1, '#07090f');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(255,255,255,${rng.range(0.15, 0.9)})`; g.fillRect(rng.next() * W, rng.next() * H * 0.45, rng.chance(0.05) ? 2 : 1, 1); }
    for (let i = 0; i < 14; i++) { const x = rng.next() * W, y = rng.range(60, 200), r = rng.range(60, 180); const cg = g.createRadialGradient(x, y, 0, x, y, r); cg.addColorStop(0, 'rgba(60,70,100,0.18)'); cg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = cg; g.fillRect(x - r, y - r, r * 2, r * 2); }
    // şehir ışıkları ufuk parıltısı
    const hg = g.createLinearGradient(0, H * 0.4, 0, H * 0.52); hg.addColorStop(0, 'rgba(255,140,70,0)'); hg.addColorStop(1, 'rgba(255,140,70,0.18)'); g.fillStyle = hg; g.fillRect(0, H * 0.4, W, H * 0.12);
    const t = tex(c, { repeat: false }); t.mapping = THREE.EquirectangularReflectionMapping;
    return t;
  });
}

export function fence() {
  return cached('fence', () => {
    const c = canvas(128, 128), g = c.getContext('2d');
    g.clearRect(0, 0, 128, 128); g.strokeStyle = '#9aa3ab'; g.lineWidth = 3;
    for (let i = -128; i < 256; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke(); g.beginPath(); g.moveTo(i + 128, 0); g.lineTo(i, 128); g.stroke(); }
    return tex(c, { srgb: true });
  });
}

export function idCard(info) {
  // UI için veri URL'si döndürür (kimlik kartı)
  const c = canvas(420, 260), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 420, 260); gr.addColorStop(0, info.fake ? '#e9d7d7' : '#e6eef7'); gr.addColorStop(1, info.fake ? '#d9b6b6' : '#c5d6ea'); g.fillStyle = gr; g.fillRect(0, 0, 420, 260);
  g.fillStyle = '#c8102e'; g.fillRect(0, 0, 420, 44);
  g.fillStyle = '#fff'; g.font = `800 16px ${FONT}`; g.fillText(info.title || 'TÜRKİYE CUMHURİYETİ KİMLİK KARTI', 16, 28);
  g.fillStyle = '#9aa7b8'; g.fillRect(18, 62, 110, 140);
  g.fillStyle = info.skin || '#d1a07a'; g.fillRect(40, 84, 66, 66); g.fillStyle = info.hair || '#222'; g.fillRect(40, 80, 66, 16);
  g.fillStyle = '#111'; g.fillRect(54, 108, 8, 10); g.fillRect(84, 108, 8, 10); g.fillRect(60, 132, 26, 4);
  g.fillStyle = info.top || '#345'; g.fillRect(28, 158, 90, 44);
  g.fillStyle = '#1b2533';
  const rows = [['T.C. Kimlik No', info.tc], ['Soyadı / Surname', info.surname.toLocaleUpperCase('tr-TR')], ['Adı / Name', info.name.toLocaleUpperCase('tr-TR')], ['Doğum Tarihi', info.birth], ['Seri No', info.serial]];
  rows.forEach((r, i) => { g.font = `500 11px ${FONT}`; g.fillStyle = '#4a5a70'; g.fillText(r[0], 146, 70 + i * 36); g.font = `700 16px ${FONT}`; g.fillStyle = '#121a26'; g.fillText(r[1], 146, 88 + i * 36); });
  if (info.fake) { g.save(); g.translate(300, 200); g.rotate(-0.25); g.strokeStyle = 'rgba(160,0,0,0.35)'; g.lineWidth = 3; g.strokeRect(-70, -18, 140, 36); g.fillStyle = 'rgba(160,0,0,0.35)'; g.font = `800 14px ${FONT}`; g.fillText('HOLOGRAM YOK', -58, 6); g.restore(); }
  else { const hg = g.createLinearGradient(330, 190, 400, 250); hg.addColorStop(0, 'rgba(255,0,255,0.25)'); hg.addColorStop(0.5, 'rgba(0,255,200,0.25)'); hg.addColorStop(1, 'rgba(255,255,0,0.25)'); g.fillStyle = hg; g.beginPath(); g.arc(370, 220, 26, 0, 7); g.fill(); }
  return c.toDataURL();
}

export function mdtScreen(lines, title = 'MOBİL VERİ TERMİNALİ') {
  const W = 512, H = 320, c = canvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#06121f'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#0d3b66'; g.fillRect(0, 0, W, 34);
  g.fillStyle = '#9fd3ff'; g.font = `800 16px ${FONT}`; g.fillText(title, 12, 23);
  g.fillStyle = '#ff4757'; g.fillRect(W - 120, 8, 108, 18); g.fillStyle = '#fff'; g.font = `800 12px ${FONT}`; g.fillText('ACİL İHBAR', W - 104, 21);
  g.font = `600 17px ${FONT}`;
  let y = 64;
  for (const ln of lines) {
    g.fillStyle = ln.c || '#d8ecff';
    const words = ln.t.split(' '); let line = '';
    for (const w of words) { const test = line + w + ' '; if (g.measureText(test).width > W - 28) { g.fillText(line, 14, y); y += 22; line = w + ' '; } else line = test; }
    g.fillText(line, 14, y); y += 28;
    if (y > H - 10) break;
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
