# LazerHesap — Lazer Kesim Teklif & Maliyet Hesaplayıcı

Tarayıcıda çalışan, kurulum gerektirmeyen bir **lazer kesim fiyatlandırma aracı**.
Bir SVG/DXF çizimini yükle → uygulama kesim geometrisini okur ve
**kesim süresi, malzeme ağırlığı ve teklif fiyatını** anında hesaplar.

> Portföy projesi. Backend yok, veri hiçbir yere gönderilmez — her şey senin tarayıcında çalışır.

## Neden bu proje?

Bir lazer/CNC atölyesinde teklif vermek genelde Excel'de elle yapılır ve hataya açıktır.
Bu araç o işi otomatikleştirir ve şunları gösterir:

- **Alan bilgisi:** malzeme feed rate'leri, pierce (delme) süreleri, yoğunluk/fire hesabı
- **Geometri işleme:** SVG için tarayıcının `getTotalLength()` motoru, DXF için elle yazılmış hafif parser
- **Temiz, bağımlılıksız ön yüz:** vanilla JS + ES modülleri, build adımı yok

## Özellikler

- 📂 **SVG & DXF yükleme** (sürükle-bırak) → kesim uzunluğu + sınırlayıcı kutu otomatik
- 🔩 Malzeme presetleri: yumuşak çelik, paslanmaz, alüminyum, pleksi, MDF
- ⚙️ Kalınlığa göre kesim hızı (lineer interpolasyon)
- 💰 Maliyet dökümü: malzeme + makine süresi + kurulum + kâr marjı + fire
- 🧾 Teklifi kopyala / PDF olarak yazdır
- 🌙 Karanlık, responsive arayüz

## Çalıştırma & Deploy

> 🔰 **İlk kez app yayınlıyorsan:** adım adım Türkçe rehber → **[KURULUM.md](KURULUM.md)**

Hızlı özet — yerelde çalıştır (ES modülleri `file://` ile çalışmaz, sunucu şart):

```bash
cd lasercnc
npm run dev            # = python3 -m http.server 8000
# tarayıcıda: http://localhost:8000 → ornek.svg'yi yükle
npm test               # hesap mantığını test et
```

**Canlıya alma:** repoda hazır otomatik deploy var
(`.github/workflows/lasercnc-pages.yml`). Tek seferlik ayar: **Settings → Pages →
Source: "GitHub Actions"**. Sonra her push testleri koşar ve siteyi yayınlar.
Tam anlatım [KURULUM.md](KURULUM.md)'de.

## Dosya yapısı

```
lasercnc/
├── index.html     arayüz
├── styles.css     tema
├── app.js         UI mantığı, olay bağlama
├── parsers.js     SVG + DXF geometri çıkarımı
├── pricing.js     malzeme tablosu + maliyet modeli
└── ornek.svg      test dosyası
```

## Yol haritası (CV'de "gelecek planları" diye anlatılır)

- [ ] DXF için görsel önizleme (canvas'a çizim)
- [ ] Sac üzerine **nesting** (parçaları yerleştirip fire minimizasyonu)
- [ ] Çoklu parça / sipariş listesi ve toplam sac hesabı
- [ ] Malzeme fiyatlarını kaydetme (localStorage) ve profil
- [ ] Teklifi resmi PDF şablonuna dökme

## Notlar

Feed rate ve fiyat değerleri tipik başlangıç değerleridir; kendi makinene/tedarikçine
göre `pricing.js` içinden güncelle.
