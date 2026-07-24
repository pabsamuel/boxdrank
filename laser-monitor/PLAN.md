# Nukon Fiber Lazer — Mobil İzleme Uygulaması / Proje Planı

> Kısa özet: Nukon fiber lazer kesim makinesi için telefondan **izleme ve takip**
> yapılan bir mobil uygulama. Uzaktan kesim başlatma **bilinçli olarak dışarıda
> bırakılmıştır** (yangın/yaralanma riski + yasal sorumluluk + CypCut kapalı API).

---

## 1. Amaç ve Kapsam

**Operatörün derdi:** Makinenin başında sürekli durmadan; durumu, iş ilerlemesini
ve alarmları telefondan görmek. Vardiya/üretim raporlarını tutmak.

### Kapsam (v1)
- ✅ Canlı makine durumu (çalışıyor / boşta / duraklatıldı / alarm / bakım)
- ✅ Aktif iş: isim, ilerleme %, geçen/kalan süre, sac tipi/kalınlığı, gaz
- ✅ Anlık uyarılar ve bildirimler (iş bitti, alarm, gaz basıncı düşük, kapak)
- ✅ İş geçmişi / vardiya raporu (parça sayısı, çalışma saati, kullanılan gaz)
- ✅ Basit OEE göstergesi (kullanılabilirlik / performans)
- ⚠️ Duraklat / Durdur butonları — **sadece Nukon onayı + fiziksel güvenlik
  kilidi (operatör makinede) ile** eklenir. v1'de "salt görüntüleme".

### Kapsam DIŞI (bilerek)
- ❌ Uzaktan kesim/iş başlatma
- ❌ Uzaktan jog / origin / eksen hareketi
- ❌ CypCut'a doğrudan komut yazma

---

## 2. Mimari

```
[ Nukon Makinesi ]                [ Köprü / Bridge ]           [ Telefon ]
 CypCut PC (Windows)     ─────►    Raspberry Pi veya     ─────► PWA / Uygulama
 FSCUT kartı + BCS100             küçük servis (API)             (bu proje)
 PLC / röle sinyalleri            durum -> JSON                  durumu gösterir
```

**Veri kaynağı seçenekleri (öncelik sırası):**
1. **Nukon/Friendess resmi bulut/izleme API'si** — varsa en temiz yol. Bayiden sor.
2. **Sinyal okuyucu kutu** — makinenin PLC/röle çıkışlarını (çalışıyor, alarm, iş
   bitti) okuyan Raspberry Pi. Sadece OKUMA → güvenli.
3. **CypCut log okuma** — kontrol PC'sindeki üretim log dosyalarını okuyan servis.

**Bu depodaki uygulama** köprünün sunacağı basit bir JSON API'yi tüketir:
`GET /api/status` → `{ state, job, progress, alerts, shift }`. API henüz yokken
uygulama **simülasyon modunda** (mock veri) çalışır; böylece arayüz hemen test edilir.

### API sözleşmesi (öneri)
```json
{
  "state": "running",              // running|idle|paused|alarm|maintenance|offline
  "machine": "Nukon Vento 3015",
  "updatedAt": "2026-07-24T10:15:00Z",
  "job": {
    "name": "kapak-2mm-304.nc",
    "progress": 0.62,              // 0..1
    "elapsedSec": 540,
    "remainingSec": 330,
    "material": "304 Paslanmaz",
    "thicknessMm": 2,
    "gas": "Azot",
    "partsDone": 18,
    "partsTotal": 30
  },
  "sensors": { "gasPressureBar": 14.2, "coverClosed": true, "chillerTempC": 27.5 },
  "alerts": [ { "level": "warning", "code": "GAS_LOW", "msg": "Azot basıncı düşük", "at": "..." } ],
  "shift": { "runtimeSec": 21600, "jobsDone": 12, "partsDone": 240, "oee": 0.78 }
}
```

---

## 3. Teknoloji Seçimi

- **Platform:** PWA (mobil web uygulaması). iPhone **ve** Android'de çalışır, uygulama
  mağazası gerekmez, telefonun ana ekranına "uygulama gibi" eklenir. En hızlı ve tek
  kod tabanı. (İleride istenirse aynı arayüz React Native/Flutter'a taşınabilir.)
- **Bağımlılık yok:** saf HTML + CSS + JS (çevrimdışı çalışır, service worker).
- **Türkçe arayüz**, koyu tema (atölye ortamına uygun, yüksek kontrast).

---

## 4. Yol Haritası (Faz Faz)

| Faz | İçerik | Durum |
|-----|--------|-------|
| **0** | Bu plan + prompt + **çalışan demo panel (mock veri)** | ✅ bu teslimat |
| 1 | Nukon bayiden resmi izleme/API bilgisi toplama | ⏳ kullanıcı |
| 2 | Köprü cihazı (Raspberry Pi) + gerçek `/api/status` servisi | ⏳ |
| 3 | Push bildirimleri (iş bitti / alarm) | ⏳ |
| 4 | Çoklu makine, kullanıcı/vardiya girişi, uzun dönem rapor | ⏳ |
| 5 | (Opsiyonel, Nukon onayıyla) güvenli Duraklat/Durdur | ⏳ |

---

## 5. Güvenlik / Sorumluluk Notları
- Uzaktan iş başlatma **yok**. Fiber lazer yanında operatör olmadan çalıştırılmaz.
- Kontrol butonları (duraklat/durdur) ancak: (a) Nukon resmi arayüzü, (b) makinede
  fiziksel operatör kilidi, (c) yerel ağ + kimlik doğrulama şartlarıyla düşünülür.
- Uygulama başta **salt görüntüleme** olduğu için makineye hiçbir risk getirmez.

---

## 6. Sonraki Adım (kullanıcı için)
1. Nukon bayine sor: **"Makinenin resmi uzaktan izleme / API özelliği var mı?"**
2. Demo paneli telefonunda aç, ekranları gör, "şu da olsun" dediklerini not al.
3. Karar: köprü cihazı yolu mu, resmi API yolu mu?
