import crypto from 'crypto';
import { Request, Response } from 'express';
import { query } from '../db/pool.js';
import { env } from '../config/env.js';
import { emailService } from '../services/emailService.js';
import { refreshItineraryLocations } from '../services/itineraryLocationService.js';
import { logger } from '../utils/logger.js';
import { TripRole } from '../types/index.js';
import { resolveCountry } from '../utils/countryResolver.js';

export const tripController = {
  // 1. List trips accessible to user
  async listTrips(req: Request, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado' });

    try {
      let sql: string;
      let params: any[] = [];

      if (req.user.role === 'ADMIN') {
        sql = `
          SELECT t.*, 
                 'OWNER' as user_role,
                 (SELECT COUNT(*) FROM trip_members WHERE trip_id = t.id) as members_count,
                 (SELECT COUNT(*) FROM documents WHERE trip_id = t.id AND deleted_at IS NULL) as documents_count,
                 (SELECT COUNT(*) FROM trip_days WHERE trip_id = t.id) as days_count,
                 u.name as creator_name
          FROM trips t
          LEFT JOIN users u ON t.created_by = u.id
          WHERE t.deleted_at IS NULL
          ORDER BY t.created_at DESC
        `;
      } else {
        sql = `
          SELECT t.*, 
                 tm.role as user_role,
                 (SELECT COUNT(*) FROM trip_members WHERE trip_id = t.id) as members_count,
                 (SELECT COUNT(*) FROM documents WHERE trip_id = t.id AND deleted_at IS NULL) as documents_count,
                 (SELECT COUNT(*) FROM trip_days WHERE trip_id = t.id) as days_count,
                 u.name as creator_name
          FROM trips t
          JOIN trip_members tm ON t.id = tm.trip_id
          LEFT JOIN users u ON t.created_by = u.id
          WHERE tm.user_id = $1 AND t.deleted_at IS NULL
          ORDER BY t.created_at DESC
        `;
        params.push(req.user.id);
      }

      const { rows } = await query(sql, params);
      return res.json({ trips: rows });
    } catch (err: any) {
      logger.error('Erro ao listar viagens:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao carregar viagens' });
    }
  },

  // 2. Get single trip details with members and days summary
  async getTrip(req: Request, res: Response) {
    const { id } = req.params;

    try {
      const { rows: trips } = await query(
        `SELECT t.*, u.name as creator_name, u.email as creator_email
         FROM trips t
         LEFT JOIN users u ON t.created_by = u.id
         WHERE t.id = $1 AND t.deleted_at IS NULL`,
        [id]
      );

      if (trips.length === 0) {
        return res.status(404).json({ error: 'Viagem não encontrada' });
      }

      const trip = trips[0];

      // Get members
      const { rows: members } = await query(
        `SELECT tm.id, tm.user_id, tm.role, tm.created_at, u.name, u.email, u.avatar_url
         FROM trip_members tm
         JOIN users u ON tm.user_id = u.id
         WHERE tm.trip_id = $1
         ORDER BY tm.created_at ASC`,
        [id]
      );

      // Check current user role
      let userRole: TripRole = 'VIEWER';
      if (req.user?.role === 'ADMIN') {
        userRole = 'OWNER';
      } else {
        const myMember = members.find((m: any) => m.user_id === req.user?.id);
        if (myMember) userRole = myMember.role as TripRole;
      }

      return res.json({
        trip: {
          ...trip,
          user_role: userRole,
          members,
        },
      });
    } catch (err: any) {
      logger.error('Erro ao buscar detalhes da viagem:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao buscar viagem' });
    }
  },

  // 3. Create trip
  async createTrip(req: Request, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado' });

    const {
      title,
      subtitle,
      tagline,
      description,
      destination_summary,
      start_date,
      end_date,
      primary_country,
      cities,
      timezone,
      status,
      theme,
      cover_image_url,
      cover_image_thumb,
      cover_image_attribution,
      default_currency,
      notes,
    } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'O título da viagem é obrigatório' });
    }

    const defaultTheme = {
      preset: 'sakura',
      primary: '#b94a5d',
      secondary: '#d989a4',
      accent: '#fdf2f4',
      text: '#2f3941',
    };

    const resolvedCountry = resolveCountry({
      primary_country,
      title,
      destination_summary,
      cities,
    });

    try {
      const { rows: tripRows } = await query(
        `INSERT INTO trips (
          title, subtitle, tagline, description, destination_summary,
          start_date, end_date, primary_country, cities, timezone, status,
          theme, cover_image_url, cover_image_thumb, cover_image_attribution,
          default_currency, notes, created_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
        ) RETURNING *`,
        [
          title.trim(),
          subtitle || null,
          tagline || null,
          description || null,
          destination_summary || null,
          start_date || null,
          end_date || null,
          resolvedCountry || null,
          JSON.stringify(Array.isArray(cities) ? cities : []),
          timezone || 'UTC',
          status || 'PLANNING',
          JSON.stringify(theme || defaultTheme),
          cover_image_url || null,
          cover_image_thumb || null,
          cover_image_attribution ? JSON.stringify(cover_image_attribution) : null,
          default_currency || 'BRL',
          notes || null,
          req.user.id,
        ]
      );

      const trip = tripRows[0];

      // Add creator as OWNER in trip_members and trip_travelers
      await query(
        `INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1, $2, 'OWNER')`,
        [trip.id, req.user.id]
      );
      await query(
        `INSERT INTO trip_travelers (trip_id, user_id, display_name, email, role)
         VALUES ($1, $2, $3, $4, 'OWNER')
         ON CONFLICT (trip_id, user_id) WHERE user_id IS NOT NULL DO NOTHING`,
        [trip.id, req.user.id, req.user.name, req.user.email]
      );

      // Audit log
      await query(
        `INSERT INTO audit_logs (user_id, trip_id, action, entity_type, entity_id)
         VALUES ($1, $2, 'TRIP_CREATED', 'TRIP', $3)`,
        [req.user.id, trip.id, trip.id]
      );

      logger.info('Nova viagem criada com sucesso', { tripId: trip.id, title: trip.title, owner: req.user.email });
      return res.status(201).json({ trip: { ...trip, user_role: 'OWNER' } });
    } catch (err: any) {
      logger.error('Erro ao criar viagem:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao criar viagem' });
    }
  },

  // 4. Update trip
  async updateTrip(req: Request, res: Response) {
    const { id } = req.params;
    const updates = req.body;

    try {
      if (updates.primary_country !== undefined) {
        if (updates.primary_country && typeof updates.primary_country === 'string' && updates.primary_country.trim()) {
          updates.primary_country = resolveCountry({ primary_country: updates.primary_country }) || updates.primary_country.trim();
        } else {
          updates.primary_country = resolveCountry({
            title: updates.title,
            destination_summary: updates.destination_summary,
            cities: updates.cities,
          });
        }
      } else if (updates.title || updates.destination_summary || updates.cities) {
        const current = await query('SELECT primary_country, title, destination_summary, cities FROM trips WHERE id = $1', [id]);
        if (current.rows.length > 0 && !current.rows[0].primary_country) {
          const inferred = resolveCountry({
            title: updates.title ?? current.rows[0].title,
            destination_summary: updates.destination_summary ?? current.rows[0].destination_summary,
            cities: updates.cities ?? current.rows[0].cities,
          });
          if (inferred) {
            updates.primary_country = inferred;
          }
        }
      }

      const allowedFields = [
        'title', 'subtitle', 'tagline', 'description', 'destination_summary',
        'start_date', 'end_date', 'primary_country', 'cities', 'timezone',
        'status', 'theme', 'cover_image_url', 'cover_image_thumb',
        'cover_image_attribution', 'default_currency', 'notes'
      ];

      const setClauses: string[] = [];
      const values: any[] = [];
      let idx = 1;

      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          setClauses.push(`${field} = $${idx++}`);
          let val = updates[field];
          if (['cities', 'theme', 'cover_image_attribution'].includes(field) && typeof val === 'object' && val !== null) {
            val = JSON.stringify(val);
          }
          values.push(val);
        }
      }

      if (setClauses.length === 0) {
        return res.json({ message: 'Nenhuma alteração informada' });
      }

      setClauses.push(`updated_at = NOW()`);
      values.push(id);

      const sql = `UPDATE trips SET ${setClauses.join(', ')} WHERE id = $${idx} AND deleted_at IS NULL RETURNING *`;
      const { rows } = await query(sql, values);

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Viagem não encontrada' });
      }

      const locationRefresh = ['title', 'destination_summary', 'primary_country', 'cities'].some(
        (field) => updates[field] !== undefined
      )
        ? await refreshItineraryLocations({ tripId: id, userId: req.user?.id })
        : undefined;

      logger.info('Viagem atualizada', { tripId: id });
      return res.json({ trip: rows[0], locationRefresh });
    } catch (err: any) {
      logger.error('Erro ao atualizar viagem:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao atualizar viagem' });
    }
  },

  // 5. Soft delete trip
  async deleteTrip(req: Request, res: Response) {
    const { id } = req.params;

    try {
      await query(`UPDATE trips SET deleted_at = NOW() WHERE id = $1`, [id]);
      logger.info('Viagem arquivada/excluída (soft delete)', { tripId: id });
      return res.json({ message: 'Viagem removida com sucesso' });
    } catch (err: any) {
      logger.error('Erro ao remover viagem:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao remover viagem' });
    }
  },

  // 6. Manage Trip Members
  async addMember(req: Request, res: Response) {
    const { id } = req.params;
    const { email, role } = req.body;

    if (!email) return res.status(400).json({ error: 'E-mail do participante é obrigatório' });

    const memberRole: TripRole = ['OWNER', 'EDITOR', 'VIEWER'].includes(role) ? role : 'VIEWER';
    const cleanEmail = email.toLowerCase().trim();

    try {
      // Check existing trip info
      const { rows: tripRows } = await query('SELECT title FROM trips WHERE id = $1', [id]);
      if (tripRows.length === 0) return res.status(404).json({ error: 'Viagem não encontrada' });
      const tripTitle = tripRows[0].title;

      const { rows: users } = await query('SELECT id, name, email, password_hash FROM users WHERE email = $1', [cleanEmail]);
      
      // Se o usuário não existir no sistema ou ainda não tiver ativado sua conta com senha:
      if (users.length === 0 || !users[0].password_hash) {
        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        await query(
          `UPDATE user_invitations SET status = 'REVOKED', updated_at = NOW()
           WHERE email = $1 AND status = 'PENDING' AND trip_id = $2`,
          [cleanEmail, id]
        );

        await query(
          `INSERT INTO user_invitations (email, trip_id, trip_role, invited_by, token_hash, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [cleanEmail, id, memberRole, req.user?.id, tokenHash, expiresAt]
        );

        // Pre-registra viajante provisório para a viagem
        await query(
          `INSERT INTO trip_travelers (trip_id, display_name, email, role)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT DO NOTHING`,
          [id, cleanEmail.split('@')[0], cleanEmail, memberRole]
        );

        // Envia e-mail de convite com link exclusivo de definição de senha
        emailService.sendInvitationEmail(
          cleanEmail,
          req.user?.name || 'Administrador',
          rawToken,
          tripTitle,
          memberRole
        ).catch((e) => logger.warn('Falha no envio de convite por email:', { error: e.message }));

        const inviteLink = `${env.APP_URL}/invite/${rawToken}`;

        return res.status(201).json({
          invited: true,
          inviteLink,
          message: `Convite enviado para ${cleanEmail}! O usuário definirá sua senha ao acessar o link único.`,
          member: {
            trip_id: id,
            role: memberRole,
            name: cleanEmail.split('@')[0],
            email: cleanEmail,
            status: 'INVITED',
          },
        });
      }

      const targetUser = users[0];

      const { rows: memberRows } = await query(
        `INSERT INTO trip_members (trip_id, user_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (trip_id, user_id) DO UPDATE SET role = EXCLUDED.role, updated_at = NOW()
         RETURNING *`,
        [id, targetUser.id, memberRole]
      );

      // Sync with trip_travelers
      await query(
        `INSERT INTO trip_travelers (trip_id, user_id, display_name, email, role)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (trip_id, user_id) WHERE user_id IS NOT NULL DO UPDATE SET role = EXCLUDED.role, updated_at = NOW()`,
        [id, targetUser.id, targetUser.name, targetUser.email, memberRole]
      );

      // Send email notification
      emailService.sendTripInvite(
        targetUser.email,
        req.user?.name || 'Administrador',
        tripTitle,
        memberRole,
        id
      ).catch((e) => logger.warn('Falha no envio de convite por email:', { error: e.message }));

      return res.status(201).json({
        member: {
          ...memberRows[0],
          name: targetUser.name,
          email: targetUser.email,
        },
      });
    } catch (err: any) {
      logger.error('Erro ao adicionar membro à viagem:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao adicionar participante' });
    }
  },

  async updateMemberRole(req: Request, res: Response) {
    const { id, memberId } = req.params;
    const { role } = req.body;

    if (!['OWNER', 'EDITOR', 'VIEWER'].includes(role)) {
      return res.status(400).json({ error: 'Papel inválido (OWNER, EDITOR ou VIEWER)' });
    }

    try {
      const { rows } = await query(
        `UPDATE trip_members SET role = $1, updated_at = NOW() WHERE id = $2 AND trip_id = $3 RETURNING *`,
        [role, memberId, id]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'Membro não encontrado' });

      // Update in trip_travelers as well
      await query(
        `UPDATE trip_travelers SET role = $1, updated_at = NOW() WHERE trip_id = $2 AND user_id = $3`,
        [role, id, rows[0].user_id]
      );

      return res.json({ member: rows[0] });
    } catch (err: any) {
      return res.status(500).json({ error: 'Erro ao atualizar papel do participante' });
    }
  },

  async removeMember(req: Request, res: Response) {
    const { id, memberId } = req.params;

    try {
      const { rows } = await query('SELECT user_id FROM trip_members WHERE id = $1 AND trip_id = $2', [memberId, id]);
      if (rows.length > 0) {
        await query('DELETE FROM trip_travelers WHERE trip_id = $1 AND user_id = $2', [id, rows[0].user_id]);
      }
      await query('DELETE FROM trip_members WHERE id = $1 AND trip_id = $2', [memberId, id]);
      return res.json({ message: 'Participante removido da viagem' });
    } catch (err: any) {
      return res.status(500).json({ error: 'Erro ao remover participante' });
    }
  },

  // 7. Manage Trip Travelers & Companions
  async listTravelers(req: Request, res: Response) {
    const { tripId } = req.params;
    try {
      const { rows } = await query(
        `SELECT t.*, u.avatar_url,
                CASE WHEN t.user_id IS NOT NULL THEN true ELSE false END as is_registered_user
         FROM trip_travelers t
         LEFT JOIN users u ON u.id = t.user_id
         WHERE t.trip_id = $1
         ORDER BY (t.role = 'OWNER') DESC, (t.user_id IS NOT NULL) DESC, t.display_name ASC`,
        [tripId]
      );
      return res.json({ travelers: rows });
    } catch (err: any) {
      logger.error('Erro ao listar viajantes:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao listar viajantes da viagem' });
    }
  },

  async createCompanion(req: Request, res: Response) {
    const { tripId } = req.params;
    const { displayName, ticketName, email, documentNumber, phone } = req.body;

    if (!displayName || !displayName.trim()) {
      return res.status(400).json({ error: 'Nome do acompanhante é obrigatório' });
    }

    try {
      const { rows } = await query(
        `INSERT INTO trip_travelers (
          trip_id, display_name, ticket_name, email, document_number, phone, role, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, 'COMPANION', $7)
        RETURNING *`,
        [
          tripId,
          displayName.trim(),
          ticketName?.trim() || null,
          email?.trim() || null,
          documentNumber?.trim() || null,
          phone?.trim() || null,
          req.user?.id || null,
        ]
      );

      logger.info('Novo acompanhante cadastrado na viagem', { tripId, name: displayName });
      return res.status(201).json({ traveler: { ...rows[0], is_registered_user: false } });
    } catch (err: any) {
      logger.error('Erro ao cadastrar acompanhante:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao cadastrar acompanhante' });
    }
  },

  async updateTraveler(req: Request, res: Response) {
    const { tripId, travelerId } = req.params;
    const { displayName, ticketName, email, documentNumber, phone } = req.body;

    try {
      const { rows } = await query(
        `UPDATE trip_travelers
         SET display_name = COALESCE($1, display_name),
             ticket_name = COALESCE($2, ticket_name),
             email = COALESCE($3, email),
             document_number = COALESCE($4, document_number),
             phone = COALESCE($5, phone),
             updated_at = NOW()
         WHERE id = $6 AND trip_id = $7
         RETURNING *`,
        [
          displayName?.trim() || null,
          ticketName?.trim() || null,
          email?.trim() || null,
          documentNumber?.trim() || null,
          phone?.trim() || null,
          travelerId,
          tripId,
        ]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Viajante não encontrado' });
      }

      return res.json({ traveler: rows[0] });
    } catch (err: any) {
      return res.status(500).json({ error: 'Erro ao atualizar viajante' });
    }
  },

  async deleteTraveler(req: Request, res: Response) {
    const { tripId, travelerId } = req.params;

    try {
      const { rows: existing } = await query('SELECT * FROM trip_travelers WHERE id = $1 AND trip_id = $2', [travelerId, tripId]);
      if (existing.length === 0) return res.status(404).json({ error: 'Viajante não encontrado' });
      if (existing[0].role === 'OWNER') return res.status(400).json({ error: 'Não é possível remover o proprietário da viagem' });

      await query('DELETE FROM trip_travelers WHERE id = $1 AND trip_id = $2', [travelerId, tripId]);
      return res.json({ message: 'Acompanhante removido com sucesso' });
    } catch (err: any) {
      return res.status(500).json({ error: 'Erro ao remover acompanhante' });
    }
  },
};
