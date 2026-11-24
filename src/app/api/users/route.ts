import { NextResponse } from "next/server";
import { ch } from "@/lib/clickhouse";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await ch.query({
      query: `SELECT DISTINCT auth_user FROM audit.conn_events WHERE auth_user != '' ORDER BY auth_user`,
    });
    const data = await res.json();
    const users = (data.data as Array<{ auth_user: string }>).map((r) => r.auth_user);
    return NextResponse.json({ users });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
