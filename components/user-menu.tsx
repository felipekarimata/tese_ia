"use client";

import { signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { LogOut, User } from "lucide-react";

export function UserMenu() {
  const { data: session } = useSession();

  if (!session?.user) {
    return null;
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 text-sm">
        <User className="h-4 w-4 text-gray-400" />
        <span className="text-gray-300">{session.user.name || session.user.email}</span>
      </div>
      <Button
        onClick={() => signOut({ callbackUrl: "/login" })}
        variant="ghost"
        size="sm"
        className="text-gray-400 hover:text-red-500 hover:bg-gray-900"
      >
        <LogOut className="h-4 w-4 mr-1" />
        Sair
      </Button>
    </div>
  );
}
