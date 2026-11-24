import { NextRequest, NextResponse } from "next/server";
import { ch } from "@/lib/clickhouse";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const user = searchParams.get("user") || "";
  const query = searchParams.get("query") || "";
  const network = searchParams.get("network") || "";
  const status = searchParams.get("status") || "";
  const limit = Math.max(1, Math.min(500, parseInt(searchParams.get("limit") || "50", 10)));
  const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10));

  const conditions: string[] = ["1=1"];
  const params: Record<string, any> = {};

  if (user) {
    conditions.push("auth_user = {user:String}");
    params.user = user;
  }
  if (network) {
    conditions.push("network = {network:String}");
    params.network = network;
  }
  if (status) {
    conditions.push("status = {status:String}");
    params.status = status;
  }
  if (query) {
    conditions.push(
      "(domain ILIKE {q:String} OR target_ip ILIKE {q:String} OR conn_id ILIKE {q:String} OR auth_user ILIKE {q:String})"
    );
    params.q = `%${query}%`;
  }

  const whereClause = conditions.join(" AND ");

  try {
    const countSql = `SELECT count() AS total FROM audit.v_connections WHERE ${whereClause}`;
    const countRes = await ch.query({ query: countSql, query_params: params });
    const total = Number(((await countRes.json()).data[0] as any)?.total || 0);

    const listSql = `
      SELECT
        conn_id,
        auth_user,
        network,
        domain,
        target_ip,
        requested_port,
        route_outbound,
        route_rule,
        country_code,
        country_name,
        asn_number,
        asn_org,
        upload_bytes,
        download_bytes,
        total_bytes,
        duration_sec,
        start_time,
        last_time,
        status,
        result,
        error
      FROM audit.v_connections
      WHERE ${whereClause}
      ORDER BY last_time DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    const listRes = await ch.query({ query: listSql, query_params: params });
    const connections = (await listRes.json()).data.map((r: any) => ({
      conn_id: r.conn_id,
      user: r.auth_user,
      network: r.network,
      domain: r.domain,
      target_ip: r.target_ip,
      port: Number(r.requested_port),
      outbound: r.route_outbound,
      rule: r.route_rule,
      country_code: r.country_code,
      country_name: r.country_name,
      asn_number: Number(r.asn_number || 0),
      asn_org: r.asn_org,
      upload_bytes: Number(r.upload_bytes || 0),
      download_bytes: Number(r.download_bytes || 0),
      total_bytes: Number(r.total_bytes || 0),
      duration_sec: Number(r.duration_sec || 0),
      start_time: r.start_time,
      last_time: r.last_time,
      status: r.status,
      result: r.result,
      error: r.error,
    }));

    return NextResponse.json({
      total,
      connections,
      offset,
      limit,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
