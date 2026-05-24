import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Clock, History, AlertCircle } from "lucide-react";
import { AuditLog } from "@shared/schema";
import { formatCurrency } from "@/lib/denomination-utils";

interface AuditLogModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: string;
}

export default function AuditLogModal({ open, onOpenChange, entityId }: AuditLogModalProps) {
  const { data: logs, isLoading, error } = useQuery<AuditLog[]>({
    queryKey: [`/api/audit-logs/${entityId}`],
    enabled: open && !!entityId,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-background border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-5 text-primary" />
            Historial de Ediciones
          </DialogTitle>
        </DialogHeader>

        <div className="mt-4">
          {isLoading ? (
            <div className="flex justify-center p-8 text-muted-foreground">
              Cargando historial...
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-2 text-destructive p-8 bg-destructive/10 rounded-lg">
              <AlertCircle className="size-6" />
              <span>No se pudo cargar el historial</span>
            </div>
          ) : !logs || logs.length === 0 ? (
            <div className="text-center p-8 text-muted-foreground bg-muted/20 rounded-lg border border-dashed border-border">
              No hay historial de ediciones para este registro.
            </div>
          ) : (
            <div className="h-[400px] overflow-y-auto pr-4">
              <div className="space-y-6">
                {logs.map((log) => {
                  const oldData = log.previousData ? JSON.parse(log.previousData as string) : null;
                  const newData = log.newData ? JSON.parse(log.newData as string) : null;
                  
                  return (
                    <div key={log.id} className="border border-border rounded-lg p-4 bg-card shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
                      
                      <div className="flex justify-between items-center mb-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                          <Clock className="size-4" />
                          {new Date(log.createdAt).toLocaleString("es-ES", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </div>
                        <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-md uppercase font-bold tracking-wider">
                          Edición
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-4 mt-4">
                        <div className="space-y-2 p-3 bg-destructive/5 rounded-md border border-destructive/10">
                          <p className="text-xs font-semibold text-destructive uppercase tracking-wider mb-2">Datos Anteriores</p>
                          <div className="text-sm">
                            {oldData ? (
                              <ul className="space-y-1">
                                {oldData.detail && <li><span className="text-muted-foreground">Detalle:</span> {oldData.detail}</li>}
                                {oldData.purpose && <li><span className="text-muted-foreground">Propósito:</span> {oldData.purpose}</li>}
                                {oldData.totalAmount !== undefined && <li><span className="text-muted-foreground">Monto:</span> {formatCurrency(oldData.totalAmount)}</li>}
                                {oldData.initialAmount !== undefined && <li><span className="text-muted-foreground">Monto:</span> {formatCurrency(oldData.initialAmount)}</li>}
                              </ul>
                            ) : (
                              <span className="text-muted-foreground italic">N/A</span>
                            )}
                          </div>
                        </div>

                        <div className="space-y-2 p-3 bg-success/5 rounded-md border border-success/10">
                          <p className="text-xs font-semibold text-success uppercase tracking-wider mb-2">Datos Nuevos</p>
                          <div className="text-sm">
                            {newData ? (
                              <ul className="space-y-1">
                                {newData.detail && <li><span className="text-muted-foreground">Detalle:</span> {newData.detail}</li>}
                                {newData.purpose && <li><span className="text-muted-foreground">Propósito:</span> {newData.purpose}</li>}
                                {newData.totalAmount !== undefined && <li><span className="text-muted-foreground">Monto:</span> {formatCurrency(newData.totalAmount)}</li>}
                                {newData.initialAmount !== undefined && <li><span className="text-muted-foreground">Monto:</span> {formatCurrency(newData.initialAmount)}</li>}
                              </ul>
                            ) : (
                              <span className="text-muted-foreground italic">N/A</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
