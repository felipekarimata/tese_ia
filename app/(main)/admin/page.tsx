"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { UserPlus, KeyRound, ShieldCheck, ShieldOff, Power, PowerOff } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "user";
  is_active: boolean;
  auth_provider: string;
  created_at: string;
  last_login_at: string | null;
};

function fmt(date: string | null, withTime = false): string {
  if (!date) return "—";
  try {
    return format(new Date(date), withTime ? "dd/MM/yyyy 'às' HH:mm" : "dd/MM/yyyy", {
      locale: ptBR,
    });
  } catch {
    return "—";
  }
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "user">("user");
  const [creating, setCreating] = useState(false);

  // Proteção no cliente (o middleware também protege no servidor).
  useEffect(() => {
    if (status === "authenticated" && session?.user?.role !== "admin") {
      router.replace("/");
    }
  }, [status, session, router]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      if (!res.ok) throw new Error("Falha ao carregar usuários");
      const data = await res.json();
      setUsers(data.users || []);
    } catch (e: any) {
      toast.error(e.message || "Erro ao carregar usuários");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role === "admin") {
      load();
    }
  }, [status, session]);

  const patch = async (id: string, action: "toggle-active" | "toggle-role") => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Falha na operação");
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const resetPassword = async (id: string, email: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Falha ao enviar reset");
      toast.success(`Email de redefinição enviado para ${email}.`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const createUser = async () => {
    if (!newEmail.trim() || !newEmail.includes("@")) {
      toast.error("Informe um email válido.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail.trim(), name: newName.trim(), role: newRole }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Falha ao criar usuário");
      toast.success("Usuário criado. Email para definir a senha foi enviado.");
      setDialogOpen(false);
      setNewEmail("");
      setNewName("");
      setNewRole("user");
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCreating(false);
    }
  };

  if (status === "loading" || (status === "authenticated" && session?.user?.role !== "admin")) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-12 h-12 border-4 border-red-500/20 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Usuários</h1>
          <p className="text-gray-400 text-sm mt-1">Gerencie o acesso ao sistema.</p>
        </div>
        <Button
          onClick={() => setDialogOpen(true)}
          className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white"
        >
          <UserPlus className="h-4 w-4 mr-2" />
          Novo usuário
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-10 h-10 border-4 border-red-500/20 border-t-red-500 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.02]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-gray-400 text-left">
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Papel</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Criado</th>
                <th className="px-4 py-3 font-medium">Último acesso</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === session?.user?.id;
                const busy = busyId === u.id;
                return (
                  <tr key={u.id} className="border-b border-white/5 hover:bg-white/[0.03]">
                    <td className="px-4 py-3 text-white">
                      {u.email}
                      {isSelf && <span className="text-gray-500 text-xs ml-2">(você)</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-300">{u.name || "—"}</td>
                    <td className="px-4 py-3">
                      <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                        {u.role === "admin" ? "Admin" : "Usuário"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {u.is_active ? (
                        <span className="text-green-400">Ativo</span>
                      ) : (
                        <span className="text-gray-500">Inativo</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-400">{fmt(u.created_at)}</td>
                    <td className="px-4 py-3 text-gray-400">{fmt(u.last_login_at, true)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => resetPassword(u.id, u.email)}
                          title="Enviar reset de senha"
                          aria-label={`Enviar reset de senha para ${u.email}`}
                          className="text-gray-400 hover:text-red-400"
                        >
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy || isSelf}
                          onClick={() => patch(u.id, "toggle-role")}
                          title={u.role === "admin" ? "Rebaixar para usuário" : "Promover a admin"}
                          aria-label={u.role === "admin" ? `Rebaixar ${u.email} para usuário` : `Promover ${u.email} a admin`}
                          className="text-gray-400 hover:text-amber-400"
                        >
                          {u.role === "admin" ? (
                            <ShieldOff className="h-4 w-4" />
                          ) : (
                            <ShieldCheck className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy || (isSelf && u.is_active)}
                          onClick={() => patch(u.id, "toggle-active")}
                          title={u.is_active ? "Desativar" : "Ativar"}
                          aria-label={u.is_active ? `Desativar ${u.email}` : `Ativar ${u.email}`}
                          className="text-gray-400 hover:text-red-400"
                        >
                          {u.is_active ? (
                            <PowerOff className="h-4 w-4" />
                          ) : (
                            <Power className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                    Nenhum usuário cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo usuário</DialogTitle>
            <DialogDescription>
              O usuário receberá um email para definir a própria senha.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="new-email">Email *</Label>
              <Input
                id="new-email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="pessoa@empresa.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-name">Nome</Label>
              <Input
                id="new-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nome completo"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-role">Papel</Label>
              <select
                id="new-role"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as "admin" | "user")}
                className="w-full h-10 rounded-md border border-white/10 bg-white/5 px-3 text-sm text-white focus:border-red-500/50 focus:outline-none"
              >
                <option value="user">Usuário</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={creating}>
                Cancelar
              </Button>
              <Button onClick={createUser} disabled={creating || !newEmail.trim()}>
                {creating ? "Criando..." : "Criar e enviar convite"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
