// UHB ENT On Call Scriptable widget. The rota app's JSON feed is the only data source.
const APP_URL = '__ROTA_APP_URL__';
const APP_HOME = APP_URL.endsWith('/') ? APP_URL : `${APP_URL}/`;
const DEFAULT_SITE = 'HGS';
const TIME_ZONE = 'Europe/London';
const DAY_START = 8 * 60;
const NIGHT_START = 17 * 60;
const family = config.widgetFamily || 'medium';
const siteFilter = ['HGS', 'QE', 'BOTH'].includes(String(args.widgetParameter || '').trim().toUpperCase())
  ? String(args.widgetParameter).trim().toUpperCase() : DEFAULT_SITE;
const sites = siteFilter === 'BOTH' ? ['HGS', 'QE'] : [siteFilter];
const FEED_URL = `${APP_HOME}api/rota?compact=1&site=${siteFilter}`;
const CACHE_NAME = `uhb-ent-on-call-${siteFilter.toLowerCase()}.json`;

function keyFor(date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(date).reduce((out, part) => (out[part.type] = part.value, out), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function addDays(key, amount) {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount, 12));
  return date.toISOString().slice(0, 10);
}
function formatDate(key, options = { weekday: 'short', day: 'numeric', month: 'short' }) {
  const [year, month, day] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}
function londonClock() {
  const values = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date()).reduce((out, part) => (out[part.type] = part.value, out), {});
  return { minute: Number(values.hour) * 60 + Number(values.minute), text: `${values.hour}:${values.minute}` };
}
function text(value) { return String(value == null ? '' : value).trim(); }
function missing(value) { return !text(value) || /^#N\/A$/i.test(text(value)); }
function parseTime(value) {
  const match = text(value).match(/^(\d{1,2})(?:[:.]?(\d{2}))?\s*([ap]m)?$/i);
  if (!match || (match[2] === undefined && !match[3])) return null;
  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  if (match[3]) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (match[3].toLowerCase() === 'pm' ? 12 : 0);
  }
  return hour < 24 && minute < 60 ? hour * 60 + minute : null;
}
function rotaMinute(value) { return value < DAY_START ? value + 1440 : value; }
const START_RE = /^(?:after|from|post)\s+(\d{1,2}(?:[:.]?\d{2})?\s*(?:[ap]m)?)\s*[:,\-–]?\s*(.+)$/i;
const END_RE = /^(.+?)\s*(?:until|till|before)\s+(\d{1,2}(?:[:.]?\d{2})?\s*(?:[ap]m)?)\s*$/i;
function coverParts(value) {
  const raw = text(value), parts = [];
  let nextFrom = -Infinity, valid = true;
  raw.split('/').map((part) => part.trim()).filter(Boolean).forEach((part) => {
    if (!valid) return;
    let match = part.match(START_RE);
    if (match) {
      const at = parseTime(match[1]);
      if (at == null) { valid = false; return; }
      parts.push({ name: match[2].trim(), from: rotaMinute(at) }); nextFrom = -Infinity; return;
    }
    match = part.match(END_RE);
    if (match) {
      const at = parseTime(match[2]);
      if (at == null) { valid = false; return; }
      parts.push({ name: match[1].trim(), from: nextFrom }); nextFrom = rotaMinute(at); return;
    }
    if (parts.length && nextFrom === -Infinity) { valid = false; return; }
    parts.push({ name: part, from: nextFrom }); nextFrom = -Infinity;
  });
  if (!valid || parts.length < 2 || parts[0].from !== -Infinity) return [{ name: raw, from: -Infinity }];
  return parts.sort((a, b) => a.from - b.from);
}
function coverAt(value, minute) {
  const parts = coverParts(value);
  let active = parts[0];
  parts.forEach((part) => { if (part.from <= minute) active = part; });
  return active?.name || '';
}
function currentRole(roles, minute, slot) {
  const split = roles.filter((role) => /\b(day|night)\b/i.test(role.label));
  const selected = split.length ? split.filter((role) => new RegExp(`\\b${slot}\\b`, 'i').test(role.label)) : roles;
  return selected.map((role) => coverAt(role.value, minute)).filter((name) => !missing(name)).join(' / ') || '—';
}
function fullCover(value) {
  if (missing(value)) return '—';
  const parts = coverParts(value);
  if (parts.length === 1) return parts[0].name;
  return parts.map((part, index) => `${index === 0 ? 'until' : 'from'} ${String(Math.floor((index === 0 ? parts[index + 1].from : part.from) % 1440 / 60)).padStart(2, '0')}:${String((index === 0 ? parts[index + 1].from : part.from) % 60).padStart(2, '0')} ${part.name}`).join(' · ');
}
function consultantSummary(roles) {
  const day = roles.find((role) => /day/i.test(role.label));
  const night = roles.find((role) => /night/i.test(role.label));
  if (day && night) {
    const a = fullCover(day.value), b = fullCover(night.value);
    return a === b ? a : `D ${a} · N ${b}`;
  }
  const role = roles.find((item) => /consultant/i.test(item.label)) || roles[0];
  return role ? fullCover(role.value) : '—';
}
function registrarSummary(roles) {
  const day = roles.find((role) => /day/i.test(role.label));
  const night = roles.find((role) => /night/i.test(role.label));
  if (day && night) {
    const a = missing(day.value) ? '—' : text(day.value), b = missing(night.value) ? '—' : text(night.value);
    return a.toLocaleLowerCase() === b.toLocaleLowerCase() ? a : `D ${a} · N ${b}`;
  }
  return roles.length ? roles.map((role) => missing(role.value) ? '—' : text(role.value)).join(' · ') : '—';
}
function getRow(feed, site, day) { return feed?.sites?.[site]?.rows?.find((row) => row.date === day) || null; }
function currentFor(feed, site, rotaDate, actualMinute) {
  const row = getRow(feed, site, rotaDate);
  if (!row) return { consultant: '—', registrar: '—' };
  const minute = actualMinute < DAY_START ? actualMinute + 1440 : actualMinute;
  const slot = minute >= NIGHT_START ? 'night' : 'day';
  return {
    consultant: currentRole(row.consultants || [], minute, slot),
    registrar: currentRole(row.registrars || [], minute, slot)
  };
}
function dateRows(feed, day) { return sites.map((site) => ({ site, row: getRow(feed, site, day) })); }
const colour = {
  bg: Color.dynamic(new Color('#F2F4F0'), new Color('#111719')),
  card: Color.dynamic(new Color('#FFFFFF'), new Color('#1B2326')),
  cardAlt: Color.dynamic(new Color('#E7EEE8'), new Color('#223029')),
  ink: Color.dynamic(new Color('#172126'), new Color('#F4F5F1')),
  soft: Color.dynamic(new Color('#53605B'), new Color('#BCC5C0')),
  muted: Color.dynamic(new Color('#748079'), new Color('#8E9B95')),
  accent: Color.dynamic(new Color('#3F6C50'), new Color('#A7CEAE')),
  qe: Color.dynamic(new Color('#365B70'), new Color('#A9CADB')),
  line: Color.dynamic(new Color('#D9E0DB'), new Color('#344044'))
};

