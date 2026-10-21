import type { BiologyBlock } from "@/lib/catalogue-types";

/** Spoken wiki prose stays near a minute. The name is added after this cap. */
export const SPOKEN_WIKI_LIMIT = 1200;

const CREDIT = /bulbapedia|creative commons|\bcc\s*by-nc-sa\b|licensed under/i;

/**
 * Lead prose only. A heading after the first paragraph starts a later
 * subsection (Physiology, Forms, and the rest), so those paragraphs stay out.
 */
export function leadParagraphs(blocks: BiologyBlock[]): string[] {
  const paragraphs: string[] = [];
  let seenProse = false;
  for (const block of blocks) {
    if (block.kind === "heading" || block.kind === "list") {
      if (seenProse) break;
      continue;
    }
    const text = block.text.replace(/\s+/g, " ").trim();
    if (!text) continue;
    paragraphs.push(text);
    seenProse = true;
    if (paragraphs.length === 2) break;
  }
  return paragraphs;
}

function sentences(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [text])
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function withoutCredits(text: string): string {
  return sentences(text)
    .filter((sentence) => !CREDIT.test(sentence))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function clipAt(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const slice = text.slice(0, limit);
  const sentence = slice.match(/^[\s\S]*[.!?](?=\s|$)/);
  if (sentence && sentence[0].trim().length >= 240) return sentence[0].trim();
  const word = slice.replace(/\s+\S*$/, "").trim();
  return (word.length >= 80 ? word : slice.trim()).replace(/\s+/g, " ").trim();
}

export function capProse(paragraphs: string[], limit = SPOKEN_WIKI_LIMIT): string {
  let text = "";
  for (const paragraph of paragraphs.slice(0, 2)) {
    const clean = withoutCredits(paragraph);
    if (!clean) continue;
    const next = text ? `${text} ${clean}` : clean;
    if (next.length <= limit) {
      text = next;
      continue;
    }
    const room = limit - (text ? text.length + 1 : 0);
    if (room >= 80) text = text ? `${text} ${clipAt(clean, room)}` : clipAt(clean, limit);
    break;
  }
  return withoutCredits(text);
}

/** Name, then the first two lead paragraphs. License lines are left on the page. */
export function spokenWiki(name: string, blocks: BiologyBlock[]): string {
  const title = name.replace(/\s+/g, " ").trim();
  const prose = capProse(leadParagraphs(blocks));
  if (!title) return prose;
  if (!prose) return `${title}.`;
  return `${title}. ${prose}`.replace(/\s+/g, " ").trim();
}

/** Send status when Bulbapedia did not answer and the catalogue Pokédex line is spoken instead. */
export const WIKI_DEX_NOTE = "Bulbapedia did not load. The Pokédex line is used instead.";

/** Name, then one catalogue Pokédex sentence. An empty line stays the name alone. */
export function spokenDexLine(name: string, dexLine: string): string {
  const line = dexLine.replace(/\s+/g, " ").trim();
  if (!line) return spokenWiki(name, []);
  return spokenWiki(name, [{ kind: "paragraph", text: line }]);
}

/**
 * Wiki lead when Bulbapedia has one.
 * Otherwise the catalogue Pokédex sentence, so a fact is not the name alone.
 */
export function spokenFact(name: string, blocks: BiologyBlock[], dexLine = ""): string {
  if (capProse(leadParagraphs(blocks))) return spokenWiki(name, blocks);
  return spokenDexLine(name, dexLine);
}

/** Keep an existing send status line and add the Pokédex fallback note once. */
export function statusWithDexNote(detail: string, notice: string): string {
  const note = notice.replace(/\s+/g, " ").trim();
  const base = detail.replace(/\s+/g, " ").trim();
  if (!note) return base;
  if (!base) return note;
  if (base.includes(note)) return base;
  return `${base} ${note}`;
}

/**
 * A one-line "it can Mega Evolve" note is not a description.
 * Real form prose is a paragraph about the form itself.
 */
function isFormStub(text: string): boolean {
  const clean = text.replace(/\s+/g, " ").trim().replace(/[.!]+$/, "");
  if (!clean) return true;
  if (clean.length > 160) return false;
  return /can mega evolve|can gigantamax/i.test(clean) && clean.split(/[.!?]/).filter((part) => part.trim()).length <= 1;
}

/** Form paragraphs worth saying. A missing page or a Mega Evolve stub is empty. */
export function formProse(blocks: BiologyBlock[]): string {
  const prose = capProse(leadParagraphs(blocks));
  if (!prose || isFormStub(prose)) return "";
  return prose;
}

/**
 * Form text when Bulbapedia has it.
 * Otherwise the species Biology Pokefacts already speaks: name, then the first two paragraphs.
 */
export function spokenForm(
  formName: string,
  formBlocks: BiologyBlock[],
  speciesName: string,
  speciesBlocks: BiologyBlock[],
): string {
  if (formProse(formBlocks)) return spokenWiki(formName, formBlocks);
  if (capProse(leadParagraphs(speciesBlocks))) return spokenWiki(speciesName, speciesBlocks);
  return spokenWiki(formName, []);
}
