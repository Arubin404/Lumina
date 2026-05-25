import { sql } from "drizzle-orm";
import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Denomination structure for bills and coins
export const denominationSchema = z.object({
  bills: z.object({
    hundred: z.number().min(0).default(0),
    fifty: z.number().min(0).default(0),
    twenty: z.number().min(0).default(0),
    ten: z.number().min(0).default(0),
    five: z.number().min(0).default(0),
    one: z.number().min(0).default(0)
  }),
  coins: z.object({
    one: z.number().min(0).default(0),
    fifty_cents: z.number().min(0).default(0),
    quarter: z.number().min(0).default(0),
    dime: z.number().min(0).default(0),
    nickel: z.number().min(0).default(0),
    penny: z.number().min(0).default(0)
  })
});

export type Denomination = z.infer<typeof denominationSchema>;

const safeRandomUUID = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback pure JS implementation
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// Cash box state - tracks current physical denominations
export const cashBox = sqliteTable("cash_box", {
  id: text("id").primaryKey().$defaultFn(() => safeRandomUUID()),
  denominations: text("denominations", { mode: 'json' }).$type<Denomination>().notNull(),
  totalAmount: integer("total_amount").notNull().default(0),
  lastUpdated: integer("last_updated", { mode: 'timestamp' }).notNull()
});

