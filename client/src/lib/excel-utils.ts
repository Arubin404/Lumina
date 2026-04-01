import * as XLSX from 'xlsx';

interface MonthlyMovement {
  type: string;
  date: string;
  voucherId: number;
  detail: string;
  inAmount: number;
  outAmount: number;
  createdAt: string;
}

export async function generateExcelReport(
  movements: MonthlyMovement[],
  year: number,
  month: number
): Promise<void> {
  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const monthName = monthNames[month - 1];
  const fileName = `Reporte_${monthName}_${year}.xlsx`;

  // Sort movements by date
  const sortedMovements = movements.sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // Prepare data for Excel
  const excelData: any[][] = [];

  // Header with month and year
  excelData.push([`REPORTE MENSUAL - ${monthName.toUpperCase()} ${year}`]);
  excelData.push([]); // Empty row

  // Column headers
  excelData.push([
    'Día',
    'Voucher',
    'Detalle',
    'Entrada de Dinero',
    'Salida de Dinero',
    'Balance Acumulado'
  ]);

  // Data rows with running balance calculation
  let runningBalance = 0;
  
  sortedMovements.forEach((movement) => {
    const day = new Date(movement.date).getDate();
    const voucherNumber = movement.voucherId ? movement.voucherId.toString().padStart(4, '0') : '';
    
    // Update running balance
    runningBalance += movement.inAmount - movement.outAmount;
    
    excelData.push([
      day,
      voucherNumber,
      movement.detail,
      movement.inAmount > 0 ? movement.inAmount : '',
      movement.outAmount > 0 ? movement.outAmount : '',
      runningBalance
    ]);
  });

  // Summary footer
  excelData.push([]); // Empty row
  excelData.push(['RESUMEN DEL MES']);
  
  const totalIncome = movements.reduce((sum, m) => sum + m.inAmount, 0);
  const totalExpenses = movements.reduce((sum, m) => sum + m.outAmount, 0);
  const netBalance = totalIncome - totalExpenses;
  
  excelData.push(['Total de Ingresos:', '', '', totalIncome, '', '']);
  excelData.push(['Total de Salidas:', '', '', '', totalExpenses, '']);
  excelData.push(['Balance Final en Caja:', '', '', '', '', netBalance]);
  excelData.push(['Número Total de Transacciones:', movements.length, '', '', '', '']);

  // Create workbook and worksheet
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(excelData);

  // Set column widths
  const colWidths = [
    { wch: 6 },  // Day
    { wch: 10 }, // Voucher
    { wch: 30 }, // Detail
    { wch: 15 }, // Income
    { wch: 15 }, // Expense
    { wch: 18 }  // Balance
  ];
  ws['!cols'] = colWidths;

  // Style the header
  const headerCellRef = XLSX.utils.encode_cell({ r: 0, c: 0 });
  if (!ws[headerCellRef]) ws[headerCellRef] = { t: 's', v: '' };
  ws[headerCellRef].s = {
    font: { bold: true, sz: 16 },
    alignment: { horizontal: 'center' }
  };

  // Style the column headers
  for (let c = 0; c < 6; c++) {
    const cellRef = XLSX.utils.encode_cell({ r: 2, c });
    if (!ws[cellRef]) continue;
    ws[cellRef].s = {
      font: { bold: true },
      fill: { fgColor: { rgb: 'E2E8F0' } },
      alignment: { horizontal: 'center' }
    };
  }

  // Format currency columns
  const currencyFormat = '#,##0.00_);[Red](#,##0.00)';
  
  // Apply currency formatting to income, expense, and balance columns
  for (let r = 3; r < excelData.length - 6; r++) {
    // Income column (D)
    const incomeRef = XLSX.utils.encode_cell({ r, c: 3 });
    if (ws[incomeRef] && typeof ws[incomeRef].v === 'number') {
      ws[incomeRef].s = { numFmt: currencyFormat };
    }
    
    // Expense column (E)
    const expenseRef = XLSX.utils.encode_cell({ r, c: 4 });
    if (ws[expenseRef] && typeof ws[expenseRef].v === 'number') {
      ws[expenseRef].s = { numFmt: currencyFormat };
    }
    
    // Balance column (F)
    const balanceRef = XLSX.utils.encode_cell({ r, c: 5 });
    if (ws[balanceRef] && typeof ws[balanceRef].v === 'number') {
      ws[balanceRef].s = { 
        numFmt: currencyFormat,
        font: { bold: true }
      };
    }
  }

  // Style summary section
  const summaryStartRow = excelData.length - 5;
  for (let r = summaryStartRow; r < excelData.length; r++) {
    for (let c = 0; c < 6; c++) {
      const cellRef = XLSX.utils.encode_cell({ r, c });
      if (!ws[cellRef]) continue;
      
      if (c === 0) {
        // Labels - bold
        ws[cellRef].s = { font: { bold: true } };
      } else if (typeof ws[cellRef].v === 'number') {
        // Numbers - currency format and bold
        ws[cellRef].s = { 
          numFmt: currencyFormat,
          font: { bold: true }
        };
      }
    }
  }

  // Merge header cell across all columns
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }
  ];

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, `${monthName} ${year}`);

  // Generate and download file
  try {
    XLSX.writeFile(wb, fileName);
  } catch (error) {
    console.error('Error generating Excel file:', error);
    throw new Error('Failed to generate Excel file');
  }
}

export function formatCurrencyForExcel(amount: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

export function validateExcelData(movements: MonthlyMovement[]): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!movements || movements.length === 0) {
    errors.push('No hay datos para generar el reporte');
    return { isValid: false, errors };
  }

  // Validate required fields
  movements.forEach((movement, index) => {
    if (!movement.detail || movement.detail.trim() === '') {
      errors.push(`Movimiento ${index + 1}: falta el detalle`);
    }

    if (typeof movement.inAmount !== 'number' || movement.inAmount < 0) {
      errors.push(`Movimiento ${index + 1}: monto de ingreso inválido`);
    }

    if (typeof movement.outAmount !== 'number' || movement.outAmount < 0) {
      errors.push(`Movimiento ${index + 1}: monto de salida inválido`);
    }

    if (!movement.date) {
      errors.push(`Movimiento ${index + 1}: falta la fecha`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors
  };
}
