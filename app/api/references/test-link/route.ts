import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();

    if (!url) {
      return NextResponse.json({ error: 'URL não fornecida' }, { status: 400 });
    }

    // Validate URL format
    let testUrl: URL;
    try {
      testUrl = new URL(url);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: 'URL inválida',
          details: 'Formato de URL inválido',
        },
        { status: 400 }
      );
    }

    // Try to fetch the URL with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const response = await fetch(testUrl.toString(), {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; RefChecker/1.0)',
        },
        signal: controller.signal,
        redirect: 'follow',
      });

      clearTimeout(timeoutId);

      // Check if successful
      if (response.ok) {
        const contentType = response.headers.get('content-type') || '';
        const contentLength = response.headers.get('content-length');

        return NextResponse.json({
          success: true,
          status: response.status,
          contentType,
          contentLength: contentLength ? parseInt(contentLength) : null,
          message: 'Link acessível! ✓',
        });
      }

      // Handle various error cases
      if (response.status === 403) {
        return NextResponse.json({
          success: false,
          status: response.status,
          error: 'Acesso negado (403)',
          details: 'O site pode estar bloqueando bots. Considere usar outro link.',
        });
      }

      if (response.status === 404) {
        return NextResponse.json({
          success: false,
          status: response.status,
          error: 'Página não encontrada (404)',
          details: 'Verifique se o URL está correto.',
        });
      }

      if (response.status >= 500) {
        return NextResponse.json({
          success: false,
          status: response.status,
          error: `Erro no servidor (${response.status})`,
          details: 'O site pode estar temporariamente indisponível.',
        });
      }

      return NextResponse.json({
        success: false,
        status: response.status,
        error: `Erro HTTP ${response.status}`,
        details: 'O link retornou um erro.',
      });
    } catch (fetchError: any) {
      clearTimeout(timeoutId);

      if (fetchError.name === 'AbortError') {
        return NextResponse.json({
          success: false,
          error: 'Timeout',
          details: 'O link demorou muito para responder (>10s).',
        });
      }

      if (fetchError.message.includes('ENOTFOUND')) {
        return NextResponse.json({
          success: false,
          error: 'Domínio não encontrado',
          details: 'Verifique se o URL está correto.',
        });
      }

      if (fetchError.message.includes('ECONNREFUSED')) {
        return NextResponse.json({
          success: false,
          error: 'Conexão recusada',
          details: 'Não foi possível conectar ao servidor.',
        });
      }

      return NextResponse.json({
        success: false,
        error: 'Erro ao acessar link',
        details: fetchError.message || 'Erro desconhecido',
      });
    }
  } catch (error: any) {
    console.error('[TEST-LINK] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Erro interno',
        details: error.message || 'Erro ao processar requisição',
      },
      { status: 500 }
    );
  }
}
