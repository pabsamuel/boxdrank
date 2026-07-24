# Build Prompt — Nukon Fiber Lazer Mobil İzleme Paneli

Bu dosya, uygulamayı sıfırdan (yeniden) üretmek için kullanılan yapı promptudur.
Aynı prompt, ileride React Native/Flutter'a taşırken de referans spesifikasyondur.

## Görev
Nukon fiber lazer kesim makinesi için **mobil öncelikli izleme paneli** yap.
Telefonda (iPhone + Android) çalışan, kurulum gerektirmeyen bir **PWA** olsun.

## Zorunlu kurallar
1. **Salt görüntüleme.** Makineye komut gönderen hiçbir kontrol (başlat/jog/origin) OLMASIN.
   Duraklat/Durdur butonları görsel olarak "devre dışı / Nukon onayı gerekli" gösterilir.
2. Bağımlılık yok: tek başına çalışan HTML + CSS + JS. Çevrimdışı çalışsın (service worker).
3. Türkçe arayüz. Koyu tema, atölyede okunur yüksek kontrast, büyük dokunma hedefleri.
4. Gerçek API henüz yok → `MOCK` veri üreticisiyle canlı simülasyon (her ~2 sn güncelle).
   Kod, ileride `GET /api/status` gerçeğine kolayca bağlanacak şekilde ayrılmış olsun.

## Ekranlar / Bileşenler
- **Üst bar:** makine adı, bağlantı rozeti (Canlı/Simülasyon), son güncelleme saati.
- **Durum kartı:** büyük durum etiketi + renk (çalışıyor=yeşil, boşta=gri,
  duraklatıldı=sarı, alarm=kırmızı, bakım=mor, çevrimdışı=koyu).
- **Aktif iş kartı:** iş adı, dairesel ilerleme %, geçen/kalan süre, malzeme+kalınlık+gaz,
  parça sayacı (yapılan/toplam).
- **Sensör satırı:** gaz basıncı (bar), soğutucu (chiller) sıcaklığı, kapak durumu.
- **Uyarılar listesi:** seviye renkli (bilgi/uyarı/alarm), mesaj + saat.
- **Vardiya özeti:** çalışma süresi, biten iş, üretilen parça, OEE %.
- **Kontrol kartı (devre dışı):** Duraklat / Durdur butonları pasif + "Güvenlik: Nukon
  onayı ve operatör kilidi gerekir" notu.
- **Alt bilgi:** simülasyon uyarısı + "Gerçek makineye bağlı değil".

## Etkileşim
- Bildirim izni iste; iş bitince / alarm olunca yerel bildirim gönder (mümkünse).
- "Simülasyon senaryosu" düğmesi: alarm / iş bitti / gaz düşük senaryolarını tetikle
  (arayüzü göstermek için).

## Kalite
- Yalın, hızlı, tek dosyada okunur JS. Yorumlar Türkçe.
- Telefonda dikey ekranda mükemmel; yatayda ve tablette de bozulmasın.
- Erişilebilir: aria etiketleri, renk + metin birlikte (sadece renge güvenme).
