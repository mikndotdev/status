import { NextResponse } from "next/server";

import { getStatusSnapshot } from "@/server/status/snapshot";

export async function GET() {
  const snapshot = await getStatusSnapshot();
  return NextResponse.json(snapshot, {
    headers: { "Cache-Control": "no-store" },
  });
}
