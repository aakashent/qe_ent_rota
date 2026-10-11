// UHB ENT On Call Scriptable widget. The rota app's JSON feed is the only data source.
const APP_URL = '__ROTA_APP_URL__';
const FEED_URL = new URL('./api/rota', APP_URL).toString();
const APP_HOME = new URL('./', APP_URL).toString();
const DEFAULT_SITE = 'HGS';
const TIME_ZONE = 'Europe/London';
const CACHE_NAME = 'uhb-ent-on-call-widget-cache.json';
const DAY_START = 8 * 60;
const NIGHT_START = 17 * 60;
const family = config.widgetFamily || 'medium';
const siteFilter = ['HGS', 'QE', 'BOTH'].includes(String(args.widgetParameter || '').trim().toUpperCase())
  ? String(args.widgetParameter).trim().toUpperCase() : DEFAULT_SITE;
const sites = siteFilter === 'BOTH' ? ['HGS', 'QE'] : [siteFilter];

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
function addText(stack, value, size, color, options = {}) {
  const item = stack.addText(text(value));
  item.font = options.font || Font.systemFont(size);
  item.textColor = color;
  item.lineLimit = options.lines || 1;
  item.minimumScaleFactor = options.scale || 0.68;
  if (options.opacity != null) item.textOpacity = options.opacity;
  return item;
}
function addSiteRow(widget, site, row, size = 9) {
  const line = widget.addStack();
  line.centerAlignContent();
  const siteLabel = addText(line, site, size, site === 'HGS' ? Color.dynamic(new Color('#496d52'), new Color('#a8c9ae')) : Color.dynamic(new Color('#425b6c'), new Color('#b3c7d4')), { font: Font.boldSystemFont(size), scale: 1 });
  line.addSpacer(4);
  const consultant = addText(line, consultantSummary(row?.consultants || []), size, Color.dynamic(Color.black(), Color.white()));
  line.addSpacer(5);
  const registrar = addText(line, registrarSummary(row?.registrars || []), size, Color.dynamic(new Color('#56625d'), new Color('#c4cfca')));
  line.addSpacer(0);
}
function setRefreshDate(widget) { widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000); }
function addUpdateFooter(widget, label, stale = false) {
  widget.addSpacer(3);
  const footer = widget.addStack(); footer.centerAlignContent();
  addText(footer, stale ? '◌' : '●', 7, stale ? Color.gray() : Color.dynamic(new Color('#4f8460'), new Color('#a7cfad')), { scale: 1 });
  footer.addSpacer(4);
  addText(footer, label, 8, Color.dynamic(new Color('#6d7772'), new Color('#aeb7b2')), { scale: 1 });
}

async function loadFeed() {
  const fm = FileManager.local();
  const cachePath = fm.joinPath(fm.documentsDirectory(), CACHE_NAME);
  let saved = null;
  try { if (fm.fileExists(cachePath)) saved = JSON.parse(fm.readString(cachePath)); } catch {}
  try {
    const request = new Request(`${FEED_URL}?_=${Date.now()}`);
    request.timeoutInterval = 20;
    const feed = await request.loadJSON();
    if (!feed?.sites) throw new Error(feed?.error || 'The rota feed is unavailable.');
    fm.writeString(cachePath, JSON.stringify({ feed, savedAt: Date.now() }));
    return { feed, stale: false, checkedAt: feed.generatedAt || Date.now() };
  } catch (error) {
    if (saved?.feed?.sites) return { feed: saved.feed, stale: true, checkedAt: saved.savedAt || saved.feed.generatedAt || Date.now(), error: String(error) };
    return { feed: null, stale: true, checkedAt: 0, error: String(error) };
  }
}

function buildWidget(feedState) {
  const widget = new ListWidget();
  widget.backgroundColor = Color.dynamic(new Color('#f6f7f4'), new Color('#141a1d'));
  widget.setPadding(11, 12, 9, 12);
  widget.url = APP_HOME;
  setRefreshDate(widget);
  const feed = feedState.feed;
  const clock = londonClock();
  const today = keyFor(new Date());
  const rotaDate = clock.minute < DAY_START ? addDays(today, -1) : today;
  const title = addText(widget, family === 'small' ? 'ON CALL NOW' : 'UHB ENT · ON CALL', 9, Color.dynamic(new Color('#68736e'), new Color('#b4beb8')), { font: Font.boldSystemFont(9), scale: 1 });
  widget.addSpacer(3);
  if (!feed) {
    addText(widget, 'Rota unavailable', 14, Color.dynamic(Color.black(), Color.white()), { font: Font.semiboldSystemFont(14) });
    addText(widget, 'Open the app to retry', 9, Color.gray());
    addUpdateFooter(widget, 'No saved copy', true);
    return widget;
  }
  if (family === 'small') {
    addText(widget, `${formatDate(rotaDate, { weekday: 'long', day: 'numeric', month: 'short' })} · ${clock.text}`, 10, Color.dynamic(new Color('#35423b'), new Color('#e4e9e5')), { font: Font.semiboldSystemFont(10) });
    widget.addSpacer(5);
    sites.forEach((site, index) => {
      const active = currentFor(feed, site, rotaDate, clock.minute);
      addText(widget, site, 9, site === 'HGS' ? Color.dynamic(new Color('#496d52'), new Color('#a8c9ae')) : Color.dynamic(new Color('#425b6c'), new Color('#b3c7d4')), { font: Font.boldSystemFont(9), scale: 1 });
      addText(widget, `C  ${active.consultant}`, 10, Color.dynamic(Color.black(), Color.white()));
      addText(widget, `R  ${active.registrar}`, 9, Color.dynamic(new Color('#56625d'), new Color('#c4cfca')));
      if (index < sites.length - 1) { widget.addSpacer(4); }
    });
    const stamp = feedState.stale ? `Saved · ${feedState.checkedAt ? new Date(feedState.checkedAt).toLocaleTimeString('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' }) : 'offline'}` : `Updated ${new Date(feedState.checkedAt).toLocaleTimeString('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' })}`;
    addUpdateFooter(widget, stamp, feedState.stale);
    return widget;
  }

  const days = family === 'large' ? 7 : 2;
  for (let offset = 0; offset < days; offset += 1) {
    const day = addDays(rotaDate, offset);
    const section = widget.addStack(); section.centerAlignContent();
    const dateLabel = offset === 0 ? `Today · ${formatDate(day)}` : offset === 1 ? `Tomorrow · ${formatDate(day)}` : formatDate(day);
    addText(section, dateLabel, family === 'large' ? 9 : 10, offset === 0 ? Color.dynamic(new Color('#304b37'), new Color('#b5d6bb')) : Color.dynamic(new Color('#65706a'), new Color('#b2bbb6')), { font: Font.boldSystemFont(family === 'large' ? 9 : 10), scale: 1 });
    if (offset === 0 && family !== 'large') { section.addSpacer(); addText(section, `to 08:00 ${formatDate(addDays(day, 1), { day: 'numeric', month: 'short' })}`, 8, Color.gray(), { scale: 1 }); }
    widget.addSpacer(family === 'large' ? 1 : 2);
    dateRows(feed, day).forEach(({ site, row }) => addSiteRow(widget, site, row, family === 'large' ? 8 : 9));
    if (offset < days - 1) widget.addSpacer(family === 'large' ? 3 : 5);
  }
  const updatedAt = feedState.checkedAt ? new Date(feedState.checkedAt).toLocaleTimeString('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' }) : 'unknown';
  addUpdateFooter(widget, feedState.stale ? `Saved · ${updatedAt}` : `Updated ${updatedAt}`, feedState.stale);
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
