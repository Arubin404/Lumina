import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Minus, ListChecks, Wallet, Calculator, Clock, TrendingUp, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import IncomeModal from "@/components/modals/income-modal";
import ExitModal from "@/components/modals/exit-modal";
import CompleteExitModal from "@/components/modals/complete-exit-modal";
import PhysicalCountModal from "@/components/modals/physical-count-modal";
import { formatCurrency } from "@/lib/denomination-utils";

interface DashboardStats {
  physicalBalance: number;
  theoreticalBalance: number;
  transitAmount: number;
  discrepancy: number;
  pendingExitsCount: number;
  pendingAmount: number;
  todayRevenue: number;
  recentMovements: Array<{
    type: string;
    id: string;
    detail: string;
    amount: number;
    voucherId?: number;
    date: string;
  }>;
}

interface CashBox {
  denominations: {
    bills: {
      hundred: number;
      fifty: number;
      twenty: number;
      ten: number;
      five: number;
      two: number;
      one: number;
    };
    coins: {
      five: number;
      two: number;
      one: number;
      fifty_cents: number;
      quarter: number;
      dime: number;
    };
  };
  totalAmount: number;
}

export default function Dashboard() {
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [showPhysicalCountModal, setShowPhysicalCountModal] = useState(false);

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
    refetchInterval: 5000, // Refresh every 5 seconds for real-time updates
  });

  const { data: cashBox, isLoading: cashBoxLoading } = useQuery<CashBox>({
    queryKey: ["/api/cashbox"],
    refetchInterval: 5000,
  });

  const currentDate = new Date().toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });

  const getMovementIcon = (type: string) => {
    switch (type) {
      case "income":
        return <Plus className="h-4 w-8 text-white" />;
      case "pending_exit":
        return <Clock className="h-4 w-8 text-warning-foreground" />;
      default:
        return <Minus className="h-4 w-8 text-white" />;
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

  if (statsLoading || cashBoxLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Cargando dashboard...</div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-card border-b border-border px-8 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Dashboard</h2>
            <p className="text-muted-foreground">Gestión de caja en tiempo real</p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Fecha actual</p>
              <p className="text-sm font-medium">{currentDate}</p>
            </div>
            <Button
              onClick={() => setShowIncomeModal(true)}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
              data-testid="button-new-movement"
            >
              <Plus className="mr-2 h-4 w-4" />
              Nuevo Movimiento
            </Button>
          </div>
        </div>
      </div>

      <div className="p-8 space-y-8">
        {/* Balance Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Physical Balance */}
          <Card className="hover-lift transition-all" data-testid="card-physical-balance">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-sm font-medium">Balance Físico</p>
                  <p className="text-2xl font-bold text-foreground">
                    {formatCurrency(stats?.physicalBalance || 0)}
                  </p>
                  <p className="text-success text-sm mt-1">
                    <span className="inline-block w-2 h-2 bg-success rounded-full mr-1"></span>
                    Sincronizado
                  </p>
                </div>
                <div className="w-12 h-12 bg-success/10 rounded-lg flex items-center justify-center">
                  <Wallet className="text-success h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Theoretical Balance */}
          <Card className="hover-lift transition-all" data-testid="card-theoretical-balance">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-sm font-medium">Balance Teórico</p>
                  <p className="text-2xl font-bold text-foreground">
                    {formatCurrency(stats?.theoreticalBalance || 0)}
                  </p>
                  {stats && stats.discrepancy === 0 ? (
                    <p className="text-success text-sm mt-1">
                      <span className="inline-block w-2 h-2 bg-success rounded-full mr-1"></span>
                      Sin diferencias
                    </p>
                  ) : (
                    <p className="text-destructive text-sm mt-1 font-medium bg-destructive/10 inline-block px-2 py-0.5 rounded">
                      <span className="inline-block w-2 h-2 bg-destructive rounded-full mr-1"></span>
                      {stats && stats.discrepancy > 0 
                        ? `Sobrante: ${formatCurrency(stats.discrepancy)}` 
                        : `Faltante: ${formatCurrency(Math.abs(stats?.discrepancy || 0))}`}
                    </p>
                  )}
                </div>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Calculator className="text-primary h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pending Exits */}
          <Card className="hover-lift transition-all" data-testid="card-pending-exits">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-sm font-medium">En Tránsito (Pendientes)</p>
                  <p className="text-2xl font-bold text-foreground">
                    {stats?.pendingExitsCount || 0}
                  </p>
                  <p className="text-warning text-sm mt-1">
                    <Clock className="inline mr-1 h-3 w-3" />
                    {formatCurrency(stats?.transitAmount || stats?.pendingAmount || 0)} con mensajero
                  </p>
                </div>
                <div className="w-12 h-12 bg-warning/10 rounded-lg flex items-center justify-center">
                  <Clock className="text-warning h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Today's Revenue */}
          <Card className="hover-lift transition-all" data-testid="card-today-revenue">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-sm font-medium">Ingresos Hoy</p>
                  <p className="text-2xl font-bold text-foreground">
                    {formatCurrency(stats?.todayRevenue || 0)}
                  </p>
                  <p className="text-success text-sm mt-1">
                    <TrendingUp className="inline mr-1 h-3 w-3" />
                    Día actual
                  </p>
                </div>
                <div className="w-12 h-12 bg-success/10 rounded-lg flex items-center justify-center">
                  <TrendingUp className="text-success h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">Acciones Rápidas</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Button
                variant="outline"
                className="flex items-center space-x-3 p-6 h-auto bg-success/10 hover:bg-success/20 border-success/20 justify-start"
                onClick={() => setShowIncomeModal(true)}
                data-testid="button-register-income"
              >
                <div className="w-10 h-10 bg-success rounded-lg flex items-center justify-center">
                  <Plus className="text-white h-5 w-5" />
                </div>
                <div className="text-left">
                  <p className="font-medium text-foreground">Registrar Ingreso</p>
                  <p className="text-sm text-muted-foreground">Agregar dinero a caja</p>
                </div>
              </Button>

              <Button
                variant="outline"
                className="flex items-center space-x-3 p-6 h-auto bg-destructive/10 hover:bg-destructive/20 border-destructive/20 justify-start"
                onClick={() => setShowExitModal(true)}
                data-testid="button-register-exit"
              >
                <div className="w-10 h-10 bg-destructive rounded-lg flex items-center justify-center">
                  <Minus className="text-white h-5 w-5" />
                </div>
                <div className="text-left">
                  <p className="font-medium text-foreground">Registrar Salida</p>
                  <p className="text-sm text-muted-foreground">Sacar dinero de caja</p>
                </div>
              </Button>

              <Button
                variant="outline"
                className="flex items-center space-x-3 p-6 h-auto bg-warning/10 hover:bg-warning/20 border-warning/20 justify-start"
                onClick={() => setShowCompleteModal(true)}
                data-testid="button-complete-exits"
              >
                <div className="w-10 h-10 bg-warning rounded-lg flex items-center justify-center">
                  <ListChecks className="text-warning-foreground h-5 w-5" />
                </div>
                <div className="text-left">
                  <p className="font-medium text-foreground">Completar Salidas</p>
                  <p className="text-sm text-muted-foreground">Procesar pendientes</p>
                </div>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Recent Movements and Denominations */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Recent Movements */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-foreground">Movimientos Recientes</h3>
                <Button variant="link" className="text-primary hover:text-primary/80 text-sm font-medium p-0" onClick={() => window.location.href = '/movimientos'}>
                  Ver todos
                </Button>
              </div>
              <div className="space-y-3 scrollbar-thin" style={{ maxHeight: "300px", overflowY: "auto" }}>
                {stats?.recentMovements?.length ? (
                  stats.recentMovements.map((movement, index) => (
                    <div
                      key={`${movement.type}-${movement.id}-${index}`}
                      className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg"
                      data-testid={`movement-${movement.type}-${index}`}
                    >
                      <div className="flex items-center space-x-3">
                        <Badge className={`w-8 h-8 rounded-full p-0 ${getMovementBadgeColor(movement.type)}`}>
                          {getMovementIcon(movement.type)}
                        </Badge>
                        <div>
                          <p className="font-medium text-foreground text-sm">
                            {movement.type === "income" ? "Ingreso" : movement.type === "pending_exit" ? "Salida Pendiente" : "Salida"} - {movement.detail}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {new Date(movement.date).toLocaleString("es-ES")}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-medium ${movement.type === "income" ? "text-success" : movement.type === "pending_exit" ? "text-warning" : "text-destructive"}`}>
                          {movement.type === "income" ? "+" : movement.type === "pending_exit" ? "" : "-"}{formatCurrency(movement.amount)}
                        </p>
                        {movement.voucherId && (
                          <p className="text-muted-foreground text-xs">Voucher #{movement.voucherId.toString().padStart(4, "0")}</p>
                        )}
                        {movement.type === "pending_exit" && (
                          <p className="text-muted-foreground text-xs">Pendiente</p>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    No hay movimientos recientes
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Cash Denominations */}
          <Card>
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Denominaciones Disponibles</h3>
              {cashBox ? (
                <div className="space-y-4">
                  {/* Bills Section */}
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">Billetes</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex items-center justify-between p-2 bg-secondary/30 rounded">
                        <span className="text-sm text-foreground">$100</span>
                        <span className="text-sm font-medium text-muted-foreground">{cashBox.denominations.bills.hundred}</span>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-secondary/30 rounded">
                        <span className="text-sm text-foreground">$50</span>
                        <span className="text-sm font-medium text-muted-foreground">{cashBox.denominations.bills.fifty}</span>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-secondary/30 rounded">
                        <span className="text-sm text-foreground">$20</span>
                        <span className="text-sm font-medium text-muted-foreground">{cashBox.denominations.bills.twenty}</span>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-secondary/30 rounded">
                        <span className="text-sm text-foreground">$10</span>
                        <span className="text-sm font-medium text-muted-foreground">{cashBox.denominations.bills.ten}</span>
                      </div>
                    </div>
                  </div>

                  {/* Coins Section */}
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">Monedas</h4>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="flex items-center justify-between p-2 bg-secondary/30 rounded">
                        <span className="text-sm text-foreground">$5</span>
                        <span className="text-sm font-medium text-muted-foreground">{cashBox.denominations.coins.five}</span>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-secondary/30 rounded">
                        <span className="text-sm text-foreground">$2</span>
                        <span className="text-sm font-medium text-muted-foreground">{cashBox.denominations.coins.two}</span>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-secondary/30 rounded">
                        <span className="text-sm text-foreground">$1</span>
                        <span className="text-sm font-medium text-muted-foreground">{cashBox.denominations.coins.one}</span>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-secondary/30 rounded">
                        <span className="text-sm text-foreground">$0.50</span>
                        <span className="text-sm font-medium text-muted-foreground">{cashBox.denominations.coins.fifty_cents}</span>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-secondary/30 rounded">
                        <span className="text-sm text-foreground">$0.25</span>
                        <span className="text-sm font-medium text-muted-foreground">{cashBox.denominations.coins.quarter}</span>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-secondary/30 rounded">
                        <span className="text-sm text-foreground">$0.10</span>
                        <span className="text-sm font-medium text-muted-foreground">{cashBox.denominations.coins.dime}</span>
                      </div>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    className="w-full mt-4"
                    data-testid="button-update-denominations"
                    onClick={() => setShowPhysicalCountModal(true)}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Arqueo de Caja
                  </Button>
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  Cargando denominaciones...
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <IncomeModal open={showIncomeModal} onOpenChange={setShowIncomeModal} />
      <ExitModal open={showExitModal} onOpenChange={setShowExitModal} />
      <CompleteExitModal open={showCompleteModal} onOpenChange={setShowCompleteModal} />
      <PhysicalCountModal open={showPhysicalCountModal} onOpenChange={setShowPhysicalCountModal} />
    </>
  );
}
