import type * as FSType from "fs";
import type * as PathType from "path";
import maxmind from "maxmind";
import type { CountryResponse, AsnResponse, Reader } from "maxmind";

// Use dynamic require to prevent Turbopack from crawling project root data directories
const fs: typeof FSType = typeof window === "undefined" ? eval("require")("node:fs") : ({} as any);
const path: typeof PathType = typeof window === "undefined" ? eval("require")("node:path") : ({} as any);

let countryReader: Reader<CountryResponse> | null = null;
let asnReader: Reader<AsnResponse> | null = null;
let initPromise: Promise<void> | null = null;
let isUpdating = false;

const DEFAULT_COUNTRY_URL = "https://fastly.jsdelivr.net/gh/P3TERX/GeoLite.mmdb@download/GeoLite2-Country.mmdb";
const DEFAULT_ASN_URL = "https://fastly.jsdelivr.net/gh/P3TERX/GeoLite.mmdb@download/GeoLite2-ASN.mmdb";

export function getGeoIPUrls() {
  return {
    countryUrl: process.env.GEOIP_COUNTRY_URL || DEFAULT_COUNTRY_URL,
    asnUrl: process.env.GEOIP_ASN_URL || DEFAULT_ASN_URL,
    autoUpdate: process.env.GEOIP_AUTO_UPDATE !== "false",
    intervalHours: parseInt(process.env.GEOIP_UPDATE_INTERVAL_HOURS || "24", 10) || 24,
  };
}

function getAppPath(...parts: string[]): string {
  const root = process.cwd();
  return [root, ...parts].join(path.sep);
}

function safeExists(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

export function getGeoIpDirectory(): string {
  if (process.env.GEOIP_DIR) {
    try {
      fs.mkdirSync(process.env.GEOIP_DIR, { recursive: true });
      return process.env.GEOIP_DIR;
    } catch {}
  }
  const candidates = [
    getAppPath("data", "geoip"),
    getAppPath("..", "data", "geoip"),
    "/app/data/geoip",
  ];
  for (const c of candidates) {
    try {
      fs.mkdirSync(c, { recursive: true });
      return c;
    } catch {}
  }
  return getAppPath("data", "geoip");
}

function findGeoIpPath(filename: string): string | null {
  const dir = getGeoIpDirectory();
  const directPath = path.join(dir, filename);
  if (safeExists(directPath)) return directPath;

  const candidates = [
    process.env.GEOIP_DIR ? path.join(process.env.GEOIP_DIR, filename) : null,
    getAppPath("data", "geoip", filename),
    getAppPath("..", "data", "geoip", filename),
    "/app/data/geoip/" + filename,
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (safeExists(candidate)) {
      return candidate;
    }
  }
  return null;
}

export async function reloadGeoIP(): Promise<void> {
  try {
    const countryPath = findGeoIpPath("GeoLite2-Country.mmdb");
    if (countryPath) {
      countryReader = await maxmind.open<CountryResponse>(countryPath);
      console.log(`[GeoIP] Reloaded Country DB: ${countryPath}`);
    }
    const asnPath = findGeoIpPath("GeoLite2-ASN.mmdb");
    if (asnPath) {
      asnReader = await maxmind.open<AsnResponse>(asnPath);
      console.log(`[GeoIP] Reloaded ASN DB: ${asnPath}`);
    }
  } catch (err) {
    console.warn("[GeoIP] Error reloading GeoIP readers:", err);
  }
}

export async function initGeoIP(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    await reloadGeoIP();
  })();
  return initPromise;
}

export interface GeoLocation {
  countryCode: string;
  countryName: string;
  asnNumber: number;
  asnOrg: string;
}

const PRIVATE_IP_REGEX = /^(127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|::1|fd|fe80)/;

export function lookupIP(ip: string | null | undefined): GeoLocation {
  if (!ip || PRIVATE_IP_REGEX.test(ip)) {
    return {
      countryCode: ip ? "LAN" : "UNKNOWN",
      countryName: ip ? "Local Network" : "Unknown",
      asnNumber: 0,
      asnOrg: ip ? "Private Network" : "Unknown",
    };
  }

  let countryCode = "UNKNOWN";
  let countryName = "Unknown";
  let asnNumber = 0;
  let asnOrg = "Unknown";

  if (countryReader) {
    try {
      const c = countryReader.get(ip);
      if (c) {
        const country = c.country || c.registered_country;
        countryCode = country?.iso_code || "UNKNOWN";
        countryName = country?.names?.en || "Unknown";
      }
    } catch {
      // ignore invalid IP format
    }
  }

  if (asnReader) {
    try {
      const a = asnReader.get(ip);
      if (a) {
        asnNumber = a.autonomous_system_number || 0;
        asnOrg = a.autonomous_system_organization || "Unknown";
      }
    } catch {
      // ignore
    }
  }

  return { countryCode, countryName, asnNumber, asnOrg };
}

export interface GeoIPStatus {
  last_updated: string | null;
  status: "idle" | "updating" | "success" | "error";
  country_size: number;
  asn_size: number;
  country_file_time: string | null;
  asn_file_time: string | null;
  message: string;
  auto_update_enabled: boolean;
  interval_hours: number;
  country_url: string;
  asn_url: string;
}

function getStatusFilePath(): string {
  const dir = getGeoIpDirectory();
  return path.join(/*turbopackIgnore: true*/ dir, "geoip-status.json");
}

