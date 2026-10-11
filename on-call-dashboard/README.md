# On-call rota dashboard

A mobile-first PWA for the QE and HGS on-call rotas. The website and its optional Scriptable iPhone widgets use the same `/api/rota` JSON feed, which reads and joins the configured published Google Sheets. No Google API key or service account is needed.

## Included

- **Now** shows the active day/night cover, each role's next handover time, and the next overall handover, including custom times written in rota cells. **Coming month** has two sections, both collapsed on first use: **Search or select date** contains search, the calendar and selected QE/HGS rotas; **30-day look ahead** has Both, HGS and QE filters. Selecting a date opens both site rotas. The look-ahead uses a two-row, two-site card in Both mode and a compact date-column card for one site. Search finds and highlights matching names or dates, with weekends shaded differently.
- Auto, light and dark themes, with the visitor's choice saved on their device.
- QE and HGS rota panels. With no saved preferences or URL parameter, both start collapsed. Without saved settings, `?first=QE` puts QE first and opens it. The Settings button saves the preferred order, default 30-day filter and each panel's default open state on the device; saved settings then take priority over the URL parameter. Choosing HGS or QE as the default filter also sets that site first in Both mode.
- Automatic column detection for a date, one consultant column or consultant day/night columns, and registrar day/night columns.
- Five-minute refresh while online; the last fetched rota is saved locally and labelled if shown offline.
- PWA manifest, icons and a service worker that caches the page shell, not remote rota responses.
- Optional Scriptable widgets in small (current cover), medium (today and tomorrow) and large (seven days) sizes. Each widget can show HGS, QE or both, and reads the app's feed rather than the spreadsheet directly. Open **iPhone widget** in the page footer for setup instructions.

## Configure the sheets

Edit `config.js` to change the public workbook ID or source tabs. The `/api/rota` endpoint is the single data source for the website and widget. It joins the long-form source sheets by date:

- QE registrars: `QE Reg` columns A, M and N.
- HGS registrars: `HGS Reg` columns A, C and D.
- Consultants: `Consultant Rota` columns A, C, E and F. Column D, Solihull On Call, is not used.

The workbook and each source tab must be accessible to the published page. The short `QE` and `HGS` tabs are retained as fallbacks if any long-form source cannot be read. No Google API key or service account is needed.

The consultant rota provides QE First On Call for QE and BHH Daytime/Overnight for HGS. Consultant day/night values are kept distinct when they differ. The Solihull on-call column is ignored.

Cell values may specify timed changes, for example `Name / after 1pm Other Name` or `Name until 13:00 / from 14:00 Other Name`. The live cover view follows those handovers. Standard day/night switching is set to 08:00 and 17:00 in `config.js`.

## Run locally

Because the app uses a service worker, run a local static server rather than opening `index.html` directly. For example:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000/on-call-dashboard/` if serving the parent directory, or `http://localhost:8000/` from this folder.

## Publish on Vercel

Create a Vercel project named `uhb-ent-on-call` and set this folder as the project root. Vercel serves the static files and deploys `api/rota.js` as a serverless function; no build command is required. The project name determines the default `*.vercel.app` address, without a GitHub username in the URL. Connect it to a department-owned repository or deploy the folder with Vercel CLI. Then open the deployed site over HTTPS. Use **Install** in a supported browser, or on iPhone/iPad use Safari’s Share menu and **Add to Home Screen**. The widget setup page is at `/widget-setup.html`.

The app URL is embedded into the widget script when someone copies it from the setup page, so the installed widget reads the deployed app's feed.

## Data and privacy

This is a public static site. Anyone who can open it can see the published rota data. Do not add secrets to `config.js`. The service worker caches only the static app files. Rota snapshots are kept in the visitor’s browser storage and are labelled with their saved time when the live sheet cannot be reached.
