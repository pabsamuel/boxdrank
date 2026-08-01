# 🚀 Sıfırdan Canlıya — Adım Adım Kurulum

İlk kez app yayınlıyorsan bu rehber tam sana göre. Hiçbir adımı atlama, sırayla git.
Sonunda **herkesin tıklayabileceği canlı bir link** olacak (CV'ne koyabilirsin).

---

## Bölüm 1 — Bilgisayarında çalıştır (isteğe bağlı ama önerilir)

Yayınlamadan önce kendi bilgisayarında görmek için.

### Gerekenler
- Bir tarayıcı (Chrome/Edge/Firefox)
- Python 3 (çoğu bilgisayarda hazır gelir) **ya da** Node.js

### Adımlar
1. Bir terminal (komut istemi) aç.
2. Proje klasörüne gir:
   ```bash
   cd lasercnc
   ```
3. Küçük bir sunucu başlat:
   ```bash
   python3 -m http.server 8000
   ```
   > Not: Doğrudan `index.html`'e çift tıklama **çalışmaz** — uygulama ES modülleri
   > kullanıyor, bunlar sunucu üzerinden servis edilmeli. Bu yüzden yukarıdaki komut şart.
4. Tarayıcıda şunu aç: **http://localhost:8000**
5. `ornek.svg` dosyasını yükleyip test et. 🎉

Durdurmak için terminalde `Ctrl + C`.

---

## Bölüm 2 — İnternete yayınla (GitHub Pages)

Repoda hazır bir **otomatik deploy sistemi** var (`.github/workflows/lasercnc-pages.yml`).
Sen sadece **tek seferlik bir ayar** yapıyorsun, gerisi kendi kendine oluyor.

### Adım 1 — Kodu GitHub'a gönder
Bu zaten yapıldıysa geç. Yapılmadıysa:
```bash
git add .
git commit -m "LazerHesap"
git push
```

### Adım 2 — Pages'i "GitHub Actions" moduna al (tek seferlik)
1. GitHub'da repo sayfanı aç.
2. Üstten **Settings** (Ayarlar) sekmesine tıkla.
3. Sol menüden **Pages**'e tıkla.
4. **Build and deployment → Source** kısmında açılır menüden
   **"GitHub Actions"** seç. (Kaydet demene gerek yok, seçince yeterli.)

### Adım 3 — Deploy'un çalışmasını bekle
1. Repoda üstten **Actions** sekmesine tıkla.
2. **"LazerHesap Deploy"** adında bir çalışma göreceksin (sarı nokta = çalışıyor).
3. Yeşil tik olunca bitti. Genelde 1–2 dakika sürer.

### Adım 4 — Linkini al
- Tekrar **Settings → Pages**'e dön. En üstte
  **"Your site is live at https://KULLANICI-ADIN.github.io/boxdrank/"** yazacak.
- O link senin canlı uygulaman. Paylaş, CV'ne koy. ✅

> **Not:** Bu proje `boxdrank` reposunun içinde `lasercnc/` klasöründe.
> Workflow sadece bu klasörü yayınladığı için link doğrudan uygulamayı açar.

---

## Sık karşılaşılan sorunlar

| Sorun | Çözüm |
|---|---|
| Actions'ta "LazerHesap Deploy" hiç görünmüyor | Adım 2'yi (Source: GitHub Actions) yaptığından emin ol. |
| Deploy kırmızı/başarısız | Actions → çalışmaya tıkla → hangi adımın kaldığına bak. Testler kaldıysa `node test.mjs`'i yerelde çalıştır. |
| "Branch not allowed to deploy" hatası | Settings → Environments → `github-pages` → izinli branch'lere kendi branch'ini ekle, **veya** kodu `main`'e birleştir. |
| Sayfa açılıyor ama boş | Tarayıcıda F12 → Console'a bak; genelde dosya yolu hatasıdır. |
| Yükleme sonrası hesap değişmiyor | Sağ paneldeki değerler otomatik güncellenir; sayfayı yenile (Ctrl+F5). |

---

## Sonrası: değişiklik yapınca ne olur?
Her `git push` sonrasında (lasercnc/ içinde bir şey değiştiyse) sistem otomatik olarak
testleri çalıştırır ve siteyi yeniden yayınlar. Elle bir şey yapmana gerek yok. 🔁
