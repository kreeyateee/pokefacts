"use client";

import { COMPANION_GAMES } from "@/lib/game-companion";

/** Which game the child is playing. The Game Companion cards follow that game's Pokédex and rules. */
export function CompanionGamePicker({ gameId, onPick }: { gameId: string; onPick: (id: string) => void }) {
  return (
    <div className="grid gap-1.5">
      <p className="pk-kicker">Which game is your child playing?</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Which game is your child playing?">
        {COMPANION_GAMES.map((game) => (
          <button
            key={game.id}
            type="button"
            role="radio"
            aria-checked={game.id === gameId}
            className="pk-chip"
            onClick={() => onPick(game.id)}
          >
            {game.short}
          </button>
        ))}
      </div>
    </div>
  );
}
