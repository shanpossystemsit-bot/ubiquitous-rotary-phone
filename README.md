# SHAN POS SYSTEMS — Final Netlify + Supabase Build

## Final production architecture
**Browser → Netlify Hosting → Netlify Function → Supabase PostgreSQL**

The deployable application under `public/` and `netlify/` has no runtime dependency on Google Apps Script, Firebase/Firestore, Google Sheets, Google Drive, or Google APIs. The old Google Apps project is preserved separately under `legacy/` exactly so it is not deleted or overwritten; it is archival/source-preservation material only and is **not part of the final runtime architecture**.

## Supabase persistence
The final runtime stores persistent POS/customer state in Supabase PostgreSQL through the `documents` table, namespaced by shop/workspace. Product, stock, customer, sales/bill, invoice, quotation, payment, supplier, loan, restaurant, mobile-service, CCTV, reports, permissions, licensing and management records are persisted through this storage layer. Backup payloads and uploaded binary files are stored in Supabase-backed `app_files`; application key/value state and cache state use `app_kv` and `app_cache`.

## Deploy
1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. In Netlify, configure server-side environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `MASTER_BOOTSTRAP_TOKEN` — a private random value of at least 24 characters, used once to create the first Master Owner. Do not commit or share it.
4. Deploy the project root to Netlify.
5. Netlify publishes `public/` and functions from `netlify/functions/`.
6. Test the Master login and then create a test customer software link.

On the first visit, use **First-time Master setup** to create your own Master username and PIN. The old hard-coded Master credentials are deliberately disabled. After initial setup, change the Master PIN through **My Profile**; the bootstrap action rejects all later attempts.

The service-role key is server-only. It is not placed in `public/index.html` or any browser bundle.

## Test first, then production

Use `docs/TESTING_DEPLOYMENT.md` for the testing setup. It has no application-enforced expiry and uses a temporary Netlify test URL plus a separate Supabase testing project, so no custom domain is needed before production launch.

## Routing
`public/_redirects` keeps customer workspace links such as `/shop/<software-code>` working as SPA routes.

## Desktop installation for the testing period

This package includes a Progressive Web App (PWA) manifest and service worker. After the test deployment is open in Chrome or Edge on Windows, choose **Install SHAN POS SYSTEMS** from the browser's install icon/menu. It opens as a separate desktop application and can be pinned to Start/taskbar. The app shell can open offline, but sales, stock, license and permission data require an internet connection because Supabase remains the single source of truth.

## Preserved POS scope
The existing POS business logic is retained and runs through a Supabase-backed data-table compatibility layer. Existing modules/features that were not explicitly removed remain included, including sales, stock, invoices, quotations, payments, customers/credit management, purchases, suppliers, restaurant, mobile service, CCTV, loans, reports, barcode/sticker tools, bank/finance, job notes, permissions and backup/restore.

## Requirements implemented
- Account Create as a separate management category.
- Business Type first; business name/details next; branch count depends on business type.
- Sole Proprietorship: no branch creation and 25-machine capacity.
- Branch-enabled business: minimum 4, standard maximum 25; 26–100 requires Master approval and separate payment.
- Unique Master-entered Software / Link Code and customer-specific `/shop/<code>` workspace.
- Trial/Demo from 7 days up to 90 days.
- Customer-only company logo editing; SHAN POS SYSTEMS branding remains protected.
- Central permissions covering Home Tiles, Pages, Modules, Sections, Functions, Access Paths, Category 3, Category 4 and future features. `☑` means locked; `☐` means access allowed.
- Customer role hierarchy including Super Admin, Area Manager, Branch Manager, Cashier and lower roles, with branch/area roles restricted to branch-enabled businesses.
- Master-only controls remain separate from customer Super Admin authority.
- Category 3 critical support restrictions: support cannot create customer accounts, generate SHAN license keys or sell/issue SHAN software.
- Category 4 gives each support member an isolated personal workspace and unique link.
- Customer data is unavailable to support by default; temporary support access is Master-authorized, limited and time-bound.
- Support Team creation is optional and Master-only. The Master software works without any Support member.
- Every customer request creates a Master workflow notification and a Support notification only; no customer access is granted by a notification.
- Every action made through a temporary customer Support session is reported to the Master notification/audit queue.
- Seven exact license tiers: First Purchase 547 days; Normal 365 days; VIP 1,825 days; VIP Plus 3,650 days; VIPS 9,125 days; Super VIP 12,775 days; Super VIP Premier Unlimited.
- First Purchase is one-time only; later packages become available after it expires.
- Master stores Normal Price and Discount Price separately and controls Discount Active per package.
- Customer-facing discount display shows normal price, discount percentage and final price only when discount is active.
- License request → payment details → payment slip → Master review → unique customer-bound key.
- New key on every renewal/relicense.
- Standard capacity: 25 machines / 3 reinstallation-transfer uses. Branch-enabled: 100 machines / 25 reinstallation-transfer uses.
- Replacement key requires old key + customer email and is priced at half of the current package price, subject to Master approval.
- Branch creation is Super-Admin initiated but support-assisted and Master-controlled for final activation.
- Existing POS features are preserved; no unrequested feature removal.

## Original project preservation
The original Google Apps project files are under `legacy/` and are not used by Netlify at runtime. This is intentional: preservation is required without making the legacy backend a production dependency.

## Master, Customer and Support separation

See `docs/SECURITY_AND_WORKSPACE_RULES.md`. Support Team members are optional and can only be created by the Master Owner. Each created Support member receives a separate workspace and link. Customer requests notify Master and Support without providing customer access. The Master Owner alone can issue a time-limited, scoped temporary Support session, and that session's actions are reported to the Master queue.

## Important validation note
This package has been syntax-checked and statically reviewed. A live production deployment requires real Supabase credentials and a Netlify environment; those credentials are not embedded in the ZIP.
