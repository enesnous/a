// Roblox tarzı bloklu, detaylı karakterler: görünüm üretimi, model, pozlar.
import * as THREE from 'three';
import { mat, boxGeo, rbox, cyl, sph, torus, plane, M, G, ownMat, mergeChildren } from './kit.js';
import * as TX from './textures.js';
import { RNG, damp, TR_NAMES_M, TR_NAMES_F, TR_SURNAMES } from './util.js';

export const HAIR = {
  'Kısa saç': { k: 'short', d: 'kısa saçlı' }, 'Dağınık saç': { k: 'messy', d: 'dağınık saçlı' }, 'Uzun saç': { k: 'long', d: 'uzun saçlı' },
  'Kel': { k: 'bald', d: 'kel' }, '3 numara kazıtılmış': { k: 'buzz', d: 'saçları 3 numara kazıtılmış' }, 'Kıvırcık saç': { k: 'curly', d: 'kıvırcık saçlı' },
  'Dalgalı saç': { k: 'wavy', d: 'dalgalı saçlı' }, 'At kuyruğu': { k: 'pony', d: 'saçlarını at kuyruğu yapmış' }, 'Bereli': { k: 'beanie', d: 'bereli' },
  'Kapüşonlu': { k: 'hood', d: 'kapüşonu başında' }, 'Şapkalı': { k: 'cap', d: 'şapkalı' },
};
export const HAIR_COLOR = { 'Siyah': '#17120f', 'Kahverengi': '#4a2f1f', 'Sarı': '#d6b15c', 'Kumral': '#8a6240', 'Kızıl': '#a3401f', 'Beyaz': '#e6e3dc', 'Kırlaşmış': '#77736d', 'Gri': '#9b9b9b', 'Uçları boyalı': '#2b1d16' };
export const SKIN = { 'Açık buğday': { c: '#e3b98f', d: 'açık buğday tenli' }, 'Esmer': { c: '#a8744c', d: 'esmer' }, 'Beyaz': { c: '#f1d6bf', d: 'beyaz tenli' }, 'Kumral': { c: '#cf9e76', d: 'kumral tenli' }, 'Koyu ten': { c: '#6a432e', d: 'koyu tenli' }, 'Bronz': { c: '#c08656', d: 'bronz tenli' } };
export const FACE = { 'Temiz tıraşlı': { k: 'none', d: 'temiz tıraşlı' }, 'Hafif kirli sakal': { k: 'stubble', d: 'hafif kirli sakallı' }, 'Kalın bıyık': { k: 'mustache', d: 'kalın bıyıklı' }, 'Uzun sakal': { k: 'long', d: 'uzun sakallı' }, 'Keçi sakal': { k: 'goatee', d: 'keçi sakallı' }, 'Gözlüklü': { k: 'glasses', d: 'gözlüklü' } };
export const TOPS = { 'Tişört': 'tshirt', 'Gömlek': 'shirt', 'Kapüşonlu sweatshirt': 'hoodie', 'Şişme mont': 'puffer', 'Takım elbise ceketi': 'suit', 'İş yeleği': 'vest', 'Deri ceket': 'leather', 'Eşofman üstü': 'track', 'Polo yaka tişört': 'polo' };
export const BOTTOMS = { 'Kot pantolon': 'jeans', 'Kumaş pantolon': 'slacks', 'Eşofman altı': 'track', 'Kargo cepli pantolon': 'cargo' };
export const CLOTH = { 'Siyah': '#1f2024', 'Beyaz': '#e6e6e2', 'Gri': '#8a8d92', 'Antrasit': '#3b3e44', 'Lacivert': '#1f2a4f', 'Mavi': '#2e6cc0', 'Haki yeşil': '#5c6a39', 'Bordo': '#6c1e2a', 'Kahverengi': '#6a4930', 'Kırmızı': '#bf262c', 'Bej': '#cbb690' };
const JEANS = { 'Mavi': '#3a5f93', 'Lacivert': '#22355e', 'Siyah': '#232428', 'Gri': '#6b7078', 'Antrasit': '#3b3e44', 'Bej': '#b8a787', 'Beyaz': '#d8dade' };

const TIPS = ['#ff4fa3', '#3fb6ff', '#b46bff', '#3fe08a', '#ffd23f'];

