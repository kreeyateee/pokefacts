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
] as const;

/** Lily when the saved id is missing or not one of the Champdex voices. */
export function voiceOrLily(id?: string): string {
  const match = YOTO_VOICES.find((voice) => voice.id === id);
  return match?.id ?? YOTO_VOICES[0].id;
}

/**
 * The content gateway checks these strings literally. `user:content:manage`
 * is documented as including `user:content:view`, and reading the scratch
 * recording also requires `family:library:view`. A refresh keeps the old
 * grant, so a token minted before these were listed has to be replaced.
 */
export const YOTO_SCOPES =
  "user:content:manage user:content:view family:library:view offline_access profile";
