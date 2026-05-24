import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Minus, Clock, CheckCircle, Edit3, Search, AlertTriangle, MoreVertical, Trash, Edit, ChevronDown, ChevronUp, FileText, ArrowLeftRight, RefreshCw, ArrowUp, ArrowDown, Equal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatCurrency } from "@/lib/denomination-utils";
import { Income, Exit, Invoice, CashAdjustment, Configuration, ClosedPeriod, AuditLog } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import IncomeModal from "@/components/modals/income-modal";
import ExitModal from "@/components/modals/exit-modal";
import EditWarningModal from "@/components/modals/edit-warning-modal";
import AuditLogModal from "@/components/modals/audit-log-modal";

type MovementType = "all" | "income" | "exit" | "pending_exit" | "edited" | "adjustment";

function getDaysSince(dateStr: string): number {
  const created = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function isExpiredEdit(movement: { createdAt: string; type: string }, editWindowDays: number): boolean {
  if (movement.type === "adjustment") return false;
  return getDaysSince(movement.createdAt) > editWindowDays;
}

interface Movement {
  id: string;
  type: "income" | "exit" | "pending_exit" | "adjustment";
  detail: string;
  amount: number;
  voucherId?: number;
  date: string;
  createdAt: string;
  isEdited?: boolean;
  isPending?: boolean;
  renderedAmount?: number;
  changeAmount?: number;
  initialAmount?: number;
  rawData: Income | Exit | CashAdjustment;
}

export default function Movimientos() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<MovementType>("all");
  const [dateFilter, setDateFilter] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [expandedMovement, setExpandedMovement] = useState<string | null>(null);
  
  const [editingIncome, setEditingIncome] = useState<Income | null>(null);
  const [editingExit, setEditingExit] = useState<Exit | null>(null);
  
  // Edit warning modal state
  const [editWarning, setEditWarning] = useState<{ movement: Movement; daysSince: number } | null>(null);

  // Audit log modal state
  const [auditLogEntityId, setAuditLogEntityId] = useState<string | null>(null);
  const [showEditedAlert, setShowEditedAlert] = useState(true);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: config } = useQuery<Configuration>({
    queryKey: ["/api/config"],
  });

  const { data: closedPeriods } = useQuery<ClosedPeriod[]>({
    queryKey: ["/api/periods/closed"],
  });

  const editWindowDays = config?.editWindowDays ?? 20;

  const { data: incomes, isLoading: incomesLoading } = useQuery<Income[]>({
    queryKey: ["/api/incomes"],
    refetchInterval: 10000,
  });

  const { data: exits, isLoading: exitsLoading } = useQuery<Exit[]>({
    queryKey: ["/api/exits"],
    refetchInterval: 10000,
  });

  const { data: adjustments, isLoading: adjustmentsLoading } = useQuery<CashAdjustment[]>({
    queryKey: ["/api/cash-adjustments"],
    refetchInterval: 10000,
  });

  const isLoading = incomesLoading || exitsLoading || adjustmentsLoading;

  const deleteMutation = useMutation({
    mutationFn: async ({ id, type }: { id: string; type: "income" | "exit" | "pending_exit" }) => {
      const endpoint = type === "income" ? `/api/incomes/${id}` : `/api/exits/${id}`;
      await apiRequest("DELETE", endpoint);
    },
    onSuccess: () => {
      toast({ title: "Movimiento eliminado", description: "El movimiento ha sido eliminado exitosamente." });
      queryClient.invalidateQueries({ queryKey: ["/api/incomes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/exits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cashbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
    },
    onError: (error) => {
      toast({ title: "Error al eliminar", description: error.message, variant: "destructive" });
    }
  });

  const handleDelete = (id: string, type: "income" | "exit" | "pending_exit") => {
    if (confirm("¿Está seguro de eliminar este movimiento? Esto revertirá los cambios en la caja.")) {
      deleteMutation.mutate({ id, type });
    }
  };

  const doEdit = (movement: Movement) => {
    if (movement.type === "income") {
      setEditingIncome(movement.rawData as Income);
    } else {
      setEditingExit(movement.rawData as Exit);
    }
  };

  const handleEdit = (movement: Movement) => {
    const days = getDaysSince(movement.createdAt);
    if (days > editWindowDays) {
      // Show warning modal
      setEditWarning({ movement, daysSince: days });
    } else {
      if (config?.confirmBeforeEdit) {
        if (confirm("¿Estás seguro de que quieres editar este registro?")) {
          doEdit(movement);
        }
      } else {
        doEdit(movement);
      }
    }
  };

  const isMovementClosed = (dateStr: string) => {
    if (!config?.lockClosedPeriods || !closedPeriods) return false;
    const d = new Date(dateStr);
    return closedPeriods.some(cp => cp.year === d.getFullYear() && cp.month === (d.getMonth() + 1));
  };

  // Combine all movements
  const allMovements: Movement[] = [
    ...(incomes?.map(income => ({
      id: income.id,
      type: "income" as const,
      detail: income.detail,
      amount: income.totalAmount,
      voucherId: income.voucherId,
      date: String(income.date || ""),
      createdAt: String(income.createdAt || ""),
      isEdited: income.editedAt !== null,
      rawData: income
    })) || []),
    ...(exits?.map(exit => ({
      id: exit.id,
      type: exit.isPending ? "pending_exit" as const : "exit" as const,
      detail: exit.purpose,
      amount: exit.isPending ? (exit.initialAmount - (exit.renderedAmount + exit.changeAmount)) : (exit.renderedAmount || exit.initialAmount),
      voucherId: exit.voucherId || undefined,
      date: String(exit.date || ""),
      createdAt: String(exit.createdAt || ""),
      isEdited: exit.editedAt !== null,
      isPending: exit.isPending,
      renderedAmount: exit.renderedAmount,
      changeAmount: exit.changeAmount,
      initialAmount: exit.initialAmount,
      rawData: exit
    })) || []),
    ...(adjustments?.map(adj => ({
      id: adj.id,
      type: "adjustment" as const,
      detail: `Arqueo de Caja`,
      amount: Math.abs(adj.difference),
      voucherId: undefined,
      date: String(adj.createdAt || ""),
      createdAt: String(adj.createdAt || ""),
      isEdited: false,
      rawData: adj
    })) || [])
  ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()); // Chronological order for balance calculation

  // Calculate running balance efficiently in a single pass (O(N))
  let rollingBalance = 0;
  const movementsWithBalance = allMovements.map((movement) => {
    if (movement.type === "income") {
      rollingBalance += movement.amount;
    } else if (movement.type === "exit") {
      rollingBalance -= movement.amount;
    } else if (movement.type === "adjustment") {
      // Adjustments directly change the physical box, so they affect the theoretical balance
      // as they represent a reconciliation between the ledger and reality.
      rollingBalance += (movement.rawData as CashAdjustment).difference;
    }
    // pending_exit: money is "out" physically but not yet a confirmed expense in the ledger
    // so it doesn't subtract from the running theoretical balance yet.

    return { ...movement, runningBalance: rollingBalance };
  });

  // Now reverse for display (most recent first)
  const displayMovements = [...movementsWithBalance].reverse();

  const getMovementsForTab = () => {
    switch (activeTab) {
      case "incomes":
        return displayMovements.filter(m => m.type === "income");
      case "exits":
        return displayMovements.filter(m => m.type === "exit");
      case "pending":
        return displayMovements.filter(m => m.type === "pending_exit");
      case "edited":
        return displayMovements.filter(m => m.isEdited);
      case "adjustments":
        return displayMovements.filter(m => m.type === "adjustment");
      default:
        return displayMovements;
    }
  };

  const filteredMovements = getMovementsForTab().filter(movement => {
    const matchesSearch = movement.detail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      movement.voucherId?.toString().includes(searchTerm) ||
      movement.id.includes(searchTerm);

    const matchesType = filterType === "all" || movement.type === filterType ||
      (filterType === "edited" && movement.isEdited);

    const matchesDate = !dateFilter ||
      new Date(movement.date).toDateString() === new Date(dateFilter).toDateString();

    return matchesSearch && matchesType && matchesDate;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Cargando movimientos...</div>
      </div>
    );
  }

  const incomeCount = allMovements.filter(m => m.type === "income").length;
  const exitCount = allMovements.filter(m => m.type === "exit").length;
  const pendingCount = allMovements.filter(m => m.type === "pending_exit").length;
  const editedCount = allMovements.filter(m => m.isEdited).length;
  const adjustmentCount = allMovements.filter(m => m.type === "adjustment").length;

  const totalIncome = allMovements.filter(m => m.type === "income").reduce((sum, m) => sum + m.amount, 0);
  const totalExit = allMovements.filter(m => m.type === "exit").reduce((sum, m) => sum + m.amount, 0);
  const totalPending = allMovements.filter(m => m.type === "pending_exit").reduce((sum, m) => sum + Math.max(0, m.amount), 0);
  const theoreticalBalance = totalIncome - totalExit;

  const getMovementIcon = (type: string) => {
    switch (type) {
      case "income":
        return <Plus className="h-4 w-8 text-white" />;
      case "pending_exit":
        return <Clock className="size-4 text-warning-foreground" />;
      case "adjustment":
        return <RefreshCw className="size-4 text-white" />;
      default:
        return <Minus className="size-4 text-white" />;
    }
  };

  const getMovementBadgeColor = (type: string) => {
    switch (type) {
      case "income":
        return "bg-success";
      case "pending_exit":
        return "bg-warning";
      case "adjustment":
        return "bg-blue-600";
      default:
        return "bg-destructive";
    }
  };

  const getMovementLabel = (type: string) => {
    switch (type) {
      case "income":
        return "Ingreso";
      case "pending_exit":
        return "Salida Pendiente";
      case "adjustment":
        return "Ajuste de Caja";
      default:
        return "Salida";
    }
  };

  return (
    <>
      <div className="bg-card border-b border-border px-8 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Libro Mayor</h2>
            <p className="text-muted-foreground">Historial completo de transacciones — Balance Teórico</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Balance Teórico</p>
            <p className={`text-2xl font-bold ${theoreticalBalance >= 0 ? 'text-success' : 'text-destructive'}`}>
              {formatCurrency(theoreticalBalance)}
            </p>
          </div>
        </div>
      </div>

      <div className="p-8 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-sm font-medium">Ingresos</p>
                  <p className="text-2xl font-bold text-success">{incomeCount}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {formatCurrency(totalIncome)}
                  </p>
                </div>
                <div className="size-12 bg-success/10 rounded-lg flex items-center justify-center">
                  <Plus className="text-success size-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-sm font-medium">Salidas</p>
                  <p className="text-2xl font-bold text-destructive">{exitCount}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {formatCurrency(totalExit)}
                  </p>
                </div>
                <div className="size-12 bg-destructive/10 rounded-lg flex items-center justify-center">
                  <Minus className="text-destructive size-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-sm font-medium">Pendientes</p>
                  <p className="text-2xl font-bold text-warning">{pendingCount}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {formatCurrency(totalPending)}
                  </p>
                </div>
                <div className="size-12 bg-warning/10 rounded-lg flex items-center justify-center">
                  <Clock className="text-warning size-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-sm font-medium">Balance</p>
                  <p className={`text-2xl font-bold ${theoreticalBalance >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {formatCurrency(theoreticalBalance)}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Ingresos - Salidas
                  </p>
                </div>
                <div className="size-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <ArrowLeftRight className="text-primary size-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filters */}
        <Card>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="search" className="text-sm font-medium text-foreground">
                  Buscar movimientos
                </Label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
                  <Input
                    id="search"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar por detalle, voucher o ID..."
                    className="pl-10"
                    data-testid="input-search-movements"
                  />
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium text-foreground">Tipo de Movimiento</Label>
                <Select value={filterType} onValueChange={(value: MovementType) => setFilterType(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="income">Ingresos</SelectItem>
                    <SelectItem value="exit">Salidas</SelectItem>
                    <SelectItem value="pending_exit">Pendientes</SelectItem>
                    <SelectItem value="adjustment">Ajustes de Caja</SelectItem>
                    <SelectItem value="edited">Editados</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="date" className="text-sm font-medium text-foreground">
                  Filtrar por Fecha
                </Label>
                <Input
                  id="date"
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  onClick={(e) => e.currentTarget.showPicker?.()}
                  className="cursor-pointer"
                  data-testid="input-date-filter"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Edited Movements Warning */}
        {editedCount > 0 && showEditedAlert && (
          <Alert className="border-warning bg-warning/10 relative pr-10">
            <AlertTriangle className="size-4 text-warning" />
            <AlertDescription className="text-warning">
              Hay {editedCount} movimientos que han sido editados. Revise estos registros para asegurar la integridad de los datos.
              <Button
                variant="link"
                className="text-warning hover:text-warning/80 p-0 h-auto font-semibold underline ml-2 inline-block align-baseline"
                onClick={() => setActiveTab("edited")}
              >
                Ver movimientos editados
              </Button>
            </AlertDescription>
            <button
              onClick={() => setShowEditedAlert(false)}
              className="absolute right-3 top-3 text-warning/60 hover:text-warning"
              aria-label="Cerrar aviso"
            >
              <X className="size-4" />
            </button>
          </Alert>
        )}

        {/* Movements Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="all" data-testid="tab-all-movements">
              Todos ({allMovements.length})
            </TabsTrigger>
            <TabsTrigger value="incomes" data-testid="tab-incomes">
              Ingresos ({incomeCount})
            </TabsTrigger>
            <TabsTrigger value="exits" data-testid="tab-exits">
              Salidas ({exitCount})
            </TabsTrigger>
            <TabsTrigger value="pending" data-testid="tab-pending">
              Pendientes ({pendingCount})
            </TabsTrigger>
            <TabsTrigger value="adjustments" data-testid="tab-adjustments">
              Ajustes ({adjustmentCount})
            </TabsTrigger>
            <TabsTrigger value="edited" data-testid="tab-edited">
              Editados ({editedCount})
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>
                  {activeTab === "incomes" ? "Movimientos de Ingreso" :
                    activeTab === "exits" ? "Movimientos de Salida" :
                      activeTab === "pending" ? "Salidas Pendientes" :
                        activeTab === "adjustments" ? "Ajustes de Caja" :
                          activeTab === "edited" ? "Movimientos Editados" :
                            "Todos los Movimientos"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {filteredMovements.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    {searchTerm || dateFilter || filterType !== "all"
                      ? "No se encontraron movimientos que coincidan con los filtros aplicados"
                      : "No hay movimientos registrados"}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Ledger Header */}
                    <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-muted/50 rounded-lg text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      <div className="col-span-1">Voucher</div>
                      <div className="col-span-4">Detalle</div>
                      <div className="col-span-2">Fecha</div>
                      <div className="col-span-1 text-right text-success">Entrada</div>
                      <div className="col-span-1 text-right text-destructive">Salida</div>
                      <div className="col-span-2 text-right">Balance</div>
                      <div className="col-span-1 text-right">Acciones</div>
                    </div>

                    {filteredMovements.map((movement, index) => {
                      const movementMonth = new Date(movement.date).toLocaleString('es-ES', { month: 'long', year: 'numeric' }).toUpperCase();
                      const previousMonth = index > 0 ? new Date(filteredMovements[index-1].date).toLocaleString('es-ES', { month: 'long', year: 'numeric' }).toUpperCase() : null;
                      const showMonthDivider = activeTab === "all" && movementMonth !== previousMonth;

                      return (
                      <div key={movement.id} data-testid={`movement-item-${movement.id}`}>
                        {showMonthDivider && (
                          <div className="flex items-center gap-4 py-3 my-2 opacity-80">
                            <div className="h-px bg-border flex-1"></div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-[0.2em] px-3 py-1 bg-background text-muted-foreground border-muted-foreground/30">
                                {movementMonth}
                              </Badge>
                            </div>
                            <div className="h-px bg-border flex-1"></div>
                          </div>
                        )}
                        <div
                          className={`grid grid-cols-12 gap-2 px-4 py-3 rounded-lg border border-border hover:bg-muted/30 transition-colors cursor-pointer items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                            movement.type === "pending_exit" ? "border-l-4 border-l-warning" : ""
                          }`}
                          role="button"
                          tabIndex={0}
                          onClick={() => setExpandedMovement(expandedMovement === movement.id ? null : movement.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              setExpandedMovement(expandedMovement === movement.id ? null : movement.id);
                            }
                          }}
                        >
                          {/* Voucher */}
                          <div className="col-span-1 flex items-center gap-2">
                            <Badge className={`size-6 rounded-full p-0 flex items-center justify-center ${getMovementBadgeColor(movement.type)}`}>
                              {getMovementIcon(movement.type)}
                            </Badge>
                            {movement.voucherId ? (
                              <span className="font-mono text-xs">#{movement.voucherId.toString().padStart(3, "0")}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </div>

                          {/* Detail */}
                          <div className="col-span-4">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm truncate">{movement.detail}</span>
                              {movement.isEdited && (
                                <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 text-[10px] px-1 py-0">
                                  <Edit3 className="size-2.5" />
                                </Badge>
                              )}
                              {movement.isPending && (
                                <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 text-[10px] px-1 py-0">
                                  Pendiente
                                </Badge>
                              )}
                              {movement.type === "pending_exit" && movement.renderedAmount !== undefined && movement.renderedAmount > 0 && (
                                <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[10px] px-1 py-0">
                                  Parcial
                                </Badge>
                              )}
                            </div>
                          </div>

                          {/* Date */}
                          <div className="col-span-2 text-sm text-muted-foreground">
                            {new Date(movement.date).toLocaleDateString()}
                          </div>

                          {/* Income Amount */}
                          <div className="col-span-1 text-right">
                            {movement.type === "income" ? (
                              <span className="font-semibold text-success text-sm">
                                +{formatCurrency(movement.amount)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/30 text-sm">—</span>
                            )}
                          </div>

                          {/* Exit Amount */}
                          <div className="col-span-1 text-right">
                            {movement.type === "exit" ? (
                              <span className="font-semibold text-destructive text-sm">
                                -{formatCurrency(movement.amount)}
                              </span>
                            ) : movement.type === "pending_exit" ? (
                              <span className="font-semibold text-warning text-sm">
                                ({formatCurrency(movement.amount)})
                              </span>
                            ) : movement.type === "adjustment" ? (
                              <span className={`font-semibold text-sm ${(movement.rawData as CashAdjustment).difference >= 0 ? 'text-success' : 'text-destructive'}`}>
                                {(movement.rawData as CashAdjustment).difference >= 0 ? '+' : ''}{formatCurrency((movement.rawData as CashAdjustment).difference)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/30 text-sm">—</span>
                            )}
                          </div>

                          {/* Running Balance */}
                          <div className="col-span-2 text-right">
                            <span className={`font-bold text-sm ${movement.runningBalance >= 0 ? 'text-foreground' : 'text-destructive'}`}>
                              {formatCurrency(movement.runningBalance)}
                            </span>
                          </div>

                          {/* Actions */}
                          <div className="col-span-1 text-right flex items-center justify-end gap-1">
                            {movement.type !== "adjustment" && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="size-7 hover:bg-muted" onClick={(e) => e.stopPropagation()}>
                                    <MoreVertical className="size-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-40">
                                  {/* Edit: show if within editWindowDays OR with warning badge if expired */}
                                  {!isExpiredEdit(movement, editWindowDays) ? (
                                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEdit(movement); }} disabled={isMovementClosed(movement.date)}>
                                      <Edit className="mr-2 size-4" />
                                      <span>{isMovementClosed(movement.date) ? 'Cerrado' : 'Editar'}</span>
                                    </DropdownMenuItem>
                                  ) : (
                                    <DropdownMenuItem
                                      onClick={(e) => { e.stopPropagation(); handleEdit(movement); }}
                                      className="text-warning focus:text-warning"
                                      disabled={isMovementClosed(movement.date)}
                                    >
                                      <AlertTriangle className="mr-2 size-4" />
                                      <span>{isMovementClosed(movement.date) ? 'Cerrado' : `Editar (+${editWindowDays} días)`}</span>
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem 
                                    className="text-destructive focus:text-destructive"
                                    onClick={(e) => { e.stopPropagation(); handleDelete(movement.id, movement.type as "income" | "exit" | "pending_exit"); }}
                                    disabled={deleteMutation.isPending || isMovementClosed(movement.date)}
                                  >
                                    <Trash className="mr-2 size-4" />
                                    <span>Eliminar</span>
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                            {expandedMovement === movement.id ? (
                              <ChevronUp className="size-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="size-4 text-muted-foreground" />
                            )}
                          </div>
                        </div>

                        {/* Expanded Details */}
                        {expandedMovement === movement.id && (
                          <MovementDetails movement={movement} onShowAuditLog={() => setAuditLogEntityId(movement.id)} />
                        )}
                      </div>
                    )})}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      
      {/* Edit Warning Modal */}
      {editWarning && (
        <EditWarningModal
          open={!!editWarning}
          onOpenChange={(open) => !open && setEditWarning(null)}
          daysSince={editWarning.daysSince}
          editWindowDays={editWindowDays}
          onConfirm={() => {
            if (config?.confirmBeforeEdit) {
              if (confirm("¿Estás seguro de que quieres forzar la edición de este registro antiguo?")) {
                doEdit(editWarning.movement);
              }
            } else {
              doEdit(editWarning.movement);
            }
            setEditWarning(null);
          }}
        />
      )}

      {/* Audit Log Modal */}
      {auditLogEntityId && (
        <AuditLogModal
          open={!!auditLogEntityId}
          onOpenChange={(open) => !open && setAuditLogEntityId(null)}
          entityId={auditLogEntityId}
        />
      )}

      {/* Edit Modals */}
      {editingIncome && (
        <IncomeModal
          open={!!editingIncome}
          onOpenChange={(open: boolean) => !open && setEditingIncome(null)}
          initialData={editingIncome}
        />
      )}

      {editingExit && (
        <ExitModal
          open={!!editingExit}
          onOpenChange={(open: boolean) => !open && setEditingExit(null)}
          initialData={editingExit}
        />
      )}
    </>
  );
}

/** Expanded detail panel for a single movement */
function MovementDetails({ movement, onShowAuditLog }: { movement: Movement & { runningBalance: number }, onShowAuditLog: () => void }) {
  const isExit = movement.type === "exit" || movement.type === "pending_exit";
  const exitData = isExit ? (movement.rawData as Exit) : null;

  const { data: invoices } = useQuery<Invoice[]>({
    queryKey: ["/api/exits", movement.id, "invoices"],
    enabled: isExit,
  });

  return (
    <div className="ml-4 mr-4 mb-2 p-4 bg-muted/20 rounded-b-lg border border-t-0 border-border space-y-3">
      {/* Metadata */}
      <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground">
        <div>
          <span className="font-medium">Registrado:</span>{" "}
          {new Date(movement.createdAt).toLocaleString()}
        </div>
        <div>
          <span className="font-medium">ID:</span>{" "}
          <span className="font-mono">{movement.id.slice(-12)}</span>
        </div>
        {movement.isEdited && (
          <div className="flex items-center gap-2">
            <div className="text-warning">
              <Edit3 className="inline size-3 mr-1" />
              Movimiento editado
            </div>
            <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={(e) => { e.stopPropagation(); onShowAuditLog(); }}>
              Ver Historial
            </Button>
          </div>
        )}
      </div>

      {/* Income denomination breakdown */}
      {movement.type === "income" && (
        <DenominationBreakdown denominations={(movement.rawData as Income).denominations} label="Denominaciones del Ingreso" />
      )}

      {/* Exit details */}
      {isExit && exitData && (
        <>
          <DenominationBreakdown denominations={exitData.denominationsGiven} label="Denominaciones Entregadas" />

          {/* Pending exit progress */}
          {exitData.isPending && (
            <div className="bg-warning/5 border border-warning/20 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-warning">Estado de Rendición</span>
                <span className="text-xs text-muted-foreground">
                  {formatCurrency(exitData.renderedAmount + exitData.changeAmount)} de {formatCurrency(exitData.initialAmount)}
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div 
                  className="bg-warning rounded-full h-2 transition-all" 
                  style={{ width: `${Math.min(100, ((exitData.renderedAmount + exitData.changeAmount) / exitData.initialAmount) * 100)}%` }}
                />
              </div>
              {exitData.renderedAmount + exitData.changeAmount < exitData.initialAmount && (
                <p className="text-xs text-warning mt-1">
                  Faltan {formatCurrency(exitData.initialAmount - exitData.renderedAmount - exitData.changeAmount)} por rendir
                </p>
              )}
            </div>
          )}

          {/* Invoices breakdown */}
          {invoices && invoices.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <FileText className="size-3" /> Facturas ({invoices.length})
              </p>
              <div className="space-y-1">
                {invoices.map((invoice) => (
                  <div key={invoice.id} className="flex items-center justify-between bg-card border border-border rounded px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        #{invoice.voucherId.toString().padStart(3, "0")}
                      </Badge>
                      <span>{invoice.detail}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground" suppressHydrationWarning>{new Date(invoice.date).toLocaleDateString()}</span>
                      <span className="font-semibold text-destructive">{formatCurrency(invoice.amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Adjustment details */}
      {movement.type === "adjustment" && (() => {
        const adj = movement.rawData as CashAdjustment;
        return (
          <div className="space-y-3">
            <div className={`flex items-center gap-2 p-3 rounded-md border ${adj.difference > 0 ? 'bg-success/10 border-success/30' : adj.difference < 0 ? 'bg-destructive/10 border-destructive/30' : 'bg-blue-500/10 border-blue-500/30'}`}>
              <RefreshCw className={`size-4 shrink-0 ${adj.difference > 0 ? 'text-success' : adj.difference < 0 ? 'text-destructive' : 'text-blue-400'}`} />
              <div className="text-xs">
                <p className="font-medium">
                  {adj.difference === 0
                    ? "Arqueo sin diferencia — las denominaciones fueron reorganizadas sin cambiar el total."
                    : adj.difference > 0
                      ? `Se detectó un sobrante de ${formatCurrency(adj.difference)}. El total de la caja aumentó.`
                      : `Se detectó un faltante de ${formatCurrency(Math.abs(adj.difference))}. El total de la caja disminuyó.`}
                </p>
              </div>
            </div>

            <AdjustmentDiff previousDenominations={adj.previousDenominations} newDenominations={adj.newDenominations} previousTotal={adj.previousTotal} newTotal={adj.newTotal} />
          </div>
        );
      })()}
    </div>
  );
}

/** Denomination breakdown mini-component */
function DenominationBreakdown({ denominations, label }: { denominations: any; label: string }) {
  const BILL_VALUES: Record<string, number> = { hundred: 10000, fifty: 5000, twenty: 2000, ten: 1000, five: 500, one: 100 };
  const COIN_VALUES: Record<string, number> = { one: 100, fifty_cents: 50, quarter: 25, dime: 10, nickel: 5, penny: 1 };

  const entries = [
    ...Object.entries(denominations.bills).filter(([_, count]) => (count as number) > 0).map(([k, c]) => ({ name: `$${(BILL_VALUES[k] || 0)/100}`, count: c as number, value: (BILL_VALUES[k] || 0) * (c as number) })),
    ...Object.entries(denominations.coins).filter(([_, count]) => (count as number) > 0).map(([k, c]) => ({ name: `$${(COIN_VALUES[k] || 0)/100}`, count: c as number, value: (COIN_VALUES[k] || 0) * (c as number) })),
  ];

  if (entries.length === 0) return null;

  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
      <div className="flex flex-wrap gap-2">
        {entries.map((e, i) => (
          <span key={e.name} className="bg-secondary/30 px-2 py-1 rounded text-xs">
            {e.name} × {e.count} = {formatCurrency(e.value)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Visual diff component for cash adjustments - shows exactly what changed */
function AdjustmentDiff({ previousDenominations, newDenominations, previousTotal, newTotal }: {
  previousDenominations: any;
  newDenominations: any;
  previousTotal: number;
  newTotal: number;
}) {
  const BILL_LABELS: Record<string, string> = { hundred: '$100', fifty: '$50', twenty: '$20', ten: '$10', five: '$5', one: '$1' };
  const COIN_LABELS: Record<string, string> = { one: '$1', fifty_cents: '$0.50', quarter: '$0.25', dime: '$0.10', nickel: '$0.05', penny: '$0.01' };
  const BILL_VALUES: Record<string, number> = { hundred: 10000, fifty: 5000, twenty: 2000, ten: 1000, five: 500, one: 100 };
  const COIN_VALUES: Record<string, number> = { one: 100, fifty_cents: 50, quarter: 25, dime: 10, nickel: 5, penny: 1 };

  type DiffEntry = {
    label: string;
    before: number;
    after: number;
    diff: number;
    unitValue: number;
  };

  const diffs: DiffEntry[] = [];

  // Bills
  for (const [key, label] of Object.entries(BILL_LABELS)) {
    const before = previousDenominations.bills[key] || 0;
    const after = newDenominations.bills[key] || 0;
    if (before !== 0 || after !== 0) {
      diffs.push({ label, before, after, diff: after - before, unitValue: BILL_VALUES[key] || 0 });
    }
  }
  // Coins
  for (const [key, label] of Object.entries(COIN_LABELS)) {
    const before = previousDenominations.coins[key] || 0;
    const after = newDenominations.coins[key] || 0;
    if (before !== 0 || after !== 0) {
      diffs.push({ label, before, after, diff: after - before, unitValue: COIN_VALUES[key] || 0 });
    }
  }

  const changedDiffs = diffs.filter(d => d.diff !== 0);
  const unchangedDiffs = diffs.filter(d => d.diff === 0);

  return (
    <div className="space-y-3">
      {/* Total change summary */}
      <div className="flex items-center gap-3 text-xs">
        <span className="text-muted-foreground">Total:</span>
        <span className="font-mono font-medium">{formatCurrency(previousTotal)}</span>
        <span className="text-muted-foreground">→</span>
        <span className="font-mono font-bold text-foreground">{formatCurrency(newTotal)}</span>
        {previousTotal !== newTotal && (
          <span className={`font-mono font-bold px-1.5 py-0.5 rounded ${newTotal > previousTotal ? 'text-success bg-success/10' : 'text-destructive bg-destructive/10'}`}>
            {newTotal > previousTotal ? '+' : ''}{formatCurrency(newTotal - previousTotal)}
          </span>
        )}
      </div>

      {/* Changed denominations */}
      {changedDiffs.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Denominaciones Modificadas</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {changedDiffs.map((d) => (
              <div
                key={`changed-diff-${d.label}`}
                className={`flex items-center justify-between px-3 py-2 rounded-md border text-xs ${
                  d.diff > 0
                    ? 'bg-success/10 border-success/30'
                    : 'bg-destructive/10 border-destructive/30'
                }`}
              >
                <div className="flex items-center gap-2">
                  {d.diff > 0 ? (
                    <ArrowUp className="size-3.5 text-success" />
                  ) : (
                    <ArrowDown className="size-3.5 text-destructive" />
                  )}
                  <span className="font-semibold">{d.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground font-mono">{d.before}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-mono font-bold text-foreground">{d.after}</span>
                  <span className={`font-mono font-bold px-1.5 py-0.5 rounded text-[10px] ${
                    d.diff > 0 ? 'text-success bg-success/20' : 'text-destructive bg-destructive/20'
                  }`}>
                    {d.diff > 0 ? '+' : ''}{d.diff}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unchanged denominations (collapsed, less prominent) */}
      {unchangedDiffs.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground/60 mb-1">Sin cambios</p>
          <div className="flex flex-wrap gap-1.5">
            {unchangedDiffs.map((d) => (
              <span key={`unchanged-diff-${d.label}`} className="bg-secondary/20 px-2 py-0.5 rounded text-[10px] text-muted-foreground font-mono">
                {d.label} × {d.after}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
