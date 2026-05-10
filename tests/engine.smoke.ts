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

test("demand rises when discount is positive", () => {
  const rrp = GAME_CONSTANTS.PRODUCTS.jacket.hmPrice * 1.2;
  const baseline = GameEngine.calculateDemand("jacket" as any, 8, rrp, 0, 0, false);
  const discounted = GameEngine.calculateDemand("jacket" as any, 8, rrp, 0.2, 0, false);
  assert.ok(discounted > baseline, `expected demand to rise with discount (baseline=${baseline}, discounted=${discounted})`);
});

test("accessible-premium RRP around H&M plus 20% has stronger demand than extreme premium", () => {
  const target = GAME_CONSTANTS.PRODUCTS.pants.hmPrice * 1.2;
  const extreme = GAME_CONSTANTS.PRODUCTS.pants.hmPrice * 2.5;
  const targetDemand = GameEngine.calculateDemand("pants" as any, 8, target, 0, 0, false);
  const extremeDemand = GameEngine.calculateDemand("pants" as any, 8, extreme, 0, 0, false);
  assert.ok(targetDemand > extremeDemand, `expected accessible-premium demand to exceed extreme premium demand (target=${targetDemand}, extreme=${extremeDemand})`);
});

test("fabric and print choices affect demand in the engine", () => {
  const rrp = GAME_CONSTANTS.PRODUCTS.jacket.hmPrice * 1.2;
  const standard = GameEngine.calculateDemand("jacket" as any, 8, rrp, 0, 0, false, "standardDenim" as any);
  const selvedgePrint = GameEngine.calculateDemand("jacket" as any, 8, rrp, 0, 0, true, "selvedgeDenim" as any);
  assert.ok(selvedgePrint > standard, `expected premium fabric + print to lift demand (standard=${standard}, selvedgePrint=${selvedgePrint})`);
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

test("partial production can start when remaining fabric is below one rung", async () => {
  const state: any = {
    weekNumber: 3,
    cashOnHand: 1_000_000,
    creditUsed: 0,
    awareness: 0,
    intent: 0,
    rawMaterials: {
      selvedgeDenim: {
        onHand: 18_187,
        allocated: 0,
        onHandValue: 181_870,
        costLots: [{ quantity: 18_187, unitCost: 10 }],
      },
    },
    workInProcess: { batches: [] },
    finishedGoods: { lots: [] },
    shipmentsInTransit: [],
    productionSchedule: {
      batches: [{
        id: "partial-jacket",
        product: "jacket",
        method: "inhouse",
        startWeek: 3,
        quantity: 25_000,
        shipping: "standard",
      }],
    },
    procurementContracts: { contracts: [] },
    productData: {
      jacket: { fabric: "selvedgeDenim", confirmedMaterialCost: 10, rrp: GAME_CONSTANTS.PRODUCTS.jacket.hmPrice * 1.2 },
      dress: { fabric: "egyptianCotton", confirmedMaterialCost: 8, rrp: GAME_CONSTANTS.PRODUCTS.dress.hmPrice * 1.2 },
      pants: { fabric: "fineWaleCorduroy", confirmedMaterialCost: 9, rrp: GAME_CONSTANTS.PRODUCTS.pants.hmPrice * 1.2 },
    },
    weeklyDemand: {},
    weeklySales: {},
    lostSales: {},
    weeklyDiscounts: {},
    marketingPlan: { totalSpend: 0 },
    plannedMarketingPlan: { totalSpend: 0 },
    materialCosts: "0",
    productionCosts: "0",
    logisticsCosts: "0",
    holdingCosts: "0",
    interestAccrued: "0",
    totals: { revenueToDate: 0, unitsSoldToDate: 0, cogsMaterialsToDate: 0, cogsProductionToDate: 0, cogsLogisticsToDate: 0, cogsMarketingToDate: 0 },
  };

  const validation = GameEngine.validateWeeklyDecisions(3, state, {} as any);
  assert.equal(validation.canCommit, true, validation.errors.join("; "));

  const committed = await GameEngine.commitWeek(state);
  const wip = (committed as any).workInProcess.batches.find((b: any) => b.id === "partial-jacket");
  assert.equal(wip.quantity, 18_187);
  assert.equal(Number((committed as any).rawMaterials.selvedgeDenim.onHand), 0);
  assert.equal(Number((committed as any).productionCosts), 25_000 * GAME_CONSTANTS.MANUFACTURING.jacket.inHouseCost);
});

setTimeout(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}, 100);
