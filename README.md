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
- **Radar / Opportunity Engine** -- de AI marketing intelligence-laag boven de Meta Engine
  (kernmodel: signals -> understand -> opportunity -> decide -> action -> result -> learn),
  shadow mode: publiceert of adverteert nooit automatisch.
  - **Always-on Radar**: elke signal provider draait op zijn eigen cadans (nieuws elke 30 min,
    regionaal elk uur, CBS-arbeidsmarktdata dagelijks) via een cron-tick elke 10 minuten die per
    bron checkt of die aan de beurt is (`signal_provider_state`) -- geen handmatige trigger nodig.
    Bronnen: Google News RSS (nieuws + regionaal), CBS StatLine open data (arbeidsmarkt); een
    Trends-provider is correct gebouwd maar wacht op een betaalde `SERPAPI_API_KEY`.
  - **Opportunity ≠ content**: elk signaal wordt gededupliceerd, gefilterd tegen het
    Bedrijfsprofiel (`/instellingen`) en pas dan AI-beoordeeld -- niet elk signaal wordt een
    Opportunity. Score 0-100 met transparante deelscores, "why now", urgency (evergreen/normaal/
    tijdsgevoelig/breaking) en een vervalsnelheid: de getoonde score daalt automatisch naarmate
    een kans ouder wordt, zonder de oorspronkelijke AI-score te overschrijven.
  - **Action Recommendation Engine**: per Opportunity scoort de AI alle 15 mogelijke acties apart
    (ignore/monitor/social_post/linkedin_post/instagram_post/instagram_story/reel/meta_campaign/
    blog/landing_page/email_campaign/pr_opportunity/sales_alert/recruitment_campaign/
    website_update) met een eigen score + onderbouwing -- nooit automatisch "dus een social post".
    Combineert extern signaal + interne vacaturematch + performance van eerdere campagnes op
    matchende vacatures.
  - **Multi-company klaar**: matching loopt over alle bedrijven in `companies` (nu alleen
    Finderz Keeperz), zodat een tweede bedrijf dezelfde architectuur hergebruikt.
  - **Learning loop**: elke gekozen actie (`actions_taken`) en elke approve/dismiss
    (`opportunity_feedback`) wordt vastgelegd, content-acties gekoppeld aan de gegenereerde
    content en (voor Meta-campagnes) aan de echte campagne -- zodat later te herleiden is welk
    signaal, welke opportunity en welke actie daadwerkelijk resultaat opleverden.
  - Zie `/radar` en `/opportunities`. Architectuur: `lib/radar/`, `lib/opportunity-engine.ts`,
    `lib/action-types.ts`, `lib/opportunity-decay.ts`, `lib/content-engine.ts`, `lib/business-profile.ts`.

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
