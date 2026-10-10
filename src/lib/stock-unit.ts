// src/lib/stock-unit.ts

export class StockUnitError extends Error {}

/**
 * Converte uma quantidade digitada numa unidade (base ou de compra) para
 * a unidade base de estoque do produto — é essa quantidade convertida
 * que sempre vai pro campo `quantity` do StockMovement.
 */
export function convertToBaseUnit({
  enteredQuantity,
  enteredUnit,
  productUnit,
  purchaseUnit,
  unitsPerPurchaseUnit,
}: {
  enteredQuantity: number;
  enteredUnit: string;
  productUnit: string;
  purchaseUnit: string | null;
  unitsPerPurchaseUnit: number | null;
}): number {
  if (enteredQuantity <= 0) {
    throw new StockUnitError("Quantidade deve ser maior que zero.");
  }

  if (enteredUnit === productUnit) {
    return enteredQuantity;
  }

  if (enteredUnit === purchaseUnit) {
    if (!unitsPerPurchaseUnit || unitsPerPurchaseUnit <= 0) {
      throw new StockUnitError(
        `Esse produto não tem um fator de conversão configurado para "${purchaseUnit}".`,
      );
    }
    return enteredQuantity * unitsPerPurchaseUnit;
  }

  throw new StockUnitError(
    `Não há conversão configurada de "${enteredUnit}" para "${productUnit}" nesse produto.`,
  );
}

/**
 * Custo médio ponderado: o custo do produto passa a refletir a mistura
 * do estoque que já existia com o lote recém-entrado.
 *
 * novoCusto = (estoqueAtual × custoAtual + qtdEntrada × custoDoLote)
 *             / (estoqueAtual + qtdEntrada)
 */
export function calculateWeightedAverageCost({
  stockBeforeEntry,
  currentCostPrice,
  enteredQuantityBaseUnit,
  unitCost,
}: {
  stockBeforeEntry: number;
  currentCostPrice: number;
  enteredQuantityBaseUnit: number;
  unitCost: number;
}): number {
  // Se o estoque estava negativo/zerado, não faz sentido "diluir" —
  // o custo do produto passa a ser direto o custo do novo lote.
  const baseStock = Math.max(stockBeforeEntry, 0);
  const totalQuantity = baseStock + enteredQuantityBaseUnit;

  if (totalQuantity <= 0) {
    return unitCost;
  }

  const currentValue = baseStock * currentCostPrice;
  const enteredValue = enteredQuantityBaseUnit * unitCost;

  return (currentValue + enteredValue) / totalQuantity;
}
