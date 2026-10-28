"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, ShieldAlert } from "lucide-react";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-gray-950 via-black to-black">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 right-1/4 w-[400px] h-[400px] bg-red-500/3 rounded-full blur-[100px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[350px] h-[350px] bg-red-600/2 rounded-full blur-[100px]"></div>
      </div>
      <div className="w-full max-w-md mx-4 relative z-10">
        <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl p-8">
          {children}
        </div>
      </div>
    </div>
  );
}

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") || "";

  const [checking, setChecking] = useState(true);
  const [valid, setValid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!token) {
        setValid(false);
        setChecking(false);
        return;
      }
      try {
        const res = await fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`);
        const data = await res.json().catch(() => ({ valid: false }));
        if (active) setValid(Boolean(data.valid));
      } catch {
        if (active) setValid(false);
      } finally {
        if (active) setChecking(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("A senha precisa ter no mínimo 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      toast.error("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Não foi possível redefinir a senha.");
      }
      toast.success("Senha redefinida! Faça login com a nova senha.");
      router.push("/login");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="flex flex-col items-center justify-center py-10">
        <div className="w-10 h-10 border-4 border-red-500/20 border-t-red-500 rounded-full animate-spin" />
        <p className="text-gray-400 mt-4 text-sm">Validando link...</p>
      </div>
    );
  }

  if (!valid) {
    return (
      <div className="text-center space-y-6">
        <div className="flex justify-center">
          <div className="p-4 rounded-full bg-red-500/10 border border-red-500/20">
            <ShieldAlert className="h-10 w-10 text-red-400" />
          </div>
        </div>
        <div>
          <h1 className="text-xl font-bold text-white mb-2">Link inválido ou expirado</h1>
          <p className="text-gray-400 text-sm leading-relaxed">
            Este link de redefinição não é mais válido. Solicite um novo link.
          </p>
        </div>
        <Link
          href="/esqueci-senha"
          className="inline-block w-full h-11 leading-[44px] bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-medium rounded-lg transition-all"
        >
          Solicitar novo link
        </Link>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-red-500 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para o login
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2 text-white">Nova senha</h1>
        <p className="text-gray-400 text-sm">Escolha uma senha com no mínimo 8 caracteres.</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="password" className="text-gray-200 text-sm font-medium">
            Nova senha
          </Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-red-500/50 focus:ring-red-500/20 h-11 rounded-lg transition-all"
            placeholder="••••••••"
            required
            minLength={8}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm" className="text-gray-200 text-sm font-medium">
            Confirmar senha
          </Label>
          <Input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-red-500/50 focus:ring-red-500/20 h-11 rounded-lg transition-all"
            placeholder="••••••••"
            required
            minLength={8}
          />
          {confirm.length > 0 && confirm !== password && (
            <p className="text-xs text-red-400">As senhas não coincidem.</p>
          )}
        </div>
        <Button
          type="submit"
          className="w-full h-11 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-medium rounded-lg shadow-lg shadow-red-500/20 transition-all"
          disabled={loading}
        >
          {loading ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              Salvando...
            </div>
          ) : (
            "Redefinir senha"
          )}
        </Button>
      </form>
    </>
  );
}

export default function ResetarSenhaPage() {
  return (
    <Suspense
      fallback={
        <Shell>
          <div className="flex justify-center py-10">
            <div className="w-10 h-10 border-4 border-red-500/20 border-t-red-500 rounded-full animate-spin" />
          </div>
        </Shell>
      }
    >
      <Shell>
        <ResetForm />
      </Shell>
    </Suspense>
  );
}
