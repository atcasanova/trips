import { Request, Response } from 'express';
import { query } from '../db/pool.js';
import { logger } from '../utils/logger.js';

interface TravelerBalance {
  travelerId: string;
  name: string;
  paid: number;
  owed: number;
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
                COALESCE(tt.display_name, u.name, 'Viajante') as paid_by_name,
                COALESCE(e.paid_by_traveler_id, tt.id) as traveler_id
         FROM expenses e
         LEFT JOIN trip_travelers tt ON e.paid_by_traveler_id = tt.id
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

        // Traveler category breakdown
        const payerId = exp.paid_by_traveler_id || exp.traveler_id;
        if (payerId) {
          if (!categoryBreakdown[curr].byTraveler[payerId]) {
            categoryBreakdown[curr].byTraveler[payerId] = {};
          }
          categoryBreakdown[curr].byTraveler[payerId][cat] =
            (categoryBreakdown[curr].byTraveler[payerId][cat] || 0) + amt;
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

      // Compute net balances & settlements per currency
      const balancesByCurrency: Record<string, TravelerBalance[]> = {};
      const settlementsByCurrency: Record<string, Settlement[]> = {};

      for (const curr of Array.from(currencies)) {
        const currBalances = Object.values(balancesMap[curr] || {}).map((b) => ({
          ...b,
          paid: Math.round(b.paid * 100) / 100,
          owed: Math.round(b.owed * 100) / 100,
          netBalance: Math.round((b.paid - b.owed) * 100) / 100,
        }));

        balancesByCurrency[curr] = currBalances;
        settlementsByCurrency[curr] = calculateSettlements(currBalances);
      }

      return res.json({
        expenses,
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
};
