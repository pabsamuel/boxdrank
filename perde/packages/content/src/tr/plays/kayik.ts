import type { PlayInput } from '@perde/shared';

/** "Kayık": Karagöz becomes a boatman and rows his passengers in circles. */
export const kayik: PlayInput = {
  id: 'kayik',
  cultureId: 'tr',
  lang: 'tr-TR',
  title: 'Kayık',
  subtitle: 'Karagöz kayıkçı',
  summary: 'Hacivat, Karagöz’e kayıkçılık bulur. Kürek tek, yolcular çok, kayık fır fır dönüyor.',
  ageRange: '4+',
  durationMin: 5,
  premium: true,
  source: 'Klasik Karagöz faslı "Kayık"ın (anonim) çocuklar için kısaltılmış özgün uyarlaması.',
  characters: [
    { seat: 'hacivat', name: 'Hacivat', puppetId: 'hacivat', color: '#2e8b57' },
    { seat: 'karagoz', name: 'Karagöz', puppetId: 'karagoz', color: '#c8102e', entrance: 'drop' },
    { seat: 'celebi', name: 'Çelebi', puppetId: 'celebi', color: '#1f4e8c' },
    { seat: 'zenne', name: 'Zenne', puppetId: 'zenne', color: '#d9578a' },
  ],
  sections: [
    {
      id: 'kayikci',
      title: 'Karagöz Kayıkçı Olur',
      lines: [
        { seat: 'hacivat', text: 'Karagöz’üm, sana iş buldum: kayıkçı olacaksın.' },
        { seat: 'karagoz', text: 'Kayıkçı mı? Ben kayık nedir bilmem, tekne bilirim.' },
        { seat: 'hacivat', text: 'Aynı şey Karagöz’üm. Küreği al, müşteriyi karşıya geçir.' },
        { seat: 'karagoz', text: 'Kürek mi? Ben kürekle kar küredim, su kürenir mi?' },
        { seat: 'hacivat', text: 'Kürekle su itilir, kayık gider. Bak böyle.', gesture: 'wave' },
        {
          seat: 'karagoz',
          text: 'Ha, anladım. Suyu iteceğim, su kaçacak, kayık kalacak.',
          gesture: 'nod',
        },
        { seat: 'hacivat', text: 'Tam tersi! Neyse, işte müşteri geliyor.' },
      ],
    },
    {
      id: 'yolcular',
      title: 'Yolcular',
      lines: [
        { seat: 'celebi', text: 'Kayıkçı! Beni karşı yakaya geçirir misin?', gesture: 'wave' },
        { seat: 'karagoz', text: 'Geçiririm ama karşı yaka nerede, hangi taraf?' },
        { seat: 'celebi', text: 'Suyun öbür tarafı işte, görmüyor musun?' },
        { seat: 'karagoz', text: 'Ben bu taraftayım, öbür taraf uzak. Bin, gidelim!' },
        { seat: 'celebi', text: 'Aman kayık sallanıyor, düşeceğim!', gesture: 'shake' },
        { seat: 'karagoz', text: 'Sallanan kayık değil, sensin. Otur, kımıldama!' },
        { seat: 'zenne', text: 'Kayıkçı, dur, ben de bineyim! Sepetim de var.' },
        { seat: 'karagoz', text: 'Sepet de bir kişi sayılır, iki akçe.' },
        { seat: 'zenne', text: 'Sepet insan mı ayol? Sepet para vermez.' },
        { seat: 'karagoz', text: 'Vermezse sepet kıyıda kalır, sen bin.' },
        { seat: 'zenne', text: 'Aman ne huysuz kayıkçı! Al, iki akçe, sepeti de al.' },
      ],
    },
    {
      id: 'doner',
      title: 'Kayık Döner',
      lines: [
        { seat: 'karagoz', text: 'Hadi bakalım, kürek sağa, kürek sola!', gesture: 'shake' },
        { seat: 'celebi', text: 'Kayıkçı, biz dönüyoruz, ilerlemiyoruz!' },
        { seat: 'karagoz', text: 'Dönmek de yol almaktır, hem manzara güzel.', gesture: 'spin' },
        { seat: 'zenne', text: 'Başım döndü, karaya çıkarın beni!' },
        { seat: 'karagoz', text: 'Kara mı? Kara yok, her yer su. Bekleyin.' },
        { seat: 'hacivat', text: 'Karagöz’üm, tek kürek çekiyorsun, ondan dönüyorsun!' },
        { seat: 'karagoz', text: 'Öbür kürek elimde değil ki, sepette!' },
        { seat: 'celebi', text: 'Sepette mi? Sepeti açın, küreği alın!' },
        {
          seat: 'karagoz',
          text: 'Aldım. Şimdi iki kürek, düz yol. Hoop, karşı yaka!',
          gesture: 'jump',
        },
      ],
    },
    {
      id: 'bitis',
      title: 'Bitiş',
      lines: [
        { seat: 'zenne', text: 'Nihayet karaya çıktık, ayaklarım toprağı öpsün.', gesture: 'bow' },
        { seat: 'celebi', text: 'Bir daha bu kayığa binersem bana da Çelebi demesinler.' },
        { seat: 'hacivat', text: 'Karagöz’üm, müşteri yine kaçtı. Kayıkçılık sana göre değil.' },
        { seat: 'karagoz', text: 'Kayıkçılık bana göre, kayık bana göre değil!' },
        { seat: 'hacivat', text: 'Yıktın perdeyi eyledin viran!' },
        { seat: 'karagoz', text: 'Var git sahibine haber ver heman!', gesture: 'wave' },
      ],
    },
  ],
};
