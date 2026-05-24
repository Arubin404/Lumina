import ExcelJS from 'exceljs';

export async function generateExcelReport(movements: any[], previousBalance: number = 0, year: number, month: number): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const monthNames = [
    'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
    'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
  ];
  const monthName = monthNames[month - 1];

  const worksheet = workbook.addWorksheet(`${monthName} ${year}`);

  // Freeze the header row (row 3)
  worksheet.views = [
    { state: 'frozen', xSplit: 0, ySplit: 3 }
  ];

  // First define the columns so ExcelJS knows the keys and styles
  // This automatically adds headers to Row 1
  worksheet.columns = [
    { header: 'DÍA', key: 'dia', width: 10 },
    { header: 'VOUCHER', key: 'voucher', width: 15 },
    { header: 'DETALLE', key: 'detalle', width: 40 },
    { header: 'ENTRADA', key: 'entrada', width: 18, style: { numFmt: '"$"#,##0.00' } },
    { header: 'SALIDA', key: 'salida', width: 18, style: { numFmt: '"$"#,##0.00' } },
    { header: 'BALANCE ACUMULADO', key: 'balance', width: 22, style: { numFmt: '"$"#,##0.00' } }
  ];

  // Insert two empty rows at the top to push headers to Row 3
  worksheet.spliceRows(1, 0, [], []);

  // Now row 1 and 2 are empty, and headers are in row 3.
  // Merge A1:F1 for the title
  worksheet.mergeCells('A1:F1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = `REPORTE MENSUAL - ${monthName} ${year}`;
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: 'center' };

  const headerRow = worksheet.getRow(3);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.alignment = { horizontal: 'center' };
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F2937' } // Dark grayish blue header
    };
  });

  // Enable AutoFilter for the table
  worksheet.autoFilter = 'A3:F3';

  let totalIncomes = 0;
  let totalExits = 0;
  let currentRowNum = 4; // Data starts at row 4

  // Add Previous Balance Row
  worksheet.addRow({
    dia: '-',
    voucher: '-',
    detalle: 'BALANCE ANTERIOR',
    entrada: undefined,
    salida: undefined,
    balance: (previousBalance / 100)
  });
  
  const prevBalanceRow = worksheet.getRow(currentRowNum);
  prevBalanceRow.font = { italic: true, color: { argb: 'FF6B7280' } }; // Gray italic
  prevBalanceRow.getCell('balance').font = { bold: true, italic: false, color: { argb: previousBalance >= 0 ? 'FF15803D' : 'FFDC2626' } };
  
  currentRowNum++;

  for (let i = 0; i < movements.length; i++) {
    const mov = movements[i];
    const dia = new Date(mov.date).getDate();
    
    totalIncomes += mov.inAmount;
    totalExits += mov.outAmount;

    const inAmountDollars = mov.inAmount > 0 ? mov.inAmount / 100 : undefined;
    const outAmountDollars = mov.outAmount > 0 ? mov.outAmount / 100 : undefined;

    worksheet.addRow({
      dia,
      voucher: mov.voucherId ? mov.voucherId.toString().padStart(4, '0') : '-',
      detalle: mov.detail,
      entrada: inAmountDollars,
      salida: outAmountDollars
    });

    const addedRow = worksheet.getRow(currentRowNum);

    // Styling values
    if (mov.inAmount > 0) addedRow.getCell('entrada').font = { color: { argb: 'FF15803D' } }; // Green
    if (mov.outAmount > 0) addedRow.getCell('salida').font = { color: { argb: 'FFDC2626' } }; // Red

    // Zebra stripes (offset by 1 because of balance row)
    if ((i + 1) % 2 !== 0) {
      addedRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF3F4F6' } // Very light gray
        };
      });
    }

    // Dynamic Balance Formula
    const balanceCell = addedRow.getCell('balance');
    balanceCell.value = { formula: `SUM(F${currentRowNum-1}, D${currentRowNum}) - SUM(E${currentRowNum})` } as any;

    currentRowNum++;
  }

  // Summary Row styling
  const summaryStartRow = currentRowNum + 1;
  worksheet.addRow([]);
  worksheet.addRow(['RESUMEN DEL MES']).font = { bold: true };
  worksheet.addRow(['Total de Ingresos:', '', '', { formula: `SUM(D5:D${currentRowNum - 1})` }]).font = { bold: true };
  worksheet.addRow(['Total de Salidas:', '', '', '', { formula: `SUM(E5:E${currentRowNum - 1})` }]).font = { bold: true };
  
  const finalSummaryRow = worksheet.addRow(['Balance Final en Caja:', '', '', '', '', { formula: `F${currentRowNum - 1}` }]);
  finalSummaryRow.font = { bold: true, size: 12 };
  finalSummaryRow.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF08A' } }; // Highlight yellow

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as unknown as Buffer;
}
