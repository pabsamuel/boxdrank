import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { NEUTRAL_POSE, pickLocalized, type Pose } from '@perde/shared';
import { cultures, getPack } from '@perde/content';
import { StageScene, type ScenePuppet } from '../components/StageScene';
import { getEntitlements } from '../lib/api';
import { useT, useUiLang } from '../lib/ui';

/** Marketing page with a live, self-animating stage so visitors see the thing move. */
export function Landing({ onToggleLang }: { onToggleLang: () => void }) {
  const t = useT();
  const lang = useUiLang();
  const pack = getPack('tr')!;
  const [now, setNow] = useState(0);
  // The checkout link lives on the relay (a repository variable), so the store can
  // open without a rebuild; the build-time value is the fallback.
  const [checkout, setCheckout] = useState<string | undefined>(
    import.meta.env.VITE_CHECKOUT_URL || undefined,
  );
  useEffect(() => {
    getEntitlements()
      .then((e) => {
        if (e.checkoutUrl) setCheckout(e.checkoutUrl);
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const loop = (ms: number) => {
      setNow((ms - start) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const puppets = useMemo<ScenePuppet[]>(() => {
    const k = pack.puppets.find((p) => p.id === 'karagoz')!;
    const h = pack.puppets.find((p) => p.id === 'hacivat')!;
    const pk: Pose = {
      ...NEUTRAL_POSE,
      x: Math.sin(now * 0.7) * 0.15,
      lean: Math.sin(now * 2.1) * 0.5,
      arm: (Math.sin(now * 3) + 1) / 2,
      y: Math.max(0, Math.sin(now * 2.6)) * 0.4,
      talking: Math.sin(now) > 0,
    };
    const ph: Pose = {
      ...NEUTRAL_POSE,
      x: Math.sin(now * 0.5 + 1) * 0.1,
      lean: Math.sin(now * 1.3 + 2) * 0.3,
      arm: (Math.sin(now * 1.7 + 1) + 1) / 2,
      talking: Math.sin(now) <= 0,
    };
    return [
      { key: 'k', puppet: k, npc: false, slot: 0, speaking: false, target: pk },
      { key: 'h', puppet: h, npc: false, slot: 1, speaking: false, target: ph },
    ];
  }, [now, pack]);

  const copy = lang === 'tr' ? TR : EN;

  return (
    <div className="landing">
      <header className="landing__header">
        <div className="brand">
          <span className="brand__mark" aria-hidden>
            ◐
          </span>
          Perde
        </div>
        <nav>
          <a href="#how">{copy.how}</a>
          <a href="#traditions">{copy.traditions}</a>
          <a href="#pricing">{copy.pricing}</a>
          <button className="btn btn--ghost" onClick={onToggleLang} aria-label="language">
            {lang === 'tr' ? 'EN' : 'TR'}
          </button>
        </nav>
      </header>

      <section className="hero">
        <div className="hero__copy">
          <h1>{t('tagline')}</h1>
          <p>{copy.lead}</p>
          <div className="hero__actions">
            <Link className="btn btn--primary" to="/stage">
              📺 {t('openOnTv')}
            </Link>
            <Link className="btn" to="/join">
              📱 {t('joinWithPhone')}
            </Link>
            <Link className="btn" to="/draw">
              ✏️ {t('drawYourOwn')}
            </Link>
          </div>
          <p className="hero__fine">{copy.fine}</p>
        </div>
        <div className="hero__stage">
          <StageScene culture={pack.culture} puppets={puppets} highlightSpeaking={false} />
        </div>
      </section>

      <section id="how" className="section">
        <h2>{copy.how}</h2>
        <ol className="steps">
          {copy.steps.map((s, i) => (
            <li key={i}>
              <span className="steps__n">{i + 1}</span>
              <strong>{s[0]}</strong>
              <span>{s[1]}</span>
            </li>
          ))}
        </ol>
      </section>

      <section id="traditions" className="section">
        <h2>{copy.traditions}</h2>
        <div className="cards">
          {cultures.map((c) => {
            const p = getPack(c.id)!;
            return (
              <article
                key={c.id}
                className="card"
                style={{ ['--card' as string]: c.stage.backdrop }}
              >
                <h3>
                  {pickLocalized(c.name, lang)}{' '}
                  <span className={`badge ${c.premium ? 'badge--plus' : 'badge--free'}`}>
                    {c.premium ? 'Plus' : copy.free}
                  </span>
                </h3>
                <p className="card__region">{c.region}</p>
                <p>{pickLocalized(c.description, lang)}</p>
                <p className="card__stats">
                  {p.plays.length} {copy.plays} · {p.puppets.length} {copy.puppets}
                </p>
              </article>
            );
          })}
          <article className="card card--soon">
            <h3>{copy.soonTitle}</h3>
            <p>{copy.soon}</p>
          </article>
        </div>
      </section>

      <section id="pricing" className="section">
        <h2>{copy.pricing}</h2>
        <div className="plans">
          <article className="plan">
            <h3>{copy.free}</h3>
            <p className="plan__price">₺0</p>
            <ul>
              {copy.freeFeatures.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <Link className="btn" to="/stage">
              {t('openOnTv')}
            </Link>
          </article>
          <article className="plan plan--plus">
            <h3>Perde Plus</h3>
            <p className="plan__price">
              {copy.plusPrice} <small>{copy.once}</small>
            </p>
            <ul>
              {copy.plusFeatures.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <a
              className="btn btn--primary"
              href={checkout ?? '#pricing'}
              target={checkout ? '_blank' : undefined}
              rel={checkout ? 'noreferrer' : undefined}
            >
              {copy.buy}
            </a>
            <p className="plan__fine">{copy.plusFine}</p>
          </article>
        </div>
        <p className="pricing__note">{copy.prices}</p>
        <table className="compare">
          <thead>
            <tr>
              <th>{copy.compareHead[0]}</th>
              <th>{copy.compareHead[1]}</th>
              <th>{copy.compareHead[2]}</th>
            </tr>
          </thead>
          <tbody>
            {copy.compare.map(([what, free, plus]) => (
              <tr key={what}>
                <td>{what}</td>
                <td className={free ? 'yes' : 'no'}>{free ? '✓' : '—'}</td>
                <td className={plus ? 'yes' : 'no'}>{plus ? '✓' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="faq">
          {copy.faq.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="landing__footer">
        <p>{copy.footer}</p>
      </footer>
    </div>
  );
}

const TR = {
  how: 'Nasıl çalışır',
  traditions: 'Gelenekler',
  pricing: 'Fiyat',
  free: 'Ücretsiz',
  lead: 'Televizyonu aç, iki telefonu eline al. Telefonu eğdikçe perdedeki Karagöz eğilir, zıplatınca zıplar. Altta replikler karaoke gibi akar; söylediğini duyar, doğru söyleyince sıradaki repliğe geçer.',
  fine: 'Uygulama yüklemek yok. Televizyonda bir tarayıcı, telefonda kamera yeter.',
  steps: [
    [
      'Televizyonda aç',
      'TV tarayıcısından ya da HDMI ile bağlı bilgisayardan perde.app/stage adresini aç. Ekranda bir oda kodu ve kare kodlar çıkar.',
    ],
    [
      'Telefonla okut',
      'Her kuklacı kendi kare kodunu okutur, "Kuklayı eline al" der; telefon sensörlerine izin verir.',
    ],
    [
      'Oyna ve söyle',
      'Oyun seç ya da serbest oyna. Sıra sendeyken repliği söyle; kelimeler yeşile döndükçe perde ilerler. Boş kalan karakterleri televizyon seslendirir.',
    ],
    [
      'Kendi kuklanı çiz',
      'Kâğıda çiz, fotoğrafını çek. Kâğıdı sileriz, eklemlerine dokunursun, çizimin perdede yürür ve konuşur.',
    ],
  ],
  plays: 'oyun',
  puppets: 'kukla',
  soonTitle: 'Sırada',
  soon: 'Wayang Kulit (Endonezya), Kasperle (Almanya), Guignol (Fransa), Píyǐngxì (Çin), Pulcinella (İtalya). Her gelenek bir içerik paketi; ekleme rehberi depoda.',
  freeFeatures: [
    'Karagöz ve Hacivat: Giriş + Salıncak',
    '4 kukla, 4 telefon',
    'Karaoke replikler ve ses tanıma',
    'Serbest oyun',
  ],
  plusPrice: '₺249',
  once: 'tek sefer, aile başına',
  plusFeatures: [
    'Tüm Karagöz oyunları (Kayık, Eczahane, +yenileri)',
    'Tüm gelenekler: Punch and Judy ve gelecek paketler',
    'Tuzsuz Deli Bekir ve premium kuklalar',
    'Yeni oyunlar geldikçe ücretsiz',
  ],
  buy: 'Perde Plus al',
  plusFine: '5 televizyona kadar · 14 gün koşulsuz iade · hesap açmak yok',
  prices:
    'Türkiye ₺249 · AB €9 · Birleşik Krallık £8 · diğer ülkeler $9. Ödeme Lemon Squeezy üzerinden, KDV dahil; faturan e-postana gelir.',
  compareHead: ['', 'Ücretsiz', 'Plus'] as [string, string, string],
  compare: [
    ['Karagöz: Giriş + Salıncak', true, true],
    ['Karagöz: Kayık, Eczahane ve her yeni oyun', false, true],
    ['Kuklalar: Karagöz, Hacivat, Çelebi, Zenne', true, true],
    ['Premium kuklalar (Tuzsuz Deli Bekir, …)', false, true],
    ['Diğer gelenekler: Punch and Judy; sırada Wayang, Kasperle, Guignol', false, true],
    ['4 telefon, karaoke replikler, ses tanıma, serbest oyun', true, true],
    ['Kendi kuklanı çiz', true, true],
  ] as Array<[string, boolean, boolean]>,
  faq: [
    [
      'Gerçekten tek sefer mi?',
      'Evet. Bir kez ödersin, Perde Plus o ailenin olur. Sonradan eklenen oyunlar ve gelenekler de dahil. Abonelik, yenileme, reklam yok.',
    ],
    [
      'Anahtarı nereye giriyorum?',
      'Satın alınca e-postana bir lisans anahtarı gelir. Oyun sırasında telefondaki ☰ menüden "Perde Plus"a dokun, anahtarı yaz; televizyon açılır ve hatırlar. Aynı anahtar 5 televizyonda çalışır.',
    ],
    [
      'Çocuğum yanlışlıkla bir şey satın alabilir mi?',
      'Hayır. Uygulamanın içinde ödeme yok; satın alma Lemon Squeezy’nin kendi sayfasında, kart bilgisiyle yapılır. Kilitli bir oyuna dokununca yalnızca bu teklif görünür.',
    ],
    [
      'Beğenmezsem?',
      '14 gün içinde, soru sorulmadan iade. Perde’nin hiçbir yerinde hesap ya da kişisel veri tutulmaz; ödeme bilgileri Lemon Squeezy’de kalır.',
    ],
  ] as Array<[string, string]>,
  footer:
    'Perde, Karagöz ve Hacivat’ı (UNESCO Somut Olmayan Kültürel Miras, 2009) yeni nesle sevdirmek için yapıldı. Oyun metinleri anonim halk eserlerinin çocuklara uygun uyarlamalarıdır.',
};

const EN: typeof TR = {
  how: 'How it works',
  traditions: 'Traditions',
  pricing: 'Pricing',
  free: 'Free',
  lead: 'Open the TV, pick up two phones. Tilt the phone and Karagöz leans; flick it and he hops. The script scrolls along the bottom like karaoke; the phone hears you, and when you say the line the play moves on.',
  fine: 'Nothing to install. A browser on the TV and a camera on the phone.',
  steps: [
    [
      'Open on the TV',
      'Open perde.app/stage in the TV browser or on a laptop plugged in over HDMI. You get a room code and QR codes.',
    ],
    [
      'Scan with a phone',
      'Each puppeteer scans their own QR code, taps "Pick up the puppet" and allows motion access.',
    ],
    [
      'Play and speak',
      'Choose a play or just play freely. When it is your line, say it; as the words turn green the show goes on. The TV voices the characters nobody holds.',
    ],
    [
      'Draw your own',
      'Draw on paper, take a photo. We remove the paper, you tap the joints, and your drawing walks and talks on the screen.',
    ],
  ],
  plays: 'plays',
  puppets: 'puppets',
  soonTitle: 'Coming next',
  soon: 'Wayang Kulit (Indonesia), Kasperle (Germany), Guignol (France), Píyǐngxì (China), Pulcinella (Italy). Each tradition is a content pack; the guide to adding one is in the repo.',
  freeFeatures: [
    'Karagöz and Hacivat: the Opening + The Swing',
    '4 puppets, 4 phones',
    'Karaoke lines with speech recognition',
    'Free play',
  ],
  plusPrice: '$9',
  once: 'one-time, per family',
  plusFeatures: [
    'Every Karagöz play (The Boat, The Pharmacy, and more)',
    'Every tradition: Punch and Judy and future packs',
    'Tuzsuz Deli Bekir and premium puppets',
    'New plays free as they land',
  ],
  buy: 'Get Perde Plus',
  plusFine: 'Up to 5 TVs · 14-day no-questions refund · no account to create',
  prices:
    'Türkiye ₺249 · EU €9 · UK £8 · everywhere else $9. Paid through Lemon Squeezy, VAT included; the invoice lands in your inbox.',
  compareHead: ['', 'Free', 'Plus'] as [string, string, string],
  compare: [
    ['Karagöz: the Opening + The Swing', true, true],
    ['Karagöz: The Boat, The Pharmacy and every new play', false, true],
    ['Puppets: Karagöz, Hacivat, Çelebi, Zenne', true, true],
    ['Premium puppets (Tuzsuz Deli Bekir, …)', false, true],
    ['Other traditions: Punch and Judy; Wayang, Kasperle, Guignol next', false, true],
    ['4 phones, karaoke lines, speech recognition, free play', true, true],
    ['Draw your own puppet', true, true],
  ] as Array<[string, boolean, boolean]>,
  faq: [
    [
      'Really one-time?',
      'Yes. Pay once and Perde Plus belongs to that family, including the plays and traditions added later. No subscription, no renewal, no ads.',
    ],
    [
      'Where do I enter the key?',
      'After the purchase a licence key arrives by email. During a show, open the ☰ menu on the phone, tap "Perde Plus" and type it; the TV unlocks and remembers. One key works on 5 TVs.',
    ],
    [
      'Can my child buy something by accident?',
      'No. There is no payment inside the app; the purchase happens on Lemon Squeezy’s own page with a card. Tapping a locked play only shows this offer.',
    ],
    [
      'What if we don’t like it?',
      'A refund within 14 days, no questions asked. Perde keeps no accounts or personal data anywhere; payment details stay with Lemon Squeezy.',
    ],
  ] as Array<[string, string]>,
  footer:
    'Perde exists to make a new generation love Karagöz and Hacivat (UNESCO Intangible Cultural Heritage, 2009). Play texts are child-friendly adaptations of anonymous folk works.',
};
