import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertIncomeSchema, 
  updateIncomeSchema,
  insertExitSchema, 
  completeExitSchema, 
  addToExitSchema,
  updateExitSchema,
  insertCashExchangeSchema,
  updateConfigSchema,
  denominationSchema 
} from "@shared/schema";
import { z } from "zod";
import multer from "multer";
import { generateExcelReport } from "./export";
import { processExcelImport } from "./import-service";
import { performBackup } from "./backup-service";
import Database from "better-sqlite3";
import { sqlite, runMigrations } from "./db";
import path from "path";
import fs from "fs";
import os from "os";

const upload = multer({ storage: multer.memoryStorage() });

function handleApiError(res: any, error: unknown, fallbackMessage: string) {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ message: "Datos inválidos", issues: error.issues });
  }
  if (error instanceof Error) {
    const message = error.message || fallbackMessage;
    const msg = message.toLowerCase();

    // Domain/business errors -> 400 (so the UI doesn't treat them as "server corruption")
    const clientFaultHints = [
      "no encontrado",
      "no se puede",
      "cierre inválido",
      "esta salida ya fue completada",
      "no se puede rendir más",
      "cambio inválido",
      "fondos insuficientes",
      "no se pueden modificar",
      "datos inválidos",
      "invalid",
      "invalid data",
    ];
    const isClientFault = clientFaultHints.some((h) => msg.includes(h));

    // Constraint violations (duplicate voucher, etc.) -> 409
    const isConstraintViolation =
      msg.includes("unique constraint") ||
      msg.includes("constraint failed") ||
      msg.includes("unique index") ||
      msg.includes("duplicate") ||
      msg.includes("unique");

    if (isConstraintViolation) {
      return res.status(409).json({ message });
    }

    if (isClientFault) {
      return res.status(400).json({ message });
    }

    return res.status(500).json({ message });
  }
  return res.status(500).json({ message: fallbackMessage });
}

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Cash box routes
  app.get("/api/cashbox", async (req, res) => {
    try {
      const cashBox = await storage.getCashBox();
      res.json(cashBox);
    } catch (error) {
      res.status(500).json({ message: "Failed to get cash box" });
    }
  });

  app.put("/api/cashbox", async (req, res) => {
    try {
      const denominations = denominationSchema.parse(req.body);
      const cashBox = await storage.updateCashBox(denominations);
      res.json(cashBox);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Invalid denomination data" });
    }
  });

  // Income routes
  app.get("/api/incomes", async (req, res) => {
    try {
      const incomes = await storage.getIncomes();
      res.json(incomes);
    } catch (error) {
      res.status(500).json({ message: "Failed to get incomes" });
    }
  });

  app.post("/api/incomes", async (req, res) => {
    try {
      const incomeData = insertIncomeSchema.parse(req.body);
      const income = await storage.createIncome(incomeData);
      res.json(income);
    } catch (error) {
      handleApiError(res, error, "Failed to create income");
    }
  });

  app.patch("/api/incomes/:id", async (req, res) => {
    try {
      const incomeData = updateIncomeSchema.parse(req.body);
      const income = await storage.updateIncome(req.params.id, incomeData);
      res.json(income);
    } catch (error) {
      handleApiError(res, error, "Failed to update income");
    }
  });

  app.delete("/api/incomes/:id", async (req, res) => {
    try {
      await storage.deleteIncome(req.params.id);
      res.json({ success: true });
    } catch (error) {
      handleApiError(res, error, "Failed to delete income");
    }
  });

  // Exit routes
  app.get("/api/exits", async (req, res) => {
    try {
      const exits = await storage.getExits();
      res.json(exits);
    } catch (error) {
      handleApiError(res, error, "Failed to get exits");
    }
  });

  app.get("/api/exits/pending", async (req, res) => {
    try {
      const exits = await storage.getPendingExits();
      res.json(exits);
    } catch (error) {
      handleApiError(res, error, "Failed to get pending exits");
    }
  });

  app.get("/api/exits/completed", async (req, res) => {
    try {
      const exits = await storage.getCompletedExits();
      res.json(exits);
    } catch (error) {
      handleApiError(res, error, "Failed to get completed exits");
    }
  });

  app.post("/api/exits", async (req, res) => {
    try {
      const exitData = insertExitSchema.parse(req.body);
      const exit = await storage.createExit(exitData);
      res.json(exit);
    } catch (error) {
      handleApiError(res, error, "Failed to create exit");
    }
  });

  app.patch("/api/exits/:id", async (req, res) => {
    try {
      const exitData = updateExitSchema.parse(req.body);
      const exit = await storage.updateExit(req.params.id, exitData);
      res.json(exit);
    } catch (error) {
      handleApiError(res, error, "Failed to update exit");
    }
  });

  app.delete("/api/exits/:id", async (req, res) => {
    try {
      await storage.deleteExit(req.params.id);
      res.json({ success: true });
    } catch (error) {
      handleApiError(res, error, "Failed to delete exit");
    }
  });

  // Full exit completion (backward compatible)
  app.post("/api/exits/complete", async (req, res) => {
    try {
      const completionData = completeExitSchema.parse(req.body);
      const exit = await storage.completeExit(completionData);
      res.json(exit);
    } catch (error) {
      handleApiError(res, error, "Failed to complete exit");
    }
  });

  // Incremental exit completion (add invoices/change without full balance)
  app.post("/api/exits/add", async (req, res) => {
    try {
      const addData = addToExitSchema.parse(req.body);
      const exit = await storage.addToExit(addData);
      res.json(exit);
    } catch (error) {
      handleApiError(res, error, "Failed to add exit data");
    }
  });

  // Invoice routes
  app.get("/api/exits/:exitId/invoices", async (req, res) => {
    try {
      const { exitId } = req.params;
      const invoices = await storage.getInvoicesByExitId(exitId);
      res.json(invoices);
    } catch (error) {
      res.status(500).json({ message: "Failed to get invoices" });
    }
  });

  // Change routes
  app.get("/api/exits/:exitId/change", async (req, res) => {
    try {
      const { exitId } = req.params;
      const changes = await storage.getChangeByExitId(exitId);
      res.json(changes);
    } catch (error) {
      res.status(500).json({ message: "Failed to get change record" });
    }
  });

  // Cash exchange routes (ferear)
  app.get("/api/cash-exchanges", async (req, res) => {
    try {
      const exchanges = await storage.getCashExchanges();
      res.json(exchanges);
    } catch (error) {
      res.status(500).json({ message: "Failed to get cash exchanges" });
    }
  });

  app.post("/api/cash-exchanges", async (req, res) => {
    try {
      const exchangeData = insertCashExchangeSchema.parse(req.body);
      const exchange = await storage.createCashExchange(exchangeData);
      res.json(exchange);
    } catch (error) {
      handleApiError(res, error, "Failed to create exchange");
    }
  });

  // Cash adjustment audit trail
  app.get("/api/cash-adjustments", async (req, res) => {
    try {
      const adjustments = await storage.getCashAdjustments();
      res.json(adjustments);
    } catch (error) {
      res.status(500).json({ message: "Failed to get cash adjustments" });
    }
  });

  // Configuration routes
  app.get("/api/configuration", async (req, res) => {
    try {
      const config = await storage.getConfiguration();
      res.json(config);
    } catch (error) {
      res.status(500).json({ message: "Failed to get configuration" });
    }
  });

  // Preview next voucher number without incrementing it (read-only)
  app.get("/api/configuration/next-voucher", async (req, res) => {
    try {
      const config = await storage.getConfiguration();
      // Return the already-synced next voucher number from config (no mutation)
      res.json({ nextVoucherNumber: config.nextVoucherNumber });
    } catch (error) {
      res.status(500).json({ message: "Failed to get next voucher" });
    }
  });

  app.put("/api/configuration", async (req, res) => {
    try {
      const configData = updateConfigSchema.parse(req.body);
      const config = await storage.updateConfiguration(configData);

      // Trigger backup on save if the option is active
      if (config.backupOnSave) {
        try {
          performBackup({
            backupPath: config.backupPath,
            backupRetention: config.backupRetention,
            retentionEnabled: config.retentionEnabled,
          });
        } catch (backupErr) {
          console.error('[Backup] backupOnSave error:', backupErr);
        }
      }

      res.json(config);
    } catch (error) {
      handleApiError(res, error, "Failed to update configuration");
    }
  });

  // Manual backup trigger (called by Electron main or renderer)
  app.post("/api/backup/now", async (req, res) => {
    try {
      const config = await storage.getConfiguration();
      const activePath = req.body?.backupPath !== undefined ? req.body.backupPath : config.backupPath;
      const result = performBackup({
        backupPath: activePath,
        backupRetention: config.backupRetention,
        retentionEnabled: config.retentionEnabled,
      });
      if (result.success) {
        res.json({ message: "Backup creado exitosamente", ...result });
      } else {
        res.status(500).json({ message: result.error || "Error al crear backup" });
      }
    } catch (error) {
      res.status(500).json({ message: "Error interno al crear backup" });
    }
  });

  // Report routes
  app.get("/api/reports/monthly", async (req, res) => {
    try {
      const year = parseInt(req.query.year as string);
      const month = parseInt(req.query.month as string);
      
      if (!year || !month || month < 1 || month > 12) {
        return res.status(400).json({ message: "Invalid year or month" });
      }
      
      const result = await storage.getMovementsByMonth(year, month);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to generate report" });
    }
  });

  app.get("/api/reports/download", async (req, res) => {
    try {
      const year = parseInt(req.query.year as string);
      const month = parseInt(req.query.month as string);
      
      if (!year || !month || month < 1 || month > 12) {
        return res.status(400).json({ message: "Invalid year or month" });
      }
      
      const { movements, previousBalance } = await storage.getMovementsByMonth(year, month);
      const buffer = await generateExcelReport(movements, previousBalance, year, month);
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="Caja_${month}_${year}.xlsx"`);
      res.send(buffer);
    } catch (error) {
      res.status(500).json({ message: "Failed to generate Excel report" });
    }
  });

  // Dashboard stats
  app.get("/api/dashboard/stats", async (req, res) => {
    try {
      const [cashBox, pendingExits, allIncomes, allExits] = await Promise.all([
        storage.getCashBox(),
        storage.getPendingExits(),
        storage.getIncomes(),
        storage.getCompletedExits()
      ]);
      
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      
      const todayIncomes = allIncomes.filter(income => 
        new Date(income.createdAt) >= startOfDay
      );
      
      const todayRevenue = todayIncomes.reduce((sum, income) => sum + income.totalAmount, 0);
      
      const totalIncomes = allIncomes.reduce((sum, inc) => sum + inc.totalAmount, 0);
      
      // We only subtract what was actually spent (renderedAmount). 
      // The change returned to the box is already included in the physical box total.
      const totalCompletedExits = allExits.reduce((sum, ext) => sum + (ext.renderedAmount ?? 0), 0);
      
      let totalPartialInvoices = 0;
      let totalTransitAmount = 0;
      
      for (const exit of pendingExits) {
        const invoicesAmount = exit.renderedAmount ?? 0;
        const changeAmount = exit.changeAmount ?? 0;
        
        totalPartialInvoices += invoicesAmount;
        // Transit amount is what hasn't been accounted for yet (Initial - Spent - Returned)
        totalTransitAmount += (exit.initialAmount - invoicesAmount - changeAmount);
      }
      
      // Theoretical Balance = Total Money In - Total Money Officially Spent (Closed + Partial)
      const theoreticalBalance = totalIncomes - totalCompletedExits - totalPartialInvoices;
      const physicalBalance = cashBox.totalAmount;
      const totalAssets = physicalBalance + totalTransitAmount;
      
      const discrepancy = totalAssets - theoreticalBalance;
      
      res.json({
        physicalBalance,
        theoreticalBalance,
        transitAmount: totalTransitAmount,
        discrepancy,
        pendingExitsCount: pendingExits.length,
        pendingAmount: totalTransitAmount, // Alias for UI fallback
        todayRevenue,
        recentMovements: [
          ...allIncomes.map(income => ({
            type: 'income',
            id: income.id,
            detail: income.detail,
            amount: income.totalAmount,
            voucherId: income.voucherId,
            date: income.createdAt
          })),
          ...allExits.map(exit => ({
            type: 'exit',
            id: exit.id,
            detail: exit.purpose,
            amount: exit.initialAmount,
            date: exit.createdAt
          })),
          ...pendingExits.map(exit => ({
            type: 'pending_exit',
            id: exit.id,
            detail: exit.purpose,
            amount: exit.initialAmount,
            date: exit.createdAt
          }))
        ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5)
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to get dashboard stats" });
    }
  });

  // Import endpoint
  app.post("/api/import-excel", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const mode = (req.query.mode as 'replace' | 'append') || 'replace';
      const result = await processExcelImport(req.file.buffer, mode);
      await storage.syncNextVoucherNumber();
      res.json({ message: "Import successful", ...result });
    } catch (error) {
      console.error("Import error:", error);
      res.status(500).json({ message: error instanceof Error ? error.message : "Failed to import excel file" });
    }
  });

  // DB Restore endpoint
  app.post("/api/import-db", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No se subió ningún archivo" });
      }

      if (req.file.originalname && !req.file.originalname.toLowerCase().endsWith('.db')) {
        return res.status(400).json({ message: "El archivo debe tener la extensión .db" });
      }

      // Write uploaded buffer to a temporary file
      const tempFilePath = path.join(os.tmpdir(), `temp-restore-${Date.now()}.db`);
      fs.writeFileSync(tempFilePath, req.file.buffer);

      try {
        const tempDb = new Database(tempFilePath);
        
        const appDataDir = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
        const defaultDataDir = path.join(appDataDir, 'CajaLumina', '.data');
        const dataDir = process.env.DATABASE_PATH || defaultDataDir;
        const mainDbPath = path.join(dataDir, 'cajaprofesional.db');

        // Simple validity check
        const tableCheck = tempDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='configuration'").get();
        if (!tableCheck) {
          tempDb.close();
          throw new Error("El archivo subido no contiene la estructura de base de datos de Caja Lumina.");
        }

        // Atomically copy all tables and pages into main database
        await tempDb.backup(mainDbPath);
        tempDb.close();

        // Self-heal and migrate the restored database immediately to the latest schema
        runMigrations(sqlite);

        // Invalidate cache by syncing voucher sequences
        await storage.syncNextVoucherNumber();

        res.json({ message: "Base de datos restaurada correctamente" });
      } finally {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      }
    } catch (error) {
      console.error("Restore backup error:", error);
      res.status(500).json({ message: error instanceof Error ? error.message : "Error al restaurar la base de datos" });
    }
  });

  // Audit Logs
  app.get("/api/audit-logs/:entityId", async (req, res) => {
    try {
      const logs = await storage.getAuditLogs(req.params.entityId);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch audit logs" });
    }
  });

  // Closed Periods
  app.get("/api/periods/closed", async (req, res) => {
    try {
      const periods = await storage.getClosedPeriods();
      res.json(periods);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch closed periods" });
    }
  });

  app.post("/api/periods/close", async (req, res) => {
    try {
      const { year, month } = req.body;
      if (!year || !month) {
        return res.status(400).json({ message: "Year and month are required" });
      }
      const closed = await storage.closePeriod(Number(year), Number(month));
      res.json(closed);
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : "Failed to close period" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
