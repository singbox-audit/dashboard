import { NextRequest, NextResponse } from "next/server";
import { ch } from "@/lib/clickhouse";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const user = searchParams.get("user") || "";
  const limitParam = searchParams.get("limit");
  const isAll = limitParam === "all" || limitParam === "0";
  const limitClause = isAll ? "LIMIT 1000" : `LIMIT ${Math.max(1, Math.min(1000, parseInt(limitParam || "20", 10)))}`;

  const userClause = user ? `AND auth_user = {user:String}` : "";
  const userParam = user ? { user } : {};

  try {
    const query = `
      SELECT
        domain,
        any(country_code) AS country_code,
        any(country_name) AS country_name,
        any(asn_number) AS asn_number,
        any(asn_org) AS asn_org,
        groupUniqArray(target_ip) AS resolved_ips,
        sum(upload_bytes) AS sum_upload_bytes,
        sum(download_bytes) AS sum_download_bytes,
        sum(total_bytes) AS sum_total_bytes,
        count() AS connections
      FROM audit.v_connections
      WHERE domain != '' ${userClause}
      GROUP BY domain
      ORDER BY sum_total_bytes DESC
      ${limitClause}
    `;
    const res = await ch.query({ query, query_params: userParam });
    const destinations = (await res.json()).data.map((r: any) => ({
      domain: r.domain,
      country_code: r.country_code,
      country_name: r.country_name,
      asn_number: Number(r.asn_number || 0),
      asn_org: r.asn_org,
      resolved_ips: (r.resolved_ips as string[]).filter(Boolean).slice(0, 5),
      upload_bytes: Number(r.sum_upload_bytes || 0),
      download_bytes: Number(r.sum_download_bytes || 0),
      total_bytes: Number(r.sum_total_bytes || 0),
      connections: Number(r.connections || 0),
    }));

    return NextResponse.json({ destinations });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
