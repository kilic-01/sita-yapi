// unDraw'dan (undraw.co, açık kaynak/ücretsiz lisans) marka rengimize
// (--teal-1: #3EACA7) göre yeniden renklendirilmiş illüstrasyonlar —
// önceden tüm boş-liste ekranlarında tek bir elle çizilmiş ikon tekrar
// ediyordu, artık bağlama uygun birkaç farklı illüstrasyon var.
import emptySrc from "../assets/illustrations/undraw-empty.svg";
import carRepairSrc from "../assets/illustrations/undraw-car-repair.svg";
import chattingSrc from "../assets/illustrations/undraw-chatting.svg";
import noDataSrc from "../assets/illustrations/undraw-no-data.svg";
import vacationSrc from "../assets/illustrations/undraw-vacation.svg";
import teamSrc from "../assets/illustrations/undraw-team.svg";

function illustration(src) {
  return function Illustration({ size = 140 }) {
    return <img src={src} alt="" width={size} style={{ maxWidth: "100%", height: "auto" }} />;
  };
}

// Genel amaçlı boş-liste illüstrasyonu.
export const EmptyStateIllustration = illustration(emptySrc);
// Araçlar sekmesi gibi konuya özel boş durumlar için.
export const CarRepairIllustration = illustration(carRepairSrc);
// Mesajlar panelinde henüz hiç mesaj yokken.
export const ChattingIllustration = illustration(chattingSrc);
// Grafik/rapor için yeterli veri yokken (yakıt grafiği, aktivite kaydı).
export const NoDataIllustration = illustration(noDataSrc);
// Tatil/izin listeleri boşken.
export const VacationIllustration = illustration(vacationSrc);
// Çalışan listesi boşken.
export const TeamIllustration = illustration(teamSrc);

export function WelcomeIllustration({ size = 96 }) {
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M60 18c-14 18-22 31-22 43a22 22 0 1044 0c0-12-8-25-22-43z"
        stroke="var(--accent)"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <circle cx="60" cy="63" r="8" stroke="var(--accent)" strokeWidth="4" />
      <circle cx="60" cy="63" r="42" stroke="var(--border)" strokeWidth="2" opacity="0.6" />
    </svg>
  );
}
