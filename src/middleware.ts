import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // /api配下(Cronのように独自のBearer認証を行うルートを含む)はユーザーセッションの
    // 有無に関わらず素通しする。個々のAPI Routeが自前で認可を行う。
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
