import type { CultureInput } from '@perde/shared';

export const cultureId: CultureInput = {
  id: 'id',
  name: { tr: 'Wayang Kulit', en: 'Wayang Kulit' },
  tradition: 'Wayang kulit purwa (Jawa)',
  region: 'Indonesia',
  lang: 'id-ID',
  description: {
    tr: 'Cava gölge oyunu: oyma manda derisinden, altın varaklı tasvirler beyaz bir kelir üzerinde yağ lambasıyla oynatılır. Dalang tek başına bütün sesleri yapar; Semar ile Petruk gülünç hizmetkârlar, Rama ile Hanoman destanın kahramanlarıdır.',
    en: 'Javanese shadow play: carved buffalo-hide figures with gold leaf, held against a white kelir and lit by an oil lamp. One dalang does every voice; Semar and Petruk are the clown-servants, Rama and Hanoman the heroes of the epic.',
  },
  heritage: {
    tr: 'UNESCO Somut Olmayan Kültürel Miras (2003). Kökeni kutsaldır; Perde yalnızca kısa bir Ramayana sahnesini, hizmetkârların şakalarıyla ve çocuklar için sadeleştirerek anlatır. Gunungan geleneğe uygun olarak perde yerine geçer. İlk oyunu gelenekten birine okutmak istiyoruz.',
    en: 'UNESCO Intangible Cultural Heritage (2003). Sacred in origin; Perde tells only one short Ramayana scene, with the clown-servants’ jokes, simplified for children. The gunungan stands in for the curtain, as it does on a real kelir. We want someone from the tradition to read the first play.',
  },
  stage: {
    kind: 'shadow-screen',
    backdrop: '#f4ead3',
    glow: '#fff8df',
    ground: '#c9a36a',
    text: '#2b1d10',
    puppetOpacity: 0.92,
    blur: 0.4,
    outline: 0,
    backdrop_scene: 'none',
    showpiece: { image: '/art/id/gunungan.webp', width: 1088, height: 1456 },
  },
  defaultSeats: [
    { seat: 'semar', puppetId: 'semar', name: 'Semar' },
    { seat: 'petruk', puppetId: 'petruk', name: 'Petruk' },
    { seat: 'rama', puppetId: 'rama', name: 'Rama' },
    { seat: 'hanoman', puppetId: 'hanoman', name: 'Hanoman' },
  ],
  premium: true,
};
