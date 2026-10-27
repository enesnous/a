// Genel yardımcılar: rastgelelik, matematik, küçük veri yapıları.
export class RNG {
  constructor(seed = Date.now()) { this.s = (seed >>> 0) || 1; }
  next() {
    let t = (this.s += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p) { return this.next() < p; }
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  weighted(entries) { // [[item, weight], ...]
    let total = 0; for (const e of entries) total += e[1];
    let r = this.next() * total;
    for (const e of entries) { r -= e[1]; if (r <= 0) return e[0]; }
    return entries[entries.length - 1][0];
  }
}

export const rng = new RNG(Date.now());
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export function angleDiff(a, b) { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }
export function dampAngle(a, b, lambda, dt) { return a + angleDiff(a, b) * (1 - Math.exp(-lambda * dt)); }
export function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); }
export function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// Işın / AABB kesişimi (slab). Döner: t mesafesi veya -1
export function rayAABB(ox, oy, oz, dx, dy, dz, b, maxT) {
  let tmin = 0, tmax = maxT;
  const o = [ox, oy, oz], d = [dx, dy, dz], mn = b.min, mx = b.max;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (o[i] < mn[i] || o[i] > mx[i]) return -1; }
    else {
      const inv = 1 / d[i];
      let t1 = (mn[i] - o[i]) * inv, t2 = (mx[i] - o[i]) * inv;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
  }
  return tmin;
}
// Işın / küre
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  if (d2 > r * r) return -1;
  const thc = Math.sqrt(r * r - d2);
  const t0 = tca - thc;
  return t0 >= 0 ? t0 : (tca + thc >= 0 ? 0 : -1);
}

export const TR_NAMES_M = ['Ahmet', 'Mehmet', 'Mustafa', 'Ali', 'Hüseyin', 'Hasan', 'İbrahim', 'Murat', 'Emre', 'Burak', 'Kerem', 'Serkan', 'Volkan', 'Okan', 'Cem', 'Tolga', 'Barış', 'Onur', 'Yusuf', 'Ömer', 'Kadir', 'Erkan', 'Selim', 'Tuncay', 'Gökhan', 'Sinan', 'Levent', 'Uğur', 'Halil', 'Recep', 'Engin', 'Bora'];
export const TR_NAMES_F = ['Ayşe', 'Fatma', 'Emine', 'Zeynep', 'Elif', 'Merve', 'Esra', 'Büşra', 'Selin', 'Derya', 'Gül', 'Hatice', 'Sevgi', 'Özlem', 'Burcu', 'Ebru', 'Nur', 'Pınar', 'Tuğba', 'Aslı', 'Melek', 'Sibel', 'Canan', 'Deniz'];
export const TR_SURNAMES = ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Yıldız', 'Yıldırım', 'Öztürk', 'Aydın', 'Özdemir', 'Arslan', 'Doğan', 'Kılıç', 'Aslan', 'Çetin', 'Kara', 'Koç', 'Kurt', 'Özkan', 'Şimşek', 'Polat', 'Korkmaz', 'Erdem', 'Güneş', 'Aksoy', 'Tekin', 'Bulut', 'Uçar', 'Turan', 'Avcı'];
