// Made-up data in the exact shape the live queries return, so the layout can be seen before real traffic exists.
// Only used when the viewer clicks "Preview with sample data"; the page says so in a banner.
(function (root) {
  var seed = 7;
  function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  function between(a, b) { return Math.round(a + rnd() * (b - a)); }

  var CLIENTS = [
    { client: 'sample-client-a', scale: 1, vsl: true, steps: ['registration', 'video', 'book', 'booked'] },
    { client: 'sample-client-b', scale: 0.55, vsl: true, steps: ['optin', 'watch', 'thank-you'] },
    { client: 'sample-client-c', scale: 0.3, vsl: false, steps: ['webinar', 'registered'] }
  ];

  function load(f) {
    seed = 7 + f.days;
    var cs = f.client ? CLIENTS.filter(function (c) { return c.client === f.client; }) : CLIENTS;
    if (!cs.length) cs = [CLIENTS[0]];
    var k = cs.reduce(function (a, c) { return a + c.scale; }, 0);
    var perDay = 38 * k, days = f.days;
    var visitors = Math.round(perDay * Math.max(1, days) * (days <= 1 ? 0.9 : 1));
    var players = Math.round(visitors * 0.58), halfway = Math.round(players * 0.47), clickers = Math.round(visitors * 0.31);
    var leads = Math.round(visitors * 0.192), booked = Math.round(leads * 0.34);
    var kpi = { visitors: visitors, players: players, halfway: halfway, leads: leads, booked: booked, clickers: clickers, avg_watched: 46.3, avg_engaged: 71.4, sessions: Math.round(visitors * 1.3) };
    var prev = { visitors: Math.round(visitors * 0.86), players: Math.round(players * 0.83), halfway: Math.round(halfway * 0.8), leads: Math.round(leads * 0.79), booked: Math.round(booked * 0.9), clickers: Math.round(clickers * 0.9), avg_watched: 41.8, avg_engaged: 66.0, sessions: 0 };

    var daily = [], now = new Date();
    var buckets = days <= 1 ? 24 : days;
    for (var i = buckets - 1; i >= 0; i--) {
      var t = new Date(now.getTime() - i * (days <= 1 ? 3600e3 : 86400e3));
      var base = days <= 1 ? perDay / 24 * (0.4 + Math.sin((t.getHours() - 6) / 24 * Math.PI) * 1.2) : perDay * (0.75 + 0.5 * rnd()) * (t.getDay() === 0 || t.getDay() === 6 ? 0.7 : 1);
      var v = Math.max(0, Math.round(base));
      var key = days <= 1
        ? t.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }) + 'T' + ('0' + new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: '2-digit', hourCycle: 'h23' }).format(t)).slice(-2) + ':00:00'
        : t.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
      daily.push({ day: key, visitors: v, leads: Math.round(v * (0.15 + rnd() * 0.08)), booked: Math.round(v * (0.04 + rnd() * 0.04)) });
    }

    var clients = CLIENTS.map(function (c) {
      var vv = Math.round(perDay / k * c.scale * Math.max(1, days));
      return { client: c.client, visitors: vv, leads: Math.round(vv * (0.14 + c.scale * 0.06)), booked: Math.round(vv * 0.06), players: c.vsl ? Math.round(vv * 0.6) : 0, avg_watched: c.vsl ? 38 + c.scale * 12 : null, last_seen: new Date(now.getTime() - between(2, 400) * 60e3).toISOString() };
    });

    var steps = [];
    cs.forEach(function (c, ci) {
      var vv = Math.round(visitors * c.scale / k);
      c.steps.forEach(function (s, i) {
        var share = [1, 0.42, 0.21, 0.08][i] || 0.05;
        steps.push({ step: s, path: '/' + s, visitors: Math.round(vv * share), avg_engaged: [58, 214, 96, 22][i] || 30, avg_scroll: [64, 48, 71, 90][i] || 60, clickers: Math.round(vv * share * [0.44, 0.38, 0.62, 0.1][i] || 0.1), players: c.vsl && i === 1 ? Math.round(vv * share * 0.92) : (c.vsl && i === 0 && ci === 0 ? Math.round(vv * 0.31) : 0) });
      });
    });
    steps.sort(function (a, b) { return b.visitors - a.visitors; });

    var vsl = cs.filter(function (c) { return c.vsl; }).map(function (c, i) {
      var p = Math.round(players * c.scale / k);
      return { src: 'https://example.com/' + c.client + '/vsl.mp4', step: c.steps[1], client: c.client, duration: [512, 344][i] || 300, plays: p,
        m10: Math.round(p * 0.81), m25: Math.round(p * 0.66), m50: Math.round(p * 0.47), m75: Math.round(p * 0.33), m90: Math.round(p * 0.24), done: Math.round(p * 0.19),
        unmuted: Math.round(p * 0.72), avg_watched: 46.3 - i * 6, avg_seconds: Math.round(([512, 344][i] || 300) * 0.43) };
    });

    var ctas = [
      { label: 'Book My Free Call', section: 'hero', step: 'video', page_pos: 9, above_fold: true },
      { label: 'Watch The Free Training', section: 'hero', step: 'registration', page_pos: 12, above_fold: true },
      { label: 'Get My Plan', section: 'what-the-video-cant-tell-you', step: 'video', page_pos: 64, above_fold: false },
      { label: 'Send Me The Video', section: 'faq', step: 'registration', page_pos: 88, above_fold: false },
      { label: 'Pick A Time', section: 'calendar', step: 'book', page_pos: 31, above_fold: false }
    ].map(function (c, i) { var cl = Math.round(clickers * [0.38, 0.29, 0.14, 0.08, 0.11][i]); return Object.assign(c, { clicks: Math.round(cl * 1.2), people: cl }); });

    var sources = [['facebook', 0.46, 0.21], ['Direct', 0.19, 0.24], ['email', 0.14, 0.33], ['google', 0.11, 0.17], ['youtube.com', 0.06, 0.12], ['instagram', 0.04, 0.09]]
      .map(function (s) { var vv = Math.round(visitors * s[1]); return { source: s[0], visitors: vv, leads: Math.round(vv * s[2]) }; });
    var devices = [{ device: 'Mobile', visitors: Math.round(visitors * 0.71) }, { device: 'Desktop', visitors: Math.round(visitors * 0.25) }, { device: 'Tablet', visitors: Math.round(visitors * 0.04) }];

    var cities = [['Philadelphia', 'PA'], ['Pittsburgh', 'PA'], ['Laredo', 'TX'], ['Allentown', 'PA'], ['Scranton', 'PA'], ['Dallas', 'TX'], ['Erie', 'PA'], ['Portland', 'ME']];
    var feed = [];
    for (var j = 0; j < 14; j++) {
      var c = cs[j % cs.length], depth = between(1, c.steps.length), lead = depth >= 2, bk = depth >= c.steps.length;
      var city = cities[between(0, cities.length - 1)];
      feed.push({ session_id: 'sample-' + j, started: new Date(now.getTime() - (j * 23 + between(1, 15)) * 60e3).toISOString(), duration: between(20, 640),
        client: c.client, device: rnd() < 0.7 ? 'Mobile' : 'Desktop', browser: 'Safari', city: city[0], region: city[1],
        source: sources[between(0, 3)].source, steps: c.steps.slice(0, depth).join(' → '), vsl_pct: c.vsl && depth >= 2 ? between(8, 100) : 0,
        clicks: between(0, 3), lead: lead ? 1 : 0, booked: bk ? 1 : 0, email: lead && rnd() < 0.6 ? ['pat', 'linda', 'ron', 'carol', 'jim', 'donna'][between(0, 5)] + '.sample@example.com' : null });
    }

    return Promise.resolve({ kpis: [kpi], prev: [prev], daily: daily, clients: clients, steps: steps, vsl: vsl, ctas: ctas, sources: sources, devices: devices, feed: feed });
  }

  function loadPage(f, step) {
    var names = ['Hero · headline + VSL', 'The problem', 'Why it happens', 'What the call gets you', 'Testimonials', 'About the advisor', 'FAQ', 'Final call to action', 'Footer'];
    var reach = [100, 82, 64, 51, 39, 31, 22, 17, 12];
    var secs = [38, 14, 19, 22, 11, 8, 13, 6, 2];
    return Promise.resolve({
      visitors: 1000,
      sections: names.map(function (s, i) { return { section: s, idx: i + 1, viewers: reach[i] * 10 }; }),
      dwell: names.map(function (s, i) { return { section: s, avg_seconds: secs[i] }; })
    });
  }

  root.FunnelSample = { load: load, loadPage: loadPage };
})(window);
