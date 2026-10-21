"use client";

import {
  COLLECTION_TABS,
  PRIMARY_TABS,
  type CollectionKind,
  type PrimaryTabId,
} from "@/lib/app-nav";

export function AppNav({
  selected,
  collection,
  onPrimary,
  onCollection,
}: {
  selected: PrimaryTabId | null;
  collection: CollectionKind;
  onPrimary: (id: PrimaryTabId) => void;
  onCollection: (kind: CollectionKind) => void;
}) {
  return (
    <div className="pk-nav mx-auto w-full min-w-0 max-w-5xl px-4 sm:px-6">
      <div className="pk-tabs pk-scroll" role="tablist" aria-label="Main menu">
        {PRIMARY_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected === tab.id}
            onClick={() => onPrimary(tab.id)}
            className="pk-tab"
          >
            {tab.label}
          </button>
        ))}
      </div>
      {selected === "collections" ? (
        <div className="pk-subtabs pk-scroll" role="tablist" aria-label="Collections">
          {COLLECTION_TABS.map((tab) => (
            <button
              key={tab.kind}
              type="button"
              role="tab"
              aria-selected={collection === tab.kind}
              onClick={() => onCollection(tab.kind)}
              className="pk-pill"
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
