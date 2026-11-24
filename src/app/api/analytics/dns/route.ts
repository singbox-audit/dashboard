import { NextRequest, NextResponse } from "next/server";
import { ch } from "@/lib/clickhouse";

export const dynamic = "force-dynamic";

const QTYPE_NAMES: Record<number, string> = {
  1: "A",
  28: "AAAA",
  65: "HTTPS",
  16: "TXT",
  12: "PTR",
  5: "CNAME",
  15: "MX",
  2: "NS",
  6: "SOA",
};

const RCODE_NAMES: Record<number, string> = {
  0: "NOERROR",
  1: "FORMERR",
  2: "SERVFAIL",
  3: "NXDOMAIN",
  4: "NOTIMP",
  5: "REFUSED",
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const user = searchParams.get("user") || "";
  const limitParam = searchParams.get("limit");
  const isAll = limitParam === "all" || limitParam === "0";
  const limitClause = isAll ? "LIMIT 500" : `LIMIT ${Math.max(1, Math.min(500, parseInt(limitParam || "50", 10)))}`;

  const userClause = user ? `AND auth_user = {user:String}` : "";
  const userParam = user ? { user } : {};

  try {
    // 1. KPI
    const kpiQuery = `
      SELECT
        count() AS total_queries,
        countIf(cache_hit = 1) AS cache_hits,
        round(countIf(cache_hit = 1) / if(count() = 0, 1, count()) * 100, 1) AS hit_rate,
        round(avg(latency_ms), 2) AS avg_latency_ms,
        countIf(rcode = 3) AS nxdomain_count,
        countIf(rcode != 0 AND rcode != 3) AS error_count
      FROM audit.dns_events
      WHERE 1=1 ${userClause}
    `;
    const kpiRes = await ch.query({ query: kpiQuery, query_params: userParam });
    const kpi: any = (await kpiRes.json()).data[0] || {};

    // 2. QTypes
    const qtypeQuery = `
      SELECT
        qtype,
        count() AS count
      FROM audit.dns_events
      WHERE 1=1 ${userClause}
      GROUP BY qtype
      ORDER BY count DESC
      LIMIT 8
    `;
    const qtypeRes = await ch.query({ query: qtypeQuery, query_params: userParam });
    const qtypes = (await qtypeRes.json()).data.map((r: any) => ({
      name: QTYPE_NAMES[Number(r.qtype)] || `Type-${r.qtype}`,
      count: Number(r.count),
    }));

    // 3. RCODEs
    const rcodeQuery = `
      SELECT
        rcode,
        count() AS count
      FROM audit.dns_events
      WHERE 1=1 ${userClause}
      GROUP BY rcode
      ORDER BY count DESC
    `;
    const rcodeRes = await ch.query({ query: rcodeQuery, query_params: userParam });
    const rcodes = (await rcodeRes.json()).data.map((r: any) => ({
      name: RCODE_NAMES[Number(r.rcode)] || `RCODE-${r.rcode}`,
      rcode: Number(r.rcode),
      count: Number(r.count),
    }));

    // 4. Recent Queries
    const recentQuery = `
      SELECT
        request_id,
        event_time,
        auth_user AS user,
        network,
        qname,
        qtype,
        resolver,
        cache_hit,
        rcode,
        answers,
        latency_ms
      FROM audit.dns_events
      WHERE 1=1 ${userClause}
      ORDER BY event_time DESC
      ${limitClause}
    `;
    const recentRes = await ch.query({ query: recentQuery, query_params: userParam });
    const recent = (await recentRes.json()).data.map((r: any) => ({
      request_id: r.request_id,
      event_time: r.event_time,
      user: r.user,
      network: r.network,
      qname: r.qname,
      qtype_name: QTYPE_NAMES[Number(r.qtype)] || `Type-${r.qtype}`,
      resolver: r.resolver,
      cache_hit: Boolean(r.cache_hit),
      rcode_name: RCODE_NAMES[Number(r.rcode)] || `RCODE-${r.rcode}`,
      answers: Array.isArray(r.answers) ? r.answers.slice(0, 3) : [],
      latency_ms: Number(r.latency_ms || 0),
    }));

    return NextResponse.json({
      kpi: {
        total_queries: Number(kpi.total_queries || 0),
        cache_hits: Number(kpi.cache_hits || 0),
        hit_rate: Number(kpi.hit_rate || 0),
        avg_latency_ms: Number(kpi.avg_latency_ms || 0),
        nxdomain_count: Number(kpi.nxdomain_count || 0),
        error_count: Number(kpi.error_count || 0),
      },
      qtypes,
      rcodes,
      recent,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
