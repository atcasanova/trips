import { Request, Response } from 'express';
import { query } from '../db/pool.js';
import { logger } from '../utils/logger.js';

interface TravelerBalance {
  travelerId: string;
  name: string;
  paid: number;
  owed: number;
  transfersSent: number;
  transfersReceived: number;
  netBalance: number;
}

interface Settlement {
  fromTravelerId: string;
  fromName: string;
  toTravelerId: string;
  toName: string;
  amount: number;
}

/**
 * Algoritmo de normalização e liquidação de dívidas (Splitwise / Tricount)
 * Minimiza o número de transações entre devedores e credores
 */
function calculateSettlements(balances: TravelerBalance[]): Settlement[] {
  // Devedores (saldo negativo: devem pagar)
  const debtors = balances
    .filter((b) => b.netBalance < -0.01)
    .map((b) => ({ ...b, remaining: Math.abs(b.netBalance) }))
    .sort((a, b) => b.remaining - a.remaining);

  // Credores (saldo positivo: devem receber)
  const creditors = balances
    .filter((b) => b.netBalance > 0.01)
    .map((b) => ({ ...b, remaining: b.netBalance }))
    .sort((a, b) => b.remaining - a.remaining);

  const settlements: Settlement[] = [];

  let d = 0;
  let c = 0;

  while (d < debtors.length && c < creditors.length) {
    const debtor = debtors[d];
    const creditor = creditors[c];
    const payment = Math.min(debtor.remaining, creditor.remaining);

    if (payment > 0.01) {
      settlements.push({
        fromTravelerId: debtor.travelerId,
        fromName: debtor.name,
        toTravelerId: creditor.travelerId,
        toName: creditor.name,
        amount: Math.round(payment * 100) / 100,
      });
    }

    debtor.remaining -= payment;
    creditor.remaining -= payment;

    if (debtor.remaining < 0.01) d++;
    if (creditor.remaining < 0.01) c++;
  }

  return settlements;
}

