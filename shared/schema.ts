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
    two: z.number().min(0).default(0),
    one: z.number().min(0).default(0)
  }),
  coins: z.object({
    five: z.number().min(0).default(0),
    two: z.number().min(0).default(0),
    one: z.number().min(0).default(0),
    fifty_cents: z.number().min(0).default(0),
    quarter: z.number().min(0).default(0),
    dime: z.number().min(0).default(0)
  })
});

export type Denomination = z.infer<typeof denominationSchema>;

// Cash box state - tracks current physical denominations
export const cashBox = sqliteTable("cash_box", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  denominations: text("denominations", { mode: 'json' }).$type<Denomination>().notNull(),
  totalAmount: real("total_amount").notNull().default(0),
  lastUpdated: integer("last_updated", { mode: 'timestamp' }).notNull()
});

// Income records
export const incomes = sqliteTable("incomes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  voucherId: integer("voucher_id").notNull(),
  detail: text("detail").notNull(),
  denominations: text("denominations", { mode: 'json' }).$type<Denomination>().notNull(),
  totalAmount: real("total_amount").notNull(),
  date: integer("date", { mode: 'timestamp' }).notNull(),
  createdAt: integer("created_at", { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  editedAt: integer("edited_at", { mode: 'timestamp' })
});

// Exit records (can be pending, partial, or completed)
export const exits = sqliteTable("exits", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  purpose: text("purpose").notNull(),
  initialAmount: real("initial_amount").notNull(),
  denominationsGiven: text("denominations_given", { mode: 'json' }).$type<Denomination>().notNull(),
  isPending: integer("is_pending", { mode: 'boolean' }).notNull().default(true),
  renderedAmount: real("rendered_amount").notNull().default(0),
  changeAmount: real("change_amount").notNull().default(0),
  date: integer("date", { mode: 'timestamp' }).notNull(),
  createdAt: integer("created_at", { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  completedAt: integer("completed_at", { mode: 'timestamp' }),
  editedAt: integer("edited_at", { mode: 'timestamp' })
});

// Invoices for exits (can be added incrementally)
export const invoices = sqliteTable("invoices", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  exitId: text("exit_id").notNull().references(() => exits.id),
  voucherId: integer("voucher_id").notNull(),
  detail: text("detail").notNull(),
  amount: real("amount").notNull(),
  date: integer("date", { mode: 'timestamp' }).notNull(),
  createdAt: integer("created_at", { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
});

// Change given back during exit completion
export const changeRecords = sqliteTable("change_records", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  exitId: text("exit_id").notNull().references(() => exits.id),
  denominations: text("denominations", { mode: 'json' }).$type<Denomination>().notNull(),
  totalAmount: real("total_amount").notNull(),
  createdAt: integer("created_at", { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
});

// Cash exchanges (ferear - swap bills without changing total)
export const cashExchanges = sqliteTable("cash_exchanges", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  denominationsIn: text("denominations_in", { mode: 'json' }).$type<Denomination>().notNull(),
  denominationsOut: text("denominations_out", { mode: 'json' }).$type<Denomination>().notNull(),
  totalAmount: real("total_amount").notNull(),
  detail: text("detail"),
  createdAt: integer("created_at", { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
});

// System configuration
export const configuration = sqliteTable("configuration", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  nextVoucherNumber: integer("next_voucher_number").notNull().default(1),
  lastUpdated: integer("last_updated", { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
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

// Cash exchange schema (ferear)
export const insertCashExchangeSchema = z.object({
  denominationsIn: denominationSchema,
  denominationsOut: denominationSchema,
  detail: z.string().optional()
});

export const updateConfigSchema = createInsertSchema(configuration).omit({
  id: true,
  lastUpdated: true
});

// Types
export type InsertIncome = z.infer<typeof insertIncomeSchema>;
export type InsertExit = z.infer<typeof insertExitSchema>;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type CompleteExit = z.infer<typeof completeExitSchema>;
export type AddToExit = z.infer<typeof addToExitSchema>;
export type InsertCashExchange = z.infer<typeof insertCashExchangeSchema>;
export type UpdateConfig = z.infer<typeof updateConfigSchema>;

export type Income = typeof incomes.$inferSelect;
export type Exit = typeof exits.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type ChangeRecord = typeof changeRecords.$inferSelect;
export type CashBox = typeof cashBox.$inferSelect;
export type CashExchange = typeof cashExchanges.$inferSelect;
export type Configuration = typeof configuration.$inferSelect;

// User schema (keeping existing structure)
export const users = sqliteTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
