"use client";

import { paintScene, SCENE_LABELS, SCENES, type Scene } from "@/lib/sticker-scenes";

const SWATCH = { width: 44, height: 30 };

function drawSwatch(scene: Scene) {
  return (canvas: HTMLCanvasElement | null) => {
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) paintScene(ctx, scene, canvas.width, canvas.height);
  };
}

/** The background behind a group photo or a pile, each choice with a little picture of it. */
export function SceneChooser({ scene, onScene }: { scene: Scene; onScene: (scene: Scene) => void }) {
  return (
    <div className="grid gap-1.5">
      <p className="pk-kicker">Background</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Background">
        {SCENES.map((choice) => (
          <button
            key={choice}
            type="button"
            role="radio"
            aria-checked={scene === choice}
            className="pk-chip inline-flex h-auto items-center gap-1.5 py-1 pl-1"
            onClick={() => onScene(choice)}
          >
            <canvas
              ref={drawSwatch(choice)}
              width={SWATCH.width}
              height={SWATCH.height}
              aria-hidden="true"
              className="h-6 w-9 rounded-full border-2 border-ink/40"
            />
            {SCENE_LABELS[choice]}
          </button>
        ))}
      </div>
    </div>
  );
}
