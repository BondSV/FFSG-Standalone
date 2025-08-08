# Final Mega-Prompt for AI Coding Agent: Fast Fashion Business Simulation Game

## Project Overview:
You are tasked with building a complete, stand-alone, single-player online business simulation game called the "Fast Fashion Business Simulation Game." This prompt contains all necessary data, logic, and design specifications to build the entire application. The game is for Level 4 Operations and Project Management students. It is a deterministic simulation where a student manages a "Vintage Revival" capsule collection over 15 virtual weeks.

## Primary Goal:
Launch on time (Week 7), maintain a service level of ≥95% (Weeks 7-12), and finish the game (Week 15) with maximum economic profit, a positive cash balance, and zero inventory.

## 1. User Account Management & Progress
*   **Automatic Progress Saving:**
    *   The game state must be saved automatically for the user upon the successful completion of each week (i.e., after the "Commit Week" action is validated and processed).
    *   If a user logs out or their session is interrupted, they must be able to resume their game from the beginning of the last successfully saved week.

## 2. Core Game Logic & Rules

### 2.1. Game Flow & Enforced Workflow:
*   The simulation proceeds weekly for 15 weeks. The dashboard will guide the student through a logical workflow:
    1.  **Week 1-2 (Strategy Phase):** Use the "Design & Pricing" tab. Students must analyze competitor prices and set their Recommended Retail Price (RRP) for each product. They also make their initial design choices (fabric and print). The RRP is locked at the end of Week 2.
    2.  **Week 1-6 (Development Phase):** Use the "Procurement," "Production," and "Logistics" tabs. Secure materials, schedule production, and plan shipping.
    3.  **Week 7-12 (Sales Phase):** Use the "Marketing" and "Logistics" tabs. Manage weekly marketing spend, apply discounts to the locked RRP, and manage inventory to meet demand.
    4.  **Week 13-15 (Run-out Phase):** Clear remaining stock through automated markdowns.

### 2.2. Three-Tier Cost Tracking System:
*   The simulation will track and display three distinct unit cost KPIs at different stages of the game:
    1.  **Projected Unit Cost:** An initial estimate visible in the "Design & Pricing" tab, calculated from the average price of materials from both suppliers and a conditional print surcharge.
    2.  **Confirmed Material Cost:** Updates the Projected Unit Cost after procurement contracts are signed, reflecting the exact negotiated material cost.
    3.  **Actual Unit Cost (COGS):** A cumulative, season-to-date performance KPI visible from Week 7. It is calculated weekly as (Total Costs of Goods Sold to Date) / (Total Units Sold to Date). This cost includes the confirmed material cost, plus the specific production and shipping costs for each sold batch, and allocates the total marketing spend across all units sold.

### 2.3. Financial System:
*   **Starting Capital:** £1,000,000.
*   **Credit Limit:** £10,000,000.
*   **Interest Rate:** 0.2% per week applied to the outstanding credit balance.
*   **Cash Flow Waterfall:** At the end of each week, cash flow is calculated in a specific order: Start with cash, add all revenue, subtract all operational expenses, pay interest on any debt, and then use any remaining positive cash flow to automatically pay down the credit principal.
*   **Holding Costs:** A holding cost of **0.3% per week** is applied to the total value of inventory held in the warehouse, including Raw Materials, Work-in-Process, and Finished Goods.

### 2.4. Marketing, Pricing, and Demand Formula:
*   **Demand_it** = Base_i × Seasonality_t × PriceEffect_it × PromoLift_t × Positioning_Effect_i × Design_Appeal_Effect_i
    *   **PriceEffect_it** = (RRP_i / (RRP_i × (1 - Discount_t))) ^ Elasticity_i
    *   **PromoLift_t** = max(0.2, (Marketing_Spend_t / Baseline_Spend)) where Baseline_Spend is a fixed value of **£216,667**.
    *   **Positioning_Effect_i** = 1 + (0.8 / (1 + e^(-(-50) \* (x - 0.20)))) - 0.4 where x = (Student_RRP / H&M_Price) - 1.
    *   **Design_Appeal_Effect_i:** **1.05** if "Print" is selected for the design, **0.95** if not.

