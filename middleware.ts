import { auth } from "@/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;
  const role = (req.auth?.user as { role?: string } | undefined)?.role;

  // Rotas públicas (não exigem autenticação)
  const publicRoutes = [
    "/login",
    "/esqueci-senha",
    "/resetar-senha",
    "/api/auth",
    "/api/health",
    "/api/cron",
  ];
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route));

  // Não autenticado em rota protegida → login
  if (!isLoggedIn && !isPublicRoute) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Já logado tentando acessar telas de auth → home
  if (isLoggedIn && (pathname === "/login" || pathname === "/esqueci-senha" || pathname === "/resetar-senha")) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Área admin: exige papel admin
  if (pathname.startsWith("/admin") && role !== "admin") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|robots.txt|sitemap.xml).*)"]
};
