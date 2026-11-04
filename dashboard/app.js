(function () {
  var PROJECT = 710063;
  var API = 'https://us.posthog.com';
  var KEY_STORE = 'funnelhq_key';

  // Display names for client slugs (the tracker's data-client). Unknown slugs show as-is.
  var CLIENTS = {
    'mark-medicare': { name: 'Mark Szymanski', sub: 'Medicare PA · medicarepa.com' },
    'real-insurance-group': { name: 'The Real Insurance Group', sub: 'therealinsurancegroup.com' },
    'tindon': { name: 'Tindon Health & Wealth', sub: 'go.tindon.us' },
    'justin-gray-asl': { name: 'Justin Gray', sub: 'ASL Medicare · justinsuranceasl.com' }
  };
  // A visit counts as a lead / booking when it hits one of these paths (or fires form_submit / calendar_booked).
  var LEAD_PATH = '(?i)thank|registered|confirmed|^/retiringmedicarevideo';
  var BOOKED_PATH = '(?i)booked|booking-confirm|confirmation|scheduled';

  var state = { days: 30, client: '', step: null, vsl: 0, sample: false, data: null, page: null, updated: null, busy: false };
  var $ = function (id) { return document.getElementById(id); };
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  // ---------- formatting ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function n(v) { return Number(v) || 0; }
  function fmt(v) {
    v = n(v);
    if (v >= 1e6) return (v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
    if (v >= 1e4) return (v / 1e3).toFixed(v >= 1e5 ? 0 : 1).replace(/\.0$/, '') + 'K';
    return v.toLocaleString('en-US');
  }
  function rate(a, b) { return n(b) ? n(a) / n(b) * 100 : 0; }
  function pct(v, d) { return (Math.round(v * Math.pow(10, d || 0)) / Math.pow(10, d || 0)).toFixed(d || 0) + '%'; }
  function dur(s) {
    s = Math.round(n(s));
    if (s < 60) return s + 's';
    var m = Math.floor(s / 60), r = s % 60;
    return m + 'm' + (r ? ' ' + r + 's' : '');
  }
  function clock(s) { s = Math.round(n(s)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function ago(t) {
    var s = (Date.now() - new Date(t).getTime()) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' hr ago';
    return Math.floor(s / 86400) + 'd ago';
  }
  function cname(slug) { return (CLIENTS[slug] && CLIENTS[slug].name) || slug || 'Unknown'; }
  function delta(cur, prev, points) {
    cur = n(cur); prev = n(prev);
    if (points) {
      var d = cur - prev;
      if (Math.abs(d) < 0.5) return '<span class="delta flat">No change</span>';
      return '<span class="delta ' + (d > 0 ? 'up' : 'down') + '">' + (d > 0 ? '▲ ' : '▼ ') + Math.abs(d).toFixed(1) + ' pts</span>';
    }
    if (!prev && !cur) return '<span class="delta flat">No data yet</span>';
    if (!prev) return '<span class="delta flat">New this period</span>';
    var p = (cur - prev) / prev * 100;
    if (Math.abs(p) < 1) return '<span class="delta flat">No change</span>';
    return '<span class="delta ' + (p > 0 ? 'up' : 'down') + '">' + (p > 0 ? '▲ ' : '▼ ') + Math.abs(Math.round(p)) + '%</span>';
  }
  function vsPrev() { return state.days === 1 ? 'vs yesterday' : 'vs previous ' + state.days + ' days'; }

  // ---------- data source ----------
  function filters() {
    return { days: state.days, client: state.client, leadPath: LEAD_PATH, bookedPath: BOOKED_PATH };
  }
  function run(sql, values) {
    return fetch(API + '/api/projects/' + PROJECT + '/query/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + store.get(KEY_STORE) },
      body: JSON.stringify({ query: { kind: 'HogQLQuery', query: sql, values: values } })
    }).then(function (r) {
      if (r.status === 401 || r.status === 403) { var e = new Error('auth'); e.auth = true; throw e; }
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j.detail || ('PostHog error ' + r.status));
        return j;
      });
    });
  }
  function source() {
    return state.sample ? window.FunnelSample : {
      load: function (f) { return window.FunnelQueries.load(run, f); },
      loadPage: function (f, step) { return window.FunnelQueries.loadPage(run, f, step); }
    };
  }

  // ---------- tooltip ----------
  var tip = $('tip');
  function showTip(html, x, y) {
    tip.innerHTML = html; tip.classList.add('on');
    var w = tip.offsetWidth, h = tip.offsetHeight;
    var left = Math.min(Math.max(8, x + 14), window.innerWidth - w - 8);
    var top = y - h - 12 < 8 ? y + 16 : y - h - 12;
    tip.style.left = left + window.scrollX + 'px'; tip.style.top = top + window.scrollY + 'px';
  }
  function hideTip() { tip.classList.remove('on'); }
  function tipRow(color, label, value) {
    return '<div class="r"><span class="k"><i style="background:' + color + '"></i>' + esc(label) + '</span><b>' + esc(value) + '</b></div>';
  }

  // ---------- SVG helpers ----------
  var NS = 'http://www.w3.org/2000/svg';
  function niceMax(v) {
    if (v <= 4) return 4;
    var p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  }
  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  // Time-series line chart. series: [{key, label, color(css var)}]. One y-axis for all series.
  function lineChart(el, rows, series, opts) {
    opts = opts || {};
    var W = Math.max(280, el.clientWidth), H = opts.height || 150, L = 34, R = 10, T = 10, B = 24;
    var iw = W - L - R, ih = H - T - B;
    var max = niceMax(Math.max.apply(null, [1].concat(rows.map(function (r) { return Math.max.apply(null, series.map(function (s) { return n(r[s.key]); })); }))));
    var x = function (i) { return L + (rows.length < 2 ? iw / 2 : i * iw / (rows.length - 1)); };
    var y = function (v) { return T + ih - n(v) / max * ih; };
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(opts.label || '') + '">';
    for (var g = 0; g <= 4; g++) {
      var gv = max * g / 4, gy = y(gv);
      svg += '<line class="' + (g === 0 ? 'baseline' : 'gridline') + '" x1="' + L + '" x2="' + (W - R) + '" y1="' + gy + '" y2="' + gy + '"/>';
      if (g % 2 === 0) svg += '<text class="tick" x="' + (L - 8) + '" y="' + (gy + 4) + '" text-anchor="end">' + fmt(gv) + '</text>';
    }
    var ticks = rows.length > 1 ? [0, Math.floor((rows.length - 1) / 2), rows.length - 1] : [0];
    ticks.forEach(function (i, k) {
      var anchor = rows.length < 2 ? 'middle' : k === 0 ? 'start' : k === ticks.length - 1 ? 'end' : 'middle';
      svg += '<text class="tick" x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="' + anchor + '">' + esc(opts.xlabel(rows[i])) + '</text>';
    });
    series.forEach(function (s) {
      var pts = rows.map(function (r, i) { return x(i) + ',' + y(r[s.key]); });
      if (opts.area && series.length === 1 && rows.length > 1) {
        svg += '<path d="M' + x(0) + ',' + y(0) + 'L' + pts.join('L') + 'L' + x(rows.length - 1) + ',' + y(0) + 'Z" fill="var(' + s.color + ')" opacity="0.1"/>';
      }
      if (rows.length > 1) svg += '<polyline class="line" stroke="var(' + s.color + ')" points="' + pts.join(' ') + '"/>';
      var li = rows.length - 1;
      if (li >= 0) svg += '<circle cx="' + x(li) + '" cy="' + y(rows[li][s.key]) + '" r="4" fill="var(' + s.color + ')" stroke="var(--card)" stroke-width="2"/>';
    });
    svg += '<line class="cross" id="' + el.id + '-x" y1="' + T + '" y2="' + (T + ih) + '" x1="-10" x2="-10"/>';
    series.forEach(function (s, k) { svg += '<circle id="' + el.id + '-d' + k + '" r="4" cx="-10" cy="-10" style="display:none" fill="var(' + s.color + ')" stroke="var(--card)" stroke-width="2"/>'; });
    svg += '<rect x="' + L + '" y="0" width="' + iw + '" height="' + H + '" fill="transparent" class="hit"/></svg>';
    el.innerHTML = svg;
    var hit = el.querySelector('.hit'), sv = el.querySelector('svg');
    hit.addEventListener('pointermove', function (e) {
      if (!rows.length) return;
      var b = sv.getBoundingClientRect(), px = (e.clientX - b.left) * W / b.width;
      var i = rows.length < 2 ? 0 : Math.max(0, Math.min(rows.length - 1, Math.round((px - L) / iw * (rows.length - 1))));
      var cx = x(i);
      var cl = el.querySelector('#' + el.id + '-x'); cl.setAttribute('x1', cx); cl.setAttribute('x2', cx);
      var html = '<div class="t">' + esc(opts.tiplabel(rows[i])) + '</div>';
      series.forEach(function (s, k) {
        var d = el.querySelector('#' + el.id + '-d' + k); d.style.display = ''; d.setAttribute('cx', cx); d.setAttribute('cy', y(rows[i][s.key]));
        html += tipRow('var(' + s.color + ')', s.label, fmt(rows[i][s.key]));
      });
      showTip(html, e.clientX, e.clientY);
    });
    hit.addEventListener('pointerleave', function () {
      hideTip();
      var cl = el.querySelector('#' + el.id + '-x'); cl.setAttribute('x1', -10); cl.setAttribute('x2', -10);
      series.forEach(function (s, k) { el.querySelector('#' + el.id + '-d' + k).style.display = 'none'; });
    });
  }

  // ---------- renderers ----------
  function renderHero(d) {
    var k = d.kpis[0] || {}, p = d.prev[0] || {};
    $('h-leads').textContent = fmt(k.leads);
    $('h-delta').innerHTML = delta(k.leads, p.leads) + ' <span class="delta flat">' + vsPrev() + '</span>';
    $('h-rate').textContent = pct(rate(k.leads, k.visitors), 1);
    $('h-booked').textContent = fmt(k.booked);
    $('h-bookrate').textContent = pct(rate(k.booked, k.leads));
    var tiles = [
      ['Visitors', fmt(k.visitors), delta(k.visitors, p.visitors), 'unique people'],
      ['Pressed play', pct(rate(k.players, k.visitors)), delta(rate(k.players, k.visitors), rate(p.players, p.visitors), true), fmt(k.players) + ' people'],
      ['Avg. of VSL watched', k.avg_watched == null ? '—' : pct(n(k.avg_watched)), delta(k.avg_watched, p.avg_watched, true), 'skipped parts not counted'],
      ['Watched half the VSL', pct(rate(k.halfway, k.players)), delta(rate(k.halfway, k.players), rate(p.halfway, p.players), true), 'of people who pressed play'],
      ['Clicked a button', pct(rate(k.clickers, k.visitors)), delta(rate(k.clickers, k.visitors), rate(p.clickers, p.visitors), true), fmt(k.clickers) + ' people'],
      ['Time on page', k.avg_engaged == null ? '—' : dur(k.avg_engaged), delta(k.avg_engaged, p.avg_engaged), 'actively looking, per page']
    ];
    $('tiles').innerHTML = tiles.map(function (t) {
      return '<div class="card tile"><div class="label">' + t[0] + '</div><div class="v">' + t[1] + '</div>' + t[2] + '<div class="hint">' + t[3] + '</div></div>';
    }).join('');
  }

  function renderClients(d) {
    var show = !state.client;
    $('clientsrow').hidden = !show; $('clientsgap').hidden = !show;
    if (!show) return;
    var rows = d.clients;
    if (!rows.length) { $('clients').innerHTML = '<tr><td class="empty">No live traffic yet in this period.</td></tr>'; return; }
    $('clients').innerHTML = '<thead><tr><th>Client</th><th class="r">Visitors</th><th class="r">Leads</th><th class="r">Lead rate</th><th class="r">Booked</th><th class="r">VSL watched</th><th class="r">Last visit</th></tr></thead><tbody>' +
      rows.map(function (r) {
        var c = CLIENTS[r.client];
        return '<tr class="click" data-client="' + esc(r.client) + '"><td><div class="cname">' + esc(cname(r.client)) + '<small>' + esc(c ? c.sub : r.client) + '</small></div></td>' +
          '<td class="r">' + fmt(r.visitors) + '</td><td class="r">' + fmt(r.leads) + '</td>' +
          '<td class="r"><div class="inbar"><span>' + pct(rate(r.leads, r.visitors), 1) + '</span><div class="mtrack"><div class="mfill" style="width:' + Math.min(100, rate(r.leads, r.visitors)) + '%;background:var(--s2)"></div></div></div></td>' +
          '<td class="r">' + fmt(r.booked) + '</td><td class="r">' + (r.avg_watched == null ? '—' : pct(n(r.avg_watched))) + '</td><td class="r">' + ago(r.last_seen) + '</td></tr>';
      }).join('') + '</tbody>';
    Array.prototype.forEach.call($('clients').querySelectorAll('tr.click'), function (tr) {
      tr.addEventListener('click', function () { setClient(tr.getAttribute('data-client')); });
    });
  }

  function renderFunnel(d) {
    var k = d.kpis[0] || {};
    var st = [['Landed', 'on a funnel page', k.visitors]];
    if (n(k.players)) { st.push(['Pressed play', 'on the VSL', k.players]); st.push(['Watched half', 'of the VSL', k.halfway]); }
    st.push(['Clicked a button', 'any CTA', k.clickers], ['Became a lead', 'opted in', k.leads], ['Booked a call', 'on the calendar', k.booked]);
    var top = Math.max(1, n(st[0][2]));
    // The biggest leak = the step that loses the largest share of the people who reached the step before it.
    var worst = -1, worstLoss = 0;
    for (var i = 1; i < st.length; i++) {
      var loss = n(st[i - 1][2]) ? 1 - n(st[i][2]) / n(st[i - 1][2]) : 0;
      if (loss > worstLoss) { worstLoss = loss; worst = i; }
    }
    var ramp = ['--r1', '--r2', '--r3', '--r4', '--r5', '--r6'];
    $('funnel').innerHTML = st.map(function (s, i) {
      var html = '';
      if (i > 0) {
        var prev = n(st[i - 1][2]), lost = prev ? (1 - n(s[2]) / prev) * 100 : 0;
        html += '<div class="stage" style="min-height:0"><div></div><div class="drop' + (i === worst && worstLoss > 0 ? ' worst' : '') + '">' +
          (prev && lost > 0 ? '↓ ' + pct(lost) + ' dropped here' : '') + (i === worst && worstLoss > 0 ? ' · biggest leak' : '') + '</div><div></div></div>';
      }
      var w = Math.max(0.6, n(s[2]) / top * 100);
      html += '<div class="stage"><div class="name">' + s[0] + '<small>' + s[1] + '</small></div>' +
        '<div class="track"><div class="bar" style="width:' + w + '%;background:var(' + ramp[Math.min(i, ramp.length - 1)] + ')"></div></div>' +
        '<div class="val num">' + fmt(s[2]) + '<small>' + (i ? pct(rate(s[2], top)) + ' of visitors' : '100%') + '</small></div></div>';
      return html;
    }).join('');
  }

  function renderDaily(d) {
    var rows = fillDays(d.daily);
    var hourly = state.days <= 1;
    var xl = function (r) {
      var t = new Date(r.day + (hourly ? '' : 'T12:00:00'));
      return hourly ? t.toLocaleTimeString('en-US', { hour: 'numeric' }) : t.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };
    var tl = function (r) {
      var t = new Date(r.day + (hourly ? '' : 'T12:00:00'));
      return hourly ? t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : t.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    };
    lineChart($('ch-visitors'), rows, [{ key: 'visitors', label: 'Visitors', color: '--s1' }], { area: true, xlabel: xl, tiplabel: tl, label: 'Visitors per day', height: 130 });
    lineChart($('ch-leads'), rows, [{ key: 'leads', label: 'Leads', color: '--s2' }, { key: 'booked', label: 'Booked', color: '--s3' }], { xlabel: xl, tiplabel: tl, label: 'Leads and bookings per day', height: 120 });
  }
  // Fill gaps so a quiet day shows as zero instead of disappearing.
  function fillDays(rows) {
    var by = {}; rows.forEach(function (r) { by[String(r.day).slice(0, state.days <= 1 ? 13 : 10)] = r; });
    var out = [], now = new Date();
    if (state.days <= 1) {
      var start = new Date(now.getTime() - 23 * 3600e3);
      for (var h = 0; h < 24; h++) {
        var t = new Date(start.getTime() + h * 3600e3);
        var key = centralHourKey(t);
        out.push(Object.assign({ day: key + ':00:00', visitors: 0, leads: 0, booked: 0 }, by[key] ? { visitors: by[key].visitors, leads: by[key].leads, booked: by[key].booked } : {}));
      }
      return out;
    }
    for (var i = state.days - 1; i >= 0; i--) {
      var dd = new Date(now.getTime() - i * 86400e3);
      var k = dd.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
      out.push(Object.assign({ day: k, visitors: 0, leads: 0, booked: 0 }, by[k] || {}));
    }
    return out;
  }
  function centralHourKey(t) {
    var p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(t);
    var g = function (ty) { return (p.find(function (x) { return x.type === ty; }) || {}).value; };
    return g('year') + '-' + g('month') + '-' + g('day') + 'T' + g('hour');
  }

  function videoName(v) {
    var s = String(v.src || '');
    var file = s.split('?')[0].split('/').filter(Boolean).pop() || 'Video';
    return cname(v.client) + ' · ' + (v.step || '') + (/^media$|^[0-9a-f-]{20,}$/i.test(file) ? '' : ' · ' + file);
  }
  function renderVsl(d) {
    var vids = d.vsl.filter(function (v) { return n(v.plays) > 0; });
    if (!vids.length) {
      $('vsltabs').innerHTML = ''; $('vslstats').innerHTML = ''; $('vslinsight').innerHTML = '';
      $('ch-vsl').innerHTML = '<div class="empty">No VSL plays yet in this period. Watch-through shows up here as soon as someone presses play.</div>';
      return;
    }
    if (state.vsl >= vids.length) state.vsl = 0;
    $('vsltabs').innerHTML = vids.length > 1 ? vids.map(function (v, i) {
      return '<button aria-pressed="' + (i === state.vsl) + '" data-i="' + i + '" title="' + esc(v.src) + '">' + esc(videoName(v)) + '</button>';
    }).join('') : '';
    Array.prototype.forEach.call($('vsltabs').querySelectorAll('button'), function (b) {
      b.addEventListener('click', function () { state.vsl = +b.getAttribute('data-i'); renderVsl(state.data); });
    });
    var v = vids[state.vsl], plays = n(v.plays), D = n(v.duration);
    var pts = [[0, 100], [10, rate(v.m10, plays)], [25, rate(v.m25, plays)], [50, rate(v.m50, plays)], [75, rate(v.m75, plays)], [90, rate(v.m90, plays)], [100, rate(v.done, plays)]];
    // Milestones are cumulative: never let a later point sit above an earlier one.
    for (var i = 1; i < pts.length; i++) pts[i][1] = Math.min(pts[i][1], pts[i - 1][1]);
    var el = $('ch-vsl'), W = Math.max(280, el.clientWidth), H = 220, L = 40, R = 16, T = 14, B = 28, iw = W - L - R, ih = H - T - B;
    var x = function (p) { return L + p / 100 * iw; }, y = function (p) { return T + ih - p / 100 * ih; };
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="VSL watch-through">';
    [0, 25, 50, 75, 100].forEach(function (g) {
      svg += '<line class="' + (g ? 'gridline' : 'baseline') + '" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(g) + '" y2="' + y(g) + '"/>';
      svg += '<text class="tick" x="' + (L - 8) + '" y="' + (y(g) + 4) + '" text-anchor="end">' + g + '%</text>';
    });
    [0, 25, 50, 75, 100].forEach(function (g, k) {
      svg += '<text class="tick" x="' + x(g) + '" y="' + (H - 8) + '" text-anchor="' + (k === 0 ? 'start' : k === 4 ? 'end' : 'middle') + '">' + (D ? clock(D * g / 100) : g + '%') + '</text>';
    });
    var line = pts.map(function (p) { return x(p[0]) + ',' + y(p[1]); });
    svg += '<path d="M' + x(0) + ',' + y(0) + 'L' + line.join('L') + 'L' + x(100) + ',' + y(0) + 'Z" fill="var(--s1)" opacity="0.1"/>';
    svg += '<polyline class="line" stroke="var(--s1)" points="' + line.join(' ') + '"/>';
    pts.forEach(function (p, i) {
      svg += '<circle class="vp" data-i="' + i + '" cx="' + x(p[0]) + '" cy="' + y(p[1]) + '" r="4.5" fill="var(--s1)" stroke="var(--card)" stroke-width="2"/>';
      svg += '<circle class="vh" data-i="' + i + '" cx="' + x(p[0]) + '" cy="' + y(p[1]) + '" r="14" fill="transparent" tabindex="0"/>';
    });
    var last = pts[pts.length - 1];
    svg += '<text class="tick" x="' + (x(100) - 8) + '" y="' + (y(last[1]) - 10) + '" text-anchor="end" style="fill:var(--ink);font-weight:600">' + pct(last[1]) + ' finished</text>';
    svg += '</svg>';
    el.innerHTML = svg;
    Array.prototype.forEach.call(el.querySelectorAll('.vh'), function (c) {
      var on = function (e) {
        var p = pts[+c.getAttribute('data-i')], r = c.getBoundingClientRect();
        showTip('<div class="t">' + (p[0] === 0 ? 'Start' : p[0] === 100 ? 'End' : p[0] + '% in') + (D ? ' · ' + clock(D * p[0] / 100) : '') + '</div>' +
          tipRow('var(--s1)', 'Still watching', pct(p[1])) + tipRow('var(--s1)', 'People', fmt(Math.round(p[1] / 100 * plays))), e.clientX || r.left, e.clientY || r.top);
      };
      c.addEventListener('pointerenter', on); c.addEventListener('focus', on);
      c.addEventListener('pointerleave', hideTip); c.addEventListener('blur', hideTip);
    });
    $('vslstats').innerHTML = [
      [fmt(plays), 'pressed play'],
      [v.avg_watched == null ? '—' : pct(n(v.avg_watched)), 'avg. watched'],
      [v.avg_seconds == null ? '—' : dur(v.avg_seconds), 'avg. time watched'],
      [pct(rate(v.done, plays)), 'finished it'],
      [pct(rate(v.unmuted, plays)), 'turned sound on']
    ].map(function (s) { return '<div><b>' + s[0] + '</b><span>' + s[1] + '</span></div>'; }).join('');
    var worst = 0, wi = 1;
    for (var j = 1; j < pts.length; j++) { var drop = pts[j - 1][1] - pts[j][1]; if (drop > worst) { worst = drop; wi = j; } }
    var from = pts[wi - 1][0], to = pts[wi][0];
    $('vslinsight').innerHTML = worst > 0 ? '<div class="insight"><svg viewBox="0 0 24 24"><path d="M12 3v12M12 19v.5"/></svg><div>The biggest drop is between <b>' +
      (D ? clock(D * from / 100) + ' and ' + clock(D * to / 100) : from + '% and ' + to + '%') + '</b> of the video: <b>' + pct(worst) +
      ' of viewers</b> leave there. Watch a few recordings around that moment, or tighten that part of the script.</div></div>' : '';
  }

  function renderSteps(d) {
    var rows = d.steps;
    if (!rows.length) { $('steps').innerHTML = '<tr><td class="empty">No page views yet in this period.</td></tr>'; return; }
    if (!state.step || !rows.some(function (r) { return r.step === state.step; })) state.step = rows[0].step;
    $('steps').innerHTML = '<thead><tr><th>Page</th><th class="r">Visitors</th><th class="r">Played VSL</th><th class="r">Clicked a button</th><th class="r">Scrolled</th><th class="r">Time on page</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr class="click' + (r.step === state.step ? ' sel' : '') + '" data-step="' + esc(r.step) + '"><td><div class="cname">' + esc(r.step) + '<small>' + esc(r.path || '') + '</small></div></td>' +
          '<td class="r">' + fmt(r.visitors) + '</td><td class="r">' + (n(r.players) ? pct(rate(r.players, r.visitors)) : '—') + '</td>' +
          '<td class="r">' + pct(rate(r.clickers, r.visitors)) + '</td><td class="r">' + (r.avg_scroll == null ? '—' : pct(n(r.avg_scroll))) + '</td>' +
          '<td class="r">' + (r.avg_engaged == null ? '—' : dur(r.avg_engaged)) + '</td></tr>';
      }).join('') + '</tbody>';
    Array.prototype.forEach.call($('steps').querySelectorAll('tr.click'), function (tr) {
      tr.addEventListener('click', function () { state.step = tr.getAttribute('data-step'); renderSteps(state.data); loadPage(); });
    });
  }

  function renderSections(p) {
    $('maptitle').textContent = state.step ? 'What people see on “' + state.step + '”' : 'What people actually see';
    if (!p || !p.sections.length) { $('sectionmap').innerHTML = '<div class="empty">No section data for this page yet.</div>'; return; }
    var dwell = {}; p.dwell.forEach(function (r) { dwell[r.section] = n(r.avg_seconds); });
    var base = Math.max(n(p.visitors), Math.max.apply(null, p.sections.map(function (s) { return n(s.viewers); })), 1);
    $('sectionmap').innerHTML = '<div class="srow shead"><span class="i">#</span><span>Section</span><span class="tcol"></span><span class="p" style="font-weight:500">Reached</span><span class="s">Avg. time</span></div><div class="smap">' +
      p.sections.map(function (s) {
        var r = rate(s.viewers, base);
        return '<div class="srow" title="' + esc(s.section) + '"><span class="i">' + esc(s.idx) + '</span><span class="n">' + esc(s.section) + '</span>' +
          '<span class="t"><span class="b" style="width:' + Math.max(1, r) + '%"></span></span><span class="p">' + pct(r) + '</span>' +
          '<span class="s">' + (dwell[s.section] != null ? dur(dwell[s.section]) : '—') + '</span></div>';
      }).join('') + '</div>';
  }

  function renderCtas(d) {
    var rows = d.ctas;
    if (!rows.length) { $('ctas').innerHTML = '<tr><td class="empty">No button clicks yet.</td></tr>'; return; }
    $('ctas').innerHTML = '<thead><tr><th>Button</th><th>Where</th><th class="r">Clicks</th><th class="r">People</th></tr></thead><tbody>' +
      rows.map(function (r) {
        var where = r.above_fold === true || r.above_fold === 'true' ? '<span class="pill">First screen</span>' : (r.page_pos == null ? '—' : '<span class="pill">' + pct(n(r.page_pos)) + ' down</span>');
        return '<tr><td><div class="cname" style="max-width:220px;overflow:hidden;text-overflow:ellipsis">' + esc(r.label) + '<small>' + esc((r.step || '') + (r.section ? ' · ' + r.section : '')) + '</small></div></td>' +
          '<td>' + where + '</td><td class="r">' + fmt(r.clicks) + '</td><td class="r">' + fmt(r.people) + '</td></tr>';
      }).join('') + '</tbody>';
  }

  function renderSources(d) {
    var rows = d.sources;
    if (!rows.length) { $('sources').innerHTML = '<tr><td class="empty">No visitors yet.</td></tr>'; return; }
    var max = Math.max.apply(null, rows.map(function (r) { return n(r.visitors); }));
    $('sources').innerHTML = '<thead><tr><th>Source</th><th class="r">Visitors</th><th class="r">Leads</th><th class="r">Lead rate</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr><td><span class="cname">' + esc(r.source) + '</span></td>' +
          '<td class="r"><div class="inbar"><span>' + fmt(r.visitors) + '</span><div class="mtrack"><div class="mfill" style="width:' + rate(r.visitors, max) + '%"></div></div></div></td>' +
          '<td class="r">' + fmt(r.leads) + '</td><td class="r">' + pct(rate(r.leads, r.visitors), 1) + '</td></tr>';
      }).join('') + '</tbody>';
  }

  // Device colors follow the device, not its rank.
  var DEVICE_COLOR = { Mobile: '--s1', Desktop: '--s2', Tablet: '--s3' };
  function renderDevices(d) {
    var rows = d.devices, total = rows.reduce(function (a, r) { return a + n(r.visitors); }, 0);
    if (!total) { $('devices').innerHTML = '<div class="empty">No visitors yet.</div>'; return; }
    var order = ['Mobile', 'Desktop', 'Tablet'];
    rows = rows.slice().sort(function (a, b) {
      var ia = order.indexOf(a.device), ib = order.indexOf(b.device); return (ia < 0 ? 9 : ia) - (ib < 0 ? 9 : ib);
    });
    var col = function (r) { return DEVICE_COLOR[r.device] ? 'var(' + DEVICE_COLOR[r.device] + ')' : 'var(--muted)'; };
    var top = rows.slice().sort(function (a, b) { return n(b.visitors) - n(a.visitors); })[0];
    $('devices').innerHTML = '<div class="herofig" style="font-size:44px;margin:4px 0 6px">' + pct(rate(top.visitors, total)) + '</div>' +
      '<div class="label" style="margin-bottom:16px">of visitors are on ' + esc(String(top.device).toLowerCase()) + '</div>' +
      '<div class="split">' + rows.map(function (r) {
        return '<div style="flex:' + n(r.visitors) + ';background:' + col(r) + '" title="' + esc(r.device) + ': ' + fmt(r.visitors) + '"></div>';
      }).join('') + '</div><div class="legend">' + rows.map(function (r) {
        return '<span><i class="box" style="background:' + col(r) + '"></i>' + esc(r.device) + ' · ' + pct(rate(r.visitors, total)) + ' (' + fmt(r.visitors) + ')</span>';
      }).join('') + '</div>';
  }

  function deviceIcon(dv) { return dv === 'Mobile' ? 'Phone' : dv || 'Unknown device'; }
  function renderFeed(d) {
    var rows = d.feed;
    if (!rows.length) { $('feed').innerHTML = '<div class="empty">No visits yet in this period.</div>'; return; }
    $('feed').innerHTML = rows.map(function (r) {
      var place = r.city ? r.city + (r.region ? ', ' + r.region : '') : 'Unknown location';
      var who = r.email ? r.email : 'Visitor from ' + place;
      var steps = String(r.steps || '').split(' → ').filter(Boolean);
      var vp = n(r.vsl_pct);
      var flags = (r.booked == 1 || r.booked === true ? '<span class="pill booked"><i style="background:var(--s3)"></i>Booked</span>' : '') +
        (r.lead == 1 || r.lead === true ? '<span class="pill lead"><i style="background:var(--s2)"></i>Lead</span>' : '') +
        (n(r.clicks) ? '<span class="pill">' + n(r.clicks) + ' click' + (n(r.clicks) > 1 ? 's' : '') + '</span>' : '');
      var watch = state.sample ? '<span class="watch" style="opacity:.5">Sample</span>' :
        '<a class="watch" target="_blank" rel="noopener" href="' + API + '/project/' + PROJECT + '/replay/' + encodeURIComponent(r.session_id) + '"><svg viewBox="0 0 10 10"><path d="M2 1l7 4-7 4z"/></svg>Watch</a>';
      return '<div class="frow"><div class="when">' + ago(r.started) + '<br>' + new Date(r.started).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) + '</div>' +
        '<div class="who"><b>' + esc(who) + '</b><span>' + esc(cname(r.client)) + ' · ' + esc(deviceIcon(r.device)) + ' · ' + esc(r.source || 'Direct') + ' · ' + dur(r.duration) + '</span></div>' +
        '<div class="path">' + steps.map(function (s) { return '<span>' + esc(s) + '</span>'; }).join('') + '</div>' +
        '<div class="vslm inbar" style="justify-content:flex-start">' + (vp ? '<div class="mtrack"><div class="mfill" style="width:' + Math.min(100, vp) + '%"></div></div><span style="font-size:12.5px;color:var(--ink-2)">' + pct(vp) + ' of VSL</span>' : '<span style="font-size:12.5px;color:var(--muted)">No VSL play</span>') + '</div>' +
        '<div class="flags">' + flags + watch + '</div></div>';
    }).join('');
  }

  function renderClientSelect(d) {
    var sel = $('client'), cur = state.client;
    var slugs = {}; Object.keys(CLIENTS).forEach(function (k) { slugs[k] = 1; });
    (d.clients || []).forEach(function (r) { if (r.client) slugs[r.client] = 1; });
    if (state.sample) { slugs = {}; (d.clients || []).forEach(function (r) { slugs[r.client] = 1; }); }
    sel.innerHTML = '<option value="">All clients</option>' + Object.keys(slugs).sort(function (a, b) { return cname(a).localeCompare(cname(b)); }).map(function (s) {
      return '<option value="' + esc(s) + '"' + (s === cur ? ' selected' : '') + '>' + esc(cname(s)) + '</option>';
    }).join('');
  }

  function renderTitle() {
    var c = CLIENTS[state.client];
    $('pagetitle').textContent = state.client ? cname(state.client) : 'All funnels';
    $('pagesub').textContent = state.client ? (c ? c.sub : state.client) + ' · live traffic only' : 'Every client, live traffic only.';
  }

  function render() {
    var d = state.data; if (!d) return;
    renderTitle(); renderHero(d); renderClients(d); renderFunnel(d); renderDaily(d); renderVsl(d);
    renderSteps(d); renderCtas(d); renderSources(d); renderDevices(d); renderFeed(d);
    if (!state.client) renderClientSelect(d);
    $('banner').innerHTML = state.sample ? '<div class="banner"><span><b>Sample data.</b> These numbers are made up so you can see the layout. Connect PostHog to see your real funnels.</span><button type="button" id="goconnect">Connect PostHog</button></div>' : '';
    if (state.sample) $('goconnect').addEventListener('click', function () { state.sample = false; showSetup(); });
  }

  // ---------- loading ----------
  function load() {
    if (state.busy) return;
    state.busy = true;
    $('content').classList.add('loading'); $('refresh').classList.add('spin');
    var f = filters();
    source().load(f).then(function (d) {
      state.data = d; state.updated = Date.now(); render(); tickUpdated();
      $('livedot').classList.toggle('off', state.sample);
      return loadPage();
    }).catch(function (e) {
      if (e.auth) { store.del(KEY_STORE); showSetup('That key was rejected by PostHog. Paste a new one.'); return; }
      $('banner').innerHTML = '<div class="err">Couldn’t load from PostHog: ' + esc(e.message) + '. Retrying in a minute.</div>';
    }).then(function () {
      state.busy = false; $('content').classList.remove('loading'); $('refresh').classList.remove('spin');
    });
  }
  function loadPage() {
    if (!state.step) { renderSections(null); return Promise.resolve(); }
    var step = state.step;
    return source().loadPage(filters(), step).then(function (p) { if (step === state.step) { state.page = p; renderSections(p); } });
  }
  function tickUpdated() {
    $('updated').textContent = state.sample ? 'Sample data' : state.updated ? 'Live · updated ' + ago(state.updated) : 'Loading…';
  }

  function setClient(slug) {
    state.client = slug || ''; state.step = null; state.vsl = 0;
    $('client').value = state.client;
    load();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------- setup ----------
  function showSetup(msg) {
    $('app').hidden = true; $('setup').hidden = false;
    $('keymsg').textContent = msg || '';
    setTimeout(function () { $('keyinput').focus(); }, 50);
  }
  function showApp() { $('setup').hidden = true; $('app').hidden = false; load(); }

  $('keyform').addEventListener('submit', function (e) {
    e.preventDefault();
    var k = $('keyinput').value.trim();
    if (!/^phx_/.test(k)) { $('keymsg').textContent = 'That doesn’t look like a personal API key. It starts with phx_.'; return; }
    store.set(KEY_STORE, k);
    $('keymsg').textContent = 'Checking…';
    run('select 1', {}).then(function () { $('keyinput').value = ''; state.sample = false; showApp(); })
      .catch(function (err) { store.del(KEY_STORE); $('keymsg').textContent = err.auth ? 'PostHog rejected that key. Check it has Query → Read on Brandridge Funnels.' : 'Couldn’t reach PostHog: ' + err.message; });
  });
  $('trysample').addEventListener('click', function () { state.sample = true; showApp(); });
  $('settings').addEventListener('click', function () {
    if (state.sample || confirm('Disconnect this browser from PostHog? You’ll need to paste the key again.')) { store.del(KEY_STORE); state.sample = false; state.data = null; showSetup(); }
  });
  $('refresh').addEventListener('click', load);
  $('client').addEventListener('change', function () { setClient($('client').value); });
  Array.prototype.forEach.call($('range').querySelectorAll('button'), function (b) {
    b.addEventListener('click', function () {
      Array.prototype.forEach.call($('range').querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', x === b); });
      state.days = +b.getAttribute('data-days'); load();
    });
  });
  var rz; window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { if (state.data) { renderDaily(state.data); renderVsl(state.data); } }, 150); });
  setInterval(function () { tickUpdated(); }, 15000);
  setInterval(function () { if (!document.hidden && !state.sample && store.get(KEY_STORE) && !$('app').hidden) load(); }, 60000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden && state.updated && Date.now() - state.updated > 60000 && !state.sample && !$('app').hidden) load(); });

  if (/[?&]sample=1/.test(location.search)) { state.sample = true; showApp(); }
  else if (store.get(KEY_STORE)) showApp();
  else showSetup();
})();
