# SHAN POS SYSTEMS — සම්පූර්ණ Feature Guide

මෙය Netlify Hosting + Netlify Functions + Supabase PostgreSQL සඳහා සකස් කළ **full testing build** එකකි. Firebase, Firestore, Google Apps Script, Google Sheets සහ Google Drive final runtime එකේ භාවිතා නොවේ. `legacy/` folder එකේ තිබෙන්නේ පැරණි original source archive එක පමණි.

> වැදගත්: මෙය testing build එකකි. පහත දේවල් source/UI තුළ ඇතුළත් වේ. සැබෑ test database එකක් සමඟ sales, stock, permissions, license, support සහ backup flows එකින් එක test කරලා පමණක් production domain එකට යන්න.

## 1. Login, Master සහ Accounts

- First-time Master setup: deploy කළ පසු ඔබගේම Master username සහ 6-digit PIN හදයි.
- පැරණි hard-coded `shan08 / 8888` Master login එක භාවිතා නොකරයි.
- My Profile හරහා username, PIN සහ profile photo වෙනස් කිරීම.
- Master Owner, System Admin, Customer Super Admin, Admin, Area Manager, Branch Manager, Manager, Supervisor, Cashier, User සහ Support වැනි roles.
- Account Create වෙනම management feature එකකි.
- Masterට එක් එක් account එකට වෙන වෙනම permissions දීමට සහ අඩු කිරීමට හැකිය.
- `☑ Locked / No Access`, `☐ Access` semantics සඳහා central permissions UI.
- Parent account එකකින් permission අඩු කළොත් lower accounts වෙතත් ඒ restriction යා යුතු hierarchy logic.

## 2. Master, Customer සහ Support link separation

- Master workspace එක customer හෝ Support workspace එකක් නොවේ.
- සෑම customer කෙනෙකුටම unique software/link code සහ `/shop/<code>` link එකක්.
- සෑම customer workspace එකකම stock, sales, settings, accounts සහ records වෙනම tenant namespace එකක save වේ.
- Customer A ට Customer B ගේ data බලන්න හෝ edit කරන්න නොහැක.
- Support Team එක අනිවාර්ය නැත. Masterට අවශ්‍ය වූ විට පමණක් Support member create කළ හැක.
- සෑම created Support member කෙනෙකුටම තමන්ගේම personal workspace/POS සහ unique link එකක්.
- Support A ට Support B ගේ personal workspace data බලන්න නොහැක.
- Support memberට customer data default ලෙස නොපෙනේ.

## 3. Customer support workflow සහ Master control

- Customerට Request Support option එකෙන් error, change හෝ help request එකක් යැවිය හැක.
- Customer request එක Master notification queue එකට record වේ.
- Support Team සිටී නම් ඒ අයට notification-only item එකක් පෙනේ.
- Notification එකෙන් Support memberට customer stock, sales, customers හෝ private data access ලැබෙන්නේ නැහැ.
- Master පමණක් තෝරාගත් Support member කෙනෙකුට temporary access දෙයි.
- Temporary access සඳහා customer, Support member, කාල සීමාව සහ permissions/scope තෝරයි.
- Temporary support session එක expire වේ; Masterට එය stop/revoke කළ හැක.
- එවැනි temporary session එකකින් කරන API/system actions Master notification/audit queue එකට report වේ.
- Support memberට customer account create කිරීම, SHAN license key generate කිරීම හෝ SHAN software sale authority default ලෙස නැත.

## 4. Customer software creation සහ branches

- Masterට customer software/workspace create කිරීම.
- Unique Software / Link Code Master විසින් දීම.
- Business Type → Business Details → Branch Count workflow.
- Sole Proprietorship / individual business සඳහා branch creation නැත.
- Branch-enabled business සඳහා minimum 4 branches logic.
- Standard branch capacity 25 දක්වා.
- 26–100 branches සඳහා separate payment confirmation සහ explicit Master approval අවශ්‍ය වේ.
- Branch code unique විය යුතුය.
- Customer Super Admin branch request එක initiate කරයි; final approval Master control යටතේය.
- Branch manager/area manager roles branch-enabled businesses සඳහා පමණක් ලබාදීමට සැලසුම් කර ඇත.

## 5. Licenses, activation සහ pricing

- License tiers 7:
  - First Purchase — 547 days / 18 months
  - Normal — 365 days
  - VIP — 1,825 days
  - VIP Plus — 3,650 days
  - VIPS — 9,125 days
  - Super VIP — 12,775 days
  - Super VIP Premier — Unlimited
- First Purchase එක එක් customer software එකකට එක් වතාවක් පමණි.
- First Purchase ඉවර වූ පසු පමණක් subsequent packages ලබාගැනීමේ rule.
- Masterට each package සඳහා Normal Price, Discount Price සහ Discount Active වෙන වෙනම save කළ හැක.
- Discount active වූ විට customerට normal price, discount percentage සහ final price පෙන්වයි.
- Customer license request → payment amount → payment slip → Master review → new key generation flow.
- License key එක customer software එකට bind කරයි.
- Renewal / re-license එකකට අලුත් key එකක්.
- Replacement key request සඳහා old key + customer email අවශ්‍යයි.
- Replacement price current package price එකේ 50% ලෙස calculate කරයි; Master approval අවශ්‍යයි.
- Customer link activation key සහ expiry check.

