// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: purple; icon-glyph: magic;
// UHB ENT On Call Scriptable widget. The rota app's JSON feed is the only data source.
const APP_URL = '__ROTA_APP_URL__';
const APP_HOME = APP_URL.endsWith('/') ? APP_URL : `${APP_URL}/`;
const INSTALLED_DEFAULT_SITE = '__DEFAULT_SITE__';
const DEFAULT_SITE = ['HGS', 'QE', 'BOTH'].includes(INSTALLED_DEFAULT_SITE) ? INSTALLED_DEFAULT_SITE : 'HGS';
const TIME_ZONE = 'Europe/London';
const DAY_START = 8 * 60;
const NIGHT_START = 17 * 60;
const family = config.widgetFamily || 'medium';
const siteFilter = ['HGS', 'QE', 'BOTH'].includes(String(args.widgetParameter || '').trim().toUpperCase())
  ? String(args.widgetParameter).trim().toUpperCase() : DEFAULT_SITE;
const sites = siteFilter === 'BOTH' ? ['HGS', 'QE'] : [siteFilter];
const FEED_URL = `${APP_HOME}api/rota?compact=1&site=${siteFilter}`;
const CACHE_NAME = `uhb-ent-on-call-${siteFilter.toLowerCase()}.json`;
const WIDGET_SIZES = {
  '320x568': [141, 292, 311], '375x667': [148, 321, 324], '375x812': [155, 329, 345], '360x780': [155, 329, 345],
  '390x844': [158, 338, 354], '393x852': [158, 338, 354], '402x874': [162, 350, 379], '414x736': [159, 348, 357],
  '414x896': [169, 360, 379], '428x926': [170, 364, 382], '430x932': [170, 364, 382], '440x956': [170, 364, 382]
};
const SCREEN = Device.screenSize();
const SCREEN_MIN = Math.min(SCREEN.width, SCREEN.height);
const SCREEN_KEY = `${Math.round(SCREEN_MIN)}x${Math.round(Math.max(SCREEN.width, SCREEN.height))}`;
const [SMALL_WIDTH, WIDE_WIDTH, LARGE_HEIGHT] = WIDGET_SIZES[SCREEN_KEY]
  || [Math.round(SCREEN_MIN * 0.4), Math.round(SCREEN_MIN * 0.85), Math.round(SCREEN_MIN * 0.89)];
const OUTER_PADDING = 12;
const CONTENT_WIDTH = WIDE_WIDTH - OUTER_PADDING * 2;
const SMALL_CONTENT_WIDTH = SMALL_WIDTH - OUTER_PADDING * 2;
const SMALL_BOTH_HEIGHT = Math.max(68, SMALL_WIDTH - 88);
const MEDIUM_CARD_HEIGHT = SMALL_WIDTH - 62;
const LARGE_ROW_HEIGHT = Math.max(30, Math.min(41, Math.floor((LARGE_HEIGHT - 94) / 7)));

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
function registrarPeriods(roles) {
  const day = roles.find((role) => /day/i.test(role.label));
  const night = roles.find((role) => /night/i.test(role.label));
  if (day && night) {
    const dayName = missing(day.value) ? '—' : text(day.value);
    const nightName = missing(night.value) ? '—' : text(night.value);
    if (dayName.toLocaleLowerCase() === nightName.toLocaleLowerCase()) return [{ label: '', value: dayName }];
    return [{ label: 'D', value: dayName }, { label: 'N', value: nightName }];
  }
  const value = roles.length ? roles.map((role) => missing(role.value) ? '—' : text(role.value)).join(' / ') : '—';
  return [{ label: '', value }];
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
  bgTop: Color.dynamic(new Color('#F9FAF7'), new Color('#182124')),
  bg: Color.dynamic(new Color('#EAEEE9'), new Color('#0E1416')),
  card: Color.dynamic(new Color('#FFFFFF'), new Color('#1B2528')),
  cardAlt: Color.dynamic(new Color('#EEF2EE'), new Color('#202B2D')),
  todayTint: Color.dynamic(new Color('#E2EFE5'), new Color('#243A2F')),
  weekend: Color.dynamic(new Color('#F7F0DC'), new Color('#2D2A1D')),
  gold: Color.dynamic(new Color('#8A6A10'), new Color('#E6C97B')),
  ink: Color.dynamic(new Color('#10191D'), new Color('#F7F8F4')),
  soft: Color.dynamic(new Color('#46534E'), new Color('#C9D2CD')),
  muted: Color.dynamic(new Color('#66736D'), new Color('#9AA7A1')),
  accent: Color.dynamic(new Color('#2F6B4A'), new Color('#9FD2AE')),
  qe: Color.dynamic(new Color('#2D5B76'), new Color('#9CCBE3')),
  onTint: Color.dynamic(new Color('#FFFFFF'), new Color('#0F1C16')),
  line: Color.dynamic(new Color('#D5DDD7'), new Color('#33403F'))
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
  pill.backgroundColor = tint;
  pill.cornerRadius = 8;
  pill.setPadding(3, 8, 3, 8);
  addText(pill, label, 9, colour.onTint, { font: Font.heavySystemFont(9), scale: 1 });
  return pill;
}

