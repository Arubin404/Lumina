import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Save, Plus, Trash2, Hash, FileText } from "lucide-react";
import DenominationInput from "@/components/denomination-input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createEmptyDenomination, calculateTotal, formatCurrency } from "@/lib/denomination-utils";
import { Denomination, InsertExit, Exit, Invoice, UpdateExit } from "@shared/schema";

interface ExitModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: Exit | null;
}

interface CashBox {
  denominations: Denomination;
  totalAmount: number;
}

export default function ExitModal({ open, onOpenChange, initialData }: ExitModalProps) {
  const [purpose, setPurpose] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [denominationsGiven, setDenominationsGiven] = useState<Denomination>(() => createEmptyDenomination());
  
  // Local state for invoices and change (vuelto) when editing
  const [invoices, setInvoices] = useState<{ localId: string; id?: string; voucherId?: number; detail: string; amount: string; date: string }[]>([]);
  const [changeGiven, setChangeGiven] = useState<Denomination>(() => createEmptyDenomination());
  const [hasLoadedData, setHasLoadedData] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Queries to load invoices and change when editing
  const { data: exitInvoices } = useQuery<Invoice[]>({
    queryKey: ["/api/exits", initialData?.id, "invoices"],
    enabled: open && !!initialData?.id,
  });

  const { data: exitChange } = useQuery<any[]>({
    queryKey: ["/api/exits", initialData?.id, "change"],
    enabled: open && !!initialData?.id,
  });

  const { data: voucherConfig } = useQuery<{ nextVoucherNumber: number }>({
    queryKey: ["/api/configuration/next-voucher"],
    enabled: open && !!initialData,
  });

  useEffect(() => {
    if (open) {
      if (initialData) {
        setPurpose(initialData.purpose);
        setDate(new Date(initialData.date).toISOString().split('T')[0]);
        setDenominationsGiven(initialData.denominationsGiven as Denomination);
      } else {
        setPurpose("");
        setDate(new Date().toISOString().split('T')[0]);
        setDenominationsGiven(createEmptyDenomination());
        setInvoices([]);
        setChangeGiven(createEmptyDenomination());
        setHasLoadedData(false);
      }
    } else {
      setHasLoadedData(false);
    }
  }, [open, initialData]);

  // Synchronize loaded invoices and change once both are loaded exactly once per dialog open
  useEffect(() => {
    if (open && initialData && exitInvoices && exitChange && !hasLoadedData) {
      setInvoices(exitInvoices.map(inv => ({
        localId: crypto.randomUUID(),
        id: inv.id,
        voucherId: inv.voucherId,
        detail: inv.detail,
        amount: (inv.amount / 100).toFixed(2), // Keep as string for decimal typing
        date: new Date(inv.date).toISOString().split('T')[0]
      })));
      
      const lastChange = exitChange[exitChange.length - 1];
      if (lastChange) {
        setChangeGiven(lastChange.denominations as Denomination);
      } else {
        setChangeGiven(createEmptyDenomination());
      }
      setHasLoadedData(true);
    }
  }, [open, initialData, exitInvoices, exitChange, hasLoadedData]);

  const { data: cashBox } = useQuery<CashBox>({
    queryKey: ["/api/cashbox"],
    enabled: open,
  });

  // Calculate temporarily refunded cashbox denominations so editing works seamlessly
  const availableDenomForOuttake = cashBox?.denominations && initialData ? (() => {
    const base = { ...cashBox.denominations };
    const old = initialData.denominationsGiven as Denomination;
    
    return {
      bills: {
        hundred: (base.bills?.hundred || 0) + (old.bills?.hundred || 0),
        fifty: (base.bills?.fifty || 0) + (old.bills?.fifty || 0),
        twenty: (base.bills?.twenty || 0) + (old.bills?.twenty || 0),
        ten: (base.bills?.ten || 0) + (old.bills?.ten || 0),
        five: (base.bills?.five || 0) + (old.bills?.five || 0),
        one: (base.bills?.one || 0) + (old.bills?.one || 0),
      },
      coins: {
        one: (base.coins?.one || 0) + (old.coins?.one || 0),
        fifty_cents: (base.coins?.fifty_cents || 0) + (old.coins?.fifty_cents || 0),
        quarter: (base.coins?.quarter || 0) + (old.coins?.quarter || 0),
        dime: (base.coins?.dime || 0) + (old.coins?.dime || 0),
        nickel: (base.coins?.nickel || 0) + (old.coins?.nickel || 0),
        penny: (base.coins?.penny || 0) + (old.coins?.penny || 0),
      }
    };
  })() : cashBox?.denominations;

  const addInvoice = () => {
    setInvoices(prev => [...prev, { localId: crypto.randomUUID(), detail: "", amount: "", date: new Date().toISOString().split('T')[0] }]);
  };

  const removeInvoice = (index: number) => {
    setInvoices(prev => prev.filter((_, i) => i !== index));
  };

  const updateInvoice = (index: number, field: "detail" | "amount" | "date" | "voucherId", value: string | number) => {
    setInvoices(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value as any };
      return updated;
    });
  };

  const createExitMutation = useMutation({
    mutationFn: async (exitData: InsertExit | UpdateExit) => {
      if (initialData) {
        const response = await apiRequest("PATCH", `/api/exits/${initialData.id}`, exitData);
        return response.json();
      } else {
        const response = await apiRequest("POST", "/api/exits", exitData);
        return response.json();
      }
    },
    onSuccess: () => {
      toast({
        title: initialData ? "Salida actualizada" : "Salida registrada",
        description: initialData 
          ? "La salida, facturas y vuelto se han actualizado correctamente" 
          : "La salida se ha registrado y quedará pendiente hasta completarse",
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
        title: "Error al guardar salida",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setPurpose("");
    setDate(new Date().toISOString().split('T')[0]);
    setDenominationsGiven(createEmptyDenomination());
    setInvoices([]);
    setChangeGiven(createEmptyDenomination());
    setHasLoadedData(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!purpose.trim()) {
      toast({
        title: "Error de validación",
        description: "El propósito es requerido",
        variant: "destructive",
      });
      return;
    }

    const totalGivenAmount = calculateTotal(denominationsGiven);

    if (totalGivenAmount === 0) {
      toast({
        title: "Error de validación",
        description: "El monto total no puede ser 0.00. Debe especificar al menos una denominación.",
        variant: "destructive",
      });
      return;
    }

    if (initialData) {
      const activeInvoices = invoices.filter(inv => inv.detail.trim() && parseFloat(inv.amount || "0") > 0);
      const totalInvoiceAmount = activeInvoices.reduce((sum, inv) => sum + Math.round(parseFloat(inv.amount || "0") * 100), 0);
      const changeAmount = calculateTotal(changeGiven);
      const totalAccountedFor = totalInvoiceAmount + changeAmount;

      if (!initialData.isPending && totalAccountedFor > totalGivenAmount) {
        toast({
          title: "Error de validación",
          description: `El monto total rendido (${formatCurrency(totalAccountedFor)}) superaría el monto inicial de la salida (${formatCurrency(totalGivenAmount)}).`,
          variant: "destructive",
        });
        return;
      }

      const payload: UpdateExit = {
        purpose: purpose.trim(),
        date: new Date(date),
        denominationsGiven,
        invoices: !initialData.isPending ? activeInvoices.map(inv => ({
          id: inv.id,
          voucherId: inv.voucherId ? parseInt(inv.voucherId as any) : undefined,
          detail: inv.detail.trim(),
          amount: Math.round(parseFloat(inv.amount || "0") * 100),
          date: new Date(inv.date)
        })) : undefined,
        changeGiven: !initialData.isPending && changeAmount > 0 ? changeGiven : undefined
      };

      createExitMutation.mutate(payload);
    } else {
      createExitMutation.mutate({
        purpose: purpose.trim(),
        date: new Date(date),
        denominationsGiven,
      });
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && !createExitMutation.isPending) {
      resetForm();
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initialData ? "Editar Salida" : "Registrar Salida"}</DialogTitle>
          <DialogDescription>
            {initialData 
              ? (initialData.isPending 
                  ? "Modifica los datos principales de la salida pendiente." 
                  : "Modifica los datos de la salida, ajusta facturas y gestiona el vuelto devuelto.")
              : "Registra una salida especificando su propósito, fecha y denominaciones retiradas."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="purpose" className="text-sm font-medium text-foreground">
                Propósito de la Salida *
              </Label>
              <Input
                id="purpose"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="Ej: Pago de servicios"
                disabled={createExitMutation.isPending}
                data-testid="input-exit-purpose"
              />
            </div>

            <div>
              <Label htmlFor="date" className="text-sm font-medium text-foreground">
                Fecha *
              </Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                onClick={(e) => e.currentTarget.showPicker?.()}
                disabled={createExitMutation.isPending}
                className="cursor-pointer"
                data-testid="input-exit-date"
              />
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium text-foreground mb-4">Denominaciones Entregadas</h4>
            <DenominationInput
              denominations={denominationsGiven}
              onChange={setDenominationsGiven}
              availableDenominations={availableDenomForOuttake}
              showTotal={true}
              disabled={createExitMutation.isPending || (!!initialData && !initialData.isPending)}
            />
          </div>

          {/* Rendering and change editing - edit mode and completed exits only */}
          {initialData && !initialData.isPending && (
            <div className="space-y-6 pt-6 border-t border-border">
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                  <FileText className="size-5 text-primary animate-pulse" /> Detalle de Rendición (Facturas y Vuelto)
                </h3>
                <p className="text-xs text-muted-foreground">
                  Modifica las facturas correspondientes a esta salida y/o el vuelto físico devuelto a la caja.
                </p>
              </div>

              {/* Voucher Edit Warning Banner */}
              {invoices.some(inv => inv.id !== undefined) && (
                <div className="p-3 bg-warning/10 border border-warning/20 rounded-md text-xs text-warning flex flex-col gap-1">
                  <span className="font-semibold flex items-center gap-1">
                    ⚠️ Advertencia de Modificación de Voucher
                  </span>
                  <span>
                    Has modificado o puedes modificar correlativos de voucher existentes. Ajustar estos números requiere actualizar manualmente la numeración contable si ya fue impresa o reportada, para prevenir duplicados.
                  </span>
                </div>
              )}

              {/* Invoices List */}
              <Card className="border border-border bg-card/30">
                <CardHeader className="py-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">Facturas Asociadas</CardTitle>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addInvoice}
                      disabled={createExitMutation.isPending}
                    >
                      <Plus className="mr-1.5 size-3.5" />
                      Agregar Factura
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {invoices.length === 0 ? (
                    <div className="text-center py-6 text-xs text-muted-foreground">
                      No hay facturas registradas para esta salida. Haz clic en "Agregar Factura" para añadir una.
                    </div>
                  ) : (
                    invoices.map((invoice, index) => (
                      <div key={invoice.localId} className="grid grid-cols-1 md:grid-cols-5 gap-3 p-3 border border-border/80 rounded-lg bg-background/50 items-center">
                        <div className="space-y-1 col-span-1">
                          <Label className="text-xs font-medium">Voucher #</Label>
                          {invoice.id ? (
                            <Input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={invoice.voucherId || ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === "" || /^\d+$/.test(val)) {
                                  updateInvoice(index, "voucherId", val ? parseInt(val) : "");
                                }
                              }}
                              disabled={createExitMutation.isPending}
                              className="h-8 text-xs font-mono"
                            />
                          ) : (
                            <div className="h-8 flex items-center">
                              {voucherConfig?.nextVoucherNumber !== undefined && (
                                <Badge variant="outline" className="text-[10px] font-mono text-primary py-0 px-1.5 bg-primary/5 border-primary/20">
                                  <Hash className="size-2.5 mr-0.5" />
                                  #{(voucherConfig.nextVoucherNumber + index).toString().padStart(4, "0")}
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="space-y-1 col-span-1">
                          <Label className="text-xs font-medium">Detalle *</Label>
                          <Input
                            value={invoice.detail}
                            onChange={(e) => updateInvoice(index, "detail", e.target.value)}
                            placeholder="Descripción"
                            disabled={createExitMutation.isPending}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="space-y-1 col-span-1">
                          <Label className="text-xs font-medium">Monto *</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={invoice.amount}
                            onChange={(e) => updateInvoice(index, "amount", e.target.value)}
                            placeholder="0.00"
                            disabled={createExitMutation.isPending}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="space-y-1 col-span-1">
                          <Label className="text-xs font-medium">Fecha *</Label>
                          <Input
                            type="date"
                            value={invoice.date}
                            onChange={(e) => updateInvoice(index, "date", e.target.value)}
                            onClick={(e) => e.currentTarget.showPicker?.()}
                            disabled={createExitMutation.isPending}
                            className="h-8 text-xs cursor-pointer"
                          />
                        </div>
                        <div className="flex justify-end pt-5 md:pt-0">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeInvoice(index)}
                            disabled={createExitMutation.isPending}
                            className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="size-4 mr-1" /> Eliminar
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              {/* Vuelto / Change Input */}
              <Card className="border border-border bg-card/30">
                <CardHeader className="py-4">
                  <CardTitle className="text-sm font-medium">Vuelto Físico Devuelto</CardTitle>
                </CardHeader>
                <CardContent>
                  <DenominationInput
                    denominations={changeGiven}
                    onChange={setChangeGiven}
                    showTotal={true}
                    disabled={createExitMutation.isPending}
                  />
                </CardContent>
              </Card>

              {/* Balance Validation Card */}
              {(() => {
                const totalGiven = calculateTotal(denominationsGiven);
                const activeInvoices = invoices.filter(inv => inv.detail.trim() && parseFloat(inv.amount || "0") > 0);
                const totalInvoices = activeInvoices.reduce((sum, inv) => sum + Math.round(parseFloat(inv.amount || "0") * 100), 0);
                const totalChange = calculateTotal(changeGiven);
                const totalAccounted = totalInvoices + totalChange;
                const remaining = totalGiven - totalAccounted;
                const isValid = totalAccounted === totalGiven;

                return (
                  <Card className={`border-2 ${isValid ? 'border-success/50 bg-success/5' : (remaining < 0 ? 'border-destructive/50 bg-destructive/5' : 'border-warning/50 bg-warning/5')}`}>
                    <CardContent className="p-4">
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="space-y-1 text-center sm:text-left">
                          <div className="flex items-center justify-center sm:justify-start gap-1.5">
                            <span className="text-xs font-semibold text-muted-foreground">Estado de Cuadre:</span>
                            <Badge className={isValid ? "bg-success text-white border-none shadow-md shadow-success/15" : (remaining < 0 ? "bg-destructive text-white border-none shadow-md shadow-destructive/15" : "bg-warning text-black border-none")}>
                              {isValid ? "✓ Cuadrado" : (remaining < 0 ? "❌ Excede Salida" : `⚠ Pendiente (${formatCurrency(remaining)})`)}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-normal">
                            Monto Inicial: <span className="font-semibold">{formatCurrency(totalGiven)}</span> · 
                            Facturas: <span className="font-semibold">{formatCurrency(totalInvoices)}</span> · 
                            Vuelto: <span className="font-semibold">{formatCurrency(totalChange)}</span>
                          </p>
                        </div>
                        <div className="flex items-center gap-1 text-sm font-bold">
                          {isValid ? (
                            <span className="text-success">Rendición Balanceada</span>
                          ) : remaining < 0 ? (
                            <span className="text-destructive">Excedente: {formatCurrency(Math.abs(remaining))}</span>
                          ) : (
                            <span className="text-warning">Faltante: {formatCurrency(remaining)}</span>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })()}
            </div>
          )}

          <div className="flex justify-end gap-x-3 pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={createExitMutation.isPending}
              data-testid="button-cancel-exit"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={createExitMutation.isPending || (!!initialData && !initialData.isPending && (invoices.filter(inv => inv.detail.trim() && parseFloat(inv.amount || "0") > 0).reduce((sum, inv) => sum + Math.round(parseFloat(inv.amount || "0") * 100), 0) + calculateTotal(changeGiven)) > calculateTotal(denominationsGiven))}
              data-testid="button-save-exit"
            >
              {createExitMutation.isPending ? (
                "Guardando..."
              ) : (
                <>
                  <Save className="mr-2 size-4" />
                  {initialData ? "Guardar Cambios" : "Registrar Salida"}
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
