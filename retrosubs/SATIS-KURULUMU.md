# Satisi acma — telefondan, koda dokunmadan

Uygulama hazir ve canli: **https://pabsamuel.github.io/boxdrank/**
Pro ekrani da hazir. Tek eksik **odeme linki**. Onu ben olusturamam: Stripe hesabi
senin kimligin, banka hesabin ve senin kabul ettigin sozlesmeyle acilir. Asagidaki
liste tam o kismi kapsiyor — telefondan, yaklasik 15 dakika.

---

## Simdiki durum

| Parca | Durum |
| --- | --- |
| Uygulama (tarayici) | Canli, calisiyor |
| Pro ekrani (SATIN AL / KODUM VAR) | Hazir |
| Pro kodu | Hazir: `RETROSUBS-PRO-2026` |
| Odeme linki | **Yok — bu dosyadaki adimlar bunu ekliyor** |

Link bos oldugu surece **SATIN AL butonu gorunmez**; Pro ekrani "satis henuz acik
degil, kodun varsa KODUM VAR'a bas" der. Yani yarim kurulumla kimse bos bir odeme
sayfasina dusmez.

---

## Adim 1 — Stripe hesabi (10 dk, bir kere)

1. Telefon tarayicisinda **stripe.com** → **Start now / Sign up**.
2. E-posta + sifre. E-postayi dogrula.
3. Ulke: **Turkiye**. Hesap tipi: **Individual** (sahis) yeterli.
4. Isteyecekleri: ad-soyad, dogum tarihi, adres, **TCKN**, **IBAN**, kisa bir
   "ne satiyorsun" aciklamasi.
   - Aciklama icin: `Mobile web app — retro styled live subtitle overlay. One-time
     digital unlock (Pro features).`
5. Onay gelene kadar **test modunda** bile link olusturabilirsin; gercek para icin
   hesabin aktif olmasi lazim.

> Stripe calismazsa: **Gumroad** veya **Lemon Squeezy** da olur. Ikisi de link
> veriyor; Adim 3'te o linki yapistirirsin, gerisi ayni.

---

## Adim 2 — Payment Link olustur (3 dk)

Stripe panelinde: **Product catalogue → + Add product**

| Alan | Deger (kopyala) |
| --- | --- |
| Name | `RetroSubs Pro` |
| Description | `Filigransiz foto ve video, iki ekstra cerceve. Tek seferlik.` |
| Price | `4.99` |
| Currency | `USD` |
| Billing | **One off** (abonelik degil) |

Kaydet → urunun yanindaki **⋯ → Create payment link** → **Create link**.

Sonra **ayni Payment Link sayfasinda**, odeme sonrasi ekrani ayarla:

- **After payment** → **Show confirmation page** → **Custom message**, su metni yapistir:

```
Tesekkurler! Pro kodun: RETROSUBS-PRO-2026

Uygulamada AYAR -> PRO KOD alanina yaz. Hemen acilir.
```

Link'i kopyala. Soyle gorunur: `https://buy.stripe.com/xxxxxxxxxxxx`

---

## Adim 3 — Linki uygulamaya yapistir (2 dk, telefondan)

Kod yazmak yok. Tek satir degisiyor.

1. Telefondan ac: **https://github.com/pabsamuel/boxdrank/blob/main/retrosubs/web/config.json**
2. Sag ustteki **kalem** simgesine bas (duzenle).
3. Sadece `buyUrl` satirinin tirnaklarinin arasina linki yapistir:

```json
{
  "buyUrl": "https://buy.stripe.com/xxxxxxxxxxxx",
  "price": "4,99 $",
  "proPitch": "Filigransiz foto ve video, iki ekstra cerceve."
}
```

4. Alta in → **Commit changes** → **Commit directly to the main branch** → onayla.
5. 1–2 dakika bekle (GitHub sayfayi yeniden yayinliyor), sonra uygulamayi ac:
   **AYAR → PRO AL**. **SATIN AL** butonu artik orada.

Fiyati degistirmek istersen `price` alanini da ayni yerden duzeltebilirsin —
uygulamada gorunen yazi odur. (Gercek tutar Stripe'ta yazdigin fiyattir; ikisini
ayni tut.)

Yayin bitti mi anlamak icin: uygulamada sol altta **surum rozeti** var.
Degisiklik sonrasi sayfayi bir kez yenile, `config.json` onbellege alinmiyor —
link aninda gelir.

---

## Dogrusunu soylemek gerekirse

- **Pro kodu bir guvenlik duvari degil.** Tek, paylasilabilir bir koddur; isteyen
  arkadasina verir. Bu bilincli bir tercih: hesap sistemi, sunucu, veritabani
  yok — yani aylik maliyet de yok, KVKK derdi de yok. Ilk 100 satista kayip
  ihmal edilebilir. Kisi-basi kod gerekirse `docs/05-MONETIZATION.md` icinde
  bir saatlik Cloudflare Worker + HMAC yolu yazili.
- **Parayi ben toplayamam.** Adim 1'i sadece sen yapabilirsin.
- **Kanal maliyetleri:** tarayici surumu **0 $**. Google Play'e koymak istersen
  tek seferlik **25 $**. App Store **yillik 99 $** — ve iOS'ta ekran-ustu katman
  yasak oldugu icin oraya girmenin teknik bir getirisi yok (`docs/00-FEASIBILITY.md`).
- **Beklenti:** 1000 kisi acarsa, bu tur bir uygulamada ~1–3'u oder. 4,99 $'dan
  5–15 $. Para kazanan sey uygulama degil, **dagitimi** olur: link paylasimi,
  TikTok/Reels'te cikan video (uygulamanin kayit butonu tam bunun icin var ve
  Pro'da filigran kalkiyor).

---

## Sonraki adim, satis acildiktan sonra

1. Kendi telefonundan **test modunda** bir odeme yap, onay sayfasinda kodun
   ciktigini gor, uygulamada gir.
2. Bir kayit al (uygulamada **● KAYIT**), paylas, linki altina koy.
3. Gelen ilk gercek odemeden sonra Stripe panelinde **payout** tarihini kontrol et.