export const expenseController = {
  // 1. List expenses with settlements and category breakdown
  async listExpenses(req: Request, res: Response) {
    const { tripId } = req.params;

    try {
      // 1. Get all travelers for this trip
      const { rows: travelers } = await query(
        `SELECT id, user_id, display_name, role, email
         FROM trip_travelers
         WHERE trip_id = $1
         ORDER BY display_name ASC`,
        [tripId]
      );

      // 2. Get all expenses
      const { rows: expenses } = await query(
        `SELECT e.*,
                COALESCE(tt.display_name, tt_user.display_name, u.name, 'Viajante') as paid_by_name,
                COALESCE(e.paid_by_traveler_id, tt_user.id) as paid_by_traveler_id,
                COALESCE(e.paid_by_traveler_id, tt_user.id) as traveler_id
         FROM expenses e
         LEFT JOIN trip_travelers tt ON e.paid_by_traveler_id = tt.id
         LEFT JOIN trip_travelers tt_user ON (e.paid_by_user_id IS NOT NULL AND tt_user.trip_id = e.trip_id AND tt_user.user_id = e.paid_by_user_id)
         LEFT JOIN users u ON e.paid_by_user_id = u.id
         WHERE e.trip_id = $1
         ORDER BY e.date DESC, e.created_at DESC`,
        [tripId]
      );

      // 3. Get all splits
      const { rows: allSplits } = await query(
        `SELECT es.*, tt.display_name as traveler_name
         FROM expense_splits es
         JOIN expenses e ON es.expense_id = e.id
         JOIN trip_travelers tt ON es.traveler_id = tt.id
         WHERE e.trip_id = $1`,
        [tripId]
      );

      const splitsByExpense: Record<string, any[]> = {};
      for (const sp of allSplits) {
        if (!splitsByExpense[sp.expense_id]) splitsByExpense[sp.expense_id] = [];
        splitsByExpense[sp.expense_id].push(sp);
      }

      // Attach splits to expenses
      for (const exp of expenses) {
        exp.splits = splitsByExpense[exp.id] || [];
      }

      // 3.5. Get all transfers between travelers
      const { rows: transfers } = await query(
        `SELECT et.*,
                ft.display_name as from_name,
                tt.display_name as to_name
         FROM expense_transfers et
         JOIN trip_travelers ft ON et.from_traveler_id = ft.id
         JOIN trip_travelers tt ON et.to_traveler_id = tt.id
         WHERE et.trip_id = $1
         ORDER BY et.date DESC, et.created_at DESC`,
        [tripId]
      );

      // 4. Calculate totals, shared totals, personal totals
      const totalsByCurrency: Record<string, number> = {};
      const sharedTotalsByCurrency: Record<string, number> = {};
      const personalTotalsByCurrency: Record<string, number> = {};

      // Category breakdown: per currency, per category, and per traveler
      const categoryBreakdown: Record<
        string,
        {
          total: Record<string, number>;
          byTraveler: Record<string, Record<string, number>>;
        }
      > = {};

      // Balances per currency: { [currency]: { [travelerId]: TravelerBalance } }
      const balancesMap: Record<string, Record<string, TravelerBalance>> = {};

      const currencies = new Set<string>();
      const defaultOwner = travelers.find((t) => t.role === 'OWNER') || travelers[0];

      for (const exp of expenses) {
        const curr = exp.currency || 'BRL';
        const amt = parseFloat(exp.amount) || 0;
        currencies.add(curr);

        totalsByCurrency[curr] = (totalsByCurrency[curr] || 0) + amt;

        if (exp.is_shared) {
          sharedTotalsByCurrency[curr] = (sharedTotalsByCurrency[curr] || 0) + amt;
        } else {
          personalTotalsByCurrency[curr] = (personalTotalsByCurrency[curr] || 0) + amt;
        }

        // Initialize category breakdown
        if (!categoryBreakdown[curr]) {
          categoryBreakdown[curr] = { total: {}, byTraveler: {} };
        }
        const cat = exp.category || 'OTHER';
        categoryBreakdown[curr].total[cat] = (categoryBreakdown[curr].total[cat] || 0) + amt;

        // Determine payer of the transaction
        let payerId = exp.paid_by_traveler_id || exp.traveler_id;
        if (!payerId && exp.paid_by_user_id) {
          const userTr = travelers.find((t) => t.user_id === exp.paid_by_user_id);
          if (userTr) payerId = userTr.id;
        }
        if (!payerId && defaultOwner) {
          payerId = defaultOwner.id;
        }

        // Traveler category breakdown: personal expenses belong to the payer/owner,
        // while shared expenses are distributed among travelers according to their splits/quotas
        if (!exp.is_shared) {

          if (payerId) {
            if (!categoryBreakdown[curr].byTraveler[payerId]) {
              categoryBreakdown[curr].byTraveler[payerId] = {};
            }
            categoryBreakdown[curr].byTraveler[payerId][cat] =
              (categoryBreakdown[curr].byTraveler[payerId][cat] || 0) + amt;
          }
        } else {
          if (exp.splits && exp.splits.length > 0) {
            for (const sp of exp.splits) {
              const spAmt = parseFloat(sp.amount) || 0;
              const spTravelerId = sp.traveler_id;
              if (spTravelerId) {
                if (!categoryBreakdown[curr].byTraveler[spTravelerId]) {
                  categoryBreakdown[curr].byTraveler[spTravelerId] = {};
                }
                categoryBreakdown[curr].byTraveler[spTravelerId][cat] =
                  (categoryBreakdown[curr].byTraveler[spTravelerId][cat] || 0) + spAmt;
              }
            }
          } else {
            const numTravelers = travelers.length || 1;
            const equalShare = amt / numTravelers;
            for (const t of travelers) {
              if (!categoryBreakdown[curr].byTraveler[t.id]) {
                categoryBreakdown[curr].byTraveler[t.id] = {};
              }
              categoryBreakdown[curr].byTraveler[t.id][cat] =
                (categoryBreakdown[curr].byTraveler[t.id][cat] || 0) + equalShare;
            }
          }
        }

        // Initialize balances for currency
        if (!balancesMap[curr]) {
          balancesMap[curr] = {};
          for (const t of travelers) {
            balancesMap[curr][t.id] = {
              travelerId: t.id,
              name: t.display_name,
              paid: 0,
              owed: 0,
              transfersSent: 0,
              transfersReceived: 0,
              netBalance: 0,
            };
          }
        }

        // Calculate balances for shared expenses only
        if (exp.is_shared) {
          // Payer gets credit
          if (payerId && balancesMap[curr][payerId]) {
            balancesMap[curr][payerId].paid += amt;
          }

          // Splits get debited
          if (exp.splits && exp.splits.length > 0) {
            for (const sp of exp.splits) {
              const spAmt = parseFloat(sp.amount) || 0;
              if (balancesMap[curr][sp.traveler_id]) {
                balancesMap[curr][sp.traveler_id].owed += spAmt;
              }
            }
          } else {
            // Default equal split among all travelers
            const numTravelers = travelers.length || 1;
            const equalShare = amt / numTravelers;
            for (const t of travelers) {
              if (balancesMap[curr][t.id]) {
                balancesMap[curr][t.id].owed += equalShare;
              }
            }
          }
        }
      }

      // Process transfers into balances (direct payments between travelers)
      for (const tr of transfers) {
        const curr = tr.currency || 'BRL';
        const amt = parseFloat(tr.amount) || 0;
        currencies.add(curr);

        if (!balancesMap[curr]) {
          balancesMap[curr] = {};
          for (const t of travelers) {
            balancesMap[curr][t.id] = {
              travelerId: t.id,
              name: t.display_name,
              paid: 0,
              owed: 0,
              transfersSent: 0,
              transfersReceived: 0,
              netBalance: 0,
            };
          }
        }

        if (balancesMap[curr][tr.from_traveler_id]) {
          balancesMap[curr][tr.from_traveler_id].transfersSent += amt;
        }
        if (balancesMap[curr][tr.to_traveler_id]) {
          balancesMap[curr][tr.to_traveler_id].transfersReceived += amt;
        }
      }

      // Compute net balances & settlements per currency
      const balancesByCurrency: Record<string, TravelerBalance[]> = {};
      const settlementsByCurrency: Record<string, Settlement[]> = {};

      for (const curr of Array.from(currencies)) {
        const currBalances = Object.values(balancesMap[curr] || {}).map((b) => ({
          ...b,
          paid: Math.round(b.paid * 100) / 100,
          owed: Math.round(b.owed * 100) / 100,
          transfersSent: Math.round(b.transfersSent * 100) / 100,
          transfersReceived: Math.round(b.transfersReceived * 100) / 100,
          netBalance: Math.round(((b.paid - b.owed) + b.transfersSent - b.transfersReceived) * 100) / 100,
        }));

        balancesByCurrency[curr] = currBalances;
        settlementsByCurrency[curr] = calculateSettlements(currBalances);
      }

      return res.json({
        expenses,
        transfers,
        travelers,
        totalsByCurrency,
        sharedTotalsByCurrency,
        personalTotalsByCurrency,
        balancesByCurrency,
        settlementsByCurrency,
        categoryBreakdown,
      });
    } catch (err: any) {
      logger.error('Erro ao listar despesas:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao listar despesas' });
    }
  },

  // 2. Create expense with splits
  async createExpense(req: Request, res: Response) {
    const { tripId } = req.params;
    const {
      trip_day_id,
      category,
      description,
      amount,
      currency = 'BRL',
      exchange_rate,
      amount_default_currency,
      payment_method = 'CREDIT_CARD',
      date,
      document_id,
      notes,
      is_shared = true,
      paid_by_traveler_id,
      split_type = 'EQUAL',
      splits,
    } = req.body;

    if (!description || amount === undefined || amount === null) {
      return res.status(400).json({ error: 'Descrição e valor são obrigatórios' });
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'Valor inválido' });
    }

    try {
      // 1. Resolve paid_by_traveler_id
      let finalPayerId = paid_by_traveler_id;
      if (!finalPayerId) {
        // Try to match current logged-in user
        const { rows: tRows } = await query(
          'SELECT id FROM trip_travelers WHERE trip_id = $1 AND user_id = $2',
          [tripId, req.user?.id]
        );
        if (tRows.length > 0) {
          finalPayerId = tRows[0].id;
        } else {
          // Default to trip owner traveler
          const { rows: ownerRows } = await query(
            "SELECT id FROM trip_travelers WHERE trip_id = $1 AND role = 'OWNER' LIMIT 1",
            [tripId]
          );
          if (ownerRows.length > 0) finalPayerId = ownerRows[0].id;
        }
      }

      // 2. Insert expense
      const { rows } = await query(
        `INSERT INTO expenses (
          trip_id, trip_day_id, category, description, amount, currency,
          exchange_rate, amount_default_currency, paid_by_user_id, paid_by_traveler_id,
          payment_method, date, document_id, notes, is_shared, split_type
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING *`,
        [
          tripId,
          trip_day_id || null,
          category || 'FOOD',
          description.trim(),
          numAmount,
          currency,
          exchange_rate || 1.0,
          amount_default_currency || numAmount,
          req.user?.id || null,
          finalPayerId || null,
          payment_method,
          date || new Date().toISOString().split('T')[0],
          document_id || null,
          notes || null,
          Boolean(is_shared),
          split_type,
        ]
      );

      const expense = rows[0];

      // 3. Create splits
      if (Boolean(is_shared)) {
        if (Array.isArray(splits) && splits.length > 0) {
          for (const sp of splits) {
            await query(
              `INSERT INTO expense_splits (expense_id, traveler_id, amount, percentage)
               VALUES ($1, $2, $3, $4)`,
              [expense.id, sp.traveler_id, sp.amount, sp.percentage || null]
            );
          }
        } else {
          // Automatic equal split among all travelers
          const { rows: travelers } = await query(
            'SELECT id FROM trip_travelers WHERE trip_id = $1',
            [tripId]
          );
          if (travelers.length > 0) {
            const splitAmount = Math.round((numAmount / travelers.length) * 100) / 100;
            let sumSoFar = 0;

            for (let i = 0; i < travelers.length; i++) {
              // Adjust cents on the last traveler
              const amtToInsert =
                i === travelers.length - 1
                  ? Math.round((numAmount - sumSoFar) * 100) / 100
                  : splitAmount;
              sumSoFar += amtToInsert;

              await query(
                `INSERT INTO expense_splits (expense_id, traveler_id, amount, percentage)
                 VALUES ($1, $2, $3, $4)`,
                [expense.id, travelers[i].id, amtToInsert, Math.round((100 / travelers.length) * 100) / 100]
              );
            }
          }
        }
      } else {
        // Individual expense: single split for the payer
        if (finalPayerId) {
          await query(
            `INSERT INTO expense_splits (expense_id, traveler_id, amount, percentage)
             VALUES ($1, $2, $3, $4)`,
            [expense.id, finalPayerId, numAmount, 100.0]
          );
        }
      }

      logger.info('Despesa cadastrada com sucesso', {
        expenseId: expense.id,
        tripId,
        amount: numAmount,
        currency,
        is_shared,
      });

      return res.status(201).json({ expense });
    } catch (err: any) {
      logger.error('Erro ao cadastrar despesa:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao cadastrar despesa' });
    }
  },

  // 3. Update expense
  async updateExpense(req: Request, res: Response) {
    const { tripId, expenseId } = req.params;
    const {
      description,
      amount,
      currency,
      category,
      payment_method,
      date,
      is_shared,
      paid_by_traveler_id,
      split_type,
      splits,
      notes,
    } = req.body;

    try {
      const updates: string[] = [];
      const values: any[] = [];
      let idx = 1;

      if (description !== undefined) {
        updates.push(`description = $${idx++}`);
        values.push(description.trim());
      }
      if (amount !== undefined) {
        updates.push(`amount = $${idx++}`);
        values.push(parseFloat(amount));
      }
      if (currency !== undefined) {
        updates.push(`currency = $${idx++}`);
        values.push(currency);
      }
      if (category !== undefined) {
        updates.push(`category = $${idx++}`);
        values.push(category);
      }
      if (payment_method !== undefined) {
        updates.push(`payment_method = $${idx++}`);
        values.push(payment_method);
      }
      if (date !== undefined) {
        updates.push(`date = $${idx++}`);
        values.push(date);
      }
      if (is_shared !== undefined) {
        updates.push(`is_shared = $${idx++}`);
        values.push(Boolean(is_shared));
      }
      if (paid_by_traveler_id !== undefined) {
        updates.push(`paid_by_traveler_id = $${idx++}`);
        values.push(paid_by_traveler_id);
      }
      if (split_type !== undefined) {
        updates.push(`split_type = $${idx++}`);
        values.push(split_type);
      }
      if (notes !== undefined) {
        updates.push(`notes = $${idx++}`);
        values.push(notes);
      }

      if (updates.length > 0) {
        updates.push(`updated_at = NOW()`);
        values.push(expenseId, tripId);
        const sql = `UPDATE expenses SET ${updates.join(', ')} WHERE id = $${idx++} AND trip_id = $${idx} RETURNING *`;
        await query(sql, values);
      }

      // Update splits if provided
      if (Array.isArray(splits)) {
        await query('DELETE FROM expense_splits WHERE expense_id = $1', [expenseId]);
        for (const sp of splits) {
          await query(
            `INSERT INTO expense_splits (expense_id, traveler_id, amount, percentage)
             VALUES ($1, $2, $3, $4)`,
            [expenseId, sp.traveler_id, sp.amount, sp.percentage || null]
          );
        }
      }

      return res.json({ message: 'Despesa atualizada com sucesso' });
    } catch (err: any) {
      logger.error('Erro ao atualizar despesa:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao atualizar despesa' });
    }
  },

  // 4. Delete expense
  async deleteExpense(req: Request, res: Response) {
    const { tripId, expenseId } = req.params;
    try {
      await query('DELETE FROM expenses WHERE id = $1 AND trip_id = $2', [expenseId, tripId]);
      return res.json({ message: 'Despesa removida com sucesso' });
    } catch (err: any) {
      return res.status(500).json({ error: 'Erro ao remover despesa' });
    }
  },

  // 5. Create transfer between travelers
  async createTransfer(req: Request, res: Response) {
    const { tripId } = req.params;
    const {
      from_traveler_id,
      to_traveler_id,
      amount,
      currency = 'BRL',
      date,
      payment_method = 'PIX',
      notes,
    } = req.body;

    if (!from_traveler_id || !to_traveler_id) {
      return res.status(400).json({ error: 'Participante de origem e destino são obrigatórios' });
    }

    if (from_traveler_id === to_traveler_id) {
      return res.status(400).json({ error: 'A transferência deve ser feita entre participantes diferentes' });
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'Valor da transferência deve ser maior que zero' });
    }

    try {
      // Verify both travelers belong to this trip
      const { rows: travelers } = await query(
        `SELECT id, display_name FROM trip_travelers WHERE trip_id = $1 AND id IN ($2, $3)`,
        [tripId, from_traveler_id, to_traveler_id]
      );

      if (travelers.length < 2) {
        return res.status(400).json({ error: 'Um ou ambos os participantes não pertencem a esta viagem' });
      }

      const { rows } = await query(
        `INSERT INTO expense_transfers (
          trip_id, from_traveler_id, to_traveler_id, amount, currency,
          date, payment_method, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          tripId,
          from_traveler_id,
          to_traveler_id,
          numAmount,
          currency,
          date || new Date().toISOString().split('T')[0],
          payment_method || 'PIX',
          notes ? notes.trim() : null,
          req.user?.id || null,
        ]
      );

      const transfer = rows[0];

      // Audit log
      await query(
        `INSERT INTO audit_logs (user_id, trip_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'EXPENSE_TRANSFER_CREATED', 'EXPENSE_TRANSFER', $3, $4)`,
        [
          req.user?.id || null,
          tripId,
          transfer.id,
          JSON.stringify({
            from_traveler_id,
            to_traveler_id,
            amount: numAmount,
            currency,
            payment_method,
          }),
        ]
      );

      logger.info('Transferência entre participantes registrada com sucesso', {
        transferId: transfer.id,
        tripId,
        from: from_traveler_id,
        to: to_traveler_id,
        amount: numAmount,
        currency,
      });

      return res.status(201).json({ transfer });
    } catch (err: any) {
      logger.error('Erro ao registrar transferência:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao registrar transferência' });
    }
  },

  // 6. Update transfer
  async updateTransfer(req: Request, res: Response) {
    const { tripId, transferId } = req.params;
    const {
      from_traveler_id,
      to_traveler_id,
      amount,
      currency,
      date,
      payment_method,
      notes,
    } = req.body;

    try {
      const updates: string[] = [];
      const values: any[] = [];
      let idx = 1;

      if (from_traveler_id && to_traveler_id && from_traveler_id === to_traveler_id) {
        return res.status(400).json({ error: 'A transferência deve ser feita entre participantes diferentes' });
      }

      if (from_traveler_id !== undefined) {
        updates.push(`from_traveler_id = $${idx++}`);
        values.push(from_traveler_id);
      }
      if (to_traveler_id !== undefined) {
        updates.push(`to_traveler_id = $${idx++}`);
        values.push(to_traveler_id);
      }
      if (amount !== undefined) {
        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
          return res.status(400).json({ error: 'Valor da transferência deve ser maior que zero' });
        }
        updates.push(`amount = $${idx++}`);
        values.push(numAmount);
      }
      if (currency !== undefined) {
        updates.push(`currency = $${idx++}`);
        values.push(currency);
      }
      if (date !== undefined) {
        updates.push(`date = $${idx++}`);
        values.push(date);
      }
      if (payment_method !== undefined) {
        updates.push(`payment_method = $${idx++}`);
        values.push(payment_method);
      }
      if (notes !== undefined) {
        updates.push(`notes = $${idx++}`);
        values.push(notes ? notes.trim() : null);
      }

      if (updates.length > 0) {
        updates.push(`updated_at = NOW()`);
        values.push(transferId, tripId);
        const sql = `UPDATE expense_transfers SET ${updates.join(', ')} WHERE id = $${idx++} AND trip_id = $${idx} RETURNING *`;
        const { rows } = await query(sql, values);
        if (rows.length === 0) {
          return res.status(404).json({ error: 'Transferência não encontrada' });
        }
      }

      return res.json({ message: 'Transferência atualizada com sucesso' });
    } catch (err: any) {
      logger.error('Erro ao atualizar transferência:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao atualizar transferência' });
    }
  },

  // 7. Delete transfer
  async deleteTransfer(req: Request, res: Response) {
    const { tripId, transferId } = req.params;
    try {
      const { rowCount } = await query(
        'DELETE FROM expense_transfers WHERE id = $1 AND trip_id = $2',
        [transferId, tripId]
      );
      if (rowCount === 0) {
        return res.status(404).json({ error: 'Transferência não encontrada' });
      }
      return res.json({ message: 'Transferência removida com sucesso' });
    } catch (err: any) {
      logger.error('Erro ao remover transferência:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao remover transferência' });
    }
  },
};
