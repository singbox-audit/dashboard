import { createClient } from "@clickhouse/client";

const clickhouseUrl = process.env.CLICKHOUSE_URL || "http://127.0.0.1:8123";
const clickhouseDb = process.env.CLICKHOUSE_DB || "audit";
const clickhouseUser = process.env.CLICKHOUSE_USER || "default";
const clickhousePassword = process.env.CLICKHOUSE_PASSWORD || "";

const rawCh = createClient({
  url: clickhouseUrl,
  database: clickhouseDb,
  username: clickhouseUser,
  password: clickhousePassword,
  request_timeout: 30000,
});

let schemaInitPromise: Promise<void> | null = null;
let schemaReady = false;

export async function ensureClickHouseSchema(): Promise<void> {
  if (schemaReady) return;
  if (schemaInitPromise) return schemaInitPromise;

  schemaInitPromise = (async () => {
    const db = clickhouseDb;
    const maxRetries = 20;
    const delay = 2000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[ClickHouse] Checking/initializing schema on '${clickhouseUrl}' (attempt ${attempt}/${maxRetries})...`);

        // 1. Create database
        await rawCh.command({
          query: `CREATE DATABASE IF NOT EXISTS ${db}`,
        });

        // 2. Table: conn_events
        await rawCh.command({
          query: `
            CREATE TABLE IF NOT EXISTS ${db}.conn_events
            (
                run_id String,
                event_type LowCardinality(String),
                event_time DateTime64(3, 'UTC'),
                inbound_tag LowCardinality(String),
                inbound_type LowCardinality(String),
                auth_user LowCardinality(String),
                network LowCardinality(String),
                upload_bytes UInt64,
                download_bytes UInt64,
                conn_id String,
                seq UInt32,
                route_outbound LowCardinality(String),
                route_rule LowCardinality(String),
                outbound_chain Array(String),
                requested_host String,
                requested_port UInt16,
                target_ip String,
                routed_destination String,
                sniffed_domain String,
                domain String,
                country_code LowCardinality(String),
                country_name LowCardinality(String),
                asn_number UInt32,
                asn_org LowCardinality(String),
                result LowCardinality(String),
                error String
            )
            ENGINE = ReplacingMergeTree(seq)
            PARTITION BY toYYYYMM(event_time)
            ORDER BY (auth_user, toStartOfHour(event_time), conn_id, seq)
            SETTINGS index_granularity = 8192
          `,
        });

        // 3. Table: dns_events
        await rawCh.command({
          query: `
            CREATE TABLE IF NOT EXISTS ${db}.dns_events
            (
                run_id String,
                event_type LowCardinality(String),
                event_time DateTime64(3, 'UTC'),
                inbound_tag LowCardinality(String),
                auth_user LowCardinality(String),
                network LowCardinality(String),
                request_id String,
                qname String,
                qtype UInt16,
                qclass UInt16,
                resolver LowCardinality(String),
                cache_hit UInt8,
                upstreams Array(String),
                rcode Int16,
                answers Array(String),
                latency_ms Float32,
                resolve_error String
            )
            ENGINE = MergeTree
            PARTITION BY toYYYYMM(event_time)
            ORDER BY (auth_user, toStartOfHour(event_time), event_time, request_id)
            SETTINGS index_granularity = 8192
          `,
        });

        // 4. Table: ingested_volumes
        await rawCh.command({
          query: `
            CREATE TABLE IF NOT EXISTS ${db}.ingested_volumes
            (
                volume_name String,
                record_count UInt64,
                ingested_at DateTime DEFAULT now()
            )
            ENGINE = MergeTree
            ORDER BY (volume_name)
            SETTINGS index_granularity = 8192
          `,
        });

        // 5. View: v_connections
        await rawCh.command({
          query: `
            CREATE VIEW IF NOT EXISTS ${db}.v_connections
            AS WITH
                argMax(upload_bytes, seq) AS up,
                argMax(download_bytes, seq) AS down
            SELECT
                conn_id,
                any(run_id) AS run_id,
                any(inbound_tag) AS inbound_tag,
                any(auth_user) AS auth_user,
                any(network) AS network,
                argMax(event_type, seq) AS last_event_type,
                min(event_time) AS start_time,
                max(event_time) AS last_time,
                dateDiff('second', min(event_time), max(event_time)) AS duration_sec,
                up AS upload_bytes,
                down AS download_bytes,
                up + down AS total_bytes,
                argMax(route_outbound, seq) AS route_outbound,
                argMax(route_rule, seq) AS route_rule,
                argMax(requested_host, seq) AS requested_host,
                argMax(requested_port, seq) AS requested_port,
                argMax(target_ip, seq) AS target_ip,
                argMax(sniffed_domain, seq) AS sniffed_domain,
                argMax(domain, seq) AS domain,
                argMax(country_code, seq) AS country_code,
                argMax(country_name, seq) AS country_name,
                argMax(asn_number, seq) AS asn_number,
                argMax(asn_org, seq) AS asn_org,
                argMax(result, seq) AS result,
                argMax(error, seq) AS error,
                multiIf(argMax(event_type, seq) = 'end', 'closed', argMax(event_type, seq) = 'interrupted', 'interrupted', dateDiff('second', max(event_time), now()) > 300, 'closed', 'active') AS status
            FROM ${db}.conn_events
            GROUP BY conn_id
          `,
        });

        console.log(`[ClickHouse] Schema verified and ready on '${db}'.`);
        schemaReady = true;
        return;
      } catch (err: any) {
        console.warn(`[ClickHouse] Schema init attempt ${attempt}/${maxRetries} failed: ${err.message}. Retrying in ${delay}ms...`);
        if (attempt === maxRetries) {
          schemaInitPromise = null;
          throw err;
        }
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  })();

  return schemaInitPromise;
}

export const ch = new Proxy(rawCh, {
  get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver);
    if (typeof value === "function" && (prop === "query" || prop === "insert" || prop === "command")) {
      return async (...args: any[]) => {
        if (!schemaReady) {
          await ensureClickHouseSchema();
        }
        return value.apply(target, args);
      };
    }
    return value;
  },
});
