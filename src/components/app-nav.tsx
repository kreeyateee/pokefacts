"use client";

import { READY_CATEGORIES, SECTIONS, type ReadyKind, type SectionId } from "@/lib/app-nav";

export type ShelfPicture = { src: string; fallback?: string; shadow?: boolean };

function hideBrokenPicture(event: { currentTarget: HTMLImageElement }): void {
  const image = event.currentTarget;
  const fallback = image.dataset.fallback;
  if (fallback && image.dataset.tried !== "1" && image.getAttribute("src") !== fallback) {
    image.dataset.tried = "1";
    image.src = fallback;
    return;
  }
  image.style.visibility = "hidden";
}

/** Ready-made, Make your own, Adventures, Printables and Music on top. Ready-made opens a shelf of sets, each with a picture. */
export function AppNav({
  section,
  kind,
  pictures,
  onSection,
  onCategory,
}: {
  section: SectionId | null;
  kind: ReadyKind;
  pictures: Partial<Record<ReadyKind, ShelfPicture>>;
  onSection: (id: SectionId) => void;
  onCategory: (kind: ReadyKind) => void;
}) {
  return (
    <nav className="pk-nav mx-auto w-full min-w-0 max-w-5xl px-4 sm:px-6" aria-label="Main menu">
      <ul className="pk-sections">
        {SECTIONS.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="pk-section"
              aria-current={section === item.id ? "page" : undefined}
              onClick={() => onSection(item.id)}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
      {section === "ready" || section === "printables" ? (
        <div className="pk-shelf">
          <h2 id="shelf-heading" className="pk-section-title">
            Pick a set
          </h2>
          <ul className="pk-shelf-grid" aria-labelledby="shelf-heading">
            {READY_CATEGORIES.map((item) => {
              const picture = pictures[item.kind];
              return (
                <li key={item.kind}>
                  <button
                    type="button"
                    className="pk-tile"
                    aria-current={kind === item.kind ? "true" : undefined}
                    onClick={() => onCategory(item.kind)}
                  >
                    <span className="pk-tile-pic" aria-hidden="true">
                      {picture ? (
                        <img
                          src={picture.src}
                          alt=""
                          width={56}
                          height={56}
                          loading="lazy"
                          data-fallback={picture.fallback}
                          onError={hideBrokenPicture}
                          className={picture.shadow ? "pk-tile-shadow" : undefined}
                        />
                      ) : null}
                    </span>
                    <span className="pk-tile-label">{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </nav>
  );
}
