import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { query } from '../db/pool.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { resolveCountry } from '../utils/countryResolver.js';
import { openaiCostsService } from '../services/openaiCostsService.js';

export const adminController = {
  // 1. Overview, Tech Stack & Product Adoption
  async getOverview(req: Request, res: Response) {
    try {
      // Basic counts
      const { rows: countsRows } = await query(`
        SELECT 
          (SELECT COUNT(*) FROM users) as total_users,
          (SELECT COUNT(*) FROM users WHERE status = 'ACTIVE') as active_users,
          (SELECT COUNT(*) FROM trips WHERE deleted_at IS NULL) as total_trips,
          (SELECT COUNT(*) FROM trips t WHERE t.deleted_at IS NULL AND (SELECT COUNT(*) FROM trip_members tm WHERE tm.trip_id = t.id) > 1) as group_trips,
          (SELECT COUNT(*) FROM trips t WHERE t.deleted_at IS NULL AND (SELECT COUNT(*) FROM trip_members tm WHERE tm.trip_id = t.id) <= 1) as solo_trips,
          (SELECT COUNT(*) FROM trip_days) as total_days,
          (SELECT COUNT(*) FROM itinerary_items) as total_items,
          (SELECT COUNT(*) FROM expenses) as total_expenses,
          (SELECT COUNT(*) FROM documents WHERE deleted_at IS NULL) as total_documents,
          (SELECT COUNT(*) FROM ai_audit_logs) as total_ai_calls,
          (SELECT COALESCE(SUM(total_tokens), 0) FROM ai_audit_logs) as total_ai_tokens
      `);
      const counts = countsRows[0];

      // Database stats
      const { rows: dbSizeRows } = await query(`SELECT pg_size_pretty(pg_database_size(current_database())) as db_size`);
      const { rows: tableRows } = await query(`
        SELECT relname as table_name, n_live_tup as row_count, pg_size_pretty(pg_total_relation_size(relid)) as total_size 
        FROM pg_stat_user_tables 
        ORDER BY n_live_tup DESC 
        LIMIT 15
      `);

      // Storage stats
      let totalUploadFiles = 0;
      let totalUploadBytes = 0;
      try {
        if (fs.existsSync(env.UPLOAD_PATH)) {
          const files = fs.readdirSync(env.UPLOAD_PATH);
          totalUploadFiles = files.length;
          for (const f of files) {
            try {
              const stat = fs.statSync(path.join(env.UPLOAD_PATH, f));
              totalUploadBytes += stat.size;
            } catch (e) {}
          }
        }
      } catch (err) {
        logger.warn('Erro ao ler diretório de uploads:', { error: (err as any).message });
      }

      const totalUploadMb = (totalUploadBytes / (1024 * 1024)).toFixed(2);

      // Server process info
      const memory = process.memoryUsage();
      const serverInfo = {
        uptimeSeconds: Math.floor(process.uptime()),
        memoryRssMb: Math.round(memory.rss / (1024 * 1024)),
        memoryHeapMb: Math.round(memory.heapUsed / (1024 * 1024)),
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
      };

      // Integrations status
      const integrations = {
        openAiModel: env.OPENAI_MODEL,
        openAiMapModel: env.OPENAI_MAP_MODEL,
        hasOpenAiKey: Boolean(env.OPENAI_API_KEY && env.OPENAI_API_KEY.length > 5),
        hasOpenAiAdminKey: Boolean(env.OPENAI_ADMIN_KEY && env.OPENAI_ADMIN_KEY.length > 5),
        openAiKeyId: env.OPENAI_KEY_ID || null,
        smtpConfigured: Boolean(env.SMTP_HOST),
        smtpHost: env.SMTP_HOST,
        smtpPort: env.SMTP_PORT,
        pexelsConfigured: Boolean(env.PEXELS_API_KEY && env.PEXELS_API_KEY.length > 5),
        turnstileEnabled: env.TURNSTILE_ENABLED,
        appUrl: env.APP_URL,
        nodeEnv: env.NODE_ENV,
      };

      // Product adoption
      const totalTripsNum = Math.max(Number(counts.total_trips) || 0, 1);
      const { rows: adoptionRows } = await query(`
        SELECT 
          COUNT(*) FILTER (WHERE share_enabled = true) as public_trips,
          COUNT(*) FILTER (WHERE (SELECT COUNT(*) FROM ai_audit_logs ai WHERE ai.trip_id = trips.id) > 0) as trips_with_ai,
          COUNT(*) FILTER (WHERE (SELECT COUNT(*) FROM hotel_reservations hr WHERE hr.trip_id = trips.id) > 0) as trips_with_hotels,
          COUNT(*) FILTER (WHERE (SELECT COUNT(*) FROM transport_reservations tr WHERE tr.trip_id = trips.id) > 0) as trips_with_transports,
          COUNT(*) FILTER (WHERE (SELECT COUNT(*) FROM expenses ex WHERE ex.trip_id = trips.id) > 0) as trips_with_expenses,
          COUNT(*) FILTER (WHERE (SELECT COUNT(*) FROM documents doc WHERE doc.trip_id = trips.id AND doc.deleted_at IS NULL) > 0) as trips_with_documents,
          COUNT(*) FILTER (WHERE (SELECT COUNT(*) FROM reports rep WHERE rep.trip_id = trips.id) > 0) as trips_with_reports
        FROM trips
        WHERE deleted_at IS NULL
      `);
      const adopt = adoptionRows[0] || {};

      const productAdoption = {
        totalTrips: Number(counts.total_trips),
        withAi: { count: Number(adopt.trips_with_ai || 0), percent: Math.round((Number(adopt.trips_with_ai || 0) / totalTripsNum) * 100) },
        withHotels: { count: Number(adopt.trips_with_hotels || 0), percent: Math.round((Number(adopt.trips_with_hotels || 0) / totalTripsNum) * 100) },
        withTransports: { count: Number(adopt.trips_with_transports || 0), percent: Math.round((Number(adopt.trips_with_transports || 0) / totalTripsNum) * 100) },
        withExpenses: { count: Number(adopt.trips_with_expenses || 0), percent: Math.round((Number(adopt.trips_with_expenses || 0) / totalTripsNum) * 100) },
        withDocuments: { count: Number(adopt.trips_with_documents || 0), percent: Math.round((Number(adopt.trips_with_documents || 0) / totalTripsNum) * 100) },
        withReports: { count: Number(adopt.trips_with_reports || 0), percent: Math.round((Number(adopt.trips_with_reports || 0) / totalTripsNum) * 100) },
        groupTrips: { count: Number(counts.group_trips || 0), percent: Math.round((Number(counts.group_trips || 0) / totalTripsNum) * 100) },
        publicTrips: { count: Number(adopt.public_trips || 0), percent: Math.round((Number(adopt.public_trips || 0) / totalTripsNum) * 100) },
      };

      // Recent audit activities (from audit_logs)
      const { rows: recentActivities } = await query(`
        SELECT 
          al.id, al.action, al.entity_type, al.entity_id, al.metadata, al.created_at,
          u.name as user_name, u.email as user_email,
          t.title as trip_title
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.user_id
        LEFT JOIN trips t ON t.id = al.trip_id
        ORDER BY al.created_at DESC
        LIMIT 12
      `);

      return res.json({
        counts: {
          totalUsers: Number(counts.total_users),
          activeUsers: Number(counts.active_users),
          totalTrips: Number(counts.total_trips),
          groupTrips: Number(counts.group_trips),
          soloTrips: Number(counts.solo_trips),
          totalDays: Number(counts.total_days),
          totalItems: Number(counts.total_items),
          totalExpenses: Number(counts.total_expenses),
          totalDocuments: Number(counts.total_documents),
          totalAiCalls: Number(counts.total_ai_calls),
          totalAiTokens: Number(counts.total_ai_tokens),
        },
        techStack: {
          database: {
            size: dbSizeRows[0]?.db_size || 'N/A',
            tables: tableRows.map((r: any) => ({
              name: r.table_name,
              rows: Number(r.row_count),
              size: r.total_size,
            })),
          },
          storage: {
            totalFiles: totalUploadFiles,
            totalSizeBytes: totalUploadBytes,
            totalSizeFormatted: `${totalUploadMb} MB`,
            uploadPath: env.UPLOAD_PATH,
          },
          server: serverInfo,
          integrations,
        },
        productAdoption,
        recentActivities,
      });
    } catch (err: any) {
      logger.error('Erro ao obter visão geral administrativa:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao carregar dados do painel administrativo' });
    }
  },

  // 2. AI Audits & Measurements (Paginated & Filterable by Date, Operation, Status)
  async getAiAudits(req: Request, res: Response) {
    try {
      const page = Math.max(parseInt(req.query.page as string, 10) || 1, 1);
      const limit = Math.min(Math.max(parseInt((req.query.pageSize || req.query.limit) as string, 10) || 25, 1), 200);
      const offset = (page - 1) * limit;

      const operationFilter = req.query.operation as string;
      const statusFilter = req.query.status as string;
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      // 1. Build date conditions for summary and aggregations
      const dateConditions: string[] = [];
      const dateParams: any[] = [];
      let dateParamIdx = 1;

      if (startDate && startDate.trim()) {
        const parsed = Date.parse(startDate);
        if (!isNaN(parsed)) {
          dateConditions.push(`created_at >= $${dateParamIdx++}::timestamptz`);
          dateParams.push(startDate.trim());
        }
      }

      if (endDate && endDate.trim()) {
        const parsed = Date.parse(endDate);
        if (!isNaN(parsed)) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(endDate.trim())) {
            // Whole day coverage: include until 23:59:59.999
            dateConditions.push(`created_at < ($${dateParamIdx++}::date + interval '1 day')`);
            dateParams.push(endDate.trim());
          } else {
            dateConditions.push(`created_at <= $${dateParamIdx++}::timestamptz`);
            dateParams.push(endDate.trim());
          }
        }
      }

      const dateWhereClause = dateConditions.length > 0 ? `WHERE ${dateConditions.join(' AND ')}` : '';

      // Date conditions with 'ai.' table alias for joined queries
      const dateConditionsAliased = dateConditions.map(c => c.replace(/\bcreated_at\b/g, 'ai.created_at'));
      const dateWhereClauseAliased = dateConditionsAliased.length > 0 ? `WHERE ${dateConditionsAliased.join(' AND ')}` : '';

      // Summary
      const { rows: summaryRows } = await query(`
        SELECT 
          COUNT(*) as total_calls,
          COUNT(*) FILTER (WHERE status = 'SUCCESS') as success_calls,
          COUNT(*) FILTER (WHERE status = 'ERROR') as error_calls,
          COALESCE(SUM(prompt_tokens), 0) as total_prompt_tokens,
          COALESCE(SUM(completion_tokens), 0) as total_completion_tokens,
          COALESCE(SUM(total_tokens), 0) as total_tokens,
          COALESCE(ROUND(AVG(duration_ms)), 0) as avg_duration_ms,
          COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms), 0) as p95_duration_ms
        FROM ai_audit_logs
        ${dateWhereClause}
      `, dateParams);

      const summary = summaryRows[0] || {};
      const totalCallsNum = Number(summary.total_calls || 0);
      const successRate = totalCallsNum > 0 ? ((Number(summary.success_calls || 0) / totalCallsNum) * 100).toFixed(1) : '100.0';

      const promptTokens = Number(summary.total_prompt_tokens || 0);
      const completionTokens = Number(summary.total_completion_tokens || 0);
      const localEstimatedCostUsd = ((promptTokens * 0.0000025) + (completionTokens * 0.000010)).toFixed(4);

      // Consulta custos oficiais da OpenAI se OPENAI_ADMIN_KEY estiver configurada
      const officialCosts = await openaiCostsService.getOfficialCosts(startDate, endDate);
      const isOfficial = officialCosts.success;
      const finalCostUsd = isOfficial ? officialCosts.totalCostUsd : Number(localEstimatedCostUsd);

      // By operation
      const { rows: byOperation } = await query(`
        SELECT 
          operation, 
          COUNT(*) as count, 
          COALESCE(SUM(total_tokens), 0) as total_tokens, 
          COALESCE(ROUND(AVG(duration_ms)), 0) as avg_duration_ms, 
          COUNT(*) FILTER (WHERE status = 'ERROR') as error_count 
        FROM ai_audit_logs 
        ${dateWhereClause}
        GROUP BY operation 
        ORDER BY count DESC
      `, dateParams);

      // By model
      const { rows: byModel } = await query(`
        SELECT 
          model, 
          COUNT(*) as count, 
          COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
          COALESCE(SUM(completion_tokens), 0) as completion_tokens,
          COALESCE(SUM(total_tokens), 0) as total_tokens, 
          COALESCE(ROUND(AVG(duration_ms)), 0) as avg_duration_ms, 
          COUNT(*) FILTER (WHERE status = 'ERROR') as error_count 
        FROM ai_audit_logs 
        ${dateWhereClause}
        GROUP BY model 
        ORDER BY count DESC
      `, dateParams);

      // By user
      const { rows: byUser } = await query(`
        SELECT 
          ai.user_id,
          COALESCE(u.name, 'Sistema / Inbound') as user_name,
          COALESCE(u.email, 'sistema@trips.local') as user_email,
          COUNT(*) as calls_count,
          COALESCE(SUM(ai.total_tokens), 0) as total_tokens
        FROM ai_audit_logs ai
        LEFT JOIN users u ON u.id = ai.user_id
        ${dateWhereClauseAliased}
        GROUP BY ai.user_id, u.name, u.email
        ORDER BY calls_count DESC
      `, dateParams);

      // 2. Query for individual logs (with date filters + operation + status + pagination)
      const logsConditions: string[] = [];
      const logsParams: any[] = [];
      let logsParamIdx = 1;

      if (startDate && startDate.trim()) {
        const parsed = Date.parse(startDate);
        if (!isNaN(parsed)) {
          logsConditions.push(`ai.created_at >= $${logsParamIdx++}::timestamptz`);
          logsParams.push(startDate.trim());
        }
      }

      if (endDate && endDate.trim()) {
        const parsed = Date.parse(endDate);
        if (!isNaN(parsed)) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(endDate.trim())) {
            logsConditions.push(`ai.created_at < ($${logsParamIdx++}::date + interval '1 day')`);
            logsParams.push(endDate.trim());
          } else {
            logsConditions.push(`ai.created_at <= $${logsParamIdx++}::timestamptz`);
            logsParams.push(endDate.trim());
          }
        }
      }

      if (operationFilter && operationFilter !== 'ALL') {
        logsConditions.push(`ai.operation = $${logsParamIdx++}`);
        logsParams.push(operationFilter);
      }
      if (statusFilter && statusFilter !== 'ALL') {
        logsConditions.push(`ai.status = $${logsParamIdx++}`);
        logsParams.push(statusFilter);
      }

      const logsWhereClause = logsConditions.length > 0 ? `WHERE ${logsConditions.join(' AND ')}` : '';

      // Count total matching logs for pagination
      const { rows: countRows } = await query(`
        SELECT COUNT(*) as count 
        FROM ai_audit_logs ai 
        ${logsWhereClause}
      `, logsParams);

      const totalRecords = Number(countRows[0]?.count || 0);
      const totalPages = Math.max(Math.ceil(totalRecords / limit), 1);

      // Fetch the page of logs
      const pageParams = [...logsParams];
      pageParams.push(limit);
      const limitParamIdx = logsParamIdx++;
      pageParams.push(offset);
      const offsetParamIdx = logsParamIdx++;

      const { rows: logs } = await query(`
        SELECT 
          ai.id, ai.operation, ai.model, ai.prompt_tokens, ai.completion_tokens,
          ai.total_tokens, ai.duration_ms, ai.status, ai.error_message, ai.created_at,
          ai.request_meta, ai.response_meta,
          u.name as user_name, u.email as user_email,
          t.title as trip_title, t.id as trip_id
        FROM ai_audit_logs ai
        LEFT JOIN users u ON u.id = ai.user_id
        LEFT JOIN trips t ON t.id = ai.trip_id
        ${logsWhereClause}
        ORDER BY ai.created_at DESC
        LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}
      `, pageParams);

      return res.json({
        summary: {
          totalCalls: Number(summary.total_calls || 0),
          successCalls: Number(summary.success_calls || 0),
          errorCalls: Number(summary.error_calls || 0),
          successRate: Number(successRate),
          totalPromptTokens: Number(summary.total_prompt_tokens || 0),
          totalCompletionTokens: Number(summary.total_completion_tokens || 0),
          totalTokens: Number(summary.total_tokens || 0),
          estimatedCostUsd: Number(finalCostUsd),
          costSource: isOfficial ? 'OPENAI_API' : 'LOCAL_ESTIMATE',
          officialCostUsd: isOfficial ? officialCosts.totalCostUsd : null,
          localEstimatedCostUsd: Number(localEstimatedCostUsd),
          keyId: isOfficial ? officialCosts.keyId : null,
          isKeyFiltered: isOfficial ? officialCosts.isKeyFiltered : false,
          orgTotalCostUsd: isOfficial ? officialCosts.orgTotalCostUsd : null,
          dailyCostBreakdown: isOfficial ? (officialCosts.dailyBreakdown || []) : [],
          avgDurationMs: Number(summary.avg_duration_ms || 0),
          p95DurationMs: Number(summary.p95_duration_ms || 0),
        },
        byOperation: byOperation.map((r: any) => ({
          operation: r.operation,
          count: Number(r.count),
          totalTokens: Number(r.total_tokens),
          avgDurationMs: Number(r.avg_duration_ms),
          errorCount: Number(r.error_count),
        })),
        byModel: byModel.map((r: any) => ({
          model: r.model,
          count: Number(r.count),
          promptTokens: Number(r.prompt_tokens),
          completionTokens: Number(r.completion_tokens),
          totalTokens: Number(r.total_tokens),
          avgDurationMs: Number(r.avg_duration_ms),
          errorCount: Number(r.error_count),
        })),
        byUser: byUser.map((r: any) => ({
          userId: r.user_id,
          userName: r.user_name,
          userEmail: r.user_email,
          callsCount: Number(r.calls_count),
          totalTokens: Number(r.total_tokens),
        })),
        recentLogs: logs,
        logs,
        pagination: {
          page,
          pageSize: limit,
          limit,
          offset,
          total: totalRecords,
          totalRecords,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
        filters: {
          startDate: startDate || null,
          endDate: endDate || null,
          operation: operationFilter || 'ALL',
          status: statusFilter || 'ALL',
        },
      });
    } catch (err: any) {
      logger.error('Erro ao obter auditoria de IA:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao carregar auditoria de IA' });
    }
  },

  // 3. User Statistics & Activity
  async getUsersStats(_req: Request, res: Response) {
    try {
      const { rows } = await query(`
        SELECT 
          u.id, u.name, u.email, u.role, u.status, u.avatar_url, u.last_login_at, u.created_at,
          (SELECT COUNT(*) FROM trips t WHERE t.created_by = u.id AND t.deleted_at IS NULL) as trips_created,
          (SELECT COUNT(*) FROM trip_members tm JOIN trips t ON t.id = tm.trip_id WHERE tm.user_id = u.id AND tm.role != 'OWNER' AND t.deleted_at IS NULL) as trips_participating,
          (SELECT COUNT(*) FROM ai_audit_logs ai WHERE ai.user_id = u.id) as ai_calls,
          (SELECT COALESCE(SUM(ai.total_tokens), 0) FROM ai_audit_logs ai WHERE ai.user_id = u.id) as ai_tokens,
          (SELECT COUNT(*) FROM documents doc WHERE doc.user_id = u.id AND doc.deleted_at IS NULL) as documents_uploaded,
          (SELECT COUNT(*) FROM expenses exp WHERE exp.paid_by_user_id = u.id) as expenses_created
        FROM users u
        ORDER BY u.created_at ASC
      `);

      return res.json({
        users: rows.map((r: any) => ({
          id: r.id,
          name: r.name,
          email: r.email,
          role: r.role,
          status: r.status,
          avatarUrl: r.avatar_url,
          lastLoginAt: r.last_login_at,
          createdAt: r.created_at,
          tripsCreated: Number(r.trips_created),
          tripsParticipating: Number(r.trips_participating),
          aiCalls: Number(r.ai_calls),
          aiTokens: Number(r.ai_tokens),
          documentsUploaded: Number(r.documents_uploaded),
          expensesCreated: Number(r.expenses_created),
        })),
      });
    } catch (err: any) {
      logger.error('Erro ao listar estatísticas de usuários:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao carregar estatísticas de usuários' });
    }
  },

  // 4. Group Trips & Travelers
  async getGroupTrips(req: Request, res: Response) {
    try {
      const filter = req.query.filter as string;

      const { rows } = await query(`
        SELECT 
          t.id, t.title, t.subtitle, t.destination_summary, t.primary_country, t.cities,
          t.start_date, t.end_date, t.status, t.cover_image_url, t.cover_image_thumb,
          t.share_enabled, t.default_currency, t.created_at,
          json_build_object(
            'id', u.id,
            'name', u.name,
            'email', u.email,
            'avatar_url', u.avatar_url
          ) as owner,
          (
            SELECT COALESCE(
              json_agg(
                json_build_object(
                  'user_id', tm.user_id,
                  'name', mu.name,
                  'email', mu.email,
                  'avatar_url', mu.avatar_url,
                  'role', tm.role,
                  'created_at', tm.created_at
                ) ORDER BY tm.created_at ASC
              ), '[]'::json
            )
            FROM trip_members tm
            JOIN users mu ON mu.id = tm.user_id
            WHERE tm.trip_id = t.id
          ) as members,
          (
            SELECT COALESCE(
              json_agg(
                json_build_object(
                  'id', tt.id,
                  'name', tt.display_name,
                  'user_id', tt.user_id,
                  'is_companion', (tt.user_id IS NULL)
                ) ORDER BY tt.created_at ASC
              ), '[]'::json
            )
            FROM trip_travelers tt
            WHERE tt.trip_id = t.id
          ) as travelers,
          (
            SELECT COALESCE(
              json_agg(
                json_build_object(
                  'id', ui.id,
                  'email', ui.email,
                  'role', ui.trip_role,
                  'status', ui.status,
                  'created_at', ui.created_at,
                  'expires_at', ui.expires_at
                )
              ), '[]'::json
            )
            FROM user_invitations ui
            WHERE ui.trip_id = t.id AND ui.status = 'PENDING'
          ) as pending_invitations,
          (SELECT COUNT(*) FROM trip_days td WHERE td.trip_id = t.id) as days_count,
          (SELECT COUNT(*) FROM itinerary_items ii WHERE ii.trip_id = t.id) as items_count,
          (SELECT COUNT(*) FROM documents doc WHERE doc.trip_id = t.id AND doc.deleted_at IS NULL) as documents_count,
          (SELECT COUNT(*) FROM expenses exp WHERE exp.trip_id = t.id) as expenses_count,
          (SELECT COALESCE(SUM(exp.amount_default_currency), 0) FROM expenses exp WHERE exp.trip_id = t.id) as total_expenses_amount,
          (SELECT COUNT(*) FROM transport_reservations tr WHERE tr.trip_id = t.id) as transports_count,
          (SELECT COUNT(*) FROM hotel_reservations hr WHERE hr.trip_id = t.id) as hotels_count
        FROM trips t
        LEFT JOIN users u ON u.id = t.created_by
        WHERE t.deleted_at IS NULL
        ORDER BY t.start_date DESC NULLS LAST, t.created_at DESC
      `);

      const formatted = rows.map((r: any) => {
        const membersList = Array.isArray(r.members) ? r.members : [];
        const travelersList = Array.isArray(r.travelers) ? r.travelers : [];
        const isGroupTrip = membersList.length > 1 || travelersList.length > 1;

        return {
          id: r.id,
          title: r.title,
          subtitle: r.subtitle,
          destinationSummary: r.destination_summary,
          primaryCountry: r.primary_country,
          cities: Array.isArray(r.cities) ? r.cities : [],
          startDate: r.start_date,
          endDate: r.end_date,
          status: r.status,
          coverImageUrl: r.cover_image_url || r.cover_image_thumb,
          shareEnabled: r.share_enabled,
          defaultCurrency: r.default_currency,
          createdAt: r.created_at,
          owner: r.owner,
          members: membersList,
          travelers: travelersList,
          pendingInvitations: Array.isArray(r.pending_invitations) ? r.pending_invitations : [],
          isGroupTrip,
          counts: {
            days: Number(r.days_count),
            items: Number(r.items_count),
            documents: Number(r.documents_count),
            expenses: Number(r.expenses_count),
            transports: Number(r.transports_count),
            hotels: Number(r.hotels_count),
          },
          totalExpensesAmount: Number(r.total_expenses_amount),
        };
      });

      let filtered = formatted;
      if (filter === 'group') {
        filtered = formatted.filter((t: any) => t.isGroupTrip);
      } else if (filter === 'solo') {
        filtered = formatted.filter((t: any) => !t.isGroupTrip);
      }

      return res.json({ trips: filtered });
    } catch (err: any) {
      logger.error('Erro ao listar viagens e grupos:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao carregar viagens em grupo' });
    }
  },

  // 5. Popular Cities & Destinations
  async getDestinationsStats(_req: Request, res: Response) {
    try {
      const { rows: cityRows } = await query(`
        SELECT 
          COALESCE(NULLIF(TRIM(td.base_location), ''), 'Não especificado') as city,
          COUNT(DISTINCT td.trip_id) as trips_count,
          COUNT(td.id) as days_count
        FROM trip_days td
        JOIN trips t ON t.id = td.trip_id AND t.deleted_at IS NULL
        GROUP BY city
        ORDER BY days_count DESC
        LIMIT 25
      `);

      const { rows: allTrips } = await query(`
        SELECT id, title, destination_summary, cities, primary_country, status
        FROM trips
        WHERE deleted_at IS NULL
      `);

      const countryMap: Record<string, { tripsCount: number; planningTrips: number; completedTrips: number }> = {};

      for (const trip of allTrips) {
        const country = trip.primary_country?.trim() || resolveCountry(trip) || 'Não informado';
        if (!countryMap[country]) {
          countryMap[country] = { tripsCount: 0, planningTrips: 0, completedTrips: 0 };
        }
        countryMap[country].tripsCount++;
        if (trip.status === 'PLANNING') countryMap[country].planningTrips++;
        if (trip.status === 'COMPLETED') countryMap[country].completedTrips++;

        // Auto-heal opportunistically in database if country wasn't persisted
        if (!trip.primary_country && country !== 'Não informado') {
          query('UPDATE trips SET primary_country = $1 WHERE id = $2', [country, trip.id]).catch(() => {});
        }
      }

      const countries = Object.entries(countryMap)
        .map(([country, data]) => ({
          country,
          tripsCount: data.tripsCount,
          planningTrips: data.planningTrips,
          completedTrips: data.completedTrips,
        }))
        .sort((a, b) => b.tripsCount - a.tripsCount);

      return res.json({
        cities: cityRows.map((r: any) => ({
          city: r.city,
          tripsCount: Number(r.trips_count),
          daysCount: Number(r.days_count),
        })),
        countries,
      });
    } catch (err: any) {
      logger.error('Erro ao obter estatísticas de destinos:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao carregar estatísticas de cidades e destinos' });
    }
  },
};
