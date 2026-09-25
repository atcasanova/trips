import crypto from 'crypto';
import { Request, Response } from 'express';
import argon2 from 'argon2';
import { query } from '../db/pool.js';
import { env } from '../config/env.js';
import { emailService } from '../services/emailService.js';
import { logger } from '../utils/logger.js';

export const userController = {
  async listUsers(_req: Request, res: Response) {
    try {
      const { rows } = await query(
        `SELECT id, email, name, role, status, avatar_url, last_login_at, created_at, updated_at
         FROM users
         ORDER BY created_at DESC`
      );
      return res.json({ users: rows });
    } catch (err: any) {
      logger.error('Erro ao listar usuários:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao listar usuários' });
    }
  },

  async createUser(req: Request, res: Response) {
    const { email, name, role, avatar_url } = req.body;

    if (!email || !name) {
      return res.status(400).json({ error: 'E-mail e nome são obrigatórios' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const userRole = role === 'ADMIN' ? 'ADMIN' : 'USER';
    const adminUser = req.user!;

    try {
      const { rows: existing } = await query('SELECT id, status, password_hash FROM users WHERE email = $1', [cleanEmail]);
      if (existing.length > 0 && existing[0].password_hash) {
        return res.status(409).json({ error: 'Já existe um usuário ativo cadastrado com este e-mail' });
      }

      let newUser: any;
      if (existing.length > 0) {
        const { rows } = await query(
          `UPDATE users SET name = $1, role = $2, avatar_url = COALESCE($3, avatar_url), updated_at = NOW()
           WHERE id = $4
           RETURNING id, email, name, role, status, avatar_url, created_at`,
          [name.trim(), userRole, avatar_url || null, existing[0].id]
        );
        newUser = rows[0];
      } else {
        const { rows } = await query(
          `INSERT INTO users (email, password_hash, name, role, status, avatar_url, must_change_password)
           VALUES ($1, NULL, $2, $3, 'INVITED', $4, FALSE)
           RETURNING id, email, name, role, status, avatar_url, created_at`,
          [cleanEmail, name.trim(), userRole, avatar_url || null]
        );
        newUser = rows[0];
      }

      // Gera token criptográfico seguro de convite (expira em 7 dias)
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await query(
        `UPDATE user_invitations SET status = 'REVOKED', updated_at = NOW()
         WHERE email = $1 AND status = 'PENDING' AND trip_id IS NULL`,
        [cleanEmail]
      );

      await query(
        `INSERT INTO user_invitations (email, name, invited_by, token_hash, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [cleanEmail, name.trim(), adminUser.id, tokenHash, expiresAt]
      );

      const inviteLink = `${env.APP_URL}/invite/${rawToken}`;

      // Envia e-mail de convite para definir senha
      emailService.sendInvitationEmail(cleanEmail, adminUser.name, rawToken).catch((e) => {
        logger.warn('Falha no envio de e-mail ao convidar usuário', { error: e.message });
      });

      logger.info('Novo usuário convidado pelo administrador com link seguro para definir senha', {
        userId: newUser.id,
        email: cleanEmail,
      });

      return res.status(201).json({
        user: newUser,
        inviteLink,
        message: 'Convite enviado com sucesso! O usuário definirá sua senha pelo link.',
      });
    } catch (err: any) {
      logger.error('Erro ao criar usuário:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao criar usuário' });
    }
  },

  async updateUser(req: Request, res: Response) {
    const { id } = req.params;
    const { name, role, status, avatar_url, password } = req.body;

    try {
      const { rows: existing } = await query('SELECT id, email, role FROM users WHERE id = $1', [id]);
      if (existing.length === 0) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      const updates: string[] = [];
      const values: any[] = [];
      let idx = 1;

      if (name) {
        updates.push(`name = $${idx++}`);
        values.push(name.trim());
      }
      if (role && ['ADMIN', 'USER'].includes(role)) {
        updates.push(`role = $${idx++}`);
        values.push(role);
      }
      if (status && ['ACTIVE', 'SUSPENDED'].includes(status)) {
        updates.push(`status = $${idx++}`);
        values.push(status);
      }
      if (avatar_url !== undefined) {
        updates.push(`avatar_url = $${idx++}`);
        values.push(avatar_url);
      }
      if (password && password.length >= 6) {
        const passwordHash = await argon2.hash(password, {
          type: argon2.argon2id,
          memoryCost: 65536,
          timeCost: 3,
          parallelism: 4,
        });
        updates.push(`password_hash = $${idx++}`);
        values.push(passwordHash);
      }

      if (updates.length === 0) {
        return res.json({ message: 'Nenhuma alteração solicitada' });
      }

      updates.push(`updated_at = NOW()`);
      values.push(id);

      const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, email, name, role, status, avatar_url, updated_at`;
      const { rows } = await query(sql, values);

      logger.info('Usuário atualizado com sucesso', { userId: id });
      return res.json({ user: rows[0] });
    } catch (err: any) {
      logger.error('Erro ao atualizar usuário:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao atualizar usuário' });
    }
  },

  async deleteUser(req: Request, res: Response) {
    const { id } = req.params;

    if (req.user?.id === id) {
      return res.status(400).json({ error: 'Você não pode excluir sua própria conta administrativa' });
    }

    try {
      await query('DELETE FROM users WHERE id = $1', [id]);
      logger.info('Usuário excluído', { userId: id });
      return res.json({ message: 'Usuário excluído com sucesso' });
    } catch (err: any) {
      logger.error('Erro ao excluir usuário:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao excluir usuário' });
    }
  },
};
