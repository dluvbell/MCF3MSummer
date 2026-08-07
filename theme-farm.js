/* ============================================================================
   theme-farm.js  —  the farm world  (v1, 2026-08-06)

   progress.js is theme-neutral: it runs the challenge, counts stars, tracks
   mastery and keeps the streak, but it does not know what any of that is
   called. This file supplies the words, and for the farm it also supplies the
   catalogue — the thirty-nine things a student can buy and everything the
   engine needs to know about them.

   What the engine takes from here and what it will not:
     it takes  — every label, price, growth figure and produce figure
     it takes  — which wave each item belongs to
     it ignores — boss hp, par, reward, damage, mastery rules, star rates
   Balance for the mathematics stays in the engine on purpose. A world must
   never be able to make the questions easier by accident.

   ---------------------------------------------------------------- economy

   crop    buy the TYPE once, plant it for ever. Each harvest pays half the
           price. `grow` is the growth points it needs, fixed at price x 0.6
           so that every crop earns the same 0.83 stars per point — no crop
           is the "correct" one to plant, which is what keeps the other eight
           from becoming dead art.

   growth  a first-try correct answer is worth 1 point, plus 0.2 for every
           plot beyond the first. Points go to whichever crop is closest to
           ready, so eight plots means variety, not eight times the money.

   animal  buy once, keeps for ever, no upkeep. A farm that starves when a
           student misses a week punishes exactly the student who most needs
           to come back. Produce is collected on every harvest run and is set
           to price / 12, so any animal pays for itself in twelve harvests
           whether it was bought in Unit 1 or after the final boss.

   house   no income. It sets how many decorations can be on display at once,
           2 at the Cabin and 10 at the Castle. Ten decorations exist, so the
           Castle is the only way to show them all.

   plot    no income; it raises the growth rate above.

   deco    no income at all. It is there to be looked at.
   ========================================================================== */

