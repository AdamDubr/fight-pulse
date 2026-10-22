// Готовые переводы карточек тренеров (RU → EN/TR). Ключ — текст из CRM; совпадение без учёта лишних пробелов.
// Новые тексты: перевод можно вписать в CRM (поля EN/TR в анкете тренера); иначе — автоперевод с кэшем.
const P = [
  ['Главный тренер', 'Head coach', 'Baş antrenör'],
  ['Тренер по боксу и кикбоксингу', 'Boxing and kickboxing coach', 'Boks ve kickboks antrenörü'],
  ['Pro MMA 5-2-0 (1 NC): 1 KO/TKO, 3 сабмишна (треугольник), 1 решение', 'Pro MMA 5-2-0 (1 NC): 1 KO/TKO, 3 submissions (triangle), 1 decision', 'Pro MMA 5-2-0 (1 NC): 1 KO/TKO, 3 submission (üçgen), 1 karar'],
  ['Чемпион Турции по ММА 2019 (любители, золото) — Федерация ММА Турции', 'Turkish MMA Champion 2019 (amateur, gold) — Turkish MMA Federation', 'Türkiye MMA Şampiyonu 2019 (amatör, altın) — Türkiye MMA Federasyonu'],
  ['ABJJ Eurasian Championship 2026 — 1 место', 'ABJJ Eurasian Championship 2026 — 1st place', 'ABJJ Eurasian Championship 2026 — 1.lik'],
  ['Сертификат тренера MMA Level 4 — Федерация ММА Турции', 'MMA Coach Level 4 certificate — Turkish MMA Federation', 'MMA Antrenör 4. Kademe belgesi — Türkiye MMA Federasyonu'],
  ['Профессиональный боец ММА 🇦🇿🇹🇷, клуб Mowgli назван в его честь', 'Professional MMA fighter 🇦🇿🇹🇷, the Mowgli club is named after him', 'Profesyonel MMA dövüşçüsü 🇦🇿🇹🇷, Mowgli kulübü onun adını taşıyor'],
  ['Профессиональные бои 2016–2023 (полулёгкий вес)', 'Professional fights 2016–2023 (featherweight)', 'Profesyonel maçlar 2016–2023 (tüy sıklet)'],
  ['SBC (Сербия), NFC (Казахстан), Spil FS', 'SBC (Serbia), NFC (Kazakhstan), Spil FS', 'SBC (Sırbistan), NFC (Kazakistan), Spil FS'],
  ['Профессиональный боец ММА, чемпион Турции, основатель Mowgli Fight Club. Ставит борьбу и партер — 3 победы удушающим треугольником в профи.', 'Professional MMA fighter, Turkish champion, founder of Mowgli Fight Club. Teaches wrestling and ground game — 3 pro wins by triangle choke.', 'Profesyonel MMA dövüşçüsü, Türkiye şampiyonu, Mowgli Fight Club’ın kurucusu. Güreş ve yer dövüşü çalıştırıyor — profesyonelde üçgen boğmayla 3 galibiyet.'],
  ['Тренирует с 2012 года, ставит борьбу и партер', 'Coaching since 2012, teaches wrestling and ground game', '2012’den beri antrenör, güreş ve yer dövüşü çalıştırıyor'],
  ['Мастер спорта по боевому самбо', 'Master of Sport in combat sambo', 'Combat sambo spor ustası'],
  ['Чёрный пояс BJJ, 1 дан', 'BJJ black belt, 1st degree', 'BJJ siyah kuşak, 1. derece'],
  ['Судья федерации ММА Турции', 'Referee of the Turkish MMA Federation', 'Türkiye MMA Federasyonu hakemi'],
  ['Чемпион Турции по ММА 2019', 'Turkish MMA Champion 2019', 'Türkiye MMA Şampiyonu 2019'],
  ['ACA — 8 профессиональных боёв', 'ACA — 8 professional fights', 'ACA — 8 profesyonel maç'],
  ['Тренер сборной Анталии', 'Coach of the Antalya team', 'Antalya takımı antrenörü'],
  ['Тренер международного уровня по боксу и кикбоксингу, заслуженный тренер Туркменистана. Ставит ударную технику — бокс и кикбоксинг.', 'International-level boxing and kickboxing coach, Honoured Coach of Turkmenistan. Teaches striking — boxing and kickboxing.', 'Uluslararası düzeyde boks ve kickboks antrenörü, Türkmenistan Onurlu Antrenörü. Vuruş tekniği çalıştırıyor — boks ve kickboks.'],
  ['Мастер спорта Туркменистана по боксу (2018)', 'Master of Sport of Turkmenistan in boxing (2018)', 'Türkmenistan boks spor ustası (2018)'],
  ['Заслуженный тренер Туркменистана по кикбоксингу (2009)', 'Honoured Coach of Turkmenistan in kickboxing (2009)', 'Türkmenistan Onurlu Kickboks Antrenörü (2009)'],
  ['Судья международной категории World Federation of Kickboxing — WFK (2005)', 'International-category referee, World Federation of Kickboxing — WFK (2005)', 'Uluslararası kategori hakemi, World Federation of Kickboxing — WFK (2005)'],
  ['Тренер международного уровня по боксу и кикбоксингу', 'International-level boxing and kickboxing coach', 'Uluslararası düzeyde boks ve kickboks antrenörü'],
  ['Готовит профессиональных спортсменов с 1992 года', 'Training professional athletes since 1992', '1992’den beri profesyonel sporcu yetiştiriyor'],
  ['С 2026 года — тренер Mowgli Fight Club (Анталья)', 'Coach at Mowgli Fight Club (Antalya) since 2026', '2026’dan beri Mowgli Fight Club (Antalya) antrenörü'],
  ['Мастер спорта Туркменистана по боксу — 15.03.2018, приказ № 127-M/S, Госкомитет по физической культуре и спорту Туркменистана', 'Master of Sport of Turkmenistan in boxing — 15.03.2018, order No. 127-M/S, State Committee for Physical Culture and Sport of Turkmenistan', 'Türkmenistan boks spor ustası — 15.03.2018, 127-M/S sayılı karar, Türkmenistan Beden Eğitimi ve Spor Devlet Komitesi'],
  ['Заслуженный тренер Туркменистана по кикбоксингу — 29.05.2009, удостоверение № 12, приказ 200-Ö, Госкомитет по туризму и спорту Туркменистана', 'Honoured Coach of Turkmenistan in kickboxing — 29.05.2009, certificate No. 12, order 200-Ö, State Committee for Tourism and Sport of Turkmenistan', 'Türkmenistan Onurlu Kickboks Antrenörü — 29.05.2009, 12 No’lu belge, 200-Ö sayılı karar, Türkmenistan Turizm ve Spor Devlet Komitesi'],
  ['Судья международной категории, World Federation of Kickboxing (WFK) — 23.05.2005', 'International-category referee, World Federation of Kickboxing (WFK) — 23.05.2005', 'Uluslararası kategori hakemi, World Federation of Kickboxing (WFK) — 23.05.2005'],
];
const norm = s => String(s || '').replace(/\s+/g, ' ').replace(/[ .]+$/, '').trim().toLowerCase();
const MAP = new Map(P.map(([ru, en, tr]) => [norm(ru), { en, tr }]));
export function coachDict(text, lang) { const x = MAP.get(norm(text)); return x ? x[lang] || null : null }
