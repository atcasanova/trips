import crypto from 'crypto';
import { Request, Response } from 'express';
import argon2 from 'argon2';
import { query } from '../db/pool.js';
import { env } from '../config/env.js';
import { createSessionToken } from '../middleware/auth.js';
import { emailService } from '../services/emailService.js';
import { logger } from '../utils/logger.js';

export const authController = {
  async login(req: Request, res: Response) {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios' });
    }

    try {
      const { rows } = await query(
        `SELECT id, email, password_hash, name, role, status, avatar_url, last_login_at
         FROM users WHERE email = $1`,
        [email.toLowerCase().trim()]
      );

      if (rows.length === 0) {
        return res.status(401).json({ error: 'Credenciais inválidas' });
      }

      const user = rows[0];

      if (user.status === 'INVITED' || !user.password_hash) {
        return res.status(403).json({ error: 'Conta pendente de ativação. Por favor, acesse o link de convite recebido para cadastrar sua senha.' });
      }

      if (user.status !== 'ACTIVE') {
        return res.status(403).json({ error: 'Conta suspensa. Contate o administrador.' });
      }

      const isValidPassword = await argon2.verify(user.password_hash, password);
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Credenciais inválidas' });
      }

      // Update last login
      await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

      // Create session token
      const token = createSessionToken(user.id, user.role);

      // Set HttpOnly, Secure (when in production or HTTPS), SameSite cookie
      res.cookie(env.COOKIE_NAME, token, {
        httpOnly: true,
        secure: env.isProduction || env.APP_URL.startsWith('https'),
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/',
      });

      logger.info('Usuário logado com sucesso', { userId: user.id, email: user.email, role: user.role });

      const { password_hash, ...safeUser } = user;
      return res.json({
        user: safeUser,
        token, // Returned for testing or API consumers
      });
    } catch (err: any) {
      logger.error('Erro no login:', { error: err.message });
      return res.status(500).json({ error: 'Erro interno ao realizar login' });
    }
  },

  async logout(_req: Request, res: Response) {
    res.clearCookie(env.COOKIE_NAME, { path: '/' });
    return res.json({ message: 'Logout realizado com sucesso' });
  },

  async me(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ error: 'Não autenticado' });
    }
    return res.json({ user: req.user });
  },

  async updatePassword(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'A nova senha deve ter no mínimo 6 caracteres' });
    }

    try {
      const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
      if (rows.length === 0) return res.status(404).json({ error: 'Usuário não encontrado' });

      const isValid = await argon2.verify(rows[0].password_hash, currentPassword);
      if (!isValid) {
        return res.status(400).json({ error: 'Senha atual incorreta' });
      }

      const newHash = await argon2.hash(newPassword, {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
      });

      await query('UPDATE users SET password_hash = $1, must_change_password = FALSE, updated_at = NOW() WHERE id = $2', [newHash, req.user.id]);
      logger.info('Senha alterada com sucesso', { userId: req.user.id });

      return res.json({ message: 'Senha atualizada com sucesso' });
    } catch (err: any) {
      logger.error('Erro ao atualizar senha:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao atualizar senha' });
    }
  },

  async forgotPassword(req: Request, res: Response) {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'E-mail é obrigatório' });
    }

    try {
      const cleanEmail = email.toLowerCase().trim();
      const { rows } = await query('SELECT id, name FROM users WHERE email = $1', [cleanEmail]);

      if (rows.length > 0) {
        const user = rows[0];
        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await query(
          `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
           VALUES ($1, $2, $3)`,
          [user.id, tokenHash, expiresAt]
        );

        emailService.sendPasswordResetEmail(cleanEmail, user.name, rawToken).catch((e) => {
          logger.warn('Falha no envio de e-mail de redefinição', { error: e.message });
        });
      }

      // Always return positive response to avoid user enumeration
      return res.json({ message: 'Se o e-mail estiver cadastrado, as instruções foram enviadas com sucesso.' });
    } catch (err: any) {
      logger.error('Erro ao solicitar redefinição de senha:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao processar solicitação' });
    }
  },

  async resetPasswordWithToken(req: Request, res: Response) {
    const { token, newPassword } = req.body;

    if (!token || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Token válido e nova senha com no mínimo 6 caracteres são obrigatórios' });
    }

    try {
      const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');
      const { rows } = await query(
        `SELECT prt.id as token_id, prt.user_id, u.email, u.name
         FROM password_reset_tokens prt
         JOIN users u ON prt.user_id = u.id
         WHERE prt.token_hash = $1 
           AND prt.expires_at > NOW() 
           AND prt.used_at IS NULL`,
        [tokenHash]
      );

      if (rows.length === 0) {
        return res.status(400).json({ error: 'Link de redefinição inválido ou expirado. Solicite um novo link.' });
      }

      const { token_id, user_id, email } = rows[0];

      const passwordHash = await argon2.hash(newPassword, {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
      });

      // Update user password and invalidate token
      await query('UPDATE users SET password_hash = $1, must_change_password = FALSE, updated_at = NOW() WHERE id = $2', [passwordHash, user_id]);
      await query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1', [token_id]);

      logger.info('Senha redefinida com sucesso através de token', { userId: user_id, email });
      return res.json({ message: 'Senha cadastrada com sucesso! Você já pode entrar com sua nova senha.' });
    } catch (err: any) {
      logger.error('Erro ao redefinir senha com token:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao redefinir senha' });
    }
  },
};
