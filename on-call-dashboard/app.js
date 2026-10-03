(() => {
  'use strict';

  const config = window.ROTA_CONFIG || {};
  const trustConfig = config.trusts || {};
  const trustOrder = ['QE', 'HGS'];
  const records = { QE: [], HGS: [] };
  const dateIndexes = { QE: null, HGS: null };
  const loadState = { QE: 'loading', HGS: 'loading' };
  const messages = { QE: '', HGS: '' };
  let lastFetch = null;
  let installPrompt = null;
  let requestNumber = 0;
  let gvizReadyPromise = null;
  let sourceGridPromises = new Map();
  let selectedMonthDate = null;
  let visibleMonthStart = null;
  let lastMonthQuery = '';
  let showAllSearchResults = false;
  let nextDaysOpen = false;
  let nextDaysSiteFilter = null;
  let dateSectionOpen = false;
  let calendarPickerOpen = false;
  let liveSnapshots = {};

  const $ = (id) => document.getElementById(id);
  const ui = {
    network: $('network-state'), updated: $('updated-label'), updatedPill: document.querySelector('.updated-pill'),
    todayLabel: $('today-label'), currentDate: $('current-date-heading'), monthTitle: $('month-title'),
    nowList: $('now-rota-list'), monthList: $('month-rota-list'), monthCaption: $('month-caption'),
    monthGrid: $('month-date-grid'), selectedDateTitle: $('selected-date-title'), dateSectionToggle: $('date-selection-toggle'), dateSectionContent: $('date-selection-content'),
    previousDate: $('previous-date'), nextDate: $('next-date'), nextDaysToggle: $('next-days-toggle'), nextDaysFilter: $('next-days-filter'), nextDaysList: $('next-days-list'),
    calendarMonthLabel: $('calendar-month-label'), calendarMonthText: $('calendar-month-text'), calendarPicker: $('calendar-month-picker'),
    calendarYearSelect: $('calendar-year-select'), calendarMonthOptions: $('calendar-month-options'), calendarToday: $('calendar-today'), calendarPickerClose: $('calendar-picker-close'),
    previousMonth: $('previous-month'), nextMonth: $('next-month'),
    nowTab: $('now-tab'), monthTab: $('month-tab'), nowView: $('now-view'), monthView: $('month-view'),
    search: $('search-input'), clearSearch: $('clear-search'), searchResults: $('search-results'), refresh: $('refresh-button'),
    footerRefresh: $('footer-refresh'), install: $('install-button'), theme: $('theme-button'), settings: $('settings-button'), settingsDialog: $('settings-dialog'),
    closeSettings: $('close-settings'), cancelSettings: $('cancel-settings'), saveSettings: $('save-settings'), firstSiteSetting: $('first-site-setting'), defaultSiteFilterSetting: $('default-site-filter-setting'),
    qeOpenSetting: $('qe-open-setting'), hgsOpenSetting: $('hgs-open-setting')
  };

  const dateFmt = new Intl.DateTimeFormat('en-GB', { timeZone: config.dateTimeZone || 'Europe/London', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const shortDateFmt = new Intl.DateTimeFormat('en-GB', { timeZone: config.dateTimeZone || 'Europe/London', day: 'numeric', month: 'short' });
  const weekdayFmt = new Intl.DateTimeFormat('en-GB', { timeZone: config.dateTimeZone || 'Europe/London', weekday: 'short' });
  const monthFmt = new Intl.DateTimeFormat('en-GB', { timeZone: config.dateTimeZone || 'Europe/London', month: 'long', year: 'numeric' });
  const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: config.dateTimeZone || 'Europe/London', hour: '2-digit', minute: '2-digit' });

  function londonDateKey(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: config.dateTimeZone || 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    const part = Object.fromEntries(parts.map((x) => [x.type, x.value]));
    return `${part.year}-${part.month}-${part.day}`;
  }

  function keyToDate(key) {
    const [year, month, day] = key.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day, 12));
  }

  function addDays(key, amount) {
    const date = keyToDate(key);
    date.setUTCDate(date.getUTCDate() + amount);
    return date.toISOString().slice(0, 10);
  }

  function monthStart(key) { return `${key.slice(0, 7)}-01`; }

  function monthEnd(key) {
    const [year, month] = key.split('-').map(Number);
    return new Date(Date.UTC(year, month, 0, 12)).toISOString().slice(0, 10);
  }

  function shiftMonth(key, amount) {
    const [year, month] = key.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1 + amount, 1, 12)).toISOString().slice(0, 10);
  }

  function lookaheadEnd(start = todayKey()) {
    const configuredEnd = addDays(start, Math.max(1, Number(config.dateLookaheadDays) || 90));
    const siteEnds = trustOrder.map((trust) => records[trust]
      .filter((row) => row.date >= start
        && (row._hasConsultants ?? (row.consultants.length > 0))
        && (row._hasRegistrars ?? (row.registrars.length > 0)))
      .map((row) => row.date).sort().pop()).filter(Boolean).sort();
    const latestCommon = siteEnds.length === trustOrder.length ? siteEnds[0] : null;
    return latestCommon && latestCommon > configuredEnd ? latestCommon : configuredEnd;
  }

  function lookaheadMonths(start, end) {
    const [sy, sm] = start.split('-').map(Number);
    const [ey, em] = end.split('-').map(Number);
    return Math.max(1, (ey - sy) * 12 + em - sm + 1);
  }

  function dateKey(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    let match = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (match) return validKey(+match[1], +match[2], +match[3]);
    match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (match) return validKey(expandYear(+match[3]), +match[2], +match[1]);
    const monthNames = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
    match = raw.match(/(?:^[A-Za-z]{3,9}\s+)?(\d{1,2})[\s-]+([A-Za-z]{3,9})[\s,-]+(\d{2,4})/);
    if (match) {
      const month = monthNames[match[2].slice(0, 3).toLowerCase()];
      if (month) return validKey(expandYear(+match[3]), month, +match[1]);
    }
    match = raw.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{2,4})$/);
    if (match) {
      const month = monthNames[match[1].slice(0, 3).toLowerCase()];
      if (month) return validKey(expandYear(+match[3]), month, +match[2]);
    }
    return null;
  }

  function expandYear(year) { return year < 100 ? 2000 + year : year; }
  function validKey(year, month, day) {
    const date = new Date(Date.UTC(year, month - 1, day, 12));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function parseCSV(text) {
    const rows = [];
    let row = [], value = '', quoted = false;
    const input = String(text).replace(/^\uFEFF/, '');
    for (let i = 0; i < input.length; i += 1) {
      const char = input[i];
      if (quoted) {
        if (char === '"' && input[i + 1] === '"') { value += '"'; i += 1; }
        else if (char === '"') quoted = false;
        else value += char;
      } else if (char === '"') quoted = true;
      else if (char === ',') { row.push(value); value = ''; }
      else if (char === '\n') { row.push(value.replace(/\r$/, '')); rows.push(row); row = []; value = ''; }
      else value += char;
    }
    if (value.length || row.length) { row.push(value.replace(/\r$/, '')); rows.push(row); }
    return rows;
  }

  function normaliseHeader(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function detectColumns(headers) {
    const normal = headers.map(normaliseHeader);
    const date = normal.findIndex((h) => h === 'date' || h.startsWith('date '));
    const find = (test) => normal.findIndex(test);
    const consultantDay = find((h) => h.includes('consultant') && (h.includes('day') || h.includes('daytime')));
    const consultantNight = find((h) => h.includes('consultant') && (h.includes('night') || h.includes('overnight')));
    let consultant = find((h) => h.includes('consultant') && !h.includes('day') && !h.includes('night') && !h.includes('overnight'));
    if (consultant < 0) consultant = find((h) => h.includes('consultant'));
    const isReg = (h) => /\b(reg|registrar|spr|st[1-8])\b/.test(h);
    const regDay = find((h) => isReg(h) && (h.includes('day') || h.includes('am')));
    const regNight = find((h) => isReg(h) && (h.includes('night') || h.includes('overnight')));
    const candidates = normal.map((h, i) => ({ h, i })).filter(({ h }) => isReg(h));
    const dayIndex = regDay >= 0 ? regDay : candidates.find(({ h }) => /\bday\b/.test(h))?.i ?? -1;
    const nightIndex = regNight >= 0 ? regNight : candidates.find(({ h }) => /\bnight\b|overnight/.test(h))?.i ?? -1;
    return { date, consultant, consultantDay, consultantNight, regDay: dayIndex, regNight: nightIndex };
  }

  function parseMatrix(input) {
    const matrix = input.filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''));
    if (matrix.length < 2) return [];
    const header = matrix[0].map((x) => String(x || '').trim());
    const columns = detectColumns(header);
    if (columns.date < 0) throw new Error('Could not find a Date column.');
    const get = (row, index) => index >= 0 ? String(row[index] ?? '').trim() : '';
    return matrix.slice(1).map((row) => {
      const day = dateKey(get(row, columns.date));
      if (!day) return null;
      const consultants = [];
      if (columns.consultantDay >= 0) consultants.push({ label: 'Consultant day', value: get(row, columns.consultantDay) });
      if (columns.consultantNight >= 0) consultants.push({ label: 'Consultant night', value: get(row, columns.consultantNight) });
      if (!consultants.length && columns.consultant >= 0) consultants.push({ label: 'Consultant', value: get(row, columns.consultant) });
      const registrars = [];
      if (columns.regDay >= 0) registrars.push({ label: 'Registrar day', value: get(row, columns.regDay) });
      if (columns.regNight >= 0) registrars.push({ label: 'Registrar night', value: get(row, columns.regNight) });
      return { date: day, consultants, registrars };
    }).filter(Boolean);
  }

  function parseRows(csv) { return parseMatrix(parseCSV(csv)); }

  function parseLongSource(matrix, source) {
    const header = (matrix[0] || []).map(normaliseHeader);
    const has = (index, text) => (header[index] || '').includes(text);
    const validHeaders = source.kind === 'qe-registrars'
      ? has(12, 'day on call') && has(13, 'night on call')
      : source.kind === 'hgs-registrars'
        ? has(2, 'day spr') && has(3, 'night spr')
        : source.kind === 'qe-consultants'
          ? has(2, 'qe first on call') && has(4, 'bhh daytime') && has(5, 'bhh overnight')
          : source.kind === 'hgs-consultants'
            ? has(2, 'qe first on call') && has(4, 'bhh daytime') && has(5, 'bhh overnight')
            : false;
    if (!validHeaders) throw new Error(`Unexpected columns in ${source.sheetName}.`);
    const cell = (row, index) => String(row[index] ?? '').trim();
    return matrix.map((row) => {
      const date = dateKey(cell(row, 0));
      if (!date) return null;
      if (source.kind === 'qe-registrars') return {
        date, consultants: [],
        registrars: [
          { label: 'Registrar day', value: cell(row, 12) },
          { label: 'Registrar night', value: cell(row, 13) }
        ]
      };
      if (source.kind === 'hgs-registrars') return {
        date, consultants: [],
        registrars: [
          { label: 'Registrar day', value: cell(row, 2) },
          { label: 'Registrar night', value: cell(row, 3) }
        ]
      };
      if (source.kind === 'qe-consultants') return {
        date, consultants: [{ label: 'Consultant', value: cell(row, 2) }], registrars: []
      };
      if (source.kind === 'hgs-consultants') return {
        date, consultants: [
          { label: 'Consultant day', value: cell(row, 4) },
          { label: 'Consultant night', value: cell(row, 5) }
        ], registrars: []
      };
      return null;
    }).filter(Boolean);
  }

  function mergeSourceRecords(sources) {
    const byDate = new Map();
    sources.flat().forEach((sourceRow) => {
      const row = byDate.get(sourceRow.date) || { date: sourceRow.date, consultants: [], registrars: [] };
      if (sourceRow.consultants.length) { row.consultants = sourceRow.consultants; row._hasConsultants = true; }
      if (sourceRow.registrars.length) { row.registrars = sourceRow.registrars; row._hasRegistrars = true; }
      byDate.set(sourceRow.date, row);
    });
    return [...byDate.values()].map((row) => {
      if (!row.consultants.length) row.consultants = [{ label: 'Consultant', value: '#N/A' }];
      if (!row.registrars.length) row.registrars = [
        { label: 'Registrar day', value: '#N/A' },
        { label: 'Registrar night', value: '#N/A' }
      ];
      return row;
    }).sort((a, b) => a.date.localeCompare(b.date));
  }

  function querySourceGrid(definition, source) {
    const spreadsheetId = source.spreadsheetId || definition.spreadsheetId;
    const key = `${spreadsheetId}:${source.sheetName}`;
    if (!sourceGridPromises.has(key)) {
      const url = sourceUrl({ spreadsheetId, sheetName: source.sheetName });
      const promise = queryGrid(url).catch((error) => { sourceGridPromises.delete(key); throw error; });
      sourceGridPromises.set(key, promise);
    }
    return sourceGridPromises.get(key);
  }

  function sourceUrl(definition) {
    if (definition.csvUrl) return definition.csvUrl;
    if (!definition.spreadsheetId) return '';
    const params = new URLSearchParams({ sheet: definition.sheetName || '', headers: '1', _: String(Date.now()) });
    return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(definition.spreadsheetId)}/gviz/tq?${params}`;
  }

  function hasConfiguredSource(definition) {
    return !!(definition?.sources?.length || sourceUrl(definition || {}));
  }

  function cacheKey(trust) { return `oncall-rota-v1-${trust}`; }

  function ensureGvizReady() {
    if (window.google?.visualization?.Query) return Promise.resolve();
    if (!window.google?.charts?.load || !window.google?.charts?.setOnLoadCallback) {
      return Promise.reject(new Error('Google’s sheet reader could not be loaded. Check your connection and refresh.'));
    }
    if (!gvizReadyPromise) {
      gvizReadyPromise = new Promise((resolve, reject) => {
        try {
          window.google.charts.load('current', { packages: ['corechart'] });
          window.google.charts.setOnLoadCallback(resolve);
        } catch (error) { reject(error); }
      });
    }
    return gvizReadyPromise;
  }

  function queryGrid(url) {
    return ensureGvizReady().then(() => new Promise((resolve, reject) => {
      try {
        const query = new window.google.visualization.Query(url, { sendMethod: 'scriptInjection' });
        query.setTimeout(20);
        query.send((response) => {
          if (response.isError()) {
            reject(new Error(response.getMessage() || 'Google could not read this published sheet.'));
            return;
          }
          const table = response.getDataTable();
          const matrix = [];
          const columnCount = table.getNumberOfColumns();
          const headers = [];
          for (let col = 0; col < columnCount; col += 1) headers.push(table.getColumnLabel(col) || `Column ${col + 1}`);
          matrix.push(headers);
          for (let row = 0; row < table.getNumberOfRows(); row += 1) {
            const values = [];
            for (let col = 0; col < columnCount; col += 1) {
              values.push(table.getFormattedValue(row, col) || '');
            }
            matrix.push(values);
          }
          resolve(matrix);
        });
      } catch (error) { reject(error); }
    }));
  }

  async function loadTrust(trust, currentRequest) {
    const definition = trustConfig[trust] || {};
    const sourceUrlExists = (definition.sources || []).length > 0 || !!sourceUrl(definition);
    if (!sourceUrlExists) { loadState[trust] = 'unconfigured'; records[trust] = []; dateIndexes[trust] = null; return; }
    try {
      let parsed;
      let cachedSource;
      let usedFallback = false;
      if (definition.sources?.length) {
        try {
          const sourceRows = await Promise.all(definition.sources.map(async (source) => {
            const matrix = await querySourceGrid(definition, source);
            const rows = parseLongSource(matrix, source);
            if (!rows.length) throw new Error(`No dated rows were found in ${source.sheetName}.`);
            return rows;
          }));
          parsed = mergeSourceRecords(sourceRows);
        } catch (sourceError) {
          if (!definition.fallbackSheetName) throw sourceError;
          const matrix = await queryGrid(sourceUrl({ spreadsheetId: definition.spreadsheetId, sheetName: definition.fallbackSheetName }));
          parsed = parseMatrix(matrix);
          usedFallback = true;
        }
        cachedSource = { rows: parsed };
      } else if (definition.csvUrl) {
        const url = sourceUrl(definition);
        const separator = url.includes('?') ? '&' : '?';
        const response = await fetch(`${url}${separator}_=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`The published sheet returned ${response.status}.`);
        const csv = await response.text();
        if (!csv || /<!doctype html|<html/i.test(csv.slice(0, 300))) throw new Error('The sheet did not return published CSV data.');
        parsed = parseRows(csv);
        cachedSource = { csv };
      } else {
        parsed = parseMatrix(await queryGrid(sourceUrl(definition)));
        cachedSource = { rows: parsed };
      }
      if (!parsed.length) throw new Error('No dated rota rows were found in this sheet.');
      if (currentRequest !== requestNumber) return;
      records[trust] = parsed;
      dateIndexes[trust] = null;
      loadState[trust] = usedFallback ? 'fallback' : 'fresh';
      messages[trust] = usedFallback ? `The long-form ${trust} rota could not be read; showing the shorter ${definition.fallbackSheetName} tab.` : '';
      localStorage.setItem(cacheKey(trust), JSON.stringify({ savedAt: Date.now(), ...cachedSource }));
    } catch (error) {
      if (currentRequest !== requestNumber) return;
      const cached = localStorage.getItem(cacheKey(trust));
      if (cached) {
        try {
          const saved = JSON.parse(cached);
          records[trust] = Array.isArray(saved.rows) ? saved.rows : parseRows(saved.csv || '');
          dateIndexes[trust] = null;
          loadState[trust] = records[trust].length ? 'cached' : 'error';
          messages[trust] = records[trust].length ? 'Showing the last saved rota because the published sheet could not be refreshed.' : error.message;
        } catch {
          loadState[trust] = 'error'; messages[trust] = error.message;
        }
      } else {
        loadState[trust] = 'error'; messages[trust] = error.message || 'Could not load the published sheet.';
      }
    }
  }

  async function refreshData() {
    const thisRequest = ++requestNumber;
    sourceGridPromises = new Map();
    setRefreshBusy(true);
    loadState.QE = hasConfiguredSource(trustConfig.QE) ? 'loading' : 'unconfigured';
    loadState.HGS = hasConfiguredSource(trustConfig.HGS) ? 'loading' : 'unconfigured';
    messages.QE = ''; messages.HGS = '';
    render();
    await Promise.all(trustOrder.map((trust) => loadTrust(trust, thisRequest)));
    if (thisRequest !== requestNumber) return;
    if (records.QE.length && records.HGS.length && loadState.HGS !== 'unconfigured' && JSON.stringify(records.QE) === JSON.stringify(records.HGS)) {
      records.HGS = [];
      dateIndexes.HGS = null;
      loadState.HGS = 'error';
      messages.HGS = 'The HGS query returned the same rows as QE. Check that the HGS tab exists and is published.';
    }
    lastFetch = Date.now();
    setRefreshBusy(false);
    render();
  }

  function setRefreshBusy(busy) {
    ui.refresh.disabled = busy;
    ui.refresh.querySelector('span:first-child').classList.toggle('spinning', busy);
    ui.network.textContent = busy ? 'Refreshing rota…' : navigator.onLine ? 'Connected' : 'Offline';
  }

  function todayKey() { return londonDateKey(new Date()); }
  function londonClock() {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: config.dateTimeZone || 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    const part = Object.fromEntries(parts.map((x) => [x.type, x.value]));
    return { day: `${part.year}-${part.month}-${part.day}`, minute: Number(part.hour) * 60 + Number(part.minute) };
  }
  function findOnDate(trust, day) {
    if (!dateIndexes[trust]) dateIndexes[trust] = new Map(records[trust].map((row) => [row.date, row]));
    return dateIndexes[trust].get(day) || null;
  }
  function dateLabel(key) { return dateFmt.format(keyToDate(key)); }
  function shortDate(key) { return shortDateFmt.format(keyToDate(key)); }
  function weekday(key) { return weekdayFmt.format(keyToDate(key)); }

  function safeText(value) { return String(value || '').trim(); }

  const coverCache = new Map();
  const START_RE = /^(?:after|from|post)\s+(\d{1,2}(?:[:.]?\d{2})?\s*(?:[ap]m)?)\s*[:,\-\u2013]?\s*(.+)$/i;
  const END_RE = /^(.+?)\s*(?:until|till|before)\s+(\d{1,2}(?:[:.]?\d{2})?\s*(?:[ap]m)?)\s*$/i;

  function parseClock(value) {
    const match = String(value).trim().match(/^(\d{1,2})(?:[:.]?(\d{2}))?\s*([ap]m)?$/i);
    if (!match || (match[2] === undefined && !match[3])) return null;
    let hour = Number(match[1]);
    const minute = match[2] ? Number(match[2]) : 0;
    if (match[3]) {
      if (hour < 1 || hour > 12) return null;
      hour = (hour % 12) + (match[3].toLowerCase() === 'pm' ? 12 : 0);
    }
    return hour < 24 && minute < 60 ? hour * 60 + minute : null;
  }

  function rotaMinute(value) {
    const start = (Number(config.dayStartHour) || 8) * 60;
    return value < start ? value + 1440 : value;
  }

  function coverSegments(value) {
    const raw = safeText(value);
    if (coverCache.has(raw)) return coverCache.get(raw);
    let segments = [];
    let ok = true;
    let nextFrom = -Infinity;
    raw.split('/').map((part) => part.trim()).filter(Boolean).forEach((part) => {
      if (!ok) return;
      let match = part.match(START_RE);
      if (match) {
        const time = parseClock(match[1]);
        if (time === null) { ok = false; return; }
        segments.push({ name: match[2].trim(), from: rotaMinute(time) });
        nextFrom = -Infinity;
        return;
      }
      match = part.match(END_RE);
      if (match) {
        const time = parseClock(match[2]);
        if (time === null) { ok = false; return; }
        segments.push({ name: match[1].trim(), from: nextFrom });
        nextFrom = rotaMinute(time);
        return;
      }
      if (segments.length && nextFrom === -Infinity) { ok = false; return; }
      segments.push({ name: part, from: nextFrom });
      nextFrom = -Infinity;
    });
    if (!ok || segments.length < 2 || segments[0]?.from !== -Infinity) segments = [{ name: raw, from: -Infinity }];
    else segments.sort((a, b) => a.from - b.from);
    coverCache.set(raw, segments);
    return segments;
  }

  function displayTime(value) { return `${String(Math.floor((value % 1440) / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`; }

  function coverAt(value, minute) {
    const segments = coverSegments(value);
    let selected = segments[0];
    for (const segment of segments) if (segment.from <= minute) selected = segment;
    return selected?.name || '';
  }

  function namesHtml(value) {
    const safe = safeText(value);
    if (!safe) return '<span class="role-empty">No entry</span>';
    if (/^#N\/A$/i.test(safe)) return '<span class="role-empty">—</span>';
    const segments = coverSegments(safe);
    if (segments.length === 1) return escapeHtml(safe);
    return segments.map((segment, index) => {
      const timing = index === 0 ? `Until ${displayTime(segments[index + 1].from)}` : `From ${displayTime(segment.from)}`;
      return `<span class="cover-part"><span class="handover-note">${timing}</span>${escapeHtml(segment.name)}</span>`;
    }).join('<span class="cover-separator" aria-hidden="true"> · </span>');
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }

  function activeAssignments(trust, day, minute) {
    const dayStart = (Number(config.dayStartHour) || 8) * 60;
    const nightStart = (Number(config.nightStartHour) || 17) * 60;
    const sourceDay = minute < dayStart ? addDays(day, -1) : day;
    const row = findOnDate(trust, sourceDay);
    if (!row) return null;
    const slot = minute >= dayStart && minute < nightStart ? 'day' : 'night';
    const timeInRotaDay = minute < dayStart ? minute + 1440 : minute;
    const choose = (roles) => {
      const split = roles.filter((role) => /\b(day|night)\b/i.test(role.label));
      const selected = split.length ? split.filter((role) => new RegExp(`\\b${slot}\\b`, 'i').test(role.label)) : roles;
      return selected.map((role) => ({ label: role.label, value: coverAt(role.value, timeInRotaDay) })).filter((role) => safeText(role.value));
    };
    return [...choose(row.registrars), ...choose(row.consultants)];
  }

  function findNextHandover(trust, clock) {
    const current = activeAssignments(trust, clock.day, clock.minute);
    if (!current) return { current: [], next: null, ended: true };
    const roleKey = (label) => label.replace(/\s+(day|night)$/i, '');
    const baseline = new Map(current.map((role) => [roleKey(role.label), role]));
    const handovers = new Map();
    const maxMinutes = 7 * 24 * 60;
    for (let offset = 1; offset <= maxMinutes; offset += 1) {
      const total = clock.minute + offset;
      const day = addDays(clock.day, Math.floor(total / 1440));
      const minute = total % 1440;
      const next = activeAssignments(trust, day, minute);
      if (!next) return { current, next: null, ended: true };
      const nextByLabel = new Map(next.map((role) => [roleKey(role.label), role]));
      for (const [label, role] of baseline) {
        if (!handovers.has(label) && nextByLabel.get(label)?.value !== role.value) handovers.set(label, { day, minute });
      }
      if (handovers.size === baseline.size) break;
    }
    const at = [...handovers.values()].sort((a, b) => a.day.localeCompare(b.day) || a.minute - b.minute)[0] || null;
    const next = at ? activeAssignments(trust, at.day, at.minute) : null;
    const nextByLabel = new Map((next || []).map((role) => [roleKey(role.label), role]));
    const changed = at ? [...handovers.keys()].filter((label) => handovers.get(label).day === at.day && handovers.get(label).minute === at.minute).map((label) => ({ label, value: nextByLabel.get(label)?.value || '' })) : [];
    return { current, next, changed, unchanged: [...baseline.keys()].filter((label) => !changed.some((role) => role.label === label)), at, handovers: Object.fromEntries(handovers), ended: false };
  }

  function handoverWhen(at, today) {
    const time = displayTime(at.minute);
    if (at.day === today) return `${time} today`;
    if (at.day === addDays(today, 1)) return `${time} tomorrow`;
    return `${time} · ${shortDate(at.day)}`;
  }

  function currentSnapshotHtml(trust, snapshot, today) {
    if (!snapshot?.current?.length) return '<div class="current-snapshot"><p class="snapshot-heading">Current cover</p><span class="role-empty">No current rota entry found.</span></div>';
    const minute = londonClock().minute;
    const dayStart = (Number(config.dayStartHour) || 8) * 60;
    const nightStart = (Number(config.nightStartHour) || 17) * 60;
    const shift = minute >= dayStart && minute < nightStart ? 'Day cover' : 'Night cover';
    const groupFor = (label) => /registrar|\bspr\b|\breg\b|\bst[1-8]\b/i.test(label) ? 'Registrars' : 'Consultants';
    const groups = ['Consultants', 'Registrars'].map((title) => {
      const entries = snapshot.current.filter((role) => groupFor(role.label) === title);
      const content = entries.map((role) => {
        const key = role.label.replace(/\s+(day|night)$/i, '');
        const until = snapshot.handovers?.[key];
        const untilText = until ? `Until ${handoverWhen(until, today)}` : snapshot.ended ? 'Until the rota ends' : 'No change in the next 7 days';
        const detail = role.label.replace(/\b(registrars?|spr|reg|st[1-8])\b/ig, '').trim() || 'Cover';
        return `<div class="snapshot-assignment"><p class="snapshot-assignment-label">${escapeHtml(detail)}</p><p class="snapshot-role-name">${namesHtml(role.value)}</p><p class="snapshot-role-until">${escapeHtml(untilText)}</p></div>`;
      }).join('') || '<p class="role-empty snapshot-empty">No rota column</p>';
      return `<div class="snapshot-role-group"><p class="snapshot-group-title">${title}</p>${content}</div>`;
    }).join('');
    let handover = '';
    if (snapshot.changed?.length) {
      const changed = snapshot.changed.map((role) => `<span><strong>${escapeHtml(role.label)}:</strong> ${role.value ? namesHtml(role.value) : '<span class="role-empty">No entry</span>'}</span>`).join('');
      const unchanged = snapshot.unchanged?.map((label) => `<span><strong>${escapeHtml(label)}:</strong> <span class="role-empty">Unchanged</span></span>`).join('') || '';
      handover = `<div class="handover-card"><span><strong>Next handover · ${escapeHtml(handoverWhen(snapshot.at, today))}</strong></span>${changed}${unchanged}</div>`;
    } else {
      const message = snapshot.ended ? 'No further rota entry found.' : 'No change found in the next 7 days.';
      handover = `<div class="handover-card"><span><strong>Next handover</strong></span><span>${message}</span></div>`;
    }
    return `<div class="current-snapshot"><div class="snapshot-heading"><span>${shift}</span><time>${displayTime(minute)}</time></div><div class="snapshot-roles">${groups}</div>${handover}</div>`;
  }

  function glanceText(snapshot, day) {
    if (!snapshot?.current?.length) return dateLabel(day);
    const group = (label) => /registrar|\bspr\b|\breg\b|\bst[1-8]\b/i.test(label) ? 1 : 0;
    return [...snapshot.current].sort((a, b) => group(a.label) - group(b.label)).map((role) => `${role.label.replace('Registrar', 'Reg.')}: ${/^#N\/A$/i.test(safeText(role.value)) ? '—' : role.value}`).join(' · ');
  }

  function collapsedSummaryHtml(trust, snapshot) {
    const isRegistrar = (label) => /registrar|\bspr\b|\breg\b|\bst[1-8]\b/i.test(label);
    const names = (registrar) => {
      const values = (snapshot?.current || []).filter((role) => isRegistrar(role.label) === registrar).map((role) => {
        const value = safeText(role.value);
        return !value || /^#N\/A$/i.test(value) ? '—' : value;
      });
      return values.length ? values.join(' / ') : '—';
    };
    return `<span class="trust-collapsed-summary">
      <span class="collapsed-site">${escapeHtml(trust)}</span>
      <span class="collapsed-role"><span class="collapsed-role-label">Consultant</span><span class="collapsed-role-name">${escapeHtml(names(false))}</span></span>
      <span class="collapsed-role"><span class="collapsed-role-label">Registrar</span><span class="collapsed-role-name">${escapeHtml(names(true))}</span></span>
    </span>`;
  }

  function cardHtml(trust, day, collapsed, compact = false, currentSnapshot = null) {
    const definition = trustConfig[trust] || {};
    const data = findOnDate(trust, day);
    const status = loadState[trust];
    const title = definition.shortLabel || trust;
    const headingId = `${trust.toLowerCase()}-heading-${compact ? 'month' : 'now'}`;
    let body = '';
    if (status === 'unconfigured') {
      body = `<div class="no-source"><span class="no-source-icon" aria-hidden="true">ⓘ</span><span>${trust === 'HGS' ? 'Add the published HGS sheet link in the configuration file to show this rota.' : 'This rota source is not configured.'}</span></div>`;
    } else if (status === 'error' && !data) {
      body = `<div class="no-source"><span class="no-source-icon" aria-hidden="true">!</span><span>${escapeHtml(messages[trust] || 'Rota unavailable.')}</span></div>`;
    } else if (!data) {
      body = currentSnapshot?.current?.length
        ? `${currentSnapshotHtml(trust, currentSnapshot, todayKey())}<div class="no-source"><span class="no-source-icon" aria-hidden="true">i</span><span>No rota entry was found for today.</span></div>`
        : `<div class="no-source"><span class="no-source-icon" aria-hidden="true">i</span><span>No rota entry was found for this date.</span></div>`;
    } else {
      const dayStart = (Number(config.dayStartHour) || 8) * 60;
      const nightStart = (Number(config.nightStartHour) || 17) * 60;
      const groups = [{ title: 'Consultants', roles: data.consultants }, { title: 'Registrars', roles: data.registrars }];
      body = `${currentSnapshot ? currentSnapshotHtml(trust, currentSnapshot, todayKey()) + '<p class="full-rota-label">Full rota today</p>' : ''}<div class="role-grid">${groups.map((group) => `<div class="role-card"><p class="role-label">${group.title}</p>${group.roles.length ? group.roles.map((role) => {
        const slot = /\bnight\b/i.test(role.label) ? `${String(nightStart / 60).padStart(2, '0')}:00–${String(dayStart / 60).padStart(2, '0')}:00` : /\bday\b/i.test(role.label) ? `${String(dayStart / 60).padStart(2, '0')}:00–${String(nightStart / 60).padStart(2, '0')}:00` : '';
        const detail = role.label.replace(/\b(registrars?|spr|reg|st[1-8]|consultant)\b/ig, '').trim() || 'Cover';
        return `<div class="role-assignment"><p class="role-assignment-label">${escapeHtml(detail)}${slot ? `<span class="role-period">${slot}</span>` : ''}</p><p class="role-name">${namesHtml(role.value)}</p></div>`;
      }).join('') : `<p class="role-name role-empty">No ${group.title.toLocaleLowerCase('en-GB').replace(/s$/, '')} column</p>`}</div>`).join('')}</div>`;
    }
    return `<article class="trust-card${collapsed ? ' is-collapsed' : ''}" data-trust="${trust}">
      <button class="trust-toggle" type="button" aria-expanded="${!collapsed}" aria-controls="${headingId}-body">
        ${collapsedSummaryHtml(title, currentSnapshot)}
        <span class="trust-header-primary"><span class="trust-emblem" aria-hidden="true">${escapeHtml(title)}</span>
        <span class="trust-title-wrap"><span id="${headingId}" class="trust-title">${escapeHtml(definition.label || trust)}</span><span class="trust-summary">${escapeHtml(currentSnapshot ? glanceText(currentSnapshot, day) : dateLabel(day))}</span></span></span>
        <span class="trust-chevron" aria-hidden="true">⌄</span>
      </button>
      <div id="${headingId}-body" class="trust-body">${body}</div>
    </article>`;
  }

  function renderNow() {
    const clock = londonClock();
    const day = clock.day;
    ui.currentDate.textContent = dateLabel(day);
    const errors = trustOrder.filter((trust) => loadState[trust] === 'error').map((trust) => `${trust}: ${messages[trust]}`);
    const fallbackNotes = trustOrder.filter((trust) => loadState[trust] === 'fallback').map((trust) => messages[trust]);
    const errorHtml = `${errors.length ? `<div class="error-banner">${errors.map(escapeHtml).join('<br>')}</div>` : ''}${fallbackNotes.length ? `<div class="fallback-banner">${fallbackNotes.map(escapeHtml).join('<br>')}</div>` : ''}`;
    const hasAny = trustOrder.some((trust) => findOnDate(trust, day));
    const order = getTrustOrder();
    const snapshots = Object.fromEntries(trustOrder.map((trust) => [trust, findNextHandover(trust, clock)]));
    liveSnapshots = snapshots;
    const hasCurrent = Object.values(snapshots).some((snapshot) => snapshot.current.length);
    ui.nowList.innerHTML = `${errorHtml}${!hasAny && !hasCurrent && trustOrder.every((trust) => ['fresh', 'cached', 'fallback'].includes(loadState[trust])) ? '<div class="empty-day"><strong>No rota entries found for today</strong>Check the coming-month view or refresh the published sheets.</div>' : ''}${order.map((trust) => cardHtml(trust, day, !isInitiallyOpen(trust), false, snapshots[trust])).join('')}`;
    bindCardToggles(ui.nowList);
  }

  function renderMonth() {
    const start = todayKey();
    const end = lookaheadEnd(start);
    ui.monthTitle.textContent = 'Coming month';
    const query = ui.search.value.trim().toLocaleLowerCase('en-GB');
    ui.clearSearch.hidden = !query;
    const order = getTrustOrder();
    const matchingDays = [];
    for (let day = start; day <= end; day = addDays(day, 1)) {
      if (!query || dayMatchesSearch(day, query, start)) matchingDays.push(day);
    }
    const queryChanged = query !== lastMonthQuery;
    if (queryChanged) showAllSearchResults = false;
    if (query && queryChanged && matchingDays.length) { selectedMonthDate = matchingDays[0]; dateSectionOpen = true; }
    lastMonthQuery = query;
    if (!selectedMonthDate || selectedMonthDate < start || selectedMonthDate > end) selectedMonthDate = matchingDays[0] || start;
    ui.dateSectionToggle.setAttribute('aria-expanded', String(dateSectionOpen));
    ui.dateSectionToggle.classList.toggle('is-open', dateSectionOpen);
    ui.dateSectionContent.hidden = !dateSectionOpen;
    if (!visibleMonthStart || (query && queryChanged && matchingDays.length)) visibleMonthStart = monthStart(selectedMonthDate);
    if (query) renderSearchResults(query, matchingDays);
    else { ui.searchResults.hidden = true; ui.searchResults.innerHTML = ''; }
    ui.monthCaption.textContent = query
      ? (matchingDays.length ? `${matchingDays.length} matching date${matchingDays.length === 1 ? '' : 's'} · tap a date to see the rota` : 'No dates match your search')
      : `Browse the next ${lookaheadMonths(start, end)} months · tap a date to see the rota`;
    renderMonthGrid(start, end, visibleMonthStart, query, matchingDays);
    ui.selectedDateTitle.textContent = dateLabel(selectedMonthDate);
    ui.previousDate.disabled = selectedMonthDate <= start;
    ui.nextDate.disabled = selectedMonthDate >= end;
    const selectedSnapshots = selectedMonthDate === start ? liveSnapshots : {};
    ui.monthList.innerHTML = order.map((trust) => cardHtml(trust, selectedMonthDate, false, true, selectedSnapshots[trust] || null)).join('');
    bindCardToggles(ui.monthList);
    renderNextDays(start, end);
  }

  function renderNextDays(start, end) {
    const last = [end, addDays(start, 29)].sort()[0];
    const dates = [];
    for (let day = start; day <= last; day = addDays(day, 1)) dates.push(day);
    const filter = getNextDaysFilter();
    ui.nextDaysToggle.setAttribute('aria-expanded', String(nextDaysOpen));
    ui.nextDaysFilter.hidden = !nextDaysOpen;
    ui.nextDaysList.hidden = !nextDaysOpen;
    ui.nextDaysToggle.classList.toggle('is-open', nextDaysOpen);
    ui.nextDaysFilter.querySelectorAll('[data-next-filter]').forEach((button) => {
      const selected = button.dataset.nextFilter === filter;
      button.setAttribute('aria-pressed', String(selected));
      button.classList.toggle('is-active', selected);
    });
    if (!nextDaysOpen) { ui.nextDaysList.innerHTML = ''; return; }
    const sites = filter === 'BOTH' ? getTrustOrder() : [filter];
    const both = filter === 'BOTH';
    ui.nextDaysList.innerHTML = dates.map((day) => {
      const weekend = [0, 6].includes(keyToDate(day).getUTCDay());
      const selected = day === selectedMonthDate;
      const today = day === start;
      const classes = ['next-days-card', both ? 'both-view' : 'single-view'];
      if (weekend) classes.push('is-weekend');
      if (selected) classes.push('is-selected');
      if (today) classes.push('is-today');
      if (both) {
        const rows = sites.map((trust) => compactSiteRow(trust, day)).join('');
        return `<button class="${classes.join(' ')}" type="button" data-next-date="${day}">
          <span class="next-days-date-top">${escapeHtml(`${weekday(day)} ${shortDate(day)}`)}</span>
          <span class="next-days-columns both-columns"><span></span><span>Consultant</span><span>Registrar</span></span>
          ${rows}</button>`;
      }
      const trust = sites[0];
      const row = findOnDate(trust, day);
      return `<button class="${classes.join(' ')}" type="button" data-next-date="${day}">
        <span class="next-days-date-side"><span class="next-days-site">${escapeHtml(trust)}</span><span>${escapeHtml(weekday(day))}</span><span>${escapeHtml(shortDate(day))}</span></span>
        <span class="next-days-single-content"><span class="next-days-columns single-columns"><span>Consultant</span><span>Registrar</span></span>
        <span class="next-days-values"><span class="next-days-consultant">${compactConsultantsHtml(row?.consultants || [])}</span><span class="next-days-registrar">${compactRegistrarsHtml(row?.registrars || [])}</span></span></span>
      </button>`;
    }).join('');
    ui.nextDaysList.querySelectorAll('[data-next-date]').forEach((button) => button.addEventListener('click', () => {
      selectedMonthDate = button.dataset.nextDate;
      visibleMonthStart = monthStart(selectedMonthDate);
      dateSectionOpen = true;
      renderMonth();
      ui.selectedDateTitle.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  }

  function missingRotaValue(value) { return !safeText(value) || /^#N\/A$/i.test(safeText(value)); }

  function compactCoverHtml(value) {
    const raw = safeText(value);
    if (missingRotaValue(raw)) return '<span class="lookahead-dash">—</span>';
    const parsed = coverSegments(raw);
    let periods;
    if (parsed.length > 1) {
      periods = parsed.map((part, index) => ({
        name: part.name,
        label: index === 0 ? `Until ${displayTime(parsed[index + 1].from)}` : `From ${displayTime(part.from)}`
      }));
    } else {
      const time = '(\\d{1,2}(?:[:.]\\d{2})?)';
      const slotPattern = new RegExp(`^\\s*${time}\\s*[-–]\\s*${time}\\s+(.+?)\\s*$`);
      const slots = raw.split(/;|\n+/).map((part) => part.trim()).filter(Boolean).map((part) => {
        const match = part.match(slotPattern);
        if (!match) return null;
        const from = parseClock(match[1]), to = parseClock(match[2]);
        return from === null || to === null ? null : { from, to, name: match[3] };
      });
      periods = slots.length > 1 && slots.every(Boolean) ? slots.map((part, index) => ({
        name: part.name,
        label: index === 0 ? `Until ${displayTime(part.to)}` : `From ${displayTime(part.from)}`
      })) : [{ name: raw, label: '' }];
    }
    return periods.map((part) => `<span class="consultant-period">${part.label ? `<span class="consultant-period-time">${escapeHtml(part.label)}</span>` : ''}<span>${escapeHtml(part.name)}</span></span>`).join('');
  }

  function compactConsultantsHtml(roles) {
    const day = roles.find((role) => /day/i.test(role.label));
    const night = roles.find((role) => /night/i.test(role.label));
    if (day && night) {
      if (missingRotaValue(day.value) && missingRotaValue(night.value)) return '<span class="lookahead-dash">—</span>';
      if (!missingRotaValue(day.value) && !missingRotaValue(night.value) && safeText(day.value).toLocaleLowerCase('en-GB') === safeText(night.value).toLocaleLowerCase('en-GB')) return compactCoverHtml(day.value);
      return `<span class="consultant-shift"><span class="consultant-shift-label">Day</span>${compactCoverHtml(day.value)}</span><span class="consultant-shift"><span class="consultant-shift-label">Night</span>${compactCoverHtml(night.value)}</span>`;
    }
    const usable = roles.filter((role) => safeText(role.value));
    return usable.length ? usable.map((role) => compactCoverHtml(role.value)).join('') : '<span class="lookahead-dash">—</span>';
  }

  function compactRegistrarsHtml(roles) {
    const day = roles.find((role) => /day/i.test(role.label));
    const night = roles.find((role) => /night/i.test(role.label));
    if (day && night) {
      if (missingRotaValue(day.value) && missingRotaValue(night.value)) return '<span class="lookahead-dash">—</span>';
      if (!missingRotaValue(day.value) && !missingRotaValue(night.value) && safeText(day.value).toLocaleLowerCase('en-GB') === safeText(night.value).toLocaleLowerCase('en-GB')) return `<span>${escapeHtml(safeText(day.value))}</span>`;
      return `<span>${missingRotaValue(day.value) ? '<span class="lookahead-dash">—</span>' : escapeHtml(safeText(day.value))}</span><span class="registrar-divider"> / </span><span>${missingRotaValue(night.value) ? '<span class="lookahead-dash">—</span>' : escapeHtml(safeText(night.value))}</span>`;
    }
    const usable = roles.filter((role) => safeText(role.value));
    return usable.length ? usable.map((role) => missingRotaValue(role.value) ? '<span class="lookahead-dash">—</span>' : `<span>${escapeHtml(safeText(role.value))}</span>`).join('<span class="registrar-divider"> / </span>') : '<span class="lookahead-dash">—</span>';
  }

  function compactSiteRow(trust, day) {
    const row = findOnDate(trust, day);
    return `<span class="next-days-site-row"><span class="next-days-site">${escapeHtml(trust)}</span><span class="next-days-consultant">${compactConsultantsHtml(row?.consultants || [])}</span><span class="next-days-registrar">${compactRegistrarsHtml(row?.registrars || [])}</span></span>`;
  }

  function navigateDate(amount) {
    const start = todayKey();
    const end = lookaheadEnd(start);
    const target = addDays(selectedMonthDate || start, amount);
    if (target < start || target > end) return;
    selectedMonthDate = target;
    visibleMonthStart = monthStart(target);
    dateSectionOpen = true;
    renderMonth();
  }

  function dayMatchesSearch(day, query, start) {
    if (query === 'today') return day === start;
    if (query === 'tomorrow') return day === addDays(start, 1);
    if (dateKey(query) === day) return true;
    const shortNumeric = query.match(/^(\d{1,2})[/-](\d{1,2})$/);
    if (shortNumeric) {
      const date = keyToDate(day);
      return date.getUTCDate() === Number(shortNumeric[1]) && date.getUTCMonth() + 1 === Number(shortNumeric[2]);
    }
    const text = `${dateLabel(day)} ${trustOrder.map((trust) => {
      const row = findOnDate(trust, day);
      return [...(row?.registrars || []), ...(row?.consultants || [])].map((role) => `${role.label} ${role.value}`).join(' ');
    }).join(' ')}`.toLocaleLowerCase('en-GB');
    return text.includes(query) || query.split(/\s+/).every((term) => text.includes(term));
  }

  function highlightMatch(value, query) {
    const text = String(value || '');
    const terms = query.trim().split(/\s+/).filter(Boolean).sort((a, b) => b.length - a.length);
    if (!terms.length) return escapeHtml(text);
    const pattern = new RegExp(`(${terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
    return text.split(pattern).map((part) => terms.some((term) => part.toLocaleLowerCase('en-GB') === term.toLocaleLowerCase('en-GB')) ? `<mark>${escapeHtml(part)}</mark>` : escapeHtml(part)).join('');
  }

  function renderSearchResults(query, matchingDays) {
    ui.searchResults.hidden = false;
    const daysWithRota = matchingDays.filter((day) => trustOrder.some((trust) => findOnDate(trust, day)));
    const shown = showAllSearchResults ? daysWithRota : daysWithRota.slice(0, 12);
    const rows = shown.map((day) => {
      const weekend = [0, 6].includes(keyToDate(day).getUTCDay());
      const summaries = getTrustOrder().map((trust) => {
        const row = findOnDate(trust, day);
        if (!row) return '';
        const matches = [...row.registrars, ...row.consultants].filter((role) => safeText(role.value));
        if (!matches.length) return '';
        return `<span class="search-trust"><strong>${escapeHtml(trust)}:</strong> ${matches.map((role) => `${escapeHtml(role.label)} ${highlightMatch(role.value, query)}`).join(' · ')}</span>`;
      }).filter(Boolean).join(' ');
      return `<button class="search-result${weekend ? ' is-weekend' : ''}" type="button" data-search-date="${day}"><span class="search-result-date">${highlightMatch(`${weekday(day)} ${shortDate(day)}`, query)}</span><span class="search-result-roles">${summaries || '<span class="role-empty">Rota entry</span>'}</span></button>`;
    }).join('');
    const more = daysWithRota.length > shown.length ? `<button class="search-result-more" type="button" id="show-all-results">Show all ${daysWithRota.length} matching dates</button>` : '';
    ui.searchResults.innerHTML = `<p class="search-result-count">${daysWithRota.length} rota match${daysWithRota.length === 1 ? '' : 'es'}${matchingDays.length !== daysWithRota.length ? ` · ${matchingDays.length} matching date${matchingDays.length === 1 ? '' : 's'}` : ''}</p>${rows || '<p class="no-results">No matching rota entries found.</p>'}${more}`;
    ui.searchResults.querySelectorAll('[data-search-date]').forEach((button) => {
      button.addEventListener('click', () => {
        selectedMonthDate = button.dataset.searchDate;
        visibleMonthStart = monthStart(selectedMonthDate);
        dateSectionOpen = true;
        renderMonth();
        ui.selectedDateTitle.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    ui.searchResults.querySelector('#show-all-results')?.addEventListener('click', () => { showAllSearchResults = true; renderMonth(); });
  }

  function renderMonthGrid(rangeStart, rangeEnd, month, query, matchingDays) {
    const lastDay = monthEnd(month);
    const weekdayOffset = (keyToDate(month).getUTCDay() + 6) % 7;
    const gridStart = addDays(month, -weekdayOffset);
    const gridEndOffset = 6 - ((keyToDate(lastDay).getUTCDay() + 6) % 7);
    const gridEnd = addDays(lastDay, gridEndOffset);
    ui.calendarMonthText.textContent = monthFmt.format(keyToDate(month));
    ui.calendarMonthLabel.setAttribute('aria-expanded', String(calendarPickerOpen));
    ui.calendarPicker.hidden = !calendarPickerOpen;
    renderCalendarMonthPicker(rangeStart, rangeEnd, month);
    const previousStart = shiftMonth(month, -1);
    const nextStart = shiftMonth(month, 1);
    ui.previousMonth.disabled = monthEnd(previousStart) < rangeStart;
    ui.nextMonth.disabled = nextStart > rangeEnd;
    const matched = new Set(matchingDays);
    const buttons = [];
    for (let day = gridStart; day <= gridEnd; day = addDays(day, 1)) {
      const insideMonth = day >= month && day <= lastDay;
      const insideRange = day >= rangeStart && day <= rangeEnd;
      const available = insideMonth && insideRange;
      const rowExists = trustOrder.some((trust) => findOnDate(trust, day));
      const selected = day === selectedMonthDate;
      const classes = ['calendar-day'];
      if ([0, 6].includes(keyToDate(day).getUTCDay())) classes.push('is-weekend');
      if (!insideMonth) classes.push('is-outside');
      else if (!insideRange) classes.push('is-unavailable');
      if (selected) classes.push('is-selected');
      if (day === rangeStart) classes.push('is-today');
      if (query && available && !matched.has(day)) classes.push('is-search-dim');
      const dayNumber = keyToDate(day).getUTCDate();
      const summary = trustOrder.map((trust) => {
        const row = findOnDate(trust, day);
        return [...(row?.registrars || []), ...(row?.consultants || [])].filter((role) => safeText(role.value)).map((role) => `${role.label}: ${role.value}`).join(', ');
      }).filter(Boolean).join('. ');
      const accessible = `${dateLabel(day)}${summary ? `. ${summary}` : '. No rota entry found.'}`;
      buttons.push(`<button class="${classes.join(' ')}" type="button" data-date="${day}" aria-label="${escapeHtml(accessible)}" aria-pressed="${selected}"${available ? '' : ' disabled'}><span>${dayNumber}</span>${rowExists ? '<i class="calendar-dot" aria-hidden="true"></i>' : ''}</button>`);
    }
    ui.monthGrid.innerHTML = buttons.join('');
    ui.monthGrid.querySelectorAll('.calendar-day:not(:disabled)').forEach((button) => {
      button.addEventListener('click', () => {
        selectedMonthDate = button.dataset.date;
        visibleMonthStart = monthStart(selectedMonthDate);
        dateSectionOpen = true;
        renderMonth();
        ui.selectedDateTitle.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  function availableCalendarMonths(rangeStart, rangeEnd) {
    const months = new Set();
    trustOrder.forEach((trust) => records[trust].forEach((row) => {
      if (row.date >= rangeStart && row.date <= rangeEnd) months.add(monthStart(row.date));
    }));
    return [...months].sort();
  }

  function renderCalendarMonthPicker(rangeStart, rangeEnd, visibleMonth) {
    const available = availableCalendarMonths(rangeStart, rangeEnd);
    const years = [...new Set(available.map((month) => month.slice(0, 4)))];
    const visibleYear = visibleMonth.slice(0, 4);
    const pickerYear = years.includes(visibleYear) ? visibleYear : (years[0] || visibleYear);
    ui.calendarYearSelect.disabled = !years.length;
    ui.calendarYearSelect.innerHTML = years.length
      ? years.map((year) => `<option value="${year}"${year === pickerYear ? ' selected' : ''}>${year}</option>`).join('')
      : '<option value="">No rota data</option>';
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentMonth = monthStart(todayKey());
    ui.calendarMonthOptions.innerHTML = monthNames.map((name, index) => {
      const key = `${pickerYear}-${String(index + 1).padStart(2, '0')}-01`;
      const enabled = available.includes(key);
      const classes = ['calendar-month-option'];
      if (key === currentMonth) classes.push('is-current');
      if (key === visibleMonth) classes.push('is-selected');
      return `<button class="${classes.join(' ')}" type="button" data-picker-month="${key}"${key === currentMonth ? ' aria-current="date"' : ''}${enabled ? '' : ' disabled'}>${name}</button>`;
    }).join('');
  }

  function navigateToMonth(month, rangeStart = todayKey(), rangeEnd = lookaheadEnd(rangeStart)) {
    visibleMonthStart = month;
    const dates = trustOrder.flatMap((trust) => records[trust].map((row) => row.date))
      .filter((day) => day >= month && day < shiftMonth(month, 1) && day >= rangeStart && day <= rangeEnd).sort();
    selectedMonthDate = dates[0] || (month < rangeStart ? rangeStart : month > rangeEnd ? rangeEnd : month);
    calendarPickerOpen = false;
    dateSectionOpen = true;
    renderMonth();
  }

  function navigateToYear(year) {
    const start = todayKey();
    const end = lookaheadEnd(start);
    const months = availableCalendarMonths(start, end).filter((month) => month.startsWith(`${year}-`));
    if (months.length) {
      visibleMonthStart = months[0];
      const dates = trustOrder.flatMap((trust) => records[trust].map((row) => row.date))
        .filter((day) => day >= months[0] && day < shiftMonth(months[0], 1) && day >= start && day <= end).sort();
      selectedMonthDate = dates[0] || months[0];
      dateSectionOpen = true;
      calendarPickerOpen = true;
      renderMonth();
    }
  }

  function closeCalendarPicker() {
    calendarPickerOpen = false;
    ui.calendarPicker.hidden = true;
    ui.calendarMonthLabel.setAttribute('aria-expanded', 'false');
  }

  function navigateMonth(amount) {
    const start = todayKey();
    const end = lookaheadEnd(start);
    visibleMonthStart = shiftMonth(visibleMonthStart, amount);
    selectedMonthDate = visibleMonthStart < start ? start : visibleMonthStart > end ? end : visibleMonthStart;
    calendarPickerOpen = false;
    dateSectionOpen = true;
    renderMonth();
  }

  function getTrustOrder() {
    const first = readDisplaySettings()?.first || queryFirstSite() || 'HGS';
    return first === 'QE' ? ['QE', 'HGS'] : ['HGS', 'QE'];
  }

  function getNextDaysFilter() {
    if (nextDaysSiteFilter) return nextDaysSiteFilter;
    const saved = readDisplaySettings();
    nextDaysSiteFilter = saved?.lookaheadFilter || saved?.first || queryFirstSite() || 'BOTH';
    return nextDaysSiteFilter;
  }

  function saveNextDaysFilter(filter) {
    const saved = readDisplaySettings();
    const queryFirst = queryFirstSite();
    const first = filter === 'HGS' || filter === 'QE' ? filter : saved?.first || queryFirst || 'HGS';
    const open = saved?.open || { QE: false, HGS: false };
    const value = { first, open, lookaheadFilter: filter };
    nextDaysSiteFilter = filter;
    try { localStorage.setItem('oncall:display-settings', JSON.stringify(value)); } catch {}
    renderNow();
    renderMonth();
  }

  function queryFirstSite() {
    const first = new URLSearchParams(window.location.search).get('first')?.toUpperCase();
    return first === 'QE' || first === 'HGS' ? first : null;
  }

  function readDisplaySettings() {
    try {
      const value = JSON.parse(localStorage.getItem('oncall:display-settings') || 'null');
      if (!value || !['QE', 'HGS'].includes(value.first)) return null;
      const lookaheadFilter = ['BOTH', 'QE', 'HGS'].includes(value.lookaheadFilter) ? value.lookaheadFilter : value.first;
      return { first: value.first, open: { QE: !!value.open?.QE, HGS: !!value.open?.HGS }, lookaheadFilter };
    } catch { return null; }
  }

  function isInitiallyOpen(trust) {
    const saved = readDisplaySettings();
    return saved ? saved.open[trust] : false;
  }

  function settingsDraft() {
    const saved = readDisplaySettings();
    if (saved) return saved;
    const first = queryFirstSite() || 'HGS';
    return { first, open: { QE: false, HGS: false }, lookaheadFilter: queryFirstSite() || 'BOTH' };
  }

  function openSettings() {
    const draft = settingsDraft();
    ui.firstSiteSetting.value = draft.first;
    ui.defaultSiteFilterSetting.value = draft.lookaheadFilter;
    ui.qeOpenSetting.checked = draft.open.QE;
    ui.hgsOpenSetting.checked = draft.open.HGS;
    ui.settingsDialog.showModal();
  }

  function saveSettings() {
    const lookaheadFilter = ui.defaultSiteFilterSetting.value;
    const first = lookaheadFilter === 'HGS' || lookaheadFilter === 'QE' ? lookaheadFilter : ui.firstSiteSetting.value;
    const value = { first, open: { QE: ui.qeOpenSetting.checked, HGS: ui.hgsOpenSetting.checked }, lookaheadFilter };
    nextDaysSiteFilter = lookaheadFilter;
    try { localStorage.setItem('oncall:display-settings', JSON.stringify(value)); } catch {}
    ui.settingsDialog.close();
    renderNow();
    renderMonth();
  }

  function bindCardToggles(root) {
    root.querySelectorAll('.trust-toggle').forEach((button) => {
      button.addEventListener('click', () => {
        const card = button.closest('.trust-card');
        const collapsed = card.classList.toggle('is-collapsed');
        button.setAttribute('aria-expanded', String(!collapsed));
      });
    });
  }

  function updateFreshness() {
    const cachedTimes = trustOrder.map((trust) => {
      try { return JSON.parse(localStorage.getItem(cacheKey(trust)) || 'null')?.savedAt || 0; } catch { return 0; }
    }).filter(Boolean);
    const stamp = lastFetch || (cachedTimes.length ? Math.min(...cachedTimes) : 0);
    const stale = !navigator.onLine || trustOrder.some((trust) => loadState[trust] === 'cached' || loadState[trust] === 'error');
    ui.updatedPill.classList.toggle('is-stale', stale);
    if (!stamp) ui.updated.textContent = 'Waiting for published rota';
    else if (loadState.HGS === 'unconfigured') ui.updated.textContent = `QE updated ${timeFmt.format(new Date(stamp))}`;
    else ui.updated.textContent = `${stale ? 'Saved' : 'Updated'} ${timeFmt.format(new Date(stamp))}`;
    ui.network.textContent = !navigator.onLine ? 'Offline · showing saved data' : trustOrder.some((trust) => loadState[trust] === 'error') ? 'Some rota data unavailable' : trustOrder.every((trust) => loadState[trust] !== 'loading') ? 'Connected' : 'Loading rota…';
  }

  function render() {
    const now = new Date();
    ui.todayLabel.textContent = dateFmt.format(now);
    renderNow();
    renderMonth();
    updateFreshness();
  }

  function setView(view) {
    const month = view === 'month';
    ui.nowView.hidden = month; ui.monthView.hidden = !month;
    ui.nowTab.classList.toggle('is-active', !month); ui.monthTab.classList.toggle('is-active', month);
    ui.nowTab.setAttribute('aria-selected', String(!month)); ui.monthTab.setAttribute('aria-selected', String(month));
  }

  ui.nowTab.addEventListener('click', () => setView('now'));
  ui.monthTab.addEventListener('click', () => setView('month'));
  ui.previousMonth.addEventListener('click', () => navigateMonth(-1));
  ui.nextMonth.addEventListener('click', () => navigateMonth(1));
  ui.calendarMonthLabel.addEventListener('click', () => {
    calendarPickerOpen = !calendarPickerOpen;
    renderMonth();
  });
  ui.calendarYearSelect.addEventListener('change', () => navigateToYear(ui.calendarYearSelect.value));
  ui.calendarMonthOptions.addEventListener('click', (event) => {
    const button = event.target.closest('[data-picker-month]:not(:disabled)');
    if (button) navigateToMonth(button.dataset.pickerMonth);
  });
  ui.calendarToday.addEventListener('click', () => navigateToMonth(monthStart(todayKey())));
  ui.calendarPickerClose.addEventListener('click', closeCalendarPicker);
  document.addEventListener('click', (event) => {
    if (!calendarPickerOpen || ui.calendarPicker.contains(event.target) || ui.calendarMonthLabel.contains(event.target)) return;
    closeCalendarPicker();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && calendarPickerOpen) closeCalendarPicker();
  });
  ui.previousDate.addEventListener('click', () => navigateDate(-1));
  ui.nextDate.addEventListener('click', () => navigateDate(1));
  ui.dateSectionToggle.addEventListener('click', () => { dateSectionOpen = !dateSectionOpen; renderMonth(); });
  ui.nextDaysToggle.addEventListener('click', () => { nextDaysOpen = !nextDaysOpen; renderMonth(); });
  ui.nextDaysFilter.querySelectorAll('[data-next-filter]').forEach((button) => button.addEventListener('click', () => saveNextDaysFilter(button.dataset.nextFilter)));
  ui.defaultSiteFilterSetting.addEventListener('change', () => {
    if (ui.defaultSiteFilterSetting.value === 'HGS' || ui.defaultSiteFilterSetting.value === 'QE') ui.firstSiteSetting.value = ui.defaultSiteFilterSetting.value;
  });
  ui.firstSiteSetting.addEventListener('change', () => {
    if (ui.defaultSiteFilterSetting.value !== 'BOTH') ui.defaultSiteFilterSetting.value = ui.firstSiteSetting.value;
  });
  ui.refresh.addEventListener('click', refreshData);
  ui.footerRefresh.addEventListener('click', refreshData);
  ui.search.addEventListener('input', renderMonth);
  ui.clearSearch.addEventListener('click', () => { ui.search.value = ''; renderMonth(); ui.search.focus(); });
  ui.settings.addEventListener('click', openSettings);
  ui.closeSettings.addEventListener('click', () => ui.settingsDialog.close());
  ui.cancelSettings.addEventListener('click', () => ui.settingsDialog.close());
  ui.saveSettings.addEventListener('click', saveSettings);
  ui.settingsDialog.addEventListener('click', (event) => { if (event.target === ui.settingsDialog) ui.settingsDialog.close(); });
  const themes = ['auto', 'light', 'dark'];
  let theme = 'auto';
  try { theme = themes.includes(localStorage.getItem('oncall:theme')) ? localStorage.getItem('oncall:theme') : 'auto'; } catch {}
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)');
  function syncThemeMeta() {
    if (!themeMeta) return;
    const dark = theme === 'dark' || (theme === 'auto' && systemDark?.matches);
    themeMeta.content = dark ? '#0d1215' : '#1c2327';
  }
  function setTheme(value) {
    theme = value;
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.dataset.theme = theme;
    const label = theme[0].toUpperCase() + theme.slice(1);
    ui.theme.textContent = label;
    ui.theme.setAttribute('aria-label', `Colour theme: ${label}. Activate to change.`);
    ui.theme.title = `Colour theme: ${label}`;
    try { localStorage.setItem('oncall:theme', theme); } catch {}
    syncThemeMeta();
  }
  setTheme(theme);
  ui.theme.addEventListener('click', () => setTheme(themes[(themes.indexOf(theme) + 1) % themes.length]));
  systemDark?.addEventListener?.('change', () => { if (theme === 'auto') syncThemeMeta(); });
  window.addEventListener('online', () => { ui.network.textContent = 'Back online'; refreshData(); });
  window.addEventListener('offline', updateFreshness);
  window.addEventListener('focus', () => {
    if (!lastFetch || Date.now() - lastFetch > (Number(config.refreshEveryMs) || 300000)) refreshData();
  });
  window.setInterval(() => {
    if (navigator.onLine) refreshData();
  }, Number(config.refreshEveryMs) || 300000);

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault(); installPrompt = event; ui.install.hidden = false;
  });
  ui.install.addEventListener('click', async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null; ui.install.hidden = true;
  });
  window.addEventListener('appinstalled', () => { ui.install.hidden = true; });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }

  const savedQuery = new URLSearchParams(window.location.search).get('view');
  setView(savedQuery === 'month' ? 'month' : 'now');
  render();
  refreshData();
  window.setInterval(renderNow, 60000);
})();
