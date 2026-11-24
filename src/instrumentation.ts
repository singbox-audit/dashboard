export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // 1. Ensure ClickHouse Schema is initialized and ready
    const { ensureClickHouseSchema } = await import("./lib/clickhouse");
    ensureClickHouseSchema().catch((err) => {
      console.error("[ClickHouse] Background schema init error:", err);
    });

    // 2. Initialize GeoIP & ASN
    const { initGeoIP, checkAndAutoUpdateGeoIP } = await import("./lib/geoip");
    await initGeoIP();
    console.log("[Instrumentation] GeoIP & ASN engine initialized.");

    // Initial check for GeoIP auto-update 15 seconds after boot
    setTimeout(() => {
      checkAndAutoUpdateGeoIP().catch((e) => console.error("[GeoIP AutoUpdate] Initial check error:", e));
    }, 15 * 1000);

    // Schedule daily check (every 24 hours)
    setInterval(() => {
      checkAndAutoUpdateGeoIP().catch((e) => console.error("[GeoIP AutoUpdate] Scheduled run error:", e));
    }, 24 * 60 * 60 * 1000);

    // Periodic auto-sync worker
    const { loadServers, syncServer } = await import("./lib/sync");
    setInterval(async () => {
      try {
        const servers = loadServers();
        for (const s of servers) {
          if (s.auto_sync) {
            console.log(`[AutoSync] Starting sync for server: ${s.name} (${s.host})`);
            const res = await syncServer(s);
            console.log(`[AutoSync] Completed for ${s.name}:`, res.message);
          }
        }
      } catch (err) {
        console.error("[AutoSync] Error running scheduled sync:", err);
      }
    }, 15 * 60 * 1000); // every 15 minutes
  }
}
