// Diyalog seçenekleri: rol ve duruma göre üretilir. Her seçenek {label, fn}; fn 'close' dönerse pencere kapanır.
import { rng } from './util.js';

const R = (a) => a[Math.floor(Math.random() * a.length)];

function idInfo(npc) {
  if (!npc.idInfo) {
    const y = 2026 - npc.age;
    npc.idInfo = {
      name: npc.app.name, surname: npc.app.surname, tc: `${rng.int(1, 9)}${rng.int(1000, 9999)}****${rng.int(10, 99)}`,
      birth: `${String(rng.int(1, 28)).padStart(2, '0')}.${String(rng.int(1, 12)).padStart(2, '0')}.${y}`, serial: `A${rng.int(10, 99)}Z${rng.int(10000, 99999)}`,
      skin: null, hair: null, top: null, fake: npc.fakeId,
      title: npc.flags.fakeCop ? 'EMNİYET GENEL MÜDÜRLÜĞÜ – POLİS KİMLİĞİ' : 'TÜRKİYE CUMHURİYETİ KİMLİK KARTI',
    };
  }
  return npc.idInfo;
}

const NEGOTIATE = [
  { label: 'Sakin ol. Kimsenin zarar görmesini istemiyoruz.', t: -18, r: ['Sakin mi olayım?! Kolay mı sanıyorsun!', 'Tamam... ama yaklaşma.'] },
  { label: 'Ne istiyorsun? Konuşalım.', t: -12, r: ['Bana bir araba ayarlayın, gideyim buradan!', 'Borçlarım var... Beni köşeye sıkıştırdılar!', 'Sadece buradan çıkmak istiyorum!'] },
  { label: 'Silahını bırak yoksa ateş ederim!', t: 28, r: ['Bir adım daha atarsan onu vururum!', 'Beni tehdit etme!'] },
  { label: 'Seni anlıyorum. Bu işten birlikte çıkabiliriz.', t: -15, r: ['Gerçekten mi...? Nasıl?', 'Kimse beni anlamıyor...'] },
  { label: 'Ailen seni böyle görmek ister mi?', t: 'mix', r: ['Ailemi karıştırma!', 'Annem... annem ne der...'] },
  { label: 'Etraf kuşatıldı, kaçışın yok!', t: 16, r: ['O zaman hep beraber gideriz!', 'Yalan söylüyorsun!'] },
  { label: 'Sana su getireyim mi? Biraz nefes alalım.', t: -10, time: 15, r: ['...Tamam. Bir dakika.', 'Su istemiyorum! ...Peki.'] },
  { label: 'Kimse ölmezse cezan çok daha hafif olur.', t: -14, r: ['Gerçekten mi?', 'Hapse girmek istemiyorum...'] },
];
const JUMPER = [
  { label: 'Merhaba, ben polis memuruyum. Sadece konuşmak istiyorum.', trust: 1, t: -10, r: ['Konuşacak bir şey kalmadı...', 'Neden umursuyorsunuz ki?'] },
  { label: 'Neler yaşadığını anlatmak ister misin? Dinliyorum.', trust: 1, t: -8, r: ['İşimi kaybettim... Evde herkes bana kızgın...', 'Her şey üst üste geldi. Artık dayanamıyorum.'] },
  { label: 'Saçmalama, in hemen oradan!', trust: 0, t: 25, r: ['Bana emir verme!', 'Yaklaşma! Atlarım!'] },
  { label: 'Seni seven insanlar var. Onları bir düşün.', trust: 'mix', t: -5, r: ['Kızım... Kızımı düşünüyorum...', 'Kimse beni sevmiyor.'] },
  { label: 'Yardım almak için geç değil. Birlikte destek bulabiliriz.', trust: 1, t: -12, r: ['Gerçekten yardım edecek biri var mı?', 'Belki... bilmiyorum.'] },
  { label: 'Biraz geri çekileyim mi? Baskı yapmayacağım, buradayım.', trust: 0.5, t: -15, r: ['...Evet. Biraz uzak dur.', 'Tamam.'] },
  { label: 'Bana adını söyler misin?', trust: 0.5, t: -4, r: ['Adım {name}.', '{name}...'] },
  { label: 'Atlayacaksan atla, vaktim yok.', trust: -2, t: 70, r: ['Demek öyle...'] },
];

