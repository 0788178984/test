# Uganda Supermarket Manager — Comprehensive User Guide

**Production app:** [https://supermkt-n1nf.onrender.com/](https://supermkt-n1nf.onrender.com/)  

This guide explains every major screen, term, and workflow in plain language. It matches the **current production codebase** (June 2026).

**In the app:** screens show titles, fields, and actions only — open **Help → User manual** in the top menu bar to read this guide inside the app.

---

## Table of contents

1. [Getting started](#1-getting-started)
2. [Roles and permissions](#2-roles-and-permissions)
3. [Feature checklist (your requested items)](#3-feature-checklist-your-requested-items)
4. [Dashboard](#4-dashboard)
5. [Point of Sale (POS)](#5-point-of-sale-pos)
6. [Products and pricing](#6-products-and-pricing)
7. [Inventory, stock expenditure, and projected profit](#7-inventory-stock-expenditure-and-projected-profit)
8. [Daily expenses](#8-daily-expenses)
9. [Reports and data analysis](#9-reports-and-data-analysis)
10. [Customers, suppliers, and users](#10-customers-suppliers-and-users)
11. [Mobile money agent float](#11-mobile-money-agent-float)
12. [Settings and multi-store](#12-settings-and-multi-store)
13. [Glossary — all terms and meanings](#13-glossary--all-terms-and-meanings)
14. [Known limitations](#14-known-limitations)

---

## 1. Getting started

### Login

1. Open the app URL in a browser (Chrome recommended).
2. Enter your **store code** (business code) — each branch/store has its own code.
3. Sign in using either:
   - **PIN login** — choose role (Admin / Manager / Cashier) and enter your 4-digit PIN.
   - **Web login** — email and password (usually for managers and admins).

After login you land on the **Dashboard**. Your store name and code appear at the top.

### Install as phone app (PWA)

On Android or iPhone, use the browser menu **Add to Home Screen** / **Install**. The app works better offline after installation.

### Time zone

All “today”, “yesterday”, and daily totals use **East Africa Time (Africa/Kampala)**. Sales and reports reset at local midnight, not UTC.

---

## 2. Roles and permissions

| Role | What they can do |
|------|------------------|
| **Admin** | Everything: users, settings, products, prices, stock, reports, expenses, void sales, delete customers/products |
| **Manager** | Products, prices, stock, reports, expenses, suppliers, team messages, void sales — **no** user management or store settings |
| **Cashier** | POS checkout, view inventory, customers, today’s own sales on dashboard, mobile money agent transactions |

**Price changes:** Only **Admin** and **Manager** can open the **Products** page and change buying or selling prices. Cashiers sell at the prices already set in the system.

**Product delete:** Only **Admin** can delete products.

---

## 3. Feature checklist (your requested items)

| Requested feature | Status | Where to find it |
|-------------------|--------|------------------|
| **Projected profit if sold** | ✅ Implemented | **Inventory → Overview** — “Projected profit if sold” card; also per category and per product tables |
| **Wholesale sale (% off shelf price)** | ✅ Implemented | **POS → Wholesale sale** (admin/manager): enter % off, apply — normal checkout, receipt labeled `Wholesale (X% off)` |
| **Only admin/manager can change prices** | ✅ Implemented | **Products** page (admin/manager only); cashiers cannot edit prices |
| **Daily organisation by category** | ✅ Partially | **Inventory → By category** table; **Expenses** filter by category per day; **POS** category filters |
| **Total stock expenditure (daily / per day)** | ✅ Partially | **Total stock expenditure** = current stock value at cost (snapshot). **Daily** stock spending = **Inventory → Purchases** tab, grouped by Today / Yesterday / date |
| **Stock added today recorded with expenditure** | ✅ Implemented | **Inventory → Purchases** — each restock shows date, time, quantity, cost, and expected revenue |
| **Product sales recorded daily** | ✅ Implemented | Every sale is timestamped; **Dashboard → Today’s Sales**; **Reports → Daily Sales** |
| **Transaction statement with dates and times** | ✅ Partially | Dashboard and Purchases show **date + time**; PDF export shows **date** on each receipt line (time in database, not always on PDF) |
| **Return policy / void sale (admin & manager)** | ✅ Implemented | **Returns & voids** — void receipt restores stock, reverses loyalty, excludes from reports |

---

## 4. Dashboard

The dashboard is your **today-at-a-glance** screen.

| Card / section | Meaning |
|----------------|---------|
| **Today's Sales** | Number of completed receipts today |
| **Today's Revenue** | Total money collected from sales today (UGX) |
| **Today's Expenses** | Money recorded as going out today (admin/manager/cashier with access) |
| **Total Products** | Active products in your catalogue |
| **Low Stock Items** | Products at or below minimum stock level |
| **Total Customers** | Customers on file |
| **Today's Sales table** | Last receipts today: receipt #, customer, cashier, amount, payment method, **time** |

Use **View in Reports** for fuller daily analysis.

---

## 5. Returns & voids (return policy)

**Menu:** Returns & voids (admin & manager only)

Use this when a customer returns goods or a sale was recorded wrongly and must be **cancelled in the system**.

### What void does

| Effect | What happens |
|--------|----------------|
| **Sale status** | Changes from `completed` → `voided` |
| **Stock** | All items on that receipt are **added back** to inventory |
| **Inventory log** | A **return** adjustment is recorded (see Inventory → Adjustments) |
| **Reports** | Revenue and profit for that day **drop** — voided sales are excluded |
| **Loyalty** | Points and spend from that sale are **reversed** if a customer was attached |
| **Cash/MoMo** | You refund the customer **manually** — the app reverses the record only |

### How to void a sale

1. Open **Returns & voids**.
2. Pick the **sale date** and find the receipt (or search by receipt #).
3. Click **View** or **Void / return**.
4. Enter a **return reason** (required) and confirm.

**Cashiers cannot void sales.** Only admin or manager.

**Partial returns** (only some items on a receipt) are not supported yet — void is **full receipt only**.

---

## 6. Point of Sale (POS)

### Workflow

1. Scan barcode or search product name.
2. Choose quantity (supports kg/L for weight products).
3. Optionally attach a **customer** (for loyalty points).
4. **Retail and cashier sales have no discount by default** — customer pays full shelf price unless you explicitly apply wholesale or another discount.
5. **Admin/manager only:** under **Order totals**, use **Wholesale sale** — enter % off (e.g. 10) and tap **Apply** (nothing is pre-filled or auto-applied). Receipt is labeled **Wholesale**.
6. Other **discounts** (cashiers: max 5% on retail only; cashiers cannot use wholesale).
7. **Proceed to checkout** → choose payment (Cash, MTN MoMo, Airtel Money, etc.).
8. Confirm → receipt prints or can be sent.

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| **F2** | Focus barcode field |
| **F9** | Open checkout (when cart is valid) |

### Terms on POS

| Term | Meaning |
|------|---------|
| **Subtotal** | Sum of line items before discount and tax |
| **Discount** | Amount taken off the bill |
| **Wholesale sale** | Retail checkout with a set **percentage off** all shelf prices; only admin/manager can apply; stored as discount reason `Wholesale (X% off)` |
| **Wholesale %** | Percentage decrement from selling price (1–100%) |
| **VAT / Tax** | 18% VAT applied per store rules |
| **Total** | Amount the customer pays |
| **Amount paid** | Cash handed over (cash sales) |
| **Change** | Cash returned to customer |
| **Receipt #** | Unique invoice number, format `INV-YYYYMMDD-000001` (per store, per day) |

Each completed sale is stored with **date and time** and reduces stock automatically.

---

## 7. Products and pricing

**Menu:** Products (admin & manager only)

| Field | Meaning |
|-------|---------|
| **Name** | Product name on receipt and reports |
| **Category** | Group for filtering and inventory breakdown (e.g. Food, Beverages) |
| **SKU** | Internal stock-keeping code |
| **Barcode** | Scanned at POS |
| **Unit** | piece, kg, L, etc. |
| **Buying price** | What you pay supplier (cost per unit) — used for profit and stock expenditure |
| **Selling price** | What customer pays at POS |
| **Current stock** | Quantity on hand |
| **Minimum stock** | Alert threshold for low-stock list |
| **Expiry date** | Optional; used for expiring-product alerts |
| **Supplier** | Linked supplier record |
| **Active** | Inactive products cannot be sold |

When you **create a product with opening stock**, the system records an **initial stock** adjustment with the buying price as cost — it appears under **Inventory → Purchases**.

**Restocking** existing products (via API/adjustments) also logs purchase cost per unit when provided.

---

## 8. Inventory, stock expenditure, and projected profit

**Menu:** Inventory (all staff can view; stock changes need manager/admin permissions on API)

### Overview tab

| Metric | Meaning |
|--------|---------|
| **Total stock available** | Sum of all units on hand |
| **Products with stock** | Count of SKUs with quantity &gt; 0 |
| **Low stock items** | At or below minimum level |
| **Expired (with stock)** | Past expiry date but still has quantity |
| **Expiring soon (30 days)** | Expiry within next 30 days |
| **Total stock expenditure** | Current stock × **buying price** (money tied up in inventory at cost) |
| **Potential sales revenue** | Current stock × **selling price** (if everything sold at shelf price) |
| **Projected profit if sold** | Potential revenue minus stock expenditure (estimated gross profit if all current stock sells) |
| **Recorded stock purchases** | Lifetime sum of positive stock adjustments × cost (historical buying recorded in system) |

### By category table

Shows each **category** with units on hand, stock spend (cost), value if sold, and **projected profit** per category.

### Product detail table

Same figures **per product**: buy/sell per unit, stock spend, if all sold, profit if sold.

### Purchases tab (daily stock expenditure log)

Stock **added** to the shop is grouped by day:

- **Today** / **Yesterday** / calendar date
- Per line: product, **date & time**, quantity, type (restock, initial stock, etc.), user
- **Cost** (expenditure for that line)
- **Expected** revenue if those units sell at current selling price

This answers: *“What did we buy / add to stock today and how much did it cost?”*

### Other tabs

| Tab | Purpose |
|-----|---------|
| **Low Stock** | Reorder alerts |
| **Expiring** | Products nearing or past expiry |
| **Adjustments** | All stock movements (in/out) with reason, user, date |

---

## 9. Daily expenses

**Menu:** Daily Expenses (admin & manager)

Money **going out** that is not stock purchase (rent, transport, salaries, etc.).

| Term | Meaning |
|------|---------|
| **Title** | Short description |
| **Category** | rent, utilities, salaries, transport, supplies, maintenance, marketing, tax, other |
| **Amount** | UGX spent |
| **Payment method** | cash, mobile_money, bank, other |
| **Expense date** | Which calendar day the expense belongs to |
| **Receipt ref** | Optional reference number |

Filter by **date** and **category** to see daily totals. Summary shows count and total for the selected day.

> **Note:** Stock purchases tracked under **Inventory → Purchases** are separate from **Daily Expenses**, though you may also record “Supplies & stock” in expenses for non-inventory payments.

---

## 10. Reports and data analysis

**Menu:** Reports, Data analysis (admin & manager)

### Reports tabs

| Report | What it shows |
|--------|----------------|
| **Daily Sales** | Sales count, revenue, profit, average sale for one day |
| **Monthly Sales** | Month totals + day-by-day breakdown |
| **Annual** | Year revenue, expenses, net; monthly breakdown |
| **Profit & Loss** | Revenue, cost of goods, gross profit, margin % |
| **Best Sellers** | Top products by quantity and revenue |
| **Cashier Performance** | Sales per cashier |

Use **Today** / **Yesterday** quick buttons on Daily Sales. Export **PDF** or **Excel** for sharing.

### Data analysis

Charts for selected day: revenue by hour, payment mix, monthly trend, top products.

### Sales transaction list

- **Dashboard:** today’s recent sales with **time**
- **PDF sales export** (via export API): receipt #, **date**, customer, cashier, amount, payment — suitable for a daily transaction statement
- Full line-by-line transaction browser in the Reports UI is limited to summary cards; use Dashboard + PDF export for detailed lists

---

## 11. Customers, suppliers, and users

### Customers

Names, phone, loyalty points, visit history. Points earned automatically on linked sales.

### Suppliers

Vendor contact details linked to products (admin/manager).

### Users (admin only)

Create managers and cashiers, assign PINs, deactivate accounts.

---

## 12. Mobile money agent float

**Menu:** Mobile money (also section in POS)

For **MoMo agent** business (withdrawals, deposits, airtime) — separate from customer checkout payments.

| Term | Meaning |
|------|---------|
| **Open float** | Manager/admin assigns starting cash + e-float to a cashier for the day |
| **Agent transaction** | withdrawal, deposit, airtime, bill payment, send money |
| **Reconciliation** | End-of-day balancing of physical cash vs system |

---

## 13. Settings and multi-store

### Store settings (admin)

Store name, address, phone, TIN, tax rate, receipt footer, notification hooks.

### Multi-store / branches

Each store has a unique **store code**. Data is isolated per store — sales, products, and reports never mix between codes.

**Wholesale pricing** is done at **POS** (percentage off shelf prices), not as a separate product price field. There is **no** automatic stock transfer between store codes — each store remains separate.

---

## 14. Glossary — all terms and meanings

| Term | Definition |
|------|------------|
| **UGX** | Uganda Shillings — all currency in the app |
| **Store code** | Login code identifying your business/branch |
| **Business ID** | Internal tenant key (automatic; users never type this) |
| **Buying price** | Unit cost from supplier |
| **Selling price** | Unit price at POS |
| **Stock expenditure** | Value of current inventory at buying price |
| **Projected profit if sold** | Estimated profit if all current stock sells at selling price |
| **Potential sales revenue** | Current stock × selling price |
| **Lifetime / recorded stock purchases** | Historical cost of all stock-in adjustments |
| **Restock** | Positive stock adjustment when new goods arrive |
| **Stock adjustment** | Any change to quantity (in or out) with audit trail |
| **Initial stock** | Opening quantity when product first created |
| **Low stock** | current_stock ≤ minimum_stock |
| **Category** | Product grouping (Food, Beverages, …) |
| **Receipt # / Sale number** | Unique invoice ID per sale |
| **Completed sale** | Successful checkout; counts in reports |
| **Void sale** | Cancelled sale (manager/admin); stock restored |
| **Subtotal** | Pre-discount item total |
| **Gross profit** | Revenue minus cost of goods sold |
| **Profit margin** | Gross profit ÷ revenue × 100% |
| **Cost of goods (COGS)** | Sum of buying_price × quantity sold |
| **Net cash (daily report)** | Revenue minus expenses for the day |
| **Loyalty points** | Customer reward currency from purchases |
| **Sync status** | Offline changes waiting to upload to cloud |
| **PWA** | Progressive Web App — installable web version |
| **PIN** | 4-digit cashier/manager/admin quick login |
| **JWT session** | Secure login token (expires after hours of inactivity) |
| **Wholesale sale** | POS sale with % discount off shelf prices; label on receipt; admin/manager only |
| **Wholesale %** | Percentage off selling price for that receipt (e.g. 15% → customer pays 85% of shelf total) |

---

## 15. Known limitations

1. **Wholesale** is a **percentage discount at POS**, not a separate stored wholesale price per product.
2. **Total stock expenditure** on Overview is a **current snapshot**, not “spent today only”; use **Purchases** tab for daily stock-in spending.
3. **Reports → Daily Sales** shows totals, not every receipt line; use **Dashboard** or **PDF export** for transaction lists.
4. **PDF sales table** shows date per sale; for exact time, use Dashboard or database export.
5. **Render hosting:** ensure database is on persistent storage or PostgreSQL (`DATABASE_URL`) so data survives redeploys — see `docs/DEPLOYMENT_AND_USAGE.md`.

---

## Quick reference — where do I…?

| Task | Go to |
|------|--------|
| Sell to customer | POS |
| Change selling price | Products (admin/manager) |
| Sell at wholesale (% off) | POS → Wholesale sale (admin/manager) |
| Return / void a sale | Returns & voids (admin/manager) |
| See profit if all stock sells | Inventory → Overview |
| See what stock we bought today | Inventory → Purchases |
| See sales today with time | Dashboard → Today's Sales |
| Daily sales totals | Reports → Daily Sales |
| Record rent / transport cost | Daily Expenses |
| Stock by category | Inventory → Overview → By category |
| Add cashier | Users (admin) |
| Another branch's data | Log out → login with that branch's store code |

---

*Document version: June 2026 — Uganda Supermarket Management System*
