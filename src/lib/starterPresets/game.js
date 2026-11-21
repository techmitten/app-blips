import {
  Axe, Bike, Biohazard, Bird, Blocks, Bomb, Bot, Brain, Bug, Building2,
  Calculator, Car, Castle, Cherry, CircleDot, CircleDotDashed, Club, Coins,
  Compass, Cookie, Crosshair, Crown, Diamond, Dices, Droplets, Egg, Eye, Feather,
  Fish, Flag, Flame, Flashlight, FlaskConical, Flower2, Footprints, Gamepad2,
  Gauge, Ghost, Globe, Goal, Grid2x2, Grid3x3, Hammer, Hand, Hash, Helicopter,
  Hexagon, Joystick, Key, Keyboard, Layers, Lightbulb, Map, Medal, Moon,
  Mountain, MountainSnow, Music, Orbit, Paintbrush, Pickaxe, Pizza, Plane,
  Puzzle, Rabbit, Radar, Rocket, Route, Sailboat, Search, Shapes, Shield, Ship,
  Skull, Snowflake, Spade, Sun, Sword, Swords, Target, Telescope, Timer, Tractor,
  Train, Trophy, Type, Users, Volleyball, Wand2, Waves, WholeWord, Worm, Zap
} from 'lucide-react';

// Game-studio starters. These are gameplay-first: each one names the loop, the
// controls and the win/lose condition so the build starts from something
// actually playable rather than a static mockup. Kept separate from the app
// pool, which still carries its own arcade ideas.
export const GAME_STARTER_PRESETS = [
  {
    title: "Neon Breakout",
    prompt: "A neon arcade breakout game on a canvas with a smooth paddle, multi-hit bricks, falling power-ups (wide paddle, multi-ball, laser), particle shatter effects, three lives, and a persistent high-score table.",
    category: "Arcade",
    icon: Gamepad2,
    featured: true,
    color: "text-violet-600 bg-violet-50"
  },
  {
    title: "Tower Defense",
    prompt: "A grid-based tower defense game where enemies march along a path toward a base, the player places and upgrades several tower types with their own projectiles and effects, waves escalate in difficulty, and gold and lives determine win or loss.",
    category: "Strategy",
    icon: Target,
    featured: true,
    color: "text-rose-600 bg-rose-50"
  },
  {
    title: "Platform Runner",
    prompt: "A side-scrolling platformer with a responsive jump arc, coyote time, moving platforms, collectible coins, stompable enemies, checkpoint flags, and multiple levels loaded from a simple tile map with parallax backgrounds.",
    category: "Platformer",
    icon: Rocket,
    color: "text-sky-600 bg-sky-50"
  },
  {
    title: "Asteroid Field",
    prompt: "A twin-stick space shooter where the ship thrusts and rotates with keyboard or touch, asteroids split when shot, enemy saucers hunt the player, screen wrap, and a wave counter drives the difficulty up.",
    category: "Shooter",
    icon: Bomb,
    featured: true,
    color: "text-amber-600 bg-amber-50"
  },
  {
    title: "Endless Runner",
    prompt: "A one-tap endless runner with auto-scrolling lanes, jump and slide over obstacles, collectible coins, speed that ramps over distance, a score based on meters plus pickups, and an instant restart on death.",
    category: "Arcade",
    icon: Bird,
    color: "text-emerald-600 bg-emerald-50"
  },
  {
    title: "Dungeon Crawler",
    prompt: "A small roguelike dungeon crawler with procedurally generated rooms, grid or smooth movement, melee and ranged attacks, enemies with simple AI, loot and health pickups, and a floor-by-floor difficulty curve.",
    category: "Roguelike",
    icon: Swords,
    color: "text-indigo-600 bg-indigo-50"
  },
  {
    title: "Physics Stacker",
    prompt: "A physics tower-builder where the player drops blocks that topple realistically, a swinging crane adds challenge, height is scored, and a Matter.js simulation handles collisions and stability.",
    category: "Physics",
    icon: Blocks,
    color: "text-teal-600 bg-teal-50"
  },
  {
    title: "Match-3 Puzzle",
    prompt: "A juicy match-3 board with swipe-or-click swapping, cascading matches, special gems for four- and five-in-a-row, a move or time limit, and a score target per level.",
    category: "Puzzle",
    icon: Shapes,
    color: "text-fuchsia-600 bg-fuchsia-50"
  },
  {
    title: "Space Invaders",
    prompt: "A retro wave-based shooter where rows of aliens march and descend, the player's turret fires upward, enemy bombs fall, a destructible bunker line provides cover, and waves speed up as they shrink.",
    category: "Retro",
    icon: Ghost,
    color: "text-violet-600 bg-violet-50"
  },
  {
    title: "Sokoban Puzzle",
    prompt: "A block-pushing Sokoban puzzler with hand-designed levels, undo and restart, move and push counters, a level select grid, and a win state when every crate sits on a target.",
    category: "Puzzle",
    icon: Puzzle,
    color: "text-blue-600 bg-blue-50"
  },
  {
    title: "Racing Time Trial",
    prompt: "A top-down or pseudo-3D racing time trial where the car steers with keyboard or touch, the track has drifting physics and checkpoints, lap times are recorded, and a ghost of the best run is replayed.",
    category: "Racing",
    icon: Gauge,
    color: "text-rose-600 bg-rose-50"
  },
  {
    title: "Tower Stacker",
    prompt: "A precision stacking game where a moving block must be dropped to line up with the tower below, overlapping edges are sliced off, the tower speeds up, and the height sets the score.",
    category: "Arcade",
    icon: Coins,
    color: "text-amber-600 bg-amber-50"
  },
  {
    title: "Whack-a-Mole",
    prompt: "A fast reaction game with moles popping from a grid of holes, tap or click to hit them, bombs that cost a life, a combo multiplier, a 60-second timer, and a local high-score board.",
    category: "Casual",
    icon: Flame,
    color: "text-emerald-600 bg-emerald-50"
  },
  {
    title: "Zeppelin Duel",
    prompt: "A local two-player airship duel on a single shared screen: player one uses WASD and F, player two uses arrows and Enter, each aims and fires cannons with gravity arcs over destructible terrain, and wind shifts each turn.",
    category: "Party",
    icon: Gamepad2,
    color: "text-sky-600 bg-sky-50"
  },
  {
    title: "Snake Arena",
    prompt: "A modern snake game on a grid with smooth interpolated movement, food that grows the snake, golden bonus fruit that expires, walls that appear as the score climbs, swipe or arrow-key controls, and a best-length record.",
    category: "Arcade",
    icon: Worm,
    color: "text-emerald-600 bg-emerald-50"
  },
  {
    title: "Flappy Glide",
    prompt: "A one-button flappy-style game where a little bird flaps through scrolling pipe gaps, gravity pulls it down, the gaps narrow over time, every pipe passed scores a point, and a medal screen shows bronze to platinum.",
    category: "Arcade",
    icon: Feather,
    color: "text-sky-600 bg-sky-50"
  },
  {
    title: "Falling Blocks",
    prompt: "A falling-block puzzle with the seven classic tetromino shapes, rotation with wall kicks, a ghost piece, hold and next-piece previews, hard and soft drop, line clears that speed up the level, and touch swipe controls.",
    category: "Puzzle",
    icon: Layers,
    featured: true,
    color: "text-indigo-600 bg-indigo-50"
  },
  {
    title: "2048 Merge",
    prompt: "A 2048 sliding-tile game on a 4x4 board with swipe and arrow controls, animated slides and merges, a score and best score, an undo button with limited uses, and a keep-going option after reaching 2048.",
    category: "Puzzle",
    icon: Grid2x2,
    color: "text-amber-600 bg-amber-50"
  },
  {
    title: "Minesweeper",
    prompt: "A classic minesweeper with beginner, intermediate and expert boards, a safe first click, flood-fill reveals, right-click or long-press flagging, chording on numbers, a timer and mine counter, and best times per difficulty.",
    category: "Puzzle",
    icon: Bomb,
    color: "text-rose-600 bg-rose-50"
  },
  {
    title: "Pinball Table",
    prompt: "A single-table pinball game with left and right flippers on keys or screen halves, a plunger launch, bumpers and slingshots that kick the ball, lit targets that unlock multiball, a ball-save timer, and three balls per game.",
    category: "Arcade",
    icon: CircleDot,
    color: "text-violet-600 bg-violet-50"
  },
  {
    title: "Pong Rally",
    prompt: "A neon pong game with a one-player mode against a beatable AI and a two-player mode on one keyboard, ball speed that rises with each rally, spin from paddle movement, and first to eleven wins.",
    category: "Retro",
    icon: Joystick,
    color: "text-teal-600 bg-teal-50"
  },
  {
    title: "Maze Chase",
    prompt: "A maze-chase game where the player eats pellets while four ghosts with different chase personalities hunt them, power pellets turn the ghosts vulnerable, fruit bonuses appear, and the level clears when every pellet is gone.",
    category: "Retro",
    icon: Ghost,
    color: "text-amber-600 bg-amber-50"
  },
  {
    title: "Road Crossing",
    prompt: "A lane-hopping crossing game where the player hops forward, back and sideways across busy roads and rivers, rides floating logs, avoids cars and trucks of varying speeds, and reaches safe homes before a timer runs out.",
    category: "Arcade",
    icon: Footprints,
    color: "text-emerald-600 bg-emerald-50"
  },
  {
    title: "Missile Defense",
    prompt: "A missile-defense game where incoming warheads streak toward six cities, the player clicks or taps to fire interceptors that explode in expanding blasts, three bases have limited ammo, and surviving cities earn bonus points each wave.",
    category: "Retro",
    icon: Radar,
    color: "text-rose-600 bg-rose-50"
  },
  {
    title: "Lunar Lander",
    prompt: "A lunar lander game where the player rotates and fires a thruster against gravity, fuel is limited, the terrain is randomly generated with landing pads of different score multipliers, and landing too fast or tilted crashes the ship.",
    category: "Physics",
    icon: Moon,
    color: "text-indigo-600 bg-indigo-50"
  },
  {
    title: "Slingshot Siege",
    prompt: "A slingshot physics game where the player drags back to aim and launch projectiles at wooden and stone towers hiding enemies, structures collapse realistically, a limited number of shots per level earn one to three stars.",
    category: "Physics",
    icon: Castle,
    featured: true,
    color: "text-amber-600 bg-amber-50"
  },
  {
    title: "Mini Golf",
    prompt: "A top-down mini golf game with nine holes, drag-to-aim power shots, bouncing walls, slopes, water hazards, moving windmills, a stroke counter against par for each hole, and a scorecard at the end.",
    category: "Sports",
    icon: Flag,
    color: "text-emerald-600 bg-emerald-50"
  },
  {
    title: "Penalty Shootout",
    prompt: "A football penalty shootout where the player swipes or clicks to aim and curve shots past a reacting goalkeeper, then dives as the keeper to save the opponent's shots, best of five with sudden death.",
    category: "Sports",
    icon: Goal,
    color: "text-sky-600 bg-sky-50"
  },
  {
    title: "Hoop Shots",
    prompt: "A basketball shooting game where the player flicks or drags to throw the ball in an arc at a hoop that moves sideways at higher levels, swishes score extra, a 60-second clock runs, and streaks light the ball on fire.",
    category: "Sports",
    icon: Trophy,
    color: "text-amber-600 bg-amber-50"
  },
  {
    title: "Bowling Alley",
    prompt: "A ten-pin bowling game with aim, power and spin set by a swipe or a timed meter, physics-driven pin collisions, correct strike and spare scoring across ten frames, and a full scorecard.",
    category: "Sports",
    icon: Medal,
    color: "text-blue-600 bg-blue-50"
  },
  {
    title: "Archery Range",
    prompt: "An archery game where the player draws and releases the bow, arrows follow gravity arcs, wind shifts each shot and is shown by a flag, targets move at higher rounds, and ring accuracy decides the score.",
    category: "Sports",
    icon: Crosshair,
    color: "text-rose-600 bg-rose-50"
  },
  {
    title: "Blob Volley",
    prompt: "A two-blob volleyball game where each side jumps and nudges a bouncy ball over the net, play solo against an AI or two players on one keyboard, the ball can't touch your floor, and first to fifteen wins.",
    category: "Sports",
    icon: Volleyball,
    color: "text-teal-600 bg-teal-50"
  },
  {
    title: "Rhythm Tapper",
    prompt: "A four-lane rhythm game where notes scroll toward a hit line in time with a generated Web Audio beat, the player taps lanes or presses D F J K, timing is graded perfect, good or miss, and combos build a multiplier.",
    category: "Rhythm",
    icon: Music,
    featured: true,
    color: "text-violet-600 bg-violet-50"
  },
  {
    title: "Typing Defense",
    prompt: "A typing defense game where words drift toward the player's base, typing a word locks on and destroys it, longer words appear as waves rise, typos break the combo, and words per minute and accuracy show at the end.",
    category: "Typing",
    icon: Keyboard,
    color: "text-sky-600 bg-sky-50"
  },
  {
    title: "Word Guess",
    prompt: "A five-letter word guessing game with six tries, green, yellow and grey letter feedback, an on-screen keyboard that colours used letters, a daily puzzle plus unlimited practice, and win streak statistics.",
    category: "Word",
    icon: WholeWord,
    color: "text-emerald-600 bg-emerald-50"
  },
  {
    title: "Word Search",
    prompt: "A word search game with themed word lists hidden across a letter grid in all eight directions, drag or tap to select words, found words highlight in unique colours, and a timer with a hint button that reveals a first letter.",
    category: "Word",
    icon: Search,
    color: "text-amber-600 bg-amber-50"
  },
  {
    title: "Hangman",
    prompt: "A hangman word game with categories, an on-screen alphabet, a drawing that builds with each wrong guess, a hint that costs points, and a running score across rounds.",
    category: "Word",
    icon: Type,
    color: "text-indigo-600 bg-indigo-50"
  },
  {
    title: "Klondike Solitaire",
    prompt: "A Klondike solitaire game with drag-and-drop or tap-to-move cards, draw one or draw three, auto-move to foundations on double-click, unlimited undo, a move counter and timer, and a celebration when all cards are home.",
    category: "Cards",
    icon: Spade,
    color: "text-emerald-600 bg-emerald-50"
  },
  {
    title: "Blackjack Table",
    prompt: "A blackjack game against a dealer who stands on seventeen, with hit, stand, double down and split, a chip bankroll and betting, a shuffled six-deck shoe, and payouts of 3:2 for blackjack.",
    category: "Cards",
    icon: Club,
    color: "text-rose-600 bg-rose-50"
  },
  {
    title: "Memory Match",
    prompt: "A memory card-flip game with emoji pairs on a grid that grows each level, flip two cards at a time, matched pairs stay revealed, a move counter and timer, and stars awarded for efficient solves.",
    category: "Cards",
    icon: Brain,
    color: "text-violet-600 bg-violet-50"
  },
  {
    title: "Chess vs Computer",
    prompt: "A chess game against a computer opponent with three difficulty levels using minimax search, full legal move rules including castling, en passant and promotion, highlighted legal moves, captured pieces, and check and checkmate detection.",
    category: "Board",
    icon: Crown,
    color: "text-amber-600 bg-amber-50"
  },
  {
    title: "Connect Four",
    prompt: "A connect four game where coloured discs drop and bounce into a seven-by-six grid, play against a smart AI or a second player, the winning line glows, and a score tally carries across rounds.",
    category: "Board",
    icon: CircleDotDashed,
    color: "text-sky-600 bg-sky-50"
  },
  {
    title: "Battleship",
    prompt: "A battleship game where the player places a fleet on a grid, then takes turns firing at the computer's hidden grid, hits and misses are marked with splash and fire effects, sunk ships are announced, and the AI hunts after a hit.",
    category: "Board",
    icon: Ship,
    color: "text-blue-600 bg-blue-50"
  },
  {
    title: "Reversi",
    prompt: "A reversi game on an eight-by-eight board where placing a disc flips every enclosed opponent disc, legal moves are hinted, an AI opponent favours corners, turns are skipped when no move exists, and the disc count decides the winner.",
    category: "Board",
    icon: Grid3x3,
    color: "text-teal-600 bg-teal-50"
  },
  {
    title: "Sudoku",
    prompt: "A sudoku game with generated puzzles at four difficulties, pencil-mark notes, highlighting of matching numbers and conflicts, a hint button, unlimited undo, and a timer with best times.",
    category: "Puzzle",
    icon: Hash,
    color: "text-indigo-600 bg-indigo-50"
  },
  {
    title: "Picture Logic",
    prompt: "A nonogram picture-logic puzzle where row and column clues reveal a hidden pixel image, click or tap to fill and mark cells, completed clues grey out, and the finished picture is shown in colour.",
    category: "Puzzle",
    icon: Paintbrush,
    color: "text-rose-600 bg-rose-50"
  },
  {
    title: "Pipe Connect",
    prompt: "A pipe-connection puzzle where the player rotates tiles on a grid to route water from a source to every outlet before the flow starts, leaks end the level, and later levels add crossings and longer paths.",
    category: "Puzzle",
    icon: Route,
    color: "text-sky-600 bg-sky-50"
  },
  {
    title: "Laser Mirrors",
    prompt: "A light-beam puzzle where the player places and rotates mirrors and splitters on a grid to bounce a laser into every target, coloured filters must match coloured targets, and each level has a par number of pieces.",
    category: "Puzzle",
    icon: Sun,
    color: "text-amber-600 bg-amber-50"
  },
  {
    title: "Ice Slide",
    prompt: "An ice-sliding puzzle where the character slides until hitting a wall or rock, the goal is to reach the exit in as few moves as possible, cracked ice breaks after one pass, and levels grow from tutorial to fiendish.",
    category: "Puzzle",
    icon: Snowflake,
    color: "text-sky-600 bg-sky-50"
  },
  {
    title: "Bullet Hell",
    prompt: "A vertical bullet-hell shooter with a tiny hitbox ship, dense enemy bullet patterns in spirals and fans, a focus mode that slows movement, collectible power-ups, screen-clearing bombs, and a boss at the end of each stage.",
    category: "Shooter",
    icon: Zap,
    color: "text-violet-600 bg-violet-50"
  },
  {
    title: "Zombie Survival",
    prompt: "A top-down zombie survival shooter where the player moves with WASD or a virtual stick and aims with the mouse or a second stick, zombie hordes grow each night, ammo and weapons are scavenged, and barricades buy time.",
    category: "Survival",
    icon: Biohazard,
    color: "text-emerald-600 bg-emerald-50"
  },
  {
    title: "Tank Battle",
    prompt: "A top-down tank battle in a destructible brick maze where the player's tank rotates and fires shells that ricochet once, enemy tanks patrol and hunt, the home base must be protected, and power-ups upgrade armour and fire rate.",
    category: "Shooter",
    icon: Shield,
    color: "text-teal-600 bg-teal-50"
  },
  {
    title: "Cave Copter",
    prompt: "A one-button helicopter game where holding lifts and releasing falls, the cave ceiling and floor narrow and wiggle as distance grows, floating blocks block the way, and the best distance is saved.",
    category: "Arcade",
    icon: Helicopter,
    color: "text-amber-600 bg-amber-50"
  },
  {
    title: "Grapple Swing",
    prompt: "A grappling-hook swinging game where tapping fires a rope at the nearest anchor and the player swings with pendulum physics, releasing at the right moment flings them forward over pits, and momentum carries between swings.",
    category: "Platformer",
    icon: Mountain,
    color: "text-indigo-600 bg-indigo-50"
  },
  {
    title: "Cavern Explorer",
    prompt: "A small metroidvania where the player explores an interconnected cave map, finds abilities like double jump and dash that open new areas, fights enemies and a boss, and a mini-map fills in as rooms are discovered.",
    category: "Adventure",
    icon: Map,
    color: "text-rose-600 bg-rose-50"
  },
  {
    title: "Stealth Heist",
    prompt: "A top-down stealth game where the player sneaks past guards with visible vision cones, hides in shadows, distracts guards with thrown coins, grabs the loot and reaches the exit, and being spotted raises an alarm timer.",
    category: "Stealth",
    icon: Eye,
    color: "text-violet-600 bg-violet-50"
  },
  {
    title: "Dark Manor",
    prompt: "A spooky flashlight exploration game in a pitch-dark manor where only the flashlight cone is visible, batteries drain, keys open locked rooms, a lurking creature follows sounds, and the goal is to find the exit alive.",
    category: "Horror",
    icon: Flashlight,
    color: "text-indigo-600 bg-indigo-50"
  },
  {
    title: "Street Brawler",
    prompt: "A side-scrolling beat 'em up where the player walks right through stages, punches, kicks and grabs waves of thugs, chains combos, picks up weapons and health, and fights a boss at the end of each street.",
    category: "Fighting",
    icon: Sword,
    color: "text-rose-600 bg-rose-50"
  },
  {
    title: "Deckbuilder Duel",
    prompt: "A turn-based deckbuilding card battler where the player draws five cards, spends energy on attacks, blocks and buffs, enemies show their next intent, defeated enemies offer a choice of new cards, and a branching map leads to a boss.",
    category: "Card Battler",
    icon: Diamond,
    featured: true,
    color: "text-blue-600 bg-blue-50"
  },
  {
    title: "Dice Dungeon",
    prompt: "A dice-rolling roguelike where each turn the player rolls a handful of dice and assigns them to attack, defend and heal slots, enemies grow tougher each floor, and victories unlock new dice faces.",
    category: "Roguelike",
    icon: Dices,
    color: "text-amber-600 bg-amber-50"
  },
  {
    title: "Idle Miner",
    prompt: "An idle mining game where the player taps to dig for ore, hires miners that dig automatically, upgrades pickaxes and carts, descends to deeper layers with rarer gems, and earns offline income while away.",
    category: "Idle",
    icon: Pickaxe,
    color: "text-amber-600 bg-amber-50"
  },
  {
    title: "Cookie Empire",
    prompt: "An incremental clicker game where clicking a giant cookie bakes cookies, cookies buy cursors, grannies, farms and factories that bake automatically, upgrades multiply output, numbers grow to huge abbreviations, and progress is saved.",
    category: "Idle",
    icon: Cookie,
    color: "text-rose-600 bg-rose-50"
  },
  {
    title: "Farm Seasons",
    prompt: "A cozy farming game where the player tills soil, plants seeds, waters crops through day cycles, harvests and sells produce, buys new seeds and animals, and seasons change which crops can grow.",
    category: "Simulation",
    icon: Tractor,
    color: "text-emerald-600 bg-emerald-50"
  },
  {
    title: "Pizza Rush",
    prompt: "A time-management cooking game where customers order pizzas with specific toppings, the player drags dough, sauce and toppings, bakes in an oven that can burn, serves before patience meters run out, and tips buy kitchen upgrades.",
    category: "Simulation",
    icon: Pizza,
    color: "text-amber-600 bg-amber-50"
  },
  {
    title: "Fishing Pond",
    prompt: "A relaxing fishing game where the player casts a line with a power meter, waits for a bite, plays a reel-tension minigame to land the catch, fills a collection log of fish species and rarities, and buys better rods.",
    category: "Casual",
    icon: Fish,
    color: "text-sky-600 bg-sky-50"
  },
  {
    title: "Pet Hatchery",
    prompt: "A virtual pet game where an egg hatches into a creature with hunger, happiness and energy meters that drain over real time, the player feeds, plays and puts it to sleep, and well-cared-for pets evolve into new forms.",
    category: "Simulation",
    icon: Egg,
    color: "text-violet-600 bg-violet-50"
  },
  {
    title: "Tiny City",
    prompt: "A small city builder on a tile grid where the player zones houses, shops and factories, lays roads and power, balances a budget from taxes, and population grows when residents have jobs and services.",
    category: "Simulation",
    icon: Building2,
    color: "text-blue-600 bg-blue-50"
  },
  {
    title: "Ant Colony",
    prompt: "An ant colony simulation where ants leave pheromone trails to food, the player places food and obstacles, digs tunnels, spends food to hatch worker and soldier ants, and defends the nest from invading beetles.",
    category: "Simulation",
    icon: Bug,
    color: "text-emerald-600 bg-emerald-50"
  },
  {
    title: "Orbit Slingshot",
    prompt: "A gravity puzzle where the player launches a probe that curves around planets with real orbital pull, the goal is to reach a target portal, black holes and moving moons complicate the path, and fewer attempts earn more stars.",
    category: "Physics",
    icon: Orbit,
    color: "text-indigo-600 bg-indigo-50"
  },
  {
    title: "Bridge Builder",
    prompt: "A bridge-building physics puzzle where the player connects beams and cables between anchor points within a budget, then runs a test where a truck crosses, joints show stress colours, and overloaded beams snap.",
    category: "Physics",
    icon: Hammer,
    color: "text-amber-600 bg-amber-50"
  },
  {
    title: "Falling Sand",
    prompt: "A falling-sand sandbox where the player paints sand, water, oil, fire, plant, stone and lava onto a pixel grid, elements interact (fire burns oil, water cools lava into stone, plants grow in water), and a brush size slider sets the paint size.",
    category: "Sandbox",
    icon: Droplets,
    color: "text-sky-600 bg-sky-50"
  },
  {
    title: "Snowboard Descent",
    prompt: "A downhill snowboarding game on procedurally generated slopes where the player carves left and right, jumps off ramps and spins for trick points, avoids trees and rocks, and an avalanche chases from behind.",
    category: "Sports",
    icon: MountainSnow,
    color: "text-sky-600 bg-sky-50"
  },
  {
    title: "Sailing Regatta",
    prompt: "A top-down sailing race where wind direction changes and the boat's speed depends on its angle to the wind, the player tacks around buoys on a course, races AI boats, and records the fastest finish time.",
    category: "Racing",
    icon: Sailboat,
    color: "text-blue-600 bg-blue-50"
  },
  {
    title: "Rail Switch",
    prompt: "A train-routing puzzle where coloured trains leave stations on a track network and the player taps switches to send each train to its matching coloured station, more trains arrive faster, and collisions end the run.",
    category: "Puzzle",
    icon: Train,
    color: "text-teal-600 bg-teal-50"
  },
  {
    title: "Hex Tactics",
    prompt: "A turn-based tactics game on a hex grid where the player commands knights, archers and mages with movement ranges and attack types, terrain gives cover and height bonuses, and the AI army must be defeated across several missions.",
    category: "Strategy",
    icon: Hexagon,
    color: "text-violet-600 bg-violet-50"
  },
  {
    title: "Space Trader",
    prompt: "A space trading game where the player flies between star systems on a map, buys and sells goods whose prices vary by planet and random events, upgrades cargo holds and engines, fends off pirates, and aims to retire rich.",
    category: "Strategy",
    icon: Telescope,
    color: "text-indigo-600 bg-indigo-50"
  },
  {
    title: "Castle Siege",
    prompt: "A real-time strategy game where two castles face each other across a field, the player spends gold that trickles in to send swordsmen, archers and catapults down three lanes, and the first castle to fall loses.",
    category: "Strategy",
    icon: Crown,
    color: "text-rose-600 bg-rose-50"
  },
  {
    title: "Geography Guess",
    prompt: "A geography quiz where a country outline or flag appears and the player picks its name from four choices or clicks its location on a world map, rounds are timed, continents can be filtered, and streaks earn bonus points.",
    category: "Trivia",
    icon: Globe,
    color: "text-emerald-600 bg-emerald-50"
  },
  {
    title: "Trivia Showdown",
    prompt: "A game-show trivia game with categories like science, history and pop culture, multiple-choice questions on a countdown timer, lifelines like fifty-fifty and skip, climbing prize levels, and a final score screen.",
    category: "Trivia",
    icon: Lightbulb,
    color: "text-amber-600 bg-amber-50"
  },
  {
    title: "Math Blaster",
    prompt: "A math arcade game where falling asteroids carry equations and the player types or taps the correct answer to blast them, difficulty moves from addition up to multiplication and division, and accuracy feeds a rank.",
    category: "Educational",
    icon: Calculator,
    color: "text-teal-600 bg-teal-50"
  },
  {
    title: "Quick Draw Duel",
    prompt: "A two-player reaction duel on one screen or keyboard where both cowboys wait for the signal, the first to press their key after the 'Draw!' wins the round, pressing early is a foul, and best of five takes the match.",
    category: "Party",
    icon: Timer,
    color: "text-amber-600 bg-amber-50"
  },
  {
    title: "Light Cycles",
    prompt: "A light-cycle arena where bikes leave solid neon trails, the player turns at right angles to trap opponents, crashing into any trail is out, play against up to three AI riders or a friend on the same keyboard, and the last rider wins.",
    category: "Party",
    icon: Bike,
    color: "text-sky-600 bg-sky-50"
  },
  {
    title: "Air Hockey",
    prompt: "An air hockey game where each player drags a mallet in their half to hit a sliding puck with realistic bounces off the rails, play against an AI or a friend on a shared touch screen, and first to seven goals wins.",
    category: "Party",
    icon: Hand,
    color: "text-rose-600 bg-rose-50"
  },
  {
    title: "Island Survival",
    prompt: "A survival crafting game on a small island where the player chops trees, mines rocks and gathers berries, crafts tools, a campfire and a shelter, manages hunger and warmth through day and night, and builds a raft to escape.",
    category: "Survival",
    icon: Axe,
    color: "text-emerald-600 bg-emerald-50"
  },
  {
    title: "Boss Rush",
    prompt: "A top-down action boss rush where the player dodge-rolls through telegraphed attacks and fights a series of bosses each with distinct phases and patterns, health carries between fights, and the clear time is ranked.",
    category: "Action",
    icon: Skull,
    color: "text-violet-600 bg-violet-50"
  },
  {
    title: "Bubble Shooter",
    prompt: "A bubble shooter where the player aims a launcher with a guide line, bounces bubbles off the walls, groups of three or more of the same colour pop, unsupported clusters fall for bonus points, and the ceiling drops every few shots.",
    category: "Arcade",
    icon: CircleDotDashed,
    color: "text-fuchsia-600 bg-fuchsia-50"
  },
  {
    title: "Fruit Slicer",
    prompt: "A fruit-slicing game where fruit is tossed up from below and the player swipes to slice it with a glowing blade trail, slicing several in one swipe earns combos, bombs end the game, and missed fruit cost a life.",
    category: "Arcade",
    icon: Cherry,
    color: "text-rose-600 bg-rose-50"
  },
  {
    title: "Critter Rescue",
    prompt: "A Lemmings-style puzzle where a line of little critters walks forward blindly, the player assigns them limited skills like dig, block, build stairs and float to guide enough of them past hazards to the exit.",
    category: "Puzzle",
    icon: Users,
    color: "text-teal-600 bg-teal-50"
  },
  {
    title: "Bunny Hop",
    prompt: "A vertical jumping game where a bunny auto-bounces on platforms and the player tilts or steers left and right to climb, springs launch higher, some platforms crumble or move, the screen wraps sideways, and the height is the score.",
    category: "Arcade",
    icon: Rabbit,
    color: "text-emerald-600 bg-emerald-50"
  },
  {
    title: "Escape Room",
    prompt: "A point-and-click escape room where the player inspects objects around a locked room, collects and combines inventory items, solves code locks, sliding puzzles and hidden clues, and escapes before the timer runs out.",
    category: "Puzzle",
    icon: Key,
    color: "text-indigo-600 bg-indigo-50"
  },
  {
    title: "Potion Brewing",
    prompt: "A potion-brewing puzzle where customers request potions with specific effects, the player mixes ingredients with hidden properties in a cauldron, discovers recipes through experiments recorded in a recipe book, and earns gold for correct brews.",
    category: "Puzzle",
    icon: FlaskConical,
    color: "text-violet-600 bg-violet-50"
  },
  {
    title: "Wizard Duel",
    prompt: "A spell-drawing duel where the player traces shapes with the mouse or finger (a circle for a shield, a zigzag for lightning, a triangle for fire) to cast spells, while the enemy wizard casts back, and health and mana decide the winner.",
    category: "Action",
    icon: Wand2,
    color: "text-fuchsia-600 bg-fuchsia-50"
  },
  {
    title: "Robot Coder",
    prompt: "A programming puzzle where the player arranges command blocks (move, turn, jump, light, loop) into a program that guides a robot across a grid to light every target tile, with a limited number of command slots per level.",
    category: "Logic",
    icon: Bot,
    color: "text-sky-600 bg-sky-50"
  },
  {
    title: "Mahjong Tiles",
    prompt: "A mahjong solitaire game with tiles stacked in a layered turtle layout, only free tiles can be matched, matching pairs clear them, a shuffle and hint button help when stuck, and the board is guaranteed to be solvable.",
    category: "Tiles",
    icon: Layers,
    color: "text-emerald-600 bg-emerald-50"
  },
  {
    title: "Pirate Treasure",
    prompt: "A top-down pirate adventure where the player sails between islands, follows torn map fragments to dig for treasure, fires cannons broadside at enemy ships, upgrades the ship in ports, and finds the legendary hoard.",
    category: "Adventure",
    icon: Compass,
    color: "text-amber-600 bg-amber-50"
  },
  {
    title: "Deep Sea Diver",
    prompt: "An underwater exploration game where the diver swims ever deeper with limited oxygen, collects treasure and rare fish photos, avoids jellyfish and sharks, darkness grows with depth, and gear upgrades extend each dive.",
    category: "Exploration",
    icon: Waves,
    color: "text-blue-600 bg-blue-50"
  },
  {
    title: "Checkers",
    prompt: "A checkers game on an 8x8 board versus a computer opponent with selectable difficulty, highlighted legal moves, forced jumps and multi-jump chains, kinging, and an undo button.",
    category: "Board",
    icon: Crown,
    color: "text-rose-600 bg-rose-50"
  },
  {
    title: "Simon Says",
    prompt: "A Simon-style memory game with four glowing colour pads and tones, a sequence that grows by one each round, speed that increases over time, strict mode, and a best-streak record.",
    category: "Memory",
    icon: CircleDot,
    color: "text-emerald-600 bg-emerald-50"
  },
  {
    title: "Dots and Boxes",
    prompt: "A dots and boxes game where players take turns drawing lines, completing a box scores a point and grants another turn, with a computer opponent, board size options, and a final score screen.",
    category: "Board",
    icon: Grid3x3,
    color: "text-indigo-600 bg-indigo-50"
  },
  {
    title: "Lights Out",
    prompt: "A Lights Out puzzle where tapping a light toggles it and its neighbours, the goal is to switch every light off, with handcrafted levels, a move counter, star ratings, and a hint button.",
    category: "Puzzle",
    icon: Lightbulb,
    color: "text-amber-600 bg-amber-50"
  },
  {
    title: "Jigsaw Puzzle",
    prompt: "A jigsaw puzzle game that cuts a generated picture into draggable interlocking pieces, snaps them together when close, offers piece-count options, an edge-pieces filter, and a completion timer.",
    category: "Puzzle",
    icon: Puzzle,
    color: "text-violet-600 bg-violet-50"
  },
  {
    title: "Texas Hold'em",
    prompt: "A Texas Hold'em poker table against three computer players with blinds, betting rounds, fold/call/raise controls, hand ranking at showdown, chip stacks, and elimination until one winner remains.",
    category: "Cards",
    icon: Spade,
    color: "text-emerald-600 bg-emerald-50"
  },
  {
    title: "Dice Poker",
    prompt: "A Yahtzee-style dice game with five dice, up to three rolls per turn, tap to hold dice, a full scorecard with upper bonus, and a high-score table.",
    category: "Dice",
    icon: Dices,
    color: "text-rose-600 bg-rose-50"
  },
  {
    title: "Drift Kart",
    prompt: "A top-down kart racing game with drifting that builds a speed boost, three AI rivals, item boxes with banana peels and rockets, three laps per track, and a podium finish screen.",
    category: "Racing",
    icon: Car,
    color: "text-sky-600 bg-sky-50"
  },
  {
    title: "Heli Rescue",
    prompt: "A side-scrolling helicopter rescue game where the player flies through hazards to pick up stranded people, carries them back to base with limited fuel, and dodges enemy fire.",
    category: "Action",
    icon: Helicopter,
    color: "text-amber-600 bg-amber-50"
  },
  {
    title: "Wall Jumper",
    prompt: "A vertical ninja climber where the player bounces between two walls with one-tap jumps, dodges spikes and falling shurikens, collects coins, and climbs as high as possible.",
    category: "Arcade",
    icon: Footprints,
    color: "text-indigo-600 bg-indigo-50"
  },
  {
    title: "Lava Rise",
    prompt: "A vertical platformer where lava rises steadily from below, the player jumps up crumbling platforms, grabs speed boots and double-jump power-ups, and the score is the height reached.",
    category: "Platformer",
    icon: Flame,
    color: "text-rose-600 bg-rose-50"
  },
  {
    title: "Snowball Fight",
    prompt: "A top-down snowball fight arena where the player hides behind snow forts, charges throws for distance, dodges AI kids' snowballs, and wins rounds by tagging the whole opposing team.",
    category: "Action",
    icon: Snowflake,
    color: "text-sky-600 bg-sky-50"
  },
  {
    title: "Hidden Objects",
    prompt: "A hidden object game with detailed illustrated scenes, a list of items to find, a hint that sparkles near one item, a time bonus, wrong-click penalties, and several scenes to unlock.",
    category: "Puzzle",
    icon: Eye,
    color: "text-violet-600 bg-violet-50"
  },
  {
    title: "Spot the Difference",
    prompt: "A spot-the-difference game with two side-by-side generated scenes, tap to circle differences, a countdown timer, limited hints, and levels that hide more and subtler changes.",
    category: "Puzzle",
    icon: Search,
    color: "text-teal-600 bg-teal-50"
  },
  {
    title: "Air Traffic Control",
    prompt: "An air traffic control game where planes arrive from the edges, the player draws flight paths to the matching runways, collisions end the game, and traffic gets heavier over time.",
    category: "Strategy",
    icon: Plane,
    color: "text-sky-600 bg-sky-50"
  },
  {
    title: "Bee Garden",
    prompt: "A relaxing bee game where the player flies a bee between flowers to collect pollen, delivers it to the hive to make honey, avoids wasps, and spends honey to grow new flowers.",
    category: "Casual",
    icon: Flower2,
    color: "text-amber-600 bg-amber-50"
  },
  {
    title: "Sheep Herder",
    prompt: "A sheepdog herding game where the player steers a dog to nudge a flock of sheep with simple flocking behaviour into the pen before time runs out, with wolves and obstacles on later levels.",
    category: "Casual",
    icon: Rabbit,
    color: "text-emerald-600 bg-emerald-50"
  },
  {
    title: "Drill Down",
    prompt: "A digging game where the player pilots a drill pod down through dirt and rock, mines ore and gems, returns to the surface to sell and upgrade fuel, hull and drill, and goes ever deeper.",
    category: "Adventure",
    icon: Pickaxe,
    color: "text-amber-600 bg-amber-50"
  },
  {
    title: "Balloon Pop",
    prompt: "A balloon-popping dart game where balloons float up in patterns, the player aims and throws darts with a charge meter, special balloons bring bonuses or bombs, and levels have target scores.",
    category: "Arcade",
    icon: Target,
    color: "text-rose-600 bg-rose-50"
  },
  {
    title: "Paper Plane",
    prompt: "A paper plane glider game where the player launches a plane with a drag-and-release throw, rides updrafts, steers around obstacles, collects stars, and tries to beat the longest flight.",
    category: "Casual",
    icon: Feather,
    color: "text-sky-600 bg-sky-50"
  },
  {
    title: "Lemonade Stand",
    prompt: "A lemonade stand business sim where the player buys lemons, sugar and ice, sets a recipe and price, reacts to the daily weather forecast, serves customers, and grows profit over 30 days.",
    category: "Simulation",
    icon: Sun,
    color: "text-amber-600 bg-amber-50"
  },
  {
    title: "Sumo Push",
    prompt: "A physics sumo game where two round wrestlers charge and bump each other on a circular ring, the first one pushed out loses, with a dash move, AI opponent, and best-of-five matches.",
    category: "Party",
    icon: Users,
    color: "text-rose-600 bg-rose-50"
  },
  {
    title: "Phaser Platformer",
    prompt: "A Phaser 3 platformer with a tilemap-style level, arcade physics, a hero with run, jump, and double-jump animations, patrolling enemies, collectible coins, a camera that follows the player over parallax layers, and a three-level campaign.",
    category: "Platformer",
    icon: Rocket,
    color: "text-sky-600 bg-sky-50"
  },
  {
    title: "Phaser Space Shooter",
    prompt: "A Phaser 3 vertical shoot-em-up with scrolling starfields, pooled bullets, enemy formations, a boss fight every fifth wave, weapon upgrades, particle explosions, screen shake, and a persistent high score.",
    category: "Shooter",
    icon: Bomb,
    color: "text-amber-600 bg-amber-50"
  },
  {
    title: "Three.js Racer",
    prompt: "A 3D endless racing game in Three.js with a low-poly car on a curving road, a chase camera, speed-based FOV and fog, traffic to dodge, boost pads, a day-to-night cycle, and a distance score with a best-run record.",
    category: "Racing",
    icon: Car,
    color: "text-rose-600 bg-rose-50"
  },
  {
    title: "Voxel Explorer",
    prompt: "A Three.js voxel sandbox where the player walks a procedurally generated block world in first person, places and breaks blocks, picks from a hotbar of materials, and sees a day and night sky, with touch controls on mobile.",
    category: "Sandbox",
    icon: Blocks,
    color: "text-emerald-600 bg-emerald-50"
  },
  {
    title: "Phaser Top-Down RPG",
    prompt: "A Phaser 3 top-down adventure with a tile-based village and dungeon, smooth four-way movement, NPC dialogue boxes, a quest log, an inventory, sword combat against slimes, and scene transitions between areas.",
    category: "RPG",
    icon: Sword,
    color: "text-violet-600 bg-violet-50"
  },
  {
    title: "Phaser Survivors",
    prompt: "A Phaser 3 survivor-like where the hero auto-attacks while the player dodges growing hordes, collects XP gems, chooses one of three upgrades on each level-up, and tries to last twenty minutes against escalating waves.",
    category: "Roguelike",
    icon: Skull,
    color: "text-indigo-600 bg-indigo-50"
  },
  {
    title: "Orbit Defender",
    prompt: "A 3D space defense game in Three.js where the player orbits a planet in a turret ship, shoots incoming asteroids and raiders in every direction, upgrades shields between waves, and protects the planet's health bar.",
    category: "Shooter",
    icon: Orbit,
    color: "text-sky-600 bg-sky-50"
  },
  {
    title: "Physics Lab",
    prompt: "A Phaser 3 physics puzzle game using Matter.js bodies where the player drops, ropes, and launches objects to push a ball into a goal, with twenty hand-built levels, star ratings, and undo and reset buttons.",
    category: "Puzzle",
    icon: Puzzle,
    color: "text-teal-600 bg-teal-50"
  }
];
