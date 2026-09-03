# Workspace, Support and Security Rules

## Runtime architecture

The deployed system is **Netlify Hosting + Netlify Functions + Supabase PostgreSQL**. Firebase, Firestore, Google Apps Script, Google Sheets and Google Drive are not part of the runtime.

## Separate workspaces

- The Master Owner uses the Master workspace only.
- Every customer has a separate customer link and a separate tenant data namespace.
- Every Support Team member has a separately created personal Support workspace and link.
- A Support Team member is optional. No Support account or workspace is created unless the Master Owner creates one.
- A customer cannot read another customer's data. A Support member cannot read another Support member's workspace data.
- A Support notification is not an access grant. It contains no customer stock, sales, customer list or private workspace data.

## Master approval workflow

1. A customer submits a support request.
2. The request is recorded in the Master notification queue; Support receives a notification-only item.
3. The Master Owner chooses whether a Support member needs access.
4. Only the Master Owner can create a selected, limited and time-bound temporary Support session for a customer workspace.
5. Actions from that temporary Support session are reported back to the Master notification/audit queue.
6. The temporary session expires automatically and can be ended by the Master.

## First deployment

Before opening the site, set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and a private `MASTER_BOOTSTRAP_TOKEN` in Netlify. Run `supabase/schema.sql` in the Supabase SQL editor. On the first visit, create the Master Owner using the first-time setup card. There is no reusable default Master login.
