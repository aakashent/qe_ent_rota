const config = require('../config.js');

const DAY_MS = 86400000;
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function dateKey(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  let m = raw.match(/^Date\((\d+),(\d+),(\d+)/);
  if (m) return makeKey(+m[1], +m[2] + 1, +m[3]);
  m = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return makeKey(+m[1], +m[2], +m[3]);
  m = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) return makeKey(expandYear(+m[3]), +m[2], +m[1]);
  m = raw.match(/(?:^[A-Za-z]{3,9}\s+)?(\d{1,2})[\s-]+([A-Za-z]{3,9})[\s,-]+(\d{2,4})/);
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()]) return makeKey(expandYear(+m[3]), MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1]);
  m = raw.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{2,4})$/);
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) return makeKey(expandYear(+m[3]), MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2]);
  return null;
}

function expandYear(year) { return year < 100 ? 2000 + year : year; }
function makeKey(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day, 12));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function responseMatrix(text) {
  const start = text.indexOf('('), end = text.lastIndexOf(')');
  if (start < 0 || end <= start) throw new Error('Google returned an unexpected sheet response.');
  const payload = JSON.parse(text.slice(start + 1, end));
  if (payload.status === 'error') throw new Error(payload.errors?.[0]?.detailed_message || payload.errors?.[0]?.message || 'Google could not read the sheet.');
  const table = payload.table;
  if (!table) throw new Error('The sheet returned no table data.');
  const cellText = (cell) => cell ? String(cell.f != null ? cell.f : cell.v != null ? cell.v : '') : '';
  return [table.cols.map((col) => col.label || '')].concat((table.rows || []).map((row) => (row.c || []).map(cellText)));
}

async function getMatrix(definition, sheetName) {
  if (!definition.spreadsheetId) throw new Error('No spreadsheet is configured.');
  const params = new URLSearchParams({ tqx: 'out:json', sheet: sheetName, headers: '1', _: String(Date.now()) });
  const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(definition.spreadsheetId)}/gviz/tq?${params}`;
  const response = await fetch(url, { headers: { accept: 'application/json,text/plain' }, cache: 'no-store' });
  if (!response.ok) throw new Error(`Google returned ${response.status} for ${sheetName}.`);
  const text = await response.text();
  if (/<!doctype html|<html/i.test(text.slice(0, 300))) throw new Error(`Google did not publish the ${sheetName} tab.`);
  return responseMatrix(text);
}

function parseLongSource(matrix, source) {
  const rows = matrix.slice(1);
  const cell = (row, index) => String(row[index] ?? '').trim();
  const out = [];
  for (const row of rows) {
    const date = dateKey(cell(row, 0));
    if (!date) continue;
    if (source.kind === 'qe-registrars') out.push({ date, consultants: [], registrars: [
      { label: 'Registrar day', value: cell(row, 12) }, { label: 'Registrar night', value: cell(row, 13) }
    ] });
    else if (source.kind === 'hgs-registrars') out.push({ date, consultants: [], registrars: [
      { label: 'Registrar day', value: cell(row, 2) }, { label: 'Registrar night', value: cell(row, 3) }
    ] });
    else if (source.kind === 'qe-consultants') out.push({ date, consultants: [{ label: 'Consultant', value: cell(row, 2) }], registrars: [] });
    else if (source.kind === 'hgs-consultants') out.push({ date, consultants: [
      { label: 'Consultant day', value: cell(row, 4) }, { label: 'Consultant night', value: cell(row, 5) }
    ], registrars: [] });
  }
  if (!out.length) throw new Error(`No dated rows were found in ${source.sheetName}.`);
  return out;
}

function normaliseHeader(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function parseFallback(matrix) {
  const headerIndex = matrix.findIndex((row, index) => index < 15 && row.some((cell) => /^\s*date\s*$/i.test(cell)));
  const headers = (matrix[headerIndex < 0 ? 0 : headerIndex] || []).map(normaliseHeader);
  const find = (re, fallback) => { const index = headers.findIndex((value) => re.test(value)); return index < 0 ? fallback : index; };
  const dateCol = find(/date/, 0), dayCol = find(/\bday\b/, 1), nightCol = find(/\bnight\b/, 2), consultantCol = find(/consultant/, 3);
  return matrix.slice((headerIndex < 0 ? 0 : headerIndex) + 1).map((row) => {
    const date = dateKey(row[dateCol]);
    if (!date) return null;
    return { date, consultants: [{ label: 'Consultant', value: String(row[consultantCol] || '').trim() }], registrars: [
      { label: 'Registrar day', value: String(row[dayCol] || '').trim() }, { label: 'Registrar night', value: String(row[nightCol] || '').trim() }
    ] };
  }).filter(Boolean);
}

function mergeRows(sourceRows) {
  const byDate = new Map();
  sourceRows.flat().forEach((sourceRow) => {
    const row = byDate.get(sourceRow.date) || { date: sourceRow.date, consultants: [], registrars: [] };
    if (sourceRow.consultants.length) row.consultants = sourceRow.consultants;
    if (sourceRow.registrars.length) row.registrars = sourceRow.registrars;
    byDate.set(sourceRow.date, row);
  });
  return [...byDate.values()].map((row) => ({
    date: row.date,
    consultants: row.consultants.length ? row.consultants : [{ label: 'Consultant', value: '#N/A' }],
    registrars: row.registrars.length ? row.registrars : [{ label: 'Registrar day', value: '#N/A' }, { label: 'Registrar night', value: '#N/A' }]
  })).sort((a, b) => a.date.localeCompare(b.date));
}

async function loadSite(trust) {
  const definition = config.trusts[trust] || {};
  if (!definition.sources?.length) return { status: 'unconfigured', rows: [], error: '' };
  try {
    const sourceRows = await Promise.all(definition.sources.map(async (source) => parseLongSource(await getMatrix(definition, source.sheetName), source)));
    const rows = mergeRows(sourceRows);
    if (!rows.length) throw new Error('No dated rota rows were found.');
    return { status: 'fresh', rows, error: '' };
  } catch (longError) {
    if (!definition.fallbackSheetName) return { status: 'error', rows: [], error: longError.message };
    try {
      const rows = parseFallback(await getMatrix(definition, definition.fallbackSheetName));
      if (!rows.length) throw new Error(`No dated rows were found in ${definition.fallbackSheetName}.`);
      return { status: 'fallback', rows, error: '' };
    } catch (fallbackError) {
      return { status: 'error', rows: [], error: `${longError.message} ${fallbackError.message}`.trim() };
    }
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  try {
    const sites = Object.fromEntries(await Promise.all(['QE', 'HGS'].map(async (trust) => [trust, await loadSite(trust)])));
    if (sites.QE.rows.length && sites.HGS.rows.length && JSON.stringify(sites.QE.rows) === JSON.stringify(sites.HGS.rows)) {
      sites.HGS = { status: 'error', rows: [], error: 'The HGS sources returned the same rows as QE. Check the HGS sheet configuration.' };
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).json({ generatedAt: Date.now(), timezone: config.dateTimeZone || 'Europe/London', dayStartHour: config.dayStartHour || 8, nightStartHour: config.nightStartHour || 17, sites });
  } catch (error) {
    console.error('Rota feed failed', error);
    return res.status(500).json({ error: error.message || 'Could not load rota data.' });
  }
};