// Income records
export const incomes = sqliteTable("incomes", {
  id: text("id").primaryKey().$defaultFn(() => safeRandomUUID()),
  voucherId: integer("voucher_id").notNull().unique(),
  detail: text("detail").notNull(),
  denominations: text("denominations", { mode: 'json' }).$type<Denomination>().notNull(),
  totalAmount: integer("total_amount").notNull(),
  date: integer("date", { mode: 'timestamp' }).notNull(),
  createdAt: integer("created_at", { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  editedAt: integer("edited_at", { mode: 'timestamp' })
});

// Exit records (can be pending, partial, or completed)
export const exits = sqliteTable("exits", {
  id: text("id").primaryKey().$defaultFn(() => safeRandomUUID()),
  voucherId: integer("voucher_id").unique(),
  purpose: text("purpose").notNull(),
  initialAmount: integer("initial_amount").notNull(),
  denominationsGiven: text("denominations_given", { mode: 'json' }).$type<Denomination>().notNull(),
  isPending: integer("is_pending", { mode: 'boolean' }).notNull().default(true),
  renderedAmount: integer("rendered_amount").notNull().default(0),
  changeAmount: integer("change_amount").notNull().default(0),
  date: integer("date", { mode: 'timestamp' }).notNull(),
  createdAt: integer("created_at", { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  completedAt: integer("completed_at", { mode: 'timestamp' }),
  editedAt: integer("edited_at", { mode: 'timestamp' })
});

// Invoices for exits (can be added incrementally)
export const invoices = sqliteTable("invoices", {
  id: text("id").primaryKey().$defaultFn(() => safeRandomUUID()),
  exitId: text("exit_id").notNull().references(() => exits.id),
  voucherId: integer("voucher_id").notNull().unique(),
  detail: text("detail").notNull(),
  amount: integer("amount").notNull(),
  date: integer("date", { mode: 'timestamp' }).notNull(),
  createdAt: integer("created_at", { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
});

// Change given back during exit completion
export const changeRecords = sqliteTable("change_records", {
  id: text("id").primaryKey().$defaultFn(() => safeRandomUUID()),
  exitId: text("exit_id").notNull().references(() => exits.id),
  denominations: text("denominations", { mode: 'json' }).$type<Denomination>().notNull(),
  totalAmount: integer("total_amount").notNull(),
  createdAt: integer("created_at", { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
});

// Cash exchanges (ferear - swap bills without changing total)
export const cashExchanges = sqliteTable("cash_exchanges", {
  id: text("id").primaryKey().$defaultFn(() => safeRandomUUID()),
  denominationsIn: text("denominations_in", { mode: 'json' }).$type<Denomination>().notNull(),
  denominationsOut: text("denominations_out", { mode: 'json' }).$type<Denomination>().notNull(),
  totalAmount: integer("total_amount").notNull(),
  detail: text("detail"),
  createdAt: integer("created_at", { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
});

// Cash adjustments (arqueo de caja audit trail)
export const cashAdjustments = sqliteTable("cash_adjustments", {
  id: text("id").primaryKey().$defaultFn(() => safeRandomUUID()),
  previousDenominations: text("previous_denominations", { mode: 'json' }).$type<Denomination>().notNull(),
  newDenominations: text("new_denominations", { mode: 'json' }).$type<Denomination>().notNull(),
  previousTotal: integer("previous_total").notNull(),
  newTotal: integer("new_total").notNull(),
  difference: integer("difference").notNull(),
  createdAt: integer("created_at", { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
});

// System configuration
export const configuration = sqliteTable("configuration", {
  id: text("id").primaryKey().$defaultFn(() => safeRandomUUID()),
  nextVoucherNumber: integer("next_voucher_number").notNull().default(1),
  currentVoucherYear: integer("current_voucher_year").notNull().default(2025),
  storeName: text("store_name").notNull().default(""),
  currencyPrefix: text("currency_prefix").notNull().default("$"),
  taxId: text("tax_id").notNull().default(""),
  editWindowDays: integer("edit_window_days").notNull().default(20),
  confirmBeforeEdit: integer("confirm_before_edit", { mode: 'boolean' }).notNull().default(true),
  editHistory: integer("edit_history", { mode: 'boolean' }).notNull().default(true),
  lockClosedPeriods: integer("lock_closed_periods", { mode: 'boolean' }).notNull().default(false),
  backupPath: text("backup_path").notNull().default(""),
  backupOnClose: integer("backup_on_close", { mode: 'boolean' }).notNull().default(false),
  backupOnSave: integer("backup_on_save", { mode: 'boolean' }).notNull().default(true),
  backupRetention: integer("backup_retention").notNull().default(30),
  retentionEnabled: integer("retention_enabled", { mode: 'boolean' }).notNull().default(true),
  lastUpdated: integer("last_updated", { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
});

// Audit Logs for Edit History
export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey().$defaultFn(() => safeRandomUUID()),
  entityId: text("entity_id").notNull(),
  entityType: text("entity_type").notNull(), // 'income' or 'exit'
  action: text("action").notNull(), // 'edit', 'delete'
  previousData: text("previous_data", { mode: 'json' }),
  newData: text("new_data", { mode: 'json' }),
  createdAt: integer("created_at", { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
});

// Closed accounting periods
export const closedPeriods = sqliteTable("closed_periods", {
  id: text("id").primaryKey().$defaultFn(() => safeRandomUUID()),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  closedAt: integer("closed_at", { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
});

// Schema definitions for validation
export const insertIncomeSchema = createInsertSchema(incomes).omit({
  id: true,
  voucherId: true,
  totalAmount: true,
  createdAt: true,
  editedAt: true
}).extend({
  date: z.coerce.date()
});

export const insertExitSchema = createInsertSchema(exits).omit({
  id: true,
  initialAmount: true,
  isPending: true,
  renderedAmount: true,
  changeAmount: true,
  createdAt: true,
  completedAt: true,
  editedAt: true
}).extend({
  date: z.coerce.date()
});

export const insertInvoiceSchema = createInsertSchema(invoices).omit({
  id: true,
  voucherId: true,
  createdAt: true
}).extend({
  date: z.coerce.date()
});

export const completeExitSchema = z.object({
  exitId: z.string(),
  invoices: z.array(insertInvoiceSchema.omit({ exitId: true })),
  changeGiven: denominationSchema
});

// Partial completion: add invoices and/or change to an exit without requiring full balance
export const addToExitSchema = z.object({
  exitId: z.string(),
  invoices: z.array(insertInvoiceSchema.omit({ exitId: true })).optional(),
  changeGiven: denominationSchema.optional(),
  forceComplete: z.boolean().optional().default(false)
});

// Full exit update schema: purpose, date, denominationsGiven, and optional invoices/change
export const updateExitSchema = z.object({
  purpose: z.string(),
  date: z.coerce.date(),
  denominationsGiven: denominationSchema,
  invoices: z.array(z.object({
    id: z.string().optional(),
    voucherId: z.number().int().optional(),
    detail: z.string(),
    amount: z.number().int(),
    date: z.coerce.date()
  })).optional(),
  changeGiven: denominationSchema.optional()
});

// Full income update schema: detail, date, denominations, and optional voucherId
export const updateIncomeSchema = z.object({
  detail: z.string(),
  date: z.coerce.date(),
  denominations: denominationSchema,
  voucherId: z.number().int().optional()
});

// Cash exchange schema (ferear)
export const insertCashExchangeSchema = z.object({
  denominationsIn: denominationSchema,
  denominationsOut: denominationSchema,
  detail: z.string().optional()
});

export const updateConfigSchema = createInsertSchema(configuration).omit({
  id: true,
  lastUpdated: true
}).partial();

// Types
export type InsertIncome = z.infer<typeof insertIncomeSchema>;
export type InsertExit = z.infer<typeof insertExitSchema>;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type CompleteExit = z.infer<typeof completeExitSchema>;
export type AddToExit = z.infer<typeof addToExitSchema>;
export type UpdateExit = z.infer<typeof updateExitSchema>;
export type UpdateIncome = z.infer<typeof updateIncomeSchema>;
export type InsertCashExchange = z.infer<typeof insertCashExchangeSchema>;
export type UpdateConfig = z.infer<typeof updateConfigSchema>;

export type Income = typeof incomes.$inferSelect;
export type Exit = typeof exits.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type ChangeRecord = typeof changeRecords.$inferSelect;
export type CashBox = typeof cashBox.$inferSelect;
export type CashExchange = typeof cashExchanges.$inferSelect;
export type CashAdjustment = typeof cashAdjustments.$inferSelect;
export type Configuration = typeof configuration.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type ClosedPeriod = typeof closedPeriods.$inferSelect;

// User schema (keeping existing structure)
export const users = sqliteTable("users", {
  id: text("id").primaryKey().$defaultFn(() => safeRandomUUID()),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
