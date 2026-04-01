import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Settings, Hash, AlertTriangle, Save, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Configuration, UpdateConfig } from "@shared/schema";

export default function Configuracion() {
  const [nextVoucherNumber, setNextVoucherNumber] = useState<number | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: config, isLoading } = useQuery<Configuration>({
    queryKey: ["/api/configuration"],
  });

  // Use useEffect to handle data updates
  useEffect(() => {
    if (config && nextVoucherNumber === null) {
      setNextVoucherNumber(config.nextVoucherNumber);
    }
  }, [config, nextVoucherNumber]);

  const updateConfigMutation = useMutation({
    mutationFn: async (configData: UpdateConfig) => {
      const response = await apiRequest("PUT", "/api/configuration", configData);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Configuración actualizada",
        description: "Los cambios se han guardado correctamente",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/configuration"] });
      setHasUnsavedChanges(false);
    },
    onError: (error) => {
      toast({
        title: "Error al actualizar configuración",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleVoucherNumberChange = (value: string) => {
    const numValue = parseInt(value) || 1;
    setNextVoucherNumber(Math.max(1, numValue));
    setHasUnsavedChanges(true);
  };

  const handleSave = () => {
    if (nextVoucherNumber === null) return;
    
    updateConfigMutation.mutate({
      nextVoucherNumber,
    });
  };

  const handleReset = () => {
    if (config) {
      setNextVoucherNumber(config.nextVoucherNumber);
      setHasUnsavedChanges(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Cargando configuración...</div>
      </div>
    );
  }

  const willCreateDuplicates = config && nextVoucherNumber !== null && nextVoucherNumber < config.nextVoucherNumber;
  const hasSignificantJump = config && nextVoucherNumber !== null && nextVoucherNumber > (config.nextVoucherNumber + 100);

  return (
    <>
      <div className="bg-card border-b border-border px-8 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Configuración</h2>
            <p className="text-muted-foreground">Configuración del sistema de caja</p>
          </div>
          <div className="flex space-x-3">
            {hasUnsavedChanges && (
              <Button
                onClick={handleReset}
                variant="outline"
                disabled={updateConfigMutation.isPending}
                data-testid="button-reset-config"
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Descartar
              </Button>
            )}
            <Button
              onClick={handleSave}
              disabled={!hasUnsavedChanges || updateConfigMutation.isPending}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
              data-testid="button-save-config"
            >
              {updateConfigMutation.isPending ? (
                "Guardando..."
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Guardar Cambios
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="p-8 space-y-6">
        {/* Current Configuration Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-sm font-medium">Próximo Voucher</p>
                  <p className="text-2xl font-bold text-foreground">
                    #{config?.nextVoucherNumber.toString().padStart(4, "0")}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Actualmente configurado
                  </p>
                </div>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Hash className="text-primary h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-sm font-medium">Última Actualización</p>
                  <p className="text-lg font-bold text-foreground">
                    {config ? new Date(config.lastUpdated).toLocaleDateString() : "-"}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {config ? new Date(config.lastUpdated).toLocaleTimeString() : ""}
                  </p>
                </div>
                <div className="w-12 h-12 bg-muted/10 rounded-lg flex items-center justify-center">
                  <Settings className="text-muted-foreground h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-sm font-medium">Estado</p>
                  <p className="text-lg font-bold text-success">Activo</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Sistema funcionando
                  </p>
                </div>
                <div className="w-12 h-12 bg-success/10 rounded-lg flex items-center justify-center">
                  <div className="w-3 h-3 bg-success rounded-full"></div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Voucher Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Hash className="mr-2 h-5 w-5" />
              Configuración de Vouchers
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-primary/10 rounded-lg p-4 border border-primary/20">
              <h4 className="font-semibold text-primary mb-2">¿Cómo funcionan los vouchers?</h4>
              <ul className="text-sm text-primary space-y-1">
                <li>• Cada factura o salida completada recibe un número de voucher único y consecutivo</li>
                <li>• Los ingresos también reciben vouchers para mantener trazabilidad completa</li>
                <li>• La secuencia es configurable para continuar desde un número específico</li>
                <li>• Los vouchers se muestran en reportes Excel y en la interfaz del sistema</li>
              </ul>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="voucherNumber" className="text-sm font-medium text-foreground">
                  Próximo Número de Voucher
                </Label>
                <div className="mt-2">
                  <Input
                    id="voucherNumber"
                    type="number"
                    min="1"
                    value={nextVoucherNumber || ""}
                    onChange={(e) => handleVoucherNumberChange(e.target.value)}
                    placeholder="Número del próximo voucher"
                    disabled={updateConfigMutation.isPending}
                    data-testid="input-voucher-number"
                  />
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  El próximo voucher será: #{nextVoucherNumber?.toString().padStart(4, "0") || "0001"}
                </p>
              </div>

              <div className="space-y-4">
                <div className="bg-muted/30 rounded-lg p-4">
                  <h4 className="font-medium text-foreground mb-2">Ejemplo de Uso:</h4>
                  <p className="text-sm text-muted-foreground">
                    Si el último voucher utilizado fue el #0150, configure el próximo número como 151 
                    para continuar la secuencia sin saltos.
                  </p>
                </div>
              </div>
            </div>

            {/* Validation Warnings */}
            {willCreateDuplicates && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Advertencia:</strong> El número configurado ({nextVoucherNumber}) es menor al actual ({config?.nextVoucherNumber}). 
                  Esto podría crear vouchers duplicados. Verifique que este cambio sea intencional.
                </AlertDescription>
              </Alert>
            )}

            {hasSignificantJump && (
              <Alert className="border-warning bg-warning/10">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <AlertDescription className="text-warning">
                  <strong>Atención:</strong> Hay un salto significativo en la numeración 
                  (de {config?.nextVoucherNumber} a {nextVoucherNumber}). 
                  Esto creará un vacío en la secuencia de vouchers.
                </AlertDescription>
              </Alert>
            )}

            {hasUnsavedChanges && !willCreateDuplicates && !hasSignificantJump && (
              <Alert className="border-primary bg-primary/10">
                <Settings className="h-4 w-4 text-primary" />
                <AlertDescription className="text-primary">
                  Tienes cambios sin guardar. Haz clic en "Guardar Cambios" para aplicar la nueva configuración.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* System Information */}
        <Card>
          <CardHeader>
            <CardTitle>Información del Sistema</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium text-foreground">Versión del Sistema</Label>
                  <p className="text-sm text-muted-foreground mt-1">Sistema de Caja Profesional v1.0</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-foreground">Modo de Operación</Label>
                  <p className="text-sm text-muted-foreground mt-1">Aplicación de escritorio (Windows)</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-foreground">Almacenamiento</Label>
                  <p className="text-sm text-muted-foreground mt-1">Base de datos local (Sin conexión requerida)</p>
                </div>
              </div>
              
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium text-foreground">Sincronización</Label>
                  <p className="text-sm text-success mt-1">✓ Tiempo real activo</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-foreground">Backup Automático</Label>
                  <p className="text-sm text-muted-foreground mt-1">Configurar desde el sistema operativo</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-foreground">Exportación</Label>
                  <p className="text-sm text-muted-foreground mt-1">Reportes Excel disponibles</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Best Practices */}
        <Card>
          <CardHeader>
            <CardTitle>Mejores Prácticas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="bg-success/10 rounded-lg p-4 border border-success/20">
                <h4 className="font-semibold text-success mb-2">Recomendaciones de Seguridad</h4>
                <ul className="text-sm text-success space-y-1">
                  <li>• Realice respaldos regulares de los datos del sistema</li>
                  <li>• Verifique el balance físico vs teórico diariamente</li>
                  <li>• Complete las salidas pendientes al final de cada día</li>
                  <li>• Genere reportes mensuales para auditoría</li>
                </ul>
              </div>

              <div className="bg-warning/10 rounded-lg p-4 border border-warning/20">
                <h4 className="font-semibold text-warning mb-2">Advertencias Importantes</h4>
                <ul className="text-sm text-warning space-y-1">
                  <li>• No modifique la configuración de vouchers sin planificación previa</li>
                  <li>• Los cambios en la numeración afectan la secuencia permanentemente</li>
                  <li>• Mantenga registro manual de cambios importantes</li>
                  <li>• Revise movimientos editados regularmente</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