### 2.5. Material Management:
*   **Units:** All materials are measured in **units**. 1 unit of material is required to produce 1 unit of a finished product.
*   **Inventory Categories:** The system tracks three categories for each fabric type:
    1.  **On-hand inventory:** Materials currently available in the warehouse.
    2.  **In-transit materials:** Ordered materials with specific arrival dates.
    3.  **Allocated materials:** Materials reserved for scheduled production batches.
*   **Material Availability:** Net Available = On-Hand + Incoming (arriving before production start) - Allocated.

### 2.6. Production Logic & Capacity:
*   **Production Methods:**
    *   **In-house:** Lower cost, longer lead times, constrained by weekly capacity.
    *   **Outsourced:** Higher cost, faster (1 week), unlimited capacity.
*   **Capacity Model:** For a multi-week production run, the batch size is checked against the available capacity **concurrently** for each week of its duration. When the batch is scheduled, it will reserve that amount of capacity in each of those weeks.
*   **Batches:** All manufacturing is planned in batches of 25,000 units.

### 2.7. Procurement, Suppliers, and Dynamic Discounts:
*   **Suppliers:**
    *   **Supplier-1:** Premium quality, 0% defects, higher cost, 2-week lead time.
    *   **Supplier-2:** Standard quality, up to 5% defective materials per shipment, lower cost, 2-week lead time. Defects are discovered upon arrival at the warehouse, before materials are available for production. The cost of defective units is expensed in that week.
*   **Contract Types (Payment Terms):**
    1.  **Full Volume Commitment (FVC):** Sign in Week 1 only. Requires 25% down payment on signing, 75% due on final material delivery.
    2.  **Guaranteed Minimum Commitment (GMC):** For ≥70% of season's requirements. Payment: 40% on signing, 30% on each of two deliveries (Week 3, Week 5). 20% penalty on undelivered value at end of season.
    3.  **Spot Purchases (SPT):** Order any week. Payment on delivery.
*   **Dynamic Volume Discount System:** Discounts are calculated based on the total number of units committed to a single supplier across all materials. High-commitment contracts like FVC and GMC are the primary vehicles for achieving the large volumes required to unlock the highest discount tiers.
    *   **Tier 1:** 100,000 - 299,999 total units -> **3% discount**
    *   **Tier 2:** 300,000 - 499,999 total units -> **7% discount**
    *   **Tier 3:** 500,000+ total units -> **12% discount**
    *   **Single-Supplier Bonus:** Committing to 100% of material needs from one supplier in Week 1 grants their maximum negotiable discount (**15%** for Supplier-1, **10%** for Supplier-2).

### 2.8. Logistics & Timing (Weekly Model):
*   The simulation operates on a weekly cycle. Goods that complete their shipping transit (1 or 2 weeks) by the end of a given week are considered fully merchandised and are available for sale at the **start of the next week**. For example, goods finishing their 1-week expedited shipping in Week 6 will be ready for sale at the start of Week 7.

### 2.9. End-Game Logic & Final Scoring:
*   **Automatic Clearance:**
    *   Automatic progressive markdowns are applied to remaining stock: Week 13 (20% off), Week 14 (35% off), Week 15 (50% off).
    *   The system blocks any sale that would result in a loss (selling below the Actual Unit Cost).
*   **Penalties:**
    *   Any undelivered quantity commitments from GMC contracts incur their penalties in the final week.
    *   A heavy scoring reduction is applied for any unsold inventory remaining after Week 15 (Dead Stock Penalty).
*   **Final Scoring Validation (Ranked Priority):**
    1.  **Service Level:** (Units Served / Total Demand) for Weeks 7-12.
    2.  **Economic Profit:** Total Revenue - All Costs - (10% × Average Capital Employed).
    3.  **Cash Position:** Must be positive at the end of Week 15.
    4.  **Dead Stock Penalty:** Heavy scoring reduction for unsold inventory.

