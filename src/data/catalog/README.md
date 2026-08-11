# International event and team catalog

This directory is the application's small, checked-in database of League of Legends club-team internationals. SQLite is intentionally not used: the site is a static Vite application, the catalog is read-only at runtime, and the generated JSON remains easy to review and deploy with the rest of the bundle.

## Data flow

1. `scripts/sync-liquipedia-catalog.ts` defines which event editions belong in scope.
2. The script reads the selected pages through Liquipedia's no-key MediaWiki API.
3. The parser extracts the event name and reviewed main-event organization teams.
4. Validation rejects missing references, duplicate IDs, participant-count drift, and incomplete revision provenance.
5. `international-catalog.json` is committed as the cached deployment snapshot.

Do not edit the generated JSON by hand. Inclusion decisions and exceptional participant reviews belong in the sync script.

## Scope policy

An edition belongs in the normal catalog when professional organization teams from multiple competitive regions play in its main event. The edition also records why it was included and what kind of competition it was.

The initial scope includes:

- World Championship, Mid-Season Invitational, and First Stand;
- Esports World Cup;
- IEM World Championships from 2012 through 2017;
- IGN Pro League Season 5 and World Cyber Games 2010;
- International Wildcard tournaments, invitationals, and qualifiers from 2013 through 2016;
- Rift Rivals from 2017 through 2019, classified separately as cross-regional challenges.

All-Star events and Asian Games are not mixed into this list because their entrants are regional selections or national teams rather than organization rosters. IEM city stops need edition-by-edition review before inclusion; the series name alone is not enough.

## Updating without an API key

Run the update manually, not from the browser or normal production build:

```powershell
$env:LIQUIPEDIA_USER_AGENT = 'ProSceneGuesser/0.1 (https://your-contact-page.example)'
npm run data:sync
npm run check
```

The script batches page titles, waits more than two seconds between requests, and stores page IDs, revision IDs, revision timestamps, and source URLs. A custom user agent with working project/contact information is required by the [Liquipedia API terms](https://liquipedia.net/api-terms-of-use). The committed snapshot is the cache used by the application, so site visitors never call Liquipedia.

Liquipedia text is licensed under [CC BY-SA 3.0](https://liquipedia.net/commons/Help:Reusing_and_remixing_Liquipedia_content). This catalog uses names and structured facts only; it does not import team logos or other media.

## Using the catalog

Choose teams from the exact event edition so historical names stay intact:

```ts
import { getInternationalTeamNamesForEdition } from '@/data/catalog'

const ewc2024Teams = getInternationalTeamNamesForEdition('ewc-2024')
```

Avoid using every historical team name as one global answer list. A question should normally use its edition's participants, plus separately reviewed decoys if the game design calls for them.

Team IDs merge only spelling variants that the importer explicitly reviews. Organization acquisitions, slot transfers, and broader predecessor/successor relationships are not inferred automatically.
