import { guideBriefing } from "../guideBriefing";

export default function GuideBriefingCard() {
  const imageUrl = guideBriefing.imgUrl.trim();

  return (
    <section className="guide-briefing" aria-labelledby="guide-briefing-title">
      <h2 id="guide-briefing-title" className="guide-briefing__title">
        세부 날씨 실시간 한줄 브리핑
      </h2>
      <p className="guide-briefing__date">{guideBriefing.date}</p>
      {imageUrl ? (
        <figure className="guide-briefing__figure">
          <img
            className="guide-briefing__img"
            src={imageUrl}
            alt="세부 현지 날씨 브리핑"
            loading="lazy"
            decoding="async"
          />
        </figure>
      ) : null}
      <p className="guide-briefing__text">{guideBriefing.text}</p>
      <style>{`
        .guide-briefing {
          margin-top: 1rem;
          text-align: left;
          background: var(--bg-card);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(236, 254, 255, 0.14);
          border-radius: var(--radius);
          padding: 1rem 1.05rem 1.05rem;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
        }
        .guide-briefing__title {
          margin: 0 0 0.35rem;
          font-size: 0.95rem;
          font-weight: 700;
          color: #ccfbf1;
          line-height: 1.35;
        }
        .guide-briefing__date {
          margin: 0 0 0.75rem;
          font-size: 0.72rem;
          font-weight: 500;
          color: var(--text-muted);
          letter-spacing: 0.02em;
        }
        .guide-briefing__figure {
          margin: 0 0 0.75rem;
        }
        .guide-briefing__img {
          display: block;
          width: 100%;
          max-height: 14rem;
          object-fit: cover;
          border-radius: 0.65rem;
          border: 1px solid rgba(236, 254, 255, 0.12);
        }
        .guide-briefing__text {
          margin: 0;
          font-size: 0.9rem;
          line-height: 1.65;
          color: var(--text);
          overflow-wrap: anywhere;
        }
      `}</style>
    </section>
  );
}
