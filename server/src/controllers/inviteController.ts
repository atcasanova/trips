import crypto from 'crypto';
import { Request, Response } from 'express';
import argon2 from 'argon2';
import { query } from '../db/pool.js';
import { env } from '../config/env.js';
import { emailService } from '../services/emailService.js';
import { createSessionToken } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

export const inviteController = {
  // 1. Qualquer usuário autenticado pode enviar um convite
  async createInvite(req: Request, res: Response) {
    const { email, name, tripId, tripRole } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'O e-mail do convidado é obrigatório' });
    }

    const cleanEmail = String(email).toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'Formato de e-mail inválido' });
    }

    const role = ['OWNER', 'EDITOR', 'VIEWER'].includes(tripRole) ? tripRole : 'VIEWER';
    const inviter = req.user!;

    try {
      let tripTitle: string | undefined;

      if (tripId) {
        // Verifica se a viagem existe e se o usuário tem permissão para convidar
        const { rows: tripRows } = await query(
          `SELECT t.id, t.title FROM trips t
           LEFT JOIN trip_members tm ON tm.trip_id = t.id AND tm.user_id = $1
           WHERE t.id = $2 AND (t.created_by = $1 OR tm.id IS NOT NULL OR $3 = 'ADMIN')`,
          [inviter.id, tripId, inviter.role]
        );

        if (tripRows.length === 0) {
          return res.status(403).json({ error: 'Você não tem permissão para convidar membros para esta viagem' });
        }
        tripTitle = tripRows[0].title;
      }

      // Verifica se o usuário já existe no sistema com senha definida
      const { rows: existingUsers } = await query(
        `SELECT id, name, email, password_hash, status FROM users WHERE email = $1`,
        [cleanEmail]
      );

      if (existingUsers.length > 0 && existingUsers[0].password_hash) {
        const existing = existingUsers[0];
        if (tripId) {
          // Usuário já cadastrado: vincula diretamente à viagem
          await query(
            `INSERT INTO trip_members (trip_id, user_id, role)
             VALUES ($1, $2, $3)
             ON CONFLICT (trip_id, user_id) DO UPDATE SET role = EXCLUDED.role, updated_at = NOW()`,
            [tripId, existing.id, role]
          );

          // Vincula a viajante existente ou cria novo sem duplicar
          const { rows: existingTravelers } = await query(
            `SELECT id FROM trip_travelers 
             WHERE trip_id = $1 AND (user_id = $2 OR (email IS NOT NULL AND LOWER(TRIM(email)) = LOWER(TRIM($3))))`,
            [tripId, existing.id, existing.email]
          );

          if (existingTravelers.length > 0) {
            await query(
              `UPDATE trip_travelers
               SET user_id = $1, display_name = $2, email = $3, role = $4, updated_at = NOW()
               WHERE id = $5`,
              [existing.id, existing.name, existing.email, role, existingTravelers[0].id]
            );
          } else {
            await query(
              `INSERT INTO trip_travelers (trip_id, user_id, display_name, email, role)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (trip_id, user_id) WHERE user_id IS NOT NULL DO UPDATE SET role = EXCLUDED.role, updated_at = NOW()`,
              [tripId, existing.id, existing.name, existing.email, role]
            );
          }

          emailService.sendTripInvite(existing.email, inviter.name, tripTitle || 'Viagem', role, tripId)
            .catch((e) => logger.warn('Falha no envio de aviso de viagem', { error: e.message }));

          return res.status(200).json({
            alreadyRegistered: true,
            message: `O usuário ${cleanEmail} já possui conta no Trips e foi adicionado diretamente à viagem!`,
            user: { id: existing.id, email: existing.email, name: existing.name },
          });
        } else {
          return res.status(409).json({ error: `O e-mail ${cleanEmail} já possui uma conta ativa no Trips.` });
        }
      }

      // Usuário não existe ou não definiu senha: cria convite com link único
      // Invalida convites pendentes anteriores para este e-mail
      await query(
        `UPDATE user_invitations SET status = 'REVOKED', updated_at = NOW()
         WHERE email = $1 AND status = 'PENDING' AND (trip_id = $2 OR (trip_id IS NULL AND $2 IS NULL))`,
        [cleanEmail, tripId || null]
      );

      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 dias

      const { rows: invRows } = await query(
        `INSERT INTO user_invitations (email, name, trip_id, trip_role, invited_by, token_hash, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, email, name, trip_id, trip_role, created_at, expires_at`,
        [cleanEmail, name ? name.trim() : null, tripId || null, role, inviter.id, tokenHash, expiresAt]
      );

      const invite = invRows[0];
      const inviteLink = `${env.APP_URL}/invite/${rawToken}`;

      // Cria registro preliminar de usuário pendente (sem senha pré-definida)
      await query(
        `INSERT INTO users (email, name, password_hash, role, status)
         VALUES ($1, $2, NULL, 'USER', 'INVITED')
         ON CONFLICT (email) DO UPDATE SET updated_at = NOW()`,
        [cleanEmail, name ? name.trim() : cleanEmail.split('@')[0]]
      );

      // Dispara e-mail de convite
      emailService.sendInvitationEmail(cleanEmail, inviter.name, rawToken, tripTitle, role)
        .catch((e) => logger.warn('Falha no envio de e-mail de convite', { error: e.message }));

      logger.info('Convite de novo usuário criado com sucesso', {
        email: cleanEmail,
        invitedBy: inviter.id,
        tripId,
      });

      return res.status(201).json({
        message: 'Convite gerado com sucesso!',
        inviteLink,
        rawToken,
        invite,
      });
    } catch (err: any) {
      logger.error('Erro ao criar convite:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao gerar convite de usuário' });
    }
  },

  // 2. Consulta dados do convite pelo token único (público)
  async getInviteByToken(req: Request, res: Response) {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({ error: 'Token de convite não informado' });
    }

    try {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      const { rows } = await query(
        `SELECT i.id, i.email, i.name, i.trip_id, i.trip_role, i.status, i.expires_at,
                u.name as inviter_name, u.email as inviter_email,
                t.title as trip_title, t.destination_summary, t.start_date, t.end_date
         FROM user_invitations i
         JOIN users u ON i.invited_by = u.id
         LEFT JOIN trips t ON i.trip_id = t.id
         WHERE i.token_hash = $1`,
        [tokenHash]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Convite não encontrado ou link inválido.' });
      }

      const invite = rows[0];

      if (invite.status !== 'PENDING') {
        return res.status(400).json({ error: 'Este convite já foi aceito ou cancelado.' });
      }

      if (new Date(invite.expires_at) < new Date()) {
        return res.status(400).json({ error: 'Este convite expirou. Solicite um novo link ao remetente.' });
      }

      return res.json({
        valid: true,
        email: invite.email,
        name: invite.name || '',
        inviterName: invite.inviter_name,
        tripTitle: invite.trip_title,
        tripRole: invite.trip_role,
        expiresAt: invite.expires_at,
      });
    } catch (err: any) {
      logger.error('Erro ao validar token de convite:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao validar convite' });
    }
  },

  // 3. Aceitar o convite e definir a senha (público)
  async acceptInvite(req: Request, res: Response) {
    const { token } = req.params;
    const { name, password } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token de convite obrigatório' });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'A senha deve possuir pelo menos 6 caracteres' });
    }

    try {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      const { rows: invRows } = await query(
        `SELECT * FROM user_invitations WHERE token_hash = $1`,
        [tokenHash]
      );

      if (invRows.length === 0) {
        return res.status(404).json({ error: 'Convite não encontrado' });
      }

      const invite = invRows[0];

      if (invite.status !== 'PENDING') {
        return res.status(400).json({ error: 'Este convite já foi aceito ou cancelado' });
      }

      if (new Date(invite.expires_at) < new Date()) {
        return res.status(400).json({ error: 'Este convite expirou' });
      }

      // Hash seguro da senha com Argon2id
      const passwordHash = await argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
      });

      const finalName = (name && name.trim()) || invite.name || invite.email.split('@')[0];

      // Atualiza ou insere o usuário ativo com sua senha
      const { rows: userRows } = await query(
        `INSERT INTO users (email, name, password_hash, role, status, must_change_password)
         VALUES ($1, $2, $3, 'USER', 'ACTIVE', FALSE)
         ON CONFLICT (email) DO UPDATE SET
           name = EXCLUDED.name,
           password_hash = EXCLUDED.password_hash,
           status = 'ACTIVE',
           must_change_password = FALSE,
           updated_at = NOW()
         RETURNING id, email, name, role, status`,
        [invite.email, finalName, passwordHash]
      );

      const user = userRows[0];

      // Se o convite estava vinculado a uma viagem, adiciona como membro e viajante
      if (invite.trip_id) {
        await query(
          `INSERT INTO trip_members (trip_id, user_id, role)
           VALUES ($1, $2, $3)
           ON CONFLICT (trip_id, user_id) DO UPDATE SET role = EXCLUDED.role, updated_at = NOW()`,
          [invite.trip_id, user.id, invite.trip_role || 'VIEWER']
        );

        // Vincula ou atualiza viajante na viagem, evitando duplicidade
        const { rows: existingTravelers } = await query(
          `SELECT id, user_id, display_name FROM trip_travelers
           WHERE trip_id = $1 AND (
             user_id = $2 
             OR (email IS NOT NULL AND LOWER(TRIM(email)) = LOWER(TRIM($3)))
             OR (user_id IS NULL AND (
               LOWER(TRIM(display_name)) = LOWER(TRIM($4))
               OR LOWER(TRIM(ticket_name)) = LOWER(TRIM($4))
             ))
           )
           ORDER BY (user_id IS NOT NULL) DESC, created_at ASC`,
          [invite.trip_id, user.id, user.email, user.name]
        );

        if (existingTravelers.length > 0) {
          const primaryTraveler = existingTravelers[0];
          await query(
            `UPDATE trip_travelers
             SET user_id = $1, display_name = $2, email = $3, role = $4, updated_at = NOW()
             WHERE id = $5`,
            [user.id, user.name, user.email, invite.trip_role || 'VIEWER', primaryTraveler.id]
          );

          // Se houver mais de um registro para este e-mail/usuário, consolida e remove duplicatas
          if (existingTravelers.length > 1) {
            const duplicateIds = existingTravelers.slice(1).map((t: any) => t.id);
            await query(
              `UPDATE expenses SET paid_by_traveler_id = $1 WHERE paid_by_traveler_id = ANY($2::uuid[])`,
              [primaryTraveler.id, duplicateIds]
            );
            for (const dupId of duplicateIds) {
              await query(
                `DELETE FROM expense_splits WHERE traveler_id = $1 
                 AND expense_id IN (SELECT expense_id FROM expense_splits WHERE traveler_id = $2)`,
                [dupId, primaryTraveler.id]
              );
              await query(
                `UPDATE expense_splits SET traveler_id = $1 WHERE traveler_id = $2`,
                [primaryTraveler.id, dupId]
              );
            }
            await query(`DELETE FROM trip_travelers WHERE id = ANY($1::uuid[])`, [duplicateIds]);
          }
        } else {
          await query(
            `INSERT INTO trip_travelers (trip_id, user_id, display_name, email, role)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (trip_id, user_id) WHERE user_id IS NOT NULL DO UPDATE SET
               display_name = EXCLUDED.display_name,
               role = EXCLUDED.role,
               updated_at = NOW()`,
            [invite.trip_id, user.id, user.name, user.email, invite.trip_role || 'VIEWER']
          );
        }
      }

      // Marca convite como aceito
      await query(
        `UPDATE user_invitations SET status = 'ACCEPTED', accepted_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [invite.id]
      );

      // Registra login automático: gera token de sessão e cookie HttpOnly
      const sessionToken = createSessionToken(user.id, user.role);

      res.cookie(env.COOKIE_NAME, sessionToken, {
        httpOnly: true,
        secure: env.isProduction || env.APP_URL.startsWith('https'),
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
      });

      logger.info('Convite aceito com sucesso e senha definida pelo usuário', {
        userId: user.id,
        email: user.email,
        tripId: invite.trip_id,
      });

      return res.json({
        message: 'Conta ativada e senha definida com sucesso!',
        user,
        tripId: invite.trip_id,
      });
    } catch (err: any) {
      logger.error('Erro ao aceitar convite:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao processar o aceite do convite' });
    }
  },

  // 4. Listar convites pendentes de uma viagem
  async listTripInvitations(req: Request, res: Response) {
    const { tripId } = req.params;

    try {
      const { rows } = await query(
        `SELECT i.id, i.email, i.name, i.trip_role, i.status, i.created_at, i.expires_at,
                u.name as invited_by_name
         FROM user_invitations i
         JOIN users u ON i.invited_by = u.id
         WHERE i.trip_id = $1 AND i.status = 'PENDING'
         ORDER BY i.created_at DESC`,
        [tripId]
      );

      return res.json({ invitations: rows });
    } catch (err: any) {
      logger.error('Erro ao listar convites da viagem:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao listar convites' });
    }
  },

  // 5. Cancelar / Revogar convite
  async revokeInvite(req: Request, res: Response) {
    const { id } = req.params;
    const user = req.user!;

    try {
      const { rows } = await query(
        `SELECT i.*, t.created_by as trip_creator
         FROM user_invitations i
         LEFT JOIN trips t ON i.trip_id = t.id
         WHERE i.id = $1`,
        [id]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Convite não encontrado' });
      }

      const invite = rows[0];

      // Apenas quem convidou, o criador da viagem ou um ADMIN pode revogar
      const canRevoke =
        invite.invited_by === user.id ||
        invite.trip_creator === user.id ||
        user.role === 'ADMIN';

      if (!canRevoke) {
        return res.status(403).json({ error: 'Você não tem permissão para cancelar este convite' });
      }

      await query(
        `UPDATE user_invitations SET status = 'REVOKED', updated_at = NOW() WHERE id = $1`,
        [id]
      );

      return res.json({ message: 'Convite cancelado com sucesso' });
    } catch (err: any) {
      logger.error('Erro ao cancelar convite:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao cancelar convite' });
    }
  },
};
