import type { CapacitorConfig } from '@capacitor/cli';

// FAZ 0 NOTU: webDir "dist" (tam masaüstü arayüzü) hâlâ tamamen
// window.api.* (Electron IPC) çağrılarına bağlı — Capacitor'ın native
// kabuğunda böyle bir köprü yok, o yüzden dist'i olduğu gibi yüklersek
// giriş ekranında bile "window.api is undefined" hatasıyla karşılaşırız.
// Bunun düzgün çözümü (mobil tarafın verilere hep bir API sunucusu
// üzerinden erişmesi) Faz 1 işi. Şimdilik, gerçekten çalışan ve native
// kabukta anlamlı bir ilk açılış göstermek için server.url'i zaten
// fetch tabanlı çalışan barkod aracına (server/public-barkod) yönlendirdik
// — aynı bilgisayardaki telefon-test sunucusuna bağlanıyor. Tam uygulamaya
// geçince hem bu server.url kaldırılıp webDir tekrar "dist" olarak
// kullanılacak hem de src/ içindeki window.api çağrıları fetch'e taşınacak.
const config: CapacitorConfig = {
  appId: 'com.vitra.sitaservisplanlayici',
  appName: 'Sita Yapı',
  webDir: 'dist',
  server: {
    url: 'http://192.168.1.28:4173/barkod/',
    cleartext: true
  }
};

export default config;
