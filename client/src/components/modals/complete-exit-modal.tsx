import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Plus, Trash2, CheckCircle } from "lucide-react";
import DenominationInput from "@/components/denomination-input";
import { createEmptyDenomination, formatCurrency } from "@/lib/denomination-utils";
import { Denomination, Exit, CompleteExit } from "@shared/schema";

interface CompleteExitModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialExitId?: string;
}

interface Invoice {
  detail: string;
  amount: number;
  date: string;
}

export default function CompleteExitModal({ open, onOpenChange, initialExitId }: CompleteExitModalProps) {
  const [selectedExitId, setSelectedExitId] = useState<string>("");
  const [invoices, setInvoices] = useState<Invoice[]>([{ detail: "", amount: 0, date: new Date().toISOString().split('T')[0] }]);
  const [changeGiven, setChangeGiven] = useState<Denomination>(createEmptyDenomination);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) {
      setSelectedExitId(initialExitId || "");
    }
  }, [open, initialExitId]);

  const { data: pendingExits, isLoading: exitsLoading } = useQuery<Exit[]>({
    queryKey: ["/api/exits/pending"],
    enabled: open,
  });

  const selectedExit = pendingExits?.find(exit => exit.id === selectedExitId);

  const resetForm = () => {
    setSelectedExitId("");
    setInvoices([{ detail: "", amount: 0, date: new Date().toISOString().split('T')[0] }]);
    setChangeGiven(createEmptyDenomination());
  };

  const addInvoice = () => {
    setInvoices([...invoices, { detail: "", amount: 0, date: new Date().toISOString().split('T')[0] }]);
  };

  const removeInvoice = (index: number) => {
    if (invoices.length > 1) {
      setInvoices(invoices.filter((_, i) => i !== index));
    }
  };

  const updateInvoice = (index: number, field: keyof Invoice, value: string | number) => {
    const updated = [...invoices];
    updated[index] = { ...updated[index], [field]: value };
    setInvoices(updated);
  };

  const totalInvoiceAmount = invoices.reduce((sum, invoice) => sum + invoice.amount, 0);
  const changeAmount = Object.values(changeGiven.bills).reduce((sum, count, index) => {
    const values = [100, 50, 20, 10, 5, 2, 1];
    return sum + ((count || 0) * values[index]);
  }, 0) + Object.values(changeGiven.coins).reduce((sum, count, index) => {
    const values = [5, 2, 1, 0.5, 0.25, 0.1];
    return sum + ((count || 0) * values[index]);
  }, 0);

  const isBalanceValid = selectedExit ? Math.abs((totalInvoiceAmount + changeAmount) - (selectedExit.initialAmount - (selectedExit.renderedAmount || 0) - (selectedExit.changeAmount || 0))) < 0.01 : false;

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

    const hasInvoices = invoices.some(invoice => invoice.detail.trim() && invoice.amount > 0);
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
    completeExitMutation.mutate({
      exitId: selectedExitId,
      invoices: invoices.filter(inv => inv.detail.trim() && inv.amount > 0).map(invoice => ({
        detail: invoice.detail.trim(),
        amount: invoice.amount,
        date: new Date(invoice.date),
      })),
      changeGiven: hasChange ? changeGiven : undefined,
      forceComplete
    } as any); // Cast because we are using the new incremental structure
  };

  const completeExitMutation = useMutation({
    mutationFn: async (completionData: any) => {
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
                        <p className="font-medium">{new Date(selectedExit.date).toLocaleDateString()}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Invoices */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">Facturas</CardTitle>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addInvoice}
                        disabled={completeExitMutation.isPending}
                        data-testid="button-add-invoice"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Agregar Factura
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {invoices.map((invoice, index) => (
                        <div key={index} className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 border border-border rounded-lg">
                          <div>
                            <Label className="text-sm">Detalle *</Label>
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
                              value={invoice.amount || ""}
                              onChange={(e) => updateInvoice(index, "amount", parseFloat(e.target.value) || 0)}
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
                              disabled={completeExitMutation.isPending}
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
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                      <div className="text-right">
                        <Label className="text-sm text-muted-foreground">Total Facturas:</Label>
                        <p className="text-lg font-semibold" data-testid="text-total-invoices">
                          {formatCurrency(totalInvoiceAmount)}
                        </p>
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

                {/* Balance Validation */}
                <Card className={`border-2 ${isBalanceValid ? 'border-success' : 'border-destructive'}`}>
                  <CardContent className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
                      <div>
                        <Label className="text-sm text-muted-foreground">Monto Inicial</Label>
                        <p className="text-lg font-semibold">{formatCurrency(selectedExit.initialAmount)}</p>
                      </div>
                      <div>
                        <Label className="text-sm text-muted-foreground">Total Facturas</Label>
                        <p className="text-lg font-semibold">{formatCurrency(totalInvoiceAmount)}</p>
                      </div>
                      <div>
                        <Label className="text-sm text-muted-foreground">Vuelto</Label>
                        <p className="text-lg font-semibold">{formatCurrency(changeAmount)}</p>
                      </div>
                      <div className={`flex items-center justify-center ${isBalanceValid ? 'text-success' : 'text-destructive'}`}>
                        <CheckCircle className="mr-2 h-5 w-5" />
                        <span className="font-semibold">
                          {isBalanceValid ? 'Balance Correcto' : 'Balance Incorrecto'}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex justify-end space-x-3 pt-4 border-t border-border">
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
                    className={isBalanceValid ? "bg-success hover:bg-success/90" : ""}
                    data-testid="button-complete-exit"
                  >
                    {completeExitMutation.isPending ? (
                      "Procesando..."
                    ) : (
                      <>
                        <CheckCircle className="mr-2 h-4 w-4" />
                        {isBalanceValid ? "Cerrar Salida (Cuadrado)" : "Cerrar con Diferencia"}
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
