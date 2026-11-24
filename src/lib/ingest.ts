import type * as FSType from "fs";
import type * as PathType from "path";

// Use dynamic require to prevent Turbopack from crawling project root data directories
const fs: typeof FSType = typeof window === "undefined" ? eval("require")("node:fs") : ({} as any);
const path: typeof PathType = typeof window === "undefined" ? eval("require")("node:path") : ({} as any);
import * as fzstd from "fzstd";
import { ch } from "./clickhouse";
import { initGeoIP, lookupIP } from "./geoip";

function formatDateTime64(epochMs: number): string {
  const d = new Date(epochMs);
  if (isNaN(d.getTime())) return "1970-01-01 00:00:00.000";
  return d.toISOString().replace("T", " ").replace("Z", "");
}

function cleanDomain(d: string | null | undefined): string {
  if (!d) return "";
  const colonIdx = d.indexOf(":");
  return colonIdx !== -1 ? d.slice(0, colonIdx) : d;
}

export async function isVolumeIngested(volumeName: string): Promise<boolean> {
  try {
    const res = await ch.query({
      query: `SELECT 1 FROM audit.ingested_volumes WHERE volume_name = {vol:String} LIMIT 1`,
      query_params: { vol: volumeName },
    });
    const data = await res.json();
    return data.data.length > 0;
  } catch {
    return false;
  }
}

export async function ingestZstFile(filePath: string): Promise<{ count: number; volume: string }> {
  await initGeoIP();
  const volumeName = path.basename(filePath);

  const already = await isVolumeIngested(volumeName);
  if (already) {
    return { count: 0, volume: volumeName };
  }

  const rawBytes = fs.readFileSync(filePath);
  const decompressed = fzstd.decompress(rawBytes);
  const text = new TextDecoder().decode(decompressed);
  const lines = text.split("\n");

  const isConn = volumeName.startsWith("conn_");
  const isDns = volumeName.startsWith("dns_");

  if (isConn) {
    const rows: any[] = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const item = JSON.parse(line);
        if (item.event_type === "run_closed") continue;

        const targetIp = item.target_ip || "";
        const geo = lookupIP(targetIp);
        const rawDomain = item.sniffed_domain || item.requested_host || item.routed_destination || targetIp || "";
        const domain = cleanDomain(rawDomain);

        rows.push({
          run_id: item.run_id || "",
          event_type: item.event_type || "snapshot",
          event_time: formatDateTime64(item.event_time || Date.now()),
          inbound_tag: item.inbound_tag || "",
          inbound_type: item.inbound_type || "",
          auth_user: item.auth_user || "",
          network: item.network || "tcp",
          upload_bytes: Number(item.upload_bytes || 0),
          download_bytes: Number(item.download_bytes || 0),
          conn_id: item.conn_id || "",
          seq: Number(item.seq || 0),
          route_outbound: item.route_outbound || "",
          route_rule: item.route_rule || "",
          outbound_chain: Array.isArray(item.outbound_chain) ? item.outbound_chain : [],
          requested_host: item.requested_host || "",
          requested_port: Number(item.requested_port || 0),
          target_ip: targetIp,
          routed_destination: item.routed_destination || "",
          sniffed_domain: item.sniffed_domain || "",
          domain,
          country_code: geo.countryCode,
          country_name: geo.countryName,
          asn_number: geo.asnNumber,
          asn_org: geo.asnOrg,
          result: item.result || "",
          error: item.error || "",
        });
      } catch {
        // skip malformed line
      }
    }

    if (rows.length > 0) {
      // Batch insert in chunks of 5000
      for (let i = 0; i < rows.length; i += 5000) {
        const chunk = rows.slice(i, i + 5000);
        await ch.insert({
          table: "audit.conn_events",
          values: chunk,
          format: "JSONEachRow",
        });
      }
    }

    await ch.insert({
      table: "audit.ingested_volumes",
      values: [{ volume_name: volumeName, record_count: rows.length }],
      format: "JSONEachRow",
    });

    return { count: rows.length, volume: volumeName };
  } else if (isDns) {
    const rows: any[] = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const item = JSON.parse(line);
        const questions = Array.isArray(item.questions) ? item.questions : [];
        const qname = questions[0]?.Name || item.qname || "";
        const qtype = questions[0]?.Qtype || item.qtype || 0;
        const qclass = questions[0]?.Qclass || 1;

        rows.push({
          run_id: item.run_id || "",
          event_type: item.event_type || "start",
          event_time: formatDateTime64(item.event_time || Date.now()),
          inbound_tag: item.inbound_tag || "",
          auth_user: item.auth_user || "",
          network: item.network || "udp",
          request_id: item.request_id || "",
          qname,
          qtype: Number(qtype),
          qclass: Number(qclass),
          resolver: item.resolver || "",
          cache_hit: item.cache_hit ? 1 : 0,
          upstreams: Array.isArray(item.upstreams) ? item.upstreams : [],
          rcode: Number(item.rcode ?? 0),
          answers: Array.isArray(item.answers) ? item.answers : [],
          latency_ms: Number(item.latency_ms || 0),
          resolve_error: item.resolve_error || "",
        });
      } catch {
        // skip
      }
    }

    if (rows.length > 0) {
      for (let i = 0; i < rows.length; i += 5000) {
        const chunk = rows.slice(i, i + 5000);
        await ch.insert({
          table: "audit.dns_events",
          values: chunk,
          format: "JSONEachRow",
        });
      }
    }

    await ch.insert({
      table: "audit.ingested_volumes",
      values: [{ volume_name: volumeName, record_count: rows.length }],
      format: "JSONEachRow",
    });

    return { count: rows.length, volume: volumeName };
  }

  return { count: 0, volume: volumeName };
}

export async function ingestAllRaw(dirPath: string): Promise<number> {
  if (!fs.existsSync(dirPath)) return 0;
  const files = (fs.readdirSync(dirPath) as string[]).filter((f: string) => f.endsWith(".jsonl.zst"));
  let total = 0;
  for (const f of files) {
    const full = path.join(dirPath, f);
    const res = await ingestZstFile(full);
    total += res.count;
  }
  return total;
}
