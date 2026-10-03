# On-call rota dashboard

A mobile-first, static PWA for the QE and HGS on-call rotas. It is designed for GitHub Pages and reads published Google Sheets through Google's cross-domain Visualization query method. No Google API key or service account is needed.

## Included

- **Now** and **Coming month** views. The coming-month view uses a compact calendar with month navigation across the next three months; choosing a date shows that day's QE and HGS rotas. Search jumps to the first matching date or name.
- QE and HGS rota panels. HGS is expanded by default; `?first=QE` puts QE first and expanded, with HGS collapsed. With no parameter (or any value other than QE), HGS is first and expanded.
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

QE is preconfigured with the spreadsheet link supplied for this project. HGS is intentionally left blank until its sheet is available. The current QE tab headers (`Date`, `SpR Day`, `SpR Night`, `Consultant`) are supported. The HGS source may use `Consultant Day` and `Consultant Night`; those are detected automatically.

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
