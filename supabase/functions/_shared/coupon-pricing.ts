/**
 * Shared coupon pricing calculation module.
 * Used by admin-coupons edge function and testable independently.
 *
 * All monetary values (regular price, discount value, result) are in centavos.
 * The `amount_php` database column stores whole pesos.
 */

export const REGULAR_PRICE_CENTAVOS = 690000; // ₱6,900

export type DiscountType = "fixed_php" | "percentage" | "target_price";

/**
 * Calculate final price in whole pesos for the amount_php column.
 * Regular price and discount value are in centavos.
 * Result is converted from centavos to whole pesos.
 */
export function calculateAmountPhp(
  discountType: DiscountType,
  discountValue: number,
  regularPriceCentavos: number = REGULAR_PRICE_CENTAVOS,
): number {
  let finalPriceCentavos: number;

  switch (discountType) {
    case "fixed_php":
      finalPriceCentavos = regularPriceCentavos - Math.min(discountValue, regularPriceCentavos);
      break;
    case "percentage":
      finalPriceCentavos = regularPriceCentavos - Math.floor((regularPriceCentavos * discountValue) / 10000);
      break;
    case "target_price":
      finalPriceCentavos = Math.min(discountValue, regularPriceCentavos);
      break;
    default:
      finalPriceCentavos = regularPriceCentavos;
  }

  return Math.max(0, Math.round(finalPriceCentavos / 100));
}

/**
 * Calculate discount preview for admin UI display.
 * All values returned in centavos (for display formatting).
 */
export function calculateDiscountPreview(
  discountType: DiscountType,
  discountValue: number,
  regularPriceCentavos: number = REGULAR_PRICE_CENTAVOS,
): {
  regular_price_php: number;
  discount_amount_php: number;
  final_price_php: number;
  discount_percent: number;
} {
  let discountAmount = 0;
  let finalPrice = regularPriceCentavos;

  switch (discountType) {
    case "fixed_php":
      discountAmount = Math.min(discountValue, regularPriceCentavos);
      finalPrice = regularPriceCentavos - discountAmount;
      break;
    case "percentage":
      discountAmount = Math.floor((regularPriceCentavos * discountValue) / 10000);
      finalPrice = regularPriceCentavos - discountAmount;
      break;
    case "target_price":
      finalPrice = Math.min(discountValue, regularPriceCentavos);
      discountAmount = regularPriceCentavos - finalPrice;
      break;
  }

  return {
    regular_price_php: regularPriceCentavos,
    discount_amount_php: discountAmount,
    final_price_php: finalPrice,
    discount_percent: regularPriceCentavos > 0 ? Math.round((discountAmount / regularPriceCentavos) * 10000) / 100 : 0,
  };
}
