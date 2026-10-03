import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  tls: {
    rejectUnauthorized: false,
  },
  connectionTimeout: 5000,
});

export const emailService = {
  async sendWelcomeEmail(to: string, name: string, activationToken?: string) {
    try {
      const setupUrl = activationToken 
        ? `${env.APP_URL}/reset-password?token=${activationToken}` 
        : `${env.APP_URL}/login`;

      const info = await transporter.sendMail({
        from: env.MAIL_FROM,
        to,
        subject: 'Bem-vindo ao Trips — Sua Conta foi Criada',
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0;">
            <h2 style="color: #b94a5d; margin-top: 0;">Olá, ${name}!</h2>
            <p style="font-size: 15px; line-height: 1.5;">Sua conta no sistema de gestão de viagens <strong>Trips</strong> foi criada com sucesso.</p>
            <p style="font-size: 15px; line-height: 1.5; color: #475569;">
              Por segurança, senhas nunca são enviadas por e-mail. Para ativar sua conta e cadastrar sua própria senha com total privacidade, clique no botão abaixo:
            </p>
            <p style="margin: 30px 0; text-align: center;">
              <a href="${setupUrl}" style="background: #b94a5d; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(185,74,93,0.2);">
                ${activationToken ? 'Cadastrar Minha Senha com Segurança' : 'Acessar o Trips'}
              </a>
            </p>
            <p style="font-size: 13px; color: #64748b;">Este link de segurança é individual e expira em 24 horas.</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
            <small style="color: #94a3b8; display: block; text-align: center;">Trips — Gestão Inteligente de Viagens</small>
          </div>
        `,
      });
      logger.info('E-mail de boas-vindas seguro enviado com sucesso', { messageId: info.messageId, to });
      return true;
    } catch (err: any) {
      logger.error('Falha ao enviar e-mail de boas-vindas (SMTP)', { error: err.message, to });
      return false;
    }
  },

  async sendPasswordResetEmail(to: string, name: string, resetToken: string) {
    try {
      const resetUrl = `${env.APP_URL}/reset-password?token=${resetToken}`;
      const info = await transporter.sendMail({
        from: env.MAIL_FROM,
        to,
        subject: 'Redefinição de Senha — Trips',
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0;">
            <h2 style="color: #b94a5d; margin-top: 0;">Redefinição de Senha</h2>
            <p style="font-size: 15px; line-height: 1.5;">Olá, ${name}. Recebemos uma solicitação para redefinir a senha da sua conta no Trips.</p>
            <p style="font-size: 15px; line-height: 1.5; color: #475569;">
              Para criar uma nova senha, clique no botão abaixo. Se você não solicitou esta redefinição, nenhuma ação é necessária e sua senha atual permanece segura.
            </p>
            <p style="margin: 30px 0; text-align: center;">
              <a href="${resetUrl}" style="background: #b94a5d; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px; display: inline-block;">
                Redefinir Minha Senha
              </a>
            </p>
            <p style="font-size: 13px; color: #64748b;">Este link é de uso único e expira em 24 horas.</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
            <small style="color: #94a3b8; display: block; text-align: center;">Trips — Gestão Inteligente de Viagens</small>
          </div>
        `,
      });
      logger.info('E-mail de redefinição de senha enviado com sucesso', { messageId: info.messageId, to });
      return true;
    } catch (err: any) {
      logger.error('Falha ao enviar e-mail de redefinição de senha (SMTP)', { error: err.message, to });
      return false;
    }
  },

  async sendTripInvite(to: string, inviterName: string, tripTitle: string, role: string, tripId: string) {
    try {
      const tripUrl = `${env.APP_URL}/trips/${tripId}`;
      const info = await transporter.sendMail({
        from: env.MAIL_FROM,
        to,
        subject: `Convite para viagem: ${tripTitle}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1e293b;">
            <h2 style="color: #b94a5d;">Você foi convidado para uma viagem!</h2>
            <p><strong>${inviterName}</strong> adicionou você como <strong>${role}</strong> na viagem:</p>
            <blockquote style="border-left: 4px solid #b94a5d; padding-left: 15px; margin: 20px 0; font-size: 1.1em; font-weight: 500;">
              ${tripTitle}
            </blockquote>
            <p style="margin-top: 30px;">
              <a href="${tripUrl}" style="background: #b94a5d; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Ver Detalhes da Viagem</a>
            </p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
            <small style="color: #64748b;">Trips — Gestão Inteligente de Viagens</small>
          </div>
        `,
      });
      logger.info('E-mail de convite de viagem enviado', { messageId: info.messageId, to });
      return true;
    } catch (err: any) {
      logger.error('Falha ao enviar e-mail de convite (SMTP)', { error: err.message, to });
      return false;
    }
  },

  async sendInvitationEmail(
    to: string,
    inviterName: string,
    rawToken: string,
    tripTitle?: string,
    role?: string
  ) {
    try {
      const inviteUrl = `${env.APP_URL}/invite/${rawToken}`;
      const subject = tripTitle
        ? `${inviterName} convidou você para a viagem "${tripTitle}" — Trips`
        : `${inviterName} convidou você para o Trips`;

      const roleDisplay = role === 'OWNER' ? 'Organizador' : role === 'EDITOR' ? 'Editor' : 'Visualizador';

      const info = await transporter.sendMail({
        from: env.MAIL_FROM,
        to,
        subject,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0;">
            <h2 style="color: #b94a5d; margin-top: 0;">Você recebeu um convite especial!</h2>
            <p style="font-size: 15px; line-height: 1.5;">
              Olá! <strong>${inviterName}</strong> convidou você para ${tripTitle ? `participar da viagem <strong>${tripTitle}</strong>${role ? ` como <strong>${roleDisplay}</strong>` : ''}` : 'fazer parte da plataforma <strong>Trips</strong>'}.
            </p>
            <p style="font-size: 15px; line-height: 1.5; color: #475569;">
              Para aceitar o convite e cadastrar sua própria senha de acesso com privacidade e segurança, clique no botão abaixo:
            </p>
            <p style="margin: 30px 0; text-align: center;">
              <a href="${inviteUrl}" style="background: #b94a5d; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(185,74,93,0.2);">
                Aceitar Convite & Cadastrar Senha
              </a>
            </p>
            <p style="font-size: 13px; color: #64748b;">
              Ou copie e cole este link único no seu navegador:<br>
              <a href="${inviteUrl}" style="color: #b94a5d; word-break: break-all;">${inviteUrl}</a>
            </p>
            <p style="font-size: 12px; color: #94a3b8;">Este convite é exclusivo, de uso único e expira em 7 dias.</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
            <small style="color: #94a3b8; display: block; text-align: center;">Trips — Gestão Inteligente de Viagens</small>
          </div>
        `,
      });
      logger.info('E-mail de convite enviado com sucesso', { messageId: info.messageId, to });
      return true;
    } catch (err: any) {
      logger.error('Falha ao enviar e-mail de convite (SMTP)', { error: err.message, to });
      return false;
    }
  },

  async sendInboundProcessedEmail(params: {
    to: string;
    userName: string;
    tripTitle: string;
    tripId: string;
    itemSummary: string;
    itemTypeLabel: string;
    isNewTrip: boolean;
  }) {
    try {
      const tripUrl = `${env.APP_URL}/trips/${params.tripId}`;
      const subject = params.isNewTrip
        ? `🎉 Nova viagem criada: ${params.tripTitle}`
        : `✅ Reserva adicionada: ${params.tripTitle}`;

      const info = await transporter.sendMail({
        from: env.MAIL_FROM,
        to: params.to,
        subject,
        headers: {
          'Auto-Submitted': 'auto-generated',
          'X-Auto-Response-Suppress': 'All',
          'Precedence': 'bulk',
        },
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
              <span style="font-size: 24px;">${params.isNewTrip ? '✨' : '📋'}</span>
              <h2 style="color: #b94a5d; margin: 0; font-size: 18px;">
                ${params.isNewTrip ? 'Criamos uma nova viagem para você!' : 'Sua reserva foi processada com sucesso!'}
              </h2>
            </div>

            <p style="font-size: 14px; line-height: 1.5; color: #334155;">
              Olá, <strong>${params.userName}</strong>. Recebemos o seu e-mail de confirmação e nossa IA organizou tudo na plataforma Trips:
            </p>

            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <div style="font-size: 12px; font-weight: bold; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">
                ${params.itemTypeLabel}
              </div>
              <div style="font-size: 15px; font-weight: bold; color: #0f172a; margin-bottom: 8px;">
                ${params.itemSummary}
              </div>
              <div style="font-size: 13px; color: #475569;">
                📍 <strong>Viagem:</strong> ${params.tripTitle} ${params.isNewTrip ? '(Nova viagem gerada automaticamente)' : '(Viagem existente)'}
              </div>
            </div>

            <p style="margin: 28px 0; text-align: center;">
              <a href="${tripUrl}" style="background: #b94a5d; color: white; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(185,74,93,0.25);">
                Visualizar Viagem no Trips
              </a>
            </p>

            <p style="font-size: 12px; color: #94a3b8; text-align: center;">
              Você pode continuar enviando ou encaminhando passagens, hotéis e ingressos para este endereço a qualquer momento.
            </p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
            <small style="color: #94a3b8; display: block; text-align: center;">Trips — Gestão Inteligente de Viagens</small>
          </div>
        `,
      });
      logger.info('E-mail de confirmação de inbound enviado com sucesso', { messageId: info.messageId, to: params.to });
      return true;
    } catch (err: any) {
      logger.error('Falha ao enviar e-mail de confirmação de inbound (SMTP)', { error: err.message, to: params.to });
      return false;
    }
  },

  async sendInboundUnknownSenderEmail(to: string) {
    try {
      const registerUrl = `${env.APP_URL}/login`;
      const info = await transporter.sendMail({
        from: env.MAIL_FROM,
        to,
        subject: 'Trips — E-mail não associado a uma conta ativa',
        headers: {
          'Auto-Submitted': 'auto-generated',
          'X-Auto-Response-Suppress': 'All',
          'Precedence': 'bulk',
        },
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0;">
            <h2 style="color: #b94a5d; margin-top: 0;">Recebemos sua mensagem!</h2>
            <p style="font-size: 14px; line-height: 1.5; color: #334155;">
              Recebemos um e-mail de reserva enviado a partir deste endereço (<strong>${to}</strong>), porém não localizamos uma conta ativa no Trips com esse e-mail.
            </p>
            <p style="font-size: 14px; line-height: 1.5; color: #475569;">
              Para que suas reservas e passagens sejam importadas automaticamente para o seu roteiro, por favor envie as confirmações através do mesmo endereço de e-mail cadastrado na plataforma Trips, ou acesse o sistema:
            </p>
            <p style="margin: 28px 0; text-align: center;">
              <a href="${registerUrl}" style="background: #b94a5d; color: white; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block;">
                Acessar Plataforma Trips
              </a>
            </p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
            <small style="color: #94a3b8; display: block; text-align: center;">Trips — Gestão Inteligente de Viagens</small>
          </div>
        `,
      });
      logger.info('E-mail de remetente desconhecido enviado', { messageId: info.messageId, to });
      return true;
    } catch (err: any) {
      logger.error('Falha ao enviar e-mail de remetente desconhecido (SMTP)', { error: err.message, to });
      return false;
    }
  },

  async sendInboundUnrecognizedEmail(params: {
    to: string;
    userName: string;
    subject?: string;
  }) {
    try {
      const tripsUrl = `${env.APP_URL}/trips`;
      const subjectClean = (params.subject || 'E-mail recebido').replace(/^(fwd|enc|re):\s*/gi, '').trim();
      const info = await transporter.sendMail({
        from: env.MAIL_FROM,
        to: params.to,
        subject: `⚠️ Documento não identificado: ${subjectClean}`,
        headers: {
          'Auto-Submitted': 'auto-generated',
          'X-Auto-Response-Suppress': 'All',
          'Precedence': 'bulk',
        },
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
              <span style="font-size: 24px;">ℹ️</span>
              <h2 style="color: #475569; margin: 0; font-size: 18px;">
                Não identificamos dados de reserva
              </h2>
            </div>

            <p style="font-size: 14px; line-height: 1.5; color: #334155;">
              Olá, <strong>${params.userName}</strong>. Recebemos a sua mensagem com o assunto <em>"${escapeHtml(subjectClean)}"</em>, porém nossa inteligência artificial não identificou informações legíveis de viagem (como passagens aéreas, reservas de hotéis, ingressos ou despesas) no conteúdo ou anexos enviados.
            </p>

            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin: 18px 0; font-size: 13px; color: #475569;">
              💡 <strong>Dicas para envio:</strong>
              <ul style="margin: 8px 0 0 0; padding-left: 20px; line-height: 1.6;">
                <li>Encaminhe o e-mail completo original de confirmação da companhia aérea, hotel ou agência (Booking, Decolar, etc.).</li>
                <li>Se for anexar arquivos, utilize comprovantes em <strong>PDF</strong> ou imagens/fotos nítidas e completas.</li>
                <li>Nenhuma viagem ou documento em branco foi criado na plataforma.</li>
              </ul>
            </div>

            <p style="margin: 24px 0; text-align: center;">
              <a href="${tripsUrl}" style="background: #b94a5d; color: white; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block;">
                Acessar Minhas Viagens
              </a>
            </p>

            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
            <small style="color: #94a3b8; display: block; text-align: center;">Trips — Gestão Inteligente de Viagens</small>
          </div>
        `,
      });
      logger.info('E-mail de documento não reconhecido enviado', { messageId: info.messageId, to: params.to });
      return true;
    } catch (err: any) {
      logger.error('Falha ao enviar e-mail de documento não reconhecido (SMTP)', { error: err.message, to: params.to });
      return false;
    }
  },
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
