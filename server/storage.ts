import { 
  type User, 
  type InsertUser, 
  type Income, 
  type InsertIncome,
  type Exit,
  type InsertExit,
  type Invoice,
  type InsertInvoice,
  type ChangeRecord,
  type CashBox,
  type CashExchange,
  type InsertCashExchange,
  type Configuration,
  type UpdateConfig,
  type CompleteExit,
  type AddToExit,
  type Denomination
} from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";
import * as schema from "@shared/schema";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getCashBox(): Promise<CashBox>;
  updateCashBox(denominations: Denomination): Promise<CashBox>;
  
  getIncomes(): Promise<Income[]>;
  createIncome(income: InsertIncome): Promise<Income>;
  updateIncome(id: string, income: InsertIncome): Promise<Income>;
  deleteIncome(id: string): Promise<void>;
  
  getExits(): Promise<Exit[]>;
  getPendingExits(): Promise<Exit[]>;
  getCompletedExits(): Promise<Exit[]>;
  createExit(exit: InsertExit): Promise<Exit>;
  updateExit(id: string, exit: InsertExit): Promise<Exit>;
  completeExit(completion: CompleteExit): Promise<Exit>;
  addToExit(data: AddToExit): Promise<Exit>;
  deleteExit(id: string): Promise<void>;
  
  getInvoicesByExitId(exitId: string): Promise<Invoice[]>;
  getChangeByExitId(exitId: string): Promise<ChangeRecord | undefined>;
  
  getCashExchanges(): Promise<CashExchange[]>;
  createCashExchange(exchange: InsertCashExchange): Promise<CashExchange>;
  
  getConfiguration(): Promise<Configuration>;
  updateConfiguration(config: UpdateConfig): Promise<Configuration>;
  getNextVoucherNumber(): Promise<number>;
  
  getMovementsByMonth(year: number, month: number): Promise<any[]>;
}

export class SqliteStorage implements IStorage {
  constructor() {
    this.initializeDefaults().catch(console.error);
  }