function divider(parent, gap = 0) {
  if (gap) parent.addSpacer(gap);
  const rule = parent.addStack();
  rule.layoutHorizontally();
  rule.size = new Size(0, 1);
  rule.backgroundColor = colour.line;
  rule.addSpacer();
  if (gap) parent.addSpacer(gap);
}

function shiftSymbol(clock) {
  return clock.minute >= NIGHT_START || clock.minute < DAY_START ? 'moon.stars.fill' : 'sun.max.fill';
}

function header(widget, label, right, symbol) {
  const row = widget.addStack();
  row.centerAlignContent();
  badge(row, label, label === 'QE' ? colour.qe : colour.accent);
  row.addSpacer();
  if (symbol) {
    const glyph = SFSymbol.named(symbol);
    if (glyph) {
      const icon = row.addImage(glyph.image);
      icon.imageSize = new Size(10, 10);
      icon.tintColor = colour.soft;
      row.addSpacer(4);
    }
  }
  addText(row, right, 9, colour.soft, { font: Font.semiboldSystemFont(9), scale: 0.8 });
}

function role(parent, label, value, size = 15, lines = 1) {
  addText(parent, label.toUpperCase(), 8, colour.muted, { font: Font.heavySystemFont(8), scale: 1 });
  parent.addSpacer(2);
  addText(parent, value || '—', size, colour.ink, { font: Font.boldSystemFont(size), lines, scale: 0.62 });
}

function periodLines(parent, periods, size = 10, colourValue = colour.ink) {
  periods.forEach((period, index) => {
    const line = parent.addStack();
    line.centerAlignContent();
    if (period.label) {
      const key = line.addStack();
      key.size = new Size(12, 0);
      addText(key, period.label, 7, colour.muted, { font: Font.boldSystemFont(7), scale: 1 });
      line.addSpacer(2);
    }
    addText(line, period.value, size, colourValue, { font: Font.mediumSystemFont(size), scale: 0.55 });
    if (index < periods.length - 1) parent.addSpacer(1);
  });
}

function card(parent, padding = 8) {
  const box = parent.addStack();
  box.layoutVertically();
  box.backgroundColor = colour.card;
  box.cornerRadius = 14;
  box.borderColor = colour.line;
  box.borderWidth = 0.5;
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
  addText(row, updateLabel(feedState), 8, colour.muted, { font: Font.mediumSystemFont(8), scale: 0.8 });
  row.addSpacer();
  addText(row, 'Open rota ›', 8, colour.muted, { font: Font.mediumSystemFont(8), scale: 0.8 });
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
  header(widget, siteFilter === 'BOTH' ? 'ON CALL' : siteFilter, `${clock.text} · ${shift}`, shiftSymbol(clock));
  widget.addSpacer(7);
  addText(widget, formatDate(rotaDate, { weekday: 'long', day: 'numeric', month: 'short' }), 12, colour.ink, { font: Font.semiboldSystemFont(12) });
  widget.addSpacer(7);
  if (sites.length === 1) {
    const active = currentFor(feed, sites[0], rotaDate, clock.minute);
    role(widget, 'Consultant', active.consultant, 17, 2);
    divider(widget, 6);
    role(widget, 'Registrar', active.registrar, 15, 2);
  } else {
    const columns = widget.addStack();
    const columnWidth = (SMALL_CONTENT_WIDTH - 5) / 2;
    sites.forEach((site, index) => {
      const active = currentFor(feed, site, rotaDate, clock.minute);
      const box = card(columns, 6);
      box.size = new Size(columnWidth, SMALL_BOTH_HEIGHT);
      addText(box, site, 9, siteColour(site), { font: Font.heavySystemFont(9), scale: 1 });
      box.addSpacer(4);
      addText(box, 'CONSULTANT', 6, colour.muted, { font: Font.boldSystemFont(6), scale: 1 });
      addText(box, active.consultant, 11, colour.ink, { font: Font.semiboldSystemFont(11), lines: 2, scale: 0.55 });
      box.addSpacer(3);
      addText(box, 'REGISTRAR', 6, colour.muted, { font: Font.boldSystemFont(6), scale: 1 });
      addText(box, active.registrar, 10, colour.soft, { font: Font.mediumSystemFont(10), lines: 2, scale: 0.55 });
      if (index < sites.length - 1) columns.addSpacer(5);
    });
  }
  footer(widget, feedState);
}