### 2.10. Validation Rules & Error Handling System
*   The system must validate all student decisions before allowing the "Commit Week" action. The validation is split into two categories:

    **A. Errors (Hard Validation - Block Commitment):**
    *   If any of these conditions are met, the "Commit Week" button must be disabled, and a clear error message must be shown to the user explaining the specific issue.
        1.  **Insufficient Materials:** Attempting to schedule a production batch when the Net Available materials are less than the required amount.
        2.  **Inadequate Cash:** Committing to decisions where immediate payments exceed the total available funds (Cash on Hand + Unused Credit).
        3.  **Production Exceeds Capacity:** Scheduling an in-house production batch that is larger than the available capacity in any of the weeks during its production run.
        4.  **Impossible Launch Deadline:** Making a production or logistics choice that results in the product arriving in stores after the start of Week 7.
        5.  **Pricing Below Cost Floor:** Setting a product's RRP or applying a discount that results in the selling price being less than 105% of its Confirmed Material Cost + Production Cost.

    **B. Warnings (Soft Validation - Allow Commitment, but Highlight Risk):**
    *   If any of these conditions are met, the system will allow the student to commit their decisions but will display a prominent, non-blocking warning notification to ensure they are aware of the potential negative consequences.
        1.  **Low Service Level Risk:** If projected demand for a future week significantly exceeds the projected available inventory.
        2.  **Negative Future Cash Flow:** If the current plan projects a negative cash balance in a future week.
        3.  **Aggressive Pricing:** If a product's RRP results in a Positioning_Effect penalty of more than 15%.
        4.  **Zero Marketing Spend:** Committing a week's decisions (during Weeks 7-12) with a marketing budget of £0 for that week.
        5.  **High Inventory Levels:** If the value of on-hand inventory exceeds 3x the projected demand for the next week.

### 2.11. Post-Game Analysis (Final Performance Dashboard):
*   Upon game completion, a comprehensive **Final Performance Dashboard** is generated and saved. This dashboard includes:
    1.  **Headline KPIs:** Final Economic Profit, Final Service Level (%), Final Cash Position, Total Units Sold, Total Lost Sales.
    2.  **Financial Summary:** A pie chart breaking down total costs into Materials, Production, Logistics, Marketing, and Interest.
    3.  **Strategic Choices Summary:** A list detailing key decisions regarding primary supplier, contract mix (FVC/GMC/SPT %), production mix (In-house/Outsource %), and logistics mix (Standard/Expedited %).
    4.  **Performance Over Time:** Line graphs showing the week-by-week progression of Cash on Hand, Inventory Levels (Total Units), and Weekly Sales (Units).

## 3. Technical Architecture & Development Guidance

### 3.1. Guiding Principles:
*   **Separation of Concerns:** The backend server must handle all game logic, calculations, and validation. The frontend is for the UI and user input only.

### 3.2. Core Data Models:

### 3.3. Platform-Specific Recommendations:

## 4. Master Game Data & Parameters

### 4.1. Product Portfolio & Forecasts:
*   Vintage Denim Jacket: 100,000 units
*   Floral Print Dress: 150,000 units
*   Corduroy Pants: 120,000 units

### 4.2. Seasonality Multiplier (Weeks 1-15):
[0.0, 0.20, 0.40, 0.60, 0.80, 1.00, 1.10, 1.20, 1.20, 1.10, 0.80, 0.50, 0.30, 0.10, 0.00]

### 4.3. Price Elasticity Values:
*   Vintage Denim Jacket: -1.40
*   Floral Print Dress: -1.20
*   Corduroy Pants: -1.55

### 4.4. Competitor & Reference Prices (for Positioning_Effect formula):
*   **H&M Prices:** Jacket £80, Dress £50, Pants £60.
*   **High-End Competitors:** Jacket £300-550, Dress £180-210, Pants £190-220.

### 4.5. Material Options & Supplier Pricing (£/unit):
| Fabric | Supplier-1 Price | Supplier-2 Price | Print Surcharge (S1/S2) |
| :--- | :--- | :--- | :--- |
| Selvedge Denim | £16 | £13 | +£3 / +£2 |
| Standard Denim | £10 | --- | +£3 / --- |
| Egyptian Cotton | £12 | £10 | +£2 / +£1 |
| Polyester Blend | £7 | £6 | +£2 / +£1 |
| Fine-Wale Corduroy | £14 | £11 | +£3 / +£2 |
| Wide-Wale Corduroy | £9 | £7 | +£3 / +£2 |
*(All materials have a 2-week lead time)*

