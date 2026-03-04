/* ── AI Formatting Class Reference ────────────────────────────
 * Structured catalog of all available CSS classes for AI formatting.
 * Imported by ai-formatting.ts and injected into the system prompt.
 *
 * To add new classes:
 * 1. Add CSS in ai-formatting-css.ts
 * 2. Add an entry here with class, description, usage, and example
 * 3. The AI will automatically pick it up — no prompt changes needed.
 *
 * Genre coverage: Fantasy, Horror, Sci-Fi, Romance, Mystery, Ranker/Progression,
 * Wuxia/Xianxia, Literary Fiction, and misc (translator notes, combat, world-building).
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
  /* ════════════════════════════════════════════════════════════
     CORE
     ════════════════════════════════════════════════════════════ */
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
      {
        classes: "ai-fmt-system-msg ai-fmt-system-danger",
        label: "Danger System Msg",
        when: "Death warnings, fatal errors, penalty notifications, fail states, destruction alerts",
        example: `<div class="ai-fmt-system-msg ai-fmt-system-danger"><span class="ai-fmt-icon ai-fmt-icon-skull"></span>Player Death — Respawn in 10s</div>`,
      },
      {
        classes: "ai-fmt-system-msg ai-fmt-system-success",
        label: "Success System Msg",
        when: "Quest completion, reward acquisition, achievement unlocked, victory announcements",
        example: `<div class="ai-fmt-system-msg ai-fmt-system-success"><span class="ai-fmt-icon ai-fmt-icon-trophy"></span>Quest Complete!</div>`,
      },
      {
        classes: "ai-fmt-system-msg ai-fmt-system-warning",
        label: "Warning System Msg",
        when: "Caution alerts, approaching danger, timer warnings, low resource warnings",
        example: `<div class="ai-fmt-system-msg ai-fmt-system-warning"><span class="ai-fmt-icon ai-fmt-icon-alert"></span>Warning: Dungeon Collapse in 5 Minutes</div>`,
      },
      {
        classes: "ai-fmt-system-msg ai-fmt-system-levelup",
        label: "Level Up System Msg",
        when: "Level ups, rank promotions, evolution, awakening, tier advancement",
        example: `<div class="ai-fmt-system-msg ai-fmt-system-levelup"><span class="ai-fmt-icon ai-fmt-icon-arrow-up"></span>Level Up! Lv. 24 → Lv. 25</div>`,
      },
      {
        classes: "ai-fmt-system-msg ai-fmt-system-horror",
        label: "Horror System Msg",
        when: "Ominous system messages, glitched notifications, eldritch warnings, sanity loss alerts",
        example: `<div class="ai-fmt-system-msg ai-fmt-system-horror"><span class="ai-fmt-icon ai-fmt-icon-ghost"></span>Something is watching…</div>`,
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
      {
        classes: "ai-fmt-status-badge ai-fmt-status-neutral",
        label: "Neutral Status Tag",
        when: "Neutral status effects, transformations, environmental effects, neither good nor bad conditions",
        example: `<span class="ai-fmt-status-badge ai-fmt-status-neutral">Shapeshifted</span>`,
      },
      {
        classes: "ai-fmt-status-badge ai-fmt-status-immune",
        label: "Immunity Tag",
        when: "Immunities, resistances, invulnerabilities, nullified effects",
        example: `<span class="ai-fmt-status-badge ai-fmt-status-immune">Immune: Fire</span>`,
      },
      {
        classes: "ai-fmt-currency",
        label: "Currency",
        when: "Gold, coins, credits, money amounts, in-game currency, shop prices",
        example: `<span class="ai-fmt-currency"><span class="ai-fmt-icon ai-fmt-icon-coins"></span>3,500 Gold</span>`,
      },
      {
        classes: "ai-fmt-timer",
        label: "Timer / Countdown",
        when: "Countdowns, time remaining, cooldown timers, duration displays",
        example: `<span class="ai-fmt-timer">03:42</span>`,
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
      {
        classes: "ai-fmt-rarity-mythic",
        label: "Mythic Rarity",
        when: "Mythic/transcendent quality items, one-of-a-kind divine artifacts, items beyond legendary",
        example: `<span class="ai-fmt-item-name ai-fmt-rarity-mythic">Void Emperor's Crown</span>`,
      },
      {
        classes: "ai-fmt-inventory-slot",
        label: "Inventory Slot",
        when: "Compact inline item references in inventory lists, loot drops, shop listings",
        example: `<span class="ai-fmt-inventory-slot"><span class="ai-fmt-icon ai-fmt-icon-potion"></span>Health Potion ×3</span>`,
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
      {
        classes: "ai-fmt-dialogue-npc",
        label: "NPC Dialogue",
        when: "Side characters, shopkeepers, quest givers, bystanders, minor friendly characters",
        example: `<span class="ai-fmt-dialogue-npc">Merchant</span> "Take a look at my wares."`,
      },
      {
        classes: "ai-fmt-dialogue-narrator",
        label: "Narrator Dialogue",
        when: "Omniscient narrator, story narrator, breaking the fourth wall, authorial voice",
        example: `<span class="ai-fmt-dialogue-narrator">Narrator</span> "And so, our story begins."`,
      },
      {
        classes: "ai-fmt-dialogue-monster",
        label: "Monster Dialogue",
        when: "Monsters, beasts, demons, non-humanoid creatures, corrupted beings speaking",
        example: `<span class="ai-fmt-dialogue-monster">Shadow Beast</span> "GRAAAH!"`,
      },
      {
        classes: "ai-fmt-dialogue-ai",
        label: "AI / Machine Dialogue",
        when: "AI assistants, robots, computers, virtual assistants, digital entities, automated systems speaking",
        example: `<span class="ai-fmt-dialogue-ai">ARIA-7</span> "Scanning complete. No threats detected."`,
      },
      {
        classes: "ai-fmt-dialogue-love",
        label: "Love Interest Dialogue",
        when: "Romantic interest, significant other, crush, important emotional connection characters",
        example: `<span class="ai-fmt-dialogue-love">Sakura</span> "I've been waiting for you."`,
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
      {
        classes: "ai-fmt-dramatic",
        label: "Dramatic Emphasis",
        when: "Dramatic moments, shocking reveals, important realizations, turning points — bolder than normal text",
        example: `He was already <span class="ai-fmt-dramatic">dead</span>.`,
      },
      {
        classes: "ai-fmt-foreign",
        label: "Foreign / Untranslated Word",
        when: "Words left in original language, foreign terms, untranslated names, real-world loan words",
        example: `The <span class="ai-fmt-foreign">sensei</span> nodded approvingly.`,
      },
      {
        classes: "ai-fmt-memory",
        label: "Memory / Recall",
        when: "Brief recalled memories, remembered dialogue, echoed past events inline",
        example: `<span class="ai-fmt-memory">"Don't ever come back," she had said.</span>`,
      },
      {
        classes: "ai-fmt-glow",
        label: "Divine Glow",
        when: "Divine emphasis, holy power, transcendent moments, godly speech, awakening power",
        example: `The <span class="ai-fmt-glow">Blessing of the Ancients</span> activated.`,
      },
      {
        classes: "ai-fmt-muted",
        label: "Muted / De-emphasized",
        when: "Background information, less important details, asides, supplementary text",
        example: `<span class="ai-fmt-muted">(He was the third son of a minor noble family.)</span>`,
      },
      {
        classes: "ai-fmt-smallcaps",
        label: "Small Caps",
        when: "Titles, honorifics, special designations, formal names, rank titles",
        example: `The <span class="ai-fmt-smallcaps">Grand Marshal</span> surveyed the battlefield.`,
      },
      {
        classes: "ai-fmt-mono",
        label: "Monospace / Code",
        when: "Serial numbers, ID codes, coordinates, passwords, codenames, technical identifiers",
        example: `Subject ID: <span class="ai-fmt-mono">SCP-4217</span>`,
      },
      {
        classes: "ai-fmt-strike",
        label: "Strikethrough",
        when: "Cancelled effects, removed items, retracted statements, deleted text, failed actions",
        example: `<span class="ai-fmt-strike">Iron Shield</span> → Mithril Shield`,
      },
      {
        classes: "ai-fmt-warning",
        label: "Warning Text",
        when: "Danger warnings, caution text, alert messages, important safety notices inline",
        example: `<span class="ai-fmt-warning"><span class="ai-fmt-icon ai-fmt-icon-alert"></span>Danger Zone Ahead</span>`,
      },
    ],
  },

  /* ════════════════════════════════════════════════════════════
     HORROR / THRILLER
     ════════════════════════════════════════════════════════════ */
  {
    name: "Horror & Thriller",
    description: "Creepy, unsettling, and fear-inducing text effects for horror and thriller content",
    items: [
      {
        classes: "ai-fmt-whisper",
        label: "Whisper",
        when: "Whispered speech, faint sounds, barely audible words, ghost murmurs, eerie distant voices",
        example: `<span class="ai-fmt-whisper">...come closer...</span>`,
      },
      {
        classes: "ai-fmt-scream",
        label: "Scream / Shout",
        when: "Screaming, yelling in terror, horrified shouts, primal cries, anguished wails",
        example: `<span class="ai-fmt-scream">NO! STAY AWAY!</span>`,
      },
      {
        classes: "ai-fmt-glitch",
        label: "Glitched Text",
        when: "Corrupted text, data glitches, broken transmissions, reality distortion, eldritch corruption, unstable messages",
        example: `<span class="ai-fmt-glitch">Th3 w@lls ar3 br34thing</span>`,
      },
      {
        classes: "ai-fmt-corruption",
        label: "Corruption Block",
        when: "Corrupted data blocks, virus-infected messages, eldritch writing, madness-inducing text, distorted passages",
        example: `<div class="ai-fmt-corruption">ERROR: REALITY ANCHOR FAILED\nDIMENSIONAL BREACH DETECTED\n[COGNITOHAZARD EXPUNGED]</div>`,
      },
      {
        classes: "ai-fmt-dread",
        label: "Dread Emphasis",
        when: "Ominous words, dreadful revelations, creeping realization, something deeply wrong",
        example: `And then he noticed — the door was <span class="ai-fmt-dread">already open</span>.`,
      },
      {
        classes: "ai-fmt-creepy-note",
        label: "Creepy Note / Journal",
        when: "Found notes, journal entries from the dead, scrawled messages on walls, warnings left behind, blood-stained letters",
        example: `<div class="ai-fmt-creepy-note">Day 7. The scratching in the walls has stopped. Somehow, that's worse.</div>`,
      },
    ],
  },

  /* ════════════════════════════════════════════════════════════
     SCI-FI / CYBERPUNK
     ════════════════════════════════════════════════════════════ */
  {
    name: "Sci-Fi & Cyberpunk",
    description: "Terminal output, holograms, AI voices, and tech readouts for science fiction",
    items: [
      {
        classes: "ai-fmt-terminal",
        label: "Terminal / Console Output",
        when: "Computer terminal output, console logs, command line text, program output, ship systems readouts",
        example: `<div class="ai-fmt-terminal">&gt; SYSTEM BOOT SEQUENCE INITIATED\n&gt; Loading neural interface... OK\n&gt; Connection established.</div>`,
      },
      {
        classes: "ai-fmt-terminal-prompt",
        label: "Terminal Prompt",
        when: "Command line prompt character, system prefix, input indicator within terminal blocks",
        example: `<span class="ai-fmt-terminal-prompt">root@nexus:~$</span> scan --deep`,
      },
      {
        classes: "ai-fmt-hologram",
        label: "Hologram Text",
        when: "Holographic displays, projected text, AR overlays, virtual reality text, augmented info",
        example: `The <span class="ai-fmt-hologram">THREAT LEVEL: HIGH</span> warning flickered above.`,
      },
      {
        classes: "ai-fmt-data-stream",
        label: "Data Stream",
        when: "Data readouts, sensor readings, numerical streams, telemetry, monitoring output",
        example: `<span class="ai-fmt-data-stream">VITALS: HR 72 | BP 120/80 | O2 98%</span>`,
      },
      {
        classes: "ai-fmt-ai-voice",
        label: "AI Voice",
        when: "AI speech, machine narration, computer announcements (not dialogue tag — use for inline AI text styling)",
        example: `<span class="ai-fmt-ai-voice">Probability of survival: 23.7%</span>`,
      },
      {
        classes: "ai-fmt-transmission",
        label: "Transmission / Signal",
        when: "Radio transmissions, intercepted messages, distress signals, broadcast text, comms chatter",
        example: `<div class="ai-fmt-transmission"><span class="ai-fmt-icon ai-fmt-icon-radio"></span>MAYDAY MAYDAY — This is Colony Ship Artemis — Requesting immediate assistance</div>`,
      },
      {
        classes: "ai-fmt-coordinates",
        label: "Coordinates / Tech Readout",
        when: "Coordinates, serial numbers, frequencies, measurements, technical values inline",
        example: `Location: <span class="ai-fmt-coordinates">47.3°N 122.3°W | Alt: 12,400m</span>`,
      },
    ],
  },

  /* ════════════════════════════════════════════════════════════
     ROMANCE
     ════════════════════════════════════════════════════════════ */
  {
    name: "Romance",
    description: "Emotional moments, heartbeat, blush effects for romance and slice-of-life",
    items: [
      {
        classes: "ai-fmt-heartbeat",
        label: "Heartbeat / Pounding",
        when: "Heart pounding, heartbeat moments, pulse racing, intense emotional reaction, romantic tension",
        example: `Her heart was <span class="ai-fmt-heartbeat">pounding</span>.`,
      },
      {
        classes: "ai-fmt-blush",
        label: "Blush / Flustered",
        when: "Blushing, embarrassment, flustered reactions, shy moments, heated cheeks",
        example: `<span class="ai-fmt-blush">"I-I didn't mean it like that!"</span>`,
      },
      {
        classes: "ai-fmt-emotional",
        label: "Emotional Moment Block",
        when: "Key emotional scenes, confessions, tearful moments, emotional breakthroughs, pivotal feelings — block level",
        example: `<div class="ai-fmt-emotional">For the first time in years, she allowed herself to cry.</div>`,
      },
      {
        classes: "ai-fmt-flutter",
        label: "Flutter / Butterflies",
        when: "Butterflies in stomach, giddy feeling, light-headed from attraction, swooning, nervous excitement",
        example: `<span class="ai-fmt-flutter">Every time he smiled, the world seemed brighter.</span>`,
      },
    ],
  },

  /* ════════════════════════════════════════════════════════════
     MYSTERY / DETECTIVE
     ════════════════════════════════════════════════════════════ */
  {
    name: "Mystery & Detective",
    description: "Clues, evidence, suspects, and deduction for mystery and thriller stories",
    items: [
      {
        classes: "ai-fmt-clue",
        label: "Clue Highlight",
        when: "Discovered clues, important evidence, key observations, suspicious details — inline highlight",
        example: `He noticed the <span class="ai-fmt-clue">broken window latch</span> immediately.`,
      },
      {
        classes: "ai-fmt-evidence-card",
        label: "Evidence Card",
        when: "Presenting a piece of evidence, forensic results, crime scene findings, lab reports — block level",
        example: `<div class="ai-fmt-evidence-card"><div class="ai-fmt-evidence-label"><span class="ai-fmt-icon ai-fmt-icon-search"></span>Evidence #3</div>A partial fingerprint was found on the inner door handle, matching no one in the household.</div>`,
      },
      {
        classes: "ai-fmt-redacted",
        label: "Redacted Text",
        when: "Censored information, classified data, blacked-out text, hidden spoilers, expunged records",
        example: `The subject's real name was <span class="ai-fmt-redacted">CLASSIFIED</span>.`,
      },
      {
        classes: "ai-fmt-suspect",
        label: "Suspect Name",
        when: "Suspect names, persons of interest, accused individuals — inline dotted underline emphasis",
        example: `All evidence pointed toward <span class="ai-fmt-suspect">Dr. Whitmore</span>.`,
      },
      {
        classes: "ai-fmt-case-note",
        label: "Case Note / Deduction",
        when: "Detective's notes, deductive reasoning, case file entries, investigation journal — block level",
        example: `<div class="ai-fmt-case-note"><span class="ai-fmt-icon ai-fmt-icon-feather"></span>The timeline doesn't add up. If the victim was alive at 9 PM, how did the witness see blood at 8:45?</div>`,
      },
    ],
  },

  /* ════════════════════════════════════════════════════════════
     RANKER / PROGRESSION / TOWER
     ════════════════════════════════════════════════════════════ */
  {
    name: "Ranker & Progression",
    description: "Rank badges, floor indicators, skill tags, and class badges for ranker/tower/LitRPG content",
    items: [
      {
        classes: "ai-fmt-rank-badge ai-fmt-rank-sss",
        label: "SSS Rank",
        when: "SSS-rank, supreme tier, god-level ranking",
        example: `<span class="ai-fmt-rank-badge ai-fmt-rank-sss">SSS</span>`,
      },
      {
        classes: "ai-fmt-rank-badge ai-fmt-rank-ss",
        label: "SS Rank",
        when: "SS-rank, transcendent tier ranking",
        example: `<span class="ai-fmt-rank-badge ai-fmt-rank-ss">SS</span>`,
      },
      {
        classes: "ai-fmt-rank-badge ai-fmt-rank-s",
        label: "S Rank",
        when: "S-rank hunters, S-tier, top ranking, highest normal tier",
        example: `<span class="ai-fmt-rank-badge ai-fmt-rank-s">S</span>`,
      },
      {
        classes: "ai-fmt-rank-badge ai-fmt-rank-a",
        label: "A Rank",
        when: "A-rank, elite tier, second highest ranking",
        example: `<span class="ai-fmt-rank-badge ai-fmt-rank-a">A</span>`,
      },
      {
        classes: "ai-fmt-rank-badge ai-fmt-rank-b",
        label: "B Rank",
        when: "B-rank, advanced tier, upper-middle ranking",
        example: `<span class="ai-fmt-rank-badge ai-fmt-rank-b">B</span>`,
      },
      {
        classes: "ai-fmt-rank-badge ai-fmt-rank-c",
        label: "C Rank",
        when: "C-rank, intermediate tier, middle ranking",
        example: `<span class="ai-fmt-rank-badge ai-fmt-rank-c">C</span>`,
      },
      {
        classes: "ai-fmt-rank-badge ai-fmt-rank-d",
        label: "D Rank",
        when: "D-rank, beginner tier, low ranking",
        example: `<span class="ai-fmt-rank-badge ai-fmt-rank-d">D</span>`,
      },
      {
        classes: "ai-fmt-rank-badge ai-fmt-rank-e",
        label: "E Rank",
        when: "E-rank, lowest normal tier, baseline ranking",
        example: `<span class="ai-fmt-rank-badge ai-fmt-rank-e">E</span>`,
      },
      {
        classes: "ai-fmt-rank-badge ai-fmt-rank-f",
        label: "F Rank",
        when: "F-rank, absolute lowest tier, trash tier, weakest",
        example: `<span class="ai-fmt-rank-badge ai-fmt-rank-f">F</span>`,
      },
      {
        classes: "ai-fmt-floor-badge",
        label: "Floor / Level Indicator",
        when: "Tower floors, dungeon levels, stage numbers, floor indicators in tower climbing stories",
        example: `<span class="ai-fmt-floor-badge"><span class="ai-fmt-icon ai-fmt-icon-layers"></span>Floor 47</span>`,
      },
      {
        classes: "ai-fmt-skill-tag ai-fmt-skill-active",
        label: "Active Skill Tag",
        when: "Active skills, usable abilities, castable spells, on-demand powers",
        example: `<span class="ai-fmt-skill-tag ai-fmt-skill-active"><span class="ai-fmt-icon ai-fmt-icon-zap"></span>Shadow Strike</span>`,
      },
      {
        classes: "ai-fmt-skill-tag ai-fmt-skill-passive",
        label: "Passive Skill Tag",
        when: "Passive skills, innate abilities, always-on buffs, permanent traits",
        example: `<span class="ai-fmt-skill-tag ai-fmt-skill-passive"><span class="ai-fmt-icon ai-fmt-icon-shield"></span>Iron Body</span>`,
      },
      {
        classes: "ai-fmt-skill-tag ai-fmt-skill-ultimate",
        label: "Ultimate Skill Tag",
        when: "Ultimate abilities, unique skills, signature moves, awakened powers, trump cards",
        example: `<span class="ai-fmt-skill-tag ai-fmt-skill-ultimate"><span class="ai-fmt-icon ai-fmt-icon-flame"></span>Monarch's Domain</span>`,
      },
      {
        classes: "ai-fmt-class-badge",
        label: "Class / Job Badge",
        when: "Character class, job class, profession, role designation (Assassin, Mage, Healer, etc.)",
        example: `<span class="ai-fmt-class-badge"><span class="ai-fmt-icon ai-fmt-icon-swords"></span>Shadow Monarch</span>`,
      },
      {
        classes: "ai-fmt-title-badge",
        label: "Title / Achievement Badge",
        when: "Earned titles, achievements, honorifics, special designations, accomplishment badges",
        example: `<span class="ai-fmt-title-badge"><span class="ai-fmt-icon ai-fmt-icon-crown"></span>Slayer of Kings</span>`,
      },
      {
        classes: "ai-fmt-dungeon-name",
        label: "Dungeon / Gate Name",
        when: "Named dungeons, gates, instances, raid zones, hunting grounds — inline emphasis",
        example: `They stood before the <span class="ai-fmt-dungeon-name">Crimson Abyss</span>.`,
      },
    ],
  },

  /* ════════════════════════════════════════════════════════════
     STATUS WINDOW / GAME UI PANELS
     ════════════════════════════════════════════════════════════ */
  {
    name: "Status Windows & Game UI",
    description: "Status panels, progress bars, quest cards, notifications — Korean/Chinese/Japanese web novel style game interfaces",
    items: [
      {
        classes: "ai-fmt-window",
        label: "Status Window",
        when: "Game status windows, character panels, system windows, interface popups — the outer container. Use with ai-fmt-window-header and ai-fmt-window-body inside.",
        example: `<div class="ai-fmt-window"><div class="ai-fmt-window-header"><span class="ai-fmt-icon ai-fmt-icon-user"></span>Status Window</div><div class="ai-fmt-window-body"><div class="ai-fmt-window-row"><span class="ai-fmt-window-label">Name</span><span class="ai-fmt-window-value">Jin-Woo</span></div><div class="ai-fmt-window-row"><span class="ai-fmt-window-label">Level</span><span class="ai-fmt-window-value">97</span></div><hr class="ai-fmt-window-divider"><div class="ai-fmt-progress"><span class="ai-fmt-window-label">HP</span><div class="ai-fmt-progress-bar"><div class="ai-fmt-progress-fill ai-fmt-hp" style="width:75%"></div></div><span class="ai-fmt-progress-text">3200/4250</span></div></div></div>`,
      },
      {
        classes: "ai-fmt-notification",
        label: "Notification Popup",
        when: "Pop-up notifications, toast messages, system alerts, achievement popups — compact block with left accent",
        example: `<div class="ai-fmt-notification"><span class="ai-fmt-icon ai-fmt-icon-unlock"></span>New Skill Acquired: <strong>Ruler's Authority</strong></div>`,
      },
      {
        classes: "ai-fmt-notification ai-fmt-notif-danger",
        label: "Danger Notification",
        when: "Danger alerts, health warnings, death notifications, threat popups",
        example: `<div class="ai-fmt-notification ai-fmt-notif-danger"><span class="ai-fmt-icon ai-fmt-icon-alert"></span>HP Critical — 12% Remaining</div>`,
      },
      {
        classes: "ai-fmt-notification ai-fmt-notif-success",
        label: "Success Notification",
        when: "Rewards received, tasks completed, items acquired, positive outcomes",
        example: `<div class="ai-fmt-notification ai-fmt-notif-success"><span class="ai-fmt-icon ai-fmt-icon-trophy"></span>Achievement Unlocked: First Blood</div>`,
      },
      {
        classes: "ai-fmt-notification ai-fmt-notif-warning",
        label: "Warning Notification",
        when: "Caution popups, mild warnings, approaching limits, environmental hazards",
        example: `<div class="ai-fmt-notification ai-fmt-notif-warning"><span class="ai-fmt-icon ai-fmt-icon-alert"></span>Mana reserves below 20%</div>`,
      },
      {
        classes: "ai-fmt-quest-card",
        label: "Quest Card",
        when: "Quest descriptions, mission briefings, objectives, daily quests — block container",
        example: `<div class="ai-fmt-quest-card"><div class="ai-fmt-quest-title"><span class="ai-fmt-icon ai-fmt-icon-scroll"></span>Emergency Quest: Survive</div><div class="ai-fmt-quest-objective">Defeat all enemies within the penalty zone. (0/???)</div><div class="ai-fmt-quest-reward"><span class="ai-fmt-icon ai-fmt-icon-gem"></span>Reward: ???</div></div>`,
      },
      {
        classes: "ai-fmt-quest-title ai-fmt-quest-done",
        label: "Completed Quest Title",
        when: "Completed / turned-in quests, finished objectives",
        example: `<span class="ai-fmt-quest-title ai-fmt-quest-done">Retrieve the Lost Artifact</span>`,
      },
    ],
  },

  /* ════════════════════════════════════════════════════════════
     COMBAT / ACTION
     ════════════════════════════════════════════════════════════ */
  {
    name: "Combat & Action",
    description: "Damage numbers, critical hits, combos, healing, and battle sequences",
    items: [
      {
        classes: "ai-fmt-crit",
        label: "Critical Hit",
        when: "Critical hits, critical damage, critical success, devastating blows — inline number with emphasis",
        example: `<span class="ai-fmt-crit"><span class="ai-fmt-icon ai-fmt-icon-flame"></span>CRITICAL! -9,432</span>`,
      },
      {
        classes: "ai-fmt-damage",
        label: "Damage Number",
        when: "Normal damage dealt, attack damage, hit points lost — inline red number",
        example: `<span class="ai-fmt-damage">-1,250</span>`,
      },
      {
        classes: "ai-fmt-heal",
        label: "Heal Number",
        when: "Healing received, HP restored, regeneration ticks, recovery — inline green number",
        example: `<span class="ai-fmt-heal">+800</span>`,
      },
      {
        classes: "ai-fmt-miss",
        label: "Miss / Evade",
        when: "Missed attacks, dodged hits, evaded damage, immune, resisted — inline strikethrough",
        example: `<span class="ai-fmt-miss">MISS</span>`,
      },
      {
        classes: "ai-fmt-combo",
        label: "Combo / Chain",
        when: "Combo counts, hit chains, multi-hit indicators, consecutive strike counters",
        example: `<span class="ai-fmt-combo">12 HIT COMBO!</span>`,
      },
      {
        classes: "ai-fmt-skill-activate",
        label: "Skill Activation",
        when: "Skill being activated, spell being cast, ability triggered — inline emphasis for the skill name in narrative",
        example: `He activated <span class="ai-fmt-skill-activate">Shadow Exchange</span> without hesitation.`,
      },
      {
        classes: "ai-fmt-combat-log",
        label: "Combat Log Block",
        when: "Battle round summaries, combat sequence logs, fight play-by-play — block container",
        example: `<div class="ai-fmt-combat-log"><span class="ai-fmt-icon ai-fmt-icon-swords"></span>Round 3 — Jin-Woo attacks twice. <span class="ai-fmt-damage">-2,100</span> <span class="ai-fmt-damage">-1,870</span>. The boss staggers.</div>`,
      },
    ],
  },

  /* ════════════════════════════════════════════════════════════
     WUXIA / XIANXIA / CULTIVATION
     ════════════════════════════════════════════════════════════ */
  {
    name: "Wuxia & Cultivation",
    description: "Qi energy, martial techniques, breakthroughs, sects, and cultivation realms",
    items: [
      {
        classes: "ai-fmt-qi",
        label: "Qi / Energy",
        when: "Qi references, mana types, spiritual energy, cultivation power, chi, ki, aura mentions — inline highlight",
        example: `His <span class="ai-fmt-qi">Profound Qi</span> surged through his meridians.`,
      },
      {
        classes: "ai-fmt-technique",
        label: "Martial Technique",
        when: "Named martial arts techniques, combat moves, sword forms, cultivation techniques, secret arts — inline highlight",
        example: `He unleashed the <span class="ai-fmt-technique">Nine Heavens Thunder Palm</span>.`,
      },
      {
        classes: "ai-fmt-breakthrough",
        label: "Breakthrough Announcement",
        when: "Realm breakthrough, stage advancement, tribulation passed, evolution complete — centered block announcement",
        example: `<div class="ai-fmt-breakthrough"><span class="ai-fmt-icon ai-fmt-icon-arrow-up"></span>Breakthrough! Nascent Soul Stage — Early</div>`,
      },
      {
        classes: "ai-fmt-cultivation-stage",
        label: "Cultivation Stage Badge",
        when: "Current cultivation realm/stage, power level tier, cultivation rank — inline badge",
        example: `<span class="ai-fmt-cultivation-stage"><span class="ai-fmt-icon ai-fmt-icon-mountain"></span>Core Formation — Peak</span>`,
      },
      {
        classes: "ai-fmt-sect",
        label: "Sect / Clan Name",
        when: "Sect names, clan names, school names, martial families, cultivation organizations — inline bold emphasis",
        example: `He was a disciple of the <span class="ai-fmt-sect">Azure Cloud Sect</span>.`,
      },
      {
        classes: "ai-fmt-insight",
        label: "Dao Insight / Comprehension",
        when: "Dao comprehension moments, enlightenment, insight into laws of nature, heavenly understanding — block with left border",
        example: `<div class="ai-fmt-insight">In that moment, he understood — the sword was not about cutting. It was about severing fate itself.</div>`,
      },
    ],
  },

  /* ════════════════════════════════════════════════════════════
     LITERARY / GENERAL FICTION
     ════════════════════════════════════════════════════════════ */
  {
    name: "Literary & General Fiction",
    description: "Flashbacks, letters, epigraphs, time skips, poetry, dreams — broad literary devices",
    items: [
      {
        classes: "ai-fmt-flashback",
        label: "Flashback Block",
        when: "Extended flashback sequences, past memories, recalled scenes, historical passages — block level",
        example: `<div class="ai-fmt-flashback">Ten years ago, the village had been full of laughter...</div>`,
      },
      {
        classes: "ai-fmt-letter-block",
        label: "Letter / Note Block",
        when: "Written letters, handwritten notes, formal correspondence, scrolls, messages on paper, diary entries",
        example: `<div class="ai-fmt-letter-block">My dearest Eleanor,<br><br>By the time you read this, I will be gone. Do not grieve for me — I made my choice freely.<br><br>Yours always, R.</div>`,
      },
      {
        classes: "ai-fmt-epigraph-block",
        label: "Epigraph / Chapter Quote",
        when: "Chapter opening quotes, book excerpts, philosophical quotes, famous sayings at chapter start",
        example: `<div class="ai-fmt-epigraph-block">"The only thing we have to fear is fear itself."<span class="ai-fmt-epigraph-source">— Franklin D. Roosevelt</span></div>`,
      },
      {
        classes: "ai-fmt-timeskip",
        label: "Time Skip / Scene Break",
        when: "Time passing, scene transitions, jumps in time, 'X years later', narrative gaps",
        example: `<div class="ai-fmt-timeskip">— Three Years Later —</div>`,
      },
      {
        classes: "ai-fmt-chapter-heading",
        label: "Chapter Heading",
        when: "Chapter titles, part headings, section titles, arc names",
        example: `<div class="ai-fmt-chapter-heading">Chapter 14: The Reckoning</div>`,
      },
      {
        classes: "ai-fmt-poetry",
        label: "Poetry / Verse Block",
        when: "Poems, verses, songs, chants, incantations presented as multi-line blocks",
        example: `<div class="ai-fmt-poetry">The wind that shakes the barley,<br>Shall carry forth the fallen,<br>And from the ashes, kingdoms rise.</div>`,
      },
      {
        classes: "ai-fmt-song",
        label: "Song / Chant Inline",
        when: "Song lyrics inline, humming, singing, chanting in narrative — not block-level",
        example: `She began to sing softly, <span class="ai-fmt-song">"Across the silver sea, where stars are born..."</span>`,
      },
      {
        classes: "ai-fmt-prophecy",
        label: "Prophecy / Foreshadowing",
        when: "Prophecies, divine predictions, oracle visions, foreshadowing passages, ominous foretelling — centered block",
        example: `<div class="ai-fmt-prophecy">When the twin moons align and shadow swallows flame, the Sealed One shall awaken.</div>`,
      },
      {
        classes: "ai-fmt-dream",
        label: "Dream Sequence",
        when: "Dream scenes, vision sequences, hallucinations, illusion content, astral projection — block level",
        example: `<div class="ai-fmt-dream">He was floating. Below, the city burned in silence, its towers crumbling like sand...</div>`,
      },
      {
        classes: "ai-fmt-separator",
        label: "Scene Separator",
        when: "Visual break between scenes, decorative divider, section separator (use ⁂, * * *, ───, etc.)",
        example: `<div class="ai-fmt-separator">* * *</div>`,
      },
    ],
  },

  /* ════════════════════════════════════════════════════════════
     TRANSLATOR / META / FOOTNOTES
     ════════════════════════════════════════════════════════════ */
  {
    name: "Translator & Meta Notes",
    description: "Translator notes, editor notes, author asides, footnotes, credits, and original text",
    items: [
      {
        classes: "ai-fmt-tn-block",
        label: "Translator Note Block",
        when: "Translator notes, TN blocks, cultural context explanations, translation clarifications — 'Translator: Test Studio' type credits",
        example: `<div class="ai-fmt-tn-block"><div class="ai-fmt-tn-label">Translator Note</div>The term '修真' (xiūzhēn) literally means 'cultivating truth' and refers to the practice of cultivation in Daoist tradition.</div>`,
      },
      {
        classes: "ai-fmt-tn-inline",
        label: "Translator Note Inline",
        when: "Brief inline translator asides, quick clarifications, short TN within narrative flow",
        example: `He called out "니가!" <span class="ai-fmt-tn-inline">[TN: an informal 'you' in Korean]</span>`,
      },
      {
        classes: "ai-fmt-editor-note",
        label: "Editor Note",
        when: "Editor's notes, editorial comments, editing clarifications, proofreader notes",
        example: `<div class="ai-fmt-editor-note"><div class="ai-fmt-tn-label">Editor's Note</div>This chapter was revised from the original web novel version.</div>`,
      },
      {
        classes: "ai-fmt-author-note",
        label: "Author Note",
        when: "Author's notes, afterword, author commentary, writer asides, author's thoughts",
        example: `<div class="ai-fmt-author-note"><div class="ai-fmt-tn-label">Author's Note</div>Thank you for reading! Next chapter will be released on Thursday.</div>`,
      },
      {
        classes: "ai-fmt-footnote-ref",
        label: "Footnote Reference",
        when: "Footnote superscript number, reference marker in text pointing to a footnote below",
        example: `The ancient ritual<span class="ai-fmt-footnote-ref">1</span> required three components.`,
      },
      {
        classes: "ai-fmt-footnote",
        label: "Footnote Body",
        when: "Footnote content, endnote text, reference explanation at bottom of section",
        example: `<div class="ai-fmt-footnote"><span class="ai-fmt-footnote-ref">1</span> This ritual is first described in Chapter 3 of the <em>Codex Arcanum</em>.</div>`,
      },
      {
        classes: "ai-fmt-credit",
        label: "Credit / Attribution",
        when: "Translation studio credits, publisher credits, source attributions, 'Translated by X Studio', chapter source info",
        example: `<span class="ai-fmt-credit">Translator: Test Studio | Editor: SilverPen</span>`,
      },
      {
        classes: "ai-fmt-original-text",
        label: "Original Language Text",
        when: "Original language text shown alongside translation, romanization, raw text before translation",
        example: `<span class="ai-fmt-original-text">天道酬勤</span> — Heaven rewards the diligent.`,
      },
    ],
  },

  /* ════════════════════════════════════════════════════════════
     WORLD-BUILDING / LOCATIONS / FACTIONS
     ════════════════════════════════════════════════════════════ */
  {
    name: "World-Building",
    description: "Location cards, faction badges, lore entries, races, eras — for any genre with rich world-building",
    items: [
      {
        classes: "ai-fmt-location-card",
        label: "Location Card",
        when: "Named locations being introduced with description, places of interest, dungeon rooms, cities, regions",
        example: `<div class="ai-fmt-location-card"><span class="ai-fmt-location-name"><span class="ai-fmt-icon ai-fmt-icon-map"></span>The Sunken Library</span> — An ancient repository submerged beneath Lake Veil, said to hold forbidden knowledge.</div>`,
      },
      {
        classes: "ai-fmt-faction",
        label: "Faction Badge (Neutral)",
        when: "Organization names, guild names, group affiliations, faction membership — neutral alignment",
        example: `He was a member of the <span class="ai-fmt-faction">Hunter's Association</span>.`,
      },
      {
        classes: "ai-fmt-faction ai-fmt-faction-hostile",
        label: "Hostile Faction Badge",
        when: "Enemy factions, hostile organizations, antagonist groups",
        example: `The <span class="ai-fmt-faction ai-fmt-faction-hostile">Demon Army</span> approached from the north.`,
      },
      {
        classes: "ai-fmt-faction ai-fmt-faction-friendly",
        label: "Friendly Faction Badge",
        when: "Ally factions, friendly organizations, allied groups",
        example: `Reinforcements from the <span class="ai-fmt-faction ai-fmt-faction-friendly">Holy Order</span> arrived.`,
      },
      {
        classes: "ai-fmt-lore-block",
        label: "Lore Entry Block",
        when: "World lore dumps, historical passages, encyclopedia entries, bestiary entries, world history — block container",
        example: `<div class="ai-fmt-lore-block"><span class="ai-fmt-icon ai-fmt-icon-book"></span><strong>The Cataclysm</strong> — 500 years ago, the barrier between worlds shattered, flooding the realm with mana and monsters.</div>`,
      },
      {
        classes: "ai-fmt-race",
        label: "Race / Species Name",
        when: "Race names, species names, creature types, humanoid types — small caps inline",
        example: `The <span class="ai-fmt-race">High Elves</span> rarely descended from their mountain citadels.`,
      },
      {
        classes: "ai-fmt-era",
        label: "Era / Time Period",
        when: "Named eras, time periods, ages, epochs — italic inline",
        example: `During the <span class="ai-fmt-era">Age of Twilight</span>, magic began to fade.`,
      },
    ],
  },

  /* ════════════════════════════════════════════════════════════
     ICONS
     ════════════════════════════════════════════════════════════ */
  {
    name: "Icons",
    description: "Inline SVG icons — use on stat labels, badges, item names, and system messages. Add before text.",
    items: [
      { classes: "ai-fmt-icon ai-fmt-icon-sword", label: "Sword", when: "Combat, attack, melee, damage", example: `<span class="ai-fmt-icon ai-fmt-icon-sword"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-swords", label: "Crossed Swords", when: "Battle, PvP, duel, clash, versus", example: `<span class="ai-fmt-icon ai-fmt-icon-swords"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-shield", label: "Shield", when: "Defense, armor, protection, blocking", example: `<span class="ai-fmt-icon ai-fmt-icon-shield"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-sparkle", label: "Sparkle", when: "Magic, mana, special abilities, enchantment", example: `<span class="ai-fmt-icon ai-fmt-icon-sparkle"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-zap", label: "Zap", when: "Speed, energy, lightning, activation", example: `<span class="ai-fmt-icon ai-fmt-icon-zap"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-scroll", label: "Scroll", when: "Knowledge, lore, quests, messages", example: `<span class="ai-fmt-icon ai-fmt-icon-scroll"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-skull", label: "Skull", when: "Death, danger, kills, threats", example: `<span class="ai-fmt-icon ai-fmt-icon-skull"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-arrow-up", label: "Arrow Up", when: "Level up, increase, growth, progression", example: `<span class="ai-fmt-icon ai-fmt-icon-arrow-up"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-gem", label: "Gem", when: "Rarity, treasure, gems, currency", example: `<span class="ai-fmt-icon ai-fmt-icon-gem"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-trophy", label: "Trophy", when: "Rank, achievement, victory, titles", example: `<span class="ai-fmt-icon ai-fmt-icon-trophy"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-heart", label: "Heart", when: "Health, HP, healing, vitality, romance", example: `<span class="ai-fmt-icon ai-fmt-icon-heart"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-star", label: "Star", when: "Rating, level, quality, favorites", example: `<span class="ai-fmt-icon ai-fmt-icon-star"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-flame", label: "Flame", when: "Fire, power, intensity, burning, critical", example: `<span class="ai-fmt-icon ai-fmt-icon-flame"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-eye", label: "Eye", when: "Perception, spirit, vision, awareness, insight", example: `<span class="ai-fmt-icon ai-fmt-icon-eye"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-crown", label: "Crown", when: "Royalty, authority, leadership, nobility", example: `<span class="ai-fmt-icon ai-fmt-icon-crown"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-book", label: "Book", when: "Skills, learning, spellbook, knowledge, lore", example: `<span class="ai-fmt-icon ai-fmt-icon-book"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-target", label: "Target", when: "Accuracy, focus, aim, precision", example: `<span class="ai-fmt-icon ai-fmt-icon-target"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-plus", label: "Plus", when: "Gain, addition, healing, bonus", example: `<span class="ai-fmt-icon ai-fmt-icon-plus"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-user", label: "User", when: "Character, player, name, identity, profile", example: `<span class="ai-fmt-icon ai-fmt-icon-user"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-bolt", label: "Bolt", when: "Agility, lightning, quick actions", example: `<span class="ai-fmt-icon ai-fmt-icon-bolt"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-ghost", label: "Ghost", when: "Horror, spirits, haunting, undead, supernatural", example: `<span class="ai-fmt-icon ai-fmt-icon-ghost"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-moon", label: "Moon", when: "Night, darkness, stealth, shadow, lunar", example: `<span class="ai-fmt-icon ai-fmt-icon-moon"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-sun", label: "Sun", when: "Light, holy, day, radiance, solar", example: `<span class="ai-fmt-icon ai-fmt-icon-sun"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-lock", label: "Lock", when: "Locked, sealed, restricted, unavailable, requirement not met", example: `<span class="ai-fmt-icon ai-fmt-icon-lock"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-unlock", label: "Unlock", when: "Unlocked, opened, access granted, requirement met", example: `<span class="ai-fmt-icon ai-fmt-icon-unlock"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-alert", label: "Alert Triangle", when: "Warning, caution, danger, alert, hazard", example: `<span class="ai-fmt-icon ai-fmt-icon-alert"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-clock", label: "Clock", when: "Time, countdown, duration, cooldown, temporal", example: `<span class="ai-fmt-icon ai-fmt-icon-clock"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-map", label: "Map", when: "Location, exploration, navigation, territory", example: `<span class="ai-fmt-icon ai-fmt-icon-map"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-potion", label: "Potion", when: "Potions, alchemy, elixirs, consumables, flasks", example: `<span class="ai-fmt-icon ai-fmt-icon-potion"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-music", label: "Music", when: "Music, songs, bards, sound, melody", example: `<span class="ai-fmt-icon ai-fmt-icon-music"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-search", label: "Search", when: "Investigation, detection, searching, analysis", example: `<span class="ai-fmt-icon ai-fmt-icon-search"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-wind", label: "Wind", when: "Wind, speed, movement, air, agility", example: `<span class="ai-fmt-icon ai-fmt-icon-wind"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-droplet", label: "Droplet", when: "Water, blood, rain, liquid, tears, poison", example: `<span class="ai-fmt-icon ai-fmt-icon-droplet"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-mountain", label: "Mountain", when: "Cultivation, realm, earth, stability, immovable", example: `<span class="ai-fmt-icon ai-fmt-icon-mountain"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-terminal", label: "Terminal", when: "Computer, hacking, code, system, digital", example: `<span class="ai-fmt-icon ai-fmt-icon-terminal"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-fingerprint", label: "Fingerprint", when: "Identity, evidence, forensics, biometrics", example: `<span class="ai-fmt-icon ai-fmt-icon-fingerprint"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-layers", label: "Layers", when: "Floors, levels, stacking, tiers, dungeon depth", example: `<span class="ai-fmt-icon ai-fmt-icon-layers"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-coins", label: "Coins", when: "Money, gold, currency, economy, trade", example: `<span class="ai-fmt-icon ai-fmt-icon-coins"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-hourglass", label: "Hourglass", when: "Time running out, temporal magic, patience, waiting", example: `<span class="ai-fmt-icon ai-fmt-icon-hourglass"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-compass", label: "Compass", when: "Direction, guidance, navigation, journey, path", example: `<span class="ai-fmt-icon ai-fmt-icon-compass"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-feather", label: "Feather", when: "Writing, quill, notes, literature, lightness", example: `<span class="ai-fmt-icon ai-fmt-icon-feather"></span>` },
      { classes: "ai-fmt-icon ai-fmt-icon-radio", label: "Radio / Signal", when: "Communication, transmission, broadcast, signal", example: `<span class="ai-fmt-icon ai-fmt-icon-radio"></span>` },
    ],
  },
];

/**
 * Build a compact class reference string for the AI prompt.
 * Structured as a lookup table the AI can scan quickly.
 */
export function buildClassReference(): string {
  const sections: string[] = [];

  // Add composition rules first so the AI sees them at the top
  sections.push(COMPOSITION_RULES);

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

/**
 * Composition rules that tell the AI how to avoid visual clutter
 * from stacking block-level formatted elements back-to-back.
 */
export const COMPOSITION_RULES = `## ⚠ Block Stacking Rules — READ FIRST

NEVER place two or more block-level elements directly adjacent with no prose between them.
Block elements include: stat-block, system-msg, item-card, window, terminal, evidence-card,
letter-block, flashback, epigraph-block, tn-block, quest-card, combat-log, notification,
location-card, lore-block, corruption, transmission, creepy-note, thought, emotional,
case-note, breakthrough, insight, dream, prophecy, poetry, editor-note, author-note.

### What looks BAD (avoid):
\`\`\`
<div class="ai-fmt-system-msg">Level Up!</div>
<div class="ai-fmt-stat-block">...</div>
<div class="ai-fmt-item-card">...</div>
<div class="ai-fmt-notification">...</div>
\`\`\`
Four blocks in a row = wall of boxes. Ugly and hard to read.

### What looks GOOD (do this instead):

**Strategy 1: Interleave prose between blocks**
\`\`\`
<div class="ai-fmt-system-msg">Level Up!</div>
A warm light enveloped him as his stats surged upward.
<div class="ai-fmt-stat-block">...</div>
He checked his inventory — a new item had appeared.
<div class="ai-fmt-item-card">...</div>
\`\`\`

**Strategy 2: Merge related info into ONE block**
Instead of a system-msg + stat-block + notification, put it all into a single window:
\`\`\`
<div class="ai-fmt-window">
  <div class="ai-fmt-window-header">Level Up! Lv. 24 → 25</div>
  <div class="ai-fmt-window-body">
    <div class="ai-fmt-window-row"><span class="ai-fmt-window-label">STR</span><span class="ai-fmt-window-value">45 → 52</span></div>
    ...
  </div>
</div>
\`\`\`

**Strategy 3: Use inline alternatives instead of blocks**
When you have a small amount of info, prefer inline classes over block containers:
- Instead of \`<div class="ai-fmt-item-card">...\` for a quick item mention, use an inline rarity span in narrative
- Instead of \`<div class="ai-fmt-notification">...\` for a short alert, use an inline badge or system-msg
- Instead of \`<div class="ai-fmt-stat-block">...\` for a single stat, use an inline xp-badge

**Strategy 4: Group same-type blocks under a wrapper**
If you MUST list multiple items/quests/evidence, wrap them in a single container. The CSS
will merge same-type adjacent blocks into one visual panel, but you should still limit to 3–4 max.

### Rules of Thumb:
1. Maximum 1 block element before you insert at least 1 sentence of prose
2. If you need 3+ pieces of formatted info, merge into a single window or stat-block
3. A system-msg can precede ONE block (stat-block or window), but not more
4. Inline classes (badges, skill-tags, rank-badges, rarity spans) can stack freely in prose — only block elements are restricted
5. Translator/editor/author notes at the END of a passage can appear together since they naturally group
6. The ONLY exception: quest objectives inside a quest-card (those are nested, not adjacent)
`;