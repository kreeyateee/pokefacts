/** Public Yoto pixel icons, keyed for a spoken Pokédex chapter. */
export const YOTO_ICONS = {
  book: "yoto:#gTMbacpoeSMYqc9fNLJnxPjylraNG6jIrYEWevyzYbA",
  star: "yoto:#gCgNJrpHZ186Hd1ttD-k0R2Cf38FbPW3riwe27WAiJA",
  celebrate: "yoto:#tNXOIzQIPO6OjSzmT5WFofHhK3-KRGYvnlBxE1oF0-4",
  daisy: "yoto:#zoSnzxNNkdIlP2KvKGjZMTuLT68RBj9J6xoQ7mtfncs",
  cactus: "yoto:#q8LiHS1E_Yo5RjxcLvHGEtDgt_-bppr8EusZvCyQ8uA",
  flower: "yoto:#QutDsBONLGeLYlNsUxZnhNa2-MlNeXenAfDyPqOnbIo",
  fire: "yoto:#3ZnJD74DawVPKntS3pIEpDlM57daHtDuczmf2JI_EBw",
  fireFace: "yoto:#l7GAkHrUZY1KydakZUyOdoNM34WA5AEsm5v5vhiZOXY",
  dragon: "yoto:#Dsd3p90qIgGz_wQtf92vKep1ZlDU-_t_9_ZzwYD0lkE",
  fish: "yoto:#02qfqNBrky2vF65NYnQphJvzR8GkFrLqCqkYL_8Ejag",
  wave: "yoto:#VpDy5f9vMyAv6dYe-cZ28wGzCfcDWYh2_DRO3zE66nw",
  duck: "yoto:#3RbFa0wVPQ_dvdwvGcPjoP34tKXmgDvvVWH2UsDgY8s",
  octopus: "yoto:#ynMsNqGg8Hp7iyQGz7UkzvfCg8g9melNfCgbyILW2M0",
  sun: "yoto:#W-2RUBud_e1PlHw03Mj73sqyLKibjZjNfyiQ1GWtvx4",
  dog: "yoto:#3y8jL5QODbL5ncOSRwkOhnnVs5s_BbEjMKzZQHw17sk",
  music: "yoto:#feD4F6Xi19d9HF4rEwWtkYeC655CtcHcDA0Ib5UcgNQ",
  bear: "yoto:#FWmS0Thtp7x8X-ZNz5Cu-gP2XBW_UrYukbbwpl3hBqw",
  ghost: "yoto:#Zq3_0iaZEIugWMZamAnGbnP0WhEcs77MWqJtq_XovNQ",
  detective: "yoto:#Fdbn0JIzPAMMR0c4WI4hwpnHUs4uLJAbXcQIJqiUDSQ",
} as const;

const TYPE_ICONS: Record<string, string> = {
  normal: "yoto:#3y8jL5QODbL5ncOSRwkOhnnVs5s_BbEjMKzZQHw17sk",
  fire: "yoto:#3ZnJD74DawVPKntS3pIEpDlM57daHtDuczmf2JI_EBw",
  water: "yoto:#02qfqNBrky2vF65NYnQphJvzR8GkFrLqCqkYL_8Ejag",
  grass: "yoto:#zoSnzxNNkdIlP2KvKGjZMTuLT68RBj9J6xoQ7mtfncs",
  electric: "yoto:#W-2RUBud_e1PlHw03Mj73sqyLKibjZjNfyiQ1GWtvx4",
  ice: "yoto:#iylNTFWzISGseY7HLLveUbli051TyYuuNYHHei_aWp0",
  fighting: "yoto:#0Okwjjy22fAbLtmGls6144g_YunzEAvXCUg4ozzn32Q",
  poison: "yoto:#cBxjDY1KX_RvDrPlX_aR6Y3D1COro_SCmdlqXLiVql0",
  ground: "yoto:#q8LiHS1E_Yo5RjxcLvHGEtDgt_-bppr8EusZvCyQ8uA",
  flying: "yoto:#R-60m21dr9Al8KQCy79k7lScYFRBBCvyYRbIZSDN_0Y",
  psychic: "yoto:#AjJaUh665wfnb72_y5uQ3M0w3JtobwIVfGua_A_j6i8",
  bug: "yoto:#kolx6zUneBrQ6-FFY9u2ceXAFvYzb2Vzk5arWCeAfg0",
  rock: "yoto:#sa0N47sAq5txEBxBM2HrN28rVfjvnFsUKiuuN9CQiRc",
  ghost: "yoto:#Zq3_0iaZEIugWMZamAnGbnP0WhEcs77MWqJtq_XovNQ",
  dragon: "yoto:#Dsd3p90qIgGz_wQtf92vKep1ZlDU-_t_9_ZzwYD0lkE",
  dark: "yoto:#GAvCuUCyEJhyYiZ6fJFfIBHkyblyHBvTlhsz4UantDM",
  steel: "yoto:#zSSkg9JHZwR7FyUnNBFieSk1zhybbzTPJAR3Am8RHVU",
  fairy: "yoto:#mTPUPQwM_T6FUzX7CvtYASo3cGN6zOPM9zXAZO2uqas",
};

