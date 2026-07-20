"use client";

import Link from "next/link";
import { UserMenu } from "@/components/user-menu";
import { JobsStatusButton } from "@/components/jobs-status-button";
import { usePathname } from "next/navigation";
import { FileText, Settings } from "lucide-react";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const isActive = (path: string) => {
    if (path === "/") return pathname === path;
    return pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-black text-white relative">
      {/* Background gradient overlay */}
      <div className="fixed inset-0 bg-gradient-to-br from-gray-950 via-black to-black pointer-events-none -z-10"></div>

      {/* Header with glassmorphism */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-black/40 backdrop-blur-xl">
        {/* Subtle top gradient line */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-red-500/20 to-transparent"></div>

        <div className="container mx-auto px-4 lg:px-6">
          <nav className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link
              href="/"
              className="flex items-center gap-3 group relative"
            >
              <div className="absolute -inset-2 bg-red-500/10 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <div className="relative flex items-center gap-3">
                <div className="relative">
                  <svg
                    width="40"
                    height="40"
                    viewBox="0 0 50 50"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="transition-transform group-hover:scale-110"
                  >
                    <rect
                      x="2"
                      y="2"
                      width="46"
                      height="40"
                      rx="4"
                      stroke="url(#header-gradient)"
                      strokeWidth="2"
                      fill="black"
                    />
                    <circle cx="15" cy="32" r="3" fill="#EF4444" />
                    <circle cx="25" cy="20" r="3" fill="#EF4444" />
                    <circle cx="35" cy="15" r="3" fill="#EF4444" />
                    <line
                      x1="15"
                      y1="29"
                      x2="25"
                      y2="23"
                      stroke="#EF4444"
                      strokeWidth="2"
                    />
                    <line
                      x1="25"
                      y1="17"
                      x2="35"
                      y2="18"
                      stroke="#EF4444"
                      strokeWidth="2"
                    />
                    <path
                      d="M 2 42 Q 10 46 20 46 Q 30 46 38 46 L 46 42"
                      stroke="url(#header-gradient)"
                      strokeWidth="2"
                      fill="none"
                    />
                    <defs>
                      <linearGradient
                        id="header-gradient"
                        x1="0%"
                        y1="0%"
                        x2="100%"
                        y2="100%"
                      >
                        <stop offset="0%" stopColor="#EF4444" />
                        <stop offset="100%" stopColor="#DC2626" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
                <span className="text-xl font-bold">
                  <span className="bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                    Autor
                  </span>
                  <span className="bg-gradient-to-r from-red-500 to-red-600 bg-clip-text text-transparent">
                    IA
                  </span>
                </span>
              </div>
            </Link>

            {/* Navigation */}
            <div className="flex items-center gap-2">
              <Link
                href="/"
                className={`relative px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive("/")
                    ? "text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                {isActive("/") && (
                  <div className="absolute inset-0 bg-gradient-to-r from-red-500/20 to-red-600/10 rounded-lg border border-red-500/20"></div>
                )}
                <div className="relative flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  <span className="hidden sm:inline">Dashboard</span>
                </div>
              </Link>

              <JobsStatusButton />

              <div className="ml-2 pl-2 border-l border-white/10">
                <UserMenu />
              </div>
            </div>
          </nav>
        </div>

        {/* Bottom gradient line */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/5 to-transparent"></div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 lg:px-6 py-8">
        {children}
      </main>
    </div>
  );
}
