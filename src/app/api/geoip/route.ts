import { NextResponse } from "next/server";
import { getGeoIPStatus, updateGeoIPDatabases } from "@/lib/geoip";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = getGeoIPStatus();
    return NextResponse.json({ success: true, status });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to get GeoIP status" },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const status = await updateGeoIPDatabases(true);
    return NextResponse.json({
      success: status.status === "success",
      status,
      message: status.message,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to trigger GeoIP update" },
      { status: 500 }
    );
  }
}
