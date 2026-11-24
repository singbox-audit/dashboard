import { NextRequest, NextResponse } from "next/server";
import { ch } from "@/lib/clickhouse";

export const dynamic = "force-dynamic";

const FORBIDDEN_WORDS = ["drop", "truncate", "delete", "alter", "attach", "detach", "system"];

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();
    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "Missing query" }, { status: 400 });
    }

    const trimmed = query.trim().toLowerCase();
    for (const word of FORBIDDEN_WORDS) {
      if (new RegExp(`\\b${word}\\b`, "i").test(trimmed)) {
        return NextResponse.json(
          { error: `Security check: statement '${word.toUpperCase()}' is restricted in SQL Studio.` },
          { status: 403 }
        );
      }
    }

    const startTime = Date.now();
    const res = await ch.query({
      query: query.trim(),
      format: "JSONCompact",
    });
    const result = await res.json();
    const elapsed = Date.now() - startTime;

    const columns = (result.meta as Array<{ name: string; type: string }>).map((m) => m.name);
    const rows = result.data as any[][];

    return NextResponse.json({
      columns,
      rows,
      count: rows.length,
      elapsed_ms: elapsed,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