## 6. Device / machine / reinstall limits

- Browser/device identifier එක භාවිතා කර device/machine usage tracking කිරීමට logic තියෙනවා.
- Standard customer capacity: 25 machines සහ 3 reinstallation/transfer uses.
- Branch-enabled customer capacity: 100 machines සහ 25 reinstallation/transfer uses.
- සටහන: සාමාන්‍ය browser web app එකකට ඇත්ත hardware MAC address එක කියවන්න browser security ඉඩ දෙන්නේ නැත. ඒ නිසා මේ build එක browser device ID/activation limit භාවිතා කරයි. Real MAC binding සඳහා පසුව Windows desktop helper/app එකක් අවශ්‍ය වේ.

## 7. POS sales සහ billing

- New bill / sales billing.
- Bill history සහ print/reprint history data.
- Returns / related bill workflow.
- Invoice creation සහ invoice stock handling.
- Sale items, quantities, cost total, selling total සහ profit-related data.
- Barcode update/lookup tools.
- Customer phone/customer-linked billing.
- Multiple payment methods: cash, credit, cheque, card, bank transfer, wallet, Koko සහ online payment.

## 8. Stock සහ product management

- Product create/add/update.
- Product ID, name, cost price, selling price, stock quantity, category, status සහ track-stock fields.
- Stock lookup.
- Invoice Stock සහ normal sale stock separation/support.
- Stock purchase / goods purchase workflow.
- Supplier/company-linked stock purchases.
- Barcode update.
- Stock quantity, order and new-bill/invoice permission keys.
- Restaurant, mobile and general stock views සඳහා grouping logic.

## 9. Customers, credit සහ suppliers

- Customer records.
- Credit customers.
- Credit ledger.
- Customer contact data සහ purchase/billing history use cases.
- Suppliers management.
- Purchases records.
- Quotations.
- Cheque receipts.

## 10. Payments, finance සහ business records

- Payment receipts.
- Wallets, banks, billers, bank services සහ service charges.
- Bank/finance ledger.
- Finance assets.
- Loans සහ interest-loan payments.
- Company details/settings.
- Job notes / repair/service jobs.
- Software update notices.

## 11. Special business modules

- Restaurant / food menu: category, item, type, cost, selling price, status සහ notes.
- CCTV installation/service applications: customer, package, quantity, amount, advance සහ balance.
- Mobile service applications.
- Bank/finance module.
- Job notes and service workflow.

## 12. Reports, backup සහ restore

- Bill history and print history data.
- Financial/stock-related reports through retained POS report modules.
- POS backup export and inspection.
- Simple invoice-stock backup/restore.
- Restore undo support.
- Files and backup payloads Supabase-backed `app_files` storage layer සඳහා mapped කර ඇත.
- Application state/document persistence Supabase tables: `documents`, `app_kv`, `app_cache`, `app_files`, `audit_log`, `master_notifications`.

## 13. Database, Netlify සහ deployment files

- `netlify.toml`: public site and Netlify Functions configuration.
- `netlify/functions/api.js`: public action allowlist සහ authentication gate.
- `netlify/functions/runtime-prelude.js`: Supabase persistence adapter.
- `netlify/functions/Code.gs`: retained POS business logic, Node/Netlify runtime තුළ execute වන migrated compatibility code.
- `netlify/functions/security-overrides.js`: Master bootstrap, authenticated API control, Support workflow, notification and audit corrections.
- `supabase/schema.sql`: test/production database schema.
- `.env.example`: required server-side variables.
- `docs/TESTING_DEPLOYMENT.md`: custom domain නැති testing deployment guide.
- `docs/SECURITY_AND_WORKSPACE_RULES.md`: Master/Customer/Support separation rules.

## 14. Desktop use while testing

- `manifest.webmanifest` සහ `sw.js` ඇතුළත් PWA files තියෙනවා.
- Netlify test link එක Chrome/Edge තුළ open කර Install option එකෙන් Windows desktop/Start menu app එකක් වගේ install කළ හැක.
- Sales/stock/licenses/data සඳහා internet connection අවශ්‍යයි; Supabase database එක single source of truth වේ.

## 15. Test කරන විට අනිවාර්යයෙන් බලන්න

1. Master first-time setup සහ PIN change.
2. Customer A / Customer B data separation.
3. Optional Support account create නොකළත් Master/customer work කිරීම.
4. Support workspace A / B separation.
5. Customer support request → Master notification → optional Support notification.
6. Master temporary approval නොමැති Support memberට customer data නොලැබීම.
7. Temporary Support action → Master report/notification.
8. Product add/edit, stock update, sale, bill, invoice, payment, backup/restore.
9. All license tiers, discount, First Purchase, replacement key, expiry and machine limits.
10. Branch 4–25 and approval-required 26–100 workflows.