function dayColumn(parent, feed, day, offset, clock) {
  const box = card(parent, sites.length > 1 ? 6 : 8);
  box.size = new Size((CONTENT_WIDTH - 7) / 2, MEDIUM_CARD_HEIGHT);
  if (offset === 0) {
    box.backgroundColor = colour.todayTint;
    box.borderColor = colour.accent;
    box.borderWidth = 1;
  } else if (isWeekend(day)) {
    box.backgroundColor = colour.weekend;
  }
  const title = offset === 0 ? '● ON CALL NOW' : 'TOMORROW';
  addText(box, title, 8, offset === 0 ? colour.accent : (isWeekend(day) ? colour.gold : colour.muted), { font: Font.boldSystemFont(8), scale: 1 });
  addText(box, formatDate(day, { weekday: 'short', day: 'numeric', month: 'short' }), 11, colour.ink, { font: Font.semiboldSystemFont(11) });
  box.addSpacer(sites.length > 1 ? 4 : 7);
  sites.forEach((site, index) => {
    const row = getRow(feed, site, day);
    const values = offset === 0 ? currentFor(feed, site, day, clock.minute) : {
      consultant: consultantSummary(row?.consultants || []), registrar: registrarSummary(row?.registrars || [])
    };
    if (sites.length > 1) {
      addText(box, site, 8, siteColour(site), { font: Font.boldSystemFont(8), scale: 1 });
      addText(box, `C  ${values.consultant}`, 10, colour.ink, { font: Font.boldSystemFont(10), scale: 0.55 });
      if (offset === 0) {
        addText(box, `R  ${values.registrar}`, 9, colour.soft, { scale: 0.55 });
      } else {
        registrarPeriods(row?.registrars || []).forEach((period) => {
          addText(box, `R${period.label ? ` ${period.label}` : ''}  ${period.value}`, 9, colour.soft, { scale: 0.55 });
        });
      }
    } else {
      role(box, 'Consultant', values.consultant, offset === 0 ? 14 : 13, offset === 0 ? 1 : 2);
      box.addSpacer(4);
      addText(box, 'REGISTRAR', 8, colour.muted, { font: Font.boldSystemFont(8), scale: 1 });
      box.addSpacer(1);
      if (offset === 0) addText(box, values.registrar, 12, colour.ink, { font: Font.semiboldSystemFont(12), lines: 1, scale: 0.62 });
      else periodLines(box, registrarPeriods(row?.registrars || []), 11, colour.ink);
    }
    if (index < sites.length - 1) box.addSpacer(4);
  });
  box.addSpacer();
}

function addMedium(widget, feed, feedState, rotaDate, clock) {
  header(widget, siteFilter === 'BOTH' ? 'UHB ENT' : siteFilter, `${clock.text} · On call`, shiftSymbol(clock));
  widget.addSpacer(8);
  const days = widget.addStack();
  dayColumn(days, feed, rotaDate, 0, clock);
  days.addSpacer(7);
  dayColumn(days, feed, addDays(rotaDate, 1), 1, clock);
  footer(widget, feedState);
}

function dayOfWeek(day) {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date, 12)).getUTCDay();
}

function isWeekend(day) { return dayOfWeek(day) === 0 || dayOfWeek(day) === 6; }

function largeDate(parent, day, offset) {
  const date = vertical(parent);
  date.size = new Size(46, 0);
  addText(date, offset === 0 ? 'TODAY' : formatDate(day, { weekday: 'short' }).toUpperCase(), 7,
    offset === 0 ? colour.accent : (isWeekend(day) ? colour.gold : colour.muted), { font: Font.boldSystemFont(7), scale: 1 });
  addText(date, formatDate(day, { day: 'numeric', month: 'short' }), 10, colour.ink, { font: Font.boldSystemFont(10), scale: 1 });
}

