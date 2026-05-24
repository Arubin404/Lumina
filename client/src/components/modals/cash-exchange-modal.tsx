import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ArrowLeftRight, ArrowRight, Save } from "lucide-react";
import DenominationInput from "@/components/denomination-input";
import { createEmptyDenomination, calculateTotal, formatCurrency } from "@/lib/denomination-utils";
import { Denomination, InsertCashExchange } from "@shared/schema";

interface CashExchangeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CashExchangeModal({ open, onOpenChange }: CashExchangeModalProps) {
  const [denominationsOut, setDenominationsOut] = useState<Denomination>(() => createEmptyDenomination());
  const [denominationsIn, setDenominationsIn] = useState<Denomination>(createEmptyDenomination());
  const [detail, setDetail] = useState("");
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const exchangeMutation = useMutation({
    mutationFn: async (data: InsertCashExchange) => {
      const response = await apiRequest("POST", "/api/cash-exchanges", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Cambio registrado",
        description: "El cambio de billetes se ha registrado correctamente",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/cashbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash-exchanges"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      onOpenChange(false);
      resetForm();
    },
    onError: (error) => {
      toast({
        title: "Error al registrar cambio",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setDenominationsOut(createEmptyDenomination());
    setDenominationsIn(createEmptyDenomination());
    setDetail("");
  };

  const totalOut = calculateTotal(denominationsOut);
  const totalIn = calculateTotal(denominationsIn);
  const isBalanced = totalOut === totalIn;
  const difference = totalIn - totalOut;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (totalOut === 0 && totalIn === 0) {
      toast({
        title: "Error de validación",
        description: "Debe especificar al menos una denominación",
        variant: "destructive",
      });
      return;
    }

    if (!isBalanced) {
      toast({
        title: "Error de validación",
        description: `El cambio no cuadra. Diferencia: ${formatCurrency(Math.abs(difference))}`,
        variant: "destructive",
      });
      return;
    }

    exchangeMutation.mutate({
      denominationsOut,
      denominationsIn,
      detail: detail.trim() || undefined,
    });
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && !exchangeMutation.isPending) {
      resetForm();
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="size-5" />
            Cambio de Billetes (Ferear)
          </DialogTitle>
          <DialogDescription>
            Registra un intercambio de billetes/monedas manteniendo el mismo total neto.
          </DialogDescription>
          <p className="text-sm text-muted-foreground mt-1">
            Registra un cambio de billetes/monedas. El total que sale debe ser igual al total que entra (suma neta = $0).
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Optional detail */}
          <div>
            <Label htmlFor="detail" className="text-sm font-medium text-foreground">
              Nota (Opcional)
            </Label>
            <Input
              id="detail"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="Ej: Cambio con la tienda de al lado"
              disabled={exchangeMutation.isPending}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* What goes OUT of the box */}
            <Card className="border-destructive/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-destructive flex items-center gap-2">
                  <span className="size-2 rounded-full bg-destructive" />
                  Sale de la Caja
                </CardTitle>
                <p className="text-xs text-muted-foreground">Billetes/monedas que entregas</p>
              </CardHeader>
              <CardContent>
                <DenominationInput
                  denominations={denominationsOut}
                  onChange={setDenominationsOut}
                  showTotal={true}
                  disabled={exchangeMutation.isPending}
                />
              </CardContent>
            </Card>

            {/* What comes IN to the box */}
            <Card className="border-success/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-success flex items-center gap-2">
                  <span className="size-2 rounded-full bg-success" />
                  Entra a la Caja
                </CardTitle>
                <p className="text-xs text-muted-foreground">Billetes/monedas que recibes</p>
              </CardHeader>
              <CardContent>
                <DenominationInput
                  denominations={denominationsIn}
                  onChange={setDenominationsIn}
                  showTotal={true}
                  disabled={exchangeMutation.isPending}
                />
              </CardContent>
            </Card>
          </div>

          {/* Balance Check */}
          <Card className={`border-2 ${isBalanced && (totalOut > 0 || totalIn > 0) ? 'border-success' : totalOut === 0 && totalIn === 0 ? 'border-border' : 'border-destructive'}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Sale</p>
                    <p className="font-semibold text-destructive">{formatCurrency(totalOut)}</p>
                  </div>
                  <ArrowRight className="size-5 text-muted-foreground" />
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Entra</p>
                    <p className="font-semibold text-success">{formatCurrency(totalIn)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Diferencia</p>
                  <p className={`font-bold text-lg ${isBalanced ? 'text-success' : 'text-destructive'}`}>
                    {isBalanced ? "$0.00 ✓" : formatCurrency(difference)}
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
              disabled={exchangeMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={exchangeMutation.isPending || !isBalanced || (totalOut === 0 && totalIn === 0)}
            >
              {exchangeMutation.isPending ? (
                "Registrando..."
              ) : (
                <>
                  <Save className="mr-2 size-4" />
                  Registrar Cambio
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
