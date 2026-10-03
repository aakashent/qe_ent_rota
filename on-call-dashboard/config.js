/*
 * Public sheet sources. Long-form registrar rotas are joined by date to the
 * consultant rota. Solihull On Call is intentionally not used. The short QE
 * and HGS tabs remain as fallbacks if a long-form sheet is unavailable.
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
      fallbackSheetName: 'QE',
      sources: [
        { sheetName: 'QE Reg', kind: 'qe-registrars' },
        { sheetName: 'Consultant Rota', kind: 'qe-consultants' }
      ]
    },
    HGS: {
      label: 'HGS',
      shortLabel: 'HGS',
      spreadsheetId: '1Ulyew6jJWbt6D6Enlpj-Je4R__tc309UP7WHEry9Obw',
      fallbackSheetName: 'HGS',
      sources: [
        { sheetName: 'HGS Reg', kind: 'hgs-registrars' },
        { sheetName: 'Consultant Rota', kind: 'hgs-consultants' }
      ]
    }
  }
};
