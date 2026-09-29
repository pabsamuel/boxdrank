import type { PlayInput } from '@perde/shared';

/**
 * The traditional opening of every Karagöz night: Hacivat's semai and prayer,
 * the call "Yâr bana bir eğlence!", Karagöz tumbling down, and a muhavere of
 * misheard words. Adapted and shortened for children; no beating scene.
 */
export const giris: PlayInput = {
  id: 'giris',
  cultureId: 'tr',
  lang: 'tr-TR',
  title: 'Yâr Bana Bir Eğlence',
  subtitle: 'Giriş ve Muhavere',
  summary:
    'Hacivat perdeyi açar, bir arkadaş çağırır; Karagöz gökten düşer gibi gelir ve her sözü yanlış anlar.',
  ageRange: '4+',
  durationMin: 4,
  premium: false,
  source:
    'Anonim halk metni (mukaddime ve klasik muhavere kalıpları). Perde için kısaltılmış, yumuşatılmış özgün uyarlama.',
  characters: [
    { seat: 'hacivat', name: 'Hacivat', puppetId: 'hacivat', color: '#2e8b57' },
    { seat: 'karagoz', name: 'Karagöz', puppetId: 'karagoz', color: '#c8102e' },
  ],
  sections: [
    {
      id: 'mukaddime',
      title: 'Mukaddime',
      lines: [
        {
          seat: 'hacivat',
          text: 'Perde kuruldu, mumlar yandı, gel Karagöz’üm gel!',
          song: true,
          gesture: 'bow',
          hint: 'Hacivat şarkı söyleyerek girer',
        },
        { seat: 'hacivat', text: 'Off, hay Hak!' },
        { seat: 'hacivat', text: 'Bu gece herkes toplanmış, bir eğlence bekliyor.' },
        { seat: 'hacivat', text: 'Bana bir arkadaş lazım. Ama kim gelir bu saatte?' },
        { seat: 'hacivat', text: 'Yâr bana bir eğlence!', gesture: 'wave' },
        { seat: 'hacivat', text: 'Yâr bana bir eğlence!', gesture: 'wave' },
        { seat: 'hacivat', text: 'Aman bana bir eğlence!', gesture: 'wave' },
        {
          seat: 'karagoz',
          text: 'Amaaan! Uykumu böldün, geliyorum!',
          gesture: 'jump',
          hint: 'Karagöz yukarıdan atlar',
        },
        { seat: 'karagoz', text: 'Hop! Düştüm, kalktım, işte geldim.', gesture: 'shake' },
      ],
    },
    {
      id: 'muhavere',
      title: 'Muhavere',
      lines: [
        { seat: 'hacivat', text: 'Vay Karagöz’üm, sabah şerifleriniz hayrolsun!', gesture: 'bow' },
        { seat: 'karagoz', text: 'Ne dedin? Sabah şerif mi olsun? Ben şerif değilim!' },
        { seat: 'hacivat', text: 'Hayrolsun diyorum, iyi olsun demek.' },
        { seat: 'karagoz', text: 'Öyle desene! İyi olsun, kötü olmasın.', gesture: 'nod' },
        { seat: 'hacivat', text: 'Karagöz’üm, bu gece rüyamda seni gördüm.' },
        { seat: 'karagoz', text: 'Beni mi gördün? Ne yapıyormuşum?' },
        { seat: 'hacivat', text: 'Kanatların vardı, gökyüzünde uçuyordun.' },
        { seat: 'karagoz', text: 'Uçuyor muydum? Eyvah, düşersem ne olacak?', gesture: 'shake' },
        { seat: 'hacivat', text: 'Rüya bu Karagöz’üm, rüyada düşülmez.' },
        { seat: 'karagoz', text: 'Ben rüyada bile düşerim Hacivat, sen beni bilmezsin.' },
        { seat: 'hacivat', text: 'Peki, ne yapalım bu gece, ne oynayalım?' },
        { seat: 'karagoz', text: 'Ne oynayalım? Sen söyle, ben oynarım!', gesture: 'jump' },
        { seat: 'hacivat', text: 'Bir salıncak kuralım, bir kayık yüzdürelim.' },
        { seat: 'karagoz', text: 'Kayık mı? Ben yüzme bilmem, batarım!' },
        { seat: 'hacivat', text: 'Batmazsın Karagöz’üm, kayık yüzer, sen oturursun.' },
        {
          seat: 'karagoz',
          text: 'Ben oturursam kayık batar, benim karnım büyük!',
          gesture: 'shake',
        },
        { seat: 'hacivat', text: 'Aman Karagöz’üm, sen hiç değişmezsin.' },
        { seat: 'karagoz', text: 'Sen de hiç kısa konuşmazsın Hacivat!', gesture: 'nod' },
      ],
    },
    {
      id: 'bitis',
      title: 'Bitiş',
      lines: [
        { seat: 'hacivat', text: 'Her ne kadar sürç-i lisan ettikse affola.', gesture: 'bow' },
        { seat: 'karagoz', text: 'Yani dilimiz sürçtüyse kusura bakmayın, diyor.' },
        { seat: 'hacivat', text: 'Yarın akşam yine buradayız, gelin!' },
        { seat: 'karagoz', text: 'Gelmezseniz ben size gelirim, aman dikkat!', gesture: 'wave' },
        { seat: 'hacivat', text: 'Yıktın perdeyi Karagöz, eyledin viran!' },
        { seat: 'karagoz', text: 'Var git sahibine haber ver heman!', gesture: 'spin' },
      ],
    },
  ],
};
