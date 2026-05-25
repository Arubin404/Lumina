import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Hash, AlertTriangle, Save, RotateCcw, Upload, Info, CheckCircle2, FolderOpen, ShieldCheck, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Configuration, UpdateConfig } from "@shared/schema";

export default function Configuracion() {
  const [nextVoucherNumber, setNextVoucherNumber] = useState<number | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [fileToImport, setFileToImport] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [showImportWarning, setShowImportWarning] = useState(false);

  const [storeName, setStoreName] = useState("");
  const [currencyPrefix, setCurrencyPrefix] = useState("$");
  const [taxId, setTaxId] = useState("");
  const [editWindowDays, setEditWindowDays] = useState(20);
  const [confirmBeforeEdit, setConfirmBeforeEdit] = useState(true);
  const [editHistory, setEditHistory] = useState(true);
  const [lockClosedPeriods, setLockClosedPeriods] = useState(false);
  const [backupPath, setBackupPath] = useState("");
  const [backupOnClose, setBackupOnClose] = useState(false);
  const [backupOnSave, setBackupOnSave] = useState(true);
  const [backupRetention, setBackupRetention] = useState(30);
  const [retentionEnabled, setRetentionEnabled] = useState(true);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [dbFileToRestore, setDbFileToRestore] = useState<File | null>(null);
  const [isRestoringDb, setIsRestoringDb] = useState(false);
  const [showRestoreWarning, setShowRestoreWarning] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: config, isLoading } = useQuery<Configuration>({
    queryKey: ["/api/configuration"],
    refetchInterval: 3000,
  });

  useEffect(() => {
    if (config && !hasUnsavedChanges) {
      setNextVoucherNumber(config.nextVoucherNumber);
      if (config.storeName !== undefined) setStoreName(config.storeName);
      if (config.currencyPrefix !== undefined) setCurrencyPrefix(config.currencyPrefix);
      if (config.taxId !== undefined) setTaxId(config.taxId);
      if (config.editWindowDays !== undefined) setEditWindowDays(config.editWindowDays);
      if (config.confirmBeforeEdit !== undefined) setConfirmBeforeEdit(config.confirmBeforeEdit);
      if (config.editHistory !== undefined) setEditHistory(config.editHistory);
      if (config.lockClosedPeriods !== undefined) setLockClosedPeriods(config.lockClosedPeriods);
      if (config.backupPath !== undefined) setBackupPath(config.backupPath);
      if (config.backupOnClose !== undefined) setBackupOnClose(config.backupOnClose);
      if (config.backupOnSave !== undefined) setBackupOnSave(config.backupOnSave);
      if (config.backupRetention !== undefined) setBackupRetention(config.backupRetention);
      if (config.retentionEnabled !== undefined) setRetentionEnabled(config.retentionEnabled);
    }
  }, [config, hasUnsavedChanges]);

  const updateConfigMutation = useMutation({
    mutationFn: async (configData: UpdateConfig) => {
      const response = await apiRequest("PUT", "/api/configuration", configData);
      return response.json();
    },
    onSuccess: (updatedConfig) => {
      toast({
        title: "Configuración actualizada",
        description: "Los cambios se han guardado correctamente",
      });
      queryClient.setQueryData(["/api/configuration"], updatedConfig);
      queryClient.invalidateQueries({ queryKey: ["/api/configuration"] });
      queryClient.invalidateQueries({ queryKey: ["/api/configuration/next-voucher"] });
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

  const markDirty = () => setHasUnsavedChanges(true);

  const handleVoucherNumberChange = (value: string) => {
    const numValue = parseInt(value, 10) || 1;
    setNextVoucherNumber(Math.max(1, numValue));
    markDirty();
  };

  const handleSave = () => {
    if (nextVoucherNumber === null) return;
    updateConfigMutation.mutate({ 
      nextVoucherNumber,
      storeName,
      currencyPrefix,
      taxId,
      editWindowDays,
      confirmBeforeEdit,
      editHistory,
      lockClosedPeriods,
      backupPath,
      backupOnClose,
      backupOnSave,
      backupRetention,
      retentionEnabled
    });
  };

  const handleReset = () => {
    if (!config) return;
    setNextVoucherNumber(config.nextVoucherNumber);
    setStoreName(config.storeName ?? "");
    setCurrencyPrefix(config.currencyPrefix ?? "$");
    setTaxId(config.taxId ?? "");
    setEditWindowDays(config.editWindowDays ?? 20);
    setConfirmBeforeEdit(config.confirmBeforeEdit ?? true);
    setEditHistory(config.editHistory ?? true);
    setLockClosedPeriods(config.lockClosedPeriods ?? false);
    setBackupPath(config.backupPath ?? "");
    setBackupOnClose(config.backupOnClose ?? false);
    setBackupOnSave(config.backupOnSave ?? true);
    setBackupRetention(config.backupRetention ?? 30);
    setRetentionEnabled(config.retentionEnabled ?? true);
    setHasUnsavedChanges(false);
  };

  const handleSelectDirectory = async () => {
    const api = (window as any).electronAPI;
    if (!api) return;
    const selectedPath = await api.selectDirectory();
    if (selectedPath) {
      setBackupPath(selectedPath);
      markDirty();
    }
  };

  const handleBackupNow = async () => {
    let currentPath = backupPath;
    const api = (window as any).electronAPI;

    if (!currentPath || currentPath.trim() === "") {
      if (api) {
        const selectedPath = await api.selectDirectory();
        if (!selectedPath) {
          toast({
            title: "Backup cancelado",
            description: "Debe seleccionar una carpeta para el respaldo contable.",
            variant: "destructive",
          });
          return;
        }
        currentPath = selectedPath;
        setBackupPath(selectedPath);
        // Save configuration immediately so it is persisted
        updateConfigMutation.mutate({ backupPath: selectedPath });
      } else {
        toast({
          title: "Ruta de respaldo requerida",
          description: "Por favor, especifique una ruta de respaldo antes de continuar.",
          variant: "destructive",
        });
        return;
      }
    }

    setIsBackingUp(true);
    try {
      if (api) {
        const result = await api.backupNow(currentPath);
        if (result?.success) {
          toast({ title: "Backup creado", description: result.externalPath ? `Copia guardada en ruta externa.` : "Copia interna creada exitosamente." });
        } else {
          toast({ title: "Error de Backup", description: result?.error || "Error desconocido", variant: "destructive" });
        }
      } else {
        // Web fallback via server API
        const res = await fetch("/api/backup/now", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ backupPath: currentPath })
        });
        const data = await res.json();
        if (res.ok) {
          toast({ title: "Backup creado", description: "Copia de seguridad generada exitosamente." });
        } else {
          toast({ title: "Error de Backup", description: data.message, variant: "destructive" });
        }
      }
    } catch (e: any) {
      toast({ title: "Error de Backup", description: e.message, variant: "destructive" });
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFileToImport(e.target.files[0]);
    }
  };

  const handleDbFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setDbFileToRestore(e.target.files[0]);
    }
  };

  const handleRestoreDb = async () => {
    if (!dbFileToRestore) return;
    setIsRestoringDb(true);
    try {
      const formData = new FormData();
      formData.append("file", dbFileToRestore);
      const response = await fetch(`/api/import-db`, { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Error al restaurar base de datos");

      toast({
        title: "Base de Datos Restaurada",
        description: "El sistema ha sido restaurado exitosamente desde la copia de seguridad.",
      });
      // Invalidate all query data immediately to reload the app states
      queryClient.invalidateQueries();
      setDbFileToRestore(null);
      setShowRestoreWarning(false);
      const fileInput = document.getElementById("dbFile") as HTMLInputElement;
      if (fileInput) fileInput.value = "";
    } catch (error: any) {
      toast({
        title: "Error de Restauración",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsRestoringDb(false);
    }
  };

  const [importMode, setImportMode] = useState<'replace' | 'append'>('replace');

  const handleImport = async () => {
    if (!fileToImport) return;
    setIsImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", fileToImport);
      const response = await fetch(`/api/import-excel?mode=${importMode}`, { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Error al importar");

      toast({
        title: "Importación Exitosa",
        description: `Se importaron ${data.totalIncomes} ingresos y ${data.totalExits} salidas correctamente (${importMode === 'replace' ? 'Reemplazo' : 'Anexo'}).`,
      });
      queryClient.invalidateQueries();
      setFileToImport(null);
      setShowImportWarning(false);
      const fileInput = document.getElementById("excelFile") as HTMLInputElement;
      if (fileInput) fileInput.value = "";
    } catch (error: any) {
      toast({
        title: "Error de Importación",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
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
  const liveVoucher = `#${(nextVoucherNumber ?? 1).toString().padStart(4, "0")}`;

  const riskCopy =
    editWindowDays <= 7
      ? "Riesgo bajo - recomendado para entornos auditados"
      : editWindowDays <= 20
        ? "Riesgo moderado - valido para uso general"
        : "Riesgo alto - permite editar historial financiero extenso";

  const riskColor =
    editWindowDays <= 7
      ? "text-emerald-500"
      : editWindowDays <= 20
        ? "text-amber-500"
        : "text-destructive";

  return (
    <TooltipProvider>
      <div className="bg-card border-b border-border px-8 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Configuración</h2>
            <p className="text-muted-foreground">Sistema de Caja · Profesional</p>
          </div>
          <div className="flex gap-x-3">
            {hasUnsavedChanges && (
              <Button onClick={handleReset} variant="outline" disabled={updateConfigMutation.isPending} data-testid="button-reset-config">
                <RotateCcw className="mr-2 size-4" />
                Descartar
              </Button>
            )}
            <Button onClick={handleSave} disabled={!hasUnsavedChanges || updateConfigMutation.isPending} className="bg-primary hover:bg-primary/90" data-testid="button-save-config">
              <Save className="mr-2 size-4" />
              {updateConfigMutation.isPending ? "Guardando..." : "Guardar cambios"}
            </Button>
          </div>
        </div>
      </div>

      <div className="p-8 max-w-5xl mx-auto space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card><CardContent className="p-5"><p className="text-xs uppercase tracking-wider text-muted-foreground">Próximo Voucher</p><p className="text-2xl font-semibold text-primary mt-2">{liveVoucher}</p><p className="text-xs text-muted-foreground mt-1">Actualmente configurado</p></CardContent></Card>
          <Card><CardContent className="p-5"><p className="text-xs uppercase tracking-wider text-muted-foreground">Última Actualización</p><p className="text-base font-semibold mt-2" suppressHydrationWarning>{config ? new Date(config.lastUpdated).toLocaleDateString() : "-"}</p><p className="text-xs text-muted-foreground mt-1" suppressHydrationWarning>{config ? new Date(config.lastUpdated).toLocaleTimeString() : ""}</p></CardContent></Card>
          <Card><CardContent className="p-5"><p className="text-xs uppercase tracking-wider text-muted-foreground">Estado del Sistema</p><div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400 mt-2"><span className="size-2 rounded-full bg-emerald-400" />Activo · v1.0.4</div><p className="text-xs text-muted-foreground mt-2">Base de datos local</p></CardContent></Card>
        </div>

        <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Vouchers</p>
        <Card>
          <CardContent className="p-5 flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 font-medium">Próximo número de voucher <Hint text="Cada movimiento completado recibe un número único y consecutivo. Si el último fue #0150, escribe 151." /></div>
              <p className="text-sm text-muted-foreground">La secuencia avanzará a partir de este número.</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-xl font-mono text-primary">{liveVoucher}</div>
              <Input type="number" min="1" value={nextVoucherNumber ?? 1} onChange={(e) => handleVoucherNumberChange(e.target.value)} className="w-24 text-center" data-testid="input-voucher-number" />
            </div>
          </CardContent>
        </Card>

        <p className="text-[11px] uppercase tracking-widest text-muted-foreground flex items-center gap-2">Identidad del negocio <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">Nuevo</Badge></p>
        <Card>
          <CardContent className="p-5 space-y-4">
            <div><Label className="font-medium">Nombre del establecimiento <Hint text="Se incluye en encabezados de reportes exportados." /></Label><p className="text-xs text-muted-foreground mb-2">Se muestra en reportes y documentos exportados.</p><Input value={storeName} onChange={(e) => { setStoreName(e.target.value); markDirty(); }} placeholder="Ej: Farmacia Central, S.A." /></div>
            <div className="grid md:grid-cols-2 gap-4">
              <div><Label className="font-medium">Prefijo de moneda <Hint text="Solo cambia presentación en reportes exportados." /></Label><p className="text-xs text-muted-foreground mb-2">Símbolo mostrado en reportes exportados.</p><Select value={currencyPrefix} onValueChange={(v) => { setCurrencyPrefix(v); markDirty(); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="$">$ (Dólar - USD)</SelectItem><SelectItem value="US$">US$ (Dólar Internacional)</SelectItem><SelectItem value="B/.">B/. (Balboa Panameño)</SelectItem><SelectItem value="PAB">PAB (Código ISO)</SelectItem><SelectItem value="€">€ (Euro)</SelectItem></SelectContent></Select></div>
              <div><Label className="font-medium">RUC / NIT <Badge variant="outline" className="ml-2 text-[10px]">Opcional</Badge></Label><p className="text-xs text-muted-foreground mb-2">Pie de página en reportes fiscales.</p><Input value={taxId} onChange={(e) => { setTaxId(e.target.value); markDirty(); }} placeholder="Ej: 123-456-789 DV 00" /></div>
            </div>
          </CardContent>
        </Card>

        <p className="text-[11px] uppercase tracking-widest text-muted-foreground flex items-center gap-2">Políticas de auditoría <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">Nuevo</Badge></p>
        <Card><CardContent className="p-5 space-y-5">
          <div><div className="flex items-center gap-2 font-medium">Margen de edición de registros <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30">Seguridad</Badge> <Hint text="Días hacia atrás que un usuario puede editar un movimiento." /></div><p className={`text-sm ${riskColor} font-medium mt-1`}>{riskCopy}</p><div className="mt-3 flex items-center gap-4"><Slider min={1} max={60} step={1} value={[editWindowDays]} onValueChange={(v) => { setEditWindowDays(v[0]); markDirty(); }} /><span className="text-primary font-mono text-sm w-16 text-right">{editWindowDays} días</span></div></div>
          <ToggleRow label="Confirmar antes de editar" hint="Diálogo de confirmación en cada modificación." checked={confirmBeforeEdit} onChange={(v) => { setConfirmBeforeEdit(v); markDirty(); }} />
          <ToggleRow label="Historial de ediciones" hint="Registra quién editó, cuándo y qué cambió." checked={editHistory} onChange={(v) => { setEditHistory(v); markDirty(); }} />
          <ToggleRow label="Bloquear períodos cerrados" hint="Impide editar meses con reporte mensual generado." checked={lockClosedPeriods} onChange={(v) => { setLockClosedPeriods(v); markDirty(); }} />
        </CardContent></Card>

        <p className="text-[11px] uppercase tracking-widest text-muted-foreground flex items-center gap-2">Seguridad de datos <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">Nuevo</Badge></p>
        <Card><CardContent className="p-5 space-y-5">
          <div><Label className="font-medium">Ruta de respaldo automático <Hint text="Recomendado: carpeta sincronizada en nube para redundancia." /></Label><p className="text-xs text-muted-foreground mb-2">Recomendado: carpeta de Google Drive o Dropbox.</p><div className="flex gap-2"><Input value={backupPath} onChange={(e) => { setBackupPath(e.target.value); markDirty(); }} placeholder="C:\\Users\\...\\Google Drive\\Backups\\Caja" /><Button variant="outline" type="button" onClick={handleSelectDirectory} className="shrink-0 gap-2"><FolderOpen className="size-4" />Examinar...</Button></div></div>
          <ToggleRow label="Backup al cerrar la app" hint="Copia automática al salir del sistema." checked={backupOnClose} onChange={(v) => { setBackupOnClose(v); markDirty(); }} />
          <ToggleRow label="Backup al guardar cambios" hint="Copia adicional al presionar Guardar cambios." checked={backupOnSave} onChange={(v) => { setBackupOnSave(v); markDirty(); }} />
          <div className="flex items-end justify-between gap-4"><div><Label className="font-medium">Retención de copias</Label><p className="text-xs text-muted-foreground mb-2">Número máximo de respaldos a conservar.</p><Input type="number" min="5" max="365" value={backupRetention} onChange={(e) => { setBackupRetention(Math.max(5, parseInt(e.target.value, 10) || 5)); markDirty(); }} className="w-32" /></div><Switch checked={retentionEnabled} onCheckedChange={(v) => { setRetentionEnabled(v); markDirty(); }} /></div>
          <div className="pt-1 border-t border-border">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium flex items-center gap-2"><ShieldCheck className="size-4 text-primary" />Crear backup ahora</p>
                <p className="text-xs text-muted-foreground">Genera una copia de seguridad inmediata de la base de datos.</p>
              </div>
              <Button variant="outline" onClick={handleBackupNow} disabled={isBackingUp} className="gap-2 shrink-0">
                <Database className="size-4" />
                {isBackingUp ? "Creando copia..." : "Backup ahora"}
              </Button>
            </div>
          </div>
        </CardContent></Card>

        <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Sistema</p>
        <Card><CardContent className="p-0 grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
          <InfoCell k="Versión" v="v1.0.4" />
          <InfoCell k="Sincronización" v="Desactivada (Sincronización remota Firebase pendiente)" />
          <InfoCell k="Modo de operación" v="Escritorio · Windows" />
          <InfoCell k="Almacenamiento" v="Local · sin conexión requerida" />
          <InfoCell k="Exportación" v="Excel / ODS disponible" />
          <InfoCell k="Backup del SO" v="Configurable desde sistema operativo" />
        </CardContent></Card>

        <p className="text-[11px] uppercase tracking-widest text-destructive">Mantenimiento de Datos</p>
        <Card className={importMode === 'replace' ? "border-destructive/30" : "border-primary/30"}>
          <CardContent className="p-5 space-y-4">
            {importMode === 'replace' ? (
              <Alert variant="destructive">
                <AlertTriangle className="size-4" />
                <AlertDescription>
                  <strong>Modo Reemplazar:</strong> Esta acción borrará TODO el historial actual (Ingresos, Salidas, Facturas) y lo sustituirá por el contenido del Excel.
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className="border-primary/30 bg-primary/10 text-primary">
                <Info className="size-4" />
                <AlertDescription>
                  <strong>Modo Anexar:</strong> Los registros del Excel se añadirán al historial existente sin borrar nada. Útil para cargar meses nuevos.
                </AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="font-medium text-xs uppercase tracking-wider mb-2 block">Modo de Mantenimiento</Label>
                <Select value={importMode} onValueChange={(v: 'replace' | 'append') => setImportMode(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="replace">Reemplazar Base de Datos (Limpiar todo)</SelectItem>
                    <SelectItem value="append">Anexar a Base de Datos (Sumar registros)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Label htmlFor="excelFile" className="font-medium text-xs uppercase tracking-wider mb-2 block">Archivo ODS / XLSX</Label>
                <Input id="excelFile" type="file" accept=".ods,.xlsx" onChange={handleFileChange} disabled={isImporting} />
                <p className="text-[10px] text-muted-foreground mt-1">{fileToImport ? fileToImport.name : "Sin archivos seleccionados"}</p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              {!showImportWarning ? (
                <Button 
                  variant={importMode === 'replace' ? "destructive" : "secondary"} 
                  onClick={() => setShowImportWarning(true)} 
                  disabled={!fileToImport || isImporting}
                >
                  <Upload className="mr-2 size-4" /> 
                  {importMode === 'replace' ? "Iniciar Reemplazo" : "Iniciar Anexo"}
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowImportWarning(false)} disabled={isImporting}>Cancelar</Button>
                  <Button 
                    variant={importMode === 'replace' ? "destructive" : "secondary"} 
                    onClick={handleImport} 
                    disabled={isImporting}
                  >
                    {isImporting ? "Procesando..." : (importMode === 'replace' ? "Sí, borrar e importar" : "Confirmar anexo")}
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <p className="text-[11px] uppercase tracking-widest text-destructive flex items-center gap-2">Restauración de Base de Datos <Badge className="bg-destructive/10 text-destructive border-destructive/30">Crítico</Badge></p>
        <Card className="border-destructive/30">
          <CardContent className="p-5 space-y-4">
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <AlertDescription>
                <strong>Atención:</strong> Al restaurar una copia de seguridad (.db), se <strong>sobrescribirá por completo</strong> el estado actual de la caja y todos los registros con el contenido del archivo de respaldo. Esta acción no se puede deshacer.
              </AlertDescription>
            </Alert>

            <div className="flex flex-col md:flex-row gap-4 items-end">
              <div className="flex-1 w-full">
                <Label htmlFor="dbFile" className="font-medium text-xs uppercase tracking-wider mb-2 block">Archivo de Respaldo (.db)</Label>
                <Input id="dbFile" type="file" accept=".db" onChange={handleDbFileChange} disabled={isRestoringDb} />
                <p className="text-[10px] text-muted-foreground mt-1">{dbFileToRestore ? dbFileToRestore.name : "Sin archivo seleccionado"}</p>
              </div>
              <div className="shrink-0">
                {!showRestoreWarning ? (
                  <Button 
                    variant="destructive" 
                    onClick={() => setShowRestoreWarning(true)} 
                    disabled={!dbFileToRestore || isRestoringDb}
                  >
                    <RotateCcw className="mr-2 size-4" /> 
                    Restaurar Base de Datos
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setShowRestoreWarning(false)} disabled={isRestoringDb}>Cancelar</Button>
                    <Button 
                      variant="destructive" 
                      onClick={handleRestoreDb} 
                      disabled={isRestoringDb}
                    >
                      {isRestoringDb ? "Restaurando..." : "Sí, sobrescribir todo"}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {willCreateDuplicates && (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertDescription>
              El número configurado ({nextVoucherNumber}) es menor al actual ({config?.nextVoucherNumber}) y puede causar duplicados.
            </AlertDescription>
          </Alert>
        )}
        {hasSignificantJump && (
          <Alert className="border-amber-500/30 bg-amber-500/10 text-amber-300">
            <AlertTriangle className="size-4" />
            <AlertDescription>
              Hay un salto amplio en la secuencia (de {config?.nextVoucherNumber} a {nextVoucherNumber}).
            </AlertDescription>
          </Alert>
        )}
        {!willCreateDuplicates && !hasSignificantJump && hasUnsavedChanges && (
          <Alert className="border-primary/30 bg-primary/10 text-primary">
            <CheckCircle2 className="size-4" />
            <AlertDescription>Tienes cambios listos para guardar.</AlertDescription>
          </Alert>
        )}
      </div>
    </TooltipProvider>
  );
}

function Hint({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex size-4 items-center justify-center rounded-full border border-border text-muted-foreground hover:text-primary">
          <Info className="size-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{text}</TooltipContent>
    </Tooltip>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function InfoCell({ k, v, good }: { k: string; v: string; good?: boolean }) {
  return (
    <div className="p-4">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{k}</p>
      <p className={`text-sm mt-1 ${good ? "text-emerald-400" : "text-foreground"}`}>{v}</p>
    </div>
  );
}
