// NOTE: Middleware-based Supabase auth requires cookie-based session handling
// (e.g. @supabase/ssr). This project currently uses client-side auth state.
// To avoid breaking deployments, we keep middleware disabled for now.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(_req: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [],
};