function addText(stack, value, size, color = colour.ink, options = {}) {
  const item = stack.addText(text(value));
  item.font = options.font || Font.systemFont(size);
  item.textColor = color;
  item.lineLimit = options.lines == null ? 1 : options.lines;
  item.minimumScaleFactor = options.scale || 0.72;
  if (options.opacity != null) item.textOpacity = options.opacity;
  return item;
}

function vertical(parent) {
  const stack = parent.addStack();
  stack.layoutVertically();
  return stack;
}

function siteColour(site) { return site === 'HGS' ? colour.accent : colour.qe; }

function badge(parent, label, tint = colour.accent) {
  const pill = parent.addStack();
  pill.backgroundColor = colour.cardAlt;
  pill.cornerRadius = 7;
  pill.setPadding(3, 7, 3, 7);
  addText(pill, label, 9, tint, { font: Font.boldSystemFont(9), scale: 1 });
  return pill;
}

function header(widget, label, right) {
  const row = widget.addStack();
  row.centerAlignContent();
  badge(row, label, label === 'QE' ? colour.qe : colour.accent);
  row.addSpacer();
  addText(row, right, 9, colour.soft, { font: Font.mediumSystemFont(9), scale: 0.8 });
}

function role(parent, label, value, size = 15, lines = 1) {
  addText(parent, label.toUpperCase(), 8, colour.muted, { font: Font.boldSystemFont(8), scale: 1 });
  parent.addSpacer(1);
  addText(parent, value || '—', size, colour.ink, { font: Font.semiboldSystemFont(size), lines, scale: 0.62 });
}

function card(parent, padding = 8) {
  const box = parent.addStack();
  box.layoutVertically();
  box.backgroundColor = colour.card;
  box.cornerRadius = 11;
  box.setPadding(padding, padding, padding, padding);
  return box;
}

function updateLabel(feedState) {
  if (!feedState.checkedAt) return 'No saved update';
  const time = new Date(feedState.checkedAt).toLocaleTimeString('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' });
  return feedState.stale ? `Saved ${time} · offline` : `Updated ${time}`;
}