function singleSiteWeekRow(parent, feed, site, day, offset, clock) {
  const row = card(parent, 5);
  const roleWidth = (CONTENT_WIDTH - 10 - 46 - 5 - 6) / 2;
  row.size = new Size(CONTENT_WIDTH, LARGE_ROW_HEIGHT);
  if (isWeekend(day)) row.backgroundColor = colour.weekend;
  if (offset === 0) {
    row.backgroundColor = colour.todayTint;
    row.borderColor = colour.accent;
    row.borderWidth = 1;
  }
  row.layoutHorizontally();
  row.centerAlignContent();
  largeDate(row, day, offset);
  row.addSpacer(5);
  const rota = getRow(feed, site, day);
  const active = offset === 0 ? currentFor(feed, site, day, clock.minute) : null;
  const consultant = vertical(row);
  consultant.size = new Size(roleWidth, 0);
  addText(consultant, active ? active.consultant : consultantSummary(rota?.consultants || []), 10, colour.ink,
    { font: Font.semiboldSystemFont(10), lines: 2, scale: 0.55 });
  row.addSpacer(6);
  const registrar = vertical(row);
  if (active) addText(registrar, active.registrar, 10, colour.ink, { font: Font.mediumSystemFont(10), lines: 2, scale: 0.55 });
  else periodLines(registrar, registrarPeriods(rota?.registrars || []), 9, colour.soft);
}

function bothSitesWeekRow(parent, feed, day, offset, clock) {
  const row = card(parent, 5);
  const roleWidth = (CONTENT_WIDTH - 10 - 46 - 5 - 6) / 2;
  row.size = new Size(CONTENT_WIDTH, LARGE_ROW_HEIGHT);
  if (isWeekend(day)) row.backgroundColor = colour.weekend;
  if (offset === 0) {
    row.backgroundColor = colour.todayTint;
    row.borderColor = colour.accent;
    row.borderWidth = 1;
  }
  row.layoutHorizontally();
  row.centerAlignContent();
  largeDate(row, day, offset);
  row.addSpacer(5);
  sites.forEach((site, index) => {
    const rota = getRow(feed, site, day);
    const active = offset === 0 ? currentFor(feed, site, day, clock.minute) : null;
    const column = vertical(row);
    column.size = new Size(roleWidth, 0);
    const consultant = active ? active.consultant : consultantSummary(rota?.consultants || []);
    const periods = active ? [{ label: '', value: active.registrar }] : registrarPeriods(rota?.registrars || []);
    addText(column, consultant, 9, colour.ink, { font: Font.mediumSystemFont(9), scale: 0.52 });
    periods.forEach((period) => addText(column, `${period.label ? `${period.label} ` : ''}${period.value}`, 8, colour.soft, { scale: 0.5 }));
    if (index < sites.length - 1) row.addSpacer(6);
  });
}

function addLarge(widget, feed, feedState, rotaDate, clock) {
  header(widget, siteFilter === 'BOTH' ? 'UHB ENT' : siteFilter, `${clock.text} · 7-day rota`, shiftSymbol(clock));
  widget.addSpacer(7);
  const headings = widget.addStack();
  const roleWidth = (CONTENT_WIDTH - 10 - 46 - 5 - 6) / 2;
  headings.addSpacer(5);
  const dateHeading = headings.addStack();
  dateHeading.size = new Size(46, 0);
  addText(dateHeading, 'DATE', 7, colour.muted, { font: Font.boldSystemFont(7), scale: 1 });
  headings.addSpacer(5);
  if (sites.length === 1) {
    const consultantHeading = headings.addStack();
    consultantHeading.size = new Size(roleWidth, 0);
    addText(consultantHeading, 'CONSULTANT', 7, colour.muted, { font: Font.boldSystemFont(7), scale: 1 });
    headings.addSpacer(6);
    const registrarHeading = headings.addStack();
    registrarHeading.size = new Size(roleWidth, 0);
    addText(registrarHeading, 'REGISTRAR  D / N', 7, colour.muted, { font: Font.boldSystemFont(7), scale: 1 });
  } else {
    sites.forEach((site, index) => {
      const siteHeading = headings.addStack();
      siteHeading.size = new Size(roleWidth, 0);
      addText(siteHeading, `${site}  C / R`, 7, siteColour(site), { font: Font.boldSystemFont(7), scale: 1 });
      if (index < sites.length - 1) headings.addSpacer(6);
    });
  }
  widget.addSpacer(4);
  for (let offset = 0; offset < 7; offset += 1) {
    const day = addDays(rotaDate, offset);
    if (sites.length === 1) singleSiteWeekRow(widget, feed, sites[0], day, offset, clock);
    else bothSitesWeekRow(widget, feed, day, offset, clock);
    if (offset < 6) widget.addSpacer(4);
  }
  footer(widget, feedState);
}

function buildWidget(feedState) {
  const widget = new ListWidget();
  widget.backgroundColor = colour.bg;
  const gradient = new LinearGradient();
  gradient.colors = [colour.bgTop, colour.bg];
  gradient.locations = [0, 1];
  widget.backgroundGradient = gradient;
  widget.setPadding(12, OUTER_PADDING, 10, OUTER_PADDING);
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
