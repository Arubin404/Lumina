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
  
  // Local string buffers to allow fluent editing of 0, empty state and intermediate typing
  const [localBills, setLocalBills] = useState<Record<string, string>>({});
  const [localCoins, setLocalCoins] = useState<Record<string, string>>({});

  const total = calculateTotal(denominations);

  // Sync external values to local states only when the parsed values change
  useEffect(() => {
    setLocalBills(prev => {
      const next: Record<string, string> = { ...prev };
      Object.entries(denominations.bills).forEach(([k, v]) => {
        const parsedLocal = parseInt(prev[k] || "0") || 0;
        if (parsedLocal !== v || prev[k] === undefined) {
          next[k] = v === 0 ? "" : v.toString();
        }
      });
      return next;
    });

    setLocalCoins(prev => {
      const next: Record<string, string> = { ...prev };
      Object.entries(denominations.coins).forEach(([k, v]) => {
        const parsedLocal = parseInt(prev[k] || "0") || 0;
        if (parsedLocal !== v || prev[k] === undefined) {
          next[k] = v === 0 ? "" : v.toString();
        }
      });
      return next;
    });
  }, [denominations]);

  const handleBillChange = (denomination: keyof Denomination['bills'], value: string) => {
    // Only allow positive integers or empty string
    if (value !== "" && !/^\d+$/.test(value)) return;
    
    setLocalBills(prev => ({ ...prev, [denomination]: value }));
    const numValue = value === "" ? 0 : parseInt(value) || 0;
    
    onChange({
      ...denominations,
      bills: {
        ...denominations.bills,
        [denomination]: numValue
      }
    });
  };

  const handleCoinChange = (denomination: keyof Denomination['coins'], value: string) => {
    if (value !== "" && !/^\d+$/.test(value)) return;
    
    setLocalCoins(prev => ({ ...prev, [denomination]: value }));
    const numValue = value === "" ? 0 : parseInt(value) || 0;
    
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
          <AlertTriangle className="size-4" />
          <AlertDescription>
            <ul className="list-disc list-inside space-y-1">
              {errors.map((error) => (
                <li key={error}>{error}</li>
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
            const inputValue = localBills[denomination] ?? "";

            return (
              <div key={denomination} className="flex items-center gap-x-2">
                <Label className="text-sm text-foreground w-12">${value}</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={inputValue}
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
            const inputValue = localCoins[denomination] ?? "";

            return (
              <div key={denomination} className="flex items-center gap-x-2">
                <Label className="text-sm text-foreground w-12">${value}</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={inputValue}
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
      {Boolean(showTotal) && (
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
