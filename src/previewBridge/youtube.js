// Preview bridge source, part 13 of 17. YouTube embeds and links, handed to the parent.
//
// Plain text, not a module of its own: ./index.js joins every part in order
// into one IIFE that runs inside the preview frame, so all parts share one
// closure scope (a var or function here is visible in the others). Same rules
// as the rest of the bridge: ES5-ish, no backtick, no "</", and no "${" except
// the protocol constants in the prelude.
export default `  // YouTube embeds. A nested frame inherits this frame's sandbox, and
  // YouTube's player cannot run without allow-same-origin (it throws on
  // window.caches and never defines writeEmbed), so the embed shows a broken
  // player. Without weakening the sandbox, the only thing that works is to
  // show a poster in place of the player (an srcdoc on the same iframe, so
  // layout is untouched) and open the video on YouTube when it's clicked.
  // Like the bridge itself this exists only at render time: the stored and
  // exported page keeps the real embed, which plays normally once published.
  //
  // Links and window.open to YouTube go through the parent too: in the
  // browser version a tab opened from here inherits the sandbox, and YouTube
  // (Cross-Origin-Opener-Policy) refuses to load in a sandboxed tab
  // ("www.youtube.com is blocked", ERR_BLOCKED_BY_RESPONSE).
  var YT_HOSTS = { 'www.youtube.com': 1, 'youtube.com': 1, 'm.youtube.com': 1, 'music.youtube.com': 1, 'www.youtube-nocookie.com': 1, 'youtube-nocookie.com': 1 };
  // Any YouTube address for one video or playlist: /embed/ID, /watch?v=ID,
  // youtu.be/ID, /shorts/ID, /live/ID, /v/ID, /playlist?list=ID and
  // /embed/videoseries?list=ID. Anything else (channels, search) is null.
  function youTubeTarget(src) {
    try {
      var u = new URL(String(src), document.baseURI);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
      var host = u.hostname.toLowerCase();
      var id = null;
      if (host === 'youtu.be' || host === 'www.youtu.be') {
        var short = /^[/]([A-Za-z0-9_-]+)[/]?$/.exec(u.pathname);
        id = short && short[1];
      } else if (YT_HOSTS[host]) {
        var m = /^[/](embed|shorts|live|v)[/]([A-Za-z0-9_-]+)[/]?$/.exec(u.pathname);
        if (m) id = m[2];
        else if (/^[/]watch[/]?$/.test(u.pathname)) id = u.searchParams.get('v');
        if (!id || id === 'videoseries' || /^[/]playlist[/]?$/.test(u.pathname)) {
          var list = u.searchParams.get('list') || '';
          if (/^[A-Za-z0-9_-]{2,64}$/.test(list)) return { kind: 'list', id: list };
        }
      }
      return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? { kind: 'video', id: id } : null;
    } catch (err) { return null; }
  }
  function youTubePoster(target) {
    var close = '<' + '/';
    // target.id is checked against [A-Za-z0-9_-] above, so it is safe in a URL.
    var thumb = target.kind === 'video' ? "url('https://i.ytimg.com/vi/" + target.id + "/hqdefault.jpg')" : 'none';
    return '<!doctype html><html><head><meta charset="utf-8"><style>'
      + 'html,body{margin:0;height:100%;overflow:hidden;background:#0f0f0f;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}'
      + 'button{all:unset;box-sizing:border-box;position:absolute;inset:0;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:12px;text-align:center;color:#fff;background:#0f0f0f ' + thumb + ' center/cover no-repeat}'
      + 'button::before{content:"";position:absolute;inset:0;background:rgba(0,0,0,.35)}'
      + 'button>*{position:relative}'
      + '.p{width:68px;height:48px;border-radius:14px;background:#f00;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 12px rgba(0,0,0,.4)}'
      + '.p::after{content:"";border-style:solid;border-width:10px 0 10px 17px;border-color:transparent transparent transparent #fff;margin-left:4px}'
      + 'button:hover .p,button:focus-visible .p{background:#c00}'
      + '.t{font-size:15px;font-weight:600;text-shadow:0 1px 4px rgba(0,0,0,.8)}'
      + '.s{font-size:12px;opacity:.85;text-shadow:0 1px 4px rgba(0,0,0,.8)}'
      + close + 'style>' + close + 'head><body>'
      + '<button type="button" aria-label="Watch on YouTube"><span class="p">' + close + 'span>'
      + '<span class="t">Watch on YouTube' + close + 'span>'
      + '<span class="s">The video plays here once the site is published' + close + 'span>' + close + 'button>'
      + '<script>document.querySelector("button").addEventListener("click",function(){parent.postMessage({__abYouTube:1},"*")});' + close + 'script>'
      + close + 'body>' + close + 'html>';
  }
  function swapYouTubeFrame(frame) {
    if (!frame || frame.tagName !== 'IFRAME') return;
    if (frame.hasAttribute('data-ab-yt')) return;
    // A page's own srcdoc wins over src already; leave it alone.
    if (frame.hasAttribute('srcdoc')) return;
    var target = youTubeTarget(frame.getAttribute('src') || '');
    if (!target) return;
    // srcdoc then data-ab-yt, in that order and last: sourceOuterHTML strips
    // exactly this pair so direct edits still match the source.
    frame.setAttribute('srcdoc', youTubePoster(target));
    frame.setAttribute('data-ab-yt', '');
  }
  function swapYouTubeFramesIn(node) {
    if (!node || node.nodeType !== 1) return;
    if (node.tagName === 'IFRAME') { swapYouTubeFrame(node); return; }
    var frames = node.getElementsByTagName ? node.getElementsByTagName('iframe') : [];
    for (var i = 0; i < frames.length; i++) swapYouTubeFrame(frames[i]);
  }
  try {
    swapYouTubeFramesIn(document.documentElement);
    new MutationObserver(function (records) {
      for (var r = 0; r < records.length; r++) {
        var rec = records[r];
        if (rec.type === 'attributes') {
          // A script pointed an existing frame at a (new) YouTube video.
          if (rec.target.hasAttribute('data-ab-yt')) {
            rec.target.removeAttribute('data-ab-yt');
            rec.target.removeAttribute('srcdoc');
          }
          swapYouTubeFrame(rec.target);
        }
        for (var n = 0; n < rec.addedNodes.length; n++) swapYouTubeFramesIn(rec.addedNodes[n]);
      }
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
  } catch (err) { /* no observer: embeds stay as they are */ }
  window.addEventListener('message', function (e) {
    if (!e.data || e.data.__abYouTube !== 1 || editingActive) return;
    var frames = document.querySelectorAll('iframe[data-ab-yt]');
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].contentWindow !== e.source) continue;
      // Re-read from the frame's src: the poster's message carries nothing.
      var target = youTubeTarget(frames[i].getAttribute('src') || '');
      if (target) post('open-youtube', target);
      return;
    }
  });

`;
