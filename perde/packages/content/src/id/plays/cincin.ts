import type { PlayInput } from '@perde/shared';

/**
 * "Cincin Rama" (Rama's ring): Hanoman carries Rama's ring across the sea to
 * find Sinta and comes back with her hairpin. The scene from the Ramayana as
 * a lakon for children, with Semar and Petruk as the clown-servants who open
 * and close it. No battle: the journey and the friendship are the story.
 */
export const cincin: PlayInput = {
  id: 'cincin',
  cultureId: 'id',
  lang: 'id-ID',
  title: 'Cincin Rama',
  subtitle: 'Lakon pendek dari Ramayana',
  summary:
    'Dewi Sinta hilang. Rama memberi cincinnya kepada Hanoman, kera putih yang bisa melompat jauh. Semar dan Petruk ikut menunggu kabar.',
  ageRange: '4+',
  durationMin: 3,
  premium: true,
  source:
    'Ramayana, episode "Anoman Duta" of the Javanese wayang purwa (traditional); original adaptation for Perde for children, without the battle.',
  characters: [
    { seat: 'semar', name: 'Semar', puppetId: 'semar', color: '#8a5a2b' },
    { seat: 'petruk', name: 'Petruk', puppetId: 'petruk', color: '#c8102e' },
    { seat: 'rama', name: 'Rama', puppetId: 'rama', color: '#b08d2e' },
    { seat: 'hanoman', name: 'Hanoman', puppetId: 'hanoman', color: '#2e6f8b', entrance: 'drop' },
  ],
  sections: [
    {
      id: 'pembukaan',
      title: 'Pembukaan',
      lines: [
        { seat: 'semar', text: 'Hore, hore! Selamat malam, anak-anak semua!', gesture: 'wave' },
        { seat: 'petruk', text: 'Semar, kenapa kita dipanggil ke istana malam ini?' },
        { seat: 'semar', text: 'Raden Rama sedang sedih. Dewi Sinta hilang.' },
        { seat: 'petruk', text: 'Hilang? Aduh! Siapa yang bisa menolong?', gesture: 'shake' },
        { seat: 'semar', text: 'Ada satu. Kera putih yang bisa terbang.' },
        { seat: 'petruk', text: 'Hanoman! Ayo kita cari dia!', gesture: 'jump' },
      ],
    },
    {
      id: 'tugas',
      title: 'Tugas',
      lines: [
        { seat: 'rama', text: 'Hanoman, sahabatku. Aku butuh bantuanmu.' },
        { seat: 'hanoman', text: 'Siap, Raden Rama! Apa tugasku?', gesture: 'bow' },
        { seat: 'rama', text: 'Carilah Dewi Sinta di seberang laut.' },
        { seat: 'rama', text: 'Bawalah cincinku ini. Sinta pasti mengenalnya.' },
        { seat: 'hanoman', text: 'Cincin ini akan kujaga baik-baik.', gesture: 'nod' },
        { seat: 'petruk', text: 'Hati-hati, Hanoman! Lautnya luas sekali!' },
        { seat: 'hanoman', text: 'Tenang, Petruk. Aku bisa melompat jauh!', gesture: 'jump' },
        { seat: 'semar', text: 'Pergilah, Hanoman. Kami menunggu di sini.', gesture: 'wave' },
      ],
    },
    {
      id: 'kabar',
      title: 'Kabar',
      lines: [
        { seat: 'hanoman', text: 'Raden Rama! Aku sudah kembali!', gesture: 'wave' },
        { seat: 'rama', text: 'Hanoman! Apakah kau menemukan Sinta?' },
        { seat: 'hanoman', text: 'Ya! Dewi Sinta selamat. Dia menitipkan ini.' },
        { seat: 'rama', text: 'Tusuk kondenya! Terima kasih, Hanoman!', gesture: 'bow' },
        { seat: 'petruk', text: 'Hore! Hanoman hebat!', gesture: 'jump' },
        { seat: 'semar', text: 'Nah, anak-anak. Teman yang baik selalu menolong.', gesture: 'nod' },
        { seat: 'semar', text: 'Sampai jumpa di cerita berikutnya!', gesture: 'wave' },
      ],
    },
  ],
};