window.MCF3M_THEME = {
    id: "farm",
    name: "Farm",

    ui: {
        stars: "stars earned",

        shopHead: "MARKET \u2014 SPEND YOUR STARS",
        shopNote: "Crops keep for ever once bought. Animals never need feeding.",

        bagHead: "BARN \u2014 WHAT YOU ARE CARRYING",
        bagNote: "Used automatically when they apply. Buy more at the market.",
        bagEmpty: "Nothing here yet. Anything you buy at the market shows up here.",

        tabShop: "Market",
        tabBag: "Barn",
        tabTroph: "Trophies",
        tabBadge: "Badges",
        tabCode: "Save code",
        tabFarm: "Farm",

        switch: "Change world"
    },

    /* Same fight, different meaning. Beating one is what opens the next wave
       of the catalogue, so the words point at the farm rather than at combat. */
    boss: {
        lesson: "Field Trial",
        unit: "Harvest Festival",
        final: "County Fair",
        stand: "LAST HARVEST",
        retreat: "Give up",
        tiring: "nearly done (double progress)",
        retreatAsk: "Give up? The trial resets to the start, but you keep every star you have."
    },

    /* The four ids are the engine's, because their effects are wired into the
       challenge. A world renames and reprices them; it cannot add a fifth. */
    shop: {
        powerCore: {
            name: "Strong Coffee",
            cost: 60,
            desc: "Double progress for your next 3 questions."
        },
        secondWind: {
            name: "Second Wind",
            cost: 80,
            desc: "Turns one missed question back into a first-try hit."
        },
        starLens: {
            name: "Prize Ribbon",
            cost: 100,
            desc: "Doubles the stars you win from this trial."
        },
        streakFreeze: {
            name: "Rain Day",
            cost: 120,
            desc: "Miss a day without losing your streak. 7-day cooldown."
        }
    },

    /* ------------------------------------------------------------------
       the farm itself
       ------------------------------------------------------------------
       wave  "W0" on sale from the start
             "W1".."W4" after that unit's Harvest Festival
             "F"  after the County Fair
             "LS" after the Last Harvest
       art   the sprite name in mcf-sprites.js
       ------------------------------------------------------------------ */
    farm: {
        /* what a new student already owns, so the farm is never an empty field */
        start: ["plot1", "house1", "strawberry", "chicken"],

        /* one-off payment for finishing the course. Deliberately NOT the boss
           reward, which all three worlds share — 1,800 stars in the battle
           world would wipe out a shop where nothing costs over 120. */
        finishBonus: 1800,

        finishTeaser: "Something rare is growing out there. Something is watching the farm. And something is watching the sky.",

        houseSlots: { house1: 2, house2: 3, house3: 4, house4: 6, house5: 8, house6: 10 },

        items: [
            /* ---- plots ---- */
            { id: "plot1", cat: "plot", name: "Plot 1",  wave: "W0", cost: 0,   art: "plot" },
            { id: "plot2", cat: "plot", name: "Plot 2",  wave: "W0", cost: 40,  art: "plot" },
            { id: "plot3", cat: "plot", name: "Plot 3",  wave: "W0", cost: 60,  art: "plot" },
            { id: "plot4", cat: "plot", name: "Plot 4",  wave: "W1", cost: 90,  art: "plot" },
            { id: "plot5", cat: "plot", name: "Plot 5",  wave: "W2", cost: 130, art: "plot" },
            { id: "plot6", cat: "plot", name: "Plot 6",  wave: "W3", cost: 170, art: "plot" },
            { id: "plot7", cat: "plot", name: "Plot 7",  wave: "W4", cost: 210, art: "plot" },
            { id: "plot8", cat: "plot", name: "Plot 8",  wave: "F",  cost: 250, art: "plot" },

            /* ---- house ---- */
            { id: "house1", cat: "house", name: "Cabin",            wave: "W0", cost: 0,   art: "house1", tier: 1 },
            { id: "house2", cat: "house", name: "Farmhouse",        wave: "W0", cost: 70,  art: "house2", tier: 2 },
            { id: "house3", cat: "house", name: "Two-Storey House", wave: "W1", cost: 130, art: "house3", tier: 3 },
            { id: "house4", cat: "house", name: "Stone Villa",      wave: "W2", cost: 200, art: "house4", tier: 4 },
            { id: "house5", cat: "house", name: "Manor",            wave: "W3", cost: 300, art: "house5", tier: 5 },
            { id: "house6", cat: "house", name: "Castle",           wave: "F",  cost: 520, art: "house6", tier: 6 },

            /* ---- crops: grow = cost x 0.6, harvest = cost / 2 ---- */
            { id: "strawberry", cat: "crop", name: "Strawberry",     wave: "W0", cost: 0,   grow: 34,  yield: 20,  art: "crop_strawberry" },
            { id: "sunflower",  cat: "crop", name: "Sunflower",      wave: "W0", cost: 45,  grow: 30,  yield: 22,  art: "crop_sunflower" },
            { id: "pumpkin",    cat: "crop", name: "Pumpkin",        wave: "W0", cost: 55,  grow: 33,  yield: 27,  art: "crop_pumpkin" },
            { id: "blueberry",  cat: "crop", name: "Blueberry Bush", wave: "W1", cost: 95,  grow: 57,  yield: 47,  art: "crop_blueberry" },
            { id: "tomato",     cat: "crop", name: "Cherry Tomatoes",wave: "W2", cost: 120, grow: 72,  yield: 60,  art: "crop_tomato" },
            { id: "watermelon", cat: "crop", name: "Watermelon",     wave: "W2", cost: 150, grow: 90,  yield: 75,  art: "crop_watermelon" },
            { id: "lavender",   cat: "crop", name: "Lavender",       wave: "W3", cost: 190, grow: 114, yield: 95,  art: "crop_lavender" },
            { id: "corn",       cat: "crop", name: "Sweet Corn",     wave: "W4", cost: 240, grow: 144, yield: 120, art: "crop_corn" },
            { id: "goldpumpkin",cat: "crop", name: "Golden Pumpkin", wave: "F",  cost: 320, grow: 192, yield: 160, art: "crop_goldpumpkin" },
            /* showOnly: it is in flower the moment it is bought and is never
               harvested. A student who has beaten the Last Harvest has
               finished the course and stopped answering questions, so growth
               points would never arrive and a trophy plant would sit in the
               field as a sprout for ever. */
            { id: "starfruit",  cat: "crop", name: "Starfruit Vine", wave: "LS", cost: 520, grow: 0, yield: 0, showOnly: true, art: "crop_starfruit" },

            /* ---- animals: produce = cost / 12, collected on every harvest ---- */
            { id: "chicken",  cat: "animal", name: "Chicken",      wave: "W0", cost: 0,   produce: 3,  sells: "eggs",     art: "chicken" },
            { id: "duck",     cat: "animal", name: "Duck",         wave: "W0", cost: 50,  produce: 4,  sells: "eggs",     art: "duck" },
            /* the id stays "goat" even though it is a sheep now: save codes
               already in the wild are keyed on it */
            { id: "goat",     cat: "animal", name: "Sheep",        wave: "W0", cost: 65,  produce: 5,  sells: "wool",     art: "sheep" },
            { id: "cow",      cat: "animal", name: "Cow",          wave: "W1", cost: 110, produce: 9,  sells: "cheese",   art: "cow" },
            { id: "alpaca",   cat: "animal", name: "Alpaca",       wave: "W2", cost: 150, produce: 13, sells: "visitors", art: "alpaca" },
            { id: "beehive",  cat: "animal", name: "Beehive",      wave: "W3", cost: 190, produce: 16, sells: "honey",    art: "beehive" },
            { id: "rabbit",   cat: "animal", name: "Rabbit Hutch", wave: "W4", cost: 230, produce: 19, sells: "visitors", art: "rabbit" },
            { id: "capybara", cat: "animal", name: "Capybara",     wave: "F",  cost: 300, produce: 25, sells: "visitors", art: "capybara" },
            { id: "dragon",   cat: "animal", name: "Fire Dragon",  wave: "LS", cost: 700, produce: 58, sells: "visitors", art: "dragon" },

            /* ---- decorations: no income, they are there to be looked at ---- */
            { id: "picnic",     cat: "deco", name: "Picnic Table",    wave: "W0", cost: 35,  art: "dec_picnic" },
            { id: "lights",     cat: "deco", name: "String Lights",   wave: "W0", cost: 40,  art: "dec_lights" },
            { id: "scarecrow",  cat: "deco", name: "Scarecrow",       wave: "W0", cost: 30,  art: "dec_scarecrow" },
            { id: "firepit",    cat: "deco", name: "Fire Pit",        wave: "W1", cost: 85,  art: "dec_firepit" },
            { id: "hammock",    cat: "deco", name: "Hammock",         wave: "W2", cost: 130, art: "dec_hammock" },
            { id: "greenhouse", cat: "deco", name: "Greenhouse",      wave: "W3", cost: 230, art: "dec_greenhouse" },
            { id: "fountain",   cat: "deco", name: "Fountain",        wave: "W4", cost: 250, art: "dec_fountain" },
            { id: "mural",      cat: "deco", name: "Mural Wall",      wave: "W4", cost: 220, art: "dec_mural" },
            { id: "windmill",   cat: "deco", name: "Windmill",        wave: "F",  cost: 330, art: "dec_windmill" },
            { id: "observatory",cat: "deco", name: "Star Observatory",wave: "LS", cost: 600, art: "dec_observatory" }
        ]
    }
};
