import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertIncomeSchema, 
  insertExitSchema, 
  completeExitSchema, 
  addToExitSchema,
  insertCashExchangeSchema,
  updateConfigSchema,
  denominationSchema 
} from "@shared/schema";
import { z } from "zod";
import { generateExcelReport } from "./export";

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
      res.status(400).json({ message: error instanceof Error ? error.message : "Invalid income data" });
    }
  });

  app.patch("/api/incomes/:id", async (req, res) => {
    try {
      const incomeData = insertIncomeSchema.parse(req.body);
      const income = await storage.updateIncome(req.params.id, incomeData);
      res.json(income);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Invalid income data" });
    }
  });

  app.delete("/api/incomes/:id", async (req, res) => {
    try {
      await storage.deleteIncome(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to delete income" });
    }
  });

  // Exit routes
  app.get("/api/exits", async (req, res) => {
    try {
      const exits = await storage.getExits();
      res.json(exits);
    } catch (error) {
      res.status(500).json({ message: "Failed to get exits" });
    }
  });

  app.get("/api/exits/pending", async (req, res) => {
    try {
      const exits = await storage.getPendingExits();
      res.json(exits);
    } catch (error) {
      res.status(500).json({ message: "Failed to get pending exits" });
    }
  });

  app.get("/api/exits/completed", async (req, res) => {
    try {
      const exits = await storage.getCompletedExits();
      res.json(exits);
    } catch (error) {
      res.status(500).json({ message: "Failed to get completed exits" });
    }
  });

  app.post("/api/exits", async (req, res) => {
    try {
      const exitData = insertExitSchema.parse(req.body);
      const exit = await storage.createExit(exitData);
      res.json(exit);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Invalid exit data" });
    }
  });

  app.patch("/api/exits/:id", async (req, res) => {
    try {
      const exitData = insertExitSchema.parse(req.body);
      const exit = await storage.updateExit(req.params.id, exitData);
      res.json(exit);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Invalid exit data" });
    }
  });

  app.delete("/api/exits/:id", async (req, res) => {
    try {
      await storage.deleteExit(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to delete exit" });
    }
  });

  // Full exit completion (backward compatible)
  app.post("/api/exits/complete", async (req, res) => {
    try {
      const completionData = completeExitSchema.parse(req.body);
      const exit = await storage.completeExit(completionData);
      res.json(exit);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Invalid completion data" });
    }
  });

  // Incremental exit completion (add invoices/change without full balance)
  app.post("/api/exits/add", async (req, res) => {
    try {
      const addData = addToExitSchema.parse(req.body);
      const exit = await storage.addToExit(addData);
      res.json(exit);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Invalid data" });
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
      const change = await storage.getChangeByExitId(exitId);
      res.json(change);
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
      res.status(400).json({ message: error instanceof Error ? error.message : "Invalid exchange data" });
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

  app.put("/api/configuration", async (req, res) => {
    try {
      const configData = updateConfigSchema.parse(req.body);
      const config = await storage.updateConfiguration(configData);
      res.json(config);
    } catch (error) {
      res.status(400).json({ message: "Invalid configuration data" });
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
      
      const movements = await storage.getMovementsByMonth(year, month);
      res.json(movements);
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
      
      const movements = await storage.getMovementsByMonth(year, month);
      const buffer = await generateExcelReport(movements, year, month);
      
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
      const cashBox = await storage.getCashBox();
      const pendingExits = await storage.getPendingExits();
      const allIncomes = await storage.getIncomes();
      const allExits = await storage.getCompletedExits();
      
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      
      const todayIncomes = allIncomes.filter(income => 
        new Date(income.createdAt) >= startOfDay
      );
      
      const todayRevenue = todayIncomes.reduce((sum, income) => sum + income.totalAmount, 0);
      
      const totalIncomes = allIncomes.reduce((sum, inc) => sum + inc.totalAmount, 0);
      const totalCompletedExits = allExits.reduce((sum, ext) => sum + ext.initialAmount, 0);
      
      let totalPartialInvoices = 0;
      let totalTransitAmount = 0;
      
      for (const exit of pendingExits) {
        const invoicesAmount = exit.renderedAmount || 0;
        const changeAmount = exit.changeAmount || 0;
        
        totalPartialInvoices += invoicesAmount;
        totalTransitAmount += (exit.initialAmount - invoicesAmount - changeAmount);
      }
      
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
          ...todayIncomes.slice(0, 3).map(income => ({
            type: 'income',
            id: income.id,
            detail: income.detail,
            amount: income.totalAmount,
            voucherId: income.voucherId,
            date: income.createdAt
          })),
          ...pendingExits.slice(0, 2).map(exit => ({
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

  const httpServer = createServer(app);
  return httpServer;
}