export function randomAppearance(rng, o = {}) {
  const gender = o.gender || (rng.chance(o.femaleChance ?? 0.3) ? 'f' : 'm');
  const hairKeys = Object.keys(HAIR).filter(k => gender === 'f' ? !['Kel', '3 numara kazıtılmış'].includes(k) : true);
  const hairWeights = hairKeys.map(k => [k, gender === 'f' ? (['Uzun saç', 'At kuyruğu', 'Dalgalı saç'].includes(k) ? 3 : 1) : (['Uzun saç', 'At kuyruğu'].includes(k) ? 0.35 : 1)]);
  const hair = o.hair || rng.weighted(hairWeights);
  const faceKeys = gender === 'f' ? ['Temiz tıraşlı', 'Gözlüklü'] : Object.keys(FACE);
  const face = o.face || (gender === 'f' ? rng.weighted([['Temiz tıraşlı', 4], ['Gözlüklü', 1]]) : rng.pick(faceKeys));
  const top = o.top || (hair === 'Kapüşonlu' ? 'Kapüşonlu sweatshirt' : rng.pick(Object.keys(TOPS)));
  const bottom = o.bottom || rng.weighted([['Kot pantolon', 3], ['Kumaş pantolon', 2], ['Eşofman altı', 2], ['Kargo cepli pantolon', 1.2]]);
  const age = o.age || rng.int(18, 68);
  let hairColor = o.hairColor || rng.weighted([['Siyah', 4], ['Kahverengi', 3], ['Sarı', 1], ['Kumral', 2], ['Kızıl', 0.6], ['Beyaz', age > 55 ? 2 : 0.1], ['Kırlaşmış', age > 45 ? 2 : 0.2], ['Gri', age > 50 ? 1.5 : 0.1], ['Uçları boyalı', age < 35 ? 0.8 : 0.05]]);
  return {
    gender, age,
    name: o.name || rng.pick(gender === 'f' ? TR_NAMES_F : TR_NAMES_M), surname: o.surname || rng.pick(TR_SURNAMES),
    hair, hairColor, tip: rng.pick(TIPS),
    skin: o.skin || rng.weighted([['Açık buğday', 3], ['Esmer', 2], ['Beyaz', 2], ['Kumral', 2], ['Koyu ten', 0.7], ['Bronz', 1.2]]),
    face, extraGlasses: face !== 'Gözlüklü' && rng.chance(0.12),
    top, topColor: o.topColor || rng.pick(Object.keys(CLOTH)),
    bottom, bottomColor: o.bottomColor || (bottom === 'Kot pantolon' ? rng.pick(Object.keys(JEANS)) : rng.pick(Object.keys(CLOTH))),
    accent: rng.pick(['#ffffff', '#f5c518', '#e63946', '#4cc9f0', '#90be6d']),
    shoe: rng.pick(['#1b1b1b', '#e8e8e8', '#5a3b22', '#2a2f45', '#8a1d1d']),
    police: !!o.police, seed: rng.int(1, 99999),
  };
}

export function describe(a, short = false) {
  const hidden = ['Kel', 'Bereli', 'Kapüşonlu', 'Şapkalı'].includes(a.hair);
  const parts = [];
  parts.push(HAIR[a.hair].d);
  if (!hidden) parts.push(a.hairColor === 'Uçları boyalı' ? 'saçlarının uçları boyalı' : `${a.hairColor.toLocaleLowerCase('tr-TR')} saçlı`);
  if (!short) parts.push(SKIN[a.skin].d);
  parts.push(FACE[a.face].d);
  const top = `${a.topColor.toLocaleLowerCase('tr-TR')} ${a.top.toLocaleLowerCase('tr-TR')}`;
  const bottom = `${a.bottomColor.toLocaleLowerCase('tr-TR')} ${a.bottom.toLocaleLowerCase('tr-TR')}`;
  return `${parts.join(', ')}; üzerinde ${top}, altında ${bottom} var`;
}
export function shortDesc(a) { return `${a.topColor.toLocaleLowerCase('tr-TR')} ${a.top.toLocaleLowerCase('tr-TR')}, ${HAIR[a.hair].d}`; }

