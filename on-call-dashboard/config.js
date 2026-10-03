/*
 * Public sheet sources. The rota data is read-only and already published to
 * the web. For HGS, replace the empty spreadsheetId with its spreadsheet ID.
 * If HGS is a tab in the QE workbook, keep the same ID and set sheetName to
 * the exact tab name. Do not put passwords, API keys or private credentials here.
 */
window.ROTA_CONFIG = {
  refreshEveryMs: 5 * 60 * 1000,
  dateLookaheadDays: 90,
  dateTimeZone: 'Europe/London',
  trusts: {
    QE: {
      label: 'Queen Elizabeth Hospital',
      shortLabel: 'QE',
      spreadsheetId: '1Ulyew6jJWbt6D6Enlpj-Je4R__tc309UP7WHEry9Obw',
      sheetName: 'QE',
      csvUrl: ''
    },
    HGS: {
      label: 'HGS',
      shortLabel: 'HGS',
      spreadsheetId: '',
      sheetName: 'HGS',
      csvUrl: ''
    }
  }
};
