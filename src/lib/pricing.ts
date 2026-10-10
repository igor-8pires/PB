// src/lib/pricing.ts
import { prisma } from "@/lib/prisma";

export class PricingError extends Error {}

type SellerMarginConfig = {
  defaultMarginPercent: number;
  minMarginPercent: number;
  maxMarginPercent: number;
  allowOrderMarginChange: boolean;
};

/**
 * Estoque atual = soma de todas as movimentações.
 * IN e ADJUSTMENT somam (ajuste negativo já vem com quantity negativo),
 * OUT subtrai.
 */
export async function getProductStock(productId: string): Promise<number> {
  const movements = await prisma.stockMovement.findMany({
    where: { productId },
    select: { type: true, quantity: true },
  });

  return movements.reduce((total, movement) => {
    if (movement.type === "OUT") return total - movement.quantity;
    return total + movement.quantity;
  }, 0);
}

/**
 * Busca a faixa de desconto por quantidade que se aplica, conforme
 * spec.md §9: faixas não se sobrepõem, pega a de minQuantity mais alta
 * que ainda cabe na quantidade pedida.
 */
export async function getQuantityDiscountPercent(
  sellerId: string,
  quantity: number,
): Promise<number> {
  const discount = await prisma.quantityDiscount.findFirst({
    where: {
      sellerId,
      active: true,
      minQuantity: { lte: quantity },
      OR: [{ maxQuantity: null }, { maxQuantity: { gte: quantity } }],
    },
    orderBy: { minQuantity: "desc" },
  });

  return discount?.discountPercent ?? 0;
}

export type QuantityDiscountRule = {
  categoryId: string | null;
  productId: string | null;
  baseUnit: string | null;
  unit: string | null;
  minQuantity: number;
  maxQuantity: number | null;
  discountPercent: number;
};

export type QuantityDiscountOrderItem = {
  productId: string;
  categoryId: string;
  baseUnit: string;
  purchaseUnit: string | null;
  unitsPerPurchaseUnit: number | null;
  baseQuantity: number;
};

function quantityInUnit(item: QuantityDiscountOrderItem, unit: string) {
  if (unit === item.baseUnit) return item.baseQuantity;
  if (
    unit === item.purchaseUnit &&
    item.unitsPerPurchaseUnit !== null &&
    item.unitsPerPurchaseUnit > 0
  ) {
    return item.baseQuantity / item.unitsPerPurchaseUnit;
  }
  return null;
}

function matchingRule(
  rules: QuantityDiscountRule[],
  quantityForRule: (rule: QuantityDiscountRule) => number | null,
) {
  return rules
    .map((rule) => ({ rule, quantity: quantityForRule(rule) }))
    .filter(
      ({ rule, quantity }) =>
        quantity !== null &&
        rule.minQuantity <= quantity &&
        (rule.maxQuantity === null || quantity <= rule.maxQuantity),
    )
    .sort((left, right) => right.rule.minQuantity - left.rule.minQuantity)[0]
    ?.rule;
}

export function resolveQuantityDiscountPercents(
  rules: QuantityDiscountRule[],
  items: QuantityDiscountOrderItem[],
): number[] {
  return items.map((item) => {
    const productRule = matchingRule(
      rules.filter(
        (rule) =>
          rule.productId === item.productId &&
          rule.categoryId === null &&
          rule.baseUnit === item.baseUnit,
      ),
      (rule) =>
        items
          .filter((candidate) => candidate.productId === item.productId)
          .reduce((total, candidate) => {
            const quantity = quantityInUnit(candidate, rule.unit ?? "");
            return total + (quantity ?? 0);
          }, 0),
    );
    if (productRule) return productRule.discountPercent;

    const categoryRule = matchingRule(
      rules.filter(
        (rule) =>
          rule.categoryId === item.categoryId &&
          rule.productId === null &&
          rule.baseUnit === item.baseUnit,
      ),
      (rule) => {
        if (quantityInUnit(item, rule.unit ?? "") === null) return null;
        return items
          .filter(
            (candidate) =>
              candidate.categoryId === item.categoryId &&
              candidate.baseUnit === item.baseUnit,
          )
          .reduce((total, candidate) => {
            const quantity = quantityInUnit(candidate, rule.unit ?? "");
            return total + (quantity ?? 0);
          }, 0);
      },
    );
    if (categoryRule) return categoryRule.discountPercent;

    const globalRule = matchingRule(
      rules.filter(
        (rule) =>
          rule.categoryId === null &&
          rule.productId === null &&
          rule.unit === null &&
          rule.baseUnit === null,
      ),
      () => item.baseQuantity,
    );
    return globalRule?.discountPercent ?? 0;
  });
}

/**
 * spec.md §18 — o vendedor só pode alterar a margem se
 * allowOrderMarginChange = true, e sempre dentro de min/max.
 */
