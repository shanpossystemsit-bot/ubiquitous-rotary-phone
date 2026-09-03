# Requirements review — final package

The deployable runtime was reviewed against the stated requirements before packaging.

## Architecture gate
- Final runtime: Netlify Hosting + Netlify Functions + Supabase PostgreSQL.
- No Google Apps Script runtime dependency.
- No Firebase/Firestore runtime dependency.
- No Google Sheets runtime dependency.
- No Google Drive runtime dependency; file/backup persistence is mapped to Supabase-backed storage tables.
- No Google API dependency.
- Original Google Apps source is preserved only under `legacy/` and is not loaded by the Netlify runtime.

## Functional requirements
1. Account Create is separate from licensing.
2. Business Type → Business Name → Business Details → Branch Count flow.
3. Sole Proprietorship cannot create branches.
4. Branch-enabled businesses: minimum 4; standard maximum 25; 26–100 requires Master authorization and separate payment.
5. Unique Software / Link Code and customer-specific workspace.
6. Trial/Demo 7–90 days.
7. Customer-only logo editing with protected SHAN branding.
8. Central permissions with locked/access checkbox semantics across all access points and future categories.
9. Customer roles include Super Admin, Area Manager, Branch Manager, Cashier and lower roles with business-type restrictions.
10. Master authority is separate from customer Super Admin.
11. Category 3 critical support restrictions are enforced.
12. Category 4 support members receive isolated personal workspaces and unique links.
13. Support cannot access customer stock/data by default; temporary Master-authorized scoped support access is implemented.
14. Seven exact license tiers and durations are implemented.
15. First Purchase is one-time; other packages become available only after First Purchase expires.
16. Normal Price and Discount Price are separately stored; discount activation is per package.
17. License request/payment-slip/Master-review/key-generation workflow is implemented.
18. License keys are bound to customer software.
19. Renewal/relicense creates a new key.
20. Machine and activation/reinstallation limits are separately tracked for branch/non-branch businesses.
21. Replacement-key request uses old key + customer email and half-current-package pricing with Master approval.
22. Existing POS feature set is preserved.
23. Supabase schema, environment configuration and Netlify deployment files are included.
24. Backup/restore data is persisted through Supabase-backed storage rather than external Drive storage.

## Validation
- `Code.gs`, `runtime-prelude.js` and `api.js` pass Node syntax validation after migration.
- Deployable source was scanned for legacy backend identifiers/dependencies; only the intentionally preserved `legacy/` directory contains the original Google Apps/Firebase implementation.
- Live production behavior still requires a real Supabase project and Netlify deployment; credentials are intentionally not embedded.
