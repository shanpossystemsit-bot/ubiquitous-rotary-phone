# Testing deployment — before custom domain and production launch

This project is intended to run first as a **testing version for as long as the Master Owner needs**. A custom domain is not required during this period. There is no application-enforced testing expiry date.

## Test environment

- Create a separate Supabase **testing** project. Do not use it later as the production database.
- Deploy the package to a temporary Netlify site. Netlify supplies a temporary `*.netlify.app` test URL; no purchased domain is needed.
- Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and a private `MASTER_BOOTSTRAP_TOKEN` only in that test site's Netlify environment variables.
- Run `supabase/schema.sql` in the testing Supabase project.
- Create the Master Owner from the first-time setup card, then create only the test customers and optional Support accounts you actually need.

## Desktop use during testing

Open the temporary Netlify test URL in Chrome or Edge and use the browser's **Install SHAN POS SYSTEMS** option. This places the test application on the Windows desktop/Start menu while it continues to use the same testing Supabase data.

## Test before production

Test sales, stock changes, invoices, customer links, license flows, device/machine limits, Master permissions, optional Support workspaces, customer requests, temporary Support approval and Master action reports. Record bugs in the Master notification queue or a separate test log. Move to a new production Supabase project and final custom domain only when the Master Owner decides the testing is complete.
