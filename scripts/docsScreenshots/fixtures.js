// Seed projects for scripts/docs-screenshots.mjs. Hand-written stand-ins for
// what the AI builds, so the docs screenshots need no provider or tokens.
// Ray's Ski Resort is the real Showcase project from public/showcase/.
import { readFileSync } from 'node:fs';

const skiResort = readFileSync(new URL('../../public/showcase/ray-s-ski-resort.html', import.meta.url), 'utf8');

const tipApp = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tip Splitter</title>
<style>
  :root { --ink: #0f172a; --muted: #64748b; --accent: #0d9488; --card: #ffffff; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--ink);
    background: linear-gradient(160deg, #ccfbf1 0%, #f0fdfa 45%, #ecfeff 100%); min-height: 100vh; }
  main { max-width: 420px; margin: 0 auto; padding: 28px 20px 40px; }
  h1 { font-size: 26px; margin: 0 0 4px; letter-spacing: -0.02em; }
  p.lead { margin: 0 0 22px; color: var(--muted); }
  .card { background: var(--card); border-radius: 20px; padding: 20px; box-shadow: 0 10px 30px -12px rgba(15,23,42,.18); margin-bottom: 16px; }
  label { display: block; font-size: 13px; font-weight: 600; color: var(--muted); margin-bottom: 8px; text-transform: uppercase; letter-spacing: .06em; }
  input { width: 100%; font-size: 28px; font-weight: 700; border: 2px solid #e2e8f0; border-radius: 14px; padding: 10px 14px; color: var(--ink); }
  input:focus { outline: none; border-color: var(--accent); }
  .tips { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .tips button { font: inherit; font-weight: 700; padding: 12px 0; border-radius: 12px; border: 2px solid #e2e8f0; background: #fff; cursor: pointer; }
  .tips button.on { background: var(--accent); border-color: var(--accent); color: #fff; }
  .people { display: flex; align-items: center; justify-content: space-between; }
  .people button { width: 44px; height: 44px; border-radius: 50%; border: none; background: #f1f5f9; font-size: 22px; cursor: pointer; }
  .people strong { font-size: 28px; }
  .total { background: var(--ink); color: #fff; }
  .row { display: flex; justify-content: space-between; align-items: baseline; padding: 6px 0; }
  .row span { color: #94a3b8; }
  .row b { font-size: 22px; }
  .row.big b { font-size: 40px; color: #5eead4; }
</style>
</head>
<body>
<main>
  <h1>Tip Splitter</h1>
  <p class="lead">Enter the bill, pick a tip, split it fairly.</p>
  <div class="card">
    <label for="bill">Bill</label>
    <input id="bill" type="number" inputmode="decimal" value="84.50">
  </div>
  <div class="card">
    <label>Tip</label>
    <div class="tips">
      <button data-tip="10">10%</button><button data-tip="15">15%</button><button data-tip="18" class="on">18%</button><button data-tip="20">20%</button>
    </div>
  </div>
  <div class="card">
    <label>People</label>
    <div class="people"><button id="minus" aria-label="Fewer people">−</button><strong id="count">3</strong><button id="plus" aria-label="More people">+</button></div>
  </div>
  <div class="card total">
    <div class="row"><span>Tip</span><b id="tip"></b></div>
    <div class="row"><span>Total</span><b id="sum"></b></div>
    <div class="row big"><span>Each person</span><b id="each"></b></div>
  </div>
</main>
<script>
  let tip = 18, people = 3;
  const $ = (id) => document.getElementById(id);
  const money = (n) => '$' + n.toFixed(2);
  function update() {
    const bill = parseFloat($('bill').value) || 0;
    const t = bill * tip / 100;
    $('tip').textContent = money(t);
    $('sum').textContent = money(bill + t);
    $('each').textContent = money((bill + t) / people);
    $('count').textContent = people;
  }
  document.querySelectorAll('.tips button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.tips button').forEach((x) => x.classList.remove('on'));
    b.classList.add('on'); tip = Number(b.dataset.tip); update();
  }));
  $('minus').addEventListener('click', () => { people = Math.max(1, people - 1); update(); });
  $('plus').addEventListener('click', () => { people += 1; update(); });
  $('bill').addEventListener('input', update);
  update();
</script>
</body>
</html>`;

const siteHead = (title) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Hearth &amp; Crumb</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Georgia, "Times New Roman", serif; color: #3b2a1e; background: #fdf8f1; }
  a { color: inherit; }
  header { display: flex; align-items: center; justify-content: space-between; padding: 20px 6vw; border-bottom: 1px solid #ecdcc8; background: #fdf8f1; }
  .logo { font-size: 22px; font-weight: 700; text-decoration: none; }
  nav a { margin-left: 28px; font-family: system-ui, sans-serif; font-size: 15px; text-decoration: none; color: #7a5a40; }
  nav a.here { color: #3b2a1e; font-weight: 600; }
  .hero { display: grid; grid-template-columns: 1.1fr 1fr; gap: 48px; align-items: center; padding: 72px 6vw; }
  .hero h1 { font-size: clamp(36px, 5vw, 60px); line-height: 1.05; margin: 0 0 18px; }
  .hero p { font-family: system-ui, sans-serif; font-size: 18px; line-height: 1.6; color: #6b4f3a; margin: 0 0 28px; }
  .btn { display: inline-block; font-family: system-ui, sans-serif; font-weight: 600; background: #b45309; color: #fff; padding: 14px 26px; border-radius: 999px; text-decoration: none; }
  .art { aspect-ratio: 4/3; border-radius: 28px; background:
      radial-gradient(circle at 30% 35%, #f59e0b 0 18%, transparent 19%),
      radial-gradient(circle at 62% 58%, #d97706 0 22%, transparent 23%),
      radial-gradient(circle at 75% 28%, #fbbf24 0 10%, transparent 11%),
      linear-gradient(135deg, #fde7c8, #f6c58f); box-shadow: 0 30px 60px -30px rgba(120,53,15,.5); }
  section.cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; padding: 0 6vw 72px; }
  .card { background: #fff; border: 1px solid #ecdcc8; border-radius: 20px; padding: 26px; }
  .card h3 { margin: 0 0 8px; font-size: 22px; }
  .card p { margin: 0; font-family: system-ui, sans-serif; color: #6b4f3a; line-height: 1.55; }
  .price { float: right; font-family: system-ui, sans-serif; font-weight: 700; color: #b45309; }
  footer { padding: 28px 6vw; font-family: system-ui, sans-serif; font-size: 14px; color: #7a5a40; border-top: 1px solid #ecdcc8; }
  @media (max-width: 760px) { .hero, section.cards { grid-template-columns: 1fr; } nav a { margin-left: 14px; } }
</style>
</head>`;

const siteHeader = (here) => `<header>
  <a class="logo" href="index.html">Hearth &amp; Crumb</a>
  <nav>
    <a href="index.html"${here === 'index' ? ' class="here"' : ''}>Home</a>
    <a href="menu.html"${here === 'menu' ? ' class="here"' : ''}>Menu</a>
    <a href="visit.html"${here === 'visit' ? ' class="here"' : ''}>Visit us</a>
  </nav>
</header>`;

const siteFooter = '<footer>Hearth &amp; Crumb Bakery · 14 Mill Lane · Open Tue–Sun, 7am–3pm</footer>';

const bakery = {
  'index.html': `${siteHead('Home')}
<body>
${siteHeader('index')}
<section class="hero">
  <div>
    <h1>Bread worth getting up early for.</h1>
    <p>Sourdough, croissants and seasonal bakes, made by hand every morning in our little neighborhood bakery.</p>
    <a class="btn" href="menu.html">See today’s menu</a>
  </div>
  <div class="art" role="img" aria-label="Fresh loaves on a counter"></div>
</section>
<section class="cards">
  <div class="card"><h3>Slow sourdough</h3><p>Fermented for 36 hours for a deep flavor and a crackling crust.</p></div>
  <div class="card"><h3>Butter croissants</h3><p>Laminated by hand with French butter, baked twice each morning.</p></div>
  <div class="card"><h3>Seasonal tarts</h3><p>Whatever the local farms bring us, in a crisp, buttery shell.</p></div>
</section>
${siteFooter}
</body>
</html>`,
  'menu.html': `${siteHead('Menu')}
<body>
${siteHeader('menu')}
<section class="hero"><div><h1>Today’s menu</h1><p>Baked fresh this morning. When it’s gone, it’s gone.</p></div></section>
<section class="cards">
  <div class="card"><h3>Country loaf <span class="price">$9</span></h3><p>Our everyday sourdough.</p></div>
  <div class="card"><h3>Croissant <span class="price">$4</span></h3><p>Plain, almond or chocolate.</p></div>
  <div class="card"><h3>Pear tart <span class="price">$6</span></h3><p>With brown butter and vanilla.</p></div>
</section>
${siteFooter}
</body>
</html>`,
  'visit.html': `${siteHead('Visit us')}
<body>
${siteHeader('visit')}
<section class="hero"><div><h1>Come say hello</h1><p>14 Mill Lane. Open Tuesday to Sunday, 7am to 3pm.</p></div></section>
${siteFooter}
</body>
</html>`,
};

const at = (minutesAgo) => new Date(Date.now() - minutesAgo * 60000).toISOString();

export function seedProjects() {
  const tipVersions = [
    {
      id: 'tip-1', code: tipApp, chatSessionId: 'tip-chat', timestamp: '10:02',
      prompt: 'A tip calculator. I enter the bill, pick a tip percentage and the number of people, and it shows the tip and the total per person.',
      reply: 'Your **Tip Splitter** is ready. Enter the bill, tap a tip percentage and use − and + to set how many people are paying. The tip, the total and each person’s share update as you type.',
    },
    {
      id: 'tip-2', code: tipApp, chatSessionId: 'tip-chat', timestamp: '10:05',
      prompt: 'Make the total card dark and the per-person amount bigger.',
      reply: 'Done. The totals now sit on a dark card, and **Each person** is the largest number on the screen so it’s easy to read across the table.',
    },
  ];
  const siteVersions = [
    {
      id: 'site-1', files: bakery, code: bakery['index.html'], chatSessionId: 'site-chat', timestamp: '09:40',
      prompt: 'A warm, simple website for my bakery, Hearth & Crumb, with a home page, a menu page and a visit us page.',
      reply: 'Your bakery site is ready with three pages: **Home**, **Menu** and **Visit us**. Each page shares the same header, so visitors can move between them from anywhere.',
    },
  ];
  const skiVersions = [
    {
      id: 'ski-1', files: { 'index.html': skiResort }, code: skiResort, chatSessionId: 'ski-chat', timestamp: '11:20',
      prompt: 'A website for Ray’s Ski Resort with a daily snow report, live lift and trail status, an interactive trail map, and booking for lift tickets, lessons and lodging.',
      reply: 'Your **Ray’s Ski Resort** site is ready. It opens with today’s snow report, then lift and trail status, the trail map, and booking for tickets, lessons and lodging.',
    },
  ];
  return [
    { id: 'docs-ski', name: 'Ray’s Ski Resort', updatedAt: at(60), data: { versions: skiVersions, currentVersionIndex: 0, chatContextStartIndex: 0, currentChatSessionId: 'ski-chat', studioMode: 'website' } },
    { id: 'docs-tip', name: 'Tip Splitter', updatedAt: at(5), data: { versions: tipVersions, currentVersionIndex: 1, chatContextStartIndex: 0, currentChatSessionId: 'tip-chat', studioMode: 'app' } },
    { id: 'docs-bakery', name: 'Hearth & Crumb', updatedAt: at(30), data: { versions: siteVersions, currentVersionIndex: 0, chatContextStartIndex: 0, currentChatSessionId: 'site-chat', studioMode: 'website' } },
  ];
}