// ---------------------------------------------------------------
const POSES = {};
function P(o) { return Object.assign({ hlx: 0, hrx: 0, hlz: 0, hrz: 0, slx: 0, srx: 0, slz: 0, srz: 0, sly: 0, sry: 0, nx: 0, ny: 0, by: 0, brx: 0, bry: 0 }, o); }
POSES.idle = P({});
POSES.handsUp = P({ slx: -2.95, srx: -2.95, slz: 0.25, srz: -0.25 });
POSES.cuffed = P({ slx: 0.5, srx: 0.5, slz: -0.32, srz: 0.32, nx: 0.15 });
POSES.kneel = P({ by: -0.46, hlx: 1.35, hrx: 1.35, slx: -2.95, srx: -2.95, slz: 0.25, srz: -0.25 });
POSES.kneelCuffed = P({ by: -0.46, hlx: 1.35, hrx: 1.35, slx: 0.5, srx: 0.5, slz: -0.32, srz: 0.32, nx: 0.25 });
POSES.lying = P({ by: 0.2, brx: Math.PI / 2, slx: -2.9, srx: -2.9, slz: 0.4, srz: -0.4 });
POSES.lyingCuffed = P({ by: 0.2, brx: Math.PI / 2, slx: 0.5, srx: 0.5, slz: -0.3, srz: 0.3 });
POSES.lyingUp = P({ by: 0.2, brx: -Math.PI / 2, slz: 0.5, srz: -0.5, hlz: 0.15, hrz: -0.15 });
POSES.injured = P({ by: 0.2, brx: -Math.PI / 2, slx: -0.9, srx: -0.3, slz: 0.2, srz: -0.6, hlx: -0.3, nx: -0.2 });
POSES.sit = P({ by: -0.27, hlx: -1.5, hrx: -1.5, slx: -0.5, srx: -0.5 });
POSES.sitGround = P({ by: -0.7, hlx: -1.5, hrx: -1.5, slx: -0.6, srx: -0.6, slz: -0.2, srz: 0.2 });
POSES.cower = P({ by: -0.12, hlx: -0.4, hrx: -0.4, slx: -2.6, srx: -2.6, slz: -0.55, srz: 0.55, nx: 0.45 });
POSES.hostageTaker = P({ slx: -1.35, slz: -0.85, srx: -2.35, srz: 0.55, nx: 0.1 });
POSES.hostage = P({ slx: -0.6, srx: -0.6, slz: 0.25, srz: -0.25, nx: -0.1 });
POSES.aim = P({ slx: -1.57, srx: -1.57, slz: -0.42, srz: 0.08 });
POSES.aim1 = P({ srx: -1.57, srz: 0.05, slx: 0.1 });
POSES.holdLow = P({ srx: -0.75, srz: 0.05, slx: -0.3, slz: -0.25 });
POSES.holdItem = P({ srx: -0.55 });
POSES.fight = P({ slx: -1.25, srx: -1.25, slz: -0.4, srz: 0.4 });
POSES.phone = P({ srx: -2.4, srz: 0.55, ny: 0.2 });
POSES.edge = P({ slx: 0.1, srx: 0.1, slz: 0.7, srz: -0.7, nx: 0.35 });
POSES.wave = P({ srx: -2.8, srz: -0.4 });
POSES.dead = P({ by: 0.2, brx: -Math.PI / 2, slz: 1.1, srz: -1.1, hlz: 0.2, hrz: -0.2, ny: 0.5 });
POSES.radio = P({ slx: -2.2, slz: -0.7, nx: 0.2, ny: 0.3 });
POSES.aid = P({ by: -0.46, hlx: 1.35, hrx: 1.35, slx: -1.15, srx: -1.15, slz: -0.25, srz: 0.25, nx: 0.55 });
POSES.kick = P({ hrx: -1.5, slx: -0.6, srx: 0.4, brx: -0.12 });
POSES.shout = P({ slx: -2.0, slz: -0.6, srx: -0.75, nx: -0.1 });

