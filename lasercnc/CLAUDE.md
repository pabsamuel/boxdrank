# LazerHesap — proje notları (Claude için)

Bu klasör (`lasercnc/`) `boxdrank` reposunun içinde **bağımsız** bir statik web
uygulamasıdır. Reponun geri kalanıyla (Flask app, airsync, notionsync) ilgisi yoktur.

## Ne işe yarar
Lazer/CNC kesim için teklif & maliyet hesaplayıcı. Kullanıcı SVG/DXF yükler;
uygulama kesim uzunluğu, süre, ağırlık ve fiyatı hesaplar.

## Teknik özet
- **Yığın:** vanilla JS (ES modülleri), build adımı YOK, bağımlılık YOK.
- **Neden build yok:** tek bir statik sunucuyla (`python3 -m http.server`) çalışır,
  GitHub Pages'e olduğu gibi deploy edilir. Basitlik bilinçli bir tercih.

## Dosyalar
| Dosya | Sorumluluk |
|---|---|
| `index.html` | Arayüz iskeleti ve alanlar |
| `styles.css` | Tema (karanlık, responsive) |
| `app.js` | UI mantığı, olay bağlama, dosya yükleme |
| `parsers.js` | SVG (`getTotalLength`) + hafif DXF geometri çıkarımı |
| `pricing.js` | Malzeme tablosu, feed interpolasyonu, maliyet modeli — **saf fonksiyonlar** |
| `test.mjs` | `pricing.js` için node testleri (DOM'suz) |

## Önemli kurallar
- `pricing.js` DOM'a dokunmaz; test edilebilir kalsın. Yeni hesap mantığı buraya.
- Parser'lar `{ cutLengthMm, bbox, pierces, warnings }` döndürür; bu sözleşmeyi koru.
- Değişiklikten sonra: `node test.mjs` çalıştır. CI (`.github/workflows/lasercnc-pages.yml`)
  testler geçmeden deploy etmez.
- Yeni özellik ekleyince `test.mjs`'e de test ekle.

## Çalıştırma / test / deploy
```bash
npm run dev    # yerelde çalıştır (http://localhost:8000)
npm test       # testleri çalıştır
```
Deploy otomatik: `main` veya `claude/lazer-cnc-app-project-vex6ml` branch'ine push →
GitHub Actions testleri koşar → Pages'e yayınlar. Detay: KURULUM.md.

## Yol haritası
DXF görsel önizleme, nesting (fire minimizasyonu), çoklu parça/sipariş,
malzeme fiyatlarını localStorage'a kaydetme, resmi PDF teklif şablonu.
