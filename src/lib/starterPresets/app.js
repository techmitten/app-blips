import {
  Atom, Baby, BookOpen, Braces, Brain, Bug, Calculator, CalendarCheck, Car,
  ChefHat, Clock, CloudSun, Coffee, Coins, Database, Dices, Drum, Dumbbell,
  Edit2, Film, Flame, Footprints, Gauge, Globe, GraduationCap, Heart, KeyRound,
  Keyboard, Landmark, ListChecks, ListTodo, Map, Moon, Music, Paintbrush,
  Palette, PawPrint, PiggyBank, Plane, Radio, Receipt, Regex, Ruler, Sprout,
  Timer, Trophy, UtensilsCrossed, Wallet, Waves
} from 'lucide-react';

// App Studio starter ideas (the default studio's gallery).
export const STARTER_PRESETS = [
  {
    title: "Weather Forecast",
    prompt: "A high-quality weather app built with Material You design and dynamic color palettes. Includes live conditions, 7-day forecast cards, hourly charts, animated weather artwork, and air quality metrics.",
    category: "Weather",
    icon: CloudSun,
    featured: true,
    color: "text-sky-600 bg-sky-50"
  },
  {
    title: "Internet Radio",
    prompt: "A free live radio streaming app streaming real online radio stations across Lo-Fi, Jazz, Chillwave, and Classical, with an interactive tuner dial, playback controls, and live audio visualizer.",
    category: "Audio",
    icon: Radio,
    color: "text-amber-600 bg-amber-50"
  },
  {
    title: "Typing Test",
    prompt: "A modern typing test app to improve typing skills with a sleek UI, real-time WPM and accuracy metrics, smooth jumping caret, mistyped heatmaps, sound feedback, and practice drill modes.",
    category: "Typing",
    icon: Keyboard,
    color: "text-teal-600 bg-teal-50"
  },
  {
    title: "Recipe Finder",
    prompt: "A polished recipe discovery app with a searchable, filterable card grid, step-by-step cook mode with a built-in timer, adjustable ingredient serving sizes, and a save-to-favorites collection.",
    category: "Cooking",
    icon: ChefHat,
    featured: true,
    color: "text-rose-600 bg-rose-50"
  },
  {
    title: "Focus Timer",
    prompt: "A Pomodoro-style focus timer with a smooth animated countdown ring, customizable work/break intervals, an ambient session soundtrack, daily streak tracking, and a running log of completed sessions.",
    category: "Productivity",
    icon: Timer,
    featured: true,
    color: "text-blue-600 bg-blue-50"
  },
  {
    title: "Budget Planner",
    prompt: "A personal budget tracker with quick expense entry, category breakdown charts, a monthly spending vs. income summary, savings goal progress bars, and a clean ledger of recent transactions.",
    category: "Finance",
    icon: PiggyBank,
    color: "text-teal-600 bg-teal-50"
  },
  {
    title: "Flashcard Study",
    prompt: "A spaced-repetition flashcard app with swipeable cards, deck creation and editing, a flip animation, confidence-based review scheduling, and per-deck mastery progress tracking.",
    category: "Education",
    icon: GraduationCap,
    color: "text-sky-600 bg-sky-50"
  },
  {
    title: "Habit Tracker",
    prompt: "A daily habit tracker with a clean weekly grid view, one-tap check-ins, streak counters with milestone celebrations, per-habit color coding, and a monthly completion heatmap.",
    category: "Productivity",
    icon: CalendarCheck,
    color: "text-emerald-600 bg-emerald-50"
  },
  {
    title: "Drum Machine",
    prompt: "A playable step-sequencer drum machine with multiple synthesized drum kits, an adjustable BPM, a 16-step pattern grid, pattern save/load slots, and reactive visual pulses on each beat.",
    category: "Audio",
    icon: Drum,
    featured: true,
    color: "text-violet-600 bg-violet-50"
  },
  {
    title: "Workout Log",
    prompt: "A gym workout logger with exercise search, per-set weight and rep tracking, automatic rest timers between sets, a personal-record tracker, and progress charts across past sessions.",
    category: "Fitness",
    icon: Dumbbell,
    color: "text-rose-600 bg-rose-50"
  },
  {
    title: "Unit Converter",
    prompt: "An elegant unit converter covering length, weight, temperature, volume, and currency with live two-way conversion as you type, a recent-conversions history, and quick-swap unit buttons.",
    category: "Utility",
    icon: Ruler,
    color: "text-blue-600 bg-blue-50"
  },
  {
    title: "Piano Keyboard",
    prompt: "A playable multi-octave piano with velocity-sensitive keys, touch and computer-keyboard support, a selection of instrument voices (grand piano, synth, organ), a sustain toggle, and a record-and-playback loop feature.",
    category: "Music",
    icon: Music,
    color: "text-violet-600 bg-violet-50"
  },
  {
    title: "Trivia Quiz",
    prompt: "An animated trivia quiz game with multiple categories and difficulty levels, a 15-second question timer, streak bonuses, lifelines, an explanations panel after each answer, and a final score card with shareable results.",
    category: "Quiz",
    icon: Trophy,
    color: "text-amber-600 bg-amber-50"
  },
  {
    title: "Markdown Notes",
    prompt: "A lightweight note-taking app with a live split-pane Markdown editor and preview, nested folders and tags, full-text search, pinned notes, and automatic local saving with an export-to-file option.",
    category: "Notes",
    icon: Edit2,
    color: "text-indigo-600 bg-indigo-50"
  },
  {
    title: "Expense Splitter",
    prompt: "A group expense splitter that tracks who paid for what, supports equal and custom splits, shows each person's net balance, suggests the fewest settling-up payments, and keeps a running history per trip or household.",
    category: "Finance",
    icon: Wallet,
    color: "text-emerald-600 bg-emerald-50"
  },
  {
    title: "Event Countdown",
    prompt: "A polished countdown app with large animated day/hour/minute/second digits for multiple saved events, custom colors and emoji per event, a progress bar for elapsed time, and milestone markers as the date approaches.",
    category: "Utility",
    icon: Clock,
    color: "text-rose-600 bg-rose-50"
  },
  {
    title: "Dice Roller",
    prompt: "A tabletop dice roller supporting standard polyhedral dice (d4 through d20), roll modifiers, advantage and disadvantage modes, saved roll presets, an animated roll, and a scrollable history with running totals.",
    category: "Tabletop",
    icon: Dices,
    color: "text-sky-600 bg-sky-50"
  },
  {
    title: "Sleep Sounds",
    prompt: "An ambient sound mixer with looping rain, thunder, waves, wind, and fireplace tracks, independent volume sliders per layer, a sleep timer with fade-out, and saveable soundscape presets.",
    category: "Audio",
    icon: Waves,
    color: "text-indigo-600 bg-indigo-50"
  },
  {
    title: "Password Generator",
    prompt: "A secure password generator with adjustable length, character-set toggles, a passphrase mode, a live strength meter, one-click copy, and a locally stored history of recently generated passwords.",
    category: "Security",
    icon: KeyRound,
    color: "text-emerald-600 bg-emerald-50"
  },
  {
    title: "HIIT Interval Timer",
    prompt: "A high-intensity interval training timer with configurable work and rest rounds, a preparation countdown, a large color-coded phase display, audio beeps, and a session summary of completed rounds.",
    category: "Fitness",
    icon: Flame,
    color: "text-rose-600 bg-rose-50"
  },
  {
    title: "Periodic Table",
    prompt: "An interactive periodic table with color-coded element groups, click-to-expand element details such as atomic mass, category, and electron configuration, plus search, property filters, and an element-symbol quiz mode.",
    category: "Science",
    icon: Atom,
    color: "text-sky-600 bg-sky-50"
  },
  {
    title: "Color Palette Studio",
    prompt: "A color palette generator that builds harmonious schemes from a base color, shows HEX, RGB, and HSL values with copy buttons, previews palettes on UI mockups, saves favorites, and exports as CSS variables.",
    category: "Design",
    icon: Palette,
    color: "text-violet-600 bg-violet-50"
  },
  {
    title: "Kanban Board",
    prompt: "A drag-and-drop kanban task board with customizable columns and cards, labels and due dates, card counts per column, a quick-add bar, and persistent local storage across reloads.",
    category: "Productivity",
    icon: ListTodo,
    color: "text-blue-600 bg-blue-50"
  },
  {
    title: "Water Tracker",
    prompt: "A hydration tracker with an animated filling bottle visual, one-tap glass and bottle quick-add buttons, a daily goal ring, streak tracking, and a weekly intake chart.",
    category: "Health",
    icon: Heart,
    color: "text-sky-600 bg-sky-50"
  },
  {
    title: "Scientific Calculator",
    prompt: "A scientific calculator with a full expression display, trig, log, powers and roots, memory keys, a degree/radian toggle, a calculation history tape, and keyboard input support.",
    category: "Utility",
    icon: Calculator,
    color: "text-blue-600 bg-blue-50"
  },
  {
    title: "Invoice Maker",
    prompt: "A freelance invoice builder with line items, automatic totals and tax, client and business details, a live printable preview, invoice numbering, and saved invoice history with status tracking.",
    category: "Business",
    icon: Receipt,
    color: "text-teal-600 bg-teal-50"
  },
  {
    title: "Mood Journal",
    prompt: "A private daily mood journal with a one-tap mood picker, optional notes and tags, a calendar heatmap of moods across the month, weekly trend charts, and a streak counter.",
    category: "Wellbeing",
    icon: Heart,
    color: "text-rose-600 bg-rose-50"
  },
  {
    title: "Grocery List",
    prompt: "A smart grocery list that groups items by store aisle, lets you check things off with a satisfying strike-through, remembers frequent items for quick re-adding, and shares an estimated total.",
    category: "Shopping",
    icon: ListChecks,
    color: "text-emerald-600 bg-emerald-50"
  },
  {
    title: "Plant Care",
    prompt: "A houseplant care tracker with a card for each plant, watering and feeding schedules, a today's-tasks list, overdue reminders, light-level notes, and a growth photo log.",
    category: "Home",
    icon: Sprout,
    color: "text-emerald-600 bg-emerald-50"
  },
  {
    title: "Reading Tracker",
    prompt: "A reading tracker with a bookshelf of current, finished and want-to-read books, page progress bars, a yearly reading goal ring, star ratings, and favourite quotes.",
    category: "Books",
    icon: BookOpen,
    color: "text-amber-600 bg-amber-50"
  },
  {
    title: "Movie Watchlist",
    prompt: "A movie and TV watchlist with poster-style cards, genre filters, watched/unwatched toggles, personal ratings and reviews, and a random 'pick tonight's movie' button.",
    category: "Entertainment",
    icon: Film,
    color: "text-violet-600 bg-violet-50"
  },
  {
    title: "Metronome",
    prompt: "A musician's metronome with a big tempo dial, tap-tempo, time signatures, accented downbeats, a visual pendulum, and saved presets for practice songs.",
    category: "Music",
    icon: Music,
    color: "text-indigo-600 bg-indigo-50"
  },
  {
    title: "Tip Calculator",
    prompt: "A tip and bill splitter with a large bill input, quick tip percentage buttons, a people counter, rounding options, and a clear per-person breakdown.",
    category: "Finance",
    icon: Calculator,
    color: "text-teal-600 bg-teal-50"
  },
  {
    title: "Mortgage Calculator",
    prompt: "A mortgage and loan calculator with sliders for price, deposit, rate and term, a monthly payment summary, an amortization chart, and a full year-by-year schedule table.",
    category: "Finance",
    icon: Landmark,
    color: "text-blue-600 bg-blue-50"
  },
  {
    title: "Meal Planner",
    prompt: "A weekly meal planner with a drag-and-drop calendar of breakfasts, lunches and dinners, a saved recipe box, and an automatic shopping list built from the week's meals.",
    category: "Cooking",
    icon: UtensilsCrossed,
    color: "text-amber-600 bg-amber-50"
  },
  {
    title: "Packing List",
    prompt: "A travel packing checklist that builds a list from trip length, weather and activities, groups items by bag, tracks what's packed, and saves templates for future trips.",
    category: "Travel",
    icon: Plane,
    color: "text-sky-600 bg-sky-50"
  },
  {
    title: "Pet Care Log",
    prompt: "A pet care log with profiles for each pet, feeding and walk tracking, vet visits and vaccine reminders, weight charts, and a cute daily summary card.",
    category: "Pets",
    icon: PawPrint,
    color: "text-rose-600 bg-rose-50"
  },
  {
    title: "Baby Tracker",
    prompt: "A gentle baby tracker for feeds, sleeps and nappy changes with big one-tap buttons, timers, a daily timeline, and simple totals for the last 24 hours.",
    category: "Family",
    icon: Baby,
    color: "text-rose-600 bg-rose-50"
  },
  {
    title: "Chore Chart",
    prompt: "A family chore chart with a weekly grid of chores per person, tick-off stars, points that add up to rewards, rotating assignments, and a leaderboard.",
    category: "Family",
    icon: CalendarCheck,
    color: "text-teal-600 bg-teal-50"
  },
  {
    title: "Savings Goals",
    prompt: "A savings goal tracker with jars for each goal, deposit logging, animated fill progress, target dates with suggested weekly amounts, and a celebration when a goal is reached.",
    category: "Finance",
    icon: PiggyBank,
    color: "text-emerald-600 bg-emerald-50"
  },
  {
    title: "Stopwatch & Laps",
    prompt: "A precise stopwatch with lap and split times, best and worst lap highlighting, a countdown timer mode, and exportable lap history.",
    category: "Utility",
    icon: Timer,
    color: "text-indigo-600 bg-indigo-50"
  },
  {
    title: "World Clock",
    prompt: "A world clock dashboard with city cards showing local time, day/night shading, time-difference labels, and a meeting planner slider that finds overlapping working hours.",
    category: "Utility",
    icon: Globe,
    color: "text-sky-600 bg-sky-50"
  },
  {
    title: "Regex Tester",
    prompt: "A regular expression tester with live match highlighting, capture group breakdown, flag toggles, a replace preview, and a cheat sheet of common patterns.",
    category: "Developer",
    icon: Regex,
    color: "text-violet-600 bg-violet-50"
  },
  {
    title: "JSON Formatter",
    prompt: "A JSON formatter and viewer that pretty-prints and validates pasted JSON, shows a collapsible tree view, highlights errors with line numbers, and can minify or copy the result.",
    category: "Developer",
    icon: Braces,
    color: "text-blue-600 bg-blue-50"
  },
  {
    title: "Pixel Art Editor",
    prompt: "A pixel art editor with a zoomable grid canvas, colour palette, pencil, fill and eraser tools, mirror drawing, undo/redo, and PNG export.",
    category: "Creative",
    icon: Palette,
    color: "text-rose-600 bg-rose-50"
  },
  {
    title: "Drawing Pad",
    prompt: "A smooth sketching app with pressure-style brush strokes, colour and size pickers, layers, an eraser, undo/redo, and save-as-image.",
    category: "Creative",
    icon: Paintbrush,
    color: "text-violet-600 bg-violet-50"
  },
  {
    title: "Breathing Coach",
    prompt: "A calming breathing exercise app with an expanding and contracting circle guide, box breathing and 4-7-8 patterns, session length options, and gentle sound cues.",
    category: "Wellbeing",
    icon: Waves,
    color: "text-sky-600 bg-sky-50"
  },
  {
    title: "Running Log",
    prompt: "A running log for recording runs with distance, time and auto-calculated pace, weekly mileage charts, personal bests, and shoe mileage tracking.",
    category: "Fitness",
    icon: Footprints,
    color: "text-emerald-600 bg-emerald-50"
  },
  {
    title: "Tournament Bracket",
    prompt: "A tournament bracket maker that seeds players or teams into single-elimination rounds, lets you click winners to advance them, and crowns a champion with confetti.",
    category: "Sports",
    icon: Trophy,
    color: "text-amber-600 bg-amber-50"
  },
  {
    title: "Decision Wheel",
    prompt: "A spin-the-wheel decision maker with editable options, a satisfying spinning animation, a coin flip mode, and a history of past picks.",
    category: "Fun",
    icon: Coins,
    color: "text-amber-600 bg-amber-50"
  },
  {
    title: "Coffee Brew Timer",
    prompt: "A coffee brewing companion with recipes for pour-over, French press and AeroPress, a step-by-step brew timer, coffee-to-water ratio calculator, and tasting notes.",
    category: "Food & Drink",
    icon: Coffee,
    color: "text-amber-600 bg-amber-50"
  },
  {
    title: "Car Maintenance",
    prompt: "A car maintenance log with service history, upcoming reminders by date or mileage, fuel fill-ups with cost per mile, and a summary of yearly running costs.",
    category: "Vehicles",
    icon: Car,
    color: "text-blue-600 bg-blue-50"
  },
  {
    title: "Moon Phases",
    prompt: "A moon phase calendar showing tonight's moon with illumination percentage, a month grid of phases, next full and new moon dates, and sunrise/sunset times.",
    category: "Science",
    icon: Moon,
    color: "text-indigo-600 bg-indigo-50"
  },
  {
    title: "Bug Tracker",
    prompt: "A lightweight bug tracker with issues, priorities, labels and assignees, status columns, search and filters, and a simple activity history per issue.",
    category: "Productivity",
    icon: Bug,
    color: "text-rose-600 bg-rose-50"
  },
  {
    title: "Habit Heatmap",
    prompt: "A habit-building app with a GitHub-style yearly heatmap per habit, a Chart.js streak and completion trend, weekly reminders, drag-to-reorder habits, and a tabbed layout for Today, Insights, and Settings.",
    category: "Productivity",
    icon: CalendarCheck,
    color: "text-emerald-600 bg-emerald-50"
  },
  {
    title: "Finance Dashboard",
    prompt: "A personal finance dashboard with interactive Chart.js charts for spending by category, net worth over time, and income vs. expenses, a date-range filter, a sortable transactions table, and CSV import and export.",
    category: "Finance",
    icon: Gauge,
    color: "text-indigo-600 bg-indigo-50"
  },
  {
    title: "Pomodoro Garden",
    prompt: "A focus app where every completed session grows an animated plant in a virtual garden, with a ring timer, ambient Web Audio soundscapes, a garden gallery of past sessions, and weekly focus stats.",
    category: "Productivity",
    icon: Sprout,
    color: "text-teal-600 bg-teal-50"
  },
  {
    title: "Spaced Repetition",
    prompt: "A spaced-repetition flashcard app with decks, a Leitner-box scheduler, swipeable cards with flip animations, a keyboard-driven review mode, per-deck progress charts, and import from pasted text.",
    category: "Education",
    icon: Brain,
    color: "text-violet-600 bg-violet-50"
  },
  {
    title: "Step Sequencer",
    prompt: "A multi-track step sequencer built on Web Audio with synthesized drums and bass, per-track volume and mute, a tempo slider with swing, pattern save slots, and a live waveform visualizer.",
    category: "Audio",
    icon: Music,
    color: "text-rose-600 bg-rose-50"
  },
  {
    title: "Trip Planner",
    prompt: "A multi-day trip planner with a day-by-day itinerary, drag-and-drop activities, a Leaflet map showing each stop with route lines, a packing checklist, a budget tracker, and a shareable summary view.",
    category: "Travel",
    icon: Map,
    color: "text-sky-600 bg-sky-50"
  },
  {
    title: "Data Explorer",
    prompt: "A drag-and-drop CSV explorer that parses files in the browser, shows a searchable sortable table, auto-detects column types, and builds pivot summaries and Chart.js charts with a chart-type switcher.",
    category: "Data",
    icon: Database,
    color: "text-amber-600 bg-amber-50"
  },
  {
    title: "Kanban Pro",
    prompt: "A polished kanban workspace with multiple boards, drag-and-drop cards, labels, due dates, checklists, a card detail drawer, filters, and a command palette opened with Ctrl+K.",
    category: "Productivity",
    icon: ListTodo,
    color: "text-blue-600 bg-blue-50"
  }
];