export class Character {
  constructor(app) {
    this.app = app;
    this.root = new THREE.Group();
    this.body = G(this.root);
    this.pose = 'idle';
    this.walkPhase = 0; this.t = Math.random() * 10;
    this.cur = P({}); this.expr = 'neutral';
    this.pitch = 0; this.speed = 0; this.shake = 0;
    this.build();
  }
  build() {
    const a = this.app;
    const skinC = a.police ? SKIN[a.skin].c : SKIN[a.skin].c;
    const skin = mat(skinC, { r: 0.62 });
    const topType = a.police ? 'police' : TOPS[a.top];
    const topC = a.police ? '#1b2640' : CLOTH[a.topColor];
    const botType = a.police ? 'slacks' : BOTTOMS[a.bottom];
    const botC = a.police ? '#161c2c' : (botType === 'jeans' ? (JEANS[a.bottomColor] || '#3a5f93') : CLOTH[a.bottomColor]);
    const topR = topType === 'leather' ? 0.38 : topType === 'puffer' ? 0.55 : 0.85;
    const topSide = mat(topC, { r: topR, m: topType === 'leather' ? 0.1 : 0 });
    const topFront = mat(0xffffff, { r: topR, map: TX.topTexture(topType, topC, { accent: a.accent }) });
    const topBack = mat(0xffffff, { r: topR, map: TX.topTexture(topType, topC, { back: true, accent: a.accent }) });
    const pantsM = mat(0xffffff, { r: 0.85, map: TX.pantsTexture(botType, botC) });
    const pantsSide = mat(botC, { r: 0.85 });
    const shoeM = mat(a.police ? '#0c0c0e' : a.shoe, { r: 0.5 });
    const hairM = mat(HAIR_COLOR[a.hairColor], { r: 0.7 });
    this.parts = {};
    // Bacaklar
    const mkLeg = (side) => {
      const hip = G(this.body, side * 0.165, 0.72, 0);
      const legGeo = boxGeo(0.31, 0.64, 0.34);
      const leg = new THREE.Mesh(legGeo, [pantsSide, pantsSide, pantsSide, pantsSide, pantsM, pantsSide]);
      leg.position.y = -0.3; leg.castShadow = true; hip.add(leg);
      M(rbox(0.33, 0.12, 0.42, 0.04), shoeM, 0, -0.66, 0.04, 0, 0, 0, hip);
      M(boxGeo(0.335, 0.03, 0.43), mat(a.police ? '#2a2a2a' : '#e8e8e8', { r: 0.6 }), 0, -0.71, 0.04, 0, 0, 0, hip);
      if (botType === 'cargo') M(boxGeo(0.06, 0.16, 0.2), mat(botC, { r: 0.9 }), side * 0.17, -0.25, 0, 0, 0, 0, hip);
      if (a.police) { M(rbox(0.26, 0.16, 0.08, 0.03), mat('#111', { r: 0.5 }), 0, -0.36, 0.18, 0, 0, 0, hip); M(boxGeo(0.07, 0.18, 0.2), mat('#111318', { r: 0.8 }), side * 0.18, -0.12, 0, 0, 0, 0, hip); }
      return hip;
    };
    this.hipL = mkLeg(1); this.hipR = mkLeg(-1);
    // Gövde
    const torso = new THREE.Mesh(boxGeo(0.72, 0.72, 0.38), [topSide, topSide, topSide, topSide, topFront, topBack]);
    torso.position.y = 1.08; torso.castShadow = true; this.body.add(torso); this.torso = torso;
    M(boxGeo(0.74, 0.07, 0.4), mat(a.police ? '#0c0d10' : '#2a1d14', { r: 0.5 }), 0, 0.76, 0, 0, 0, 0, this.body);
    if (!a.police) M(boxGeo(0.08, 0.06, 0.02), mat('#b8b8b8', { m: 0.9, r: 0.3 }), 0, 0.76, 0.205, 0, 0, 0, this.body);
    if (topType === 'puffer') M(rbox(0.8, 0.74, 0.46, 0.08), mat(topC, { r: 0.45 }), 0, 1.09, 0, 0, 0, 0, this.body).material = topSide;
    if (topType === 'hoodie' && a.hair !== 'Kapüşonlu') M(rbox(0.6, 0.12, 0.2, 0.05), topSide, 0, 1.47, -0.16, 0.2, 0, 0, this.body);
    if (topType === 'vest') { /* altında tişört */ }
    // Kollar
    const longSleeve = !['tshirt', 'polo'].includes(topType);
    const sleeveC = topType === 'vest' ? '#5a5f66' : topC;
    const sleeveM = mat(sleeveC, { r: topR });
    const handM = a.police ? mat('#111214', { r: 0.6 }) : skin;
    const mkArm = (side) => {
      const sh = G(this.body, side * 0.51, 1.4, 0);
      if (longSleeve) {
        M(boxGeo(0.3, 0.58, 0.34), sleeveM, 0, -0.25, 0, 0, 0, 0, sh);
        M(boxGeo(0.31, 0.05, 0.35), mat(shadeHex(sleeveC, -0.3), { r: 0.8 }), 0, -0.53, 0, 0, 0, 0, sh);
      } else {
        M(boxGeo(0.31, 0.26, 0.35), sleeveM, 0, -0.09, 0, 0, 0, 0, sh);
        M(boxGeo(0.29, 0.34, 0.32), skin, 0, -0.39, 0, 0, 0, 0, sh);
      }
      M(rbox(0.29, 0.14, 0.32, 0.04), handM, 0, -0.62, 0, 0, 0, 0, sh);
      if (side === 1 && !a.police && a.seed % 3 === 0) M(boxGeo(0.31, 0.04, 0.33), mat('#c9a227', { m: 0.8, r: 0.3 }), 0, -0.53, 0, 0, 0, 0, sh);
      return sh;
    };
    this.shL = mkArm(1); this.shR = mkArm(-1);
    this.handR = G(this.shR, 0, -0.64, 0.02); this.handL = G(this.shL, 0, -0.64, 0.02);
    // Boyun / kafa
    this.neck = G(this.body, 0, 1.44, 0);
    M(cyl(0.1, 0.11, 0.08, 10), skin, 0, 0.03, 0, 0, 0, 0, this.neck);
    const head = M(rbox(0.48, 0.46, 0.46, 0.1, 3), skin, 0, 0.27, 0, 0, 0, 0, this.neck); this.head = head;
    this.faceMat = new THREE.MeshStandardMaterial({ transparent: true, alphaTest: 0.35, roughness: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const faceMesh = M(plane(0.44, 0.42), this.faceMat, 0, 0.26, 0.232, 0, 0, 0, this.neck, false);
    faceMesh.renderOrder = 2;
    this.setExpression('neutral', true);
    this.buildHair(hairM, topSide);
    this.buildFaceExtras(hairM);
    if (a.police) this.buildPolice();
    for (const g of [this.body, this.hipL, this.hipR, this.shL, this.shR, this.neck]) mergeChildren(g);
  }
  buildHair(hairM, hoodM) {
    const a = this.app, k = HAIR[a.hair].k, n = this.neck, top = 0.27 + 0.23;
    const tipM = a.hairColor === 'Uçları boyalı' ? mat(a.tip, { r: 0.6 }) : hairM;
    const cap = (h = 0.12, ext = 0.02) => M(rbox(0.5 + ext, h, 0.5 + ext, 0.05), hairM, 0, top - h / 2 + 0.04, -0.005, 0, 0, 0, n);
    const backP = (h = 0.26) => M(boxGeo(0.5, h, 0.08), hairM, 0, top - h / 2 - 0.02, -0.22, 0, 0, 0, n);
    const rng = new RNG(a.seed);
    switch (k) {
      case 'short': cap(0.12); backP(0.22); M(boxGeo(0.05, 0.12, 0.1), hairM, 0.245, 0.36, 0.1, 0, 0, 0, n); M(boxGeo(0.05, 0.12, 0.1), hairM, -0.245, 0.36, 0.1, 0, 0, 0, n); M(boxGeo(0.5, 0.05, 0.08), tipM, 0, top - 0.04, 0.21, 0.3, 0, 0, n); break;
      case 'messy': cap(0.1); backP(0.24); for (let i = 0; i < 9; i++) M(boxGeo(rng.range(0.1, 0.18), 0.08, rng.range(0.1, 0.18)), i % 2 ? tipM : hairM, rng.range(-0.18, 0.18), top + 0.03, rng.range(-0.18, 0.2), rng.range(-0.5, 0.5), rng.range(0, 3), rng.range(-0.5, 0.5), n); break;
      case 'long': cap(0.12); M(boxGeo(0.54, 0.62, 0.1), hairM, 0, 0.2, -0.24, 0, 0, 0, n); M(boxGeo(0.07, 0.45, 0.32), hairM, 0.26, 0.24, -0.06, 0, 0, 0, n); M(boxGeo(0.07, 0.45, 0.32), hairM, -0.26, 0.24, -0.06, 0, 0, 0, n); M(boxGeo(0.5, 0.1, 0.06), tipM, 0, -0.06, -0.24, 0, 0, 0, n); M(boxGeo(0.48, 0.06, 0.06), hairM, 0, top - 0.05, 0.22, 0.4, 0, 0, n); break;
      case 'bald': M(sph(0.06, 8, 6), mat('#ffffff', { r: 0.1, t: true, op: 0.12 }), 0.08, top - 0.01, 0.05, 0, 0, 0, n, false); break;
      case 'buzz': M(rbox(0.495, 0.07, 0.495, 0.03), mat(HAIR_COLOR[a.hairColor], { r: 0.95 }), 0, top - 0.02, 0, 0, 0, 0, n); M(boxGeo(0.49, 0.16, 0.04), mat(HAIR_COLOR[a.hairColor], { r: 0.95 }), 0, top - 0.1, -0.23, 0, 0, 0, n); break;
      case 'curly': for (let i = 0; i < 16; i++) { const ang = i / 16 * Math.PI * 2; const r = i < 10 ? 0.2 : 0.08; M(sph(0.1, 8, 6), i % 3 === 0 ? tipM : hairM, Math.cos(ang) * r, top + (i < 10 ? -0.02 : 0.06), Math.sin(ang) * r - 0.02, 0, 0, 0, n); } backP(0.2); break;
      case 'wavy': cap(0.12); M(boxGeo(0.54, 0.4, 0.1), hairM, 0, 0.3, -0.24, 0, 0, 0, n); for (let i = 0; i < 4; i++) M(boxGeo(0.14, 0.08, 0.5), i % 2 ? tipM : hairM, -0.18 + i * 0.12, top + 0.02, 0, 0, 0, 0.3 * (i % 2 ? 1 : -1), n); M(boxGeo(0.06, 0.3, 0.26), hairM, 0.26, 0.3, -0.04, 0, 0, 0, n); M(boxGeo(0.06, 0.3, 0.26), hairM, -0.26, 0.3, -0.04, 0, 0, 0, n); break;
      case 'pony': cap(0.12); backP(0.24); M(sph(0.06, 8, 6), mat('#c0262c', { r: 0.5 }), 0, 0.4, -0.27, 0, 0, 0, n); M(rbox(0.12, 0.38, 0.12, 0.05), tipM, 0, 0.2, -0.32, 0.25, 0, 0, n); break;
      case 'beanie': {
        const bm = mat(CLOTH[a.topColor === 'Siyah' ? 'Bordo' : 'Siyah'], { r: 0.95 });
        M(rbox(0.53, 0.22, 0.53, 0.08), bm, 0, top - 0.04, 0, 0, 0, 0, n); M(boxGeo(0.545, 0.08, 0.545), bm, 0, top - 0.14, 0, 0, 0, 0, n); M(sph(0.06, 8, 6), bm, 0, top + 0.09, 0, 0, 0, 0, n); break;
      }
      case 'hood':
        M(boxGeo(0.6, 0.08, 0.58), hoodM, 0, top + 0.02, -0.02, 0, 0, 0, n); M(boxGeo(0.06, 0.52, 0.56), hoodM, 0.28, 0.25, -0.02, 0, 0, 0, n); M(boxGeo(0.06, 0.52, 0.56), hoodM, -0.28, 0.25, -0.02, 0, 0, 0, n); M(boxGeo(0.6, 0.56, 0.06), hoodM, 0, 0.25, -0.27, 0, 0, 0, n);
        M(boxGeo(0.6, 0.07, 0.07), mat(shadeHex(CLOTH[a.topColor], -0.35), { r: 0.9 }), 0, top - 0.02, 0.26, 0, 0, 0, n); break;
      case 'cap': {
        const cm = mat(['#c0262c', '#1f2a4f', '#111', '#e6e6e2', '#5c6a39'][a.seed % 5], { r: 0.8 });
        backP(0.18);
        M(rbox(0.52, 0.16, 0.52, 0.06), cm, 0, top + 0.01, 0, 0, 0, 0, n);
        const back = a.seed % 4 === 0;
        M(boxGeo(0.46, 0.025, 0.24), cm, 0, top - 0.06, back ? -0.33 : 0.33, back ? 0.12 : -0.12, 0, 0, n);
        M(boxGeo(0.14, 0.08, 0.01), mat('#ffffff', { r: 0.6 }), 0, top + 0.02, back ? -0.265 : 0.265, 0, 0, 0, n); break;
      }
    }
  }
  buildFaceExtras(hairM) {
    const a = this.app, k = FACE[a.face].k, n = this.neck;
    if (k === 'mustache') M(boxGeo(0.22, 0.05, 0.04), hairM, 0, 0.2, 0.24, 0, 0, 0, n);
    if (k === 'long') { M(rbox(0.42, 0.24, 0.12, 0.04), hairM, 0, 0.08, 0.2, 0, 0, 0, n); M(boxGeo(0.22, 0.05, 0.04), hairM, 0, 0.2, 0.245, 0, 0, 0, n); }
    if (k === 'goatee') { M(boxGeo(0.12, 0.1, 0.06), hairM, 0, 0.09, 0.23, 0, 0, 0, n); M(boxGeo(0.16, 0.035, 0.04), hairM, 0, 0.2, 0.24, 0, 0, 0, n); }
    if (k === 'glasses' || a.extraGlasses) {
      const fm = mat('#111', { r: 0.3, m: 0.5 });
      const lens = mat('#1e2a38', { r: 0.05, m: 0.3, t: true, op: 0.45 });
      for (const s of [-1, 1]) {
        M(boxGeo(0.15, 0.1, 0.02), lens, s * 0.11, 0.31, 0.245, 0, 0, 0, n, false);
        M(boxGeo(0.16, 0.02, 0.025), fm, s * 0.11, 0.365, 0.245, 0, 0, 0, n, false);
        M(boxGeo(0.16, 0.015, 0.025), fm, s * 0.11, 0.258, 0.245, 0, 0, 0, n, false);
        M(boxGeo(0.015, 0.1, 0.025), fm, s * 0.19, 0.31, 0.245, 0, 0, 0, n, false);
        M(boxGeo(0.02, 0.02, 0.24), fm, s * 0.24, 0.35, 0.13, 0, 0, 0, n, false);
      }
      M(boxGeo(0.06, 0.015, 0.025), fm, 0, 0.33, 0.245, 0, 0, 0, n, false);
    }
  }
  buildPolice() {
    const b = this.body, n = this.neck;
    const vestF = mat(0xffffff, { r: 0.85, map: TX.topTexture('tvest', '#16181c') });
    const vestB = mat(0xffffff, { r: 0.85, map: TX.topTexture('tvest', '#16181c', { back: true }) });
    const vs = mat('#16181c', { r: 0.85 });
    const vest = new THREE.Mesh(boxGeo(0.78, 0.6, 0.46), [vs, vs, vs, vs, vestF, vestB]); vest.position.y = 1.12; vest.castShadow = true; b.add(vest);
    const pouch = mat('#1d2026', { r: 0.9 });
    for (let i = -1; i <= 1; i++) { M(rbox(0.16, 0.16, 0.08, 0.02), pouch, i * 0.2, 0.92, 0.26, 0, 0, 0, b); M(boxGeo(0.16, 0.03, 0.085), mat('#262a31', { r: 0.9 }), i * 0.2, 0.99, 0.262, 0, 0, 0, b); }
    // rozet
    M(boxGeo(0.09, 0.11, 0.015), mat('#d9b23c', { m: 0.95, r: 0.25 }), 0.22, 1.33, 0.235, 0, 0, 0, b);
    M(sph(0.022, 8, 6), mat('#c8102e', { r: 0.4 }), 0.22, 1.33, 0.245, 0, 0, 0, b);
    // omuz telsizi + LED
    const radio = G(b, -0.24, 1.36, 0.24);
    M(rbox(0.09, 0.15, 0.06, 0.015), mat('#0b0b0c', { r: 0.4 }), 0, 0, 0, 0, 0, 0, radio);
    M(cyl(0.008, 0.008, 0.12, 6), mat('#0b0b0c', { r: 0.4 }), 0.03, 0.12, 0, 0, 0, 0, radio);
    this.radioLedM = ownMat('#00ff66', { e: '#00ff66', ei: 6 }); M(sph(0.011, 6, 4), this.radioLedM, -0.02, 0.06, 0.032, 0, 0, 0, radio, false);
    M(boxGeo(0.06, 0.02, 0.01), mat('#333', {}), 0, -0.03, 0.032, 0, 0, 0, radio, false);
    // omuz yamaları
    for (const s of [-1, 1]) {
      M(boxGeo(0.31, 0.06, 0.35), mat('#1b2640', { r: 0.85 }), 0, 0.03, 0, 0, 0, 0, s > 0 ? this.shL : this.shR);
      M(plane(0.18, 0.12), mat(0xffffff, { map: TX.sign('POLİS', { bg: '#1b2640', fg: '#e9eef8', w: 128, h: 80, glow: false }) }), s * 0.156, -0.1, 0, 0, s * Math.PI / 2, 0, s > 0 ? this.shL : this.shR, false);
    }
    // kemer: kılıf, kelepçe kabı, şok cihazı kılıfı
    M(boxGeo(0.8, 0.1, 0.44), mat('#0c0d10', { r: 0.5 }), 0, 0.77, 0, 0, 0, 0, b);
    M(boxGeo(0.07, 0.06, 0.02), mat('#9aa0a8', { m: 1, r: 0.3 }), 0, 0.77, 0.225, 0, 0, 0, b);
    this.holster = M(rbox(0.1, 0.26, 0.16, 0.02), mat('#101114', { r: 0.6 }), -0.44, 0.68, 0.02, 0, 0, 0, b);
    M(rbox(0.1, 0.12, 0.08, 0.02), mat('#101114', { r: 0.6 }), -0.3, 0.74, -0.2, 0, 0, 0, b);
    M(rbox(0.09, 0.2, 0.14, 0.02), mat('#f2c318', { r: 0.5 }), 0.44, 0.7, 0.03, 0, 0, 0, b);
    M(rbox(0.07, 0.12, 0.05, 0.01), mat('#101114', { r: 0.6 }), 0.3, 0.74, -0.21, 0, 0, 0, b);
    // kask, vizör, gözlük
    const hm = mat('#141820', { r: 0.4, m: 0.2 });
    const top = 0.5;
    M(rbox(0.56, 0.24, 0.56, 0.11, 3), hm, 0, top - 0.02, -0.01, 0, 0, 0, n);
    M(boxGeo(0.58, 0.05, 0.58), hm, 0, top - 0.12, -0.01, 0, 0, 0, n);
    M(boxGeo(0.5, 0.03, 0.1), hm, 0, top - 0.14, 0.28, -0.1, 0, 0, n);
    M(boxGeo(0.3, 0.06, 0.03), mat('#2c3340', { r: 0.6 }), 0, top + 0.03, 0.27, 0, 0, 0, n);
    // gözlük kasık üstünde
    M(rbox(0.42, 0.09, 0.06, 0.03), mat('#0a0a0a', { r: 0.1, m: 0.6 }), 0, top + 0.06, 0.25, -0.35, 0, 0, n);
    M(rbox(0.36, 0.06, 0.03, 0.02), mat('#6a4a10', { r: 0.05, m: 0.9, env: 1.5 }), 0, top + 0.065, 0.275, -0.35, 0, 0, n);
    // çene kayışı
    M(boxGeo(0.02, 0.24, 0.02), mat('#111', {}), 0.245, 0.24, 0.1, 0, 0, 0, n); M(boxGeo(0.02, 0.24, 0.02), mat('#111', {}), -0.245, 0.24, 0.1, 0, 0, 0, n);
    // yüz maskesi (alt yarı)
    M(rbox(0.5, 0.2, 0.47, 0.08), mat('#101216', { r: 0.95 }), 0, 0.13, 0.004, 0, 0, 0, n);
  }
  setExpression(e, force = false) {
    if (!force && e === this.expr) return;
    this.expr = e;
    const a = this.app;
    this.faceMat.map = TX.face(e, { brow: HAIR_COLOR[a.hairColor], beard: FACE[a.face].k, hairColor: HAIR_COLOR[a.hairColor], female: a.gender === 'f', police: a.police });
    this.faceMat.needsUpdate = true;
  }
  hold(obj) {
    if (this.held) this.handR.remove(this.held);
    this.held = obj || null;
    if (obj) { obj.position.set(0, -0.02, 0.02); obj.rotation.set(Math.PI / 2, 0, 0); this.handR.add(obj); }
  }
  setPose(p) { this.pose = p; }
  update(dt) {
    this.t += dt;
    const base = POSES[this.pose] || POSES.idle;
    const tgt = Object.assign({}, base);
    const sp = this.speed;
    const grounded = !['lying', 'lyingUp', 'lyingCuffed', 'injured', 'dead', 'kneel', 'kneelCuffed', 'sit', 'sitGround', 'cower'].includes(this.pose);
    if (sp > 0.15 && grounded) {
      this.walkPhase += dt * (3.2 + sp * 1.6);
      const amp = Math.min(0.95, 0.35 + sp * 0.12);
      tgt.hlx = Math.sin(this.walkPhase) * amp; tgt.hrx = -Math.sin(this.walkPhase) * amp;
      const armFree = ['idle', 'fight', 'phone', 'holdItem', 'wave', 'holdLow'].includes(this.pose);
      if (armFree) { if (!['phone', 'holdItem', 'holdLow'].includes(this.pose)) tgt.slx = -Math.sin(this.walkPhase) * amp * 0.8; if (!['holdItem', 'holdLow'].includes(this.pose)) tgt.srx = Math.sin(this.walkPhase) * amp * 0.8; }
      if (this.pose === 'cuffed' || this.pose === 'handsUp') { /* kollar sabit */ }
      tgt.by += Math.abs(Math.sin(this.walkPhase)) * 0.04 * Math.min(1, sp / 3);
    } else if (grounded) {
      const br = Math.sin(this.t * 1.6) * 0.02;
      tgt.slz += br * 0.5; tgt.srz -= br * 0.5; tgt.nx += br;
    }
    switch (this.pose) {
      case 'fight': {
        const ph = (this.t * 2.2) % 2;
        if (ph < 0.25) { tgt.srx = -1.62; tgt.srz = 0.2; } else if (ph > 1 && ph < 1.25) { tgt.slx = -1.62; tgt.slz = -0.2; }
        tgt.bry = Math.sin(this.t * 4.4) * 0.12; break;
      }
      case 'punch': { const ph = (this.t * 3) % 1; tgt.srx = ph < 0.4 ? -1.6 : -1.1; tgt.slx = -1.2; tgt.slz = -0.3; break; }
      case 'argue': tgt.srx = -0.9 + Math.sin(this.t * 3.1) * 0.5; tgt.slx = -0.6 + Math.sin(this.t * 2.3 + 1) * 0.4; tgt.srz = 0.2; tgt.slz = -0.2; tgt.nx = Math.sin(this.t * 2.7) * 0.12; break;
      case 'dance': tgt.slx = -2.6; tgt.srx = -2.6; tgt.slz = 0.6 + Math.sin(this.t * 6) * 0.2; tgt.srz = -0.6 - Math.sin(this.t * 6) * 0.2; tgt.by = Math.abs(Math.sin(this.t * 6)) * 0.08; tgt.hlx = Math.sin(this.t * 6) * 0.35; tgt.hrx = -Math.sin(this.t * 6) * 0.35; tgt.bry = Math.sin(this.t * 3) * 0.3; break;
      case 'cower': tgt.bry = Math.sin(this.t * 20) * 0.03; break;
      case 'tased': tgt.by = 0.2; tgt.brx = Math.PI / 2; tgt.slx = -2.9 + Math.sin(this.t * 40) * 0.3; tgt.srx = -2.9 + Math.cos(this.t * 43) * 0.3; tgt.hlx = Math.sin(this.t * 37) * 0.3; tgt.hrx = Math.cos(this.t * 35) * 0.3; break;
      case 'shove': tgt.slx = -1.6; tgt.srx = -1.6; tgt.slz = -0.1; tgt.srz = 0.1; break;
      case 'edge': tgt.bry = Math.sin(this.t * 0.8) * 0.06; break;
      case 'wave': tgt.srz = -0.4 + Math.sin(this.t * 8) * 0.35; break;
      case 'aim': case 'aim1': tgt.slx -= this.pitch; tgt.srx -= this.pitch; tgt.nx = -this.pitch * 0.7; break;
    }
    if (this.shake > 0) { this.shake -= dt; tgt.bry += Math.sin(this.t * 60) * 0.08; }
    const c = this.cur, L = 14;
    for (const k in tgt) c[k] = damp(c[k] ?? 0, tgt[k], k === 'brx' || k === 'by' ? 7 : L, dt);
    this.hipL.rotation.set(c.hlx, 0, c.hlz); this.hipR.rotation.set(c.hrx, 0, c.hrz);
    this.shL.rotation.set(c.slx, c.sly, c.slz); this.shR.rotation.set(c.srx, c.sry, c.srz);
    this.neck.rotation.set(c.nx, c.ny, 0);
    this.body.position.y = c.by; this.body.rotation.set(c.brx, c.bry, 0);
    if (this.radioLedM) this.radioLedM.emissiveIntensity = Math.sin(this.t * 5) > -0.6 ? 6 : 0;
  }
  // Çarpışma küreleri (dünya koordinatı)
  hitSpheres() {
    const out = [];
    const hp = this.neck.localToWorld(new THREE.Vector3(0, 0.27, 0));
    const tp = new THREE.Vector3(); this.torso.getWorldPosition(tp);
    const lp = new THREE.Vector3(); this.hipL.getWorldPosition(lp); const rp = new THREE.Vector3(); this.hipR.getWorldPosition(rp);
    const legs = lp.add(rp).multiplyScalar(0.5);
    const legDir = tp.clone().sub(legs).normalize();
    out.push({ p: hp, r: 0.27, part: 'head' }, { p: tp, r: 0.4, part: 'body' }, { p: legs.clone().addScaledVector(legDir, -0.3), r: 0.3, part: 'legs' });
    return out;
  }
}

export function shadeHex(hex, f) { return TX.shade(hex, f); }

export function policeAppearance(rng) {
  const a = randomAppearance(rng, { gender: 'm', police: true, hair: 'Kısa saç', face: rng.pick(['Temiz tıraşlı', 'Hafif kirli sakal']) });
  a.police = true; return a;
}
