import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { loadServers, saveServers, ServerConfig } from "@/lib/sync";

export const dynamic = "force-dynamic";

export async function GET() {
  const servers = loadServers();
  return NextResponse.json({ servers });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const servers = loadServers();

    const newServer: ServerConfig = {
      id: crypto.randomBytes(4).toString("hex"),
      name: body.name || "node",
      host: body.host,
      port: Number(body.port || 22),
      username: body.username || "root",
      auth_type: body.auth_type || "key",
      password: body.password || null,
      private_key: body.private_key || "/root/.ssh/id_ed25519",
      key_passphrase: body.key_passphrase || null,
      remote_path: body.remote_path || "/opt/singbox/audit",
      auto_sync: Boolean(body.auto_sync ?? true),
      sync_interval_minutes: Number(body.sync_interval_minutes || 15),
      remove_source: Boolean(body.remove_source || false),
      last_sync_time: null,
      last_sync_status: null,
      last_sync_message: null,
    };

    servers.push(newServer);
    saveServers(servers);

    return NextResponse.json({ success: true, server: newServer });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing server id" }, { status: 400 });

  let servers = loadServers();
  servers = servers.filter((s) => s.id !== id);
  saveServers(servers);

  return NextResponse.json({ success: true });
}