### 4.6. Manufacturing Options (Cost & Time):
| Item | In-House Cost | Outsource Cost | In-House Lead | Outsource Lead |
| :--- | :--- | :--- | :--- | :--- |
| Vintage Denim Jacket | £15 | £25 | 3 weeks | 1 week |
| Floral Print Dress | £8 | £14 | 2 weeks | 1 week |
| Corduroy Pants | £12 | £18 | 2 weeks | 1 week |

### 4.7. In-House Manufacturing Capacity Schedule (Units/Week):
| Week # | Capacity | Week # | Capacity |
| :--- | :--- | :--- | :--- |
| 1-2 | 0 | 9-10 | 200,000 |
| 3 | 25,000 | 11 | 100,000 |
| 4 | 50,000 | 12 | 50,000 |
| 5-6 | 100,000 | 13-15 | 0 |
| 7-8 | 150,000 | | |

### 4.8. Logistics & Shipping (Cost & Time):
| Product | Standard Shipping (2 weeks) | Expedited Shipping (1 week) |
| :--- | :--- | :--- |
| Vintage Denim Jacket | £4 | £7 |
| Floral Print Dress | £2.5 | £4 |
| Corduroy Pants | £3 | £6 |

### 4.9. Marketing Campaign Budget & Channels:
*   **Total Promotional Budget:** £1,300,000.
| Marketing Channel | Cost per 1000 Impressions | Conversion Rate |
| :--- | :--- | :--- |
| Social Media | £7 | 0.2% |
| Influencer Marketing| £20 | 0.57% |
| Printed Ads | £8 | 0.2% |
| TV Commercials | £26 | 0.2% |
| Google Ads (search)| £9.5 | 0.27% |
| Google AdSense | £1.5 | 0.042% |

## 5. UI/UX Design & Frontend Specification

