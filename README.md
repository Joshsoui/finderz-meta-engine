# Finderz Meta Engine

Meta-only recruitment campaign control voor Finderz Keeperz.

## Wat er nu staat

- Intern dashboard met campagneoverzicht, CPL, CTR, leads en spend.
- Feegestuurd budgetplafond: maximaal 20% van de verwachte plaatsingsfee.
- Vacature-invoer met AI-gegenereerde Meta-copy, drie vacaturegebonden USP's en een fotorealistische achtergrond.
- Vaste Finderz Keeperz-overlay met logo-upload, functietitel, regio, drie transparante USP-balken en CTA.
- Bewerkbare copy en USP's met downloadbare PNG-output in 1:1, 1.91:1 en 9:16.
- Beslisengine voor 24/7 monitoring:
  - pauzeren bij het budgetplafond;
  - pauzeren bij spend zonder leads;
  - pauzeren boven 1,5 keer de doel-CPL;
  - creative refresh bij frequentie boven 2,8 of CTR onder 0,8%;
  - gecontroleerd opschalen met maximaal 15% bij gezonde CPL.
- API-routes voor vacatureanalyse, campagneopslag, Meta-status en campagne-evaluatie.
- D1-datamodel voor campagnes, metric snapshots en optimalisatieacties.
- Gegenereerde achtergronden worden duurzaam opgeslagen in een R2-bucket (via `/media/...`).
- Toegang tot het hele dashboard en alle API-routes is afgeschermd met Cloudflare Access
  (alleen `@finderzkeeperz.nl`-adressen, login via e-mail-eenmalige-code).

## API

- POST /api/analyze-vacancy
- POST /api/generate-background
- GET en POST /api/campaigns
- POST /api/campaign-monitor
- GET /api/meta/status

## Lokaal starten

Voer npm ci en daarna npm run dev uit.

Kopieer .env.example naar .env.local voor echte koppelingen. Plaats nooit tokens in Git.

## Cloudflare Workers

De app draait als standalone Cloudflare Worker (vinext + `@cloudflare/vite-plugin`), met een
D1-database voor campagnedata en een R2-bucket voor gegenereerde achtergronden/logo's.
Configuratie staat in `wrangler.jsonc`.

Eenmalig opzetten (als het account nog geen D1-database/R2-bucket/workers.dev-subdomain heeft):

```
npx wrangler login
npx wrangler d1 create finderz-meta-engine-db      # database_id in wrangler.jsonc zetten
npx wrangler r2 bucket create finderz-meta-engine-media
```

Migraties toepassen op de live database:

```
npx drizzle-kit generate
npx wrangler d1 migrations apply finderz-meta-engine-db --remote
```

Secrets toevoegen (nooit in git of wrangler.jsonc):

```
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put META_ACCESS_TOKEN
npx wrangler secret put META_AD_ACCOUNT_ID
npx wrangler secret put META_PAGE_ID
npx wrangler secret put META_PIXEL_ID
```

Deployen:

```
npm run deploy
```

`OPENAI_TEXT_MODEL` en `OPENAI_IMAGE_MODEL` zijn optioneel (vallen terug op respectievelijk
`gpt-5-mini` en `gpt-image-2`); zet ze als losse `vars` in `wrangler.jsonc` als je een ander model wilt.

### Toegang (Cloudflare Access)

Het hele domein (dashboard + alle `/api/*`-routes) staat achter een Cloudflare Access-app met
een policy die `@finderzkeeperz.nl` toelaat. Dit is Cloudflare-side configuratie, niet iets in
de repo-code. Beheren/uitbreiden (bijv. een los e-mailadres buiten het domein toevoegen) kan via
**Zero Trust → Access → Applications → Finderz Meta Engine** in het dashboard.

## Productievolgorde

1. Meta-advertentieaccount en Facebookpagina koppelen.
2. Bestaande Meta Lead Forms uitlezen en bij nieuwe campagnes kunnen selecteren.
3. Dashboard laten praten met /api/campaigns (laden + opslaan) in plaats van lokale mock-data.
4. Campagnes vanuit het dashboard publiceren in een controlemodus.
5. Monitoring elke 15 minuten laten draaien (cron trigger); automatische wijzigingen eerst loggen en begrenzen.
6. Leadkwaliteit terugvoeren, zodat niet alleen op goedkope maar op bruikbare leads wordt geoptimaliseerd.

OTYS en LinkedIn vallen bewust buiten deze versie.
