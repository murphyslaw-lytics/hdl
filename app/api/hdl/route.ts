import { NextRequest, NextResponse } from "next/server";

/**
 * Keep this consistent with /collect so the browser can call it from your PoC site.
 */
const ALLOWED_ORIGINS = new Set<string>([
  "https://30rpr-lego-poc.contentstackapps.com",
  "http://localhost:3000",
]);

/**
 * Same auth model as /collect (recommended).
 * This prevents your decision endpoint being used as a public rules engine by anyone.
 */
const SITE_KEYS: Record<string, string> = {
  contentstack_site_a: "cs-demo-a-123",
  contentstack_site_b: "cs-demo-b-456",
};

type HdlRequest = {
  path?: string;
  url?: string;
  referrer?: string;
  title?: string;
  utm?: Record<string, string>;
  lang?: string;
  tz?: string;
  device?: "mobile" | "desktop" | string;
};

type UrlRule = {
  enabled?: boolean | string;
  priority?: number | string;
  match_type?: "exact" | "prefix" | "regex" | string;
  pattern?: string;

  page_type?: string;
  intent?: string;
  audience_mode?: string;
  experience_profile?: string;

  tags?: string[] | string;
  json_overrides?: any; // can be object or JSON string
  rule_id?: string;
};

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

function normalizePath(p?: string) {
  const raw = (p || "/").split("?")[0].split("#")[0];
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withSlash.toLowerCase();
}

function toBool(v: any) {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v.trim().toLowerCase() === "true";
  return !!v;
}

function toNum(v: any, fallback = 999) {
  const n = typeof v === "number" ? v : parseInt(String(v || ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

function toTags(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String).map(s => s.trim()).filter(Boolean);
  return String(v).split(",").map(s => s.trim()).filter(Boolean);
}

function parseJsonOverrides(v: any) {
  if (!v) return {};
  if (typeof v === "object") return v;
  try { return JSON.parse(String(v)); } catch { return {}; }
}

/**
 * ---------------------------
 * Rules loading (Google Sheets JSON)
 * ---------------------------
 * Provide a published JSON URL:
 *   HDL_URL_RULES_JSON_URL=https://script.google.com/macros/s/....../exec
 */
let RULES_CACHE: { expiresAt: number; rows: UrlRule[] } | null = null;

async function getUrlRules(): Promise<UrlRule[]> {
  const now = Date.now();
  if (RULES_CACHE && RULES_CACHE.expiresAt > now) return RULES_CACHE.rows;

  const url = process.env.HDL_URL_RULES_JSON_URL;
  if (!url) {
    // Fallback default rules so endpoint works immediately
    const fallback: UrlRule[] = [
      { rule_id: "themes", enabled: true, priority: 10, match_type: "regex", pattern: "^/themes/([^/]+)", page_type: "category", intent: "browse", audience_mode: "unknown", experience_profile: "theme_browse", tags: "theme" },
      { rule_id: "gifts", enabled: true, priority: 20, match_type: "prefix", pattern: "/gifts", page_type: "category", intent: "gift", audience_mode: "family", experience_profile: "gift_fast_path", tags: "gift" },
      { rule_id: "sets", enabled: true, priority: 30, match_type: "regex", pattern: "^/sets/(\\d+)", page_type: "product", intent: "buy", audience_mode: "unknown", experience_profile: "pdp_standard", tags: "pdp" },
    ];
    RULES_CACHE = { rows: fallback, expiresAt: now + 60_000 };
    return fallback;
  }

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];

  const data = await res.json();
  const rows: UrlRule[] = Array.isArray(data) ? data : data.records || [];

  RULES_CACHE = { rows, expiresAt: now + 60_000 }; // cache 60s
  return rows;
}

function matchRule(path: string, rules: UrlRule[]) {
  const active = rules
    .filter(r => toBool(r.enabled))
    .sort((a, b) => toNum(a.priority) - toNum(b.priority));

  for (const r of active) {
    const mt = (r.match_type || "prefix") as string;
    const pat = r.pattern || "";
    if (!pat) continue;

    if (mt === "exact" && path === pat) return { rule: r, captures: [] as string[] };
    if (mt === "prefix" && path.startsWith(pat)) return { rule: r, captures: [] as string[] };
    if (mt === "regex") {
      try {
        const re = new RegExp(pat);
        const m = path.match(re);
        if (m) return { rule: r, captures: m.slice(1) };
      } catch {
        // ignore invalid regex
      }
    }
  }
  return null;
}

export async function OPTIONS(req: NextRequest) {
  return corsEmpty(req, 204);
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  if (!isAllowedOrigin(origin)) {
    return NextResponse.json({ ok: false, error: "Origin not allowed" }, { status: 403 });
  }

  // Auth (same as /collect)
  const siteId = req.headers.get("x-dl-site") || "";
  const siteKey = req.headers.get("x-dl-key") || "";
  if (!siteId || SITE_KEYS[siteId] !== siteKey) {
    return corsJson(req, { ok: false, error: "Unauthorized" }, 401);
  }

  let input: HdlRequest;
  try {
    input = await req.json();
  } catch {
    return corsJson(req, { ok: false, error: "Invalid JSON" }, 400);
  }

  const path = normalizePath(input.path);
  const debug = req.nextUrl.searchParams.get("debug") === "1";

  const rules = await getUrlRules();
  const hit = matchRule(path, rules);

  // Build a stable, Personalize-friendly output
  const ctx = {
    page_type: hit?.rule.page_type || "unknown",
    intent: hit?.rule.intent || "browse",
    audience_mode: hit?.rule.audience_mode || "unknown",
    experience_profile: hit?.rule.experience_profile || "default",
    tags: toTags(hit?.rule.tags),
    // Optional: expose useful derived values from URL
    url_path: path,
    theme_from_url:
      hit?.rule.rule_id === "themes" && hit.captures?.[0] ? hit.captures[0] : undefined,
    sku_from_url:
      hit?.rule.rule_id === "sets" && hit.captures?.[0] ? hit.captures[0] : undefined,
  };

  const response = {
    hdl_version: "1.0",
    context: ctx,
    experience: parseJsonOverrides(hit?.rule.json_overrides),
    match: hit
      ? {
          rule_id: hit.rule.rule_id || undefined,
          match_type: hit.rule.match_type,
          pattern: hit.rule.pattern,
          captures: hit.captures,
        }
      : null,
  };

  if (debug) {
    return corsJson(req, { ok: true, ...response, __debug: { rules_count: rules.length } }, 200);
  }
  return corsJson(req, { ok: true, ...response }, 200);
}
