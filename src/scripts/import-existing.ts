import path from "path";
import { ingestAllRaw } from "../lib/ingest.ts";
import { ch } from "../lib/clickhouse.ts";

async function main() {
  const rawDir = [process.cwd(), "..", "data", "archive", "raw"].join(path.sep);
  console.log("Importing raw logs from:", rawDir);
  const startTime = Date.now();
  const total = await ingestAllRaw(rawDir);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`Successfully ingested ${total} records in ${elapsed}s!`);

  // Verify counts
  const res = await ch.query({
    query: `SELECT count() AS total_events, uniqExact(conn_id) AS total_connections FROM audit.conn_events`,
  });
  const data = await res.json();
  console.log("ClickHouse stats:", data.data[0]);

  // Check country & ASN enrichment sample
  const geoSample = await ch.query({
    query: `SELECT country_name, asn_org, count() AS cnt FROM audit.conn_events WHERE country_name != 'Unknown' GROUP BY country_name, asn_org ORDER BY cnt DESC LIMIT 5`,
  });
  const geoData = await geoSample.json();
  console.log("Top Geo/ASN sample:", geoData.data);
}

main().catch(console.error);
