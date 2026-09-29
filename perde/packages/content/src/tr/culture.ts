import type { CultureInput } from '@perde/shared';

export const cultureTr: CultureInput = {
  id: 'tr',
  name: { tr: 'Karagöz ve Hacivat', en: 'Karagöz and Hacivat' },
  tradition: 'Karagöz ve Hacivat (gölge oyunu)',
  region: 'Türkiye',
  lang: 'tr-TR',
  description: {
    tr: 'Deve derisinden kesilmiş, arkadan mum ışığıyla aydınlatılan tasvirlerle oynanan Osmanlı gölge oyunu. Karagöz halkın sesi, Hacivat okumuşun; kavgaları hep kelimeler üzerinden.',
    en: 'Ottoman shadow theatre played with translucent camel-hide figures lit from behind. Karagöz is the voice of the street, Hacivat the man of letters; their fights are always over words.',
  },
  heritage: {
    tr: 'UNESCO Somut Olmayan Kültürel Miras listesinde (2009). Oyunlar anonim halk metinleridir; Perde bunları çocuklar için kısaltıp yumuşatır.',
    en: 'Inscribed on the UNESCO Intangible Cultural Heritage list (2009). The plays are anonymous folk texts; Perde shortens and softens them for children.',
  },
  stage: {
    kind: 'shadow-screen',
    backdrop: '#f6e7c8',
    glow: '#fff5d6',
    ground: '#c9a36a',
    text: '#3b2a14',
    puppetOpacity: 0.86,
    blur: 0.6,
  },
  defaultSeats: [
    { seat: 'karagoz', puppetId: 'karagoz', name: 'Karagöz' },
    { seat: 'hacivat', puppetId: 'hacivat', name: 'Hacivat' },
    { seat: 'celebi', puppetId: 'celebi', name: 'Çelebi' },
    { seat: 'zenne', puppetId: 'zenne', name: 'Zenne' },
  ],
  premium: false,
};
