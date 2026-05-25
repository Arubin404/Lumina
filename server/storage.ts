import { 
  type User, 
  type InsertUser, 
  type Income, 
  type InsertIncome,
  type UpdateIncome,
  type Exit,
  type InsertExit,
  type Invoice,
  type InsertInvoice,
  type ChangeRecord,
  type CashBox,
  type CashExchange,
  type InsertCashExchange,
  type CashAdjustment,
  type Configuration,
  type UpdateConfig,
  type CompleteExit,
  type AddToExit,
  type Denomination,
  type UpdateExit
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, sql, and, gte, lt } from "drizzle-orm";
import * as schema from "@shared/schema";

interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getCashBox(): Promise<CashBox>;
  updateCashBox(denominations: Denomination): Promise<CashBox>;
  
  getIncomes(): Promise<Income[]>;
  createIncome(income: InsertIncome): Promise<Income>;
  updateIncome(id: string, income: UpdateIncome): Promise<Income>;
  deleteIncome(id: string): Promise<void>;
  
  getExits(): Promise<Exit[]>;
  getPendingExits(): Promise<Exit[]>;
  getCompletedExits(): Promise<Exit[]>;
  createExit(exit: InsertExit): Promise<Exit>;
  updateExit(id: string, exit: UpdateExit): Promise<Exit>;
  completeExit(completion: CompleteExit): Promise<Exit>;
  addToExit(data: AddToExit): Promise<Exit>;
  deleteExit(id: string): Promise<void>;
  
  getInvoicesByExitId(exitId: string): Promise<Invoice[]>;
  getChangeByExitId(exitId: string): Promise<ChangeRecord[]>;
  
  getCashExchanges(): Promise<CashExchange[]>;
  createCashExchange(exchange: InsertCashExchange): Promise<CashExchange>;
  
  getCashAdjustments(): Promise<CashAdjustment[]>;
  
  getConfiguration(): Promise<Configuration>;
  updateConfiguration(config: UpdateConfig): Promise<Configuration>;
  getNextVoucherNumber(): Promise<number>;
  syncNextVoucherNumber(): Promise<number>;
  
  getMovementsByMonth(year: number, month: number): Promise<{ movements: any[]; previousBalance: number; }>;

  getAuditLogs(entityId: string): Promise<schema.AuditLog[]>;
  getClosedPeriods(): Promise<schema.ClosedPeriod[]>;
  closePeriod(year: number, month: number): Promise<schema.ClosedPeriod>;
  isPeriodClosed(date: Date): Promise<boolean>;
}

class SqliteStorage implements IStorage {
  constructor() {
    this.initializeDefaults().catch(console.error);
  }

  private async initializeDefaults() {
    const box = await db.select().from(schema.cashBox).limit(1);
    if (!box || box.length === 0) {
      await db.insert(schema.cashBox).values({
        denominations: {
          bills: { hundred: 0, fifty: 0, twenty: 0, ten: 0, five: 0, one: 0 },
          coins: { one: 0, fifty_cents: 0, quarter: 0, dime: 0, nickel: 0, penny: 0 }
        },
        totalAmount: 0,
        lastUpdated: new Date()
      });
    }

    const config = await db.select().from(schema.configuration).limit(1);
    if (!config || config.length === 0) {
      await db.insert(schema.configuration).values({
        nextVoucherNumber: 1,
        lastUpdated: new Date()
      });
    }

    // Always synchronize the voucher number sequence with actual database records on startup
    await this.syncNextVoucherNumber();
  }

  // ─── HELPERS ─────────────────────────────────────────────
  
  private calculateTotal(denominations: Denomination): number {
    const { bills, coins } = denominations;
    // Values in cents to ensure absolute integer precision
    return (
      (bills.hundred || 0) * 10000 + (bills.fifty || 0) * 5000 + (bills.twenty || 0) * 2000 + 
      (bills.ten || 0) * 1000 + (bills.five || 0) * 500 + (bills.one || 0) * 100 +
      (coins.one || 0) * 100 + (coins.fifty_cents || 0) * 50 + (coins.quarter || 0) * 25 +
      (coins.dime || 0) * 10 + (coins.nickel || 0) * 5 + (coins.penny || 0) * 1
    );
  }

