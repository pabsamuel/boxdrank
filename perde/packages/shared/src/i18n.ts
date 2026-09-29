/** Tiny UI dictionary. Content (plays) carries its own language; this is only chrome. */
export type UiLang = 'tr' | 'en';

export function detectUiLang(navLang: string | undefined): UiLang {
  return (navLang ?? '').toLowerCase().startsWith('tr') ? 'tr' : 'en';
}

const dict = {
  appName: { tr: 'Perde', en: 'Perde' },
  tagline: {
    tr: 'Karagöz ile Hacivat televizyonda, ipler senin telefonunda.',
    en: 'Karagöz and Hacivat on your TV, the strings in your phone.',
  },
  openOnTv: { tr: 'Televizyonda aç', en: 'Open on the TV' },
  joinWithPhone: { tr: 'Telefonla katıl', en: 'Join with a phone' },
  roomCode: { tr: 'Oda kodu', en: 'Room code' },
  scanToJoin: { tr: 'Okut ve kuklayı eline al', en: 'Scan to pick up this puppet' },
  waitingForPuppeteers: { tr: 'Kuklacılar bekleniyor…', en: 'Waiting for puppeteers…' },
  connected: { tr: 'Bağlı', en: 'Connected' },
  disconnected: { tr: 'Bağlantı koptu', en: 'Disconnected' },
  pickUpPuppet: { tr: 'Kuklayı eline al', en: 'Pick up the puppet' },
  motionPermission: {
    tr: 'Telefonun hareket sensörüne izin ver; kukla senin elinle oynar.',
    en: 'Allow motion access; the puppet follows your hand.',
  },
  recenter: { tr: 'Ortala', en: 'Recenter' },
  freePlay: { tr: 'Serbest oyun', en: 'Free play' },
  choosePlay: { tr: 'Oyun seç', en: 'Choose a play' },
  nextLine: { tr: 'Sonraki replik', en: 'Next line' },
  prevLine: { tr: 'Önceki replik', en: 'Previous line' },
  saidIt: { tr: 'Söyledim', en: 'I said it' },
  yourLine: { tr: 'Sıra sende', en: 'Your line' },
  theirLine: { tr: 'Sıra onda', en: 'Their line' },
  anyonesLine: { tr: 'Sen de söyleyebilirsin', en: 'Anyone can say it' },
  karaokeOn: { tr: 'Metin: açık', en: 'Text: on' },
  karaokeOff: { tr: 'Metin: kapalı', en: 'Text: off' },
  listening: { tr: 'Dinliyorum…', en: 'Listening…' },
  micUnavailable: {
    tr: 'Bu tarayıcı konuşmayı tanıyamıyor; repliği söyleyince "Söyledim"e bas.',
    en: 'This browser cannot recognise speech; tap "I said it" after your line.',
  },
  theEnd: { tr: 'Perde!', en: 'Curtain!' },
  backToLobby: { tr: 'Lobiye dön', en: 'Back to lobby' },
  wave: { tr: 'Selam ver', en: 'Wave' },
  jump: { tr: 'Zıpla', en: 'Jump' },
  spin: { tr: 'Dön', en: 'Spin' },
  bow: { tr: 'Reverans', en: 'Bow' },
  stageOffline: { tr: 'Televizyon bağlı değil', en: 'The TV is not connected' },
  leniency: { tr: 'Zorluk', en: 'Strictness' },
  kids: { tr: 'Çocuk', en: 'Kids' },
  normal: { tr: 'Normal', en: 'Normal' },
  strict: { tr: 'Sıkı', en: 'Strict' },
  culture: { tr: 'Gelenek', en: 'Tradition' },
  premium: { tr: 'Perde Plus', en: 'Perde Plus' },
  locked: { tr: 'Perde Plus ile açılır', en: 'Unlocks with Perde Plus' },
  seatTaken: { tr: 'Bu koltuk dolu', en: 'This seat is taken' },
  roomNotFound: { tr: 'Oda bulunamadı', en: 'Room not found' },
  enterCode: { tr: 'Televizyondaki kodu gir', en: 'Enter the code on the TV' },
  join: { tr: 'Katıl', en: 'Join' },
  spokenLines: { tr: 'söylenen replik', en: 'lines spoken' },
} as const;

export type UiKey = keyof typeof dict;

export function t(key: UiKey, lang: UiLang): string {
  return dict[key][lang];
}
