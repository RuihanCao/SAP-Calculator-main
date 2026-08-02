export const EQUIPMENT_CATEGORIES: { [key: string]: string[] } = {
  Turtle: [
    'Bread',
    'Cake',
    'Chili',
    'Coconut',
    'Garlic',
    'Honey',
    'Meat Bone',
    'Melon',
    'Mushroom',
    'Peanut',
    'Steak',
  ],
  Puppy: [
    'Blackberry',
    'Croissant',
    'Egg',
    'Eucalyptus',
    'Lemon',
    'Lime',
    'Mild Chili',
    'Pancakes',
    'Pie',
    'Rice',
    'Salt',
    'Skewer',
    'Squash',
    'Walnut',
  ],
  Star: [
    'Baguette',
    'Caramel',
    'Carrot',
    'Cheese',
    'Cucumber',
    'Grapes',
    'Pepper',
    'Popcorn',
    'Seaweed',
    'Strawberry',
  ],
  Golden: [
    'Banana',
    'Bok Choy',
    'Cherry',
    'Chocolate Cake',
    'Durian',
    'Eggplant',
    'Fig',
    'Honeydew Melon',
    'Maple Syrup',
    'Onion',
    'Pita Bread',
    'Potato',
    'Tomato',
  ],
  Unicorn: [
    'Ambrosia',
    'Easter Egg',
    'Faint Bread',
    'Fairy Dust',
    'Gingerbread Man',
    'Golden Egg',
    'Health Potion',
    'Love Potion',
    'Magic Beans',
    'Rambutan',
    'Yggdrasil Fruit',
  ],
  Danger: [
    'Cocoa Bean',
    'Cod Roe',
    'Gros Michel Banana',
    'Geechee Red Pea',
    'Sudduth Tomato',
    'White Okra',
    'White Truffle',
  ],
  Custom: [
    'Blueberry',
    'Brussels Sprout',
    'Cashew Nut',
    'Cauliflower',
    'Churros',
    'Donut',
    'Fortune Cookie',
    'Guava',
    'Kiwano',
    'Kiwifruit',
    'Macaron',
    'Melon Slice',
    'Nachos',
    'Oyster Mushroom',
    'Pineapple',
    'Radish',
    'Sardinian Currant',
    'Sausage',
    'Unagi',
  ],
  Hidden: ['Cake Slice', 'Peanut Butter'],
};

export const AILMENT_CATEGORIES: { [key: string]: string[] } = {
  Ailments: [
    'Bloated',
    'Cold',
    'Confused',
    'Cowardly',
    'Crisp',
    'Cursed',
    'Dazed',
    'Icky',
    'Inked',
    'Sad',
    'Silly',
    'Sleepy',
    'Spooked',
    'Tasty',
    'Toasty',
    'Weak',
    'Webbed',
  ],
};

/**
 * Names are canonicalised on both sides of the comparison.
 *
 * Callers feed this whatever a log line carried, and a board log's perk name
 * comes out of an `alt` attribute, so it can arrive padded or with a line break
 * folded into the middle of it. Matching the raw string would silently answer
 * "not an ailment" for `" Tasty"`, which is the same 404 this function exists to
 * stop.
 */
const canonicalEquipmentName = (name: string): string =>
  name.trim().replace(/\s+/g, ' ').toLowerCase();

const AILMENT_NAMES = new Set(
  Object.values(AILMENT_CATEGORIES)
    .flat()
    .filter(Boolean)
    .map(canonicalEquipmentName),
);

/**
 * Whether a perk name is an ailment rather than a food perk.
 *
 * Which of the two it is decides which art directory the icon comes from
 * (`Ailments/` against `Food/`), so anything that resolves an icon from a name
 * alone has to ask here rather than assume. Assuming was the Tasty broken-image
 * bug: the battle animation's seed board read the perk name off the board log
 * and passed `false`, which sent every ailment a pet was already wearing at the
 * first bell to `Food/<name>.png` and a 404.
 */
export function isAilmentEquipmentName(name?: string | null): boolean {
  return name ? AILMENT_NAMES.has(canonicalEquipmentName(name)) : false;
}
