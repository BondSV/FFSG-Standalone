/* Lightweight smoke tests for server/gameEngine.ts.
 *
 * Run from the project root with:
 *   npx tsx tests/engine.smoke.ts
 *
 * No test runner. Each test logs PASS/FAIL and the script exits non-zero on
 * the first failure so it can be wired into CI. Keep this small — it covers
 * the high-risk invariants we can verify without spinning up the database.
 */

import assert from "node:assert/strict";
import { GAME_CONSTANTS, GameEngine } from "../server/gameEngine.js";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  try {
    const r = fn();
    if (r instanceof Promise) {
      r.then(() => {
        console.log(`  PASS  ${name}`);
        passed++;
      }).catch((e) => {
        console.error(`  FAIL  ${name}`);
        console.error(e);
        failed++;
      });
    } else {
      console.log(`  PASS  ${name}`);
      passed++;
    }
  } catch (e) {
    console.error(`  FAIL  ${name}`);
    console.error(e);
    failed++;
  }
}

console.log("Engine smoke tests:");

test("phase windows match spec", () => {
  assert.equal(GameEngine.getPhaseForWeek(1), "strategy");
  assert.equal(GameEngine.getPhaseForWeek(2), "strategy");
  assert.equal(GameEngine.getPhaseForWeek(3), "development");
  assert.equal(GameEngine.getPhaseForWeek(6), "development");
  assert.equal(GameEngine.getPhaseForWeek(7), "sales");
  assert.equal(GameEngine.getPhaseForWeek(12), "sales");
  assert.equal(GameEngine.getPhaseForWeek(13), "runout");
  assert.equal(GameEngine.getPhaseForWeek(15), "runout");
});

test("starting capital and credit limit are sane", () => {
  assert.ok(GAME_CONSTANTS.STARTING_CAPITAL >= 100_000, "STARTING_CAPITAL too low");
  assert.ok(GAME_CONSTANTS.CREDIT_LIMIT >= GAME_CONSTANTS.STARTING_CAPITAL, "CREDIT_LIMIT below STARTING_CAPITAL");
  assert.ok(GAME_CONSTANTS.WEEKLY_INTEREST_RATE > 0 && GAME_CONSTANTS.WEEKLY_INTEREST_RATE < 0.1);
  assert.ok(GAME_CONSTANTS.HOLDING_COST_RATE > 0 && GAME_CONSTANTS.HOLDING_COST_RATE < 0.05);
});

test("cost-floor validation catches sub-cost RRP", () => {
  const state: any = {
    weekNumber: 1,
    productData: {
      jacket: { rrp: 1, confirmedMaterialCost: 25 },
      dress: { rrp: 1, confirmedMaterialCost: 25 },
      pants: { rrp: 1, confirmedMaterialCost: 25 },
    },
    cashOnHand: GAME_CONSTANTS.STARTING_CAPITAL,
    creditUsed: 0,
    rawMaterials: {},
    workInProcess: { batches: [] },
    finishedGoods: { lots: [] },
    productionSchedule: { batches: [] },
    procurementContracts: { contracts: [] },
    weeklyDemand: {},
    weeklySales: {},
    lostSales: {},
    weeklyDiscounts: {},
  };
  const result = GameEngine.validateWeeklyDecisions(1, state, {} as any);
  assert.ok(result.errors.some((e) => /below cost floor/i.test(e)), "expected cost floor violation");
});

test("demand at RRP=hmPrice and no marketing is positive", () => {
  const dJacket = GameEngine.calculateDemand("jacket" as any, 8, GAME_CONSTANTS.PRODUCTS.jacket.hmPrice, 0, 0, false);
  assert.ok(dJacket > 0, `expected positive demand, got ${dJacket}`);
});

test("demand falls when discount is negative (price above RRP)", () => {
  const baseline = GameEngine.calculateDemand("dress" as any, 8, GAME_CONSTANTS.PRODUCTS.dress.hmPrice, 0, 0, false);
  const higher = GameEngine.calculateDemand("dress" as any, 8, GAME_CONSTANTS.PRODUCTS.dress.hmPrice, -0.5, 0, false);
  assert.ok(higher < baseline, `expected demand to drop with higher price (baseline=${baseline}, higher=${higher})`);
});

test("calculateActualUnitCost handles zero units", () => {
  assert.equal(GameEngine.calculateActualUnitCost(0, 0, 0, 0, 0, 0), 0);
});

test("calculateActualUnitCost averages COGS over units", () => {
  const v = GameEngine.calculateActualUnitCost(0, 100, 50, 25, 25, 100);
  assert.ok(Math.abs(v - 2) < 1e-6, `expected ~2, got ${v}`);
});

test("calculateHoldingCosts uses HOLDING_COST_RATE", () => {
  const v = GameEngine.calculateHoldingCosts(1_000_000);
  const expected = 1_000_000 * GAME_CONSTANTS.HOLDING_COST_RATE;
  assert.ok(Math.abs(v - expected) < 1e-6, `expected ${expected}, got ${v}`);
});

test("calculateInterest uses WEEKLY_INTEREST_RATE", () => {
  const v = GameEngine.calculateInterest(500_000);
  const expected = 500_000 * GAME_CONSTANTS.WEEKLY_INTEREST_RATE;
  assert.ok(Math.abs(v - expected) < 1e-6);
});

test("processProductionSchedule is a no-op (financials handled in commitWeek)", () => {
  const updates = { foo: "bar" };
  const result = GameEngine.processProductionSchedule({}, updates);
  assert.equal(result, updates);
});

setTimeout(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}, 100);
