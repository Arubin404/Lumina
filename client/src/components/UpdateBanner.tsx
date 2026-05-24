import { useState, useEffect, useRef } from "react";
import { Download, X, RefreshCw, AlertCircle, CheckCircle, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import WhatsNewModal from "@/components/WhatsNewModal";

// ─── Types ───────────────────────────────────────────────────

interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  downloadUrl: string;
  releaseNotes: string;
  mandatory: boolean;
}

interface DownloadProgress {
  percent: number;
  status: "downloading" | "error";
  error?: string;
}

interface ReadyInfo {
  latestVersion: string;
  downloadedPath: string;
  releaseNotes: string;
  currentVersion: string;
}

interface WhatsNewInfo {
  newVersion: string;
  previousVersion: string;
  releaseNotes: string;
}

type BannerState = "idle" | "available" | "downloading" | "ready" | "error";

declare global {
  interface Window {
    electronAPI?: {
      checkForUpdates: () => Promise<UpdateInfo & { available: boolean }>;
      onUpdateAvailable: (cb: (data: UpdateInfo) => void) => void;
      onDownloadProgress: (cb: (data: DownloadProgress) => void) => void;
      onUpdateReady: (cb: (data: ReadyInfo) => void) => void;
      onWhatsNew: (cb: (data: WhatsNewInfo) => void) => void;
      installAndRestart: (path: string) => Promise<{ success: boolean; error?: string }>;
      removeUpdateListeners: () => void;
    };
  }
}

// ─── Persistence helpers ─────────────────────────────────────

const STORAGE_KEY = "cajalumina_update_state";

function persistState(state: { bannerState: BannerState; downloadedPath?: string; latestVersion?: string; percent?: number; releaseNotes?: string }) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

function loadPersistedState(): { bannerState: BannerState; downloadedPath?: string; latestVersion?: string; percent?: number; releaseNotes?: string } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function clearPersistedState() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

// ─── Component ───────────────────────────────────────────────

