import Link from "next/link";

import { BRAND_LOGO } from "@/lib/brand-logo";
import { APP_NAME } from "@/lib/site";

const LABEL = `${APP_NAME}. Pokémon cards for Yoto MYO`;

export function BrandLogo({
  layout,
  className,
  alt = APP_NAME,
}: {
  layout: "vertical" | "horizontal" | "compact";
  className?: string;
  alt?: string;
}) {
  return (
    <img
      src={BRAND_LOGO[layout]}
      alt={alt}
      className={className ?? `pk-logo pk-logo-${layout}`}
      draggable={false}
    />
  );
}

function BrandPair() {
  return (
    <>
      <BrandLogo layout="horizontal" className="pk-logo pk-logo-horizontal" alt="" />
      <BrandLogo layout="compact" className="pk-logo pk-logo-compact-header" alt="" />
    </>
  );
}

export function BrandHomeButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="pk-brand" aria-label={LABEL} onClick={onClick}>
      <BrandPair />
    </button>
  );
}

export function BrandHomeLink({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="pk-brand" aria-label={LABEL}>
      <BrandPair />
    </Link>
  );
}

export function BrandPosterLink({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="pk-brand" aria-label={LABEL}>
      <BrandLogo layout="vertical" className="pk-logo pk-logo-hero" alt="" />
    </Link>
  );
}
