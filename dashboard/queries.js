// HogQL queries behind the dashboard. Each returns plain row objects.
// `run(sql, values)` is injected so the same code runs with an API key (dashboard) or a session (testing).
(function (root) {
  var LEAD = "(event = 'form_submit' or (event = '$pageview' and match(coalesce(properties.$pathname, ''), {leadPath})))";
  var BOOKED = "(event = 'calendar_booked' or (event = '$pageview' and match(coalesce(properties.$pathname, ''), {bookedPath})))";
  var SRC = "multiIf(notEmpty(coalesce(properties.utm_source, '')), properties.utm_source, " +
            "coalesce(properties.$referring_domain, '$direct') = '$direct', 'Direct', properties.$referring_domain)";

  // Shared filter: date window, live traffic only, our own check visits removed, optional client.
  function where(f, shift) {
    var w = "timestamp >= now() - interval " + (f.days * (shift ? 2 : 1)) + " day" +
      (shift ? " and timestamp < now() - interval " + f.days + " day" : "") +
      " and properties.client != 'tracker-test'" +
      " and not match(coalesce(properties.$current_url, ''), 'tracker-check|bt_debug')";
    if (!f.includePreview) w += " and properties.env = 'live'";
    if (f.client) w += " and properties.client = {client}";
    return w;
  }
  function vals(f) {
    return { client: f.client || '', leadPath: f.leadPath, bookedPath: f.bookedPath, step: f.step || '' };
  }
  function rows(res) {
    var cols = res.columns || [];
    return (res.results || []).map(function (r) {
      var o = {}; cols.forEach(function (c, i) { o[c] = r[i]; }); return o;
    });
  }

  var Q = {
    kpis: function (f, shift) {
      return "select uniqIf(person_id, event = '$pageview') as visitors, " +
        "uniqIf(person_id, event = 'vsl_play') as players, " +
        "uniqIf(person_id, event = 'vsl_progress' and properties.milestone = 50) as halfway, " +
        "uniqIf(person_id, " + LEAD + ") as leads, " +
        "uniqIf(person_id, " + BOOKED + ") as booked, " +
        "uniqIf(person_id, event = 'cta_click') as clickers, " +
        "round(avgIf(toFloat(properties.watched_percent), event = 'vsl_summary'), 1) as avg_watched, " +
        "round(avgIf(toFloat(properties.engaged_seconds), event = 'page_summary'), 1) as avg_engaged, " +
        "count(distinct $session_id) as sessions " +
        "from events where " + where(f, shift);
    },
    daily: function (f) {
      // Today = hourly buckets, otherwise daily (Central time, where the clients are).
      var bucket = f.days <= 1 ? "toStartOfHour(toTimeZone(timestamp, 'America/Chicago'))" : "toDate(toTimeZone(timestamp, 'America/Chicago'))";
      return "select " + bucket + " as day, " +
        "uniqIf(person_id, event = '$pageview') as visitors, uniqIf(person_id, " + LEAD + ") as leads, " +
        "uniqIf(person_id, " + BOOKED + ") as booked " +
        "from events where " + where(f) + " group by day order by day";
    },
    clients: function (f) {
      var g = { days: f.days, includePreview: f.includePreview };
      return "select properties.client as client, uniqIf(person_id, event = '$pageview') as visitors, " +
        "uniqIf(person_id, " + LEAD + ") as leads, uniqIf(person_id, " + BOOKED + ") as booked, " +
        "uniqIf(person_id, event = 'vsl_play') as players, " +
        "round(avgIf(toFloat(properties.watched_percent), event = 'vsl_summary'), 1) as avg_watched, " +
        "max(timestamp) as last_seen " +
        "from events where " + where(g) + " and notEmpty(coalesce(properties.client, '')) " +
        "group by client order by visitors desc limit 30";
    },
    steps: function (f) {
      return "select properties.funnel_step as step, any(properties.$pathname) as path, " +
        "uniqIf(person_id, event = '$pageview') as visitors, " +
        "round(avgIf(toFloat(properties.engaged_seconds), event = 'page_summary'), 1) as avg_engaged, " +
        "round(avgIf(toFloat(properties.max_scroll_percent), event = 'page_summary'), 0) as avg_scroll, " +
        "uniqIf(person_id, event = 'cta_click') as clickers, " +
        "uniqIf(person_id, event = 'vsl_play') as players " +
        "from events where " + where(f) + " and notEmpty(coalesce(properties.funnel_step, '')) " +
        "group by step having visitors > 0 order by visitors desc limit 12";
    },
    vsl: function (f) {
      return "select properties.video_src as src, any(properties.funnel_step) as step, any(properties.client) as client, " +
        "max(toFloat(properties.video_duration)) as duration, " +
        "uniqIf(person_id, event = 'vsl_play') as plays, " +
        "uniqIf(person_id, event = 'vsl_progress' and properties.milestone = 10) as m10, " +
        "uniqIf(person_id, event = 'vsl_progress' and properties.milestone = 25) as m25, " +
        "uniqIf(person_id, event = 'vsl_progress' and properties.milestone = 50) as m50, " +
        "uniqIf(person_id, event = 'vsl_progress' and properties.milestone = 75) as m75, " +
        "uniqIf(person_id, event = 'vsl_progress' and properties.milestone = 90) as m90, " +
        "uniqIf(person_id, event = 'vsl_complete') as done, " +
        "uniqIf(person_id, event = 'vsl_unmute') as unmuted, " +
        "round(avgIf(toFloat(properties.watched_percent), event = 'vsl_summary'), 1) as avg_watched, " +
        "round(avgIf(toFloat(properties.seconds_watched), event = 'vsl_summary'), 0) as avg_seconds " +
        "from events where " + where(f) + " and event like 'vsl_%' and notEmpty(coalesce(properties.video_src, '')) " +
        "group by src order by plays desc limit 6";
    },
    sections: function (f) {
      return "select properties.section as section, min(toInt(properties.section_index)) as idx, uniq(person_id) as viewers " +
        "from events where " + where(f) + " and event = 'section_view' and properties.funnel_step = {step} " +
        "group by section order by idx limit 20";
    },
    dwell: function (f) {
      return "select kv.1 as section, round(avg(kv.2), 1) as avg_seconds from (" +
        "select arrayJoin(JSONExtractKeysAndValues(toString(properties.section_seconds), 'Float64')) as kv " +
        "from events where " + where(f) + " and event = 'page_summary' and properties.funnel_step = {step}) " +
        "group by section";
    },
    stepVisitors: function (f) {
      return "select uniq(person_id) as visitors from events where " + where(f) +
        " and event = '$pageview' and properties.funnel_step = {step}";
    },
    ctas: function (f) {
      return "select properties.cta_label as label, any(properties.section) as section, any(properties.funnel_step) as step, " +
        "count() as clicks, uniq(person_id) as people, round(avg(toFloat(properties.page_percent)), 0) as page_pos, " +
        "max(properties.above_fold) as above_fold " +
        "from events where " + where(f) + " and event = 'cta_click' and notEmpty(coalesce(properties.cta_label, '')) " +
        "group by label order by clicks desc limit 10";
    },
    sources: function (f) {
      return "select src as source, count() as visitors, countIf(person_id in (select person_id from events where " +
        where(f) + " and " + LEAD + ")) as leads from (select person_id, argMin(" + SRC + ", timestamp) as src " +
        "from events where " + where(f) + " and event = '$pageview' group by person_id) group by source order by visitors desc limit 8";
    },
    devices: function (f) {
      return "select coalesce(properties.$device_type, 'Unknown') as device, uniq(person_id) as visitors " +
        "from events where " + where(f) + " and event = '$pageview' group by device order by visitors desc";
    },
    feed: function (f) {
      return "select $session_id as session_id, min(timestamp) as started, " +
        "dateDiff('second', min(timestamp), max(timestamp)) as duration, " +
        "any(properties.client) as client, any(properties.$device_type) as device, any(properties.$browser) as browser, " +
        "any(properties.$geoip_city_name) as city, any(properties.$geoip_subdivision_1_code) as region, " +
        "argMinIf(" + SRC + ", timestamp, event = '$pageview') as source, " +
        "arrayStringConcat(groupUniqArrayIf(properties.funnel_step, event = '$pageview'), ' → ') as steps, " +
        "max(toFloat(coalesce(properties.watched_percent, 0))) as vsl_pct, " +
        "countIf(event = 'cta_click') as clicks, max(" + LEAD + ") as lead, max(" + BOOKED + ") as booked, " +
        "any(person.properties.email) as email " +
        "from events where " + where(f) + " and notEmpty(coalesce($session_id, '')) " +
        "group by session_id order by started desc limit 40";
    }
  };

  function load(run, f) {
    var v = vals(f);
    var jobs = {
      kpis: run(Q.kpis(f), v), prev: run(Q.kpis(f, true), v), daily: run(Q.daily(f), v),
      clients: run(Q.clients(f), v), steps: run(Q.steps(f), v), vsl: run(Q.vsl(f), v),
      ctas: run(Q.ctas(f), v), sources: run(Q.sources(f), v), devices: run(Q.devices(f), v), feed: run(Q.feed(f), v)
    };
    var keys = Object.keys(jobs);
    return Promise.all(keys.map(function (k) { return jobs[k]; })).then(function (res) {
      var d = {}; keys.forEach(function (k, i) { d[k] = rows(res[i]); }); return d;
    });
  }
  function loadPage(run, f, step) {
    var g = Object.assign({}, f, { step: step }), v = vals(g);
    return Promise.all([run(Q.sections(g), v), run(Q.dwell(g), v), run(Q.stepVisitors(g), v)]).then(function (r) {
      return { sections: rows(r[0]), dwell: rows(r[1]), visitors: (rows(r[2])[0] || {}).visitors || 0 };
    });
  }
  root.FunnelQueries = { Q: Q, load: load, loadPage: loadPage, rows: rows };
})(window);
