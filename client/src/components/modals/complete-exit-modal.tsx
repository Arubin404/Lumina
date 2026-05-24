import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Plus, Trash2, CheckCircle, Hash } from "lucide-react";
import DenominationInput from "@/components/denomination-input";
import { createEmptyDenomination, formatCurrency, calculateTotal } from "@/lib/denomination-utils";
import { Denomination, Exit, AddToExit, Invoice } from "@shared/schema";

interface CompleteExitModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialExitId?: string;
}

interface DraftInvoice {
  id: string;
  detail: string;
  amount: string; // Keep as string for natural typing
  date: string;
}

export default function CompleteExitModal({ open, onOpenChange, initialExitId }: CompleteExitModalProps) {
  const [selectedExitId, setSelectedExitId] = useState<string>("");
  const [invoices, setInvoices] = useState<DraftInvoice[]>(() => [
    { id: crypto.randomUUID(), detail: "", amount: "", date: new Date().toISOString().split('T')[0] }
  ]);
  const [changeGiven, setChangeGiven] = useState<Denomination>(createEmptyDenomination);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) {
      setSelectedExitId(initialExitId || "");
    }
  }, [open, initialExitId]);

  const { data: pendingExits, isLoading: exitsLoading } = useQuery<Exit[]>({
    queryKey: ["/api/exits", "pending"],
    enabled: open,
  });

  const selectedExit = pendingExits?.find(exit => exit.id === selectedExitId);

  const { data: previousInvoices } = useQuery<Invoice[]>({
    queryKey: ["/api/exits", selectedExitId, "invoices"],
    enabled: !!selectedExitId,
  });

  // Voucher preview: fetch next voucher number (read-only)
  const { data: voucherConfig } = useQuery<{ nextVoucherNumber: number }>({
    queryKey: ["/api/configuration/next-voucher"],
    enabled: open,
    staleTime: 0, // Always fresh when modal opens
  });

  const nextVoucherPreview = voucherConfig?.nextVoucherNumber ?? null;

  const resetForm = () => {
    setSelectedExitId("");
    setInvoices([{ id: crypto.randomUUID(), detail: "", amount: "", date: new Date().toISOString().split('T')[0] }]);
    setChangeGiven(createEmptyDenomination());
  };

  const addInvoice = () => {
    setInvoices(prev => [...prev, { id: crypto.randomUUID(), detail: "", amount: "", date: new Date().toISOString().split('T')[0] }]);
  };

  const removeInvoice = (index: number) => {
    if (invoices.length > 1) {
      setInvoices(prev => prev.filter((_, i) => i !== index));
    }
  };

  const updateInvoice = (index: number, field: keyof DraftInvoice, value: string) => {
    setInvoices(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const totalInvoiceAmount = invoices.reduce((sum, invoice) => sum + Math.round(parseFloat(invoice.amount || "0") * 100), 0);
  const changeAmount = calculateTotal(changeGiven);

  const prevRendered = selectedExit?.renderedAmount || 0;
  const prevChange = selectedExit?.changeAmount || 0;
  const totalAccountedFor = prevRendered + prevChange + totalInvoiceAmount + changeAmount;
  const remainingToRender = (selectedExit?.initialAmount || 0) - totalAccountedFor;

  const isBalanceValid = selectedExit ? totalAccountedFor === selectedExit.initialAmount : false;

  const handleSubmit = (e: React.FormEvent, forceComplete: boolean = false) => {
    e.preventDefault();
    
    if (!selectedExitId) {
      toast({
        title: "Error de validación",
        description: "Debe seleccionar una salida pendiente",
        variant: "destructive",
      });
      return;
    }

    const hasInvoices = invoices.some(invoice => invoice.detail.trim() && parseFloat(invoice.amount || "0") > 0);
    const hasChange = changeAmount > 0;

    if (!hasInvoices && !hasChange && !forceComplete) {
      toast({
        title: "Error de validación",
        description: "Debe agregar al menos una factura o vuelto para registrar progreso",
        variant: "destructive",
      });
      return;
    }

    // Incremental update
    const payload: AddToExit = {
      exitId: selectedExitId,
      invoices: invoices.flatMap(inv =>
        inv.detail.trim() && parseFloat(inv.amount || "0") > 0
          ? [{
              detail: inv.detail.trim(),
              amount: Math.round(parseFloat(inv.amount || "0") * 100),
              date: new Date(inv.date),
            }]
          : []
      ),
      changeGiven: hasChange ? changeGiven : undefined,
      forceComplete
    };
    completeExitMutation.mutate(payload);
  };

  const completeExitMutation = useMutation({
    mutationFn: async (completionData: AddToExit) => {
      const response = await apiRequest("POST", "/api/exits/add", completionData);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: data.isPending ? "Rendición parcial registrada" : "Salida completada",
        description: data.isPending 
          ? `Se han registrado las facturas. Faltan ${formatCurrency(data.initialAmount - (data.renderedAmount + data.changeAmount))} por rendir.`
          : "La salida se ha cerrado completamente.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/exits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/incomes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cashbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      onOpenChange(false);
      resetForm();
    },
    onError: (error) => {
      toast({
        title: "Error al registrar rendición",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && !completeExitMutation.isPending) {
      resetForm();
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Completar Salida Pendiente</DialogTitle>
          <DialogDescription>
            Registra facturas y/o vuelto para rendir progresivamente y cerrar la salida cuando cuadre.
          </DialogDescription>
        </DialogHeader>

        {exitsLoading ? (
          <div className="text-center py-8">Cargando salidas pendientes...</div>
        ) : !pendingExits?.length ? (
          <div className="text-center py-8 text-muted-foreground">
            No hay salidas pendientes para completar
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Exit Selection */}
            <div>
              <Label className="text-sm font-medium text-foreground">
                Seleccionar Salida Pendiente *
              </Label>
              <Select 
                value={selectedExitId} 
                onValueChange={setSelectedExitId}
                disabled={completeExitMutation.isPending}
              >
                <SelectTrigger data-testid="select-pending-exit">
                  <SelectValue placeholder="Seleccionar salida..." />
                </SelectTrigger>
                <SelectContent>
                  {pendingExits.map((exit) => (
                    <SelectItem key={exit.id} value={exit.id}>
                      {exit.purpose} - {formatCurrency(exit.initialAmount)} - {new Date(exit.date).toLocaleDateString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedExit && (
              <>
                {/* Selected Exit Info */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Información de la Salida</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label className="text-sm text-muted-foreground">Propósito</Label>
                        <p className="font-medium">{selectedExit.purpose}</p>
                      </div>
                      <div>
                        <Label className="text-sm text-muted-foreground">Monto Inicial</Label>
                        <p className="font-medium">{formatCurrency(selectedExit.initialAmount)}</p>
                      </div>
                      <div>
                        <Label className="text-sm text-muted-foreground">Fecha</Label>
                        <p className="font-medium" suppressHydrationWarning>{new Date(selectedExit.date).toLocaleDateString()}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Invoices */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">Nuevas Facturas</CardTitle>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addInvoice}
                        disabled={completeExitMutation.isPending}
                        data-testid="button-add-invoice"
                      >
                        <Plus className="mr-2 size-4" />
                        Agregar Factura
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {invoices.map((invoice, index) => (
                        <div key={invoice.id} className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 border border-border rounded-lg">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <Label className="text-sm">Detalle *</Label>
                              {nextVoucherPreview !== null && (
                                <Badge variant="outline" className="text-xs font-mono text-primary border-primary/30 bg-primary/5">
                                  <Hash className="size-2.5 mr-0.5" />
                                  Voucher #{(nextVoucherPreview + index).toString().padStart(4, "0")}
                                </Badge>
                              )}
                            </div>
                            <Input
                              value={invoice.detail}
                              onChange={(e) => updateInvoice(index, "detail", e.target.value)}
                              placeholder="Descripción de la factura"
                              disabled={completeExitMutation.isPending}
                              data-testid={`input-invoice-detail-${index}`}
                            />
                          </div>
                          <div>
                            <Label className="text-sm">Monto *</Label>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={invoice.amount}
                              onChange={(e) => updateInvoice(index, "amount", e.target.value)}
                              placeholder="0.00"
                              disabled={completeExitMutation.isPending}
                              data-testid={`input-invoice-amount-${index}`}
                            />
                          </div>
                          <div>
                            <Label className="text-sm">Fecha *</Label>
                            <Input
                              type="date"
                              value={invoice.date}
                              onChange={(e) => updateInvoice(index, "date", e.target.value)}
                              onClick={(e) => e.currentTarget.showPicker?.()}
                              disabled={completeExitMutation.isPending}
                              className="cursor-pointer"
                              data-testid={`input-invoice-date-${index}`}
                            />
                          </div>
                          <div className="flex items-end">
                            {invoices.length > 1 && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => removeInvoice(index)}
                                disabled={completeExitMutation.isPending}
                                data-testid={`button-remove-invoice-${index}`}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                      
                      {/* Previous Invoices Section */}
                      {previousInvoices && previousInvoices.length > 0 && (
                        <div className="mt-6 pt-6 border-t border-dashed border-border">
                          <h4 className="text-sm font-medium text-muted-foreground mb-3">Facturas Registradas Previamente:</h4>
                          <div className="space-y-2">
                            {previousInvoices.map((inv) => (
                              <div key={inv.id} className="flex items-center justify-between p-2 bg-muted/30 rounded text-xs">
                                <span className="font-medium">{inv.detail}</span>
                                <div className="flex gap-4">
                                  <span suppressHydrationWarning>{new Date(inv.date).toLocaleDateString()}</span>
                                  <span className="font-bold">{formatCurrency(inv.amount)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="text-right pt-4">
                        <Label className="text-sm text-muted-foreground mr-2">Total esta sesión:</Label>
                        <span className="text-lg font-bold" data-testid="text-total-invoices">
                          {formatCurrency(totalInvoiceAmount)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Change Given */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Vuelto Entregado</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <DenominationInput
                      denominations={changeGiven}
                      onChange={setChangeGiven}
                      showTotal={true}
                      disabled={completeExitMutation.isPending}
                    />
                  </CardContent>
                </Card>

                {/* Balance Validation Summary */}
                <Card className={`border-2 ${isBalanceValid ? 'border-success' : 'border-destructive'}`}>
                  <CardHeader className="py-3 border-b">
                    <CardTitle className="text-sm font-medium flex items-center justify-between">
                      Resumen de Rendición
                      <span className={isBalanceValid ? "text-success" : "text-destructive"}>
                        {isBalanceValid ? "✓ Todo cuadrado" : `Faltan ${formatCurrency(Math.max(0, remainingToRender))}`}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Monto Entregado</Label>
                        <p className="text-base font-bold">{formatCurrency(selectedExit.initialAmount)}</p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Rendido Previo</Label>
                        <p className="text-base font-semibold text-muted-foreground">
                          {formatCurrency(prevRendered + prevChange)}
                        </p>
                        {(prevRendered > 0 || prevChange > 0) && (
                          <p className="text-[10px] text-muted-foreground">
                            ({formatCurrency(prevRendered)} fac. + {formatCurrency(prevChange)} vuel.)
                          </p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Nueva Rendición</Label>
                        <p className="text-base font-bold text-primary">
                          {formatCurrency(totalInvoiceAmount + changeAmount)}
                        </p>
                        {(totalInvoiceAmount > 0 || changeAmount > 0) && (
                          <p className="text-[10px] text-muted-foreground">
                            ({formatCurrency(totalInvoiceAmount)} fac. + {formatCurrency(changeAmount)} vuel.)
                          </p>
                        )}
                      </div>
                      <div className={`flex flex-col items-center justify-center border-l pl-4 ${isBalanceValid ? 'text-success' : 'text-destructive'}`}>
                        <div className="flex items-center">
                          <CheckCircle className="mr-2 size-4" />
                          <span className="font-bold text-sm">
                            {isBalanceValid ? 'Balance Completo' : 'Incompleto'}
                          </span>
                        </div>
                        <p className="text-[10px] font-medium mt-1">
                          {isBalanceValid 
                            ? "Listo para cerrar" 
                            : `Pendiente: ${formatCurrency(remainingToRender)}`}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex justify-end gap-x-3 pt-4 border-t border-border">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleOpenChange(false)}
                    disabled={completeExitMutation.isPending}
                    data-testid="button-cancel-complete"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    variant="secondary"
                    disabled={completeExitMutation.isPending}
                    onClick={(e) => handleSubmit(e, false)}
                    data-testid="button-partial-rendition"
                  >
                    {completeExitMutation.isPending ? "Guardando..." : "Guardar Avance (Parcial)"}
                  </Button>
                  <Button
                    type="submit"
                    disabled={completeExitMutation.isPending}
                    onClick={(e) => handleSubmit(e, true)}
                    className={isBalanceValid 
                      ? "bg-success hover:bg-success/90" 
                      : (remainingToRender < 0 
                        ? "bg-orange-500 hover:bg-orange-600 text-white border-none shadow-lg shadow-orange-500/20" 
                        : "")}
                    data-testid="button-complete-exit"
                  >
                    {completeExitMutation.isPending ? (
                      "Procesando..."
                    ) : (
                      <>
                        <CheckCircle className="mr-2 size-4" />
                        {isBalanceValid 
                          ? "Cerrar Salida (Cuadrado)" 
                          : (remainingToRender < 0 ? "Avance / Reembolso" : "Cerrar con Diferencia")}
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
