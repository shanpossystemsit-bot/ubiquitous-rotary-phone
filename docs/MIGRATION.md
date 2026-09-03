# Migration notes

The existing `Code.gs` POS business logic is retained, but its persistence adapter is replaced for the Netlify build:

- PropertiesService → `app_kv`
- CacheService → `app_cache`
- Firestore-style documents → `documents`
- Drive-like uploaded files → `app_files`
- Google Apps web UI → Netlify static `public/index.html`
- `google.script.run` → Netlify Function API

Tenant data is namespaced by customer shop code inside the `documents.path` value. The browser never receives the Supabase service-role key.

The original Google Apps/Firebase source is retained in `legacy/` for rollback/reference and is not overwritten.