  /** Strict subtraction: fails if any specific denomination count becomes negative.
   *  Reflects the physical reality of the cash box. */
  private strictSubtract(current: Denomination, toSubtract: Denomination): Denomination {
    const result: Denomination = {
      bills: {
        hundred: (current.bills.hundred || 0) - (toSubtract.bills.hundred || 0),
        fifty:   (current.bills.fifty || 0)   - (toSubtract.bills.fifty || 0),
        twenty:  (current.bills.twenty || 0)  - (toSubtract.bills.twenty || 0),
        ten:     (current.bills.ten || 0)     - (toSubtract.bills.ten || 0),
        five:    (current.bills.five || 0)    - (toSubtract.bills.five || 0),
        one:     (current.bills.one || 0)     - (toSubtract.bills.one || 0)
      },
      coins: {
        one:         (current.coins.one || 0)         - (toSubtract.coins.one || 0),
        fifty_cents: (current.coins.fifty_cents || 0) - (toSubtract.coins.fifty_cents || 0),
        quarter:     (current.coins.quarter || 0)     - (toSubtract.coins.quarter || 0),
        dime:        (current.coins.dime || 0)        - (toSubtract.coins.dime || 0),
        nickel:      (current.coins.nickel || 0)      - (toSubtract.coins.nickel || 0),
        penny:       (current.coins.penny || 0)       - (toSubtract.coins.penny || 0)
      }
    };

    const BILL_LABELS: Record<string, string> = {
      hundred: "100", fifty: "50", twenty: "20", ten: "10", five: "5", one: "1"
    };
    const COIN_LABELS: Record<string, string> = {
      one: "1", fifty_cents: "0.50", quarter: "0.25", dime: "0.10", nickel: "0.05", penny: "0.01"
    };

    // Check for negative counts in bills
    for (const [key, count] of Object.entries(result.bills)) {
      if (count < 0) {
        throw new Error(`Fondos insuficientes: no hay suficientes billetes de $${BILL_LABELS[key]} en la caja.`);
      }
    }
    // Check for negative counts in coins
    for (const [key, count] of Object.entries(result.coins)) {
      if (count < 0) {
        throw new Error(`Fondos insuficientes: no hay suficientes monedas de $${COIN_LABELS[key]} en la caja.`);
      }
    }

    return result;
  }

  private allocateNextVoucherNumber(tx: any): number {
    const [config] = tx.select().from(schema.configuration).limit(1).all();
    if (!config) throw new Error("Configuración no inicializada");

    // Always use global sequence to avoid collisions with unique constraints
    const voucher = config.nextVoucherNumber;
    tx.update(schema.configuration)
      .set({
        nextVoucherNumber: config.nextVoucherNumber + 1,
        lastUpdated: new Date()
      })
      .where(eq(schema.configuration.id, config.id))
      .run();

    return voucher;
  }

  private shiftVouchersForward(tx: any, startVoucherId: number) {
    // 1. Temporarily negate matching positive voucher_ids to avoid unique constraint violations
    tx.update(schema.incomes)
      .set({ voucherId: sql`(-voucher_id)` })
      .where(gte(schema.incomes.voucherId, startVoucherId))
      .run();

    tx.update(schema.invoices)
      .set({ voucherId: sql`(-voucher_id)` })
      .where(gte(schema.invoices.voucherId, startVoucherId))
      .run();

    tx.update(schema.exits)
      .set({ voucherId: sql`(-voucher_id)` })
      .where(gte(schema.exits.voucherId, startVoucherId))
      .run();

    // 2. Set them to positive incremented values (negative value * -1 + 1)
    tx.update(schema.incomes)
      .set({ voucherId: sql`(-voucher_id + 1)` })
      .where(lt(schema.incomes.voucherId, 0))
      .run();

    tx.update(schema.invoices)
      .set({ voucherId: sql`(-voucher_id + 1)` })
      .where(lt(schema.invoices.voucherId, 0))
      .run();

    tx.update(schema.exits)
      .set({ voucherId: sql`(-voucher_id + 1)` })
      .where(lt(schema.exits.voucherId, 0))
      .run();

    // 3. Ensure the next sequence in config is always larger than any shifted or manually set voucher ID
    const [config] = tx.select().from(schema.configuration).limit(1).all();
    if (config) {
      const currentNext = config.nextVoucherNumber;
      const proposedNext = Math.max(currentNext + 1, startVoucherId + 1);
      tx.update(schema.configuration)
        .set({ 
          nextVoucherNumber: proposedNext,
          lastUpdated: new Date()
        })
        .where(eq(schema.configuration.id, config.id))
        .run();
    }
  }

  private addDenominations(a: Denomination, b: Denomination): Denomination {
    return {
      bills: {
        hundred: (a.bills.hundred || 0) + (b.bills.hundred || 0),
        fifty:   (a.bills.fifty || 0)   + (b.bills.fifty || 0),
        twenty:  (a.bills.twenty || 0)  + (b.bills.twenty || 0),
        ten:     (a.bills.ten || 0)     + (b.bills.ten || 0),
        five:    (a.bills.five || 0)    + (b.bills.five || 0),
        one:     (a.bills.one || 0)     + (b.bills.one || 0)
      },
      coins: {
        one:         (a.coins.one || 0)         + (b.coins.one || 0),
        fifty_cents: (a.coins.fifty_cents || 0) + (b.coins.fifty_cents || 0),
        quarter:     (a.coins.quarter || 0)     + (b.coins.quarter || 0),
        dime:        (a.coins.dime || 0)        + (b.coins.dime || 0),
        nickel:      (a.coins.nickel || 0)      + (b.coins.nickel || 0),
        penny:       (a.coins.penny || 0)       + (b.coins.penny || 0)
      }
    };
  }