export function getOptions(npc, game, actor) {
  const o = [], m = game.mission, P = actor || game.player;
  const asked = npc.asked ||= new Set();
  const add = (key, label, fn, cond = true) => { if (cond && !asked.has(key)) o.push({ key, label, fn: () => { asked.add(key); return fn(); } }); };
  const addR = (label, fn, cond = true) => { if (cond) o.push({ label, fn }); };
  const say = (t, lang) => npc.say(t, lang);
  const st = npc.state;

  if (!npc.alive) return [];
  // Özel roller
  if (st === 'hostageTaker') {
    const pool = (npc.negPool ||= rng.shuffle(NEGOTIATE));
    const shown = pool.slice(0, 4);
    for (const n of shown) addR(n.label, () => {
      pool.splice(pool.indexOf(n), 1); pool.push(n);
      let t = n.t === 'mix' ? (Math.random() < 0.5 ? -20 : 12) : n.t;
      if (npc.flags.calmed && t > 0) t *= 0.7;
      npc.tension = Math.max(0, Math.min(100, npc.tension + t));
      if (t < 0) npc.tFloor = Math.max(0, (npc.tFloor ?? 50) - 12);
      say(R(n.r));
      if (n.time) m.hostageTimer += n.time;
      if (t < 0) m.note('negotiated');
      return null;
    });
    addR(npc.tension < 45 ? 'Rehineyi bırak. Adil davranılacağına söz veriyorum.' : 'Rehineyi bırak!', () => {
      if (npc.tension < 45) { say('Tamam... Tamam. Bırakıyorum. Ateş etmeyin!'); npc.flags.release = true; m.bonus('negRelease', 15, 'Rehine ikna ile kurtarıldı'); return 'close'; }
      npc.tension = Math.min(100, npc.tension + 12); say('Önce sen geri çekil!'); return null;
    });
    return o;
  }
  if (st === 'edge') {
    const pool = (npc.jPool ||= rng.shuffle(JUMPER));
    for (const n of pool.slice(0, 4)) addR(n.label, () => {
      pool.splice(pool.indexOf(n), 1); pool.push(n);
      let tr = n.trust === 'mix' ? (Math.random() < 0.6 ? 1 : -0.5) : n.trust;
      npc.trust += tr; npc.tension = Math.max(0, Math.min(100, npc.tension + n.t));
      say(R(n.r).replace('{name}', npc.app.name));
      if (tr > 0) m.note('empathy');
      if (npc.trust >= 3) return 'close';
      return null;
    });
    return o;
  }
  if (st === 'hostage') { addR('Sakin olun, sizi buradan çıkaracağız.', () => { say('Lütfen çabuk olun...'); return null; }); return o; }
  if (st === 'injured' || st === 'stable') {
    addR('Beni duyuyor musunuz? Neresi acıyor?', () => { say(st === 'stable' ? 'Biraz... daha iyiyim...' : 'Kanıyor... çok acıyor...'); return null; });
    if (st === 'injured') addR('İlk yardım uygula (basılı tut: E)', () => { game.startFirstAid(npc, P); return 'close'; });
    addR('Ambulans yolda, dayanın.', () => { if (!m.flags.ambulance) game.radioRequest('ambulans', P); say('Tamam...'); return 'close'; });
    if (npc.guilty && !npc.cuffed) addR('Kelepçele (yaralı şüpheli)', () => { npc.cuff(); return 'close'; });
    return o;
  }
  if (['attack', 'shoot', 'flee', 'jump', 'tased', 'down'].includes(st)) return [];

  // Kayıp çocuk
  if (npc.role === 'child') {
    add('cname', 'Merhaba, korkma. Adın ne?', () => { say(`Ben ${npc.app.name}... Annemi kaybettim...`); });
    addR(npc.state === 'follow' ? 'Burada bekle.' : 'Annen seni arıyor. Benimle gel, seni ona götüreyim.', () => {
      if (npc.state === 'follow') { npc.setState('idle'); say('Tamam...'); } else { npc.leader = P; npc.setState('follow'); say('Tamam, geliyorum.'); m.note('childFound'); game.event('childFollow', npc); }
      return 'close';
    });
    return o;
  }
  // Tanık / mağdur / ihbarcı
  if (['victim', 'reporter', 'witness', 'clerk', 'owner', 'guard', 'parent'].includes(npc.role) || npc.lines.statement) {
    add('statement', 'Ne oldu, anlatır mısınız?', () => {
      const l = npc.lines.statement || [R(['Ben bir şey görmedim memur bey.', 'Kavga gürültü vardı, o kadar.', 'Valla karışmak istemem.'])];
      game.sayQueue(npc, l);
      if (npc.lines.statement) { npc.flags.statement = true; game.event('statement', npc); }
    });
    if (npc.knows) add('desc', 'Şüpheli nasıl biriydi?', () => { const s = npc.knows; say(s.npc ? `Hatırladığım kadarıyla ${s.npc.desc}.` : s.text); npc.flags.desc = true; game.event('desc', npc); }, true);
    if (npc.knowsDir) add('dir', 'Ne tarafa gitti?', () => say(npc.knowsDir));
    if (npc.flags.hurt) add('hurt', 'Yaralı mısınız?', () => { say('Kolumu burktum galiba ama iyiyim. Sağ olun.'); m.bonus('askHurt', 3, 'Mağdurun sağlık durumu soruldu'); });
  }
  // Ortak sorgular
  add('id', 'Kimliğinizi görebilir miyim?', () => {
    if (npc.guilty && npc.plan !== 'comply' && Math.random() < 0.35 - npc.compliance * 0.2) { say(R(['Kimlik moklik yok bende!', 'Ne kimliği? Bir şey yapmadım ki!'])); npc.aggression += 0.1; asked.delete('id'); return; }
    if (npc.role === 'migrant') { say(R(['Kimlik... yok. Pasaport yok.', 'No ID... please... aile...'])); npc.flags.noId = true; game.event('idCheck', npc); return; }
    const info = idInfo(npc); npc.flags.idChecked = true;
    game.showIdTo(P, info); say(R(['Buyrun memur bey.', 'Al bakalım.', 'Tabii, buyurun.']));
    game.event('idCheck', npc);
  }, npc.role !== 'child');
  add('gbt', 'GBT sorgusu yapacağım, bekleyin.', () => {
    game.radioGBT(npc, P);
  }, npc.flags.idChecked && !npc.flags.gbt);
  if (npc.flags.fakeCop && npc.flags.idChecked) add('fake', 'Bu kimlik sahte! Hangi birimdensin?', () => {
    say(R(['Ben... şey... asayişten! Yeni atandım!', 'Ne sahtesi abi, gerçek bu!'])); npc.flags.exposed = true; game.event('fakeExposed', npc);
    if (Math.random() < 0.45) setTimeout(() => npc.startFlee(), 1200);
  });
  add('story', 'Burada ne yapıyorsunuz?', () => {
    const l = npc.lines.excuse || (npc.role === 'bystander' ? [R(['Yürüyordum, gürültüyü duyup baktım.', 'Arkadaşımı bekliyorum.', 'Eve gidiyordum memur bey.', 'Şuradaki çay ocağından çıktım.'])] : [R(['Hiçbir şey, öyle duruyorum.', 'Size ne bundan?', 'Bekliyorum birini.'])]);
    game.sayQueue(npc, l);
  });
  add('frisk', 'Üst araması yapacağım. Ellerini görebileceğim yere koy.', () => {
    if (npc.guilty && !['surrender', 'kneel', 'present', 'handsUp'].includes(npc.state) && npc.plan !== 'comply' && Math.random() < 0.7 - npc.compliance * 0.5) {
      say(R(['Dokunma bana!', 'Sen kimsin de beni arıyorsun?!'])); setTimeout(() => { if (npc.alive && !npc.cuffed) { if (Math.random() < 0.5) npc.startFlee(); else { npc.setState(npc.armed === 'gun' ? 'shoot' : 'attack'); npc.bark('attack', true); } } }, 700); npc.triggered = true; return 'close';
    }
    npc.setState('handsUp'); npc.flags.handsUpT = 4; npc.flags.frisked = true;
    game.sfx('frisk', npc.pos);
    setTimeout(() => {
      const items = npc.items.slice();
      if (npc.armed && npc.weaponMesh) items.unshift(npc.armed === 'gun' ? 'Ruhsatsız tabanca' : npc.armed === 'knife' ? 'Sustalı bıçak' : 'Beyzbol sopası');
      if (items.length) {
        game.toast(`Üst aramasında bulundu: ${items.join(', ')}`, 'warn');
        npc.flags.evidence = true; game.event('evidence', npc);
        if (npc.weaponMesh) { npc.char.hold(null); npc.weaponMesh = null; npc.armed = null; }
        m.bonus('frisk' + npc.id, 8, 'Üst aramasında delil bulundu');
      } else { game.toast('Üst aramasında bir şey bulunamadı.', 'ok'); say('Gördün mü? Temizim.'); }
      game.event('frisk', npc);
    }, 1400);
    return 'close';
  }, !['present', 'cuffed'].includes(npc.state));
  if (npc.flags.canBreath) add('breath', 'Alkol testi yapalım. Buraya üfleyin.', () => {
    const p = npc.promil.toFixed(2);
    setTimeout(() => { game.toast(`Alkolmetre: ${p} promil ${npc.promil > 0.5 ? '— YASAL SINIRIN ÜZERİNDE' : '— temiz'}`, npc.promil > 0.5 ? 'warn' : 'ok'); npc.flags.breathed = true; game.event('breath', npc); }, 1200);
    say(npc.promil > 0.5 ? 'İki bira içtim sadece...' : 'Tamam, üflüyorum.');
  });
  if (npc.flags.vehicle && !npc.flags.searchedCar) add('car', 'Aracınızı arayacağım. Bagajı açın.', () => {
    if (npc.guilty && npc.plan === 'flee' && Math.random() < 0.6) { say('Siktir!'); npc.startFlee(); return 'close'; }
    npc.flags.searchedCar = true; say(npc.guilty && npc.flags.carItems ? 'Onlar benim değil...' : 'Buyrun, saklayacak bir şeyim yok.');
    setTimeout(() => { const it = npc.flags.carItems; game.toast(it ? `Araçta bulundu: ${it}` : 'Araçta kanuna aykırı bir şey bulunamadı.', it ? 'warn' : 'ok'); if (it) { npc.flags.evidence = true; game.event('evidence', npc); m.bonus('carSearch', 8, 'Araç aramasında delil bulundu'); } game.event('carSearch', npc); }, 1500);
    return 'close';
  });
  if (npc.flags.musicOwner && !npc.flags.musicDown) add('music', 'Şikayet var. Müziğin sesini kısın lütfen.', () => {
    if (Math.random() < npc.compliance + 0.15) { say('Tamam memur bey, kusura bakmayın.'); npc.flags.musicDown = true; game.musicParty(null); game.event('musicDown', npc); }
    else { say(R(['Benim evim, istediğimi yaparım!', 'Daha saat erken!'])); npc.aggression += 0.15; asked.delete('music'); if (Math.random() < npc.aggression * 0.4) { npc.setState('attack'); npc.triggered = true; return 'close'; } }
  });
  if (npc.role === 'squatter' && !npc.flags.leaving) add('squat', 'Burası özel mülk. Alanı boşaltmanız gerekiyor.', () => {
    if (Math.random() < npc.compliance) { say(R(['Tamam... eşyalarımı alıp gidiyorum.', 'Nereye gideyim ki... peki.'])); npc.flags.leaving = true; npc.flags.vanish = true; npc.leaveTo(game.world.a('escape')); game.event('squatLeft', npc); return 'close'; }
    say(R(['Hiçbir yere gitmiyorum!', 'Burası benim yerim artık!'])); npc.aggression += 0.2; asked.delete('squat');
  });
  if (npc.role === 'migrant' && npc.state !== 'follow') add('mig', 'Göç İdaresi\'ne teslim etmek üzere benimle gelin. Size yardımcı olacağız.', () => {
    if (Math.random() < npc.compliance) { say(R(['Tamam... teşekkür.', 'Okay... okay.'])); npc.leader = P; npc.setState('follow'); game.event('migrantFollow', npc); }
    else { say('Hayır! Hayır!'); npc.startFlee(); }
    return 'close';
  });
  addR('Sakin olun, kimseye zarar gelmeyecek.', () => {
    npc.aggression = Math.max(0, npc.aggression - 0.25); npc.compliance = Math.min(1, npc.compliance + 0.1); npc.flags.calmed = true;
    if (['argue', 'fight', 'drunk'].includes(npc.state)) npc.setState('idle');
    say(R(npc.guilty ? ['Tamam, tamam. Sakinim.', 'Peki...', 'Sakinim ben zaten!'] : ['Tamam memur bey.', 'Siz geldiniz ya, rahatladım.']));
    game.event('calmed', npc); m.note('calm');
    return null;
  }, !npc.flags.calmed || ['argue', 'fight'].includes(st));
  if (!npc.cuffed && npc.role !== 'migrant') addR('Gözaltına alınıyorsunuz. Arkanızı dönün, ellerinizi birleştirin.', () => {
    if (!npc.guilty) { say(R(['Ama ben bir şey yapmadım!', 'Ne? Neden?!', 'Yanlış kişiyi tutuyorsunuz!'])); if (Math.random() < 0.8) { npc.setState('present'); npc.flags.presenting = true; } return 'close'; }
    const p = npc.compliance + (P.weaponDrawn ? 0.2 : 0) + (npc.flags.evidence ? 0.05 : 0) - npc.aggression * 0.3 + (['surrender', 'kneel'].includes(st) ? 0.4 : 0);
    if (Math.random() < p) { npc.setState('present'); npc.flags.presenting = true; say(R(['Tamam... tamam.', 'Avukatımı istiyorum.', 'Bu iş böyle bitmez...'])); game.toastTo(P, 'Kelepçeyi kuşan (3) ve E ile kelepçele.', 'info'); }
    else { npc.triggered = true; npc.bark('cuffResist', true); setTimeout(() => { if (!npc.alive || npc.cuffed) return; if (npc.armed === 'gun' && Math.random() < 0.5) npc.setState('shoot'); else if (Math.random() < 0.5) npc.startFlee(); else npc.setState('attack'); }, 500); m.note('resisted'); }
    return 'close';
  });
  if (npc.cuffed) addR(npc.escort ? 'Burada bekle.' : 'Yürü, araca gidiyoruz.', () => { npc.escort = !npc.escort; say(npc.escort ? 'Tamam, yürüyorum...' : '...'); return 'close'; });
  if (!npc.cuffed && ['bystander', 'witness', 'victim', 'reporter', 'owner', 'clerk', 'guard', 'parent'].includes(npc.role) && m.wantClear && !npc.flags.cleared) addR('Lütfen bölgeden uzaklaşın!', () => { npc.flags.cleared = true; say('Tamam, gidiyorum.'); npc.leaveTo(npc.awayPoint(18)); return 'close'; });
  addR(npc.cuffed ? 'Kelepçeyi çöz ve serbest bırak.' : 'Tamam, gidebilirsiniz.', () => {
    if (npc.cuffed) { npc.cuffed = false; npc.flags.cuffed = false; npc.escort = false; }
    npc.flags.released = true; npc.flags.vanish = true;
    say(R(npc.guilty ? ['Hadi eyvallah.', 'Sağ ol memur bey!'] : ['Teşekkürler.', 'İyi geceler.']));
    npc.leaveTo(game.world.a('escape', Math.floor(Math.random() * 2)));
    game.event('released', npc);
    return 'close';
  }, npc.role !== 'hostage' && !['victim', 'reporter', 'parent', 'clerk', 'owner', 'guard'].includes(npc.role) || npc.cuffed);
  addR('Görüşürüz.', () => 'close');
  return o;
}
