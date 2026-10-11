import { describe, it } from "https://deno.land/std@0.224.0/testing/bdd.ts";
import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import {
  calculateAmountPhp,
  calculateDiscountPreview,
  REGULAR_PRICE_CENTAVOS,
  DiscountType,
} from "../_shared/coupon-pricing.ts";

describe("calculateAmountPhp", () => {
  it("XYRA fixed_php produces amount_php=3900 (not 390000)", () => {
    const result = calculateAmountPhp("fixed_php", 300000);
    assertEquals(result, 3900, "XYRA coupon should be ₱3,900 final price");
  });

  it("MASTERCLASS fixed_php produces amount_php=4900", () => {
    const result = calculateAmountPhp("fixed_php", 200000);
    assertEquals(result, 4900, "MASTERCLASS coupon should be ₱4,900 final price");
  });

  it("percentage discount calculates correctly", () => {
    // 20% of 690000 = 138000 → final 552000 centavos → 5520 pesos
    const result = calculateAmountPhp("percentage", 2000); // 2000 = 20%
    assertEquals(result, 5520);
  });

  it("target_price produces exact target", () => {
    const result = calculateAmountPhp("target_price", 490000);
    assertEquals(result, 4900);
  });

  it("rounding handles fractions correctly (no centavos leakage into pesos)", () => {
    // 690000 - 300001 = 389999 centavos → 3900 pesos (rounded from 3899.99)
    const result = calculateAmountPhp("fixed_php", 300001);
    assertEquals(result, 3900);
  });

  it("boundary: zero discount produces full price", () => {
    const result = calculateAmountPhp("fixed_php", 0);
    assertEquals(result, 6900);
  });

  it("boundary: discount exceeds price produces zero (not negative)", () => {
    const result = calculateAmountPhp("fixed_php", 999999);
    assertEquals(result, 0);
  });

  it("uses custom regular price when provided", () => {
    const result = calculateAmountPhp("fixed_php", 10000, 50000);
    assertEquals(result, 400); // 50000 - 10000 = 40000 centavos → 400 pesos
  });
});

describe("calculateDiscountPreview", () => {
  it("XYRA preview uses centavos", () => {
    const preview = calculateDiscountPreview("fixed_php", 300000);
    assertEquals(preview.final_price_php, 390000); // 3900 pesos in centavos
    assertEquals(preview.discount_amount_php, 300000);
  });

  it("MASTERCLASS preview calculates percentage", () => {
    const preview = calculateDiscountPreview("percentage", 2899); // ~28.99%
    assertEquals(preview.discount_percent > 28, true);
  });
});
