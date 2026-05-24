import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Clock, X } from "lucide-react";

interface EditWarningModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  daysSince: number;
  editWindowDays: number;
  onConfirm: () => void;
}

const COUNTDOWN_SECONDS = 10;

export default function EditWarningModal({ open, onOpenChange, daysSince, editWindowDays, onConfirm }: EditWarningModalProps) {
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (open) {
      setCountdown(COUNTDOWN_SECONDS);
      intervalRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [open]);

  const handleConfirm = () => {
    onOpenChange(false);
    onConfirm();
  };

  const progressPercent = ((COUNTDOWN_SECONDS - countdown) / COUNTDOWN_SECONDS) * 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-destructive/50 bg-background">
        {/* Red accent bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-destructive via-red-400 to-destructive rounded-t-lg" />

        <DialogHeader className="pt-4">
          <div className="flex flex-col items-center text-center gap-4">
            {/* Warning icon */}
            <div className="size-20 rounded-full bg-destructive/10 border-2 border-destructive/30 flex items-center justify-center">
              <AlertTriangle className="size-10 text-destructive" strokeWidth={2.5} />
            </div>

            <div>
              <DialogTitle className="text-xl font-bold text-destructive mb-2">
                ⚠️ Edición Fuera de Plazo
              </DialogTitle>
              <DialogDescription>
                Confirma la edición para registrar el cambio pese a exceder el plazo recomendado.
              </DialogDescription>
              <p className="text-sm text-muted-foreground">
                Este registro tiene <strong className="text-foreground">{daysSince} días</strong> desde su creación.
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Warning card */}
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 space-y-2">
            <p className="text-sm font-semibold text-destructive flex items-center gap-2">
              <AlertTriangle className="size-4 shrink-0" />
              No se recomienda editar registros con más de {editWindowDays} días
            </p>
            <ul className="text-xs text-muted-foreground space-y-1 pl-6 list-disc">
              <li>Editar registros antiguos puede afectar la integridad de los cierres y reportes ya generados.</li>
              <li>Los balances históricos pueden quedar inconsistentes.</li>
              <li>Se registrará que este movimiento fue editado fuera del plazo estándar.</li>
            </ul>
          </div>

          {/* Countdown bar */}
          {countdown > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Clock className="size-3.5" />
                  <span>El botón estará disponible en {countdown}s</span>
                </div>
                <span>{countdown}s</span>
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-destructive/60 rounded-full transition-all duration-1000 ease-linear"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button
            variant="outline"
            className="flex-1 border-border"
            onClick={() => onOpenChange(false)}
          >
            <X className="size-4 mr-2" />
            Cancelar (Recomendado)
          </Button>
          <Button
            variant="destructive"
            className="flex-1"
            disabled={countdown > 0}
            onClick={handleConfirm}
            data-testid="button-force-edit"
          >
            {countdown > 0
              ? `Intentar de todas formas (${countdown}s)`
              : "Intentar de todas formas"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
