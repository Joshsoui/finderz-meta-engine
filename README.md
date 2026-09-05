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

## API

- POST /api/analyze-vacancy
- POST /api/generate-background
- GET en POST /api/campaigns
- POST /api/campaign-monitor
- GET /api/meta/status

## Lokaal starten

Voer npm ci en daarna npm run dev uit.

Kopieer .env.example naar .env.local voor echte koppelingen. Plaats nooit tokens in Git.

## Render

De repository bevat een render.yaml Blueprint voor een Node web service in Frankfurt.
De Blueprint gebruikt voorlopig het gratis prototypeplan, bouwt met npm install en npm run build,
start met npm start en controleert de service via /api/meta/status.

Meta- en OpenAI-sleutels worden bewust niet in render.yaml opgeslagen. Voeg deze als
secret environment variables toe wanneer de echte koppelingen worden geactiveerd:
META_ACCESS_TOKEN, META_AD_ACCOUNT_ID, META_PAGE_ID, META_PIXEL_ID en OPENAI_API_KEY.
De optionele modelinstellingen zijn OPENAI_TEXT_MODEL en OPENAI_IMAGE_MODEL.

## Productievolgorde

1. Meta-advertentieaccount en Facebookpagina koppelen.
2. Bestaande Meta Lead Forms uitlezen en bij nieuwe campagnes kunnen selecteren.
3. Gegenereerde achtergronden duurzaam opslaan in object storage.
4. Campagnes vanuit het dashboard publiceren in een controlemodus.
5. Monitoring elke 15 minuten laten draaien; automatische wijzigingen eerst loggen en begrenzen.
6. Leadkwaliteit terugvoeren, zodat niet alleen op goedkope maar op bruikbare leads wordt geoptimaliseerd.

OTYS en LinkedIn vallen bewust buiten deze versie.
