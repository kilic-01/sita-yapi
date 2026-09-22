// Basit, marka renklerini (CSS değişkenleri) kullanan çizgisel SVG
// illüstrasyonlar. Vektör oldukları için her ekran çözünürlüğünde/DPI'da
// net görünürler ve tema (açık/koyu) değişince otomatik uyum sağlarlar.

export function EmptyStateIllustration({ size = 140 }) {
  return (
    <svg
      viewBox="0 0 200 160"
      width={size}
      height={(size * 160) / 200}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="40" y="30" width="120" height="100" rx="14" stroke="var(--border)" strokeWidth="3" />
      <path d="M40 56 H160" stroke="var(--border)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="58" cy="43" r="3" fill="var(--border)" />
      <circle cx="70" cy="43" r="3" fill="var(--border)" />
      <circle cx="100" cy="96" r="24" stroke="var(--accent)" strokeWidth="3" />
      <path d="M100 85v22M89 96h22" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

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