export function getGeoIPStatus(): GeoIPStatus {
  const config = getGeoIPUrls();
  const statusFile = getStatusFilePath();
  let savedStatus: any = {};
  if (safeExists(statusFile)) {
    try {
      savedStatus = JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ statusFile, "utf-8"));
    } catch {}
  }

  const countryPath = findGeoIpPath("GeoLite2-Country.mmdb");
  const asnPath = findGeoIpPath("GeoLite2-ASN.mmdb");

  let countrySize = 0;
  let countryMtime: string | null = null;
  if (countryPath && safeExists(countryPath)) {
    const stat = fs.statSync(/*turbopackIgnore: true*/ countryPath);
    countrySize = stat.size;
    countryMtime = stat.mtime.toISOString();
  }

  let asnSize = 0;
  let asnMtime: string | null = null;
  if (asnPath && safeExists(asnPath)) {
    const stat = fs.statSync(/*turbopackIgnore: true*/ asnPath);
    asnSize = stat.size;
    asnMtime = stat.mtime.toISOString();
  }

  return {
    last_updated: savedStatus.last_updated || countryMtime || null,
    status: isUpdating ? "updating" : savedStatus.status || "idle",
    country_size: countrySize,
    asn_size: asnSize,
    country_file_time: countryMtime,
    asn_file_time: asnMtime,
    message: isUpdating ? "Updating GeoIP databases..." : savedStatus.message || "Ready",
    auto_update_enabled: config.autoUpdate,
    interval_hours: config.intervalHours,
    country_url: config.countryUrl,
    asn_url: config.asnUrl,
  };
}

async function downloadFile(url: string, destPath: string): Promise<number> {
  const resp = await fetch(url, { redirect: "follow" });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
  }
  const arrayBuffer = await resp.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.length < 300 * 1024) {
    throw new Error(`Downloaded file suspiciously small (${buffer.length} bytes)`);
  }
  fs.writeFileSync(destPath, buffer);
  return buffer.length;
}

export async function updateGeoIPDatabases(isManual = false): Promise<GeoIPStatus> {
  if (isUpdating) {
    return getGeoIPStatus();
  }

  isUpdating = true;
  const config = getGeoIPUrls();
  const dir = getGeoIpDirectory();
  const statusFile = getStatusFilePath();

  console.log(`[GeoIP] Starting ${isManual ? "manual" : "automatic"} update from env URLs...`);
  console.log(`[GeoIP] Country URL: ${config.countryUrl}`);
  console.log(`[GeoIP] ASN URL:     ${config.asnUrl}`);

  try {
    const countryTmp = path.join(dir, "GeoLite2-Country.mmdb.tmp");
    const asnTmp = path.join(dir, "GeoLite2-ASN.mmdb.tmp");

    // 1. Download Country MMDB
    const countrySize = await downloadFile(config.countryUrl, countryTmp);
    // Validate Country MMDB
    const testCountry = await maxmind.open<CountryResponse>(countryTmp);
    testCountry.get("8.8.8.8");

    // 2. Download ASN MMDB
    const asnSize = await downloadFile(config.asnUrl, asnTmp);
    // Validate ASN MMDB
    const testAsn = await maxmind.open<AsnResponse>(asnTmp);
    testAsn.get("8.8.8.8");

    // 3. Atomic rename
    const countryFinal = path.join(dir, "GeoLite2-Country.mmdb");
    const asnFinal = path.join(dir, "GeoLite2-ASN.mmdb");

    fs.renameSync(countryTmp, countryFinal);
    fs.renameSync(asnTmp, asnFinal);

    // 4. Hot reload in-memory readers
    await reloadGeoIP();

    const now = new Date().toISOString();
    const resultStatus: GeoIPStatus = {
      last_updated: now,
      status: "success",
      country_size: countrySize,
      asn_size: asnSize,
      country_file_time: now,
      asn_file_time: now,
      message: `Updated successfully via ${isManual ? "manual trigger" : "daily auto-update"}`,
      auto_update_enabled: config.autoUpdate,
      interval_hours: config.intervalHours,
      country_url: config.countryUrl,
      asn_url: config.asnUrl,
    };

    fs.writeFileSync(statusFile, JSON.stringify(resultStatus, null, 2));
    console.log(`[GeoIP] Database update complete! Country: ${countrySize} bytes, ASN: ${asnSize} bytes`);
    return resultStatus;
  } catch (err: any) {
    console.error("[GeoIP] Database update failed:", err);
    const errStatus: GeoIPStatus = {
      ...getGeoIPStatus(),
      status: "error",
      message: `Update failed: ${err.message || String(err)}`,
    };
    try {
      fs.writeFileSync(statusFile, JSON.stringify(errStatus, null, 2));
    } catch {}
    return errStatus;
  } finally {
    isUpdating = false;
  }
}

export async function checkAndAutoUpdateGeoIP(): Promise<void> {
  const config = getGeoIPUrls();
  if (!config.autoUpdate) {
    console.log("[GeoIP AutoUpdate] Auto update is disabled in environment.");
    return;
  }

  const currentStatus = getGeoIPStatus();
  if (!currentStatus.last_updated) {
    console.log("[GeoIP AutoUpdate] No previous update recorded, running initial update...");
    await updateGeoIPDatabases(false);
    return;
  }

  const lastTime = new Date(currentStatus.last_updated).getTime();
  const now = Date.now();
  const elapsedHours = (now - lastTime) / (1000 * 60 * 60);

  if (elapsedHours >= config.intervalHours) {
    console.log(`[GeoIP AutoUpdate] Last update was ${elapsedHours.toFixed(1)}h ago (>= ${config.intervalHours}h), triggering daily update...`);
    await updateGeoIPDatabases(false);
  } else {
    console.log(`[GeoIP AutoUpdate] Last update was ${elapsedHours.toFixed(1)}h ago (< ${config.intervalHours}h), skipping update.`);
  }
}
