import { NextRequest, NextResponse } from "next/server";

const ALLOWED_ORIGINS = new Set<string>([
  // Add your demo sites here:
  "https://domain-a.com",
  "https://domain-b.com",
  "http://localhost:3000",
]);

// Demo-grade per-site keys.
// In Launch, you can also put these into env vars instead.
const SITE_KEYS: Record<string, string> = {
  site_a: "demo-site-a-key",
  site_b: "demo-site-b-key",
};

type Incoming = {
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
    return NextResponse.json({ ok: false, error: "Origin not allowed" }, { status: 403 });
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
  const enriched = {
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
  };

  // For demos, return what you’d send onward if debug=1
  const debug = req.nextUrl.searchParams.get("debug") === "1";
  if (debug) {
    return corsJson(req, { ok: true, enriched }, 200);
  }

  // TODO: forward to Lytics here (server-to-server)
  // Keep this stubbed for now so the demo layer is safe to deploy.
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
    res.headers.set("Access-Control-Allow-Headers", "content-type, x-dl-site, x-dl-key");
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
