/* ── AI Formatting Class Reference ────────────────────────────
 * Structured catalog of all available CSS classes for AI formatting.
 * Imported by ai-formatting.ts and injected into the system prompt.
 *
 * To add new classes:
 * 1. Add CSS in ai-formatting-css.ts
 * 2. Add an entry here with class, description, usage, and example
 * 3. The AI will automatically pick it up — no prompt changes needed.
 */

export interface FormattingClass {
  /** CSS class name(s), space-separated if multiple needed together */
  classes: string;
  /** Short human label */
  label: string;
  /** When to use this class */
  when: string;
  /** HTML example the AI can copy/adapt */
  example: string;
}

export interface FormattingCategory {
  name: string;
  description: string;
  items: FormattingClass[];
}

export const FORMATTING_CATEGORIES: FormattingCategory[] = [
  {
    name: "Structured Data",
    description: "Key-value grids for stats, character sheets, skill tables",
    items: [
      {
        classes: "ai-fmt-stat-block",
        label: "Stat Block",
        when: "Character stats, skill tables, key-value data, level info, attribute lists",
        example: `<div class="ai-fmt-stat-block"><div class="ai-fmt-stat-row"><span class="ai-fmt-stat-label"><span class="ai-fmt-icon ai-fmt-icon-heart"></span>HP</span><span class="ai-fmt-stat-value">450</span></div><div class="ai-fmt-stat-row"><span class="ai-fmt-stat-label"><span class="ai-fmt-icon ai-fmt-icon-sword"></span>ATK</span><span class="ai-fmt-stat-value">82</span></div></div>`,
      },
    ],
  },
  {
    name: "System Messages",
    description: "Centered announcement bars for game/system notifications",
    items: [
      {
        classes: "ai-fmt-system-msg",
        label: "System Notification",
        when: "System messages, announcements, teleportation, level-ups, quest updates, warnings, skill activations, dungeon entries, zone transitions — any text that reads like a game UI notification",
        example: `<div class="ai-fmt-system-msg"><span class="ai-fmt-icon ai-fmt-icon-zap"></span>Teleportation Complete</div>`,
      },
    ],
  },
  {
    name: "Inline Highlights",
    description: "Small pills and badges for inline emphasis",
    items: [
      {
        classes: "ai-fmt-xp-badge",
        label: "XP / Numeric Badge",
        when: "XP gains, level numbers, damage numbers, scores, rankings, currency amounts, any short numeric value worth calling out",
        example: `<span class="ai-fmt-xp-badge">+500 XP</span>`,
      },
      {
        classes: "ai-fmt-status-badge ai-fmt-status-buff",
        label: "Buff Tag",
        when: "Positive status effects, buffs, skills gained, beneficial conditions, acquired traits",
        example: `<span class="ai-fmt-status-badge ai-fmt-status-buff">Haste</span>`,
      },
      {
        classes: "ai-fmt-status-badge ai-fmt-status-debuff",
        label: "Debuff Tag",
        when: "Negative status effects, debuffs, curses, harmful conditions, penalties",
        example: `<span class="ai-fmt-status-badge ai-fmt-status-debuff">Poisoned</span>`,
      },
    ],
  },
  {
    name: "Items & Cards",
    description: "Compact cards for named things with descriptions",
    items: [
      {
        classes: "ai-fmt-item-card",
        label: "Item Card",
        when: "Named items, skills, spells, weapons, armor, potions, locations being introduced with a description",
        example: `<div class="ai-fmt-item-card"><span class="ai-fmt-item-name ai-fmt-rarity-rare"><span class="ai-fmt-icon ai-fmt-icon-gem"></span>Blade of Dawn</span> — A longsword imbued with solar energy.</div>`,
      },
      {
        classes: "ai-fmt-rarity-common",
        label: "Common Rarity",
        when: "Common/basic quality items",
        example: `<span class="ai-fmt-item-name ai-fmt-rarity-common">Iron Sword</span>`,
      },
      {
        classes: "ai-fmt-rarity-uncommon",
        label: "Uncommon Rarity",
        when: "Uncommon/improved quality items",
        example: `<span class="ai-fmt-item-name ai-fmt-rarity-uncommon">Steel Gauntlets</span>`,
      },
      {
        classes: "ai-fmt-rarity-rare",
        label: "Rare Rarity",
        when: "Rare/superior quality items",
        example: `<span class="ai-fmt-item-name ai-fmt-rarity-rare">Moonstone Ring</span>`,
      },
      {
        classes: "ai-fmt-rarity-epic",
        label: "Epic Rarity",
        when: "Epic/exceptional quality items",
        example: `<span class="ai-fmt-item-name ai-fmt-rarity-epic">Stormcaller Staff</span>`,
      },
      {
        classes: "ai-fmt-rarity-legendary",
        label: "Legendary Rarity",
        when: "Legendary/mythic quality items, unique artifacts",
        example: `<span class="ai-fmt-item-name ai-fmt-rarity-legendary">Excalibur</span>`,
      },
    ],
  },
  {
    name: "Dialogue",
    description: "Colored name tags before quoted speech",
    items: [
      {
        classes: "ai-fmt-dialogue-hero",
        label: "Hero Dialogue",
        when: "Protagonist or ally speaking — use the CHARACTER'S ACTUAL NAME as tag text, never 'HERO'",
        example: `<span class="ai-fmt-dialogue-hero">Zephyr</span> "We need to move now."`,
      },
      {
        classes: "ai-fmt-dialogue-villain",
        label: "Villain Dialogue",
        when: "Antagonist or threatening character speaking — use the CHARACTER'S ACTUAL NAME, never 'VILLAIN'",
        example: `<span class="ai-fmt-dialogue-villain">Malachar</span> "You cannot escape."`,
      },
      {
        classes: "ai-fmt-dialogue-divine",
        label: "Divine / System Dialogue",
        when: "Otherworldly, authoritative, or system voice speaking — use actual name or 'System', 'Voice', etc.",
        example: `<span class="ai-fmt-dialogue-divine">System</span> "Quest accepted."`,
      },
    ],
  },
  {
    name: "Text Effects",
    description: "Inline text treatments for emphasis and mood",
    items: [
      {
        classes: "ai-fmt-thought",
        label: "Internal Monologue",
        when: "Character's inner thoughts, reflections, mental voice, internal reactions",
        example: `<div class="ai-fmt-thought">This can't be real... can it?</div>`,
      },
      {
        classes: "ai-fmt-sfx",
        label: "Sound Effect / Impact",
        when: "Onomatopoeia, sound effects, dramatic single words, impact moments (BOOM, CRACK, etc.)",
        example: `<span class="ai-fmt-sfx">CRACK!</span>`,
      },
      {
        classes: "ai-fmt-reveal",
        label: "First Mention Highlight",
        when: "Important names, titles, places, or concepts being introduced for the first time in the story",
        example: `The <span class="ai-fmt-reveal">Obsidian Gate</span> loomed before them.`,
      },
    ],
  },
  {
    name: "Icons",
    description: "Inline SVG icons — use on stat labels, badges, item names, and system messages. Add before text.",
    items: [
      { classes: "ai-fmt-icon ai-fmt-icon-sword", label: "Sword", when: "Combat, attack, melee, damage", example: `<span class="ai-fmt-icon ai-fmt-icon-sword"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-shield", label: "Shield", when: "Defense, armor, protection, blocking", example: `<span class="ai-fmt-icon ai-fmt-icon-shield"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-sparkle", label: "Sparkle", when: "Magic, mana, special abilities, enchantment", example: `<span class="ai-fmt-icon ai-fmt-icon-sparkle"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-zap", label: "Zap", when: "Speed, energy, lightning, activation", example: `<span class="ai-fmt-icon ai-fmt-icon-zap"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-scroll", label: "Scroll", when: "Knowledge, lore, quests, messages", example: `<span class="ai-fmt-icon ai-fmt-icon-scroll"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-skull", label: "Skull", when: "Death, danger, kills, threats", example: `<span class="ai-fmt-icon ai-fmt-icon-skull"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-arrow-up", label: "Arrow Up", when: "Level up, increase, growth, progression", example: `<span class="ai-fmt-icon ai-fmt-icon-arrow-up"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-gem", label: "Gem", when: "Rarity, treasure, gems, currency", example: `<span class="ai-fmt-icon ai-fmt-icon-gem"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-trophy", label: "Trophy", when: "Rank, achievement, victory, titles", example: `<span class="ai-fmt-icon ai-fmt-icon-trophy"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-heart", label: "Heart", when: "Health, HP, healing, vitality", example: `<span class="ai-fmt-icon ai-fmt-icon-heart"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-star", label: "Star", when: "Rating, level, quality, favorites", example: `<span class="ai-fmt-icon ai-fmt-icon-star"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-flame", label: "Flame", when: "Fire, power, intensity, burning", example: `<span class="ai-fmt-icon ai-fmt-icon-flame"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-eye", label: "Eye", when: "Perception, spirit, vision, awareness", example: `<span class="ai-fmt-icon ai-fmt-icon-eye"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-crown", label: "Crown", when: "Royalty, authority, leadership, nobility", example: `<span class="ai-fmt-icon ai-fmt-icon-crown"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-book", label: "Book", when: "Skills, learning, spellbook, knowledge", example: `<span class="ai-fmt-icon ai-fmt-icon-book"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-target", label: "Target", when: "Accuracy, focus, aim, precision", example: `<span class="ai-fmt-icon ai-fmt-icon-target"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-plus", label: "Plus", when: "Gain, addition, healing, bonus", example: `<span class="ai-fmt-icon ai-fmt-icon-plus"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-user", label: "User", when: "Character, player, name, identity", example: `<span class="ai-fmt-icon ai-fmt-icon-user"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-bolt", label: "Bolt", when: "Agility, lightning, quick actions", example: `<span class="ai-fmt-icon ai-fmt-icon-bolt"></span>` },
    ],
  },
];

/**
 * Build a compact class reference string for the AI prompt.
 * Structured as a lookup table the AI can scan quickly.
 */
export function buildClassReference(): string {
  const sections: string[] = [];

  for (const cat of FORMATTING_CATEGORIES) {
    const lines: string[] = [`## ${cat.name} — ${cat.description}`];
    for (const item of cat.items) {
      lines.push(`- \`${item.classes}\` → ${item.label}: ${item.when}`);
      lines.push(`  ex: ${item.example}`);
    }
    sections.push(lines.join("\n"));
  }

  return sections.join("\n\n");
}
