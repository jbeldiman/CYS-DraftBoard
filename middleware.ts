import type { NextRequest } from "next/server";
import proxy from "./src/proxy";

export default async function middleware(req: NextRequest) {
  return proxy(req);
}

export const config = {
  matcher: [
    "/",
    "/draft/:path*",
    "/siblings/:path*",
    "/history/:path*",
    "/admin/:path*",
    "/trade/:path*",
  ],
};
