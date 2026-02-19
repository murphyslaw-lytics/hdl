import { NextResponse } from "next/server";

export async function GET() {
  const js = `
(function () {
  function getOrCreateAnonId(siteId) {
    try {
      var key = "dl_anon_" + siteId;
      var existing = localStorage.getItem(key);
      if (existing) return existing;
      var fresh = "anon_" + Math.random().toString(16).slice(2) + "_" + Date.now();
      localStorage.setItem(key, fresh);
      return fresh;
    } catch (e) {
      return undefined;
    }
  }

  function getUtm() {
    try { return Object.fromEntries(new URLSearchParams(window.location.search)); }
    catch (e) { return {}; }
  }

  // ✅ add hdlEndpoint + hdl
  var state = { endpoint: null, siteId: null, key: null, base: {}, hdlEndpoint: null, hdl: null };

  function init(cfg) {
    state.endpoint = cfg.endpoint;
    state.siteId = cfg.siteId;
    state.key = cfg.writeKey;
    state.base = cfg.base || {};
    state.hdlEndpoint = cfg.hdlEndpoint || "/api/hdl"; // ✅
  }

  function track(event, props, extra) {
    if (!state.endpoint || !state.siteId || !state.key) return;

    var payload = {
      event: event,
      ts: Date.now(),
      props: props || {},
      consent: (extra && extra.consent) || state.base.consent,
      user_id: (extra && extra.user_id) || state.base.user_id,
      anonymous_id: getOrCreateAnonId(state.siteId),
      page: {
        url: window.location.href,
        path: window.location.pathname,
        referrer: document.referrer || undefined,
        title: document.title || undefined,
        utm: getUtm(),
      },
      content: (extra && extra.content) || state.base.content,

      // ✅ attach latest decision output (optional)
      hdl: (extra && extra.hdl) || state.hdl || undefined
    };

    fetch(state.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-dl-site": state.siteId,
        "x-dl-key": state.key
      },
      body: JSON.stringify(payload),
      keepalive: true,
      mode: "cors"
    }).catch(function(){});
  }

  // NEW
  function enrich(extra) {
    if (!state.hdlEndpoint || !state.siteId || !state.key) return Promise.resolve(null);

    var body = {
      path: (extra && extra.path) || window.location.pathname,
      url: window.location.href,
      referrer: document.referrer || undefined,
      title: document.title || undefined,
      utm: getUtm(),
      lang: (navigator.language || undefined)
    };

    return fetch(state.hdlEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-dl-site": state.siteId,
        "x-dl-key": state.key
      },
      body: JSON.stringify(body),
      mode: "cors",
      keepalive: true
    })
      .then(function(r){ return r.json(); })
      .then(function(res){
        state.hdl = res && res.ok ? res : null;
        return state.hdl;
      })
      .catch(function(){ return null; });
  }

  // ✅ optional helper: enrich then track a page_view
  function auto() {
    return enrich().then(function(hdl){
      track("page_view", {}, { hdl: hdl });
      return hdl;
    });
  }

  // ✅ export enrich (+ auto if you want)
  window.dl = { init: init, track: track, enrich: enrich, auto: auto };
})();
`;

  return new NextResponse(js, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=60",
    },
  });
}
