import ExcelJS from 'exceljs';

export async function generateExcelReport(movements: any[], year: number, month: number): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const monthNames = [
    'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
    'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
  ];
  const monthName = monthNames[month - 1];

  const worksheet = workbook.addWorksheet(`${monthName} ${year}`);

  // Header rows
  worksheet.mergeCells('A1:F1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = `REPORTE MENSUAL - ${monthName} ${year}`;
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: 'center' };

  worksheet.addRow([]); // empty

  const columns = [
    { header: 'DÍA', key: 'dia', width: 10 },
    { header: 'VOUCHER', key: 'voucher', width: 15 },
    { header: 'DETALLE', key: 'detalle', width: 35 },
    { header: 'ENTRADA', key: 'entrada', width: 18, style: { numFmt: '"$"#,##0.00' } },
    { header: 'SALIDA', key: 'salida', width: 18, style: { numFmt: '"$"#,##0.00' } },
    { header: 'BALANCE ACUMULADO', key: 'balance', width: 22, style: { numFmt: '"$"#,##0.00' } }
  ];

  worksheet.columns = columns;

  const headerRow = worksheet.getRow(3);
  headerRow.font = { bold: true };
  headerRow.alignment = { horizontal: 'center' };
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE2E8F0' } // Light gray
    };
  });

  let accumulativeBalance = 0;
  let totalIncomes = 0;
  let totalExits = 0;

  for (const mov of movements) {
    const dia = new Date(mov.date).getDate();
    accumulativeBalance += (mov.inAmount - mov.outAmount);
    
    totalIncomes += mov.inAmount;
    totalExits += mov.outAmount;

    const row = worksheet.addRow({
      dia,
      voucher: mov.voucherId ? mov.voucherId.toString().padStart(4, '0') : '-',
      detalle: mov.detail,
      entrada: mov.inAmount > 0 ? mov.inAmount : null,
      salida: mov.outAmount > 0 ? mov.outAmount : null,
      balance: accumulativeBalance
    });

    if (mov.inAmount > 0) row.getCell('entrada').font = { color: { argb: 'FF000000' } };
    if (mov.outAmount > 0) row.getCell('salida').font = { color: { argb: 'FFFF0000' } };
  }

  // Summary logic
  worksheet.addRow([]);
  worksheet.addRow(['RESUMEN DEL MES']).font = { bold: true };
  worksheet.addRow(['Total de Ingresos:', '', '', totalIncomes]).font = { bold: true };
  worksheet.addRow(['Total de Salidas:', '', '', '', totalExits]).font = { bold: true };
  worksheet.addRow(['Balance Final en Caja:', '', '', '', '', (totalIncomes - totalExits)]).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as unknown as Buffer;
}
