import { version } from "../../package.json";

export default function Splash({ isDark }) {
  return (
    <div className="splash">
      <img src={isDark ? "./logo-white.svg" : "./logo.svg"} alt="Sita Yapı" />
      <span className="splash-version">v{version}</span>
    </div>
  );
}
