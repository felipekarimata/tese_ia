import nodemailer from 'nodemailer';

/**
 * Envio de email via SMTP (Brevo em produção).
 * Configuração por env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM.
 *
 * Se SMTP_HOST não estiver definido (dev local, ou prod ainda sem Brevo), o
 * link é apenas logado no console de forma bem visível e a função retorna
 * sucesso — o fluxo nunca quebra por falta de SMTP.
 */

function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST?.trim());
}

function buildTransport() {
  const port = Number(process.env.SMTP_PORT ?? 587);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 465 = SSL; 587 = STARTTLS
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });
}

function resetEmailHtml(resetUrl: string, isNewUser: boolean): string {
  const titulo = isNewUser ? 'Defina sua senha' : 'Redefinição de senha';
  const intro = isNewUser
    ? 'Sua conta na <strong>AutorIA</strong> foi criada. Para ativar o acesso, defina sua senha:'
    : 'Recebemos um pedido para redefinir a senha da sua conta na <strong>AutorIA</strong>.';
  const botao = isNewUser ? 'Definir senha' : 'Redefinir senha';

  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
            <tr>
              <td style="background:#dc2626;padding:24px 32px;">
                <span style="color:#ffffff;font-size:22px;font-weight:bold;">Autor<span style="color:#fecaca;">IA</span></span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px;font-size:20px;">${titulo}</h1>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3f3f46;">${intro}</p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
                  <tr>
                    <td align="center" style="border-radius:8px;background:#dc2626;">
                      <a href="${resetUrl}" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;">${botao}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px;font-size:13px;color:#71717a;">Este link expira em 1 hora e só pode ser usado uma vez.</p>
                <p style="margin:0 0 16px;font-size:13px;color:#71717a;">Se você não solicitou isto, ignore este email.</p>
                <p style="margin:24px 0 0;font-size:12px;color:#a1a1aa;word-break:break-all;">
                  Se o botão não funcionar, copie e cole este link no navegador:<br>
                  <a href="${resetUrl}" style="color:#dc2626;">${resetUrl}</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function sendPasswordResetEmail(
  email: string,
  resetUrl: string,
  options: { isNewUser?: boolean } = {}
): Promise<void> {
  const isNewUser = options.isNewUser ?? false;

  if (!isSmtpConfigured()) {
    console.log('\n═══════ RESET DE SENHA ═══════');
    console.log(`Email: ${email}`);
    console.log(`Link: ${resetUrl}`);
    console.log('══════════════════════════════\n');
    return;
  }

  const transporter = buildTransport();
  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'AutorIA <no-reply@autoria.app>',
    to: email,
    subject: isNewUser ? 'Defina sua senha — AutorIA' : 'Redefinição de senha — AutorIA',
    html: resetEmailHtml(resetUrl, isNewUser),
    text: `${isNewUser ? 'Defina sua senha' : 'Redefina sua senha'} acessando: ${resetUrl}\n\nO link expira em 1 hora e só pode ser usado uma vez.`,
  });
}
