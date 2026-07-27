import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

type Role = "PARENT" | "COACH" | "BOARD" | "ADMIN";

export async function proxy(req: NextRequest) {
  const { nextUrl } = req;
  const path = nextUrl.pathname;

  const isRootRoute = path === "/";
  const isAdminRoute = path.startsWith("/admin");
  const isDraftRoute = path.startsWith("/draft");
  const isLiveDraftRoute = path.startsWith("/live-draft");
  const isCoachHubRoute = path.startsWith("/siblings") || path.startsWith("/history");
  const isTradeRoute = path.startsWith("/trade");
  const isPlayersRoute = path.startsWith("/players");

  const isProtectedRoute =
    isRootRoute ||
    isAdminRoute ||
    isDraftRoute ||
    isLiveDraftRoute ||
    isCoachHubRoute ||
    isTradeRoute ||
    isPlayersRoute;

  if (!isProtectedRoute) return NextResponse.next();

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) return NextResponse.redirect(new URL("/login", nextUrl));

  const role = ((token as any).role as Role | undefined) ?? "PARENT";
  const isViewer = !!(token as any).isViewer;
  const coachesU11 = !!(token as any).coachesU11;
  const coachesU13 = !!(token as any).coachesU13;
  const hasCoachAccess = role === "COACH" || coachesU11 || coachesU13;
  const isAdminOrBoard = role === "ADMIN" || role === "BOARD";

  if (isAdminRoute && !isAdminOrBoard) {
    return NextResponse.redirect(new URL(isViewer ? "/live-draft" : "/draft", nextUrl));
  }

  if (isPlayersRoute) {
    if (!isAdminOrBoard && !hasCoachAccess && !isViewer) {
      return NextResponse.redirect(new URL("/draft", nextUrl));
    }
    return NextResponse.next();
  }

  if (isViewer && !isAdminOrBoard && !hasCoachAccess) {
    const viewerAllowed = isRootRoute || isLiveDraftRoute;
    if (!viewerAllowed) return NextResponse.redirect(new URL("/live-draft", nextUrl));
    return NextResponse.next();
  }

  if (role === "PARENT" && !isDraftRoute && !isRootRoute) {
    return NextResponse.redirect(new URL("/draft", nextUrl));
  }

  return NextResponse.next();
}

export default proxy;
