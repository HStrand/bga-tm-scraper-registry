// Turns the engine's option texts ("Remove 2 microbes to raise temperature") into what is spent and what is
// gained, so a choice can be drawn with icons. Texts it does not recognise stay plain.

export type ArtIcon =
  | 'microbe' | 'animal' | 'science' | 'fighter'
  | 'mc' | 'steel' | 'titanium' | 'plant' | 'energy' | 'heat'
  | 'temperature' | 'oxygen' | 'tr' | 'card';

export interface ArtPart {
  icon: ArtIcon;
  amount: number;
  /** "Up to" this many. */
  upTo?: boolean;
  /** A production step, not the resource itself. */
  production?: boolean;
}

export interface OptionArt {
  spend: ArtPart[];
  gain: ArtPart[];
  /** Where it applies when that is not the card itself, e.g. "another card", "any player". */
  where?: string;
}

const ICONS: Record<string, ArtIcon> = {
  microbe: 'microbe', microbes: 'microbe',
  animal: 'animal', animals: 'animal',
  science: 'science',
  fighter: 'fighter', fighters: 'fighter',
  mc: 'mc', 'm€': 'mc',
  steel: 'steel',
  titanium: 'titanium',
  plant: 'plant', plants: 'plant',
  energy: 'energy',
  heat: 'heat',
};

const iconOf = (word: string): ArtIcon | undefined => ICONS[word.toLowerCase()];

/** What a "to ..." clause gets you. */
function outcome(text: string): ArtPart | undefined {
  const t = text.toLowerCase();
  if (t === 'raise temperature') return { icon: 'temperature', amount: 1 };
  if (t === 'raise oxygen') return { icon: 'oxygen', amount: 1 };
  if (t === 'draw a card') return { icon: 'card', amount: 1 };
  const tr = t.match(/^gain (\d+) tr$/);
  if (tr) return { icon: 'tr', amount: Number(tr[1]) };
  return undefined;
}

export function optionArt(label: string): OptionArt | null {
  const text = label.trim();
  let m: RegExpMatchArray | null;

  // "Add 1 microbe", "Add 1 science resource", "Add 2 animals to another card", "Add 1 animal to Pets"
  if ((m = text.match(/^Add (\d+) (\w+?)(?: resources?)?(?: to (.+))?$/i))) {
    const icon = iconOf(m[2]);
    if (icon) return { spend: [], gain: [{ icon, amount: Number(m[1]) }], where: m[3] };
  }

  // "Remove 2 microbes to raise temperature", "Remove 1 science resource to draw a card"
  if ((m = text.match(/^Remove (\d+) (\w+?)(?: resources?)? to (.+)$/i))) {
    const icon = iconOf(m[2]);
    const gained = outcome(m[3]);
    if (icon && gained) return { spend: [{ icon, amount: Number(m[1]) }], gain: [gained] };
  }

  // "Remove up to 2 animals from any card", "Remove up to 5 plants from any player", "Remove up to 7 MC"
  if ((m = text.match(/^Remove up to (\d+) (\S+)(?: from (.+))?$/i))) {
    const icon = iconOf(m[2]);
    if (icon) return { spend: [{ icon, amount: Number(m[1]), upTo: true }], gain: [], where: m[3] };
  }

  // "Steal up to 2 steel"
  if ((m = text.match(/^Steal up to (\d+) (\S+)$/i))) {
    const icon = iconOf(m[2]);
    if (icon) return { spend: [], gain: [{ icon, amount: Number(m[1]), upTo: true }], where: 'another player' };
  }

  // "Spend 1 plant for 7 MC"
  if ((m = text.match(/^Spend (\d+) (\S+) for (\d+) (\S+)$/i))) {
    const spent = iconOf(m[2]);
    const gained = iconOf(m[4]);
    if (spent && gained) return { spend: [{ icon: spent, amount: Number(m[1]) }], gain: [{ icon: gained, amount: Number(m[3]) }] };
  }

  // "Gain 3 plants"
  if ((m = text.match(/^Gain (\d+) (\S+)$/i))) {
    const icon = iconOf(m[2]);
    if (icon) return { spend: [], gain: [{ icon, amount: Number(m[1]) }] };
  }

  // "Increase energy production 2 steps"
  if ((m = text.match(/^Increase (\S+) production (\d+) steps?$/i))) {
    const icon = iconOf(m[1]);
    if (icon) return { spend: [], gain: [{ icon, amount: Number(m[2]), production: true }] };
  }

  return null;
}
