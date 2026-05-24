import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Minus, Clock, CheckCircle, Calendar, Search, ArrowLeftRight, FileText, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ExitModal from "@/components/modals/exit-modal";
import CompleteExitModal from "@/components/modals/complete-exit-modal";
import CashExchangeModal from "@/components/modals/cash-exchange-modal";
import { formatCurrency } from "@/lib/denomination-utils";
import { Exit, Invoice, ChangeRecord } from "@shared/schema";

interface ExitWithDetails extends Exit {
  invoices?: Invoice[];
  change?: ChangeRecord[];
}

export default function Salidas() {
  const [showExitModal, setShowExitModal] = useState(false);
  const [selectedExitForEdit, setSelectedExitForEdit] = useState<Exit | null>(null);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [selectedExitForCompletion, setSelectedExitForCompletion] = useState<string | undefined>(undefined);
  const [showExchangeModal, setShowExchangeModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "completed">("all");
  const [activeTab, setActiveTab] = useState("all");
  const [expandedExit, setExpandedExit] = useState<string | null>(null);

  const { data: allExits, isLoading: exitsLoading } = useQuery<Exit[]>({
    queryKey: ["/api/exits"],
    refetchInterval: 10000,
  });

  const { data: pendingExits, isLoading: pendingLoading } = useQuery<Exit[]>({
    queryKey: ["/api/exits", "pending"],
    refetchInterval: 5000,
  });

  const { data: completedExits, isLoading: completedLoading } = useQuery<Exit[]>({
    queryKey: ["/api/exits", "completed"],
    refetchInterval: 10000,
  });

  const getExitsForTab = () => {
    switch (activeTab) {
      case "pending":
        return pendingExits || [];
      case "completed":
        return completedExits || [];
      default:
        return allExits || [];
    }
  };

  const filteredExits = getExitsForTab().filter(exit => {
    const matchesSearch = exit.purpose.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         exit.id.includes(searchTerm);
    
    if (filterStatus === "all") return matchesSearch;
    if (filterStatus === "pending") return matchesSearch && exit.isPending;
    if (filterStatus === "completed") return matchesSearch && !exit.isPending;
    
    return matchesSearch;
  });

  const isLoading = exitsLoading || pendingLoading || completedLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Cargando salidas...</div>
      </div>
    );
  }

  const pendingCount = pendingExits?.length || 0;
  const completedCount = completedExits?.length || 0;
  const totalPendingAmount = pendingExits?.reduce((sum, exit) => sum + (exit.initialAmount - (exit.renderedAmount + exit.changeAmount)), 0) || 0;
  const totalCompletedAmount = completedExits?.reduce((sum, exit) => sum + (exit.renderedAmount + exit.changeAmount), 0) || 0;

  return (
    <>
      <div className="bg-card border-b border-border px-8 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Salidas</h2>
            <p className="text-muted-foreground">Gestión de salidas de dinero de caja</p>
          </div>
          <div className="flex gap-x-3">
            <Button
              onClick={() => setShowExchangeModal(true)}
              variant="outline"
              className="bg-primary/5 hover:bg-primary/10 border-primary/20 text-foreground"
              data-testid="button-cash-exchange"
            >
              <ArrowLeftRight className="mr-2 size-4 text-primary" />
              Cambiar Billetes
            </Button>
            <Button
              onClick={() => {
                setSelectedExitForCompletion(undefined);
                setShowCompleteModal(true);
              }}
              variant="outline"
              className="bg-warning/10 hover:bg-warning/20 border-warning/20 text-foreground"
              data-testid="button-complete-exits"
            >
              <CheckCircle className="mr-2 size-4 text-warning" />
              Completar Pendientes ({pendingCount})
            </Button>
            <Button
              onClick={() => setShowExitModal(true)}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              data-testid="button-new-exit"
            >
              <Minus className="mr-2 size-4" />
              Nueva Salida
            </Button>
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
                  <p className="text-muted-foreground text-sm font-medium">Salidas Pendientes</p>
                  <p className="text-2xl font-bold text-warning">{pendingCount}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {formatCurrency(totalPendingAmount)}
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
                  <p className="text-muted-foreground text-sm font-medium">Salidas Completadas</p>
                  <p className="text-2xl font-bold text-success">{completedCount}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {formatCurrency(totalCompletedAmount)}
                  </p>
                </div>
                <div className="size-12 bg-success/10 rounded-lg flex items-center justify-center">
                  <CheckCircle className="text-success size-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-sm font-medium">Total Salidas</p>
                  <p className="text-2xl font-bold text-foreground">{allExits?.length || 0}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {formatCurrency((allExits?.reduce((sum, exit) => sum + (exit.renderedAmount + exit.changeAmount), 0)) || 0)}
                  </p>
                </div>
                <div className="size-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Minus className="text-primary size-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-sm font-medium">Hoy</p>
                  <p className="text-2xl font-bold text-foreground">
                    {allExits?.filter(exit => {
                      const exitDate = new Date(exit.createdAt);
                      const today = new Date();
                      return exitDate.toDateString() === today.toDateString();
                    }).length || 0}
                  </p>
                </div>
                <div className="size-12 bg-muted/10 rounded-lg flex items-center justify-center">
                  <Calendar className="text-muted-foreground size-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filters */}
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <Label htmlFor="search" className="text-sm font-medium text-foreground">
                  Buscar por propósito o ID
                </Label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
                  <Input
                    id="search"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar salidas..."
                    className="pl-10"
                    data-testid="input-search-exits"
                  />
                </div>
              </div>
              <div className="w-full md:w-48">
                <Label className="text-sm font-medium text-foreground">Estado</Label>
                <Select value={filterStatus} onValueChange={(value: "all" | "pending" | "completed") => setFilterStatus(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="pending">Pendientes</SelectItem>
                    <SelectItem value="completed">Completadas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Exits Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="all" data-testid="tab-all-exits">
              Todas ({allExits?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="pending" data-testid="tab-pending-exits">
              Pendientes ({pendingCount})
            </TabsTrigger>
            <TabsTrigger value="completed" data-testid="tab-completed-exits">
              Completadas ({completedCount})
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>
                  {activeTab === "pending" ? "Salidas Pendientes" : 
                   activeTab === "completed" ? "Salidas Completadas" : "Todas las Salidas"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {filteredExits.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    {searchTerm ? "No se encontraron salidas que coincidan con la búsqueda" : 
                     activeTab === "pending" ? "No hay salidas pendientes" :
                     activeTab === "completed" ? "No hay salidas completadas" : "No hay salidas registradas"}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredExits.map((exit) => (
                      <ExitCard 
                        key={exit.id} 
                        exit={exit} 
                        isExpanded={expandedExit === exit.id}
                        onToggle={() => setExpandedExit(expandedExit === exit.id ? null : exit.id)}
                        onComplete={() => {
                          setSelectedExitForCompletion(exit.id);
                          setShowCompleteModal(true);
                        }}
                        onEdit={() => setSelectedExitForEdit(exit)}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <ExitModal 
        open={showExitModal || !!selectedExitForEdit} 
        onOpenChange={(open) => {
          if (!open) {
            setShowExitModal(false);
            setSelectedExitForEdit(null);
          }
        }} 
        initialData={selectedExitForEdit}
      />
      <CompleteExitModal 
        open={showCompleteModal} 
        onOpenChange={setShowCompleteModal} 
        initialExitId={selectedExitForCompletion} 
      />
      <CashExchangeModal open={showExchangeModal} onOpenChange={setShowExchangeModal} />
    </>
  );
}

function ExitCard({ exit, isExpanded, onToggle, onComplete, onEdit }: { exit: Exit; isExpanded: boolean; onToggle: () => void; onComplete: () => void; onEdit: () => void }) {
  const { data: invoices } = useQuery<Invoice[]>({
    queryKey: ["/api/exits", exit.id, "invoices"],
    enabled: isExpanded,
  });

  const renderedTotal = (exit.renderedAmount || 0) + (exit.changeAmount || 0);
  const remainingAmount = exit.initialAmount - renderedTotal;
  const hasPartialProgress = renderedTotal > 0 && exit.isPending;

  return (
    <div
      className={`border border-border rounded-lg hover:bg-muted/30 transition-colors ${
        exit.isPending ? 'border-l-4 border-l-warning' : ''
      } ${hasPartialProgress ? 'border-l-blue-500' : ''}`}
      data-testid={`exit-item-${exit.id}`}
    >
      <div 
        className="p-6 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-t-lg" 
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onToggle();
          }
        }}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-x-3">
            <Badge 
              variant="outline" 
              className={`${exit.isPending ? 
                'bg-warning/10 text-warning border-warning/20' : 
                'bg-success/10 text-success border-success/20'}`}
            >
              {exit.isPending ? (
                <>
                  <Clock className="mr-1 size-3" />
                  {hasPartialProgress ? 'Parcialmente Rendida' : 'Pendiente'}
                </>
              ) : (
                <>
                  <CheckCircle className="mr-1 size-3" />
                  Completada
                </>
              )}
            </Badge>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-destructive">
              -{formatCurrency(exit.initialAmount)}
            </p>
            <p className="text-sm text-muted-foreground">Monto inicial</p>
          </div>
        </div>

        <h3 className="font-semibold text-foreground text-lg mb-3">{exit.purpose}</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Fecha de Salida</p>
            <p className="font-medium" suppressHydrationWarning>{new Date(exit.date).toLocaleDateString()}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Registrado</p>
            <p className="font-medium">{new Date(exit.createdAt).toLocaleString()}</p>
          </div>
          {exit.completedAt && (
            <div>
              <p className="text-muted-foreground">Completado</p>
              <p className="font-medium">{new Date(exit.completedAt).toLocaleString()}</p>
            </div>
          )}
        </div>

        {/* Progress bar for pending exits */}
        {exit.isPending && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-muted-foreground">Rendición</span>
              <span className="font-medium">
                {formatCurrency(renderedTotal)} / {formatCurrency(exit.initialAmount)}
                {remainingAmount > 0 && (
                  <span className="text-warning ml-2">
                    (Faltan {formatCurrency(remainingAmount)})
                  </span>
                )}
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div 
                className={`rounded-full h-2 transition-all ${hasPartialProgress ? 'bg-blue-500' : 'bg-muted-foreground/20'}`}
                style={{ width: `${Math.min(100, (renderedTotal / exit.initialAmount) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="px-6 pb-6 space-y-4 border-t border-border pt-4">
          {/* Denomination breakdown */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Denominaciones Entregadas:</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              {Object.entries(exit.denominationsGiven.bills).map(([denomination, count]) => {
                if (count === 0) return null;
                const values: Record<string, number> = { hundred: 10000, fifty: 5000, twenty: 2000, ten: 1000, five: 500, one: 100 };
                return (
                  <div key={denomination} className="bg-secondary/30 p-2 rounded text-center">
                    <p className="font-medium">${values[denomination]/100} x {count}</p>
                    <p className="text-muted-foreground">{formatCurrency((values[denomination] ?? 0) * (count as number))}</p>
                  </div>
                );
              })}
              {Object.entries(exit.denominationsGiven.coins).map(([denomination, count]) => {
                if (count === 0) return null;
                const values: Record<string, number> = { one: 100, fifty_cents: 50, quarter: 25, dime: 10, nickel: 5, penny: 1 };
                return (
                  <div key={denomination} className="bg-secondary/30 p-2 rounded text-center">
                    <p className="font-medium">${values[denomination]/100} x {count}</p>
                    <p className="text-muted-foreground">{formatCurrency((values[denomination] ?? 0) * (count as number))}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Invoices */}
          {invoices && invoices.length > 0 && (
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <FileText className="size-3.5" /> Facturas ({invoices.length})
              </p>
              <div className="space-y-2">
                {invoices.map((invoice) => (
                  <div key={invoice.id} className="flex items-center justify-between bg-card border border-border rounded-lg px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="text-xs">
                        #{invoice.voucherId.toString().padStart(3, "0")}
                      </Badge>
                      <span className="font-medium">{invoice.detail}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-muted-foreground" suppressHydrationWarning>{new Date(invoice.date).toLocaleDateString()}</span>
                      <span className="font-bold text-destructive">{formatCurrency(invoice.amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-x-2 pt-2">
            {exit.isPending && (
              <Button
                onClick={(e) => { e.stopPropagation(); onComplete(); }}
                size="sm"
                className="bg-warning hover:bg-warning/90 text-warning-foreground"
                data-testid={`button-complete-exit-${exit.id}`}
              >
                <CheckCircle className="mr-2 size-4" />
                Completar Salida
              </Button>
            )}
            <Button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              size="sm"
              variant="outline"
              className="bg-card hover:bg-accent text-foreground border-border"
              data-testid={`button-edit-exit-${exit.id}`}
            >
              <FileText className="mr-2 size-4 text-primary" />
              Editar Salida / Rendición
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
