import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Save } from "lucide-react";
import DenominationInput from "@/components/denomination-input";
import { createEmptyDenomination, calculateTotal } from "@/lib/denomination-utils";
import { Denomination, InsertIncome, Income } from "@shared/schema";

interface IncomeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: Income | null;
}

interface CashBox {
  denominations: Denomination;
  totalAmount: number;
}

export default function IncomeModal({ open, onOpenChange, initialData }: IncomeModalProps) {
  const [detail, setDetail] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [denominations, setDenominations] = useState<Denomination>(() => createEmptyDenomination());
  const [voucherId, setVoucherId] = useState<string>("");
  
  useEffect(() => {
    if (open) {
      if (initialData) {
        setDetail(initialData.detail);
        setDate(new Date(initialData.date).toISOString().split('T')[0]);
        setDenominations(initialData.denominations as Denomination);
        setVoucherId(initialData.voucherId ? initialData.voucherId.toString() : "");
      } else {
        setDetail("");
        setDate(new Date().toISOString().split('T')[0]);
        setDenominations(createEmptyDenomination());
        setVoucherId("");
      }
    }
  }, [open, initialData]);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: cashBox } = useQuery<CashBox>({
    queryKey: ["/api/cashbox"],
    enabled: open,
  });

  const createIncomeMutation = useMutation({
    mutationFn: async (incomeData: InsertIncome & { voucherId?: number }) => {
      if (initialData) {
        const response = await apiRequest("PATCH", `/api/incomes/${initialData.id}`, incomeData);
        return response.json();
      } else {
        const response = await apiRequest("POST", "/api/incomes", incomeData);
        return response.json();
      }
    },
    onSuccess: () => {
      toast({
        title: initialData ? "Ingreso actualizado" : "Ingreso registrado",
        description: initialData ? "El ingreso se ha actualizado correctamente" : "El ingreso se ha registrado correctamente",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/incomes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cashbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      onOpenChange(false);
      resetForm();
    },
    onError: (error) => {
      toast({
        title: "Error al registrar ingreso",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setDetail("");
    setDate(new Date().toISOString().split('T')[0]);
    setDenominations(createEmptyDenomination());
    setVoucherId("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!detail.trim()) {
      toast({
        title: "Error de validación",
        description: "El detalle es requerido",
        variant: "destructive",
      });
      return;
    }

    const totalAmount = calculateTotal(denominations);
    if (totalAmount === 0) {
      toast({
        title: "Error de validación",
        description: "El monto total no puede ser 0.00. Debe especificar al menos una denominación.",
        variant: "destructive",
      });
      return;
    }

    createIncomeMutation.mutate({
      detail: detail.trim(),
      date: new Date(date),
      denominations,
      voucherId: voucherId.trim() ? parseInt(voucherId) : undefined
    });
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && !createIncomeMutation.isPending) {
      resetForm();
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initialData ? "Editar Ingreso" : "Registrar Ingreso"}</DialogTitle>
          <DialogDescription>
            Registra el ingreso con su detalle, fecha y denominaciones recibidas.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="detail" className="text-sm font-medium text-foreground">
                Detalle/Propósito *
              </Label>
              <Input
                id="detail"
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                placeholder="Ej: Float inicial del día"
                disabled={createIncomeMutation.isPending}
                data-testid="input-income-detail"
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
                disabled={createIncomeMutation.isPending}
                className="cursor-pointer"
                data-testid="input-income-date"
              />
            </div>

            {initialData && (
              <div>
                <Label htmlFor="voucherId" className="text-sm font-medium text-foreground">
                  Número de Voucher #
                </Label>
                <Input
                  id="voucherId"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={voucherId}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "" || /^\d+$/.test(val)) {
                      setVoucherId(val);
                    }
                  }}
                  disabled={createIncomeMutation.isPending}
                  data-testid="input-income-voucher"
                />
              </div>
            )}
          </div>

          {initialData && (
            <div className="p-3 bg-warning/10 border border-warning/20 rounded-md text-xs text-warning flex flex-col gap-1 mt-2">
              <span className="font-semibold flex items-center gap-1">
                ⚠️ Advertencia de Modificación de Voucher
              </span>
              <span>
                Al editar el correlativo de voucher (# {initialData.voucherId}), debes ajustar manualmente la numeración si ya ha sido impresa o reportada en contabilidad para evitar duplicados o huecos.
              </span>
            </div>
          )}

          <div>
            <h4 className="text-sm font-medium text-foreground mb-4">Especificar Denominaciones</h4>
            <DenominationInput
              denominations={denominations}
              onChange={setDenominations}
              showTotal={true}
              disabled={createIncomeMutation.isPending}
            />
          </div>

          <div className="flex justify-end gap-x-3 pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={createIncomeMutation.isPending}
              data-testid="button-cancel-income"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={createIncomeMutation.isPending}
              data-testid="button-save-income"
            >
              {createIncomeMutation.isPending ? (
                "Guardando..."
              ) : (
                <>
                  <Save className="mr-2 size-4" />
                  Registrar Ingreso
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
