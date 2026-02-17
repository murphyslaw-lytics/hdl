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

  var state = { endpoint: null, siteId: null, key: null, base: {} };

  function init(cfg) {
    state.endpoint = cfg.endpoint;
    state.siteId = cfg.siteId;
    state.key = cfg.writeKey;
    state.base = cfg.base || {};
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

  window.dl = { init: init, track: track };
})();
`;

  return new NextResponse(js, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=60",
    },
  });
}