export function resolveMarginPercent({
  sellerConfig,
  requestedMarginPercent,
}: {
  sellerConfig: SellerMarginConfig;
  requestedMarginPercent?: number | null;
}): number {
  if (requestedMarginPercent === undefined || requestedMarginPercent === null) {
    return sellerConfig.defaultMarginPercent;
  }

  if (requestedMarginPercent === sellerConfig.defaultMarginPercent) {
    return requestedMarginPercent;
  }

  if (!sellerConfig.allowOrderMarginChange) {
    throw new PricingError("Este vendedor não pode alterar a margem no pedido.");
  }

  if (
    requestedMarginPercent < sellerConfig.minMarginPercent ||
    requestedMarginPercent > sellerConfig.maxMarginPercent
  ) {
    throw new PricingError(
      `Margem deve estar entre ${sellerConfig.minMarginPercent}% e ${sellerConfig.maxMarginPercent}%.`,
    );
  }

  return requestedMarginPercent;
}

/**
 * spec.md §10 — fórmula oficial:
 * precoComMargem = precoBase × (1 + margem / 100)
 * precoFinal = precoComMargem × (1 - desconto / 100)
 */
export function calculateFinalPrice({
  basePrice,
  marginPercent,
  discountPercent,
}: {
  basePrice: number;
  marginPercent: number;
  discountPercent: number;
}) {
  const precoComMargem = basePrice * (1 + marginPercent / 100);
  const unitPrice = precoComMargem * (1 - discountPercent / 100);

  return { precoComMargem, unitPrice };
}

/**
 * Calcula o preço final de um item de pedido, ponta a ponta:
 * localidade do cliente -> preço base -> margem -> desconto por
 * quantidade -> preço final. Também confere estoque disponível.
 *
 * Esta função roda SEMPRE no backend (Server Action), nunca no
 * cliente — design.md §4.
 */
export async function calculateItemPrice({
  sellerId,
  customerId,
  productId,
  quantity,
  quantityDiscountPercent,
  requestedMarginPercent,
  requestedUnitPrice,
}: {
  sellerId: string;
  customerId: string;
  productId: string;
  quantity: number;
  quantityDiscountPercent?: number;
  requestedMarginPercent?: number | null;
  requestedUnitPrice?: number | null;
}) {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new PricingError("Quantidade deve ser um número inteiro maior que zero.");
  }

  const [customer, sellerProfile, product] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId } }),
    prisma.sellerProfile.findUnique({ where: { sellerId } }),
    prisma.product.findUnique({ where: { id: productId } }),
  ]);

  if (!customer) throw new PricingError("Cliente não encontrado.");
  if (!sellerProfile || !sellerProfile.active) {
    throw new PricingError("Perfil comercial do vendedor não configurado.");
  }
  if (!product || !product.active) {
    throw new PricingError("Produto não encontrado ou inativo.");
  }

  const basePriceRecord = await prisma.basePrice.findUnique({
    where: {
      productId_locationId: {
        productId,
        locationId: customer.locationId,
      },
    },
  });

  if (!basePriceRecord || !basePriceRecord.active) {
    throw new PricingError(
      "Não há preço base cadastrado para esse produto nessa localidade.",
    );
  }

  const discountPercent =
    quantityDiscountPercent ?? (await getQuantityDiscountPercent(sellerId, quantity));
  const standardPrice = calculateFinalPrice({
    basePrice: basePriceRecord.price,
    marginPercent: sellerProfile.defaultMarginPercent,
    discountPercent,
  }).unitPrice;

  let marginPercent: number;
  const priceWasEdited =
    requestedUnitPrice != null && Math.abs(requestedUnitPrice - standardPrice) > 0.005;

  if (requestedUnitPrice != null) {
    if (!Number.isFinite(requestedUnitPrice) || requestedUnitPrice <= 0) {
      throw new PricingError("O preço final deve ser maior que zero.");
    }

    const discountFactor = 1 - discountPercent / 100;
    const priceBeforeDiscount = requestedUnitPrice / discountFactor;
    const derivedMarginPercent =
      ((priceBeforeDiscount / basePriceRecord.price) - 1) * 100;

    marginPercent = resolveMarginPercent({
      sellerConfig: sellerProfile,
      requestedMarginPercent: derivedMarginPercent,
    });
  } else {
    marginPercent = resolveMarginPercent({
      sellerConfig: sellerProfile,
      requestedMarginPercent,
    });
  }

  const calculatedPrice = calculateFinalPrice({
    basePrice: basePriceRecord.price,
    marginPercent,
    discountPercent,
  });
  const unitPrice = requestedUnitPrice ?? calculatedPrice.unitPrice;

  const availableStock = await getProductStock(productId);

  return {
    productId,
    productName: product.name,
    quantity,
    basePrice: basePriceRecord.price,
    marginPercent,
    discountPercent,
    unitPrice,
    total: unitPrice * quantity,
    standardPrice,
    priceWasEdited,
    availableStock,
    stockOk: availableStock >= quantity,
    defaultMarginPercent: sellerProfile.defaultMarginPercent,
    minMarginPercent: sellerProfile.minMarginPercent,
    maxMarginPercent: sellerProfile.maxMarginPercent,
    allowOrderMarginChange: sellerProfile.allowOrderMarginChange,
  };
}

export type CalculatedItem = Awaited<ReturnType<typeof calculateItemPrice>>;
