import { POKEMON_SIGN_TEXT } from "@/lib/pokemon-sign";

export function PokemonSign({
  size = "card",
}: {
  size?: "banner" | "card";
}) {
  return (
    <p className={size === "banner" ? "pk-sign pk-sign-lg" : "pk-sign"} aria-hidden="true">
      <span className="pk-sign-text">{POKEMON_SIGN_TEXT}</span>
    </p>
  );
}

export function PokemonSignboard() {
  return (
    <div className="pk-signboard" aria-hidden="true">
      <PokemonSign size="banner" />
    </div>
  );
}