export function iconForType(type: string | undefined): string {
  if (!type) return YOTO_ICONS.star;
  return TYPE_ICONS[type] ?? YOTO_ICONS.star;
}

/**
 * ElevenLabs Default voices, ids as api.elevenlabs.io/v1/voices lists them.
 * ElevenLabs retires every Default voice on 31 December 2026; replacements must be chosen before then.
 */
export const YOTO_VOICES = [
  {
    id: "pFZP5JQG7iQjIQuC4Bku",
    name: "Lily",
    note: "British woman",
  },
  {
    id: "JBFqnCBsd6RMkjVDRZzb",
    name: "George",
    note: "British man",
  },
  {
    id: "nPczCjzI2devNBz1zQrb",
    name: "Brian",
    note: "American man",
  },
  {
    id: "pNInz6obpgDQGcFmaJgB",
    name: "Adam",
    note: "American man, lower",
  },
  { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice", note: "British woman, clear teacher" },
  { id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda", note: "American woman, warm and lower" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", note: "American woman, calm and reassuring" },
  { id: "hpp4J3VqNfWAUOO0d1Us", name: "Bella", note: "American woman, bright and warm" },
  { id: "cgSgspJ2msm6clMCkdW9", name: "Jessica", note: "American woman, young and playful" },
  { id: "FGY2WhTYpPnrIDTdsKH5", name: "Laura", note: "American woman, young and lively" },
  { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel", note: "British man, newsreader" },
  { id: "pqHfZKP75CvOlQylNhV4", name: "Bill", note: "American man, older storyteller" },
  { id: "cjVigY5qzO86Huf0OWal", name: "Eric", note: "American man, smooth and friendly" },
  { id: "iP95p4xoKVk53GoZ742B", name: "Chris", note: "American man, down to earth" },
  { id: "CwhRBWXzGAHq8TQ4Fs17", name: "Roger", note: "American man, laid back" },
  { id: "IKne3meq5aSn9XLyUdCD", name: "Charlie", note: "Australian man, young and lively" },
  { id: "TX3LPaxmHKxFdv7VOQHJ", name: "Liam", note: "American man, young and energetic" },
  { id: "bIHbv24MWmeRgasZH58o", name: "Will", note: "American man, young and relaxed" },
  { id: "SAz9YHcvj6GT2YYXdXww", name: "River", note: "American, calm and neutral" },
  { id: "N2lVS1w4EtoT3dr4eOWO", name: "Callum", note: "American man, husky trickster" },
  { id: "SOYHLrjzK2X1ezoPC6cr", name: "Harry", note: "American man, fierce warrior" },
] as const;

/** Lily when the saved id is missing or not one of the Pokefacts voices. */
export function voiceOrLily(id?: string): string {
  const match = YOTO_VOICES.find((voice) => voice.id === id);
  return match?.id ?? YOTO_VOICES[0].id;
}

/**
 * The content gateway checks these strings literally. `user:content:manage`
 * is documented as including `user:content:view`, and reading the scratch
 * recording also requires `family:library:view`. `user:icons:manage` covers
 * a 16×16 icon upload. A refresh keeps the old grant, so a token minted
 * before these were listed has to be replaced: reconnect Yoto.
 */
export const YOTO_SCOPES =
  "user:content:manage user:content:view user:icons:manage family:library:view offline_access profile";

/** The permissions to tick on the Yoto dashboard. `profile` comes with the sign-in itself, so it is not listed. */
export const YOTO_DASHBOARD_SCOPES: readonly string[] = YOTO_SCOPES.split(" ").filter((scope) => scope !== "profile");
