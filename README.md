# Zasedačka

Online rezervační kalendář zasedací místnosti pro Cloudflare Workers + D1.

## Funkce
- veřejné zobrazení měsíčního kalendáře
- vytvoření rezervace bez účtu
- povinné: datum, čas od/do, jméno, telefon, e-mail
- kontrola překryvu rezervací
- admin přihlášení
- pouze admin může rezervace upravovat a mazat

## Nasazení
1. `npm install`
2. `npx wrangler login`
3. `npx wrangler d1 create zasedacka-db`
4. Vlož `database_id` do `wrangler.jsonc`.
5. `npx wrangler d1 migrations apply zasedacka-db --remote`
6. `npx wrangler secret put ADMIN_USERNAME`
7. `npx wrangler secret put ADMIN_PASSWORD`
8. `npx wrangler secret put SESSION_SECRET`
9. `npx wrangler deploy`