### 5.1. Visual Style:
*   **Vision:** A sleek, modern, professional, data-rich dashboard.
*   **Color Palette:**
    *   **Primary:** Deep charcoal (#2C2C2C), white backgrounds.
    *   **Accent:** Zara-inspired gold (#D4AF37).
    *   **Alerts:** Red for warnings (#E74C3C), green for success (#27AE60).

### 5.2. Layout & Structure:
*   **Top Navigation Bar (Fixed):** Must contain [Week X of 15], [Service Level %], [Economic Profit £], [Cash £], and the [COMMIT WEEK] button.
*   **Main Dashboard (3-Column):** Left Sidebar (25%), Center Area (50%), Right Panel (25%).
*   **Dashboard Tabs Order:**
    1.  **Design & Pricing:** For setting RRP and selecting materials/print. Must have a "Add Print?" toggle.
    2.  **Procurement**
    3.  **Production**
    4.  **Logistics**
    5.  **Marketing**
    6.  **Finance**
*   **Responsiveness:** Must adapt gracefully for tablet and mobile screens.

### 5.3. Interactivity & Data Visualization:
*   **Real-Time Calculations:** All KPIs and financial projections must update instantly as the user adjusts inputs.
*   **Interactive Cash Flow Chart:** In the Right Panel, the cash flow projection chart must be interactive. When a user hovers over a data point, a tooltip must appear showing a breakdown of projected inflows and outflows for that week.
*   **Feedback System:** Use elegant notifications for warnings and clear error messages that block commitment for critical failures.
*   **Animations:** Use smooth transitions and real-time number counting animations for KPI updates.

### 5.4. Interactive Tooltip System
*   The entire interface must be enhanced with an interactive tooltip system. When a user hovers their mouse over a key term, KPI, decision input, or chart element, a small, non-intrusive pop-up box must appear providing a concise explanation. This is a critical feature for student learning and usability.

### Definitive List of Required Tooltips:

**A. Top Navigation Bar KPIs:**
*   **Service Level:** (Hover text) "The percentage of customer demand you successfully met during the main sales period (Weeks 7-12). A low level indicates you had stock-outs and lost sales. Target: ≥95%."
*   **Economic Profit:** (Hover text) "Your ultimate measure of profitability. It is your total revenue minus ALL costs, including a 10% annual charge on the capital you employed. This is more comprehensive than simple profit."
*   **Cash on Hand:** (Hover text) "Your current liquid cash available. This does not include your available credit line. All operational expenses are paid from this."

**B. Design & Pricing Tab:**
*   **Recommended Retail Price (RRP):** (Hover text) "Set your product's base selling price. This is a strategic decision based on competitor pricing and your target margin. It will be locked after Week 2."
*   **"Add Print?" Toggle:** (Hover text) "Choose whether to add a print to the fabric. Adding a print increases the material cost but also provides a small boost to customer demand due to its higher design appeal."
*   **Projected Unit Cost:** (Hover text) "An initial estimate of your material cost per unit, based on the average price of your chosen fabric from all available suppliers. Use this for early margin planning."
*   **Confirmed Material Cost:** (Hover text) "The exact material cost per unit based on the contract you signed with a specific supplier. This replaces the 'Projected Cost' after you secure materials."
*   **Actual Unit Cost (COGS):** (Hover text) "Your true, all-inclusive cost for each unit sold. This is a cumulative average that includes material, production, shipping, and allocated marketing costs. This is your key metric for tracking overall cost efficiency."

**C. Procurement Tab:**
*   **Supplier-1:** (Hover text) "A premium supplier known for high-quality materials (0% defect rate) and reliability, but at a higher cost."
*   **Supplier-2:** (Hover text) "An economy supplier offering lower prices but with variable quality, resulting in up to a 5% defect rate on shipments. You must plan for potential material loss."
*   **Full Volume Commitment (FVC):** (Hover text) "Contract Type: High-risk, high-reward. Requires a large upfront payment for all materials in Week 1. This is the best way to achieve the highest possible volume discounts."
*   **Guaranteed Minimum Commitment (GMC):** (Hover text) "Contract Type: A balanced option. Commit to buying at least 70% of your total needs to secure a good discount, with payments spread across deliveries."
*   **Spot Purchases (SPT):** (Hover text) "Contract Type: Maximum flexibility, highest cost. Order any amount of material, any week, with no commitment. You will pay the full list price with no discounts."
*   **Volume Discount:** (Hover text on the discount % field) "A dynamic discount applied to your material costs based on the total volume you commit to a single supplier. Larger commitments unlock higher discounts."

**D. Production & Logistics Tabs:**
*   **In-House Production:** (Hover text) "Your own manufacturing facility. It is cheaper per unit but has limited weekly capacity and longer production lead times (2-3 weeks)."
*   **Outsourced Production:** (Hover text) "A third-party manufacturer. It is more expensive per unit but offers unlimited capacity and very fast lead times (1 week). Use this to quickly respond to demand or meet tight deadlines."
*   **In-House Capacity:** (Hover text on the capacity gauge) "The maximum number of units your in-house facility can produce each week. You cannot schedule more production than the available capacity."
*   **Standard Shipping:** (Hover text) "Lower cost shipping option with a 2-week transit time."
*   **Expedited Shipping:** (Hover text) "A premium, higher-cost shipping option with a 1-week transit time. Use this to get products to market faster."

**E. Marketing Tab:**
*   **Weekly Discount %:** (Hover text) "Apply a temporary discount to your locked RRP for one week. This is a powerful tool to boost sales, but it will lower your profit margin for that week."
*   **Marketing Spend:** (Hover text) "Allocate your advertising budget for this week. Higher spending increases customer awareness and directly boosts demand. Spending close to the seasonal average is most efficient; spending too little will hurt sales, while spending excessively offers diminishing returns."

**F. Financial Concepts:**
*   **Holding Costs:** (Hover text on this line item in a financial report) "The cost of storing unsold inventory in your warehouse (0.3% of inventory value per week). High holding costs are a sign of inefficient inventory management."
*   **Outstanding Credit:** (Hover text on this KPI) "The amount of money you have currently borrowed from your credit line. You are charged 0.2% interest on this balance every week."