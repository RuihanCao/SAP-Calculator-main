import { AnimationPayloadKind } from 'app/domain/interfaces/animation-event.interface';

/**
 * The banner's rules text, taken apart the way the real card lays it out
 * (checklist 11 and 15).
 *
 * The card is not one paragraph: the trigger is its own phrase, the rules read
 * with the stat's own glyph inline where the stat is named, a limited ability
 * carries how many uses are left on a tab at the right edge, and a granted perk
 * is explained on a second line in grey.
 */
export interface BannerSegment {
  text: string;
  /** Glyph drawn after the words, when the words name something with an icon. */
  icon: AnimationPayloadKind | null;
}

export interface BannerText {
  /** `Faint`, `Start of battle`, drawn ahead of the rules. */
  trigger: string | null;
  body: BannerSegment[];
  /** `3 / battle` for `Works 3 times per battle`, drawn as a right edge tab. */
  uses: string | null;
  /** The grey second line, e.g. `Coconut = Block damage, once.` */
  note: string | null;
}

const GLYPHS: Array<[RegExp, AnimationPayloadKind]> = [
  [/^attacks?$/i, 'attack-glyph'],
  [/^damage$/i, 'attack-glyph'],
  [/^health$/i, 'heart'],
  [/^mana$/i, 'mana-potion'],
  [/^experience$/i, 'xp-book'],
  [/^xp$/i, 'xp-book'],
  [/^trumpets?$/i, 'trumpet'],
  [/^perks?$/i, 'perk-icon'],
];

const USES = /\s*Works\s+(\d+)\s+times?\s+per\s+(battle|turn)\.?/i;

const glyphFor = (word: string): AnimationPayloadKind | null => {
  for (const [pattern, payload] of GLYPHS) {
    if (pattern.test(word)) {
      return payload;
    }
  }
  return null;
};

/** Splits the rules into runs of words, each run followed by at most one glyph. */
const toSegments = (text: string): BannerSegment[] => {
  const segments: BannerSegment[] = [];
  let pending = '';
  for (const token of text.split(/(\s+)/)) {
    const bare = token.replace(/[^A-Za-z]/g, '');
    const icon = bare ? glyphFor(bare) : null;
    pending += token;
    if (icon) {
      segments.push({ text: pending, icon });
      pending = '';
    }
  }
  if (pending.trim().length > 0 || segments.length === 0) {
    segments.push({ text: pending, icon: null });
  }
  return segments;
};

export const parseBannerText = (
  text: string | null,
  fallbackTrigger: string | null = null,
): BannerText => {
  if (!text) {
    return { trigger: fallbackTrigger, body: [], uses: null, note: null };
  }
  const [head, ...rest] = text.split('\n');
  const note = rest.join(' ').trim() || null;

  let rules = head;
  let uses: string | null = null;
  const usesMatch = rules.match(USES);
  if (usesMatch) {
    uses = `${usesMatch[1]} / ${usesMatch[2].toLowerCase()}`;
    rules = rules.replace(USES, '').trim();
  }

  let trigger: string | null = fallbackTrigger;
  const triggerMatch = rules.match(/^([^:]{1,40}):\s*/);
  if (triggerMatch) {
    trigger = triggerMatch[1].trim();
    rules = rules.slice(triggerMatch[0].length);
  }

  return { trigger, body: toSegments(rules.trim()), uses, note };
};
