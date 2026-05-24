import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Download, Calendar, BarChart3, FileText, TrendingUp, TrendingDown, Lock, Unlock } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  voucherId: number | null;
  detail: string;
  inAmount: number;
  outAmount: number;
  createdAt: string;
}

interface ClosedPeriod {
  year: number;
  month: number;
}

export default function Reportes() {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState((new Date().getMonth() + 1).toString());
  const [isGenerating, setIsGenerating] = useState(false);
  const [showCloseConfirmModal, setShowCloseConfirmModal] = useState(false);
  
  const { toast } = useToast();

  const { data, isLoading } = useQuery<{ movements: MonthlyMovement[], previousBalance: number }>({
    queryKey: [`/api/reports/monthly?year=${selectedYear}&month=${selectedMonth}`],
    enabled: !!selectedYear && !!selectedMonth,
  });

  const { data: closedPeriods } = useQuery<ClosedPeriod[]>({
    queryKey: ["/api/periods/closed"],
  });

  const queryClient = useQueryClient();

  const isPeriodClosed = closedPeriods?.some(cp => cp.year === Number(selectedYear) && cp.month === Number(selectedMonth));

  const closePeriodMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/periods/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: selectedYear, month: selectedMonth }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Error al cerrar el período");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Período cerrado", description: "El período ha sido cerrado exitosamente y no podrá ser modificado." });
      queryClient.invalidateQueries({ queryKey: ["/api/periods/closed"] });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const handleClosePeriod = () => {
    setShowCloseConfirmModal(true);
  };

  const movements = data?.movements || [];
  const previousBalance = data?.previousBalance || 0;

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
          <div className="flex items-center gap-3">
            <Button
              onClick={handleClosePeriod}
              disabled={isPeriodClosed || !movements?.length || closePeriodMutation.isPending}
              variant={isPeriodClosed ? "outline" : "secondary"}
              className={isPeriodClosed ? "text-success border-success/30 bg-success/10" : "bg-destructive/10 text-destructive hover:bg-destructive/20"}
            >
              {isPeriodClosed ? (
                <>
                  <Lock className="mr-2 size-4" />
                  Período Cerrado
                </>
              ) : (
                <>
                  <Unlock className="mr-2 size-4" />
                  Cerrar Período Contable
                </>
              )}
            </Button>
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
                  <Download className="mr-2 size-4" />
                  Descargar Excel
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="p-8 space-y-6">
        {/* Report Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Calendar className="mr-2 size-5" />
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
                <div className="size-12 bg-success/10 rounded-lg flex items-center justify-center">
                  <TrendingUp className="text-success size-6" />
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
                <div className="size-12 bg-destructive/10 rounded-lg flex items-center justify-center">
                  <TrendingDown className="text-destructive size-6" />
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
                <div className={`size-12 ${netBalance >= 0 ? 'bg-success/10' : 'bg-destructive/10'} rounded-lg flex items-center justify-center`}>
                  <BarChart3 className={`${netBalance >= 0 ? 'text-success' : 'text-destructive'} size-6`} />
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
                <div className="size-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <FileText className="text-primary size-6" />
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
                <FileText className="size-12 text-muted-foreground/30 mb-4" />
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
                  <TableRow className="bg-muted/30">
                    <TableCell className="font-medium text-muted-foreground">-</TableCell>
                    <TableCell className="font-mono text-sm">-</TableCell>
                    <TableCell className="font-medium text-muted-foreground italic">BALANCE ANTERIOR</TableCell>
                    <TableCell className="text-right">-</TableCell>
                    <TableCell className="text-right">-</TableCell>
                    <TableCell className={`text-right font-bold ${previousBalance >= 0 ? "text-success" : "text-destructive"}`}>
                      {formatCurrency(previousBalance)}
                    </TableCell>
                  </TableRow>
                  {(() => {
                    let currentRunningBalance = previousBalance;
                    return movements.map((movement, index) => {
                      currentRunningBalance += movement.inAmount - movement.outAmount;
                      return (
                        <TableRow key={`${movement.type}-${movement.voucherId}-${movement.createdAt || movement.date}-${index}`} className="hover:bg-muted/50 transition-colors">
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
                          <TableCell className={`text-right font-bold ${currentRunningBalance >= 0 ? "text-success" : "text-destructive"}`}>
                            {formatCurrency(currentRunningBalance)}
                          </TableCell>
                        </TableRow>
                      );
                    });
                  })()}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={showCloseConfirmModal} onOpenChange={setShowCloseConfirmModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Lock className="size-5" /> Cerrar Período Contable
            </DialogTitle>
            <DialogDescription className="pt-2 text-sm text-muted-foreground leading-relaxed">
              ¿Está seguro de cerrar el período de <span className="font-semibold text-foreground">{months.find(m => m.value === selectedMonth)?.label} {selectedYear}</span>?
              <br /><br />
              Esta acción es <span className="font-semibold text-destructive">permanente</span> e impedirá realizar nuevas ediciones, adiciones o eliminaciones de movimientos correspondientes a este mes para garantizar la integridad contable.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-x-3 pt-4 border-t border-border mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCloseConfirmModal(false)}
              disabled={closePeriodMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                closePeriodMutation.mutate();
                setShowCloseConfirmModal(false);
              }}
              disabled={closePeriodMutation.isPending}
            >
              {closePeriodMutation.isPending ? "Cerrando..." : "Sí, Cerrar Período"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
