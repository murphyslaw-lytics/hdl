import { NextRequest, NextResponse } from "next/server";

const ALLOWED_ORIGINS = new Set<string>([
  "https://30rpr-lego-poc.contentstackapps.com",
  "http://localhost:3000",
]);

const SITE_KEYS: Record<string, string> = {
  contentstack_site_a: "cs-demo-a-123",
  contentstack_site_b: "cs-demo-b-456",
};

type Incoming = {
  hdl?: any;
  event: string;
  ts?: number;
  props?: Record<string, any>;
  page?: {
    url?: string;
    path?: string;
    referrer?: string;
    title?: string;
    utm?: Record<string, string>;
  };
  content?: {
    entry_uid?: string;
    content_type_uid?: string;
    locale?: string;
    tags?: string[];
  };
  anonymous_id?: string;
  user_id?: string;
  consent?: { analytics: boolean; marketing?: boolean };
};

export async function OPTIONS(req: NextRequest) {
  return corsEmpty(req, 204);
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  if (!isAllowedOrigin(origin)) {
    return NextResponse.json(
      { ok: false, error: "Origin not allowed" },
      { status: 403 }
    );
  }

  const siteId = req.headers.get("x-dl-site") || "";
  const siteKey = req.headers.get("x-dl-key") || "";

  if (!siteId || SITE_KEYS[siteId] !== siteKey) {
    return corsJson(req, { ok: false, error: "Unauthorized" }, 401);
  }

  let input: Incoming;
  try {
    input = await req.json();
  } catch {
    return corsJson(req, { ok: false, error: "Invalid JSON" }, 400);
  }

  if (!input?.event) {
    return corsJson(req, { ok: false, error: "Missing event" }, 400);
  }

  // Central consent gate
  if (input?.consent?.analytics === false) {
    return corsJson(req, { ok: true, skipped: "no_consent" }, 200);
  }

  // Enrichments you can do at the collector
  const ua = req.headers.get("user-agent") || undefined;
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    undefined;

  // Canonical event shape your whole org will standardise on
  const enriched: any = {
    event: input.event,
    ts: input.ts || Date.now(),
    site_id: siteId,

    anonymous_id: input.anonymous_id,
    user_id: input.user_id,

    url: input.page?.url,
    path: input.page?.path,
    referrer: input.page?.referrer,
    title: input.page?.title,
    ...flattenUtm(input.page?.utm),

    entry_uid: input.content?.entry_uid,
    content_type_uid: input.content?.content_type_uid,
    locale: input.content?.locale,
    tags: input.content?.tags,

    user_agent: ua,
    ip,

    ...(input.props || {}),
    hdl: input.hdl, // ✅ keep the HDL decision payload
  };

    // For demos, return what you’d send onward if debug=1
  const debug = req.nextUrl.searchParams.get("debug") === "1";

  // ✅ Sheets enrichment (campaign lookup) + diagnostics when debug=1
  try {
    const campaigns = await getCampaignRows();
    const match = findCampaign(campaigns, enriched.utm_campaign);

    if (match) {
      enriched.campaign = {
        utm_campaign: match.utm_campaign,
        country: match.country,
        experience: match.experience,
        priority: match.priority,
        start_date: match.start_date,
        end_date: match.end_date,
        enabled:
          typeof match.enabled === "string"
            ? match.enabled.toLowerCase() === "true"
            : !!match.enabled,
      };
    }

    if (debug) {
      enriched.__campaign_debug = {
        lookup_key: enriched.utm_campaign,
        campaigns_count: campaigns.length,
        sample_keys: campaigns[0] ? Object.keys(campaigns[0]) : [],
        first_row: campaigns[0] || null,
        match_found: !!match,
      };
    }
  } catch (e: any) {
    if (debug) {
      enriched.__campaign_debug = {
        lookup_key: enriched.utm_campaign,
        error: e?.message || String(e),
      };
    }
  }

    // Forward enriched event to Lytics (server-to-server)
  const stream = process.env.LYTICS_STREAM || "default";
  const apiKey = process.env.LYTICS_API_KEY;
  const dryrun = req.nextUrl.searchParams.get("dryrun") === "1";

  if (apiKey) {
    try {
      const lyticsRes = await fetch(
        `https://api.lytics.io/collect/json/${encodeURIComponent(stream)}${
          dryrun ? "?dryrun=true" : ""
        }`,
        {
          method: "POST",
          headers: {
            Authorization: apiKey, // ✅ IMPORTANT
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(enriched),
        }
      );

      const lyticsText = await lyticsRes.text();

      if (debug) {
        enriched.__lytics_debug = {
          ok: lyticsRes.ok,
          status: lyticsRes.status,
          response: lyticsText.slice(0, 200),
        };
      }
    } catch (e: any) {
      if (debug) {
        enriched.__lytics_debug = {
          ok: false,
          error: e?.message || String(e),
        };
      }
    }
  } else if (debug) {
    enriched.__lytics_debug = {
      ok: false,
      error: "Missing LYTICS_API_KEY env var",
    };
  }

  if (debug) {
    const debugEnriched = { ...enriched };
    delete debugEnriched.ip;
    return corsJson(req, { ok: true, enriched: debugEnriched }, 200);
  }
  // TODO: forward to Lytics here (server-to-server)
  return corsJson(req, { ok: true }, 200);
}

function flattenUtm(utm?: Record<string, string>) {
  if (!utm) return {};
  return {
    utm_source: utm.utm_source,
    utm_medium: utm.utm_medium,
    utm_campaign: utm.utm_campaign,
    utm_term: utm.utm_term,
    utm_content: utm.utm_content,
  };
}

function isAllowedOrigin(origin: string) {
  return ALLOWED_ORIGINS.has(origin);
}

function corsEmpty(req: NextRequest, status = 204) {
  const origin = req.headers.get("origin") || "";
  const res = new NextResponse(null, { status });
  if (isAllowedOrigin(origin)) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Vary", "Origin");
    res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.headers.set(
      "Access-Control-Allow-Headers",
      "content-type, x-dl-site, x-dl-key"
    );
    res.headers.set("Access-Control-Max-Age", "86400");
  }
  return res;
}

function corsJson(req: NextRequest, body: any, status = 200) {
  const origin = req.headers.get("origin") || "";
  const res = NextResponse.json(body, { status });
  if (isAllowedOrigin(origin)) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Vary", "Origin");
  }
  return res;
}

/** ---------------------------
 *  Google Sheets enrichment
 *  ---------------------------
 */

type CampaignRow = {
  utm_campaign?: string;
  country?: string;
  experience?: string;
  priority?: string | number;
  start_date?: string;
  end_date?: string;
  enabled?: string | boolean;
};


let CAMPAIGNS_CACHE: { expiresAt: number; rows: CampaignRow[] } | null = null;

async function getCampaignRows(): Promise<CampaignRow[]> {
  const now = Date.now();
  if (CAMPAIGNS_CACHE && CAMPAIGNS_CACHE.expiresAt > now) return CAMPAIGNS_CACHE.rows;

  const url = process.env.HDL_CAMPAIGNS_JSON_URL;
  if (!url) return [];

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];

  const data = await res.json();
  const rows: CampaignRow[] = Array.isArray(data) ? data : data.records || [];

  CAMPAIGNS_CACHE = { rows, expiresAt: now + 60_000 }; // cache 60s
  return rows;
}

function findCampaign(rows: CampaignRow[], utm_campaign?: string) {
  if (!utm_campaign) return null;
  const key = utm_campaign.trim().toLowerCase();
  return (
    rows.find((r) => (r.utm_campaign || "").trim().toLowerCase() === key) || null
  );
}