  private async initializeDefaults() {
    const box = await db.select().from(schema.cashBox).limit(1);
    if (!box || box.length === 0) {
      await db.insert(schema.cashBox).values({
        denominations: {
          bills: { hundred: 0, fifty: 0, twenty: 0, ten: 0, five: 0, two: 0, one: 0 },
          coins: { five: 0, two: 0, one: 0, fifty_cents: 0, quarter: 0, dime: 0 }
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
  }

  // ─── HELPERS ─────────────────────────────────────────────

  private calculateTotal(denominations: Denomination): number {
    const { bills, coins } = denominations;
    return (
      bills.hundred * 100 + bills.fifty * 50 + bills.twenty * 20 + bills.ten * 10 +
      bills.five * 5 + bills.two * 2 + bills.one * 1 +
      coins.five * 5 + coins.two * 2 + coins.one * 1 +
      coins.fifty_cents * 0.5 + coins.quarter * 0.25 + coins.dime * 0.1
    );
  }

  /** Subtract denominations with smart rebalancing.
   *  If specific bills aren't available, breaks larger bills to cover the gap.
   *  Only fails if the TOTAL amount in the box is insufficient. */
  private smartSubtract(current: Denomination, toSubtract: Denomination): Denomination {
    const result: Denomination = {
      bills: {
        hundred: current.bills.hundred - toSubtract.bills.hundred,
        fifty:   current.bills.fifty   - toSubtract.bills.fifty,
        twenty:  current.bills.twenty  - toSubtract.bills.twenty,
        ten:     current.bills.ten     - toSubtract.bills.ten,
        five:    current.bills.five    - toSubtract.bills.five,
        two:     current.bills.two     - toSubtract.bills.two,
        one:     current.bills.one     - toSubtract.bills.one
      },
      coins: {
        five:        current.coins.five        - toSubtract.coins.five,
        two:         current.coins.two         - toSubtract.coins.two,
        one:         current.coins.one         - toSubtract.coins.one,
        fifty_cents: current.coins.fifty_cents - toSubtract.coins.fifty_cents,
        quarter:     current.coins.quarter     - toSubtract.coins.quarter,
        dime:        current.coins.dime        - toSubtract.coins.dime
      }
    };

    // If total would be negative, it's truly impossible
    const resultTotal = this.calculateTotal(result);
    if (resultTotal < -0.01) {
      throw new Error(
        `Fondos insuficientes: la caja tiene ${this.calculateTotal(current).toFixed(2)} ` +
        `pero se necesitan ${this.calculateTotal(toSubtract).toFixed(2)}`
      );
    }

    // Rebalance: resolve negative counts by breaking larger bills
    // Order: hundred(100), fifty(50), twenty(20), ten(10), five_b(5), two_b(2), one_b(1),
    //        five_c(5), two_c(2), one_c(1), fifty_cents(0.5), quarter(0.25), dime(0.1)
    type DenomEntry = { group: 'bills' | 'coins'; key: string; value: number };
    const denomOrder: DenomEntry[] = [
      { group: 'bills', key: 'hundred', value: 100 },
      { group: 'bills', key: 'fifty', value: 50 },
      { group: 'bills', key: 'twenty', value: 20 },
      { group: 'bills', key: 'ten', value: 10 },
      { group: 'bills', key: 'five', value: 5 },
      { group: 'bills', key: 'two', value: 2 },
      { group: 'bills', key: 'one', value: 1 },
      { group: 'coins', key: 'five', value: 5 },
      { group: 'coins', key: 'two', value: 2 },
      { group: 'coins', key: 'one', value: 1 },
      { group: 'coins', key: 'fifty_cents', value: 0.5 },
      { group: 'coins', key: 'quarter', value: 0.25 },
      { group: 'coins', key: 'dime', value: 0.1 },
    ];

    const getCount = (d: Denomination, entry: DenomEntry): number => {
      return (d[entry.group] as any)[entry.key] as number;
    };
    const setCount = (d: Denomination, entry: DenomEntry, val: number) => {
      (d[entry.group] as any)[entry.key] = val;
    };

    // Multiple passes to resolve debts by breaking larger denominations
    for (let pass = 0; pass < 3; pass++) {
      for (let i = denomOrder.length - 1; i >= 0; i--) {
        const entry = denomOrder[i];
        const count = getCount(result, entry);
        if (count >= 0) continue;

        const debtAmount = Math.abs(count) * entry.value;
        setCount(result, entry, 0);

        // Find a larger denomination to break
        let resolved = false;
        for (let j = 0; j < i; j++) {
          const donor = denomOrder[j];
          const donorCount = getCount(result, donor);
          if (donorCount <= 0) continue;

          // How many donors needed to cover the debt
          const donorsNeeded = Math.ceil(debtAmount / donor.value);
          const donorsUsed = Math.min(donorsNeeded, donorCount);
          const donorValue = donorsUsed * donor.value;

          setCount(result, donor, donorCount - donorsUsed);

          // Return change as the next smaller denomination available
          let remainder = donorValue - debtAmount;
          if (remainder > 0.001) {
            // Distribute remainder starting from largest fitting denomination
            for (let k = 0; k < denomOrder.length; k++) {
              const changeDenom = denomOrder[k];
              if (changeDenom.value > remainder + 0.001) continue;
              const changeCount = Math.floor(remainder / changeDenom.value + 0.001);
              if (changeCount > 0) {
                setCount(result, changeDenom, getCount(result, changeDenom) + changeCount);
                remainder -= changeCount * changeDenom.value;
              }
            }
          }
          resolved = true;
          break;
        }

        if (!resolved) {
          // Try combining smaller denominations
          let collected = 0;
          for (let j = i + 1; j < denomOrder.length; j++) {
            const src = denomOrder[j];
            const srcCount = getCount(result, src);
            if (srcCount <= 0) continue;
            const needed = Math.ceil((debtAmount - collected) / src.value);
            const used = Math.min(needed, srcCount);
            collected += used * src.value;
            setCount(result, src, srcCount - used);
            if (collected >= debtAmount - 0.001) break;
          }
          // Any leftover goes back
          let leftover = collected - debtAmount;
          if (leftover > 0.001) {
            for (let k = 0; k < denomOrder.length; k++) {
              const changeDenom = denomOrder[k];
              if (changeDenom.value > leftover + 0.001) continue;
              const changeCount = Math.floor(leftover / changeDenom.value + 0.001);
              if (changeCount > 0) {
                setCount(result, changeDenom, getCount(result, changeDenom) + changeCount);
                leftover -= changeCount * changeDenom.value;
              }
            }
          }
        }
      }
    }

    return result;
  }

  private addDenominations(a: Denomination, b: Denomination): Denomination {
    return {
      bills: {
        hundred: a.bills.hundred + b.bills.hundred,
        fifty:   a.bills.fifty   + b.bills.fifty,
        twenty:  a.bills.twenty  + b.bills.twenty,
        ten:     a.bills.ten     + b.bills.ten,
        five:    a.bills.five    + b.bills.five,
        two:     a.bills.two     + b.bills.two,
        one:     a.bills.one     + b.bills.one
      },
      coins: {
        five:        a.coins.five        + b.coins.five,
        two:         a.coins.two         + b.coins.two,
        one:         a.coins.one         + b.coins.one,
        fifty_cents: a.coins.fifty_cents + b.coins.fifty_cents,
        quarter:     a.coins.quarter     + b.coins.quarter,
        dime:        a.coins.dime        + b.coins.dime
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
    const voucherId = await this.getNextVoucherNumber();
    const totalAmount = this.calculateTotal(income.denominations);

    const [newIncome] = await db.insert(schema.incomes).values({
      ...income,
      voucherId,
      totalAmount,
    }).returning();

    // Add to physical cash box
    const box = await this.getCashBox();
    const updatedDenom = this.addDenominations(box.denominations, income.denominations);
    await db.update(schema.cashBox)
      .set({ denominations: updatedDenom, totalAmount: this.calculateTotal(updatedDenom), lastUpdated: new Date() })
      .where(eq(schema.cashBox.id, box.id));

    return newIncome;
  }

  async updateIncome(id: string, newIncomeData: InsertIncome): Promise<Income> {
    const [oldIncome] = await db.select().from(schema.incomes).where(eq(schema.incomes.id, id));
    if (!oldIncome) throw new Error("Ingreso no encontrado");

    const totalAmount = this.calculateTotal(newIncomeData.denominations);

    // Bypass physical box update if denominations didn't change (e.g. just updating textual details)
    if (JSON.stringify(oldIncome.denominations) !== JSON.stringify(newIncomeData.denominations)) {
      const box = await this.getCashBox();
      // Smart subtract the old denominations, then add the new ones
      const afterRemoval = this.smartSubtract(box.denominations, oldIncome.denominations);
      const afterAddition = this.addDenominations(afterRemoval, newIncomeData.denominations);

      await db.update(schema.cashBox)
        .set({ denominations: afterAddition, totalAmount: this.calculateTotal(afterAddition), lastUpdated: new Date() })
        .where(eq(schema.cashBox.id, box.id));
    }

    const [updatedIncome] = await db.update(schema.incomes)
      .set({
        detail: newIncomeData.detail,
        date: newIncomeData.date,
        denominations: newIncomeData.denominations,
        totalAmount,
        editedAt: new Date()
      })
      .where(eq(schema.incomes.id, id))
      .returning();

    return updatedIncome;
  }

  async deleteIncome(id: string): Promise<void> {
    const [income] = await db.select().from(schema.incomes).where(eq(schema.incomes.id, id));
    if (!income) throw new Error("Ingreso no encontrado");

    const box = await this.getCashBox();
    // Smart subtract: will rebalance denominations if exact bills aren't available
    const newDenom = this.smartSubtract(box.denominations, income.denominations);

    await db.update(schema.cashBox)
      .set({ denominations: newDenom, totalAmount: this.calculateTotal(newDenom), lastUpdated: new Date() })
      .where(eq(schema.cashBox.id, box.id));

    await db.delete(schema.incomes).where(eq(schema.incomes.id, id));
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
    const totalAmount = this.calculateTotal(exit.denominationsGiven);

    const box = await this.getCashBox();
    // Smart subtract: will rebalance if specific bills aren't available
    const updatedDenom = this.smartSubtract(box.denominations, exit.denominationsGiven);

    const [newExit] = await db.insert(schema.exits).values({
      ...exit,
      initialAmount: totalAmount,
      isPending: true,
      renderedAmount: 0,
      changeAmount: 0,
    }).returning();

    await db.update(schema.cashBox)
      .set({ denominations: updatedDenom, totalAmount: this.calculateTotal(updatedDenom), lastUpdated: new Date() })
      .where(eq(schema.cashBox.id, box.id));

    return newExit;
  }

  async updateExit(id: string, newExitData: InsertExit): Promise<Exit> {
    const [oldExit] = await db.select().from(schema.exits).where(eq(schema.exits.id, id));
    if (!oldExit) throw new Error("Salida no encontrada");

    if (!oldExit.isPending &&
       JSON.stringify(oldExit.denominationsGiven) !== JSON.stringify(newExitData.denominationsGiven)) {
       throw new Error("No se pueden modificar las denominaciones de una salida completada.");
    }

    if (oldExit.isPending) {
      if (JSON.stringify(oldExit.denominationsGiven) !== JSON.stringify(newExitData.denominationsGiven)) {
        const box = await this.getCashBox();
        // Return old denominations, then take new ones
        const afterReturn = this.addDenominations(box.denominations, oldExit.denominationsGiven);
        const afterNewTake = this.smartSubtract(afterReturn, newExitData.denominationsGiven);

        await db.update(schema.cashBox)
          .set({ denominations: afterNewTake, totalAmount: this.calculateTotal(afterNewTake), lastUpdated: new Date() })
          .where(eq(schema.cashBox.id, box.id));
      }
    }

    const totalAmount = this.calculateTotal(newExitData.denominationsGiven);
    const [updatedExit] = await db.update(schema.exits)
      .set({
        purpose: newExitData.purpose,
        date: newExitData.date,
        denominationsGiven: newExitData.denominationsGiven,
        initialAmount: totalAmount,
        editedAt: new Date()
      })
      .where(eq(schema.exits.id, id))
      .returning();

    return updatedExit;
  }

  async deleteExit(id: string): Promise<void> {
    const [exit] = await db.select().from(schema.exits).where(eq(schema.exits.id, id));
    if (!exit) throw new Error("Salida no encontrada");

    const box = await this.getCashBox();
    let newDenom: Denomination;

    if (exit.isPending) {
      // Return the money to the box
      newDenom = this.addDenominations(box.denominations, exit.denominationsGiven);
    } else {
      // Completed exit: return given - change(s)
      const changeRecords = await db.select().from(schema.changeRecords).where(eq(schema.changeRecords.exitId, id));
      
      let currentDenom = this.addDenominations(box.denominations, exit.denominationsGiven);
      if (changeRecords.length > 0) {
        for (const change of changeRecords) {
          currentDenom = this.smartSubtract(currentDenom, change.denominations);
        }
        await db.delete(schema.changeRecords).where(eq(schema.changeRecords.exitId, id));
      }
      newDenom = currentDenom;

      await db.delete(schema.invoices).where(eq(schema.invoices.exitId, id));
    }

    await db.update(schema.cashBox)
      .set({ denominations: newDenom, totalAmount: this.calculateTotal(newDenom), lastUpdated: new Date() })
      .where(eq(schema.cashBox.id, box.id));

    await db.delete(schema.exits).where(eq(schema.exits.id, id));
  }

  /** Full completion: invoices + change must equal initial amount exactly */
  async completeExit(completion: CompleteExit): Promise<Exit> {
    const [exit] = await db.select().from(schema.exits).where(eq(schema.exits.id, completion.exitId));
    if (!exit) throw new Error("Salida no encontrada");

    let totalInvoiceAmount = 0;
    for (const inv of completion.invoices) {
      totalInvoiceAmount += inv.amount;
    }
    const changeAmount = this.calculateTotal(completion.changeGiven);
    const expectedTotal = totalInvoiceAmount + changeAmount;

    if (Math.abs(expectedTotal - exit.initialAmount) > 0.01) {
      throw new Error(
        `Cierre inválido: facturas (${totalInvoiceAmount.toFixed(2)}) + vuelto (${changeAmount.toFixed(2)}) = ${expectedTotal.toFixed(2)} ` +
        `pero el monto entregado fue ${exit.initialAmount.toFixed(2)}`
      );
    }

    for (const invoiceData of completion.invoices) {
      const voucherId = await this.getNextVoucherNumber();
      await db.insert(schema.invoices).values({
        ...invoiceData,
        exitId: exit.id,
        voucherId
      });
    }

    if (changeAmount > 0) {
      await db.insert(schema.changeRecords).values({
        exitId: exit.id,
        denominations: completion.changeGiven,
        totalAmount: changeAmount
      });

      // Change returns to the physical box
      const box = await this.getCashBox();
      const updatedDenom = this.addDenominations(box.denominations, completion.changeGiven);
      await db.update(schema.cashBox)
        .set({ denominations: updatedDenom, totalAmount: this.calculateTotal(updatedDenom), lastUpdated: new Date() })
        .where(eq(schema.cashBox.id, box.id));
    }

    const [completedExit] = await db.update(schema.exits)
      .set({ 
        isPending: false, 
        completedAt: new Date(),
        renderedAmount: totalInvoiceAmount,
        changeAmount: changeAmount
      })
      .where(eq(schema.exits.id, exit.id))
      .returning();

    return completedExit;
  }

  /** Incremental completion: add invoices and/or change without requiring full balance */
  async addToExit(data: AddToExit): Promise<Exit> {
    const [exit] = await db.select().from(schema.exits).where(eq(schema.exits.id, data.exitId));
    if (!exit) throw new Error("Salida no encontrada");
    if (!exit.isPending) throw new Error("Esta salida ya fue completada.");

    let newRendered = exit.renderedAmount;
    let newChangeAmount = exit.changeAmount;

    // Validate over-rendering before proceeding
    let incomingInvoicesTotal = 0;
    if (data.invoices && data.invoices.length > 0) {
      incomingInvoicesTotal = data.invoices.reduce((sum, inv) => sum + inv.amount, 0);
    }
    const incomingChangeTotal = data.changeGiven ? this.calculateTotal(data.changeGiven) : 0;
    
    if (newRendered + newChangeAmount + incomingInvoicesTotal + incomingChangeTotal > exit.initialAmount + 0.01) {
      throw new Error(`No se puede rendir más de lo entregado (${exit.initialAmount.toFixed(2)} US$). Reduzca el monto de las facturas o el vuelto.`);
    }

    // Add invoices
    if (data.invoices && data.invoices.length > 0) {
      for (const invoiceData of data.invoices) {
        const voucherId = await this.getNextVoucherNumber();
        await db.insert(schema.invoices).values({
          ...invoiceData,
          exitId: exit.id,
          voucherId
        });
        newRendered += invoiceData.amount;
      }
    }

    // Add change
    if (data.changeGiven) {
      const changeAmount = this.calculateTotal(data.changeGiven);
      if (changeAmount > 0) {
        await db.insert(schema.changeRecords).values({
          exitId: exit.id,
          denominations: data.changeGiven,
          totalAmount: changeAmount
        });

        const box = await this.getCashBox();
        const updatedDenom = this.addDenominations(box.denominations, data.changeGiven);
        await db.update(schema.cashBox)
          .set({ denominations: updatedDenom, totalAmount: this.calculateTotal(updatedDenom), lastUpdated: new Date() })
          .where(eq(schema.cashBox.id, box.id));

        newChangeAmount += changeAmount;
      }
    }

    // Check if we can auto-complete
    const totalAccountedFor = newRendered + newChangeAmount;
    const isFullyRendered = Math.abs(totalAccountedFor - exit.initialAmount) < 0.01;
    const shouldComplete = isFullyRendered || data.forceComplete;

    const [updatedExit] = await db.update(schema.exits)
      .set({
        renderedAmount: newRendered,
        changeAmount: newChangeAmount,
        isPending: shouldComplete ? false : true,
        completedAt: shouldComplete ? new Date() : undefined
      })
      .where(eq(schema.exits.id, exit.id))
      .returning();

    return updatedExit;
  }

  // ─── INVOICES & CHANGE ──────────────────────────────────

  async getInvoicesByExitId(exitId: string): Promise<Invoice[]> {
    return await db.select().from(schema.invoices)
      .where(eq(schema.invoices.exitId, exitId))
      .orderBy(schema.invoices.createdAt);
  }

  async getChangeByExitId(exitId: string): Promise<ChangeRecord | undefined> {
    const [change] = await db.select().from(schema.changeRecords).where(eq(schema.changeRecords.exitId, exitId));
    return change;
  }

  // ─── CASH EXCHANGES (FEREAR) ────────────────────────────

  async getCashExchanges(): Promise<CashExchange[]> {
    return await db.select().from(schema.cashExchanges).orderBy(desc(schema.cashExchanges.createdAt));
  }

  async createCashExchange(exchange: InsertCashExchange): Promise<CashExchange> {
    const inTotal = this.calculateTotal(exchange.denominationsIn);
    const outTotal = this.calculateTotal(exchange.denominationsOut);

    if (Math.abs(inTotal - outTotal) > 0.01) {
      throw new Error(
        `Cambio inválido: lo que entra ($${inTotal.toFixed(2)}) no es igual a lo que sale ($${outTotal.toFixed(2)}). ` +
        `En un cambio de billetes la suma neta debe ser $0.`
      );
    }

    const box = await this.getCashBox();
    // Remove the denominations going out
    const afterRemoval = this.smartSubtract(box.denominations, exchange.denominationsOut);
    // Add the denominations coming in
    const afterAddition = this.addDenominations(afterRemoval, exchange.denominationsIn);

    const [record] = await db.insert(schema.cashExchanges).values({
      denominationsIn: exchange.denominationsIn,
      denominationsOut: exchange.denominationsOut,
      totalAmount: inTotal,
      detail: exchange.detail || null
    }).returning();

    await db.update(schema.cashBox)
      .set({ denominations: afterAddition, totalAmount: this.calculateTotal(afterAddition), lastUpdated: new Date() })
      .where(eq(schema.cashBox.id, box.id));

    return record;
  }

  // ─── CONFIGURATION ──────────────────────────────────────

  async getConfiguration(): Promise<Configuration> {
    const [config] = await db.select().from(schema.configuration).limit(1);
    return config;
  }

  async updateConfiguration(config: UpdateConfig): Promise<Configuration> {
    const current = await this.getConfiguration();
    const [updated] = await db.update(schema.configuration)
      .set({ ...config, lastUpdated: new Date() })
      .where(eq(schema.configuration.id, current.id))
      .returning();
    return updated;
  }

  async getNextVoucherNumber(): Promise<number> {
    const config = await this.getConfiguration();
    const current = config.nextVoucherNumber;
    await db.update(schema.configuration)
      .set({ nextVoucherNumber: current + 1, lastUpdated: new Date() })
      .where(eq(schema.configuration.id, config.id));
    return current;
  }

  // ─── REPORTS ────────────────────────────────────────────

  async getMovementsByMonth(year: number, month: number): Promise<any[]> {
    const allIncomes = await db.select().from(schema.incomes);
    const allInvoices = await db.select().from(schema.invoices);

    const movements: any[] = [];

    for (const income of allIncomes) {
      const date = new Date(income.date);
      if (date.getFullYear() === year && date.getMonth() === month - 1) {
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
    }

    for (const invoice of allInvoices) {
      const date = new Date(invoice.date);
      if (date.getFullYear() === year && date.getMonth() === month - 1) {
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
    }

    return movements.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }
}

export const storage = new SqliteStorage();
