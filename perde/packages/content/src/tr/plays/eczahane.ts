import type { PlayInput } from '@perde/shared';

/** "Eczahane": Hacivat opens a pharmacy and makes Karagöz the apprentice. Cures go astray. */
export const eczahane: PlayInput = {
  id: 'eczahane',
  cultureId: 'tr',
  lang: 'tr-TR',
  title: 'Eczahane',
  subtitle: 'Karagöz çırak',
  summary:
    'Hacivat eczahane açar, Karagöz çırak olur. Baş ağrısına ayak şurubu, boğaz ağrısına sabun köpüğü.',
  ageRange: '5+',
  durationMin: 5,
  premium: true,
  source: 'Klasik Karagöz faslı "Eczahane"nin (anonim) çocuklar için kısaltılmış özgün uyarlaması.',
  characters: [
    { seat: 'hacivat', name: 'Hacivat', puppetId: 'hacivat', color: '#2e8b57' },
    { seat: 'karagoz', name: 'Karagöz', puppetId: 'karagoz', color: '#c8102e', entrance: 'drop' },
    { seat: 'celebi', name: 'Çelebi', puppetId: 'celebi', color: '#1f4e8c' },
    { seat: 'tuzsuz', name: 'Tuzsuz Deli Bekir', puppetId: 'tuzsuz', color: '#8e3b46' },
  ],
  sections: [
    {
      id: 'acilis',
      title: 'Eczahane Açılır',
      lines: [
        { seat: 'hacivat', text: 'Karagöz’üm, bir eczahane açtım, sen çırak olacaksın.' },
        { seat: 'karagoz', text: 'Eczahane mi? Eczacıhane mi? Neyse, hane olsun da.' },
        { seat: 'hacivat', text: 'Müşteri ne isterse rafa bak, ilacı ver, parayı al.' },
        {
          seat: 'karagoz',
          text: 'Rafa bakarım, ilacı veririm, parayı cebe koyarım!',
          gesture: 'nod',
        },
        {
          seat: 'hacivat',
          text: 'Cebe değil, çekmeceye! Ben çarşıya gidiyorum, sakın karıştırma.',
        },
        { seat: 'karagoz', text: 'Karıştırmam. Ben ilaçları değil, müşteriyi karıştırırım.' },
      ],
    },
    {
      id: 'musteriler',
      title: 'Müşteriler',
      lines: [
        { seat: 'celebi', text: 'Eczacı, başım ağrıyor, bir ilaç verir misin?' },
        { seat: 'karagoz', text: 'Baş ağrısı mı? Al bu şurubu, ayağına sür.' },
        { seat: 'celebi', text: 'Ayağıma mı? Başım ağrıyor dedim!' },
        { seat: 'karagoz', text: 'Baş yukarıda, ayak aşağıda. Ağrı aşağı iner, geçer.' },
        { seat: 'celebi', text: 'Bu nasıl eczacı! Ben gidiyorum.', gesture: 'bow' },
        { seat: 'karagoz', text: 'Parayı unutma! Ha, ilaç bende kaldı, git bakalım.' },
        { seat: 'tuzsuz', text: 'Hey, eczacı! Boğazım ağrıyor, bağıramıyorum!', gesture: 'shake' },
        { seat: 'karagoz', text: 'Bağıramıyorsan neden bağırıyorsun?' },
        { seat: 'tuzsuz', text: 'Bu benim sessiz halim. Çabuk ilaç ver!' },
        { seat: 'karagoz', text: 'Al şu bal kavanozunu, hepsini iç.' },
        { seat: 'tuzsuz', text: 'Hepsini mi? Bu bal değil, sabun köpüğü!' },
        { seat: 'karagoz', text: 'Köpük boğazı yumuşatır. Bak, artık daha az bağırıyorsun.' },
        {
          seat: 'tuzsuz',
          text: 'Ben senin... blup... aman, ağzımdan baloncuk çıkıyor!',
          gesture: 'jump',
        },
        {
          seat: 'karagoz',
          text: 'Gördün mü, ilaç işe yaradı. Baloncuk çıkarıyorsun, bağırmıyorsun!',
          gesture: 'spin',
        },
      ],
    },
    {
      id: 'bitis',
      title: 'Hacivat Döner',
      lines: [
        { seat: 'hacivat', text: 'Karagöz’üm, çarşıda herkes senden şikâyetçi!' },
        { seat: 'karagoz', text: 'Şikâyet mi? Herkes iyileşti. Çelebi’nin başı, Tuzsuz’un sesi…' },
        { seat: 'hacivat', text: 'Tuzsuz köpük çıkarıyor, Çelebi’nin ayağı yapış yapış!' },
        {
          seat: 'karagoz',
          text: 'İlaçlar kimseye zarar vermedi, sadece yer değiştirdi.',
          gesture: 'nod',
        },
        { seat: 'hacivat', text: 'Eczahane kapandı! Yıktın perdeyi eyledin viran!' },
        {
          seat: 'karagoz',
          text: 'Var git sahibine haber ver heman! Yarın berber açarız.',
          gesture: 'wave',
        },
      ],
    },
  ],
};
