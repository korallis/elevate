# Canonical Data Model (Initial Draft)

Purpose: unify schemas from Salesforce, Xero, Spendesk, and Snowflake sources into a consistent set of dimensions and facts for analytics and AI grounding.

## Core Dimensions

- dim_date: date_key, date, week, month, quarter, year, is_fiscal
- dim_org: org_id, org_name, timezone, currency
- dim_division: division_id, org_id, division_name
- dim_user: user_id, org_id, division_id, email, role
- dim_account: account_id, org_id, external_ids (salesforce_account_id, xero_contact_id), account_name, type (customer/vendor), industry, region
- dim_product: product_id, org_id, sku, name, category, family
- dim_vendor: vendor_id, org_id, name, spendesk_merchant_id, xero_contact_id
- dim_employee: employee_id, org_id, department, manager_id, spendesk_user_id
- dim_card: card_id, org_id, spendesk_card_id, type (virtual/physical), last4
- dim_gl_account: gl_id, org_id, code, name, type (asset/liability/income/expense)

## Facts (Examples)

- fct_sales_order: date_key, org_id, account_id, product_id, quantity, net_amount, tax_amount, currency, source (sf/snowflake)
- fct_revenue: date_key, org_id, account_id, product_id, net_revenue, ar_balance, deferred_revenue, currency
- fct_invoice: date_key, org_id, vendor_id, gl_id, gross_amount, tax_amount, status, due_date, xero_invoice_id
- fct_payment: date_key, org_id, vendor_id, method, amount, currency, cleared_at
- fct_expense: date_key, org_id, employee_id, vendor_id, card_id, category, amount, tax_amount, receipt_present, spendesk_tx_id
- fct_journal: date_key, org_id, gl_id, debit, credit, currency, journal_id, xero_journal_id

## Mapping Guidance (Illustrative)

- Salesforce
  - Account → dim_account (type=customer)
  - Opportunity/Order → fct_sales_order (staging includes probability, stage; semantic model defines measure logic)
  - Product2 → dim_product

- Xero
  - Contacts (isSupplier/isCustomer) → dim_vendor or dim_account
  - Invoices/Bills → fct_invoice
  - Payments → fct_payment
  - Accounts (Chart of Accounts) → dim_gl_account
  - Journals → fct_journal

- Spendesk
  - Merchants → dim_vendor (spendesk_merchant_id)
  - Cards → dim_card
  - Expenses/Transactions → fct_expense (with receipt_present flag)

## Measures & Calculations (Examples)

- Sales: Total Net Sales, Avg Deal Size, Win Rate (semantic measure from stages)
- Finance: AR Balance, DSO, Net Revenue, Gross Margin (requires COGS mapping)
- Spend: Total Spend, Spend by Category, Policy Breaches, Receipt Compliance %

## Notes

- Mapping is versioned per org; AI proposes mappings which must be approved.
- Slowly Changing Dimensions (SCD2) for key dims (account, vendor, product) where history is needed.
- Currency conversion policy defined at org level; stored rates or live via warehouse.

