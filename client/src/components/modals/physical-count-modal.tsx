import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import DenominationInput from "@/components/denomination-input";
import { createEmptyDenomination, calculateTotal, formatCurrency } from "@/lib/denomination-utils";
import { Denomination } from "@shared/schema";

interface PhysicalCountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CashBox {
  denominations: Denomination;
  totalAmount: number;
}

export default function PhysicalCountModal({ open, onOpenChange }: PhysicalCountModalProps) {
  const [denominations, setDenominations] = useState<Denomination>(createEmptyDenomination);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: cashBox } = useQuery<CashBox>({
    queryKey: ["/api/cashbox"],
    enabled: open,
  });

  const updateCashBoxMutation = useMutation({
    mutationFn: async (newDenom: Denomination) => {
      const response = await apiRequest("PUT", "/api/cashbox", newDenom);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Conteo actualizado",
        description: "El conteo físico de la caja ha sido actualizado correctamente",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/cashbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash-adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/incomes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/exits"] });
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Error al actualizar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const physicalTotal = calculateTotal(denominations);
  const expectedPhysicalTotal = cashBox?.totalAmount || 0;
  const difference = physicalTotal - expectedPhysicalTotal;
  const hasDifference = Math.abs(difference) > 0;

  const handleSubmit = () => {
    updateCashBoxMutation.mutate(denominations);
  };

  const handleLoadCurrent = () => {
    if (cashBox) {
      setDenominations({ ...cashBox.denominations });
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setDenominations(createEmptyDenomination());
    }
    onOpenChange(newOpen);
  };


  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="size-5" />
            Arqueo de Caja — Conteo Físico
          </DialogTitle>
          <DialogDescription>
            Cuenta el dinero físico en tu caja real y registra el conteo para comparar con el balance físico esperado.
          </DialogDescription>
        </DialogHeader>

        <p className="text-sm text-muted-foreground mb-2">
          Cuenta el dinero físico que tienes en tu caja real e ingresa las cantidades exactas de cada denominación.
          El sistema comparará tu conteo con el balance físico esperado registrado en caja.
        </p>

        <div className="space-y-5">
          {/* Quick load current values button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleLoadCurrent}
            className="text-xs"
          >
            Cargar valores actuales del sistema
          </Button>

          {/* Denomination input grid */}
          <DenominationInput
            denominations={denominations}
            onChange={setDenominations}
            showTotal={false}
            disabled={updateCashBoxMutation.isPending}
          />

          {/* Comparison panel */}
          <div className="border border-border rounded-lg p-4 space-y-3 bg-secondary/30">
            <h4 className="text-sm font-semibold text-foreground">Comparación</h4>

            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Conteo Físico</p>
                <p className="text-lg font-bold text-foreground">{formatCurrency(physicalTotal)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Físico Esperado</p>
                <p className="text-lg font-bold text-foreground">{formatCurrency(expectedPhysicalTotal)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Diferencia</p>
                <p className={`text-lg font-bold ${hasDifference ? (difference > 0 ? "text-success" : "text-destructive") : "text-success"}`}>
                  {difference > 0 ? "+" : ""}{formatCurrency(difference)}
                </p>
              </div>
            </div>

            {hasDifference ? (
              <div className="flex items-start gap-2 p-3 bg-warning/10 border border-warning/30 rounded-md">
                <AlertTriangle className="size-4 text-warning mt-0.5 shrink-0" />
                <div className="text-xs text-warning">
                  <p className="font-medium">Se detectó una diferencia de {formatCurrency(Math.abs(difference))}</p>
                  <p className="mt-1">
                    {difference > 0
                      ? "Hay más dinero físico del esperado. Puede deberse a ingresos no registrados o cambio devuelto de más."
                      : "Falta dinero en la caja. Puede deberse a salidas no registradas, un cambio mal dado, o un error de conteo."}
                  </p>
                </div>
              </div>
            ) : physicalTotal > 0 ? (
              <div className="flex items-center gap-2 p-3 bg-success/10 border border-success/30 rounded-md">
                <CheckCircle2 className="size-4 text-success shrink-0" />
                <p className="text-xs text-success font-medium">El conteo físico coincide con el balance físico esperado.</p>
              </div>
            ) : null}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-x-3 pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={updateCashBoxMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={updateCashBoxMutation.isPending || physicalTotal === 0}
              className={hasDifference ? "bg-warning hover:bg-warning/90 text-warning-foreground" : ""}
            >
              {updateCashBoxMutation.isPending ? (
                "Guardando..."
              ) : hasDifference ? (
                <>
                  <AlertTriangle className="mr-2 size-4" />
                  Actualizar con Diferencia
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 size-4" />
                  Confirmar Conteo
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
