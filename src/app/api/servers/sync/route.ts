import { NextRequest, NextResponse } from "next/server";
import { loadServers, saveServers, syncServer } from "@/lib/sync";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { server_id } = await req.json();
    const servers = loadServers();
    const server = servers.find((s) => s.id === server_id);

    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    const res = await syncServer(server);

    server.last_sync_time = Math.floor(Date.now() / 1000);
    server.last_sync_status = res.success ? "success" : "failed";
    server.last_sync_message = res.message;
    saveServers(servers);

    return NextResponse.json(res);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
