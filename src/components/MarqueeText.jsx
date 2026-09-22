import { useEffect, useRef, useState } from "react";

// Bir etiket kendi alanına sığmadığında (ör. "Firmalardan Gelen
// Siparişler" gibi uzun sekme adları) sessizce kırpmak yerine, üzerine
// gelindiğinde soldan sağa kayıp geri dönerek TAM metni gösterir. Sığan
// kısa etiketlerde taşma sıfır olduğu için hiçbir şey kımıldamaz.
//
// `maxWidth` verilirse (Header'daki dock etiketi gibi hover'da 0'dan
// genişleyen bir kutu — gerçek genişliği collapse animasyonu yüzünden
// güvenilir ölçülemez) o sabit CSS değerine göre hesaplanır; verilmezse
// (Sidebar gibi genişliği sabit, animasyonsuz bir kutu) kendi kutusunun
// gerçek (render edilmiş) genişliği ölçülür.
export default function MarqueeText({ text, maxWidth, className }) {
  const containerRef = useRef(null);
  const textRef = useRef(null);
  const [distance, setDistance] = useState(0);

  useEffect(() => {
    function measure() {
      const textEl = textRef.current;
      if (!textEl) return;
      const available = maxWidth ?? containerRef.current?.clientWidth ?? 0;
      const diff = textEl.scrollWidth - available;
      setDistance(diff > 0 ? diff : 0);
    }
    measure();
    if (!maxWidth) {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
  }, [text, maxWidth]);

  return (
    <span ref={containerRef} className={`marquee${className ? ` ${className}` : ""}`}>
      <span ref={textRef} className="marquee-text" style={{ "--marquee-distance": `-${distance}px` }}>
        {text}
      </span>
    </span>
  );
}
