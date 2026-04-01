import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Save } from "lucide-react";
import DenominationInput from "@/components/denomination-input";
import { createEmptyDenomination } from "@/lib/denomination-utils";
import { Denomination, InsertExit, Exit } from "@shared/schema";

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
  const [denominationsGiven, setDenominationsGiven] = useState<Denomination>(createEmptyDenomination());
  
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
      }
    }
  }, [open, initialData]);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: cashBox } = useQuery<CashBox>({
    queryKey: ["/api/cashbox"],
    enabled: open,
  });

  const createExitMutation = useMutation({
    mutationFn: async (exitData: InsertExit) => {
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
          ? "La salida se ha actualizado correctamente" 
          : "La salida se ha registrado y quedará pendiente hasta completarse",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/exits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cashbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      onOpenChange(false);
      resetForm();
    },
    onError: (error) => {
      toast({
        title: "Error al registrar salida",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setPurpose("");
    setDate(new Date().toISOString().split('T')[0]);
    setDenominationsGiven(createEmptyDenomination());
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

    createExitMutation.mutate({
      purpose: purpose.trim(),
      date: new Date(date),
      denominationsGiven,
    });
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && !createExitMutation.isPending) {
      resetForm();
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initialData ? "Editar Salida" : "Registrar Salida"}</DialogTitle>
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
                disabled={createExitMutation.isPending}
                data-testid="input-exit-date"
              />
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium text-foreground mb-4">Denominaciones Entregadas</h4>
            <DenominationInput
              denominations={denominationsGiven}
              onChange={setDenominationsGiven}
              availableDenominations={cashBox?.denominations}
              showTotal={true}
              disabled={createExitMutation.isPending}
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-border">
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
              disabled={createExitMutation.isPending}
              data-testid="button-save-exit"
            >
              {createExitMutation.isPending ? (
                "Guardando..."
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
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