  // ─── USERS ───────────────────────────────────────────────

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(schema.users).values(insertUser).returning();
    return user;
  }

  // ─── CASHBOX ─────────────────────────────────────────────

  async getCashBox(): Promise<CashBox> {
    const [box] = await db.select().from(schema.cashBox).limit(1);
    return box;
  }

  async updateCashBox(denominations: Denomination): Promise<CashBox> {
    const totalAmount = this.calculateTotal(denominations);
    const box = await this.getCashBox();
    
    // Only create an adjustment record if denominations actually changed
    const previousTotal = box.totalAmount;
    const denomsChanged = JSON.stringify(box.denominations) !== JSON.stringify(denominations);
    
    if (denomsChanged) {
      const difference = totalAmount - previousTotal;
      await db.insert(schema.cashAdjustments).values({
        previousDenominations: box.denominations,
        newDenominations: denominations,
        previousTotal,
        newTotal: totalAmount,
        difference
      });
    }
    
    const [updated] = await db.update(schema.cashBox)
      .set({ denominations, totalAmount, lastUpdated: new Date() })
      .where(eq(schema.cashBox.id, box.id))
      .returning();
    return updated;
  }

  // ─── INCOMES ─────────────────────────────────────────────

  async getIncomes(): Promise<Income[]> {
    return await db.select().from(schema.incomes).orderBy(desc(schema.incomes.createdAt));
  }

  async createIncome(income: InsertIncome): Promise<Income> {
    return db.transaction((tx) => {
      const voucherId = this.allocateNextVoucherNumber(tx);
      const totalAmount = this.calculateTotal(income.denominations);

      const [newIncome] = tx.insert(schema.incomes).values({
        ...income,
        voucherId,
        totalAmount,
      }).returning().all();

      const [box] = tx.select().from(schema.cashBox).limit(1).all();
      const updatedDenom = this.addDenominations(box.denominations, income.denominations);
      tx.update(schema.cashBox)
        .set({ denominations: updatedDenom, totalAmount: this.calculateTotal(updatedDenom), lastUpdated: new Date() })
        .where(eq(schema.cashBox.id, box.id))
        .run();

      return newIncome;
    });
  }

  async updateIncome(id: string, newIncomeData: UpdateIncome): Promise<Income> {
    return db.transaction((tx) => {
      const [oldIncome] = tx.select().from(schema.incomes).where(eq(schema.incomes.id, id)).all();
      if (!oldIncome) throw new Error("Ingreso no encontrado");
      
      const [config] = tx.select().from(schema.configuration).limit(1).all();
      if (config.lockClosedPeriods) {
        const dOld = new Date(oldIncome.date);
        const closedOld = tx.select().from(schema.closedPeriods).where(and(eq(schema.closedPeriods.year, dOld.getFullYear()), eq(schema.closedPeriods.month, dOld.getMonth() + 1))).all();
        if (closedOld.length > 0) throw new Error("No se puede editar un registro de un mes que ya ha sido cerrado contablemente.");
        
        const dNew = new Date(newIncomeData.date);
        const closedNew = tx.select().from(schema.closedPeriods).where(and(eq(schema.closedPeriods.year, dNew.getFullYear()), eq(schema.closedPeriods.month, dNew.getMonth() + 1))).all();
        if (closedNew.length > 0) throw new Error("No se puede mover el registro a un mes que ya ha sido cerrado contablemente.");
      }

      const totalAmount = this.calculateTotal(newIncomeData.denominations);
      if (JSON.stringify(oldIncome.denominations) !== JSON.stringify(newIncomeData.denominations)) {
        const [box] = tx.select().from(schema.cashBox).limit(1).all();
        const afterRemoval = this.strictSubtract(box.denominations, oldIncome.denominations);
        const afterAddition = this.addDenominations(afterRemoval, newIncomeData.denominations);
        tx.update(schema.cashBox)
          .set({ denominations: afterAddition, totalAmount: this.calculateTotal(afterAddition), lastUpdated: new Date() })
          .where(eq(schema.cashBox.id, box.id))
          .run();
      }

      const oldVoucherId = oldIncome.voucherId;
      const newVoucherId = newIncomeData.voucherId;
      if (newVoucherId !== undefined && newVoucherId !== oldVoucherId) {
        this.shiftVouchersForward(tx, newVoucherId);
      }

      const [updatedIncome] = tx.update(schema.incomes)
        .set({
          detail: newIncomeData.detail,
          date: newIncomeData.date,
          denominations: newIncomeData.denominations,
          totalAmount,
          ...(newVoucherId !== undefined ? { voucherId: newVoucherId } : {}),
          editedAt: new Date()
        })
        .where(eq(schema.incomes.id, id))
        .returning().all();

      if (config.editHistory) {
        tx.insert(schema.auditLogs).values({
          entityId: id,
          entityType: 'income',
          action: 'edit',
          previousData: JSON.stringify(oldIncome),
          newData: JSON.stringify(updatedIncome)
        }).run();
      }

      return updatedIncome;
    });
  }

  async deleteIncome(id: string): Promise<void> {
    return db.transaction((tx) => {
      const [income] = tx.select().from(schema.incomes).where(eq(schema.incomes.id, id)).all();
      if (!income) throw new Error("Ingreso no encontrado");

      const [config] = tx.select().from(schema.configuration).limit(1).all();
      if (config.lockClosedPeriods) {
        const d = new Date(income.date);
        const closed = tx.select().from(schema.closedPeriods).where(and(eq(schema.closedPeriods.year, d.getFullYear()), eq(schema.closedPeriods.month, d.getMonth() + 1))).all();
        if (closed.length > 0) throw new Error("No se puede eliminar un registro de un mes que ya ha sido cerrado contablemente.");
      }

      const [box] = tx.select().from(schema.cashBox).limit(1).all();
      const newDenom = this.strictSubtract(box.denominations, income.denominations);
      tx.update(schema.cashBox)
        .set({ denominations: newDenom, totalAmount: this.calculateTotal(newDenom), lastUpdated: new Date() })
        .where(eq(schema.cashBox.id, box.id))
        .run();
      tx.delete(schema.incomes).where(eq(schema.incomes.id, id)).run();
    });
  }

  // ─── EXITS ───────────────────────────────────────────────

  async getExits(): Promise<Exit[]> {
    return await db.select().from(schema.exits).orderBy(desc(schema.exits.createdAt));
  }

  async getPendingExits(): Promise<Exit[]> {
    return await db.select().from(schema.exits)
      .where(eq(schema.exits.isPending, true))
      .orderBy(desc(schema.exits.createdAt));
  }

  async getCompletedExits(): Promise<Exit[]> {
    return await db.select().from(schema.exits)
      .where(eq(schema.exits.isPending, false))
      .orderBy(desc(schema.exits.createdAt));
  }

  async createExit(exit: InsertExit): Promise<Exit> {
    return db.transaction((tx) => {
      const totalAmount = this.calculateTotal(exit.denominationsGiven);
      const [box] = tx.select().from(schema.cashBox).limit(1).all();
      const updatedDenom = this.strictSubtract(box.denominations, exit.denominationsGiven);
      const [newExit] = tx.insert(schema.exits).values({
        ...exit,
        initialAmount: totalAmount,
        isPending: true,
        renderedAmount: 0,
        changeAmount: 0,
      }).returning().all();
      tx.update(schema.cashBox)
        .set({ denominations: updatedDenom, totalAmount: this.calculateTotal(updatedDenom), lastUpdated: new Date() })
        .where(eq(schema.cashBox.id, box.id))
        .run();
      return newExit;
    });
  }

  async updateExit(id: string, newExitData: UpdateExit): Promise<Exit> {
    return db.transaction((tx) => {
      const [oldExit] = tx.select().from(schema.exits).where(eq(schema.exits.id, id)).all();
      if (!oldExit) throw new Error("Salida no encontrada");
      
      const [config] = tx.select().from(schema.configuration).limit(1).all();
      if (config.lockClosedPeriods) {
        const dOld = new Date(oldExit.date);
        const closedOld = tx.select().from(schema.closedPeriods).where(and(eq(schema.closedPeriods.year, dOld.getFullYear()), eq(schema.closedPeriods.month, dOld.getMonth() + 1))).all();
        if (closedOld.length > 0) throw new Error("No se puede editar un registro de un mes que ya ha sido cerrado contablemente.");
        
        const dNew = new Date(newExitData.date);
        const closedNew = tx.select().from(schema.closedPeriods).where(and(eq(schema.closedPeriods.year, dNew.getFullYear()), eq(schema.closedPeriods.month, dNew.getMonth() + 1))).all();
        if (closedNew.length > 0) throw new Error("No se puede mover el registro a un mes que ya ha sido cerrado contablemente.");
      }

      const isEditingDetailsOnly = (newExitData.invoices === undefined && newExitData.changeGiven === undefined);

      // Handle Cashbox Adjustments
      if (isEditingDetailsOnly) {
        // Only denominationsGiven changed (standard details update)
        if (JSON.stringify(oldExit.denominationsGiven) !== JSON.stringify(newExitData.denominationsGiven)) {
          const [box] = tx.select().from(schema.cashBox).limit(1).all();
          const afterReturn = this.addDenominations(box.denominations, oldExit.denominationsGiven);
          const afterNewTake = this.strictSubtract(afterReturn, newExitData.denominationsGiven);
          tx.update(schema.cashBox)
            .set({ denominations: afterNewTake, totalAmount: this.calculateTotal(afterNewTake), lastUpdated: new Date() })
            .where(eq(schema.cashBox.id, box.id))
            .run();
        }
      } else {
        // Complete/Partial update: we revert old denominationsGiven AND all associated changeRecords from the cashbox,
        // then apply the new denominationsGiven and the new change record
        const [box] = tx.select().from(schema.cashBox).limit(1).all();
        let currentDenom = this.addDenominations(box.denominations, oldExit.denominationsGiven);

        const oldChangeRecords = tx.select().from(schema.changeRecords).where(eq(schema.changeRecords.exitId, id)).all();
        for (const cr of oldChangeRecords) {
          currentDenom = this.strictSubtract(currentDenom, cr.denominations);
        }

        // Apply new denominationsGiven and new change record
        currentDenom = this.strictSubtract(currentDenom, newExitData.denominationsGiven);
        if (newExitData.changeGiven) {
          currentDenom = this.addDenominations(currentDenom, newExitData.changeGiven);
        }

        tx.update(schema.cashBox)
          .set({ denominations: currentDenom, totalAmount: this.calculateTotal(currentDenom), lastUpdated: new Date() })
          .where(eq(schema.cashBox.id, box.id))
          .run();
      }

      // Handle Invoice adjustments (if not editing details only)
      let updatedInvoicesAmount = 0;
      if (!isEditingDetailsOnly && newExitData.invoices) {
        const newInvoiceIds = new Set(newExitData.invoices.map(inv => inv.id).filter(Boolean) as string[]);
        
        // Delete invoices not present in the new list
        if (newInvoiceIds.size === 0) {
          tx.delete(schema.invoices).where(eq(schema.invoices.exitId, id)).run();
        } else {
          const oldInvoices = tx.select().from(schema.invoices).where(eq(schema.invoices.exitId, id)).all();
          for (const oldInv of oldInvoices) {
            if (!newInvoiceIds.has(oldInv.id)) {
              tx.delete(schema.invoices).where(eq(schema.invoices.id, oldInv.id)).run();
            }
          }
        }

        // Create or update invoices
        for (const inv of newExitData.invoices) {
          if (inv.id) {
            // Get old invoice to check if voucherId changed
            const [oldInv] = tx.select().from(schema.invoices).where(eq(schema.invoices.id, inv.id)).all();
            const oldInvVoucher = oldInv?.voucherId;
            const newInvVoucher = inv.voucherId;
            
            if (newInvVoucher !== undefined && newInvVoucher !== oldInvVoucher) {
              this.shiftVouchersForward(tx, newInvVoucher);
            }

            tx.update(schema.invoices)
              .set({
                detail: inv.detail,
                amount: inv.amount,
                date: inv.date,
                ...(newInvVoucher !== undefined ? { voucherId: newInvVoucher } : {})
              })
              .where(eq(schema.invoices.id, inv.id))
              .run();
            updatedInvoicesAmount += inv.amount;
          } else {
            const voucherId = this.allocateNextVoucherNumber(tx);
            tx.insert(schema.invoices)
              .values({
                exitId: id,
                voucherId,
                detail: inv.detail,
                amount: inv.amount,
                date: inv.date
              })
              .run();
            updatedInvoicesAmount += inv.amount;
          }
        }
      }

      // Handle Change Record adjustments (if not editing details only)
      let newChangeAmount = oldExit.changeAmount;
      if (!isEditingDetailsOnly) {
        // Delete all old change records and insert a consolidated one
        tx.delete(schema.changeRecords).where(eq(schema.changeRecords.exitId, id)).run();
        
        if (newExitData.changeGiven) {
          const changeAmt = this.calculateTotal(newExitData.changeGiven);
          newChangeAmount = changeAmt;
          if (changeAmt > 0) {
            tx.insert(schema.changeRecords).values({
              exitId: id,
              denominations: newExitData.changeGiven,
              totalAmount: changeAmt
            }).run();
          }
        } else {
          newChangeAmount = 0;
        }
      }

      const totalAmount = this.calculateTotal(newExitData.denominationsGiven);
      
      // Calculate isPending, renderedAmount, changeAmount
      let isPending = oldExit.isPending;
      let renderedAmount = oldExit.renderedAmount;
      let completedAt = oldExit.completedAt;

      if (!isEditingDetailsOnly) {
        renderedAmount = updatedInvoicesAmount;
        const totalAccountedFor = renderedAmount + newChangeAmount;
        
        if (totalAccountedFor > totalAmount) {
          throw new Error(`El monto total rendido ($${(totalAccountedFor/100).toFixed(2)}) superaría el monto inicial de la salida ($${(totalAmount/100).toFixed(2)}).`);
        }
        
        const isFullyRendered = totalAccountedFor === totalAmount;
        isPending = !isFullyRendered;
        completedAt = isFullyRendered ? (oldExit.completedAt || new Date()) : null;
      }

      const [updatedExit] = tx.update(schema.exits)
        .set({
          purpose: newExitData.purpose,
          date: newExitData.date,
          denominationsGiven: newExitData.denominationsGiven,
          initialAmount: totalAmount,
          isPending,
          renderedAmount,
          changeAmount: newChangeAmount,
          completedAt,
          editedAt: new Date()
        })
        .where(eq(schema.exits.id, id))
        .returning().all();

      if (config.editHistory) {
        tx.insert(schema.auditLogs).values({
          entityId: id,
          entityType: 'exit',
          action: 'edit',
          previousData: JSON.stringify(oldExit),
          newData: JSON.stringify(updatedExit)
        }).run();
      }

      return updatedExit;
    });
  }

  async deleteExit(id: string): Promise<void> {
    return db.transaction((tx) => {
      const [exit] = tx.select().from(schema.exits).where(eq(schema.exits.id, id)).all();
      if (!exit) throw new Error("Salida no encontrada");

      const [config] = tx.select().from(schema.configuration).limit(1).all();
      if (config.lockClosedPeriods) {
        const d = new Date(exit.date);
        const closed = tx.select().from(schema.closedPeriods).where(and(eq(schema.closedPeriods.year, d.getFullYear()), eq(schema.closedPeriods.month, d.getMonth() + 1))).all();
        if (closed.length > 0) throw new Error("No se puede eliminar un registro de un mes que ya ha sido cerrado contablemente.");
      }

      const [box] = tx.select().from(schema.cashBox).limit(1).all();
      let newDenom: Denomination;
      if (exit.isPending) {
        newDenom = this.addDenominations(box.denominations, exit.denominationsGiven);
      } else {
        const changeRecords = tx.select().from(schema.changeRecords).where(eq(schema.changeRecords.exitId, id)).all();
        let currentDenom = this.addDenominations(box.denominations, exit.denominationsGiven);
        for (const change of changeRecords) {
          currentDenom = this.strictSubtract(currentDenom, change.denominations);
        }
        tx.delete(schema.changeRecords).where(eq(schema.changeRecords.exitId, id)).run();
        tx.delete(schema.invoices).where(eq(schema.invoices.exitId, id)).run();
        newDenom = currentDenom;
      }
      tx.update(schema.cashBox)
        .set({ denominations: newDenom, totalAmount: this.calculateTotal(newDenom), lastUpdated: new Date() })
        .where(eq(schema.cashBox.id, box.id))
        .run();
      tx.delete(schema.exits).where(eq(schema.exits.id, id)).run();
    });
  }

  /** Full completion: invoices + change must equal initial amount exactly */
  async completeExit(completion: CompleteExit): Promise<Exit> {
    return db.transaction((tx) => {
      const [exit] = tx.select().from(schema.exits).where(eq(schema.exits.id, completion.exitId)).all();
      if (!exit) throw new Error("Salida no encontrada");
      if (!exit.isPending) throw new Error("Esta salida ya fue completada.");

      const totalInvoiceAmount = completion.invoices.reduce((sum, inv) => sum + inv.amount, 0);
      const changeAmount = this.calculateTotal(completion.changeGiven);

      const alreadyRendered = exit.renderedAmount + exit.changeAmount;
      const newlyRendered = totalInvoiceAmount + changeAmount;

      if (alreadyRendered + newlyRendered !== exit.initialAmount) {
        throw new Error(`La suma de lo rendido ahora ($${(newlyRendered/100).toFixed(2)}) y lo rendido previamente ($${(alreadyRendered/100).toFixed(2)}) debe ser igual al monto inicial ($${(exit.initialAmount/100).toFixed(2)}).`);
      }
      for (const invoiceData of completion.invoices) {
        const voucherId = this.allocateNextVoucherNumber(tx);
        tx.insert(schema.invoices).values({ ...invoiceData, exitId: exit.id, voucherId }).run();
      }
      if (changeAmount > 0) {
        tx.insert(schema.changeRecords).values({
          exitId: exit.id,
          denominations: completion.changeGiven,
          totalAmount: changeAmount
        }).run();
        const [box] = tx.select().from(schema.cashBox).limit(1).all();
        const updatedDenom = this.addDenominations(box.denominations, completion.changeGiven);
        tx.update(schema.cashBox)
          .set({ denominations: updatedDenom, totalAmount: this.calculateTotal(updatedDenom), lastUpdated: new Date() })
          .where(eq(schema.cashBox.id, box.id))
          .run();
      }
      const [completedExit] = tx.update(schema.exits)
        .set({
          isPending: false,
          completedAt: new Date(),
          renderedAmount: exit.renderedAmount + totalInvoiceAmount,
          changeAmount: exit.changeAmount + changeAmount
        })
        .where(eq(schema.exits.id, exit.id))
        .returning().all();
      return completedExit;
    });
  }

  /** Incremental completion: add invoices and/or change without requiring full balance */
  async addToExit(data: AddToExit): Promise<Exit> {
    return db.transaction((tx) => {
      const [exit] = tx.select().from(schema.exits).where(eq(schema.exits.id, data.exitId)).all();
      if (!exit) throw new Error("Salida no encontrada");
      if (!exit.isPending) throw new Error("Esta salida ya fue completada.");

      let newRendered = exit.renderedAmount;
      let newChangeAmount = exit.changeAmount;

      // Add invoices
      if (data.invoices && data.invoices.length > 0) {
        for (const invoiceData of data.invoices) {
          const voucherId = this.allocateNextVoucherNumber(tx);
          tx.insert(schema.invoices).values({
            ...invoiceData,
            exitId: exit.id,
            voucherId
          }).run();
          newRendered = newRendered + invoiceData.amount;
        }
      }

      // Add change
      if (data.changeGiven) {
        const changeAmount = this.calculateTotal(data.changeGiven);
        if (changeAmount > 0) {
          tx.insert(schema.changeRecords).values({
            exitId: exit.id,
            denominations: data.changeGiven,
            totalAmount: changeAmount
          }).run();

          const [box] = tx.select().from(schema.cashBox).limit(1).all();
          const updatedDenom = this.addDenominations(box.denominations, data.changeGiven);
          tx.update(schema.cashBox)
            .set({ denominations: updatedDenom, totalAmount: this.calculateTotal(updatedDenom), lastUpdated: new Date() })
            .where(eq(schema.cashBox.id, box.id))
            .run();

          newChangeAmount = newChangeAmount + changeAmount;
        }
      }

      // Check if we can auto-complete
      const totalAccountedFor = newRendered + newChangeAmount;
      if (totalAccountedFor > exit.initialAmount) {
        throw new Error(`Error: El monto total rendido ($${(totalAccountedFor/100).toFixed(2)}) superaría el monto inicial de la salida ($${(exit.initialAmount/100).toFixed(2)}).`);
      }

      const isFullyRendered = totalAccountedFor === exit.initialAmount;
      const shouldComplete = isFullyRendered || data.forceComplete;

      const [updatedExit] = tx.update(schema.exits)
        .set({
          renderedAmount: newRendered,
          changeAmount: newChangeAmount,
          isPending: shouldComplete ? false : true,
          completedAt: shouldComplete ? new Date() : undefined
        })
        .where(eq(schema.exits.id, exit.id))
        .returning().all();

      return updatedExit;
    });
  }

  // ─── INVOICES & CHANGE ──────────────────────────────────

  async getInvoicesByExitId(exitId: string): Promise<Invoice[]> {
    return await db.select().from(schema.invoices)
      .where(eq(schema.invoices.exitId, exitId))
      .orderBy(schema.invoices.createdAt);
  }

  async getChangeByExitId(exitId: string): Promise<ChangeRecord[]> {
    return await db.select().from(schema.changeRecords)
      .where(eq(schema.changeRecords.exitId, exitId))
      .orderBy(schema.changeRecords.createdAt);
  }

  // ─── CASH EXCHANGES (FEREAR) ────────────────────────────

  async getCashExchanges(): Promise<CashExchange[]> {
    return await db.select().from(schema.cashExchanges).orderBy(desc(schema.cashExchanges.createdAt));
  }

  async getCashAdjustments(): Promise<CashAdjustment[]> {
    return await db.select().from(schema.cashAdjustments).orderBy(desc(schema.cashAdjustments.createdAt));
  }

  async createCashExchange(exchange: InsertCashExchange): Promise<CashExchange> {
    return db.transaction((tx) => {
      const inTotal = this.calculateTotal(exchange.denominationsIn);
      const outTotal = this.calculateTotal(exchange.denominationsOut);
      if (inTotal !== outTotal) {
        throw new Error(
          `Cambio inválido: lo que entra ($${(inTotal/100).toFixed(2)}) no es igual a lo que sale ($${(outTotal/100).toFixed(2)}). ` +
          `En un cambio de billetes la suma neta debe ser $0.`
        );
      }
      const [box] = tx.select().from(schema.cashBox).limit(1).all();
      const afterRemoval = this.strictSubtract(box.denominations, exchange.denominationsOut);
      const afterAddition = this.addDenominations(afterRemoval, exchange.denominationsIn);
      const [record] = tx.insert(schema.cashExchanges).values({
        denominationsIn: exchange.denominationsIn,
        denominationsOut: exchange.denominationsOut,
        totalAmount: inTotal,
        detail: exchange.detail || null
      }).returning().all();
      tx.update(schema.cashBox)
        .set({ denominations: afterAddition, totalAmount: this.calculateTotal(afterAddition), lastUpdated: new Date() })
        .where(eq(schema.cashBox.id, box.id))
        .run();
      return record;
    });
  }

  // ─── CONFIGURATION ──────────────────────────────────────

  async getConfiguration(): Promise<Configuration> {
    const [config] = await db.select().from(schema.configuration).limit(1);
    return config;
  }

  async updateConfiguration(config: UpdateConfig): Promise<Configuration> {
    const current = await this.getConfiguration();
    // Merge: only update fields that are explicitly provided
    const updatePayload: Partial<typeof config> = { ...config };
    const [updated] = await db.update(schema.configuration)
      .set({ ...updatePayload, lastUpdated: new Date() })
      .where(eq(schema.configuration.id, current.id))
      .returning();
    return updated;
  }

  async getNextVoucherNumber(): Promise<number> {
    return db.transaction((tx) => this.allocateNextVoucherNumber(tx));
  }

  async syncNextVoucherNumber(): Promise<number> {
    const config = await this.getConfiguration();
    const [[maxIncome], [maxInvoice], [maxExit]] = await Promise.all([
      db.select({ val: sql<number>`max(voucher_id)` }).from(schema.incomes),
      db.select({ val: sql<number>`max(voucher_id)` }).from(schema.invoices),
      db.select({ val: sql<number>`max(voucher_id)` }).from(schema.exits)
    ]);
    
    const dbMax = Math.max(
      Number(maxIncome?.val || 0),
      Number(maxInvoice?.val || 0),
      Number(maxExit?.val || 0)
    );

    const nextNumber = dbMax + 1;

    await db.update(schema.configuration)
      .set({ 
        nextVoucherNumber: nextNumber, 
        lastUpdated: new Date() 
      })
      .where(eq(schema.configuration.id, config.id));
      
    return nextNumber;
  }

  // ─── REPORTS ────────────────────────────────────────────

  async getMovementsByMonth(year: number, month: number): Promise<{ movements: any[], previousBalance: number }> {
    const startOfTargetMonth = new Date(year, month - 1, 1);
    const endOfTargetMonth = new Date(year, month, 1);

    // Fetch monthly target movements and aggregates in parallel
    const [
      targetIncomes,
      targetInvoices,
      targetAdjustments,
      targetExits,
      [incomeSum],
      [invoiceSum],
      [adjSum],
      allExitsBefore,
      allInvoicesBefore
    ] = await Promise.all([
      db.select().from(schema.incomes)
        .where(and(gte(schema.incomes.date, startOfTargetMonth), lt(schema.incomes.date, endOfTargetMonth))),
      db.select().from(schema.invoices)
        .where(and(gte(schema.invoices.date, startOfTargetMonth), lt(schema.invoices.date, endOfTargetMonth))),
      db.select().from(schema.cashAdjustments)
        .where(and(gte(schema.cashAdjustments.createdAt, startOfTargetMonth), lt(schema.cashAdjustments.createdAt, endOfTargetMonth))),
      db.select().from(schema.exits)
        .where(and(
          eq(schema.exits.isPending, false),
          gte(schema.exits.date, startOfTargetMonth), 
          lt(schema.exits.date, endOfTargetMonth)
        )),
      db.select({ val: sql<number>`sum(total_amount)` }).from(schema.incomes)
        .where(lt(schema.incomes.date, startOfTargetMonth)),
      db.select({ val: sql<number>`sum(amount)` }).from(schema.invoices)
        .where(lt(schema.invoices.date, startOfTargetMonth)),
      db.select({ val: sql<number>`sum(difference)` }).from(schema.cashAdjustments)
        .where(lt(schema.cashAdjustments.createdAt, startOfTargetMonth)),
      db.select().from(schema.exits)
        .where(and(eq(schema.exits.isPending, false), lt(schema.exits.date, startOfTargetMonth))),
      db.select({ exitId: schema.invoices.exitId }).from(schema.invoices)
        .where(lt(schema.invoices.date, startOfTargetMonth))
    ]);

    const invoiceExitIdsBefore = new Set(allInvoicesBefore.map(inv => inv.exitId));
    
    let historicalExitSum = 0;
    for (const exit of allExitsBefore) {
      if (!invoiceExitIdsBefore.has(exit.id)) {
        historicalExitSum += (exit.renderedAmount ?? exit.initialAmount);
      }
    }

    let previousBalance = Number(incomeSum?.val || 0) - Number(invoiceSum?.val || 0) + Number(adjSum?.val || 0) - historicalExitSum;

    const invoiceExitIds = new Set(targetInvoices.map(inv => inv.exitId));
    const movements: any[] = [];

    for (const income of targetIncomes) {
      movements.push({
        type: 'income',
        date: income.date,
        voucherId: income.voucherId,
        detail: income.detail,
        inAmount: income.totalAmount,
        outAmount: 0,
        createdAt: income.createdAt
      });
    }

    for (const invoice of targetInvoices) {
      movements.push({
        type: 'invoice',
        date: invoice.date,
        voucherId: invoice.voucherId,
        detail: invoice.detail,
        inAmount: 0,
        outAmount: invoice.amount,
        createdAt: invoice.createdAt
      });
    }

    for (const exit of targetExits) {
      if (!invoiceExitIds.has(exit.id)) {
        movements.push({
          type: 'exit_historical',
          date: exit.date,
          voucherId: exit.voucherId,
          detail: exit.purpose,
          inAmount: 0,
          outAmount: exit.renderedAmount ?? exit.initialAmount,
          createdAt: exit.createdAt
        });
      }
    }

    for (const adj of targetAdjustments) {
      movements.push({
        type: 'adjustment',
        date: adj.createdAt,
        voucherId: null,
        detail: `Arqueo de Caja (${adj.difference >= 0 ? '+' : ''}${(adj.difference/100).toFixed(2)})`,
        inAmount: adj.difference > 0 ? adj.difference : 0,
        outAmount: adj.difference < 0 ? Math.abs(adj.difference) : 0,
        createdAt: adj.createdAt
      });
    }

    return { 
      movements: movements.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
      previousBalance 
    };
  }

  // ─── AUDIT & SECURITY ───────────────────────────────────

  async getAuditLogs(entityId: string): Promise<schema.AuditLog[]> {
    return await db.select().from(schema.auditLogs)
      .where(eq(schema.auditLogs.entityId, entityId))
      .orderBy(desc(schema.auditLogs.createdAt));
  }

  async getClosedPeriods(): Promise<schema.ClosedPeriod[]> {
    return await db.select().from(schema.closedPeriods).orderBy(desc(schema.closedPeriods.year), desc(schema.closedPeriods.month));
  }

  async closePeriod(year: number, month: number): Promise<schema.ClosedPeriod> {
    const existing = await db.select().from(schema.closedPeriods)
      .where(and(eq(schema.closedPeriods.year, year), eq(schema.closedPeriods.month, month)));
    if (existing && existing.length > 0) {
      throw new Error(`El período ${month}/${year} ya se encuentra cerrado.`);
    }
    const [closed] = await db.insert(schema.closedPeriods).values({ year, month }).returning();
    return closed;
  }

  async isPeriodClosed(date: Date): Promise<boolean> {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const closed = await db.select().from(schema.closedPeriods)
      .where(and(eq(schema.closedPeriods.year, year), eq(schema.closedPeriods.month, month)));
    return closed && closed.length > 0;
  }
}

export const storage = new SqliteStorage();
