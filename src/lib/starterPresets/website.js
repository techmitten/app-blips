import {
  Baby, BookOpen, Bot, Briefcase, Building2, Calculator, Camera, Car, ChefHat,
  Cherry, Code2, Coffee, Cpu, Dumbbell, Film, FlaskConical, Flower2, Gamepad2,
  Globe, GraduationCap, Hammer, Heart, Key, Landmark, Mic, Mountain,
  MountainSnow, Music, Newspaper, Package, Paintbrush, Palette, PawPrint, Pizza,
  Plane, Rocket, Sailboat, Scale, Scissors, Shield, Shirt, Smartphone, Sprout,
  Stethoscope, Store, Telescope, Tent, Tractor, Users, UtensilsCrossed, Waves,
  Wine
} from 'lucide-react';

// Website Studio starter ideas.
export const WEBSITE_STARTER_PRESETS = [
  {
    title: "Portfolio",
    prompt: "A striking personal portfolio website for a product designer with a bold hero, selected-projects grid with hover reveals, an about section with stats, client logos, testimonials, and a contact section with a working inline form.",
    category: "Portfolio",
    icon: Briefcase,
    featured: true,
    color: "text-indigo-600 bg-indigo-50"
  },
  {
    title: "SaaS Landing",
    prompt: "A high-converting SaaS landing page with a navbar, gradient hero with product screenshot mockup, three-tier pricing cards with a monthly/yearly toggle, feature grid with icons, FAQ accordion, and a footer with links and social icons.",
    category: "Marketing",
    icon: Rocket,
    featured: true,
    color: "text-violet-600 bg-violet-50"
  },
  {
    title: "Restaurant",
    prompt: "A warm, appetizing restaurant website with an elegant hero over a full-bleed food photo, story section, tabbed menu with dish photos and prices, chef highlight, reservation form with inline confirmation, opening hours, and location map embed.",
    category: "Food",
    icon: UtensilsCrossed,
    featured: true,
    color: "text-amber-600 bg-amber-50"
  },
  {
    title: "Photography",
    prompt: "A minimalist photography portfolio with a full-screen image hero, masonry gallery grid with lightbox on click, category filters (portraits, landscape, street), an about-the-photographer section, and a booking inquiry form.",
    category: "Gallery",
    icon: Camera,
    color: "text-slate-600 bg-slate-100"
  },
  {
    title: "Local Business",
    prompt: "A friendly local business website for a bike repair shop with services-and-prices cards, photo gallery of the workshop, team member bios, Google-style reviews carousel, hours and location section, and a click-to-call / email contact bar.",
    category: "Business",
    icon: Store,
    color: "text-emerald-600 bg-emerald-50"
  },
  {
    title: "Product Page",
    prompt: "A polished single-product page with an image gallery, color and size selectors with live price updates, quantity stepper, add-to-cart button with inline confirmation, features list, specs table, reviews with star ratings, and related products row.",
    category: "E-commerce",
    icon: Package,
    color: "text-blue-600 bg-blue-50"
  },
  {
    title: "Blog / Magazine",
    prompt: "An editorial magazine website with a masthead and nav, featured story hero, three-column article grid with category tags and read times, popular sidebar, newsletter signup with inline success message, and a footer archive by month.",
    category: "Publishing",
    icon: Newspaper,
    color: "text-rose-600 bg-rose-50"
  },
  {
    title: "Docs & Help",
    prompt: "A clean documentation site with a sticky sidebar navigation, searchable quickstart guide, code-block styling with copy buttons, version badge, left-column table of contents, and a was-this-helpful feedback widget.",
    category: "Docs",
    icon: BookOpen,
    color: "text-sky-600 bg-sky-50"
  },
  {
    title: "Wedding / Event",
    prompt: "A romantic wedding website with an elegant serif hero with the couple's names and date, our-story timeline, photo gallery, event details with venue cards and maps, RSVP form with meal choices, and a gift registry section.",
    category: "Events",
    icon: Heart,
    color: "text-rose-600 bg-rose-50"
  },
  {
    title: "Nonprofit",
    prompt: "A hopeful nonprofit website with a full-bleed impact hero, mission and stats counters, programs grid with photos, donation tiers card section with a custom amount option, volunteer signup form, and partners logo row.",
    category: "Nonprofit",
    icon: Sprout,
    color: "text-emerald-600 bg-emerald-50"
  },
  {
    title: "Music Artist",
    prompt: "A moody music artist website with an album-art hero, latest-release player card with a working audio-free tracklist, tour dates list with ticket buttons, photo gallery, newsletter signup, and streaming-platform link buttons.",
    category: "Music",
    icon: Music,
    color: "text-violet-600 bg-violet-50"
  },
  {
    title: "Fitness Coach",
    prompt: "An energetic fitness coach website with a bold hero with a call-to-action for a free consultation, transformation before-after slider, training programs pricing cards, weekly class schedule table, testimonials, and a contact form.",
    category: "Fitness",
    icon: Dumbbell,
    color: "text-teal-600 bg-teal-50"
  },
  {
    title: "Real Estate",
    prompt: "A luxury real estate agency website with a full-width hero property search bar, featured listings grid with price and bed/bath badges, neighborhood guides, agent profiles, mortgage calculator widget, and a schedule-a-viewing form.",
    category: "Real Estate",
    icon: Building2,
    color: "text-sky-600 bg-sky-50"
  },
  {
    title: "Travel Blog",
    prompt: "An immersive travel blog with a cinematic destination hero, latest-stories grid with country tags, an interactive-style itinerary timeline, photo essay section, packing-list checklist, and a newsletter signup.",
    category: "Travel",
    icon: Plane,
    color: "text-sky-600 bg-sky-50"
  },
  {
    title: "Hair Salon",
    prompt: "A chic hair salon website with a soft editorial hero, services and price menu, stylist team cards, before-and-after gallery, client reviews, and an online booking request form with service picker.",
    category: "Beauty",
    icon: Scissors,
    color: "text-rose-600 bg-rose-50"
  },
  {
    title: "Dental Clinic",
    prompt: "A calming dental clinic website with a friendly hero and book-appointment button, treatments grid, meet-the-dentists section, new-patient FAQ accordion, insurance logos, and a contact and hours panel.",
    category: "Health",
    icon: Stethoscope,
    color: "text-teal-600 bg-teal-50"
  },
  {
    title: "Law Firm",
    prompt: "A trustworthy law firm website with a serif hero and free-consultation button, practice areas grid, attorney profiles, case-results stats, client testimonials, and a confidential contact form.",
    category: "Professional",
    icon: Scale,
    color: "text-slate-600 bg-slate-100"
  },
  {
    title: "Coffee Shop",
    prompt: "A cozy independent coffee shop website with a warm hero, seasonal menu tabs with prices, our-beans story section, photo gallery, loyalty-card explainer, and hours and location with a map embed.",
    category: "Food",
    icon: Coffee,
    color: "text-amber-600 bg-amber-50"
  },
  {
    title: "Startup Launch",
    prompt: "A bold pre-launch startup page with an animated gradient hero, countdown timer, waitlist email form with inline success, feature teasers, founder note, and social proof counters.",
    category: "Marketing",
    icon: Rocket,
    color: "text-violet-600 bg-violet-50"
  },
  {
    title: "Tech Conference",
    prompt: "A high-energy tech conference website with a date-and-venue hero, speaker grid with bios modal, tabbed multi-day schedule, ticket tier cards, sponsors row, and an FAQ accordion.",
    category: "Events",
    icon: Cpu,
    color: "text-indigo-600 bg-indigo-50"
  },
  {
    title: "Pet Care",
    prompt: "A playful pet grooming and daycare website with a cheerful hero, services cards with pricing, pet-of-the-month gallery, staff bios, vaccination requirements FAQ, and a booking form.",
    category: "Pets",
    icon: PawPrint,
    color: "text-amber-600 bg-amber-50"
  },
  {
    title: "University Department",
    prompt: "A modern university department website with a hero of campus life, programs and degrees cards, faculty directory with search, research highlights, upcoming events list, and an admissions call-to-action.",
    category: "Education",
    icon: Landmark,
    color: "text-blue-600 bg-blue-50"
  },
  {
    title: "Podcast",
    prompt: "A stylish podcast website with a bold cover-art hero, latest-episodes list with play-button styling and show notes, host bios, guest highlights, subscribe-on-platform buttons, and a listener question form.",
    category: "Media",
    icon: Mic,
    color: "text-violet-600 bg-violet-50"
  },
  {
    title: "Film Production",
    prompt: "A cinematic film studio website with a dark full-bleed hero, featured-projects reel grid with hover previews, director bios, awards laurels row, behind-the-scenes gallery, and a project inquiry form.",
    category: "Media",
    icon: Film,
    color: "text-rose-600 bg-rose-50"
  },
  {
    title: "Fashion Brand",
    prompt: "A minimal fashion brand website with a lookbook hero, new-arrivals grid with quick-view hover, collection filters, brand story, size guide modal, and a newsletter signup with discount teaser.",
    category: "E-commerce",
    icon: Shirt,
    color: "text-rose-600 bg-rose-50"
  },
  {
    title: "Florist",
    prompt: "A romantic florist website with a soft botanical hero, bouquet catalog with filters by occasion, subscription plan cards, wedding services section, delivery area info, and an order-inquiry form.",
    category: "Shops",
    icon: Flower2,
    color: "text-emerald-600 bg-emerald-50"
  },
  {
    title: "Auto Dealership",
    prompt: "A sleek car dealership website with a hero inventory search, featured vehicles cards with specs, financing calculator, trade-in request form, customer reviews, and hours and directions.",
    category: "Automotive",
    icon: Car,
    color: "text-blue-600 bg-blue-50"
  },
  {
    title: "Winery",
    prompt: "An elegant winery website with a vineyard hero, wine collection cards with tasting notes, tasting-room booking form, wine-club tiers, our-heritage timeline, and visit-us details.",
    category: "Food",
    icon: Wine,
    color: "text-rose-600 bg-rose-50"
  },
  {
    title: "Daycare",
    prompt: "A warm children's daycare website with a bright hero, daily-schedule timeline, programs by age group, safety and staff credentials, parent testimonials, and an enrollment inquiry form.",
    category: "Family",
    icon: Baby,
    color: "text-amber-600 bg-amber-50"
  },
  {
    title: "Community Club",
    prompt: "A welcoming community club website with a hero and join-now button, upcoming events calendar list, membership tiers, member spotlights, photo gallery, and a contact section.",
    category: "Community",
    icon: Users,
    color: "text-emerald-600 bg-emerald-50"
  },
  {
    title: "Art Gallery",
    prompt: "A refined contemporary art gallery website with a rotating-exhibition hero, current and past exhibitions grid, artist profiles, visit info with hours, membership cards, and an email-list signup.",
    category: "Art",
    icon: Paintbrush,
    color: "text-indigo-600 bg-indigo-50"
  },
  {
    title: "Surf School",
    prompt: "A sun-soaked surf school website with an ocean hero, lesson packages cards, instructor bios, weekly conditions-and-schedule table, gear rental prices, and a lesson booking form.",
    category: "Sports",
    icon: Waves,
    color: "text-sky-600 bg-sky-50"
  },
  {
    title: "Camping Resort",
    prompt: "An outdoorsy campground website with a forest hero, campsite types cards with amenities icons, seasonal rates table, activity guide, photo gallery, and a reservation request form.",
    category: "Travel",
    icon: Tent,
    color: "text-emerald-600 bg-emerald-50"
  },
  {
    title: "Consulting Firm",
    prompt: "A sharp management consulting website with a confident hero, services pillars, case-study cards with result metrics, leadership team, insights articles grid, and a contact-us form.",
    category: "Business",
    icon: Briefcase,
    color: "text-slate-600 bg-slate-100"
  },
  {
    title: "Yoga Studio",
    prompt: "A serene yoga studio website with a calming hero, class types cards, weekly timetable with level tags, teacher profiles, membership pricing, and a free-trial signup form.",
    category: "Wellness",
    icon: Heart,
    color: "text-teal-600 bg-teal-50"
  },
  {
    title: "Online Course",
    prompt: "A persuasive online course sales page with a hero and enroll button, what-you'll-learn checklist, curriculum accordion, instructor bio, student results testimonials, pricing card with guarantee, and FAQ.",
    category: "Education",
    icon: GraduationCap,
    color: "text-violet-600 bg-violet-50"
  },
  {
    title: "Architecture Studio",
    prompt: "A minimalist architecture studio website with a large project-image hero, filterable projects grid, studio philosophy statement, team section, press mentions, and a commission inquiry form.",
    category: "Portfolio",
    icon: Building2,
    color: "text-slate-600 bg-slate-100"
  },
  {
    title: "Bakery",
    prompt: "A charming artisan bakery website with a warm hero, daily-bakes menu cards, custom-cake order form with size and flavor pickers, our-story section, market schedule, and location and hours.",
    category: "Food",
    icon: UtensilsCrossed,
    color: "text-amber-600 bg-amber-50"
  },
  {
    title: "Freelance Developer",
    prompt: "A sleek freelance developer portfolio with a code-styled hero, tech-stack badges, case-study project cards, services and rates, testimonials, and a hire-me contact form.",
    category: "Portfolio",
    icon: Cpu,
    color: "text-indigo-600 bg-indigo-50"
  },
  {
    title: "Hotel & B&B",
    prompt: "A boutique hotel website with a full-bleed hero and check-in/check-out picker, room cards with amenities and rates, dining and spa sections, guest gallery, reviews, and a booking inquiry form.",
    category: "Travel",
    icon: Building2,
    color: "text-sky-600 bg-sky-50"
  },
  {
    title: "Charity Event",
    prompt: "An urgent charity fun-run event website with a bold hero and countdown, fundraising progress bar, route and schedule details, team signup form, sponsor tiers, and an FAQ.",
    category: "Nonprofit",
    icon: Sprout,
    color: "text-emerald-600 bg-emerald-50"
  },
  {
    title: "Plumber & Handyman",
    prompt: "A trustworthy home services website for a plumber and handyman with an emergency call banner, service cards with starting prices, service area map, before/after photos, reviews, and a quote request form.",
    category: "Services",
    icon: Hammer,
    color: "text-blue-600 bg-blue-50"
  },
  {
    title: "Gym & Fitness Club",
    prompt: "An energetic gym website with a bold video-style hero, class timetable, membership plans with a comparison table, trainer profiles, facility gallery, and a free trial pass signup.",
    category: "Fitness",
    icon: Dumbbell,
    color: "text-rose-600 bg-rose-50"
  },
  {
    title: "Craft Brewery",
    prompt: "A craft brewery and taproom website with a beer list showing style and ABV, taproom hours, food truck schedule, events calendar, brewery tour booking, and an age-check welcome.",
    category: "Food & Drink",
    icon: Wine,
    color: "text-amber-600 bg-amber-50"
  },
  {
    title: "Bookstore",
    prompt: "A cosy independent bookstore website with staff picks, new arrivals carousel, book club details, author events calendar, gift card section, and store hours and location.",
    category: "Retail",
    icon: BookOpen,
    color: "text-amber-600 bg-amber-50"
  },
  {
    title: "Tattoo Studio",
    prompt: "A moody tattoo studio website with artist portfolios, style filters, a booking consultation form, aftercare guide, pricing guidance, and an FAQ.",
    category: "Art",
    icon: Paintbrush,
    color: "text-violet-600 bg-violet-50"
  },
  {
    title: "Veterinary Clinic",
    prompt: "A caring veterinary clinic website with services, meet-the-vets profiles, new client registration, emergency contact banner, pet health tips, and online appointment requests.",
    category: "Health",
    icon: Stethoscope,
    color: "text-teal-600 bg-teal-50"
  },
  {
    title: "Mobile App Launch",
    prompt: "A sleek mobile app launch page with phone mockups, animated feature highlights, screenshots carousel, App Store and Google Play badges, user testimonials, and an email waitlist.",
    category: "Marketing",
    icon: Smartphone,
    color: "text-indigo-600 bg-indigo-50"
  },
  {
    title: "Newsletter",
    prompt: "A newsletter homepage with a clear value promise, subscribe form, past issues archive with search, subscriber count, sample issue preview, and a meet-the-writer section.",
    category: "Publishing",
    icon: Newspaper,
    color: "text-sky-600 bg-sky-50"
  },
  {
    title: "Online Resume",
    prompt: "A clean one-page online resume with a summary, skills chips, experience timeline, education, project highlights, downloadable CV button, and contact links.",
    category: "Personal",
    icon: GraduationCap,
    color: "text-indigo-600 bg-indigo-50"
  },
  {
    title: "Food Truck",
    prompt: "A fun food truck website with a bold menu board, today's location and schedule, catering inquiry form, Instagram-style photo grid, and a follow-us section.",
    category: "Food",
    icon: Pizza,
    color: "text-rose-600 bg-rose-50"
  },
  {
    title: "Farmers Market",
    prompt: "A farmers market website with a seasonal produce guide, vendor directory with categories, market days and map, upcoming events, and a become-a-vendor application.",
    category: "Community",
    icon: Cherry,
    color: "text-emerald-600 bg-emerald-50"
  },
  {
    title: "Hiking Tours",
    prompt: "An adventure hiking tour company website with tour cards by difficulty and length, a trip detail page with itinerary, gear list, guide profiles, reviews, and a booking form.",
    category: "Travel",
    icon: Mountain,
    color: "text-emerald-600 bg-emerald-50"
  },
  {
    title: "Ski Resort",
    prompt: "A ski resort website with live-style snow report, lift and trail status, lift ticket and rental pricing, lessons, lodging options, and a trail map section.",
    category: "Travel",
    icon: MountainSnow,
    color: "text-sky-600 bg-sky-50"
  },
  {
    title: "Sailing Charters",
    prompt: "A sailing charter website with a fleet gallery, half and full-day trips, sunset cruises, captain profiles, what-to-bring tips, and a date-picker booking request.",
    category: "Travel",
    icon: Sailboat,
    color: "text-blue-600 bg-blue-50"
  },
  {
    title: "Escape Room Venue",
    prompt: "An escape room venue website with themed room cards showing difficulty and group size, a booking calendar, party packages, leaderboard of fastest escapes, and FAQ.",
    category: "Entertainment",
    icon: Key,
    color: "text-violet-600 bg-violet-50"
  },
  {
    title: "Indie Game Studio",
    prompt: "An indie game studio website with a featured game hero, trailer section, game library cards, devlog posts, press kit page, and a newsletter signup.",
    category: "Gaming",
    icon: Gamepad2,
    color: "text-violet-600 bg-violet-50"
  },
  {
    title: "Recipe Blog",
    prompt: "A recipe blog with a featured recipe hero, category filters, recipe pages with jump-to-recipe, ingredient checklist, printable cards, ratings, and an about-the-cook section.",
    category: "Food",
    icon: ChefHat,
    color: "text-amber-600 bg-amber-50"
  },
  {
    title: "Science Museum",
    prompt: "A family-friendly science museum website with current exhibits, ticket prices, plan-your-visit info, school group bookings, events calendar, and membership tiers.",
    category: "Culture",
    icon: FlaskConical,
    color: "text-indigo-600 bg-indigo-50"
  },
  {
    title: "Astronomy Club",
    prompt: "An astronomy club website with upcoming stargazing nights, a sky-this-month guide, member photo gallery, telescope loan program, and a join-the-club form.",
    category: "Community",
    icon: Telescope,
    color: "text-indigo-600 bg-indigo-50"
  },
  {
    title: "AI Startup",
    prompt: "A modern AI startup website with an animated hero, product demo section, use-case cards, integrations grid, security and privacy section, pricing, and a book-a-demo form.",
    category: "Tech",
    icon: Bot,
    color: "text-violet-600 bg-violet-50"
  },
  {
    title: "Cybersecurity Firm",
    prompt: "A professional cybersecurity firm website with services, threat statistics, case studies, certifications, a team section, and a free security assessment request form.",
    category: "Business",
    icon: Shield,
    color: "text-blue-600 bg-blue-50"
  },
  {
    title: "Accountant",
    prompt: "A friendly accounting and tax practice website with services for individuals and small businesses, tax deadline reminders, pricing packages, client testimonials, and a consultation booking form.",
    category: "Business",
    icon: Calculator,
    color: "text-teal-600 bg-teal-50"
  },
  {
    title: "Moving Company",
    prompt: "A moving company website with services, an instant quote estimator by home size and distance, packing tips, coverage area, reviews, and a booking form.",
    category: "Services",
    icon: Package,
    color: "text-amber-600 bg-amber-50"
  },
  {
    title: "Coworking Space",
    prompt: "A coworking space website with desk and office membership plans, an amenities grid, space photo gallery, community events, meeting room booking, and a tour request form.",
    category: "Business",
    icon: Building2,
    color: "text-sky-600 bg-sky-50"
  },
  {
    title: "Kids Coding Camp",
    prompt: "A bright kids coding camp website with age-group programs, weekly schedule, what kids will build, instructor bios, parent FAQ, pricing, and an enrolment form.",
    category: "Education",
    icon: Code2,
    color: "text-emerald-600 bg-emerald-50"
  },
  {
    title: "Tutoring Service",
    prompt: "A tutoring service website with subjects and grade levels, tutor profiles, how-it-works steps, results and testimonials, pricing packages, and a free first lesson signup.",
    category: "Education",
    icon: GraduationCap,
    color: "text-indigo-600 bg-indigo-50"
  },
  {
    title: "Landscaping",
    prompt: "A landscaping and garden design website with services, before/after project gallery, seasonal maintenance plans, service area, reviews, and a free estimate request form.",
    category: "Services",
    icon: Tractor,
    color: "text-emerald-600 bg-emerald-50"
  },
  {
    title: "Counselling Practice",
    prompt: "A calm counselling and therapy practice website with approach and specialties, therapist profiles, session fees and insurance info, a gentle FAQ, and a confidential contact form.",
    category: "Health",
    icon: Heart,
    color: "text-teal-600 bg-teal-50"
  },
  {
    title: "Multi-Page Agency",
    prompt: "A multi-page creative agency website with separate Home, Work, Services, About, and Contact pages, a shared sticky navbar and footer, a case-study page template, smooth GSAP scroll reveals, and a contact form with inline confirmation.",
    category: "Agency",
    icon: Briefcase,
    color: "text-indigo-600 bg-indigo-50"
  },
  {
    title: "Multi-Page Restaurant",
    prompt: "A multi-page restaurant website with Home, Menu, Reservations, Our Story, and Contact pages, a shared header and footer, a tabbed menu with dish cards, a reservation form with inline confirmation, and a Swiper gallery of the dining room.",
    category: "Food",
    icon: UtensilsCrossed,
    color: "text-amber-600 bg-amber-50"
  },
  {
    title: "Multi-Page SaaS",
    prompt: "A multi-page SaaS website with Home, Features, Pricing, Customers, and Contact pages, a shared navbar with dropdown menus, a monthly and yearly pricing toggle, an Alpine.js FAQ, a customer stories page, and a polished footer.",
    category: "Marketing",
    icon: Rocket,
    color: "text-violet-600 bg-violet-50"
  },
  {
    title: "Documentation Hub",
    prompt: "A multi-page documentation site with a landing page plus Getting Started, API Reference, and Guides pages, a persistent sidebar with active-page highlighting, an on-page table of contents, copyable code blocks, and a client-side search box.",
    category: "Docs",
    icon: BookOpen,
    color: "text-sky-600 bg-sky-50"
  },
  {
    title: "Case Study Portfolio",
    prompt: "A multi-page designer portfolio with a Home page, a Projects index with category filters, three individual case-study pages with large imagery and outcome stats, an About page, a GLightbox gallery, and a Contact page.",
    category: "Portfolio",
    icon: Palette,
    color: "text-rose-600 bg-rose-50"
  },
  {
    title: "Online Store",
    prompt: "A multi-page storefront with Home, Shop, Product Detail, About, and Contact pages, a filterable product grid, a product page with a Swiper image gallery and size picker, and a slide-out cart that persists across pages.",
    category: "Commerce",
    icon: Store,
    color: "text-emerald-600 bg-emerald-50"
  },
  {
    title: "Conference Site",
    prompt: "A multi-page conference website with Home, Schedule, Speakers, Venue, Tickets, and FAQ pages, a tabbed multi-day schedule, speaker cards linking to bio pages, a Leaflet venue map, and a ticket tier comparison.",
    category: "Events",
    icon: Users,
    color: "text-teal-600 bg-teal-50"
  },
  {
    title: "Impact Report",
    prompt: "An interactive annual impact report site with Home, Highlights, Programs, and Financials pages, Chart.js charts for funding and outcomes, animated count-up stats, and a sticky section navigation.",
    category: "Nonprofit",
    icon: Globe,
    color: "text-blue-600 bg-blue-50"
  }
];
