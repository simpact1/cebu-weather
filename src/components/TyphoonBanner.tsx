import type { TyphoonStatus } from "../typhoon";

const FORCE_HIDE_TYPHOON_BANNER = false;

const DIRECT_BANNER_LINK =
  "https://m.blog.naver.com/PostList.naver?blogId=aalove0902&categoryNo=16";

type TyphoonBannerProps = {
  status: TyphoonStatus;
  typhoonName?: string;
};

function buildBannerText(status: "direct" | "indirect", typhoonName?: string): string {
  const label = typhoonName?.trim() ? `태풍 ${typhoonName.trim()}` : "태풍";
  if (status === "direct") {
    return `🌀 ${label} 세부 직접영향 예상 — 실시간 현지 소식 확인하기`;
  }
  return `🌀 ${label} 간접영향 가능 — 아래 태풍 정보를 참고하세요`;
}

function scrollToTyphoonSection() {
  document.getElementById("typhoon")?.scrollIntoView({ behavior: "smooth" });
}

export default function TyphoonBanner({ status, typhoonName }: TyphoonBannerProps) {
  if (FORCE_HIDE_TYPHOON_BANNER) return null;

  const bannerTest = new URLSearchParams(window.location.search).get("bannerTest");
  const effectiveStatus: TyphoonStatus =
    bannerTest === "direct" ? "direct" : bannerTest === "indirect" ? "indirect" : status;
  if (
    effectiveStatus === "loading" ||
    effectiveStatus === "no-impact" ||
    effectiveStatus === "error"
  ) {
    return null;
  }

  const bannerText = buildBannerText(effectiveStatus, typhoonName);
  const variantClass =
    effectiveStatus === "direct" ? "typhoon-banner--direct" : "typhoon-banner--indirect";

  const anchorProps =
    effectiveStatus === "direct"
      ? {
          href: DIRECT_BANNER_LINK,
          target: "_blank" as const,
          rel: "noopener noreferrer",
        }
      : {
          href: "#typhoon",
          onClick: (e: React.MouseEvent<HTMLAnchorElement>) => {
            e.preventDefault();
            scrollToTyphoonSection();
          },
        };

  return (
    <a
      {...anchorProps}
      className={`typhoon-banner ${variantClass}`}
      aria-label={bannerText}
    >
      <span className="typhoon-banner__viewport">
        <span className="typhoon-banner__track">
          <span className="typhoon-banner__text">{bannerText}</span>
          <span className="typhoon-banner__text" aria-hidden="true">
            {bannerText}
          </span>
        </span>
      </span>
      <style>{`
        .typhoon-banner {
          display: block;
          width: 100%;
          overflow: hidden;
          color: #fff;
          text-decoration: none;
          font-size: 0.875rem;
          font-weight: 600;
          line-height: 1.25;
          padding: 0.55rem 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.2);
        }
        .typhoon-banner--direct {
          background: linear-gradient(
            90deg,
            #991b1b 0%,
            var(--danger) 50%,
            #991b1b 100%
          );
        }
        .typhoon-banner--direct:hover,
        .typhoon-banner--direct:focus-visible {
          background: linear-gradient(
            90deg,
            #7f1d1d 0%,
            var(--danger) 50%,
            #7f1d1d 100%
          );
          outline: none;
        }
        .typhoon-banner--indirect {
          background: linear-gradient(
            90deg,
            #c2410c 0%,
            var(--accent-orange) 50%,
            #c2410c 100%
          );
        }
        .typhoon-banner--indirect:hover,
        .typhoon-banner--indirect:focus-visible {
          background: linear-gradient(
            90deg,
            #9a3412 0%,
            var(--accent-orange) 50%,
            #9a3412 100%
          );
          outline: none;
        }
        .typhoon-banner__viewport {
          display: block;
          overflow: hidden;
          width: 100%;
        }
        .typhoon-banner__track {
          display: flex;
          width: max-content;
          animation: typhoon-banner-scroll 28s linear infinite;
        }
        .typhoon-banner__text {
          flex: 0 0 auto;
          white-space: nowrap;
          padding-right: 3rem;
        }
        @keyframes typhoon-banner-scroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .typhoon-banner__track {
            animation: none;
            width: 100%;
            justify-content: center;
          }
          .typhoon-banner__text:last-child {
            display: none;
          }
        }
      `}</style>
    </a>
  );
}
