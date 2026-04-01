import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Denomination } from "@shared/schema";
import { calculateTotal, formatCurrency, BILL_VALUES, COIN_VALUES } from "@/lib/denomination-utils";

interface DenominationInputProps {
  denominations: Denomination;
  onChange: (denominations: Denomination) => void;
  availableDenominations?: Denomination;
  showTotal?: boolean;
  disabled?: boolean;
}

export default function DenominationInput({
  denominations,
  onChange,
  availableDenominations,
  showTotal = true,
  disabled = false
}: DenominationInputProps) {
  const [errors, setErrors] = useState<string[]>([]);

  const total = calculateTotal(denominations);

  const handleBillChange = (denomination: keyof Denomination['bills'], value: string) => {
    const numValue = Math.max(0, parseInt(value) || 0);
    onChange({
      ...denominations,
      bills: {
        ...denominations.bills,
        [denomination]: numValue
      }
    });
  };

  const handleCoinChange = (denomination: keyof Denomination['coins'], value: string) => {
    const numValue = Math.max(0, parseInt(value) || 0);
    onChange({
      ...denominations,
      coins: {
        ...denominations.coins,
        [denomination]: numValue
      }
    });
  };

  // Validate availability when denominations change
  useEffect(() => {
    if (!availableDenominations) return;

    const newErrors: string[] = [];

    // Check bills
    Object.entries(denominations.bills).forEach(([denomination, requestedCount]) => {
      const availableCount = availableDenominations.bills[denomination as keyof typeof availableDenominations.bills];
      if (requestedCount > availableCount) {
        const value = BILL_VALUES[denomination as keyof typeof BILL_VALUES];
        newErrors.push(`Insuficientes billetes de $${value}: disponibles ${availableCount}`);
      }
    });

    // Check coins
    Object.entries(denominations.coins).forEach(([denomination, requestedCount]) => {
      const availableCount = availableDenominations.coins[denomination as keyof typeof availableDenominations.coins];
      if (requestedCount > availableCount) {
        const value = COIN_VALUES[denomination as keyof typeof COIN_VALUES];
        newErrors.push(`Insuficientes monedas de $${value}: disponibles ${availableCount}`);
      }
    });

    setErrors(newErrors);
  }, [denominations, availableDenominations]);

  return (
    <div className="space-y-4">
      {errors.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <ul className="list-disc list-inside space-y-1">
              {errors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Bills Section */}
      <div>
        <Label className="text-sm font-medium text-foreground mb-4 block">Billetes</Label>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Object.entries(BILL_VALUES).map(([denomination, value]) => {
            const currentValue = denominations.bills[denomination as keyof typeof denominations.bills];
            const availableValue = availableDenominations?.bills[denomination as keyof typeof availableDenominations.bills];
            const hasError = availableDenominations && currentValue > (availableValue ?? 0);

            return (
              <div key={denomination} className="flex items-center space-x-2">
                <Label className="text-sm text-foreground w-12">${value}</Label>
                <Input
                  type="number"
                  min="0"
                  value={currentValue || ""}
                  onChange={(e) => handleBillChange(denomination as keyof typeof denominations.bills, e.target.value)}
                  placeholder="0"
                  disabled={disabled}
                  className={`w-20 ${hasError ? "border-destructive" : ""}`}
                  data-testid={`input-bill-${denomination}`}
                />
                {availableDenominations && (
                  <span className="text-xs text-muted-foreground">
                    /{availableValue || 0}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Coins Section */}
      <div>
        <Label className="text-sm font-medium text-foreground mb-4 block">Monedas</Label>
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
          {Object.entries(COIN_VALUES).map(([denomination, value]) => {
            const currentValue = denominations.coins[denomination as keyof typeof denominations.coins];
            const availableValue = availableDenominations?.coins[denomination as keyof typeof availableDenominations.coins];
            const hasError = availableDenominations && currentValue > (availableValue ?? 0);

            return (
              <div key={denomination} className="flex items-center space-x-2">
                <Label className="text-sm text-foreground w-12">${value}</Label>
                <Input
                  type="number"
                  min="0"
                  value={currentValue || ""}
                  onChange={(e) => handleCoinChange(denomination as keyof typeof denominations.coins, e.target.value)}
                  placeholder="0"
                  disabled={disabled}
                  className={`w-16 ${hasError ? "border-destructive" : ""}`}
                  data-testid={`input-coin-${denomination}`}
                />
                {availableDenominations && (
                  <span className="text-xs text-muted-foreground">
                    /{availableValue || 0}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Total calculation */}
      {showTotal && (
        <Card className="bg-muted/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-foreground font-medium">Total calculado:</span>
              <span className="text-xl font-bold text-success" data-testid="text-total-amount">
                {formatCurrency(total)}
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