export default function UpdateBanner() {
  const isElectron = typeof window !== "undefined" && !!window.electronAPI;

  // Banner state
  const [bannerState, setBannerState] = useState<BannerState>("idle");
  const [dismissed, setDismissed] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [downloadPercent, setDownloadPercent] = useState(0);
  const [downloadedPath, setDownloadedPath] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState("");

  // What's New modal
  const [whatsNew, setWhatsNew] = useState<WhatsNewInfo | null>(null);

  // Animated shimmer on progress bar
  const animatedPercent = useRef(0);

  // ── On mount: restore persisted state ──────────────────────
  useEffect(() => {
    if (!isElectron) return;

    const saved = loadPersistedState();
    if (saved && saved.bannerState === "ready" && saved.downloadedPath) {
      setBannerState("ready");
      setDownloadedPath(saved.downloadedPath);
      if (saved.percent) setDownloadPercent(saved.percent);
    } else if (saved && saved.bannerState === "downloading") {
      // Was downloading before reload — show progress bar at last known %
      setBannerState("downloading");
      setDownloadPercent(saved.percent || 0);
    }

    // ── IPC listeners ──────────────────────────────────────

    window.electronAPI!.onUpdateAvailable((data) => {
      setUpdateInfo(data);
      setBannerState("available");
      setDismissed(false);
      setDownloadPercent(0);
      persistState({ bannerState: "available", latestVersion: data.latestVersion });
    });

    window.electronAPI!.onDownloadProgress(({ percent, status, error }) => {
      if (status === "error") {
        setBannerState("error");
        setErrorMsg(error || "Error desconocido");
        clearPersistedState();
        return;
      }
      setDownloadPercent(percent);
      setBannerState("downloading");
      persistState({ bannerState: "downloading", percent });
    });

    window.electronAPI!.onUpdateReady(({ latestVersion, downloadedPath: dlPath, releaseNotes, currentVersion }) => {
      setDownloadedPath(dlPath);
      setDownloadPercent(100);
      setBannerState("ready");
      if (!updateInfo) {
        setUpdateInfo({ latestVersion, currentVersion, downloadUrl: "", releaseNotes, mandatory: false });
      }
      persistState({ bannerState: "ready", downloadedPath: dlPath, latestVersion, percent: 100, releaseNotes });
    });

    window.electronAPI!.onWhatsNew((data) => {
      setWhatsNew(data);
      clearPersistedState();
    });

    return () => {
      window.electronAPI!.removeUpdateListeners();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isElectron]);

  const handleInstallAndRestart = async () => {
    if (!window.electronAPI || !downloadedPath) return;
    const result = await window.electronAPI.installAndRestart(downloadedPath);
    if (!result.success) {
      setErrorMsg(result.error || "No se pudo iniciar la actualización");
      setBannerState("error");
    }
  };

  // Don't render if not Electron, nothing to show, or dismissed (non-mandatory)
  if (!isElectron) return null;
  if (bannerState === "idle") return null;
  if (dismissed && updateInfo && !updateInfo.mandatory) return null;

  // ── Render ─────────────────────────────────────────────────

  const isReady = bannerState === "ready";
  const isDownloading = bannerState === "downloading";
  const isError = bannerState === "error";
  const isAvailable = bannerState === "available";

  return (
    <>
      {/* What's New Modal */}
      {whatsNew && (
        <WhatsNewModal
          open={!!whatsNew}
          onOpenChange={(o) => !o && setWhatsNew(null)}
          newVersion={whatsNew.newVersion}
          previousVersion={whatsNew.previousVersion}
          releaseNotes={whatsNew.releaseNotes}
        />
      )}

      {/* Update Toast */}
      <div
        className="fixed bottom-5 right-5 z-50 w-[360px] animate-in slide-in-from-bottom-5 duration-400"
        role="status"
        aria-live="polite"
      >
        <div
          className={`relative rounded-2xl border shadow-2xl overflow-hidden transition-all duration-500 ${
            isReady
              ? "border-emerald-500/40 bg-[#0a1a10] shadow-emerald-500/10"
              : isError
              ? "border-destructive/40 bg-[#1a0a0a] shadow-destructive/10"
              : "border-blue-500/30 bg-[#0d1117] shadow-blue-500/10"
          }`}
        >
          {/* Gradient top accent */}
          <div
            className={`absolute top-0 left-0 right-0 h-0.5 transition-all duration-500 ${
              isReady
                ? "bg-gradient-to-r from-emerald-500 via-green-400 to-emerald-500"
                : isError
                ? "bg-gradient-to-r from-destructive via-red-400 to-destructive"
                : "bg-gradient-to-r from-blue-500 via-indigo-400 to-purple-500"
            }`}
          />

          <div className="p-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2.5">
                <div
                  className={`size-9 rounded-full flex items-center justify-center shrink-0 transition-colors duration-500 ${
                    isReady
                      ? "bg-emerald-500/15"
                      : isError
                      ? "bg-destructive/15"
                      : "bg-blue-500/15"
                  }`}
                >
                  {isReady ? (
                    <CheckCircle className="size-4.5 text-emerald-400" />
                  ) : isError ? (
                    <AlertCircle className="size-4.5 text-destructive" />
                  ) : isDownloading ? (
                    <RefreshCw className="size-4.5 text-blue-400 animate-spin" />
                  ) : (
                    <Download className="size-4.5 text-blue-400" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">
                    {isReady
                      ? "✅ Actualización lista"
                      : isError
                      ? "Error de actualización"
                      : isDownloading
                      ? "Descargando actualización..."
                      : "Nueva versión disponible"}
                  </p>
                  {updateInfo && (
                    <p className="text-xs text-slate-400 mt-0.5">
                      {isReady
                        ? `v${updateInfo.currentVersion} → v${updateInfo.latestVersion} — Listo para instalar`
                        : `v${updateInfo.currentVersion} → v${updateInfo.latestVersion}`}
                    </p>
                  )}
                </div>
              </div>

              {/* Dismiss button (non-mandatory, non-downloading) */}
              {!updateInfo?.mandatory && !isDownloading && !isReady && (
                <button
                  onClick={() => setDismissed(true)}
                  className="text-slate-500 hover:text-white transition-colors mt-0.5 shrink-0"
                  aria-label="Cerrar"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>

            {/* Progress bar (downloading or ready) */}
            {(isDownloading || isReady) && (
              <div className="mb-3">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                  <span>{isReady ? "Descarga completada" : `Descargando... ${downloadPercent}%`}</span>
                  <span className={isReady ? "text-emerald-400 font-medium" : ""}>{downloadPercent}%</span>
                </div>
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ease-out ${
                      isReady
                        ? "bg-gradient-to-r from-emerald-500 to-green-400"
                        : "bg-gradient-to-r from-blue-500 to-indigo-400"
                    }`}
                    style={{ width: `${downloadPercent}%` }}
                  />
                </div>
              </div>
            )}

            {/* Error message */}
            {isError && (
              <div className="flex items-start gap-2 mb-3 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20">
                <AlertCircle className="size-3.5 text-destructive shrink-0 mt-0.5" />
                <p className="text-xs text-destructive">{errorMsg}</p>
              </div>
            )}

            {/* Release notes (available state only) */}
            {isAvailable && updateInfo?.releaseNotes && (
              <div className="mb-3">
                <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-1.5 px-1">
                  Novedades:
                </p>
                <div className="max-h-[100px] overflow-y-auto">
                  <div className="text-xs text-slate-300 leading-relaxed bg-blue-500/5 rounded-lg border border-blue-500/10 p-2.5 whitespace-pre-line">
                    {updateInfo.releaseNotes.split('\n').map((line, i) => (
                      <div key={`update-note-${line}-${i}`} className="mb-0.5 last:mb-0">
                        {line.trim().startsWith('-') || line.trim().startsWith('•')
                          ? <span className="flex gap-1.5"><span>•</span><span>{line.trim().substring(1).trim()}</span></span>
                          : line}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Mandatory badge */}
            {updateInfo?.mandatory && !isReady && (
              <div className="flex items-center gap-1.5 mb-3 text-amber-400">
                <AlertCircle className="size-3.5 shrink-0" />
                <p className="text-xs font-medium">Actualización obligatoria</p>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-2">
              {isReady && (
                <Button
                  size="sm"
                  onClick={handleInstallAndRestart}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-9 font-semibold shadow-lg shadow-emerald-500/20 transition-all"
                >
                  <Rocket className="size-3.5 mr-1.5" />
                  Reiniciar para actualizar
                </Button>
              )}
              {isAvailable && (
                <>
                  {!updateInfo?.mandatory && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDismissed(true)}
                      className="text-xs h-8 text-slate-400 hover:text-white"
                    >
                      Más tarde
                    </Button>
                  )}
                  <p className="text-xs text-slate-500 self-center ml-auto">Descargando automáticamente...</p>
                </>
              )}
              {isError && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setBannerState("idle"); clearPersistedState(); }}
                  className="flex-1 text-xs h-8 text-slate-400"
                >
                  Cerrar
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
