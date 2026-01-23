import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

type Role = "PARENT" | "COACH" | "BOARD" | "ADMIN";

export async function proxy(req: NextRequest) {
  const { nextUrl } = req;
  const path = nextUrl.pathname;

  const isAdminRoute = path.startsWith("/admin");
  const isDraftRoute = path.startsWith("/draft");
  const isCoachHubRoute =
    path.startsWith("/siblings") ||
    path.startsWith("/history");

  const isProtectedRoute = isAdminRoute || isDraftRoute || isCoachHubRoute;

  if (!isProtectedRoute) {
    return NextResponse.next();
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token) {
    return NextResponse.redirect(new URL("/login", nextUrl));
  }

  const role = ((token as any).role as Role | undefined) ?? "PARENT";

  
  if (isAdminRoute && role !== "ADMIN" && role !== "BOARD") {
    return NextResponse.redirect(new URL("/draft", nextUrl));
  }


  if (role === "PARENT" && !isDraftRoute) {
    return NextResponse.redirect(new URL("/draft", nextUrl));
  }

  return NextResponse.next();
}

export default proxy;

export const config = {
  matcher: [
    "/draft/:path*",
    "/siblings/:path*",
    "/history/:path*",
    "/admin/:path*",
  ],
};