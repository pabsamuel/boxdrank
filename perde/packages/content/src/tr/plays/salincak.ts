import type { PlayInput } from '@perde/shared';

/** "Salıncak": Karagöz and Hacivat run a holiday swing; every customer flies away. */
export const salincak: PlayInput = {
  id: 'salincak',
  cultureId: 'tr',
  lang: 'tr-TR',
  title: 'Salıncak',
  subtitle: 'Bayram salıncağı',
  summary:
    'Bayramda salıncak kuran Karagöz, kimi sallasa bulutlara yolluyor. Müşteriler kaçıyor, ip kopuyor, eğlence bitmiyor.',
  ageRange: '4+',
  durationMin: 5,
  premium: false,
  source: 'Klasik Karagöz faslı "Salıncak"ın (anonim) çocuklar için kısaltılmış özgün uyarlaması.',
  characters: [
    { seat: 'hacivat', name: 'Hacivat', puppetId: 'hacivat', color: '#2e8b57' },
    { seat: 'karagoz', name: 'Karagöz', puppetId: 'karagoz', color: '#c8102e', entrance: 'drop' },
    { seat: 'celebi', name: 'Çelebi', puppetId: 'celebi', color: '#1f4e8c' },
    { seat: 'zenne', name: 'Zenne', puppetId: 'zenne', color: '#d9578a' },
  ],
  sections: [
    {
      id: 'kurulus',
      title: 'Salıncak Kurulur',
      lines: [
        { seat: 'hacivat', text: 'Karagöz’üm, bayram geldi, mahalleye salıncak kuralım.' },
        { seat: 'karagoz', text: 'Salıncak mı? Ben sallanırım, sen sallarsın!', gesture: 'jump' },
        { seat: 'hacivat', text: 'Olmaz, salıncağı müşteriye sallayacağız, para kazanacağız.' },
        { seat: 'karagoz', text: 'Para mı? Öyle desene, ipi getir hemen!' },
        { seat: 'hacivat', text: 'İpi ağaca bağla, tahtayı da ortaya koy.' },
        { seat: 'karagoz', text: 'Bağladım. Tahta da hazır. Hadi bir deneyeyim!', gesture: 'jump' },
        { seat: 'hacivat', text: 'Dur Karagöz’üm, önce müşteri gelsin.' },
        {
          seat: 'karagoz',
          text: 'Salıncaaak! Sallanan bir akçe, sallayan iki akçe!',
          gesture: 'wave',
        },
        { seat: 'hacivat', text: 'Ne diyorsun sen? Sallayan para almaz, verir.' },
        { seat: 'karagoz', text: 'Bizim salıncakta sallayan da öder, kolu yorulur.' },
      ],
    },
    {
      id: 'celebi',
      title: 'Çelebi Gelir',
      lines: [
        { seat: 'celebi', text: 'Merhaba beyler, bu salıncak ne kadar?', gesture: 'bow' },
        { seat: 'karagoz', text: 'Bir salıncak bir akçe, iki salıncak yine bir akçe.' },
        { seat: 'celebi', text: 'O zaman iki salıncak alayım, kârlı çıkarım.' },
        { seat: 'hacivat', text: 'Buyurun Çelebi, oturun, ben sallayayım.' },
        { seat: 'karagoz', text: 'Yok Hacivat, ben sallarım, sen say!' },
        { seat: 'celebi', text: 'Aman yavaş sallayın, başım döner!' },
        { seat: 'karagoz', text: 'Yavaş mı? Salıncak yavaş olur mu? Hoop!', gesture: 'shake' },
        {
          seat: 'celebi',
          text: 'Ayyy, gökyüzüne çıktım, bulutlar burnuma değiyor!',
          gesture: 'jump',
        },
        { seat: 'hacivat', text: 'Karagöz, yavaş dedim! Çelebi uçtu gitti!' },
        { seat: 'karagoz', text: 'Uçtuysa kuş oldu, parasını ödesin de öyle uçsun.' },
        { seat: 'celebi', text: 'Alın paranızı, bir daha buraya gelmem!', gesture: 'bow' },
      ],
    },
    {
      id: 'zenne',
      title: 'Zenne Gelir',
      lines: [
        { seat: 'zenne', text: 'Ayol bu salıncak ne güzel, ben de bineyim.' },
        {
          seat: 'hacivat',
          text: 'Buyurun hanımefendi, bu sefer Hacivat sallayacak.',
          gesture: 'bow',
        },
        { seat: 'karagoz', text: 'Yine mi sen? Ben de yavaş sallarım, bak!' },
        { seat: 'zenne', text: 'Sen mi? Çelebi’yi bulutlara çıkardın, duydum.' },
        { seat: 'karagoz', text: 'Çelebi kendisi uçtu, salıncağın suçu yok.' },
        { seat: 'zenne', text: 'Peki ama ipin ucunu sıkı tut, bırakma.' },
        { seat: 'karagoz', text: 'Sıkı tuttum. Bir, iki, üüüç!', gesture: 'spin' },
        { seat: 'zenne', text: 'Ayyy! İp koptu, ben nereye gidiyorum?', gesture: 'jump' },
        { seat: 'hacivat', text: 'Karagöz, ipi çok gerdin, koptu işte!' },
        { seat: 'karagoz', text: 'Kopmadı, kendi kendine bıraktı. İp de yoruldu.' },
        { seat: 'zenne', text: 'Bir daha bu salıncağa binersem, adım Zenne olmasın!' },
      ],
    },
    {
      id: 'bitis',
      title: 'Bitiş',
      lines: [
        { seat: 'hacivat', text: 'Müşteri kaçtı, ip koptu, para yok. Ne yaptın Karagöz?' },
        { seat: 'karagoz', text: 'Ne yaptım? Bayramı şenlendirdim!', gesture: 'jump' },
        {
          seat: 'hacivat',
          text: 'Şenlendirdin ama salıncağı yıktın. Yıktın perdeyi eyledin viran!',
        },
        {
          seat: 'karagoz',
          text: 'Var git sahibine haber ver heman! Yarın yine kurarız.',
          gesture: 'wave',
        },
      ],
    },
  ],
};
