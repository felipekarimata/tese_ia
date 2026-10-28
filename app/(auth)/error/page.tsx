import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Página de erro do NextAuth (configurada em auth.ts → pages.error = "/error").
 * O NextAuth redireciona para cá com ?error=<código>. Traduzimos cada código
 * para uma mensagem amigável em português, mantendo o visual do login.
 */

type ErrorContent = {
  title: string;
  message: string;
};

const ERROR_MESSAGES: Record<string, ErrorContent> = {
  AccessDenied: {
    title: "Acesso negado",
    message:
      "Seu email não tem acesso ao AutorIA. Para solicitar acesso, fale com o administrador da RMSA.",
  },
  Configuration: {
    title: "Erro de configuração",
    message:
      "Há um problema na configuração de autenticação do sistema. Tente novamente mais tarde ou avise o administrador.",
  },
  Verification: {
    title: "Link expirado",
    message:
      "Este link de acesso expirou ou já foi utilizado. Volte ao login e tente novamente.",
  },
  OAuthAccountNotLinked: {
    title: "Conta já existente",
    message:
      "Este email já está vinculado a outra forma de login. Entre com o método que você usou originalmente.",
  },
  Default: {
    title: "Algo deu errado",
    message:
      "Não foi possível concluir a autenticação. Volte ao login e tente novamente.",
  },
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const content = (error && ERROR_MESSAGES[error]) || ERROR_MESSAGES.Default;

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-gray-950 via-black to-black">
      {/* Subtle background lights - static */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 right-1/4 w-[400px] h-[400px] bg-red-500/3 rounded-full blur-[100px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[350px] h-[350px] bg-red-600/2 rounded-full blur-[100px]"></div>
      </div>

      {/* Error Card */}
      <div className="w-full max-w-md mx-4 relative z-10">
        <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl p-8">
          {/* Logo */}
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
          </div>

          {/* Error message */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">{content.title}</h2>
            <p className="text-gray-400 text-sm leading-relaxed">{content.message}</p>
          </div>

          {/* Back to login */}
          <Link href="/login" className="block">
            <Button
              type="button"
              className="w-full h-11 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-medium rounded-lg shadow-lg shadow-red-500/20 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
            >
              Voltar ao login
            </Button>
          </Link>
        </div>

        {/* Footer */}
        <p className="text-center text-gray-500 text-xs mt-8">
          Sistema de tradução com inteligência artificial
        </p>
      </div>
    </div>
  );
}
