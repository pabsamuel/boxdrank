# RetroSubs — para modeli

Bu doküman **ne satılabilir, ne satılamaz** ve ilk parayı en kısa yoldan nasıl alırsın onu anlatır.
Kod tarafında ücretsiz/Pro ayrımı uçtan uca bağlı; eksik olan tek şey senin ödeme linkin.

---

## 1. Ürün ne satıyor

Satılan şey "altyazı" değil — **nostalji ve paylaşılabilir an**. İnsanlar bunu TikTok/Instagram'a
koyduğu için yayılır. O yüzden para modelinin merkezi **dışa aktarma**:

| | Ücretsiz | Pro |
|---|---|---|
| Canlı retro diyalog kutusu | ✅ | ✅ |
| Vibe modu (kana / latin) | ✅ | ✅ |
| Gerçek konuşma tanıma | ✅ | ✅ |
| Ön kamera arka plan | ✅ | ✅ |
| **Foto / video dışa aktarma** | ✅ **filigranlı** | ✅ filigransız |
| Çerçeve renkleri | klasik | klasik + zümrüt + altın (+ sonraki temalar) |
| Konuşan ismi | ✅ | ✅ |

Filigran bilerek böyle: ücretsiz kullanıcı paylaştıkça reklamını yapar, rahatsız olan öder.
Klasik ve işleyen model.

---

## 2. Fiyat

- **Tek seferlik 4,99 $** (Türkiye'de Stripe yerel fiyatlandırmayla ~150-200 ₺ gösterir).
- Abonelik **önerilmez**: sürekli maliyetin yok (her şey cihazda çalışıyor), abonelik satmak için
  sürekli yeni değer üretmen gerekir. Tek seferlik satış bu üründe hem dürüst hem kolay.
- İleride bulut tanıma (daha iyi doğruluk) eklersen **o zaman** aylık plan mantıklı olur:
  bulut STT saati 0,15–0,60 $ arası, yani kullanım başına gerçek maliyetin olur.

---

## 3. İlk parayı almanın en kısa yolu (uyanınca ~15 dakika)

1. **stripe.com** → hesap aç → **Payment Links** → "RetroSubs Pro", tek seferlik 4,99 $.
2. Ödeme sonrası yönlendirme sayfasına (**after payment → confirmation page**) şu metni yaz:
   `PRO kodun: RETROSUBS-PRO-2026 — uygulamada AYAR > PRO KOD alanına yapıştır.`
3. `retrosubs/web/index.html` içinde `PRO KOD` alanının yanına ödeme linkini koy (aşağıdaki
   "yapılacak" maddesi) ya da bana söyle, ben koyayım.
4. Linki paylaş. Satış olduğunda Stripe sana mail atar, kod otomatik gider.

Bu haliyle **gerçek para alırsın**. Tek kusuru: kod herkeste aynı, paylaşılabilir.

### Kod paylaşılmasını engelleme (gerektiğinde, ~1 saat)

Şu anki Pro bayrağı `localStorage`'da duruyor ve **güvenlik sınırı değil** — isteyen konsoldan
açar. Bilerek böyle bırakıldı: para akmadan önce sunucu yazmak gereksiz. Satış düzenli hale
gelince şu yükseltme yeterli:

- Cloudflare Worker (ücretsiz katman) → Stripe webhook'unu dinler, her ödemeye özel bir lisans
  üretir: `base64(email + sure) + HMAC-SHA256(gizli anahtar)`.
- Uygulama kodu Worker'a sorar, cevap imzalıysa Pro açılır, cevabı 30 gün önbelleğe alır.
- Kırmak isteyen yine kırar (istemci tarafı her zaman kırılabilir) ama kodu WhatsApp'tan
  arkadaşına yollamak işe yaramaz. Bu ürün için yeterli seviye budur.

---

## 4. Dağıtım: nereden kullanıcı gelir

| Kanal | Maliyet | Not |
|---|---|---|
| **Web (şu anki)** | 0 $ | Kurulum yok, link paylaşılır, iOS'ta da çalışır. Asıl büyüme burada. |
| **Google Play** | 25 $ tek seferlik | Android uygulaması zaten var (`retrosubs/android`), overlay özelliği webde olmayan asıl değer. |
| **App Store** | 99 $/yıl | iOS'ta overlay **mümkün değil**; mağazaya koyacağın şey tam ekran sürüm. Yıllık 99 $'ı ancak web sürümü tutarsa öde. |
| **TikTok/Reels** | 0 $ | Ürünün kendisi içerik üretiyor: filigranlı klipler. İlk 20 videoyu kendin at. |

**Sıra önerisi:** web'i paylaş → tutarsa Play Store → tutmazsa App Store'a para verme.

---

## 5. Gerçekçi beklenti

Tahmin değil, aralık veriyorum; novelty (yeni/eğlencelik) araçlarda tipik olan:

- Paylaşılan klipten gelen ziyaretçinin **%10-30'u** uygulamayı bir kez açar.
- Açanların **%1-3'ü** ödeme yapar (eğlencelik üründe bu üst sınırdır).
- Yani 10.000 ziyaretçi ≈ 2.000 aktif ≈ 20-60 satış ≈ **100-300 $**.

Bunun anlamı: tek bir viral klip birkaç yüz dolar getirir, düzenli gelir için **düzenli içerik**
gerekir. Ürünü bitirmek yetmez, paylaşmak lazım — orası sende.

---

## 6. Yasal: bunu atlama

Uygulama **başkalarının konuşmasını** yazıya döküyor ve kaydedebiliyor.

- Türkiye'de KVKK, Avrupa'da GDPR açısından: kayıt **cihazdan çıkmıyor**, sunucuya gitmiyor —
  bu senin lehine, gizlilik metninde bunu açıkça yaz.
- İki taraflı rıza: bazı ülkelerde (ve çoğu mağaza politikasında) karşı tarafın haberi olmadan
  ses kaydetmek yasak. Uygulamada kutunun açıkça görünür olması ve klibin paylaşılırken
  görünmesi bu açıdan iyi; yine de mağazaya koyarken **"karşındakine söyle"** uyarısı ekle.
- App Store / Play, mikrofon ve kamera için gerekçe metni ister: "konuşmayı ekrandaki diyalog
  kutusuna yazmak için" yeterli ve doğru.

---

## 7. Yapılacaklar (kodda hazır, senin kararın bekleniyor)

- [ ] Stripe Payment Link'i oluştur, linki `index.html` içindeki PRO alanına ekle.
- [ ] Gizlilik metni sayfası (tek paragraf yeter: hiçbir ses/metin cihazdan çıkmıyor).
- [ ] Play Store listesi (25 $), ekran görüntüleri uygulamadan FOTO CEK ile alınabilir.
- [ ] Satış düzenliyse: Worker + imzalı lisans (bölüm 3).
