import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Download, Calendar, BarChart3, FileText, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/denomination-utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface MonthlyMovement {
  type: string;
  date: string;
  voucherId: number;
  detail: string;
  inAmount: number;
  outAmount: number;
  createdAt: string;
}

export default function Reportes() {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState((new Date().getMonth() + 1).toString());
  const [isGenerating, setIsGenerating] = useState(false);
  
  const { toast } = useToast();

  const { data: movements, isLoading } = useQuery<MonthlyMovement[]>({
    queryKey: [`/api/reports/monthly?year=${selectedYear}&month=${selectedMonth}`],
    enabled: !!selectedYear && !!selectedMonth,
  });

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
  const months = [
    { value: "1", label: "Enero" },
    { value: "2", label: "Febrero" },
    { value: "3", label: "Marzo" },
    { value: "4", label: "Abril" },
    { value: "5", label: "Mayo" },
    { value: "6", label: "Junio" },
    { value: "7", label: "Julio" },
    { value: "8", label: "Agosto" },
    { value: "9", label: "Septiembre" },
    { value: "10", label: "Octubre" },
    { value: "11", label: "Noviembre" },
    { value: "12", label: "Diciembre" },
  ];

  const handleGenerateReport = async () => {
    if (!movements || movements.length === 0) {
      toast({
        title: "Error",
        description: "No hay datos para generar el reporte",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch(`/api/reports/download?year=${selectedYear}&month=${selectedMonth}`);
      if (!response.ok) throw new Error("Failed to download Excel");
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Reporte_${selectedMonth}_${selectedYear}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Reporte generado",
        description: "El archivo Excel se ha descargado correctamente",
      });
    } catch (error) {
      toast({
        title: "Error al generar reporte",
        description: "Ocurrió un error al descargar el archivo Excel",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Calculate statistics
  const totalIncome = movements?.reduce((sum, m) => sum + m.inAmount, 0) || 0;
  const totalExpenses = movements?.reduce((sum, m) => sum + m.outAmount, 0) || 0;
  const netBalance = totalIncome - totalExpenses;
  const transactionCount = movements?.length || 0;

  // Group movements by day for daily breakdown
  const dailyBreakdown = movements?.reduce((acc, movement) => {
    const day = new Date(movement.date).getDate();
    if (!acc[day]) {
      acc[day] = { income: 0, expenses: 0, transactions: 0 };
    }
    acc[day].income += movement.inAmount;
    acc[day].expenses += movement.outAmount;
    acc[day].transactions += 1;
    return acc;
  }, {} as Record<number, { income: number; expenses: number; transactions: number }>) || {};

  const selectedMonthName = months.find(m => m.value === selectedMonth)?.label || "";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Cargando reporte...</div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-card border-b border-border px-8 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Reportes</h2>
            <p className="text-muted-foreground">Generación de reportes mensuales en Excel</p>
          </div>
          <Button
            onClick={handleGenerateReport}
            disabled={isGenerating || !movements?.length}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
            data-testid="button-generate-report"
          >
            {isGenerating ? (
              "Generando..."
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Descargar Excel
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="p-8 space-y-6">
        {/* Report Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Calendar className="mr-2 h-5 w-5" />
              Seleccionar Período
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium text-foreground">Año</Label>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger data-testid="select-year">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((year) => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm font-medium text-foreground">Mes</Label>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger data-testid="select-month">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map((month) => (
                      <SelectItem key={month.value} value={month.value}>
                        {month.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Monthly Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-sm font-medium">Total Ingresos</p>
                  <p className="text-2xl font-bold text-success">{formatCurrency(totalIncome)}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {selectedMonthName} {selectedYear}
                  </p>
                </div>
                <div className="w-12 h-12 bg-success/10 rounded-lg flex items-center justify-center">
                  <TrendingUp className="text-success h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-sm font-medium">Total Salidas</p>
                  <p className="text-2xl font-bold text-destructive">{formatCurrency(totalExpenses)}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Solo facturas completadas
                  </p>
                </div>
                <div className="w-12 h-12 bg-destructive/10 rounded-lg flex items-center justify-center">
                  <TrendingDown className="text-destructive h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-sm font-medium">Balance Neto</p>
                  <p className={`text-2xl font-bold ${netBalance >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {formatCurrency(netBalance)}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Ingresos - Salidas
                  </p>
                </div>
                <div className={`w-12 h-12 ${netBalance >= 0 ? 'bg-success/10' : 'bg-destructive/10'} rounded-lg flex items-center justify-center`}>
                  <BarChart3 className={`${netBalance >= 0 ? 'text-success' : 'text-destructive'} h-6 w-6`} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-sm font-medium">Transacciones</p>
                  <p className="text-2xl font-bold text-foreground">{transactionCount}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Total de movimientos
                  </p>
                </div>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <FileText className="text-primary h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Ledger Table */}
        <Card className="flex flex-col overflow-hidden h-full max-h-[800px]">
          <CardHeader className="border-b bg-muted/20">
            <div className="flex items-center justify-between">
              <CardTitle>Libro Mayor Mensual - {selectedMonthName} {selectedYear}</CardTitle>
              <div className="text-sm font-medium px-3 py-1 bg-primary/10 text-primary rounded-full">
                {transactionCount} registros contables
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-auto flex-1 h-[500px]">
            {!movements?.length ? (
              <div className="text-center py-16 text-muted-foreground flex flex-col items-center justify-center">
                <FileText className="h-12 w-12 text-muted-foreground/30 mb-4" />
                No existen facturas ni ingresos para el período del {selectedMonthName} de {selectedYear}.
              </div>
            ) : (
              <Table>
                <TableHeader className="sticky top-0 bg-background shadow-sm z-10">
                  <TableRow>
                    <TableHead className="w-[100px]">Día</TableHead>
                    <TableHead className="w-[120px]">Voucher</TableHead>
                    <TableHead>Detalle / Movimiento</TableHead>
                    <TableHead className="text-right w-[150px]">Ingreso / Entrada</TableHead>
                    <TableHead className="text-right w-[150px]">Gasto / Salida</TableHead>
                    <TableHead className="text-right w-[150px]">Balance Contable</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.map((movement, index) => {
                    const runningBalance = movements.slice(0, index + 1).reduce((sum, m) => sum + m.inAmount - m.outAmount, 0);
                    return (
                      <TableRow key={index} className="hover:bg-muted/50 transition-colors">
                        <TableCell className="font-medium text-muted-foreground">
                          {new Date(movement.date).toLocaleDateString("es-ES", { day: '2-digit', month: 'short' })}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          #{movement.voucherId?.toString().padStart(4, "0") || "-"}
                        </TableCell>
                        <TableCell className="font-medium">
                          {movement.detail}
                        </TableCell>
                        <TableCell className="text-right text-success font-medium">
                          {movement.inAmount > 0 ? `+ ${formatCurrency(movement.inAmount)}` : "-"}
                        </TableCell>
                        <TableCell className="text-right text-destructive font-medium">
                          {movement.outAmount > 0 ? `- ${formatCurrency(movement.outAmount)}` : "-"}
                        </TableCell>
                        <TableCell className={`text-right font-bold ${runningBalance >= 0 ? "text-success" : "text-destructive"}`}>
                          {formatCurrency(runningBalance)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
