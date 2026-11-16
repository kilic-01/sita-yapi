# TV kanalı güvenliği (özel kanal + eşleştirme)

## Neden
TV uygulaması (APK) GitHub'da herkese açık; içindeki Supabase **publishable**
anahtarı herkes görebilir. Eskiden `tv-yayin` kanalı açıktı: anahtarı bilen
biri TV'ye içerik gönderebilir, TV'ye gidenleri (teklif, rota) dinleyebilir,
kendini TV gibi gösterebilirdi.

## Nasıl çalışıyor
- `tv-yayin` artık **özel** kanal. Supabase yalnız şu iki kimliğe izin verir:
  - masaüstü ve mobil API sunucusu (servis anahtarı — RLS'yi aşar),
  - **eşleştirilmiş TV hesapları** (Supabase Auth, `app_metadata.role = "tv"`).
- Aynı adlı açık kanal ayrı bir kanaldır; oraya giren TV'lere ulaşamaz
  (DEV'de denendi, 2026-11-16).
- **Eşleştirme:** eşleşmemiş TV ekranda 6 haneli kod gösterir. Masaüstünde
  *Ayarlar > TV Ekranları*'nda aynı kod görünür; yönetici kodları
  karşılaştırıp **Eşleştir**'e basar. Masaüstü TV için hesap açar (rastgele
  şifre) ve bilgileri yalnız o TV'nin çözebileceği şekilde (ECDH P-256 +
  AES-256-GCM) açık `tv-eslestirme` kanalından yollar. Kod, TV'nin açık
  anahtarının özetidir; araya giren biri kendi anahtarını koyarsa kod farklı
  çıkar.
- TV bilgileri cihazda Android Keystore ile şifreli saklar; erişim anahtarını
  süresi dolmadan yeniler.
- **Eşleşmeyi kaldır** (masaüstü): TV hesabı silinir, TV eşleştirme ekranına
  döner. Silinen hesabın elindeki erişim anahtarı en geç 1 saatte geçersizleşir.
- TV hesapları: `tv-<tvId>@tv.sita-yapi.invalid` (gerçek e-posta değil).

## Supabase'e eklenecek kurallar (SQL Editor)
Önce **DEV**, denendikten sonra **PROD** (yalnız onayla). Başka hiçbir ayar
değişmez; Realtime'daki "public access" açık kalır (masaüstünün diğer canlı
kanalları için).

```sql
-- tv-yayin özel kanalı: yalnız eşleştirilmiş TV hesapları dinleyebilir ...
create policy "tv-yayin: eslesmis TV dinler"
on realtime.messages for select to authenticated
using (
  realtime.topic() = 'tv-yayin'
  and realtime.messages.extension in ('broadcast', 'presence')
  and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'tv'
);

-- ... ve gönderebilir (hello, shown onayı, presence).
create policy "tv-yayin: eslesmis TV gonderir"
on realtime.messages for insert to authenticated
with check (
  realtime.topic() = 'tv-yayin'
  and realtime.messages.extension in ('broadcast', 'presence')
  and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'tv'
);
```

Geri almak için:
```sql
drop policy "tv-yayin: eslesmis TV dinler" on realtime.messages;
drop policy "tv-yayin: eslesmis TV gonderir" on realtime.messages;
```

## Yayın sırası
Masaüstü v1.1.16, TV 1.0.2 ve mobil API sunucusu (Render) **aynı gün**:
eski masaüstü (1.1.15) açık kanala, yenisi özel kanala yayın yapar.
1. PROD'a kurallar eklenir.
2. Masaüstü 1.1.16 ve TV 1.0.2 yayınlanır; Render yeniden dağıtılır.
3. TV güncellenince eşleştirme ekranı çıkar → masaüstünden eşleştirilir.
