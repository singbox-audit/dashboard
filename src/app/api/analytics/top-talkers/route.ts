import { NextRequest, NextResponse } from "next/server";
import { ch } from "@/lib/clickhouse";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const user = searchParams.get("user") || "";
  const limitParam = searchParams.get("limit");
  const isAll = !limitParam || limitParam === "all" || limitParam === "0";
  const limitClause = isAll ? "" : `LIMIT ${Math.max(1, Math.min(1000, parseInt(limitParam, 10)))}`;

  const userClause = user ? `AND auth_user = {user:String}` : "";
  const userParam = user ? { user } : {};

  try {
    // 1. Top Talkers
    const query = `
      SELECT
        auth_user AS user,
        sum(upload_bytes) AS sum_upload_bytes,
        sum(download_bytes) AS sum_download_bytes,
        sum(total_bytes) AS sum_total_bytes,
        count() AS connections,
        round(sum(upload_bytes) / if(sum(download_bytes) = 0, 1, sum(download_bytes)), 2) AS up_down_ratio
      FROM audit.v_connections
      WHERE auth_user != '' ${userClause}
      GROUP BY user
      ORDER BY sum_total_bytes DESC
      ${limitClause}
    `;
    const res = await ch.query({ query, query_params: userParam });
    const talkers = (await res.json()).data.map((r: any) => ({
      user: r.user,
      upload_bytes: Number(r.sum_upload_bytes || 0),
      download_bytes: Number(r.sum_download_bytes || 0),
      total_bytes: Number(r.sum_total_bytes || 0),
      connections: Number(r.connections || 0),
      up_down_ratio: Number(r.up_down_ratio || 0),
      // Flag potential exfiltration if upload > 1.5x download and upload > 50MB
      exfiltration_alert: Number(r.up_down_ratio || 0) > 1.5 && Number(r.sum_upload_bytes || 0) > 50 * 1024 * 1024,
    }));

    // 2. 24h Hourly Activity Heatmap
    const heatmapQuery = `
      SELECT
        toDayOfWeek(start_time) AS day_of_week,
        toHour(start_time) AS hour_of_day,
        count() AS connections,
        sum(total_bytes) AS total_bytes
      FROM audit.v_connections
      WHERE 1=1 ${userClause}
      GROUP BY day_of_week, hour_of_day
      ORDER BY day_of_week, hour_of_day
    `;
    const hmRes = await ch.query({ query: heatmapQuery, query_params: userParam });
    const heatmap = (await hmRes.json()).data.map((r: any) => [
      Number(r.hour_of_day),
      Number(r.day_of_week) - 1, // 0 = Mon, 6 = Sun
      Number(r.total_bytes || 0),
      Number(r.connections || 0),
    ]);

    // 3. Daily Breakdown
    const dailyQuery = `
      SELECT
        toDate(start_time) AS day,
        auth_user AS user,
        sum(upload_bytes) AS upload_bytes,
        sum(download_bytes) AS download_bytes,
        sum(total_bytes) AS total_bytes,
        count() AS connections
      FROM audit.v_connections
      WHERE 1=1 ${userClause}
      GROUP BY day, user
      ORDER BY day DESC, total_bytes DESC
      LIMIT 100
    `;
    const dailyRes = await ch.query({ query: dailyQuery, query_params: userParam });
    const daily = (await dailyRes.json()).data.map((r: any) => ({
      day: r.day,
      user: r.user,
      upload_bytes: Number(r.upload_bytes || 0),
      download_bytes: Number(r.download_bytes || 0),
      total_bytes: Number(r.total_bytes || 0),
      connections: Number(r.connections || 0),
    }));

    return NextResponse.json({
      talkers,
      heatmap,
      daily,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
