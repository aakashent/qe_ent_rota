# On-call rota dashboard

A mobile-first, static PWA for the QE and HGS on-call rotas. It is designed for GitHub Pages and reads published Google Sheets through Google's cross-domain Visualization query method. No Google API key or service account is needed.

## Included

- **Now** shows the active day/night cover, each role's next handover time, and the next overall handover, including custom times written in rota cells. **Coming month** uses a compact calendar; selecting a date opens both QE and HGS, with consultants on the left and registrars on the right. Search is collapsible; the next-30-days list sits directly below the calendar. Previous/next-day controls and the list provide alternatives to calendar scrolling. Search finds and highlights matching names or dates, with weekends shaded differently.
- Auto, light and dark themes, with the visitor's choice saved on their device.
- QE and HGS rota panels. With no saved preferences or URL parameter, both start collapsed. Without saved settings, `?first=QE` puts QE first and opens it. The Settings button saves the preferred order and each panel's default open state on the device; saved settings then take priority over the URL parameter.
- Automatic column detection for a date, one consultant column or consultant day/night columns, and registrar day/night columns.
- Five-minute refresh while online; the last fetched rota is saved locally and labelled if shown offline.
- PWA manifest, icons and a service worker that caches the page shell, not remote rota responses.

## Configure the sheets

Edit `config.js`:

```js
QE: {
  spreadsheetId: 'GOOGLE_SHEET_ID',
  sheetName: 'QE'
},
HGS: {
  spreadsheetId: 'HGS_GOOGLE_SHEET_ID',
  sheetName: 'HGS'
}
```

The spreadsheet must be viewable by anyone with the link and the tab must be accessible to the query. `spreadsheetId` is the part of the Google Sheets URL between `/d/` and `/edit`. An optional `csvUrl` can be used for another CSV endpoint that allows cross-origin browser reads.

QE and HGS are configured as tabs in the spreadsheet supplied for this project. The current QE tab headers (`Date`, `SpR Day`, `SpR Night`, `Consultant`) are supported. HGS may use separate `Consultant Day` and `Consultant Night` columns; these are detected automatically. If HGS is moved to another spreadsheet, change only its `spreadsheetId` in `config.js`.

Cell values may specify timed changes, for example `Name / after 1pm Other Name` or `Name until 13:00 / from 14:00 Other Name`. The live cover view follows those handovers. Standard day/night switching is set to 08:00 and 17:00 in `config.js`.

## Run locally

Because the app uses a service worker, run a local static server rather than opening `index.html` directly. For example:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000/on-call-dashboard/` if serving the parent directory, or `http://localhost:8000/` from this folder.

## Publish on GitHub Pages

1. Put the contents of this folder at the repository root, or keep the folder and use its path in the published URL.
2. Push the files to the GitHub repository.
3. In **Settings → Pages**, choose the branch and folder to publish.
4. Enable **Enforce HTTPS**.
5. Open the published site once online. Use the browser’s install option, or on iPhone/iPad use Safari’s Share menu and **Add to Home Screen**.

For a project site published under `https://account.github.io/repository/`, relative asset paths and the service-worker scope are set up to work from that subpath.

## Data and privacy

This is a public static site. Anyone who can open it can see the published rota data. Do not add secrets to `config.js`. The service worker caches only the static app files. Rota snapshots are kept in the visitor’s browser storage and are labelled with their saved time when the live sheet cannot be reached.
