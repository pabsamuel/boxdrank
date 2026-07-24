# Nukon Fiber Lazer — Mobil İzleme Paneli 📱🔥

Nukon fiber lazer kesim makinesi için **telefonda çalışan izleme paneli** (PWA).
iPhone ve Android'de, uygulama mağazası olmadan çalışır. Şu an **simülasyon
verisiyle** demo modundadır; gerçek makineye köprü servisiyle bağlanır.

> ⚠️ **Salt görüntüleme.** Bu uygulama makineye komut göndermez. Fiber lazerle
> uzaktan iş başlatmak tehlikelidir; bkz. `PLAN.md` güvenlik notları.

## Dosyalar
| Dosya | Açıklama |
|-------|----------|
| `PLAN.md` | Proje planı: mimari, yol haritası, API sözleşmesi, güvenlik |
| `PROMPT.md` | Uygulamayı üreten yapı promptu / spesifikasyon |
| `index.html`, `style.css`, `app.js` | Uygulamanın kendisi |
| `manifest.webmanifest`, `sw.js` | PWA (ana ekrana ekleme + çevrimdışı) |
| `assets/` | İkonlar |

## Çalıştırma (bilgisayarda test)
```bash
cd laser-monitor
python3 -m http.server 8080
# tarayıcıda: http://localhost:8080
```

## Telefonda kullanma
1. Bilgisayar ve telefon aynı Wi-Fi'de olsun.
2. Bilgisayarda yukarıdaki sunucuyu başlat, IP adresini öğren (örn. `192.168.1.20`).
3. Telefonun tarayıcısında `http://192.168.1.20:8080` aç.
4. **Ana ekrana ekle** → uygulama gibi açılır.

## Gerçek makineye bağlama
`app.js` içindeki ana döngüyü, köprü servisinin verdiği API'ye bağla:
```js
setInterval(() =>
  fetch('/api/status').then(r => r.json()).then(render), 2000);
```
API sözleşmesi `PLAN.md` içinde. Köprü seçenekleri: Nukon resmi izleme API'si,
Raspberry Pi sinyal okuyucu, ya da CypCut log okuma.

## Demo senaryoları
Alttaki düğmelerle Kesim / İş Bitti / Gaz Düşük / Alarm / Boşta durumlarını
tetikleyip arayüzün nasıl tepki verdiğini görebilirsin.
