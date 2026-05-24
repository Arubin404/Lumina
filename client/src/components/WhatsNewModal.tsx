import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ArrowRight } from "lucide-react";

interface WhatsNewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  newVersion: string;
  previousVersion: string;
  releaseNotes: string;
}

export default function WhatsNewModal({ open, onOpenChange, newVersion, previousVersion, releaseNotes }: WhatsNewModalProps) {
  const lines = releaseNotes
    ? releaseNotes.split('\n').flatMap(l => {
        const trimmed = l.trim();
        return trimmed ? [trimmed] : [];
      })
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-emerald-500/20 bg-[#0a1410]">
        {/* Green top accent */}
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-500 via-green-400 to-emerald-500 rounded-t-lg" />

        <DialogHeader className="pt-3">
          <div className="flex flex-col items-center text-center gap-3">
            {/* Sparkle icon */}
            <div className="size-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Sparkles className="size-8 text-emerald-400" />
            </div>

            <div>
              <DialogTitle className="text-xl font-bold text-white mb-1">
                ¡Caja Lumina actualizado!
              </DialogTitle>
            <DialogDescription>
              Revisar las novedades entre {previousVersion} y {newVersion}.
            </DialogDescription>
              <div className="flex items-center justify-center gap-2 text-sm text-slate-400">
                <Badge variant="outline" className="text-slate-400 border-slate-600 font-mono text-xs">
                  v{previousVersion}
                </Badge>
                <ArrowRight className="size-3" />
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 font-mono text-xs">
                  v{newVersion}
                </Badge>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Release notes */}
        {releaseNotes && (
          <div className="mt-2">
            <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2 px-1">
              Novedades de esta versión:
            </p>
            <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-4 max-h-[240px] overflow-y-auto space-y-1.5">
              {lines.map((line) => {
                const isBullet = line.startsWith('-') || line.startsWith('•') || line.startsWith('*');
                const text = isBullet ? line.slice(1).trim() : line;
                return (
                  <div key={`feat-${line}`} className="flex items-start gap-2 text-sm text-slate-300">
                    {isBullet && (
                      <span className="text-emerald-400 mt-0.5 shrink-0">✓</span>
                    )}
                    <span className={isBullet ? "" : "font-semibold text-white"}>{text}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <Button
          onClick={() => onOpenChange(false)}
          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold mt-2"
        >
          <Sparkles className="size-4 mr-2" />
          ¡Entendido, a seguir trabajando!
        </Button>
      </DialogContent>
    </Dialog>
  );
}