function footer(widget, feedState) {
  widget.addSpacer();
  const row = widget.addStack();
  row.centerAlignContent();
  addText(row, feedState.stale ? '○' : '●', 7, feedState.stale ? colour.muted : colour.accent, { scale: 1 });
  row.addSpacer(4);
  addText(row, updateLabel(feedState), 8, colour.muted, { scale: 0.8 });
  row.addSpacer();
  addText(row, 'Tap for rota', 8, colour.muted, { scale: 0.8 });
}

function setRefreshDate(widget) { widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000); }

async function loadFeed() {
  const fm = FileManager.local();
  const cachePath = fm.joinPath(fm.documentsDirectory(), CACHE_NAME);
  let saved = null;
  try { if (fm.fileExists(cachePath)) saved = JSON.parse(fm.readString(cachePath)); } catch {}
  try {
    const request = new Request(FEED_URL);
    request.timeoutInterval = 12;
    const feed = await request.loadJSON();
    if (!feed?.sites) throw new Error(feed?.error || 'The rota feed is unavailable.');
    fm.writeString(cachePath, JSON.stringify({ feed, savedAt: Date.now() }));
    return { feed, stale: false, checkedAt: feed.generatedAt || Date.now() };
  } catch (error) {
    if (saved?.feed?.sites) return { feed: saved.feed, stale: true, checkedAt: saved.savedAt || saved.feed.generatedAt || Date.now(), error: String(error) };
    return { feed: null, stale: true, checkedAt: 0, error: String(error) };
  }
}

function addSmall(widget, feed, feedState, rotaDate, clock) {
  const shift = clock.minute >= NIGHT_START || clock.minute < DAY_START ? 'Night cover' : 'Day cover';
  header(widget, siteFilter === 'BOTH' ? 'ON CALL' : siteFilter, `${clock.text} · ${shift}`);
  widget.addSpacer(7);
  addText(widget, formatDate(rotaDate, { weekday: 'long', day: 'numeric', month: 'short' }), 11, colour.soft, { font: Font.mediumSystemFont(11) });
  widget.addSpacer(7);
  if (sites.length === 1) {
    const active = currentFor(feed, sites[0], rotaDate, clock.minute);
    role(widget, 'Consultant', active.consultant, 16, 2);
    widget.addSpacer(7);
    role(widget, 'Registrar', active.registrar, 15, 2);
  } else {
    sites.forEach((site, index) => {
      const active = currentFor(feed, site, rotaDate, clock.minute);
      const box = card(widget, 6);
      addText(box, site, 9, siteColour(site), { font: Font.boldSystemFont(9), scale: 1 });
      addText(box, active.consultant, 12, colour.ink, { font: Font.semiboldSystemFont(12), scale: 0.58 });
      addText(box, active.registrar, 10, colour.soft, { scale: 0.58 });
      if (index < sites.length - 1) widget.addSpacer(4);
    });
  }
  footer(widget, feedState);
}

function dayColumn(parent, feed, day, offset, clock) {
  const box = card(parent, sites.length > 1 ? 6 : 8);
  const title = offset === 0 ? 'TODAY' : 'TOMORROW';
  addText(box, title, 8, offset === 0 ? colour.accent : colour.muted, { font: Font.boldSystemFont(8), scale: 1 });
  addText(box, formatDate(day, { weekday: 'short', day: 'numeric', month: 'short' }), 11, colour.ink, { font: Font.semiboldSystemFont(11) });
  box.addSpacer(sites.length > 1 ? 4 : 7);
  sites.forEach((site, index) => {
    const row = getRow(feed, site, day);
    const values = offset === 0 ? currentFor(feed, site, day, clock.minute) : {
      consultant: consultantSummary(row?.consultants || []), registrar: registrarSummary(row?.registrars || [])
    };
    if (sites.length > 1) {
      addText(box, site, 8, siteColour(site), { font: Font.boldSystemFont(8), scale: 1 });
      addText(box, `C  ${values.consultant}`, 10, colour.ink, { font: Font.semiboldSystemFont(10), scale: 0.55 });
      addText(box, `R  ${values.registrar}`, 9, colour.soft, { scale: 0.55 });
    } else {
      role(box, 'Consultant', values.consultant, 13, 1);
      box.addSpacer(4);
      role(box, 'Registrar', values.registrar, 12, 1);
    }
    if (index < sites.length - 1) box.addSpacer(4);
  });
}

function addMedium(widget, feed, feedState, rotaDate, clock) {
  header(widget, siteFilter === 'BOTH' ? 'UHB ENT' : siteFilter, `${clock.text} · On call`);
  widget.addSpacer(8);
  const days = widget.addStack();
  dayColumn(days, feed, rotaDate, 0, clock);
  days.addSpacer(7);
  dayColumn(days, feed, addDays(rotaDate, 1), 1, clock);
  footer(widget, feedState);
}

