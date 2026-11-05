/*!
 * Brandridge funnel tracker — one file for every client funnel.
 * Install (page or GHL funnel "Head tracking code"):
 *   <script async src="https://javmartz04-ship-it.github.io/brandridge-tracker/t.js" data-client="mark-medicare"></script>
 * Optional attributes: data-name="Mark Szymanski" (display name), data-funnel="Medicare call funnel" (which funnel),
 *   data-step="registration" (default: URL path), data-identify="off" (don't tie form emails to the visitor).
 * Debug: add ?bt_debug=1 to any page URL to log every event in the console.
 *
 * Sends to PostHog project "Brandridge Funnels" (710063). On top of PostHog's own pageviews, autocapture,
 * heatmaps, rage clicks and session recordings, it adds:
 *   vsl_play / vsl_pause / vsl_progress (10,25,50,75,90) / vsl_complete / vsl_seek / vsl_unmute / vsl_summary
 *     for HTML5 + GHL video.js, YouTube, Vimeo and Wistia players
 *   cta_click, section_view, scroll_depth, form_start, form_submit, embed_view, embed_interact, page_summary
 */
(function () {
  if (window.__brandridgeTracker) return;
  window.__brandridgeTracker = true;

  var KEY = 'phc_ke9M5FoAFUgJk8q946o4JTZDmSBVH32xcu8ha96uwjrv';
  var HOST = 'https://us.i.posthog.com';

  // Clients whose live pages sit on their own domains. Anything else falls back to data-client or the hostname.
  var DOMAINS = {
    'medicarepa.com': 'mark-medicare',
    'therealinsurancegroup.com': 'real-insurance-group',
    'go.tindon.us': 'tindon',
    'tindon.us': 'tindon',
    'justinsuranceasl.com': 'justin-gray-asl'
  };

  var me = document.currentScript || document.querySelector('script[src*="brandridge-tracker"]') || {};
  var attr = function (n) { return me.getAttribute ? me.getAttribute(n) : null; };
  var host = location.hostname.replace(/^www\./, '');
  var path = location.pathname.replace(/\/+$/, '') || '/';
  var isPreview = /github\.io$|localhost|127\.0\.0\.1|\.test$|claudeusercontent|claude\.ai/.test(host);
  var client = attr('data-client') || DOMAINS[host] ||
    (host.endsWith('github.io') ? (path.split('/')[1] || host) : host);
  // Set by the Funnel HQ "Add a Funnel" generator so new clients and funnels show up by name with no code edits.
  var clientName = attr('data-name') || '';
  var funnel = attr('data-funnel') || '';
  var step = attr('data-step') || (path === '/' ? 'home' : path.split('/').pop().replace(/\.html$/, '') || 'home');
  var debug = /[?&]bt_debug=1/.test(location.search);

  var props0 = { client: client, funnel_step: step, env: isPreview ? 'preview' : 'live' };
  if (clientName) props0.client_name = clientName;
  if (funnel) props0.funnel = funnel;

  // ---------- PostHog loader (official snippet) ----------
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug getPageViewId".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

  // A page that already runs its own PostHog keeps it; we send through a named instance instead.
  var NAME = window.posthog && window.posthog.__loaded ? 'brandridge' : undefined;
  // Always look PostHog up fresh: the loader swaps the queue stub for the real client once it arrives.
  var P = function () { return NAME ? window.posthog[NAME] : window.posthog; };
  window.posthog.init(KEY, {
    api_host: HOST,
    ui_host: 'https://us.posthog.com',
    person_profiles: 'identified_only',
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: true,
    enable_heatmaps: true,
    capture_performance: true,
    capture_exceptions: true,
    session_recording: { maskAllInputs: true, maskTextSelector: '[data-bt-mask]' },
    debug: debug,
    loaded: function (p) { p.register(props0); }
  }, NAME);
  P().register(props0);

  function send(name, props, beacon) {
    if (debug) console.log('[brandridge]', name, props || {});
    P().capture(name, props || {}, beacon ? { transport: 'sendBeacon' } : undefined);
  }
  var text = function (el) { return (el && (el.innerText || el.textContent || el.value || el.getAttribute('aria-label') || '') || '').replace(/\s+/g, ' ').trim().slice(0, 80); };

  // Name of the section an element sits in: its id, else the nearest heading text.
  function sectionOf(el) {
    var s = el && el.closest && el.closest('section,[data-section],header,footer,main > div');
    if (!s) return 'page';
    if (s.getAttribute('data-section')) return s.getAttribute('data-section');
    if (s.id) return s.id;
    var h = s.querySelector('h1,h2,h3');
    return h ? text(h).slice(0, 50) : s.tagName.toLowerCase();
  }

  // ---------- VSL tracking ----------
  var MILESTONES = [10, 25, 50, 75, 90];
  var videos = [];
  var bestPct = 0;

  function Tracker(player, id, src) {
    this.p = { video_player: player, video_id: id, video_src: (src || '').slice(0, 200), video_index: videos.length + 1 };
    this.started = false; this.done = false; this.hit = {}; this.secs = {}; this.last = 0; this.dur = 0; this.max = 0;
    videos.push(this);
  }
  Tracker.prototype.props = function (t, extra) {
    var o = {}, k;
    for (k in this.p) o[k] = this.p[k];
    o.video_duration = Math.round(this.dur) || null;
    o.video_position = Math.round(t || 0);
    o.video_percent = this.dur ? Math.min(100, Math.round((t / this.dur) * 100)) : null;
    o.section = this.p.section;
    for (k in extra || {}) o[k] = extra[k];
    return o;
  };
  Tracker.prototype.play = function (t) {
    send('vsl_play', this.props(t, { first_play: !this.started }));
    this.started = true;
  };
  Tracker.prototype.pause = function (t) { if (!this.done || t < this.dur - 1) send('vsl_pause', this.props(t)); };
  Tracker.prototype.time = function (t, dur) {
    if (dur && isFinite(dur)) this.dur = dur;
    if (Math.abs(t - this.last) < 2.5) this.secs[Math.floor(t)] = 1;           // real watching, not a jump
    else if (this.started && Math.abs(t - this.last) >= 2.5) send('vsl_seek', this.props(t, { seek_from: Math.round(this.last), seek_to: Math.round(t) }));
    this.last = t;
    if (!this.dur) return;
    var pct = (t / this.dur) * 100;
    if (pct > this.max) this.max = pct;
    for (var i = 0; i < MILESTONES.length; i++) {
      var m = MILESTONES[i];
      if (pct >= m && !this.hit[m]) { this.hit[m] = 1; send('vsl_progress', this.props(t, { milestone: m })); }
    }
    if (pct >= 97) this.end(t);
    var watched = Math.min(100, Math.round((Object.keys(this.secs).length / this.dur) * 100));
    if (watched > bestPct) { bestPct = watched; P().register({ vsl_watched_percent: bestPct }); }
  };
  Tracker.prototype.end = function (t) {
    if (this.done) return; this.done = true;
    send('vsl_complete', this.props(t || this.dur));
  };
  Tracker.prototype.summary = function () {
    if (!this.started || this.sent) return; this.sent = true;
    var w = Object.keys(this.secs).length;
    send('vsl_summary', this.props(this.last, {
      seconds_watched: w,
      watched_percent: this.dur ? Math.min(100, Math.round((w / this.dur) * 100)) : null,
      furthest_percent: Math.round(this.max),
      completed: this.done
    }), true);
  };

  // HTML5 <video> — also covers GHL's video.js player. Skips muted looping background footage.
  function hookHtml5(v) {
    if (v.__bt || (v.loop && (v.muted || v.hasAttribute('muted')))) return;
    v.__bt = 1;
    var tr = new Tracker(v.closest('.video-js') ? 'ghl-videojs' : 'html5', v.id || null, v.currentSrc || v.src || (v.querySelector('source') || {}).src);
    tr.p.section = sectionOf(v);
    v.addEventListener('play', function () { tr.play(v.currentTime); });
    v.addEventListener('pause', function () { if (!v.ended) tr.pause(v.currentTime); });
    v.addEventListener('timeupdate', function () { tr.time(v.currentTime, v.duration); });
    v.addEventListener('ended', function () { tr.end(v.duration); });
    var wasMuted = v.muted;
    v.addEventListener('volumechange', function () {
      if (wasMuted && !v.muted) send('vsl_unmute', tr.props(v.currentTime));
      wasMuted = v.muted;
    });
  }

  function loadScript(src, cb) {
    var s = document.createElement('script'); s.src = src; s.async = true; s.onload = cb; document.head.appendChild(s);
  }

  // YouTube: needs enablejsapi=1 on the iframe, then the IFrame API.
  var ytQueue = [];
  function hookYouTube(f) {
    if (f.__bt) return; f.__bt = 1;
    var src = f.src;
    if (!/enablejsapi=1/.test(src)) {
      f.src = src + (src.indexOf('?') > -1 ? '&' : '?') + 'enablejsapi=1&origin=' + encodeURIComponent(location.origin);
    }
    var id = (src.match(/embed\/([\w-]{6,})/) || [])[1];
    var tr = new Tracker('youtube', id, src); tr.p.section = sectionOf(f);
    ytQueue.push([f, tr]);
    if (window.YT && window.YT.Player) return startYouTube();
    var prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function () { if (prev) prev(); startYouTube(); };
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) loadScript('https://www.youtube.com/iframe_api');
  }
  function startYouTube() {
    while (ytQueue.length) (function (pair) {
      var tr = pair[1], timer;
      new window.YT.Player(pair[0], { events: { onStateChange: function (e) {
        var p = e.target, t = p.getCurrentTime(), S = window.YT.PlayerState;
        tr.dur = p.getDuration();
        if (e.data === S.PLAYING) {
          tr.play(t); clearInterval(timer);
          timer = setInterval(function () { tr.time(p.getCurrentTime(), p.getDuration()); }, 1000);
        } else {
          clearInterval(timer);
          if (e.data === S.PAUSED) tr.pause(t);
          if (e.data === S.ENDED) tr.end(tr.dur);
        }
      } } });
    })(ytQueue.shift());
  }

  // Vimeo: the official player.js talks to any existing embed.
  function hookVimeo(f) {
    if (f.__bt) return; f.__bt = 1;
    var tr = new Tracker('vimeo', (f.src.match(/video\/(\d+)/) || [])[1], f.src); tr.p.section = sectionOf(f);
    var go = function () {
      var p = new window.Vimeo.Player(f);
      p.on('play', function (d) { tr.play(d.seconds); });
      p.on('pause', function (d) { tr.pause(d.seconds); });
      p.on('timeupdate', function (d) { tr.time(d.seconds, d.duration); });
      p.on('ended', function (d) { tr.end(d.duration); });
      p.on('volumechange', function (d) { if (d.volume > 0) send('vsl_unmute', tr.props(tr.last)); });
    };
    window.Vimeo && window.Vimeo.Player ? go() : loadScript('https://player.vimeo.com/api/player.js', go);
  }

  // Wistia: every embed on the page reports through the _wq queue.
  function hookWistia() {
    window._wq = window._wq || [];
    window._wq.push({ id: '_all', onReady: function (v) {
      if (v.__bt) return; v.__bt = 1;
      var tr = new Tracker('wistia', v.hashedId(), null); tr.p.section = sectionOf(v.container);
      v.bind('play', function () { tr.play(v.time()); });
      v.bind('pause', function () { tr.pause(v.time()); });
      v.bind('secondchange', function (s) { tr.time(s, v.duration()); });
      v.bind('end', function () { tr.end(v.duration()); });
      v.bind('mutechange', function (m) { if (!m) send('vsl_unmute', tr.props(v.time())); });
    } });
  }

  // ---------- Embeds (GHL calendars & forms, video iframes) ----------
  function embedKind(f) {
    var s = f.src || '';
    if (/widget\/(booking|bookings|appointment|group|service-menu)|\/booking\//i.test(s) || /calendar/i.test(f.id + f.className)) return 'calendar';
    if (/widget\/(form|survey|quiz)/i.test(s)) return 'form';
    if (/youtube|vimeo|wistia|loom/i.test(s)) return 'video';
    if (/leadconnector|msgsndr|gohighlevel/i.test(s)) return 'ghl-widget';
    return null;
  }

  var embedSeen = new WeakSet();
  var embedIO = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (e.isIntersecting && !embedSeen.has(e.target)) {
        embedSeen.add(e.target);
        send('embed_view', { embed: embedKind(e.target), section: sectionOf(e.target) });
      }
    });
  }, { threshold: 0.5 }) : null;

  // A click into a cross-origin iframe shows up as the window losing focus to that iframe.
  var interacted = new WeakSet();
  window.addEventListener('blur', function () {
    setTimeout(function () {
      var f = document.activeElement;
      if (!f || f.tagName !== 'IFRAME' || interacted.has(f)) return;
      interacted.add(f);
      send('embed_interact', { embed: embedKind(f) || 'iframe', section: sectionOf(f) });
    }, 0);
  });

  // GHL widgets post messages to the parent; booking/submit ones become events.
  window.addEventListener('message', function (e) {
    if (!/leadconnector|msgsndr|gohighlevel|link\./i.test(e.origin)) return;
    var d = typeof e.data === 'string' ? e.data : (function () { try { return JSON.stringify(e.data); } catch (x) { return ''; } })();
    if (/booking[-_ ]?(complete|success|confirm)|appointment[-_ ]?(booked|created)/i.test(d)) send('calendar_booked', { source: 'ghl-widget' });
    else if (/form[-_ ]?submi|survey[-_ ]?submi/i.test(d)) send('form_submit', { form: 'ghl-widget', source: 'ghl-widget' });
  });

  function scan(root) {
    (root.querySelectorAll ? root : document).querySelectorAll('video').forEach(hookHtml5);
    (root.querySelectorAll ? root : document).querySelectorAll('iframe').forEach(function (f) {
      var s = f.src || '';
      if (/youtube(-nocookie)?\.com\/embed/.test(s)) hookYouTube(f);
      else if (/player\.vimeo\.com/.test(s)) hookVimeo(f);
      if (embedKind(f) && embedIO && !f.__btEmbed) { f.__btEmbed = 1; embedIO.observe(f); }
    });
    if (!window.__btWistia && document.querySelector('.wistia_embed,[class*="wistia_async"],iframe[src*="wistia"]')) {
      window.__btWistia = 1; hookWistia();
    }
  }

  // ---------- CTAs ----------
  var foldLine = window.innerHeight;
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('a,button,[role="button"],input[type="submit"],input[type="button"]');
    if (!el) return;
    var all = Array.prototype.slice.call(document.querySelectorAll('a.btn,a[class*="cta"],a[class*="button"],button,[role="button"],a[href*="#"]'));
    var r = el.getBoundingClientRect();
    send('cta_click', {
      cta_label: text(el),
      cta_href: el.getAttribute('href') || null,
      cta_index: all.indexOf(el) + 1 || null,
      section: sectionOf(el),
      above_fold: r.top + window.scrollY < foldLine,
      page_percent: Math.round(((r.top + window.scrollY) / Math.max(1, document.documentElement.scrollHeight)) * 100)
    });
  }, true);

  // ---------- Sections: which ones got seen, and for how long ----------
  var dwell = {}, visibleSince = {}, sectionIO;
  function hookSections() {
    if (!('IntersectionObserver' in window)) return;
    var seen = {};
    sectionIO = new IntersectionObserver(function (es) {
      var now = Date.now();
      es.forEach(function (e) {
        var name = e.target.__btName, idx = e.target.__btIdx;
        if (e.isIntersecting) {
          visibleSince[idx] = now;
          if (!seen[idx]) { seen[idx] = 1; send('section_view', { section: name, section_index: idx }); }
        } else if (visibleSince[idx]) {
          dwell[name] = (dwell[name] || 0) + (now - visibleSince[idx]); delete visibleSince[idx];
        }
      });
    }, { rootMargin: '-35% 0px -35% 0px', threshold: 0 }); // "viewed" = crosses the middle of the screen, works for any section height
    observeSections();
  }
  var sectionCount = 0;
  function observeSections() {
    if (!sectionIO) return;
    document.querySelectorAll('section,[data-section],header,footer').forEach(function (s) {
      if (s.__btIdx || s.offsetHeight < 120 || (s.parentElement && s.parentElement.closest('section'))) return;
      s.__btIdx = ++sectionCount;
      var h = s.querySelector('h1,h2,h3');
      s.__btName = s.getAttribute('data-section') || s.id || (h ? text(h).slice(0, 50) : s.tagName.toLowerCase() + '-' + sectionCount);
      sectionIO.observe(s);
    });
  }

  // ---------- Scroll depth ----------
  var maxScroll = 0, scrollHit = {};
  function onScroll() {
    var h = document.documentElement.scrollHeight - window.innerHeight;
    var pct = h > 0 ? Math.round((window.scrollY / h) * 100) : 100;
    if (pct > maxScroll) maxScroll = pct;
    [25, 50, 75, 100].forEach(function (m) {
      if (maxScroll >= m && !scrollHit[m]) { scrollHit[m] = 1; send('scroll_depth', { depth: m }); }
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  // ---------- Native forms (our own opt-in forms; GHL iframes are handled above) ----------
  var started = new WeakSet();
  document.addEventListener('focusin', function (e) {
    var f = e.target.form;
    if (!f || started.has(f)) return;
    started.add(f);
    send('form_start', { form: f.id || f.name || sectionOf(f), first_field: e.target.name || e.target.type });
  });
  document.addEventListener('submit', function (e) {
    var f = e.target, email = f.querySelector('input[type="email"],input[name*="email" i]');
    send('form_submit', { form: f.id || f.name || sectionOf(f), fields: f.querySelectorAll('input,select,textarea').length, source: 'page-form' });
    if (attr('data-identify') !== 'off' && email && /.+@.+\..+/.test(email.value)) {
      var nameEl = f.querySelector('input[name*="first" i],input[name*="name" i]');
      P().identify(email.value.trim().toLowerCase(), { email: email.value.trim().toLowerCase(), name: nameEl ? nameEl.value : undefined, client: client });
    }
  }, true);

  // ---------- Engaged time + exit summary ----------
  var engagedMs = 0, lastActive = Date.now(), tick = Date.now();
  ['mousemove', 'keydown', 'scroll', 'touchstart', 'click'].forEach(function (ev) {
    window.addEventListener(ev, function () { lastActive = Date.now(); }, { passive: true });
  });
  setInterval(function () {
    var now = Date.now();
    if (!document.hidden && now - lastActive < 30000) engagedMs += now - tick;
    if (videos.some(function (v) { return v.started && !v.done && Date.now() - lastActive < 600000; })) lastActive = now; // watching counts
    tick = now;
  }, 1000);

  var summarized = false;
  function summarize() {
    if (summarized) return; summarized = true;
    var now = Date.now();
    document.querySelectorAll('section,[data-section],header,footer').forEach(function (s) {
      if (s.__btIdx && visibleSince[s.__btIdx]) { dwell[s.__btName] = (dwell[s.__btName] || 0) + (now - visibleSince[s.__btIdx]); }
    });
    var secs = {}, k;
    for (k in dwell) secs[k] = Math.round(dwell[k] / 1000);
    videos.forEach(function (v) { v.summary(); });
    send('page_summary', {
      engaged_seconds: Math.round(engagedMs / 1000),
      max_scroll_percent: maxScroll,
      section_seconds: secs,
      videos_on_page: videos.length,
      vsl_watched_percent: bestPct
    }, true);
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') summarize(); });
  window.addEventListener('pagehide', summarize);

  // ---------- Start ----------
  function start() {
    scan(document); hookSections(); onScroll();
    // GHL and our builds render some pieces late (video.js, calendar widgets); keep watching for them.
    var pending;
    new MutationObserver(function () {
      clearTimeout(pending);
      pending = setTimeout(function () { scan(document); observeSections(); }, 400);
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start) : start();
})();
