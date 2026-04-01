import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Minus, Clock, CheckCircle, Edit3, Search, AlertTriangle, MoreVertical, Trash, Edit, ChevronDown, ChevronUp, FileText, ArrowLeftRight } from "lucide-react";
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
import { Income, Exit, Invoice } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import IncomeModal from "@/components/modals/income-modal";
import ExitModal from "@/components/modals/exit-modal";

type MovementType = "all" | "income" | "exit" | "pending_exit" | "edited";

interface Movement {
  id: string;
  type: "income" | "exit" | "pending_exit";
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
  rawData: Income | Exit;
}

export default function Movimientos() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<MovementType>("all");
  const [dateFilter, setDateFilter] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [expandedMovement, setExpandedMovement] = useState<string | null>(null);
  
  const [editingIncome, setEditingIncome] = useState<Income | null>(null);
  const [editingExit, setEditingExit] = useState<Exit | null>(null);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: incomes, isLoading: incomesLoading } = useQuery<Income[]>({
    queryKey: ["/api/incomes"],
    refetchInterval: 10000,
  });

  const { data: exits, isLoading: exitsLoading } = useQuery<Exit[]>({
    queryKey: ["/api/exits"],
    refetchInterval: 10000,
  });

  const isLoading = incomesLoading || exitsLoading;

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

  const handleEdit = (movement: Movement) => {
    if (movement.type === "income") {
      setEditingIncome(movement.rawData as Income);
    } else {
      setEditingExit(movement.rawData as Exit);
    }
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
      amount: exit.initialAmount,
      voucherId: undefined,
      date: String(exit.date || ""),
      createdAt: String(exit.createdAt || ""),
      isEdited: exit.editedAt !== null,
      isPending: exit.isPending,
      renderedAmount: exit.renderedAmount,
      changeAmount: exit.changeAmount,
      initialAmount: exit.initialAmount,
      rawData: exit
    })) || [])
  ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  // Calculate running balance (like the Excel)
  const movementsWithBalance = allMovements.map((movement, index) => {
    const previousBalance = allMovements.slice(0, index).reduce((balance, m) => {
      if (m.type === "income") return balance + m.amount;
      if (m.type === "exit") return balance - m.amount;
      // pending_exit: money is "out" physically but not yet a confirmed expense
      return balance;
    }, 0);
    
    let currentBalance: number;
    if (movement.type === "income") {
      currentBalance = previousBalance + movement.amount;
    } else if (movement.type === "exit") {
      currentBalance = previousBalance - movement.amount;
    } else {
      currentBalance = previousBalance;
    }

    return { ...movement, runningBalance: currentBalance };
  });

  const getMovementsForTab = () => {
    switch (activeTab) {
      case "incomes":
        return movementsWithBalance.filter(m => m.type === "income");
      case "exits":
        return movementsWithBalance.filter(m => m.type === "exit");
      case "pending":
        return movementsWithBalance.filter(m => m.type === "pending_exit");
      case "edited":
        return movementsWithBalance.filter(m => m.isEdited);
      default:
        return movementsWithBalance;
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

  const totalIncome = allMovements.filter(m => m.type === "income").reduce((sum, m) => sum + m.amount, 0);
  const totalExit = allMovements.filter(m => m.type === "exit").reduce((sum, m) => sum + m.amount, 0);
  const totalPending = allMovements.filter(m => m.type === "pending_exit").reduce((sum, m) => sum + m.amount, 0);
  const theoreticalBalance = totalIncome - totalExit;

  const getMovementIcon = (type: string) => {
    switch (type) {
      case "income":
        return <Plus className="h-4 w-8 text-white" />;
      case "pending_exit":
        return <Clock className="h-4 w-4 text-warning-foreground" />;
      default:
        return <Minus className="h-4 w-4 text-white" />;
    }
  };

  const getMovementBadgeColor = (type: string) => {
    switch (type) {
      case "income":
        return "bg-success";
      case "pending_exit":
        return "bg-warning";
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
                <div className="w-12 h-12 bg-success/10 rounded-lg flex items-center justify-center">
                  <Plus className="text-success h-6 w-6" />
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
                <div className="w-12 h-12 bg-destructive/10 rounded-lg flex items-center justify-center">
                  <Minus className="text-destructive h-6 w-6" />
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
                <div className="w-12 h-12 bg-warning/10 rounded-lg flex items-center justify-center">
                  <Clock className="text-warning h-6 w-6" />
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
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <ArrowLeftRight className="text-primary h-6 w-6" />
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
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
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
                  data-testid="input-date-filter"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Edited Movements Warning */}
        {editedCount > 0 && (
          <Alert className="border-warning bg-warning/10">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <AlertDescription className="text-warning">
              Hay {editedCount} movimientos que han sido editados. Revise estos registros para asegurar la integridad de los datos.
            </AlertDescription>
          </Alert>
        )}

        {/* Movements Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5">
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

                    {filteredMovements.map((movement) => (
                      <div key={movement.id} data-testid={`movement-item-${movement.id}`}>
                        <div
                          className={`grid grid-cols-12 gap-2 px-4 py-3 rounded-lg border border-border hover:bg-muted/30 transition-colors cursor-pointer items-center ${
                            movement.type === "pending_exit" ? "border-l-4 border-l-warning" : ""
                          }`}
                          onClick={() => setExpandedMovement(expandedMovement === movement.id ? null : movement.id)}
                        >
                          {/* Voucher */}
                          <div className="col-span-1 flex items-center gap-2">
                            <Badge className={`w-6 h-6 rounded-full p-0 flex items-center justify-center ${getMovementBadgeColor(movement.type)}`}>
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
                                  <Edit3 className="h-2.5 w-2.5" />
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
                            {(movement.type !== "exit" || movement.isPending) && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-muted" onClick={(e) => e.stopPropagation()}>
                                    <MoreVertical className="h-3.5 w-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-40">
                                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEdit(movement); }}>
                                    <Edit className="mr-2 h-4 w-4" />
                                    <span>Editar</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    className="text-destructive focus:text-destructive"
                                    onClick={(e) => { e.stopPropagation(); handleDelete(movement.id, movement.type); }}
                                    disabled={deleteMutation.isPending}
                                  >
                                    <Trash className="mr-2 h-4 w-4" />
                                    <span>Eliminar</span>
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                            {expandedMovement === movement.id ? (
                              <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                        </div>

                        {/* Expanded Details */}
                        {expandedMovement === movement.id && (
                          <MovementDetails movement={movement} />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      
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
function MovementDetails({ movement }: { movement: Movement & { runningBalance: number } }) {
  const isExit = movement.type === "exit" || movement.type === "pending_exit";
  const exitData = isExit ? (movement.rawData as Exit) : null;

  const { data: invoices } = useQuery<Invoice[]>({
    queryKey: [`/api/exits/${movement.id}/invoices`],
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
          <div className="text-warning">
            <Edit3 className="inline h-3 w-3 mr-1" />
            Movimiento editado
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
                <FileText className="h-3 w-3" /> Facturas ({invoices.length})
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
                      <span className="text-xs text-muted-foreground">{new Date(invoice.date).toLocaleDateString()}</span>
                      <span className="font-semibold text-destructive">{formatCurrency(invoice.amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Denomination breakdown mini-component */
function DenominationBreakdown({ denominations, label }: { denominations: any; label: string }) {
  const BILL_VALUES: Record<string, number> = { hundred: 100, fifty: 50, twenty: 20, ten: 10, five: 5, two: 2, one: 1 };
  const COIN_VALUES: Record<string, number> = { five: 5, two: 2, one: 1, fifty_cents: 0.5, quarter: 0.25, dime: 0.1 };

  const entries = [
    ...Object.entries(denominations.bills).filter(([_, count]) => (count as number) > 0).map(([k, c]) => ({ name: `$${BILL_VALUES[k]}`, count: c as number, value: BILL_VALUES[k] * (c as number) })),
    ...Object.entries(denominations.coins).filter(([_, count]) => (count as number) > 0).map(([k, c]) => ({ name: `$${COIN_VALUES[k]}`, count: c as number, value: COIN_VALUES[k] * (c as number) })),
  ];

  if (entries.length === 0) return null;

  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
      <div className="flex flex-wrap gap-2">
        {entries.map((e, i) => (
          <span key={i} className="bg-secondary/30 px-2 py-1 rounded text-xs">
            {e.name} × {e.count} = {formatCurrency(e.value)}
          </span>
        ))}
      </div>
    </div>
  );
}
