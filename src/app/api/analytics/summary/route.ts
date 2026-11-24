import { NextRequest, NextResponse } from "next/server";
import { ch } from "@/lib/clickhouse";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const user = searchParams.get("user") || "";
  const range = searchParams.get("range") || "7d";

  const userClause = user ? `AND auth_user = {user:String}` : "";
  const userParam = user ? { user } : {};

  let intervalMinutes = 60;
  let timeFilter = "event_time >= now() - INTERVAL 7 DAY";
  if (range === "24h") {
    intervalMinutes = 15;
    timeFilter = "event_time >= now() - INTERVAL 24 HOUR";
  } else if (range === "30d") {
    intervalMinutes = 1440;
    timeFilter = "event_time >= now() - INTERVAL 30 DAY";
  }

  try {
    // 1. KPI summary
    const kpiQuery = `
      SELECT
        sum(upload_bytes) AS total_upload_bytes,
        sum(download_bytes) AS total_download_bytes,
        count() AS total_connections,
        countIf(status = 'active') AS active_connections,
        uniqExact(auth_user) AS total_users,
        sumIf(upload_bytes, toDate(start_time) = today()) AS today_upload_bytes,
        sumIf(download_bytes, toDate(start_time) = today()) AS today_download_bytes,
        countIf(toDate(start_time) = today()) AS today_connections
      FROM audit.v_connections
      WHERE 1=1 ${userClause}
    `;
    const kpiRes = await ch.query({ query: kpiQuery, query_params: userParam });
    const kpiData: any = (await kpiRes.json()).data[0] || {};

    // 2. Throughput Timeline
    const timelineQuery = `
      SELECT
        toStartOfInterval(event_time, INTERVAL ${intervalMinutes} MINUTE) AS time_bucket,
        sum(upload_bytes) AS upload_bytes,
        sum(download_bytes) AS download_bytes,
        uniqExact(conn_id) AS connections
      FROM audit.conn_events
      WHERE ${timeFilter} ${userClause}
      GROUP BY time_bucket
      ORDER BY time_bucket ASC
    `;
    const tlRes = await ch.query({ query: timelineQuery, query_params: userParam });
    const timelineData = (await tlRes.json()).data;

    // 3. L4 Protocol Distribution
    const protoQuery = `
      SELECT
        network,
        count() AS count,
        sum(total_bytes) AS sum_total_bytes
      FROM audit.v_connections
      WHERE 1=1 ${userClause}
      GROUP BY network
      ORDER BY sum_total_bytes DESC
    `;
    const protoRes = await ch.query({ query: protoQuery, query_params: userParam });
    const protocols = (await protoRes.json()).data;

    // 4. Port Distribution
    const portQuery = `
      SELECT
        requested_port AS port,
        count() AS count,
        sum(total_bytes) AS sum_total_bytes
      FROM audit.v_connections
      WHERE requested_port > 0 ${userClause}
      GROUP BY port
      ORDER BY sum_total_bytes DESC
      LIMIT 10
    `;
    const portRes = await ch.query({ query: portQuery, query_params: userParam });
    const ports = (await portRes.json()).data;

    // 5. Outbound Routes
    const outboundQuery = `
      SELECT
        route_outbound AS outbound,
        count() AS count,
        sum(total_bytes) AS sum_total_bytes
      FROM audit.v_connections
      WHERE route_outbound != '' ${userClause}
      GROUP BY outbound
      ORDER BY sum_total_bytes DESC
    `;
    const outboundRes = await ch.query({ query: outboundQuery, query_params: userParam });
    const outbounds = (await outboundRes.json()).data;

    return NextResponse.json({
      kpi: {
        total_upload_bytes: Number(kpiData.total_upload_bytes || 0),
        total_download_bytes: Number(kpiData.total_download_bytes || 0),
        total_connections: Number(kpiData.total_connections || 0),
        active_connections: Number(kpiData.active_connections || 0),
        total_users: Number(kpiData.total_users || 0),
        today_upload_bytes: Number(kpiData.today_upload_bytes || 0),
        today_download_bytes: Number(kpiData.today_download_bytes || 0),
        today_connections: Number(kpiData.today_connections || 0),
      },
      timeline: timelineData.map((r: any) => ({
        time: r.time_bucket,
        upload_bytes: Number(r.upload_bytes || 0),
        download_bytes: Number(r.download_bytes || 0),
        connections: Number(r.connections || 0),
      })),
      protocols: protocols.map((r: any) => ({
        network: r.network,
        count: Number(r.count || 0),
        total_bytes: Number(r.sum_total_bytes || 0),
      })),
      ports: ports.map((r: any) => ({
        port: Number(r.port),
        count: Number(r.count || 0),
        total_bytes: Number(r.sum_total_bytes || 0),
      })),
      outbounds: outbounds.map((r: any) => ({
        outbound: r.outbound,
        count: Number(r.count || 0),
        total_bytes: Number(r.sum_total_bytes || 0),
      })),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
