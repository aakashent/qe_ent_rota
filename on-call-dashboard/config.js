/*
 * Public sheet sources. The rota data is read-only and already published to
 * the web. QE and HGS currently use tabs in the same workbook. If HGS moves to
 * another workbook, change its spreadsheetId. Do not put credentials here.
 */
window.ROTA_CONFIG = {
  refreshEveryMs: 5 * 60 * 1000,
  dateLookaheadDays: 90,
  dateTimeZone: 'Europe/London',
  dayStartHour: 8,
  nightStartHour: 17,
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
      spreadsheetId: '1Ulyew6jJWbt6D6Enlpj-Je4R__tc309UP7WHEry9Obw',
      sheetName: 'HGS',
      csvUrl: ''
    }
  }
};
