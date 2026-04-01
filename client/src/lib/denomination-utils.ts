import { Denomination } from "@shared/schema";

export const BILL_VALUES = {
  hundred: 100,
  fifty: 50,
  twenty: 20,
  ten: 10,
  five: 5,
  two: 2,
  one: 1
};

export const COIN_VALUES = {
  five: 5,
  two: 2,
  one: 1,
  fifty_cents: 0.5,
  quarter: 0.25,
  dime: 0.1
};

export function calculateTotal(denominations: Denomination): number {
  const { bills, coins } = denominations;
  
  const billsTotal = Object.entries(bills).reduce((sum, [key, count]) => {
    const value = BILL_VALUES[key as keyof typeof BILL_VALUES];
    return sum + (value * count);
  }, 0);
  
  const coinsTotal = Object.entries(coins).reduce((sum, [key, count]) => {
    const value = COIN_VALUES[key as keyof typeof COIN_VALUES];
    return sum + (value * count);
  }, 0);
  
  return billsTotal + coinsTotal;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

export function createEmptyDenomination(): Denomination {
  return {
    bills: {
      hundred: 0,
      fifty: 0,
      twenty: 0,
      ten: 0,
      five: 0,
      two: 0,
      one: 0
    },
    coins: {
      five: 0,
      two: 0,
      one: 0,
      fifty_cents: 0,
      quarter: 0,
      dime: 0
    }
  };
}

export function validateDenominationAvailability(
  requested: Denomination, 
  available: Denomination
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Check bills
  Object.entries(requested.bills).forEach(([denomination, requestedCount]) => {
    const availableCount = available.bills[denomination as keyof typeof available.bills];
    if (requestedCount > availableCount) {
      const value = BILL_VALUES[denomination as keyof typeof BILL_VALUES];
      errors.push(`Insuficientes billetes de $${value}: solicitados ${requestedCount}, disponibles ${availableCount}`);
    }
  });
  
  // Check coins
  Object.entries(requested.coins).forEach(([denomination, requestedCount]) => {
    const availableCount = available.coins[denomination as keyof typeof available.coins];
    if (requestedCount > availableCount) {
      const value = COIN_VALUES[denomination as keyof typeof COIN_VALUES];
      errors.push(`Insuficientes monedas de $${value}: solicitadas ${requestedCount}, disponibles ${availableCount}`);
    }
  });
  
  return {
    isValid: errors.length === 0,
    errors
  };
}
