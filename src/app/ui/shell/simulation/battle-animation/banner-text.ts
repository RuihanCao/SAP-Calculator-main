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
  /**
   * The last word of the run, kept apart so it and the glyph can be held on
   * one line. Without it a glyph at the end of a line wraps on its own and the
   * card shows a stray icon under the rules, which the real card never does.
   */
  tail: string;
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

/**
 * The words that carry a glyph, and whether an amount has to stand in front of
 * the word for it to do so.
 *
 * The reference card puts the glyph on the amount: "for 3 [rock] damage" and
 * "Give it +1 [rock] attack until next turn" (f11 t=30.45 and f04 t=12.63).
 * That is also what keeps the verb in "Jump attack the second enemy" from
 * pulling a second rock onto the same card, which an earlier reading drew. A perk
 * is not an amount, so it is named rather than counted.
 */
const GLYPHS: Array<[RegExp, AnimationPayloadKind, boolean]> = [
  [/^attacks?$/i, 'attack-glyph', true],
  [/^damage$/i, 'attack-glyph', true],
  [/^health$/i, 'heart', true],
  [/^mana$/i, 'mana-potion', true],
  [/^experience$/i, 'xp-book', true],
  [/^xp$/i, 'xp-book', true],
  [/^trumpets?$/i, 'trumpet', true],
  [/^perks?$/i, 'perk-icon', false],
];

const USES = /\s*Works\s+(\d+)\s+times?\s+per\s+(battle|turn)\.?/i;

const glyphFor = (word: string, amountBefore: boolean): AnimationPayloadKind | null => {
  for (const [pattern, payload, needsAmount] of GLYPHS) {
    if (pattern.test(word) && (amountBefore || !needsAmount)) {
      return payload;
    }
  }
  return null;
};

/** `3`, `+1`, `-2`: the amount a glyph belongs to. */
const AMOUNT = /^[+-]?\d+$/;

/** Splits a run into everything but its last word, and that last word. */
const splitTail = (run: string): { text: string; tail: string } => {
  const at = run.replace(/\s+$/, '').lastIndexOf(' ');
  return at < 0
    ? { text: '', tail: run }
    : { text: run.slice(0, at + 1), tail: run.slice(at + 1) };
};

/**
 * Splits the rules into runs of words, each run followed by at most one glyph.
 *
 * The glyph goes on the amount, not on the noun: the reference card reads
 * "for 3 [rock] damage" and "Give it +1 [rock] attack until next turn" (f11
 * t=30.45 and f04 t=12.63), so a word that names a stat only pulls its glyph in
 * when a number is standing in front of it. Without that rule the verb in
 * "Jump attack the second enemy" took one too, and the card drew two.
 */
const toSegments = (text: string): BannerSegment[] => {
  const segments: BannerSegment[] = [];
  const tokens = text.split(/(\s+)/);
  let pending = '';
  let previousWord: string | null = null;
  for (const token of tokens) {
    const bare = token.replace(/[^A-Za-z]/g, '');
    const isSpace = /^\s+$/.test(token);
    const icon = bare
      ? glyphFor(bare, previousWord != null && AMOUNT.test(previousWord))
      : null;
    if (icon) {
      // The glyph sits between the amount and the word it belongs to.
      segments.push({ ...splitTail(pending), icon });
      pending = token;
    } else {
      pending += token;
    }
    if (!isSpace) {
      previousWord = token.replace(/[^A-Za-z0-9+-]/g, '') || null;
    }
  }
  if (pending.trim().length > 0 || segments.length === 0) {
    segments.push({ text: pending, tail: '', icon: null });
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
