import { NextRequest, NextResponse } from "next/server";
import { ch } from "@/lib/clickhouse";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const user = searchParams.get("user") || "";
  const limitParam = searchParams.get("limit");
  const isAll = limitParam === "all" || limitParam === "0";
  const limitClause = isAll ? "LIMIT 200" : `LIMIT ${Math.max(1, Math.min(200, parseInt(limitParam || "10", 10)))}`;

  const userClause = user ? `AND auth_user = {user:String}` : "";
  const userParam = user ? { user } : {};

  try {
    // 1. World Countries for ECharts World Map
    const worldQuery = `
      SELECT
        country_name,
        country_code,
        sum(upload_bytes) AS sum_upload_bytes,
        sum(download_bytes) AS sum_download_bytes,
        sum(total_bytes) AS sum_total_bytes,
        count() AS connections,
        any(domain) AS top_domain
      FROM audit.v_connections
      WHERE country_name != 'Unknown' AND country_name != 'Local Network' AND country_name != '' ${userClause}
      GROUP BY country_name, country_code
      ORDER BY sum_total_bytes DESC
    `;
    const worldRes = await ch.query({ query: worldQuery, query_params: userParam });
    const world = (await worldRes.json()).data.map((r: any) => {
      let mappedName = r.country_name;
      if (r.country_name === "The Netherlands") mappedName = "Netherlands";
      else if (r.country_name === "South Korea") mappedName = "Korea";
      else if (r.country_name === "United States of America") mappedName = "United States";

      return {
        name: mappedName,
        country_name: r.country_name,
        code: r.country_code,
        value: Number(r.sum_total_bytes || 0),
        total_bytes: Number(r.sum_total_bytes || 0),
        upload_bytes: Number(r.sum_upload_bytes || 0),
        download_bytes: Number(r.sum_download_bytes || 0),
        connections: Number(r.connections || 0),
        top_domain: r.top_domain,
      };
    });

    // 2. Top-K / All ASNs
    const asnQuery = `
      SELECT
        asn_number,
        asn_org,
        any(country_code) AS country_code,
        sum(upload_bytes) AS sum_upload_bytes,
        sum(download_bytes) AS sum_download_bytes,
        sum(total_bytes) AS sum_total_bytes,
        count() AS connections
      FROM audit.v_connections
      WHERE asn_number > 0 AND asn_org != 'Unknown' AND asn_org != '' ${userClause}
      GROUP BY asn_number, asn_org
      ORDER BY sum_total_bytes DESC
      ${limitClause}
    `;
    const asnRes = await ch.query({ query: asnQuery, query_params: userParam });
    const asns = (await asnRes.json()).data.map((r: any) => ({
      asn_number: Number(r.asn_number),
      asn_org: r.asn_org,
      country_code: r.country_code,
      upload_bytes: Number(r.sum_upload_bytes || 0),
      download_bytes: Number(r.sum_download_bytes || 0),
      total_bytes: Number(r.sum_total_bytes || 0),
      connections: Number(r.connections || 0),
    }));

    // 3. Cross-border ratio
    const borderQuery = `
      SELECT
        sumIf(total_bytes, country_code = 'CN') AS cn_bytes,
        sumIf(total_bytes, country_code != 'CN' AND country_code != 'LOCAL' AND country_code != '') AS oversea_bytes,
        sum(total_bytes) AS all_bytes
      FROM audit.v_connections
      WHERE 1=1 ${userClause}
    `;
    const borderRes = await ch.query({ query: borderQuery, query_params: userParam });
    const borderData: any = (await borderRes.json()).data[0] || {};

    return NextResponse.json({
      world,
      asns,
      cross_border: {
        cn_bytes: Number(borderData.cn_bytes || 0),
        oversea_bytes: Number(borderData.oversea_bytes || 0),
        total_bytes: Number(borderData.all_bytes || 1),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
