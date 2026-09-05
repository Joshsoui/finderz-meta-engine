# Finderz Meta Engine

Meta-only recruitment campaign control voor Finderz Keeperz.

## Wat er nu staat

- Intern dashboard met campagneoverzicht, CPL, CTR, leads en spend.
- Feegestuurd budgetplafond: maximaal 20% van de verwachte plaatsingsfee.
- Vacature-invoer met gegenereerde teksten, drie USP's, creative-opbouw en beeldbriefing.
- Formaten 1:1, 1.91:1 en 9:16 als vaste creative-output.
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
- GET en POST /api/campaigns
- POST /api/campaign-monitor
- GET /api/meta/status

## Lokaal starten

Voer npm ci en daarna npm run dev uit.

Kopieer .env.example naar .env.local voor echte koppelingen. Plaats nooit tokens in Git.

## Productievolgorde

1. Meta-advertentieaccount en Facebookpagina koppelen.
2. Bestaande Meta Lead Forms uitlezen en bij nieuwe campagnes kunnen selecteren.
3. Gegenereerde achtergrondafbeeldingen opslaan en de vaste Finderz Keeperz-template renderen.
4. Campagnes vanuit het dashboard publiceren in een controlemodus.
5. Monitoring elke 15 minuten laten draaien; automatische wijzigingen eerst loggen en begrenzen.
6. Leadkwaliteit terugvoeren, zodat niet alleen op goedkope maar op bruikbare leads wordt geoptimaliseerd.

OTYS en LinkedIn vallen bewust buiten deze versie.