function currentCard(parent, feed, site, rotaDate, clock) {
  const values = currentFor(feed, site, rotaDate, clock.minute);
  const box = card(parent, 9);
  const head = box.addStack();
  addText(head, site, 10, siteColour(site), { font: Font.boldSystemFont(10), scale: 1 });
  head.addSpacer();
  addText(head, clock.minute >= NIGHT_START || clock.minute < DAY_START ? 'NIGHT COVER' : 'DAY COVER', 8, colour.muted, { font: Font.boldSystemFont(8), scale: 1 });
  box.addSpacer(6);
  const roles = box.addStack();
  const consultant = vertical(roles);
  role(consultant, 'Consultant', values.consultant, 15, 1);
  roles.addSpacer(12);
  const registrar = vertical(roles);
  role(registrar, 'Registrar', values.registrar, 15, 1);
}

function futureRow(parent, feed, day) {
  const row = parent.addStack();
  row.centerAlignContent();
  const date = vertical(row);
  date.size = new Size(57, 0);
  addText(date, formatDate(day, { weekday: 'short' }).toUpperCase(), 8, colour.muted, { font: Font.boldSystemFont(8), scale: 1 });
  addText(date, formatDate(day, { day: 'numeric', month: 'short' }), 10, colour.ink, { font: Font.semiboldSystemFont(10), scale: 1 });
  row.addSpacer(5);
  const detail = vertical(row);
  dateRows(feed, day).forEach(({ site, row: rota }, index) => {
    const line = detail.addStack();
    if (sites.length > 1) {
      const siteBox = line.addStack();
      siteBox.size = new Size(26, 0);
      addText(siteBox, site, 8, siteColour(site), { font: Font.boldSystemFont(8), scale: 1 });
      line.addSpacer(3);
    }
    addText(line, consultantSummary(rota?.consultants || []), 9, colour.ink, { font: Font.mediumSystemFont(9), scale: 0.55 });
    line.addSpacer(7);
    addText(line, registrarSummary(rota?.registrars || []), 9, colour.soft, { scale: 0.55 });
    if (index < sites.length - 1) detail.addSpacer(2);
  });
}

function addLarge(widget, feed, feedState, rotaDate, clock) {
  header(widget, siteFilter === 'BOTH' ? 'UHB ENT · ON CALL' : `${siteFilter} · ON CALL`, `${clock.text} · ${formatDate(rotaDate, { weekday: 'short', day: 'numeric', month: 'short' })}`);
  widget.addSpacer(8);
  sites.forEach((site, index) => {
    currentCard(widget, feed, site, rotaDate, clock);
    if (index < sites.length - 1) widget.addSpacer(5);
  });
  widget.addSpacer(10);
  addText(widget, 'NEXT 6 ROTA DAYS', 8, colour.muted, { font: Font.boldSystemFont(8), scale: 1 });
  widget.addSpacer(5);
  for (let offset = 1; offset <= 6; offset += 1) {
    futureRow(widget, feed, addDays(rotaDate, offset));
    if (offset < 6) widget.addSpacer(5);
  }
  footer(widget, feedState);
}

function buildWidget(feedState) {
  const widget = new ListWidget();
  widget.backgroundColor = colour.bg;
  widget.setPadding(12, 12, 10, 12);
  widget.url = APP_HOME;
  setRefreshDate(widget);
  const clock = londonClock();
  const today = keyFor(new Date());
  const rotaDate = clock.minute < DAY_START ? addDays(today, -1) : today;
  if (!feedState.feed) {
    header(widget, 'UHB ENT', clock.text);
    widget.addSpacer(12);
    addText(widget, 'Rota unavailable', 17, colour.ink, { font: Font.semiboldSystemFont(17) });
    widget.addSpacer(4);
    addText(widget, 'Open Scriptable to retry. A saved copy will be used after the first successful update.', 11, colour.soft, { lines: 3 });
    footer(widget, feedState);
    return widget;
  }
  if (family === 'small') addSmall(widget, feedState.feed, feedState, rotaDate, clock);
  else if (family === 'large') addLarge(widget, feedState.feed, feedState, rotaDate, clock);
  else addMedium(widget, feedState.feed, feedState, rotaDate, clock);
  return widget;
}

const state = await loadFeed();
const widget = buildWidget(state);
Script.setWidget(widget);
if (config.runsInApp) {
  if (family === 'small') await widget.presentSmall();
  else if (family === 'large') await widget.presentLarge();
  else await widget.presentMedium();
}
Script.complete();
