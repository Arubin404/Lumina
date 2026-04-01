import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Edit3, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import IncomeModal from "@/components/modals/income-modal";
import { formatCurrency } from "@/lib/denomination-utils";
import { Income } from "@shared/schema";

export default function Ingresos() {
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const { data: incomes, isLoading } = useQuery<Income[]>({
    queryKey: ["/api/incomes"],
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  const filteredIncomes = incomes?.filter(income =>
    income.detail.toLowerCase().includes(searchTerm.toLowerCase()) ||
    income.voucherId.toString().includes(searchTerm)
  ) || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Cargando ingresos...</div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-card border-b border-border px-8 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Ingresos</h2>
            <p className="text-muted-foreground">Registro de entradas de dinero a caja</p>
          </div>
          <Button
            onClick={() => setShowIncomeModal(true)}
            className="bg-success hover:bg-success/90 text-success-foreground"
            data-testid="button-new-income"
          >
            <Plus className="mr-2 h-4 w-4" />
            Nuevo Ingreso
          </Button>
        </div>
      </div>

      <div className="p-8 space-y-6">
        {/* Search and Filters */}
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <Label htmlFor="search" className="text-sm font-medium text-foreground">
                  Buscar por detalle o voucher
                </Label>
                <Input
                  id="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar ingresos..."
                  data-testid="input-search-incomes"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-sm font-medium">Total Ingresos</p>
                  <p className="text-2xl font-bold text-foreground">
                    {incomes?.length || 0}
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
                  <p className="text-muted-foreground text-sm font-medium">Monto Total</p>
                  <p className="text-2xl font-bold text-foreground">
                    {formatCurrency(incomes?.reduce((sum, income) => sum + income.totalAmount, 0) || 0)}
                  </p>
                </div>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Calendar className="text-primary h-6 w-6" />
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
                    {incomes?.filter(income => {
                      const incomeDate = new Date(income.createdAt);
                      const today = new Date();
                      return incomeDate.toDateString() === today.toDateString();
                    }).length || 0}
                  </p>
                </div>
                <div className="w-12 h-12 bg-warning/10 rounded-lg flex items-center justify-center">
                  <Calendar className="text-warning h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Incomes List */}
        <Card>
          <CardHeader>
            <CardTitle>Lista de Ingresos</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredIncomes.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {searchTerm ? "No se encontraron ingresos que coincidan con la búsqueda" : "No hay ingresos registrados"}
              </div>
            ) : (
              <div className="space-y-4">
                {filteredIncomes.map((income) => (
                  <div
                    key={income.id}
                    className="border border-border rounded-lg p-4 hover:bg-muted/30 transition-colors"
                    data-testid={`income-item-${income.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                            Voucher #{income.voucherId.toString().padStart(4, "0")}
                          </Badge>
                          {income.editedAt && (
                            <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
                              <Edit3 className="mr-1 h-3 w-3" />
                              Editado
                            </Badge>
                          )}
                        </div>
                        <h3 className="font-semibold text-foreground text-lg">{income.detail}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3 text-sm">
                          <div>
                            <p className="text-muted-foreground">Monto Total</p>
                            <p className="font-medium text-success text-lg">{formatCurrency(income.totalAmount)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Fecha</p>
                            <p className="font-medium">{new Date(income.date).toLocaleDateString()}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Registrado</p>
                            <p className="font-medium">{new Date(income.createdAt).toLocaleString()}</p>
                          </div>
                        </div>
                        
                        {/* Denomination breakdown */}
                        <div className="mt-4 pt-4 border-t border-border">
                          <p className="text-sm font-medium text-muted-foreground mb-2">Denominaciones:</p>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                            {/* Bills */}
                            {Object.entries(income.denominations.bills).map(([denomination, count]) => {
                              if (count === 0) return null;
                              const values: Record<string, number> = { hundred: 100, fifty: 50, twenty: 20, ten: 10, five: 5, two: 2, one: 1 };
                              return (
                                <div key={denomination} className="bg-secondary/30 p-2 rounded text-center">
                                  <p className="font-medium">${values[denomination]} x {count}</p>
                                  <p className="text-muted-foreground">{formatCurrency(values[denomination] * count)}</p>
                                </div>
                              );
                            })}
                            {/* Coins */}
                            {Object.entries(income.denominations.coins).map(([denomination, count]) => {
                              if (count === 0) return null;
                              const values: Record<string, number> = { five: 5, two: 2, one: 1, fifty_cents: 0.5, quarter: 0.25, dime: 0.1 };
                              return (
                                <div key={denomination} className="bg-secondary/30 p-2 rounded text-center">
                                  <p className="font-medium">${values[denomination]} x {count}</p>
                                  <p className="text-muted-foreground">{formatCurrency(values[denomination] * count)}</p>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <IncomeModal open={showIncomeModal} onOpenChange={setShowIncomeModal} />
    </>
  );
}
