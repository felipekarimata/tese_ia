"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function LoginPage() {
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: ""
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email: formData.email,
        password: formData.password,
        name: formData.name,
        action: isSignUp ? "signup" : "login",
        redirect: false
      });

      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success(isSignUp ? "Conta criada com sucesso!" : "Login efetuado!");
        router.push("/");
        router.refresh();
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao processar requisição");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-gray-950 via-black to-black">
      {/* Subtle background lights - static */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 right-1/4 w-[400px] h-[400px] bg-red-500/3 rounded-full blur-[100px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[350px] h-[350px] bg-red-600/2 rounded-full blur-[100px]"></div>
      </div>

      {/* Login Card */}
      <div className="w-full max-w-md mx-4 relative z-10">
        <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl p-8">
          {/* Logo and Title */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-6">
              <div className="relative">
                <div className="absolute inset-0 bg-red-500/20 blur-2xl rounded-full"></div>
                <svg width="80" height="80" viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg" className="relative">
                  <rect x="2" y="2" width="46" height="40" rx="4" stroke="url(#gradient)" strokeWidth="2" fill="black"/>
                  <circle cx="15" cy="32" r="3" fill="#EF4444"/>
                  <circle cx="25" cy="20" r="3" fill="#EF4444"/>
                  <circle cx="35" cy="15" r="3" fill="#EF4444"/>
                  <line x1="15" y1="29" x2="25" y2="23" stroke="#EF4444" strokeWidth="2"/>
                  <line x1="25" y1="17" x2="35" y2="18" stroke="#EF4444" strokeWidth="2"/>
                  <path d="M 2 42 Q 10 46 20 46 Q 30 46 38 46 L 46 42" stroke="url(#gradient)" strokeWidth="2" fill="none"/>
                  <defs>
                    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#EF4444" />
                      <stop offset="100%" stopColor="#DC2626" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </div>
            <h1 className="text-4xl font-bold mb-2">
              <span className="bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">Autor</span>
              <span className="bg-gradient-to-r from-red-500 to-red-600 bg-clip-text text-transparent">IA</span>
            </h1>
            <p className="text-gray-400 text-sm">
              {isSignUp ? "Criar nova conta" : "Bem-vindo de volta"}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {isSignUp && (
              <div className="space-y-2">
                <Label htmlFor="name" className="text-gray-200 text-sm font-medium">
                  Nome
                </Label>
                <Input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-red-500/50 focus:ring-red-500/20 h-11 rounded-lg transition-all"
                  placeholder="Seu nome completo"
                  required={isSignUp}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-gray-200 text-sm font-medium">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-red-500/50 focus:ring-red-500/20 h-11 rounded-lg transition-all"
                placeholder="seu@email.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-gray-200 text-sm font-medium">
                Senha
              </Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-red-500/50 focus:ring-red-500/20 h-11 rounded-lg transition-all"
                placeholder="••••••••"
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full h-11 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-medium rounded-lg shadow-lg shadow-red-500/20 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
              disabled={loading}
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Processando...
                </div>
              ) : (
                isSignUp ? "Criar Conta" : "Entrar"
              )}
            </Button>
          </form>

          {/* Toggle Sign Up / Sign In */}
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-sm text-gray-400 hover:text-red-500 transition-colors"
            >
              {isSignUp ? (
                <>
                  Já tem conta? <span className="text-red-500 font-medium">Entrar</span>
                </>
              ) : (
                <>
                  Não tem conta? <span className="text-red-500 font-medium">Criar</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-gray-500 text-xs mt-8">
          Sistema de tradução com inteligência artificial
        </p>
      </div>

    </div>
  );
}
