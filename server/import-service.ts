import xlsx from 'xlsx';
import { db } from './db';
import { incomes, exits, invoices, changeRecords, configuration } from '@shared/schema';
import * as schema from '@shared/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

const MONTH_MAP: Record<string, number> = {
  'ENE': 0, 'ENERO': 0, 'ENERO2025': 0,
  'FEB': 1, 'FEBRERO': 1, 'FEB ': 1,
  'MAR': 2, 'MARZO': 2, 'MARZ': 2,
  'ABR': 3, 'ABRIL': 3, 'ABRI': 3,
  'MAY': 4, 'MAYO': 4,
  'JUN': 5, 'JUNIO': 5,
  'JUL': 6, 'JULIO': 6,
  'AGO': 7, 'AGOSTO': 7,
  'SEP': 8, 'SEPTIEMBRE': 8,
  'OCT': 9, 'OCTUBRE': 9,
  'NOV': 10, 'NOVIEMBRE': 10,
  'DIC': 11, 'DICIEMBRE': 11
};

export async function processExcelImport(fileBuffer: Buffer, mode: 'replace' | 'append' = 'replace') {
  console.log(`Processing Excel import in ${mode} mode...`);
  const workbook = xlsx.read(fileBuffer, { type: 'buffer' });

  const emptyDenominations = {
    bills: { hundred: 0, fifty: 0, twenty: 0, ten: 0, five: 0, one: 0 },
    coins: { one: 0, fifty_cents: 0, quarter: 0, dime: 0, nickel: 0, penny: 0 }
  };

  const incomeRows: any[] = [];
  const exitRows: any[] = [];
  let firstAperturaFound = false;

  const existingIncomes = mode === 'append' ? await db.select().from(incomes) : [];
  const existingExits = mode === 'append' ? await db.select().from(exits) : [];

  const existingIncomeSet = new Set(existingIncomes.map(e => `${new Date(e.date).getTime()}-${e.totalAmount}-${e.detail}`));
  const existingExitSet = new Set(existingExits.map(e => `${new Date(e.date).getTime()}-${e.initialAmount}-${e.purpose}`));

  const isDuplicateIncome = (row: any) => {
    return existingIncomeSet.has(`${new Date(row.date).getTime()}-${row.totalAmount}-${row.detail}`);
  };

  const isDuplicateExit = (row: any) => {
    return existingExitSet.has(`${new Date(row.date).getTime()}-${row.initialAmount}-${row.purpose}`);
  };

  for (const sheetName of workbook.SheetNames) {
    const monthKey = sheetName.toUpperCase().trim();
    let monthNumber = -1;

    // Find month number by checking keys
    for (const [key, num] of Object.entries(MONTH_MAP)) {
      if (monthKey.includes(key)) {
        monthNumber = num;
        break;
      }
    }

    if (monthNumber === -1) {
      console.log(`Skipping sheet ${sheetName} - not a recognized month`);
      continue;
    }

    const data: any[][] = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null });
    if (data.length < 2) continue;

    console.log(`Processing ${sheetName}...`);

    let year = 2025;
    const firstRowStr = data[0].join(' ').toUpperCase();
    if (firstRowStr.includes('2024')) year = 2024;
    if (firstRowStr.includes('2025')) year = 2025;
    if (firstRowStr.includes('2026')) year = 2026;

    let entradaIdx = 3;
    let salidaIdx = 4;
    for (let r = 0; r < Math.min(5, data.length); r++) {
      for (let c = 0; c < data[r].length; c++) {
        const cellText = String(data[r][c] || '').toUpperCase();
        if (cellText.includes('ENTRADA')) entradaIdx = c;
        if (cellText.includes('SALIDA')) salidaIdx = c;
      }
    }

    let currentDay = 1;

    for (let i = 2; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length < 5) continue;

      const rawDay = row[0];
      const voucher = row[1];
      const detail = row[2];
      const entrada = parseFloat(row[entradaIdx]);
      const salida = parseFloat(row[salidaIdx]);
      const fullRowText = row.join(' ').toUpperCase();

      if (
        fullRowText.includes('SALIDAS TOTAL') ||
        fullRowText.includes('BALANCE FINAL') ||
        fullRowText === 'TOTAL' ||
        (detail && String(detail).trim().toUpperCase() === 'TOTAL')
      ) {
        continue;
      }

      if (fullRowText.includes('APERTURA')) {
        if (!firstAperturaFound) {
          firstAperturaFound = true;
        } else {
          continue;
        }
      }

      if ((isNaN(entrada) || entrada <= 0) && (isNaN(salida) || salida <= 0)) continue;

      let currentMonth = monthNumber;
      let currentYear = year;

      if (rawDay !== null) {
        if (typeof rawDay === 'number' && rawDay > 1000) {
          const jsDate = new Date(Math.round((rawDay - 25569) * 86400 * 1000));
          currentDay = jsDate.getDate();
          currentMonth = jsDate.getMonth();
          currentYear = jsDate.getFullYear();
        } else if (typeof rawDay === 'string' && rawDay.includes('/')) {
          const parts = rawDay.split('/');
          if (parts.length >= 1) currentDay = parseInt(parts[0]);
          if (parts.length >= 2) currentMonth = parseInt(parts[1]) - 1;
          if (parts.length === 3) {
            currentYear = parseInt(parts[2]);
            if (currentYear < 100) currentYear += 2000;
          }
        } else if (!isNaN(parseInt(rawDay as string))) {
          currentDay = parseInt(rawDay as string);
        }
      }

      if (isNaN(currentDay) || currentDay < 1) currentDay = 1;
      if (currentDay > 31) currentDay = 31;

      const secondsOffset = i % 60;
      const date = new Date(currentYear, currentMonth, currentDay, 12, 0, secondsOffset);

      if (!isNaN(entrada) && entrada > 0) {
        const row = {
          id: crypto.randomUUID(),
          voucherId: parseInt(voucher) || 0,
          detail: detail ? String(detail) : 'Ingreso Histórico',
          denominations: emptyDenominations,
          totalAmount: Math.round(entrada * 100), // Convert to cents
          date,
          createdAt: date
        };
        if (!isDuplicateIncome(row)) {
          incomeRows.push(row);
        }
      }

      if (!isNaN(salida) && salida > 0) {
        const row = {
          id: crypto.randomUUID(),
          voucherId: parseInt(voucher) || undefined,
          purpose: detail ? String(detail) : 'Salida Histórica',
          initialAmount: Math.round(salida * 100), // Convert to cents
          denominationsGiven: emptyDenominations,
          isPending: false,
          renderedAmount: Math.round(salida * 100), // Convert to cents
          changeAmount: 0,
          date,
          createdAt: date,
          completedAt: date
        };
        if (!isDuplicateExit(row)) {
          exitRows.push(row);
        }
      }
    }
  }

  return db.transaction((tx) => {
    if (mode === 'replace') {
      tx.delete(invoices).run();
      tx.delete(changeRecords).run();
      tx.delete(incomes).run();
      tx.delete(exits).run();
    }

    // Get current voucher sequence
    const [config] = tx.select().from(schema.configuration).limit(1).all();
    let nextVoucher = config?.nextVoucherNumber || 1;

    // Process incomes: assign voucher if missing
    if (incomeRows.length > 0) {
      const processedIncomes = incomeRows.map(row => {
        if (!row.voucherId || row.voucherId === 0) {
          return { ...row, voucherId: nextVoucher++ };
        }
        return row;
      });
      tx.insert(incomes).values(processedIncomes).run();
    }

    // Process exits: assign voucher if missing
    if (exitRows.length > 0) {
      const processedExits = exitRows.map(row => {
        if (!row.voucherId || row.voucherId === 0) {
          return { ...row, voucherId: nextVoucher++ };
        }
        return row;
      });
      tx.insert(exits).values(processedExits).run();
    }

    // Update global sequence
    if (config) {
      tx.update(schema.configuration)
        .set({ nextVoucherNumber: nextVoucher, lastUpdated: new Date() })
        .where(eq(schema.configuration.id, config.id))
        .run();
    }

    // Synchronize Cash Box total with imported data
    const importNetBalance = incomeRows.reduce((sum, r) => sum + r.totalAmount, 0) - 
                             exitRows.reduce((sum, r) => sum + r.renderedAmount, 0);
    
    const [box] = tx.select().from(schema.cashBox).limit(1).all();
    if (box) {
      const finalBalance = mode === 'replace' ? importNetBalance : (box.totalAmount + importNetBalance);
      
      tx.update(schema.cashBox)
        .set({ 
          totalAmount: finalBalance, 
          lastUpdated: new Date(),
          // Re-calculate placeholder denominations based on final balance
          denominations: {
            bills: { hundred: 0, fifty: 0, twenty: 0, ten: 0, five: 0, one: Math.floor(finalBalance / 100) },
            coins: { one: 0, fifty_cents: 0, quarter: 0, dime: 0, nickel: 0, penny: finalBalance % 100 }
          }
        })
        .where(eq(schema.cashBox.id, box.id))
        .run();
    }
  });

  return { totalIncomes: incomeRows.length, totalExits: exitRows.length };
}
