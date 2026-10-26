"use strict";

// ---------------------------------------------------------------------------
// Konstanten aus der SELVE XML Spezifikation
// ---------------------------------------------------------------------------
const TYPES = {
  0: "Unbekannt", 1: "Rollladen", 2: "Jalousie", 3: "Markise", 4: "Schaltaktor",
  5: "Dimmer", 6: "Nachtlicht-Aktor", 7: "Dämmerlicht-Aktor", 8: "Heizung",
  9: "Kühlgerät", 10: "Schaltaktor (Tagbetrieb)", 11: "Gateway",
};
const SWITCH_TYPES = new Set([4, 6, 7, 10]);
const DEV_STATE = { 0: "Unbekannt", 1: "Steht", 2: "Fährt hoch", 3: "Fährt runter" };
const DEV_STATE_SWITCH = { 0: "Unbekannt", 1: "Aus", 2: "Ein", 3: "Ein" };
const DEV_SLOT = { 0: "frei", 1: "in Benutzung", 2: "temporär", 3: "gelöscht (alt)" };
const DAY_MODE = { 0: "–", 1: "Nacht", 2: "Morgendämmerung", 3: "Tag", 4: "Abenddämmerung" };
const FLAGS = [
  [0, "nicht erreichbar", "bad"], [1, "Überlast", "bad"], [2, "Hindernis", "bad"],
  [3, "Alarm", "bad"], [4, "Sensorverlust", "warn"], [6, "Gateway ausgelernt", "bad"],
  [7, "Windalarm", "warn"], [8, "Regenalarm", "warn"], [9, "Frostalarm", "warn"],
];
const CMD = { Stop: 0, Up: 1, Down: 2, Pos1: 3, SavePos1: 4, Pos2: 5, SavePos2: 6, Pos: 7, StepUp: 8, StepDown: 9, AutoOn: 10, AutoOff: 11 };
const CMD_NAMES = ["Stopp", "Auf", "Ab", "Pos 1", "Pos 1 speichern", "Pos 2", "Pos 2 speichern", "Position", "Schritt auf", "Schritt ab", "Automatik ein", "Automatik aus"];
const CMD_TYPE = { Forced: 0, Manual: 1, Time: 2, Glass: 3 };
const FUNC = { Select: 0, Install: 1, Sensor: 2, ManProg: 3, AutoProg: 4, StorePosition: 5, DriveUp: 6, DriveDown: 7, KeyRelease: 8, DriveStop: 9 };
const SENDER_EVENTS = ["–", "Auf", "Ab", "Stopp", "Zwischenposition 1", "Zwischenposition 2", "Pos 1 gespeichert", "Pos 2 gespeichert", "Automatik", "Manuell", "Name geändert", "Taste losgelassen", "Gateway ausgewählt", "Verbindung gelöscht"];
const IVEO_CMD = ["Stopp", "Auf", "Ab", "Pos 1", "Pos 2"];
const SENSOR_STATUS = ["Noch keine Daten", "OK", "Batterie schwach", "Sensorverlust", "Testmodus", "Servicemodus"];
const WIND_D = ["–", "kein Alarm", "Windalarm"];
const RAIN_D = ["–", "trocken", "Regen"];
const TEMP_D = ["–", "normal (4–20 °C)", "Frost (≤ 4 °C)", "warm (> 20 °C)"];
const LIGHT_D = ["–", "dunkel", "dämmrig", "normal", "sonnig"];
const GW_STATE = ["Bootloader", "Update", "Startphase", "Bereit"];
const LOG_TYPE = ["info", "warning", "error"];

const METHODS = [
  "service.ping", "service.getState", "service.getVersion", "service.reset", "service.factoryReset", "service.setLED", "service.getLED",
  "param.setForward", "param.getForward", "param.setEvent", "param.getEvent", "param.getDuty", "param.getRF",
  "device.scanStart", "device.scanStop", "device.scanResult", "device.save", "device.getIDs", "device.getInfo", "device.getValues",
  "device.setFunction", "device.setLabel", "device.setType", "device.delete", "device.writeManual",
  "sensor.teachStart", "sensor.teachStop", "sensor.teachResult", "sensor.getIDs", "sensor.getInfo", "sensor.getValues", "sensor.setLabel", "sensor.delete", "sensor.writeManual",
  "senSim.store", "senSim.delete", "senSim.getConfig", "senSim.setConfig", "senSim.setLabel", "senSim.setValues", "senSim.getValues", "senSim.getIDs", "senSim.factory", "senSim.drive", "senSim.setTest", "senSim.getTest",
  "sender.teachStart", "sender.teachStop", "sender.teachResult", "sender.getIDs", "sender.getInfo", "sender.getValues", "sender.setLabel", "sender.delete", "sender.writeManual",
  "group.read", "group.write", "group.getIDs", "group.delete",
  "command.device", "command.group", "command.groupMan",
  "iveo.setRepeater", "iveo.getRepeater", "iveo.setLabel", "iveo.setConfig", "iveo.getConfig", "iveo.getIDs", "iveo.factory",
  "iveo.commandTeach", "iveo.commandLearn", "iveo.commandManual", "iveo.commandAutomatic",
].map(m => "selve.GW." + m);

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "html") el.innerHTML = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const mask = (ids, len = 8) => ({ mask: ids, len });
const hex = (n, w = 6) => "0x" + Number(n).toString(16).toUpperCase().padStart(w, "0");
const hex2 = n => Number(n).toString(16).toUpperCase().padStart(2, "0");
const pct = v => Math.round((v / 65535) * 100);
const utf8len = s => new TextEncoder().encode(s).length;

function checkName(name) {
  if (!name.trim()) throw new Error("Bitte einen Namen eingeben.");
  if (utf8len(name) > 23) throw new Error("Der Name ist zu lang (max. 23 Byte, Umlaute zählen doppelt).");
  if (/[&<>"']/.test(name)) throw new Error("Die Zeichen & < > \" ' sind im Namen nicht erlaubt.");
  return name;
}

function toast(msg, kind = "") {
  const t = h("div", { class: "toast " + kind }, msg);
  $("#toasts").append(t);
  setTimeout(() => t.remove(), kind === "bad" ? 7000 : 3500);
}

async function api(path, body) {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.json();
}

async function call(method, ...params) {
  if (!method.startsWith("selve.")) method = "selve.GW." + method;
  const r = await api("api/call", { method, params });
  if (!r.ok) throw Object.assign(new Error(r.error), { code: r.code });
  return r.values;
}

// Führt eine Aktion aus und zeigt Fehler an
async function run(fn, okMsg) {
  try {
    const r = await fn();
    if (okMsg) toast(okMsg, "ok");
    return r;
  } catch (e) {
    toast(e.message, "bad");
    throw e;
  }
}
const quiet = p => p.catch(() => {});

function expectOk(values, what) {
  if (values[0] !== 1) throw new Error(`${what} wurde vom Gateway abgelehnt.`);
  return values;
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------
const dlg = $("#dlg");
let dlgOnClose = null;
function openDialog(title, body, buttons = [], onClose = null) {
  $("#dlgTitle").textContent = title;
  $("#dlgBody").replaceChildren(...[body].flat());
  $("#dlgFoot").replaceChildren(...buttons);
  dlgOnClose = onClose;
  if (!dlg.open) dlg.showModal();
}
function closeDialog() { if (dlg.open) dlg.close(); }
// Enter in einem Eingabefeld soll den Dialog nicht schließen
$(".dlg-inner").addEventListener("submit", e => { if (e.submitter?.value !== "close") e.preventDefault(); });
dlg.addEventListener("close", () => { const f = dlgOnClose; dlgOnClose = null; if (f) f(); });

function confirmDialog(title, text, okLabel = "OK", danger = false) {
  return new Promise(resolve => {
    let result = false;
    openDialog(title, h("p", {}, text), [
      h("button", { type: "button", class: "btn", onclick: () => closeDialog() }, "Abbrechen"),
      h("button", { type: "button", class: "btn " + (danger ? "danger solid" : "primary"), onclick: () => { result = true; closeDialog(); } }, okLabel),
    ], () => resolve(result));
  });
}

function field(label, input) { return h("label", { class: "field" }, h("span", {}, label), input); }
function typeSelect(value, allowUnknown = false) {
  const s = h("select");
  for (const [k, v] of Object.entries(TYPES)) {
    if (k === "0" && !allowUnknown) continue;
    s.append(h("option", { value: k, selected: Number(k) === value }, v));
  }
  return s;
}

// ---------------------------------------------------------------------------
// Zustand
// ---------------------------------------------------------------------------
const state = {
  connected: false,
  devices: new Map(),   // id -> {id, addr, name, type, slot, status, value, target, flags, dayMode}
  groups: new Map(),    // id -> {id, members, name}
  iveo: new Map(),      // id -> {id, active, name, type}
  sensors: new Map(),
  senders: new Map(),
  sensim: new Map(),
  selected: new Set(),
  loaded: {},
};

// ---------------------------------------------------------------------------
// Verbindung
// ---------------------------------------------------------------------------
async function loadPorts() {
  const r = await api("api/ports");
  const sel = $("#portSelect");
  const cur = sel.value;
  sel.replaceChildren(h("option", { value: "auto" }, "Automatisch suchen"),
    ...r.ports.map(p => h("option", { value: p.path }, p.path === p.device ? p.path : `${p.path.split("/").pop()} (${p.device})`)));
  if (cur) sel.value = cur;
}

function setConnected(on, port) {
  state.connected = on;
  const s = $("#connState");
  s.textContent = on ? `Verbunden · ${port}` : "Getrennt";
  s.className = "pill " + (on ? "on" : "off");
  $("#connectBtn").textContent = on ? "Trennen" : "Verbinden";
  $("#portSelect").hidden = on;
}

$("#connectBtn").addEventListener("click", async () => {
  if (state.connected) {
    await api("api/disconnect", {});
    setConnected(false);
    return;
  }
  $("#connectBtn").disabled = true;
  try {
    const r = await api("api/connect", { port: $("#portSelect").value });
    if (!r.ok) throw new Error(r.error);
    setConnected(true, r.port);
    await initialLoad();
  } catch (e) {
    toast(e.message, "bad");
  } finally {
    $("#connectBtn").disabled = false;
  }
});

async function initialLoad() {
  state.loaded = {};
  try {
    const [st] = await call("service.getState");
    if (st !== 3) toast(`Gateway ist im Zustand „${GW_STATE[st]}“ – Daten sind evtl. noch nicht aktuell.`);
  } catch (e) { toast(e.message, "bad"); return; }
  quiet(loadDuty());
  await quiet(loadDevices());
  quiet(loadGroups());
  loadTab(currentTab());
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
function currentTab() { return $("#tabs .active").dataset.tab; }
$("#tabs").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b) return;
  $$("#tabs button").forEach(x => x.classList.toggle("active", x === b));
  $$(".tab").forEach(x => x.classList.toggle("active", x.id === "tab-" + b.dataset.tab));
  try { localStorage.setItem("selve-tab", b.dataset.tab); } catch { }
  loadTab(b.dataset.tab);
});

function loadTab(tab) {
  if (!state.connected || state.loaded[tab]) return;
  state.loaded[tab] = true;
  const loaders = {
    devices: loadDevices, groups: async () => { await loadGroups(); },
    iveo: loadIveo, sensors: loadSensors, senders: loadSenders, sensim: loadSensim, gateway: loadGateway,
  };
  if (loaders[tab]) quiet(run(loaders[tab]));
}

// ---------------------------------------------------------------------------
// Aktore
// ---------------------------------------------------------------------------
async function loadDevices() {
  const [m] = await call("device.getIDs");
  state.devices.clear();
  for (const id of m.mask) {
    const [, addr, name, type, slot] = await call("device.getInfo", id);
    const d = { id, addr, name, type, slot };
    try {
      const [, status, value, target, flags, dayMode] = await call("device.getValues", id);
      Object.assign(d, { status, value, target, flags, dayMode });
    } catch { }
    state.devices.set(id, d);
  }
  state.loaded.devices = true;
  renderDevices();
}

function deviceStateText(d) {
  const sw = SWITCH_TYPES.has(d.type);
  return (sw ? DEV_STATE_SWITCH : DEV_STATE)[d.status ?? 0];
}

function renderDevices() {
  const list = $("#devList");
  $("#cnt-devices").textContent = state.devices.size || "";
  if (!state.devices.size) {
    list.replaceChildren(h("div", { class: "empty" }, state.connected ? "Keine Aktore eingelernt. Mit „Neue Aktore suchen“ hinzufügen." : "Nicht verbunden."));
    return;
  }
  list.replaceChildren(...[...state.devices.values()].map(deviceCard));
  renderBulk();
}

function flagBadges(flags = 0) {
  const out = FLAGS.filter(([bit]) => flags >> bit & 1).map(([, t, k]) => h("span", { class: "badge " + k }, t));
  out.push(h("span", { class: "badge " + ((flags >> 5 & 1) ? "ok" : "") }, (flags >> 5 & 1) ? "Automatik" : "Manuell"));
  return out;
}

function deviceCard(d) {
  const sw = SWITCH_TYPES.has(d.type);
  const moving = d.status === 2 || d.status === 3;
  const p = pct(d.value ?? 0);
  const target = moving && d.target != null ? ` → ${pct(d.target)} %` : "";
  const slider = h("input", { type: "range", min: 0, max: 100, step: 1, value: p, "aria-label": "Zielposition" });
  slider.addEventListener("change", () => devCmd(d.id, CMD.Pos, Math.round(slider.value * 655.35)));
  const card = h("div", { class: "card" + (state.selected.has(d.id) ? " selected" : ""), "data-dev": d.id },
    h("div", { class: "card-head" },
      h("input", { type: "checkbox", checked: state.selected.has(d.id), title: "Für Mehrfachbedienung auswählen", onchange: e => toggleSelect(d.id, e.target.checked) }),
      h("div", { class: "grow" },
        h("div", { class: "card-title", title: d.name }, d.name || `Aktor ${d.id}`),
        h("div", { class: "card-sub" }, `#${d.id} · ${TYPES[d.type] ?? d.type} · ${hex(d.addr)}`)),
      h("button", { class: "btn small ghost", title: "Einstellungen", onclick: () => deviceDialog(d.id) }, "⋯")),
    sw
      ? h("div", { class: "pos" },
        h("div", { class: "pos-info" },
          h("div", { class: "pos-val" }, d.status === 2 || d.status === 3 ? "Ein" : d.status === 1 ? "Aus" : "–"),
          h("div", { class: "pos-state" }, d.type === 5 ? `${p} %` : "")))
      : h("div", { class: "pos" },
        h("div", { class: "shutter", title: `${p} % geschlossen` }, h("i", { style: `height:${p}%` })),
        h("div", { class: "pos-info" },
          h("div", { class: "pos-val" }, `${p} %${target}`),
          h("div", { class: "pos-state" + (moving ? " moving" : "") }, deviceStateText(d) + (d.dayMode ? ` · ${DAY_MODE[d.dayMode]}` : "")))),
    h("div", { class: "badges" }, flagBadges(d.flags),
      (d.flags & 1 || d.flags >> 6 & 1) ? h("button", { class: "btn small", onclick: () => reteachDialog(d.id) }, "Neu einlernen …") : null),
    sw
      ? h("div", { class: "ctrl" },
        h("button", { class: "btn", onclick: () => devCmd(d.id, CMD.Up) }, "Ein"),
        h("button", { class: "btn", onclick: () => devCmd(d.id, CMD.Stop) }, "Aus"),
        d.type === 5 ? slider : null)
      : [h("div", { class: "ctrl" },
        h("button", { class: "btn icon", title: "Auf", onclick: () => devCmd(d.id, CMD.Up) }, "▲"),
        h("button", { class: "btn icon", title: "Stopp", onclick: () => devCmd(d.id, CMD.Stop) }, "■"),
        h("button", { class: "btn icon", title: "Ab", onclick: () => devCmd(d.id, CMD.Down) }, "▼"),
        h("button", { class: "btn small", title: "Zwischenposition 1 (Beschattung)", onclick: () => devCmd(d.id, CMD.Pos1) }, "Pos 1"),
        h("button", { class: "btn small", title: "Zwischenposition 2 (Lüftung)", onclick: () => devCmd(d.id, CMD.Pos2) }, "Pos 2")),
      slider],
  );
  return card;
}

function updateDeviceCard(id) {
  const d = state.devices.get(id);
  const old = $(`#devList [data-dev="${id}"]`);
  if (!d || !old) return renderDevices();
  if (old.contains(document.activeElement) && document.activeElement.type === "range") return;
  old.replaceWith(deviceCard(d));
}

async function devCmd(id, cmd, param = 0, type = CMD_TYPE.Manual) {
  await quiet(run(async () => expectOk(await call("command.device", id, cmd, type, param), `Befehl „${CMD_NAMES[cmd]}“`)));
}

function toggleSelect(id, on) {
  on ? state.selected.add(id) : state.selected.delete(id);
  $(`#devList [data-dev="${id}"]`)?.classList.toggle("selected", on);
  renderBulk();
}
function renderBulk() {
  const n = state.selected.size;
  $("#devBulk").hidden = n === 0;
  $("#devBulkInfo").textContent = `${n} ausgewählt:`;
}
$("#devBulkClear").addEventListener("click", () => { state.selected.clear(); renderDevices(); });
$("#devBulk").addEventListener("click", async e => {
  const b = e.target.closest("[data-bulk]");
  if (!b) return;
  const cmd = Number(b.dataset.bulk);
  await quiet(run(async () => expectOk(await call("command.groupMan", cmd, CMD_TYPE.Manual, mask([...state.selected]), 0), "Gruppenbefehl")));
});
$("#devRefresh").addEventListener("click", () => quiet(run(loadDevices)));

function deviceDialog(id) {
  const d = state.devices.get(id);
  const name = h("input", { value: d.name, maxlength: 23 });
  const type = typeSelect(d.type);
  const step = h("input", { type: "number", min: 1, max: 360, value: 10, style: "width:80px" });
  const busy = fn => async e => { const b = e.currentTarget; b.disabled = true; try { await quiet(run(fn)); } finally { b.disabled = false; } };

  openDialog(d.name || `Aktor ${id}`, [
    h("div", { class: "card-sub" }, `AktorID ${id} · Funkadresse ${hex(d.addr)} · Speicherzustand: ${DEV_SLOT[d.slot] ?? d.slot}`),
    h("div", { class: "section-title" }, "Name & Typ"),
    h("div", { class: "row" }, field("Name (max. 23 Byte)", name),
      h("button", { type: "button", class: "btn", style: "align-self:flex-end", onclick: busy(async () => {
        expectOk(await call("device.setLabel", id, checkName(name.value)), "Name");
        d.name = name.value; renderDevices(); toast("Name gespeichert", "ok");
      }) }, "Speichern")),
    h("div", { class: "row" }, field("Typ / Konfiguration", type),
      h("button", { type: "button", class: "btn", style: "align-self:flex-end", onclick: busy(async () => {
        expectOk(await call("device.setType", id, Number(type.value)), "Typ");
        d.type = Number(type.value); renderDevices(); toast("Typ geändert", "ok");
      }) }, "Ändern")),
    h("div", { class: "section-title" }, "Bedienung"),
    h("div", { class: "row" },
      h("button", { type: "button", class: "btn", onclick: () => devCmd(id, CMD.AutoOn) }, "Automatik ein"),
      h("button", { type: "button", class: "btn", onclick: () => devCmd(id, CMD.AutoOff) }, "Automatik aus"),
      h("button", { type: "button", class: "btn", onclick: busy(async () => expectOk(await call("device.setFunction", id, FUNC.Select), "Auswahl")) }, "Zucken lassen")),
    h("div", { class: "row" },
      h("button", { type: "button", class: "btn", onclick: async () => { if (await confirmDialog("Pos 1 speichern", "Aktuelle Position als Zwischenposition 1 (Beschattung) speichern?")) devCmd(id, CMD.SavePos1); else deviceDialog(id); } }, "Aktuelle Pos. als Pos 1"),
      h("button", { type: "button", class: "btn", onclick: async () => { if (await confirmDialog("Pos 2 speichern", "Aktuelle Position als Zwischenposition 2 (Lüftung) speichern?")) devCmd(id, CMD.SavePos2); else deviceDialog(id); } }, "Aktuelle Pos. als Pos 2")),
    h("div", { class: "row" },
      h("span", { class: "card-sub" }, "Lamellen-Schritt (°):"), step,
      h("button", { type: "button", class: "btn small", onclick: () => devCmd(id, CMD.StepUp, Number(step.value)) }, "▲ Schritt"),
      h("button", { type: "button", class: "btn small", onclick: () => devCmd(id, CMD.StepDown, Number(step.value)) }, "▼ Schritt")),
    h("div", { class: "section-title" }, "Sonderfunktionen"),
    h("div", { class: "row" },
      h("button", { type: "button", class: "btn", title: "Aktor startet den Installationsmodus neu, damit andere commeo-Sender ihn finden", onclick: busy(async () => expectOk(await call("device.setFunction", id, FUNC.Install), "Installationsmodus")) }, "Installationsmodus"),
      h("button", { type: "button", class: "btn", title: "Aktor in den Sensor-Lernmodus versetzen", onclick: busy(async () => expectOk(await call("device.setFunction", id, FUNC.Sensor), "Sensor-Lernmodus")) }, "Sensor-Lernmodus"),
      h("button", { type: "button", class: "btn", onclick: () => endlagenDialog(id) }, "Endlagen einstellen …"),
      h("button", { type: "button", class: "btn", title: "Aktor löschen und mit gleichen Daten neu einrichten", onclick: () => reteachDialog(id) }, "Neu einlernen …")),
  ], [
    h("button", { type: "button", class: "btn danger", onclick: () => deleteDevice(id) }, "Aktor löschen"),
    h("button", { type: "button", class: "btn primary", onclick: () => closeDialog() }, "Schließen"),
  ]);
}

async function deleteDevice(id) {
  const d = state.devices.get(id);
  if (!await confirmDialog("Aktor löschen", `„${d.name}“ (#${id}) aus dem Gateway löschen? Der Aktor sollte dabei in Funkreichweite sein, damit die Verbindung sauber getrennt wird.`, "Löschen", true)) return deviceDialog(id);
  await quiet(run(async () => {
    expectOk(await call("device.delete", id), "Löschen");
    state.devices.delete(id); state.selected.delete(id); renderDevices();
  }, "Aktor gelöscht"));
}

// ---------------------------------------------------------------------------
// Neu einlernen eines Aktors (z.B. wenn er nicht erreichbar ist)
// Ablauf: Daten merken → device.delete → device.writeManual mit gleicher ID,
// Adresse, Name und Typ → Gruppenmitgliedschaften wiederherstellen.
// Klappt writeManual nicht, bleiben die Daten gespeichert: erneut versuchen
// oder per Suchlauf finden – dann werden Name, Typ und Gruppen übertragen.
// ---------------------------------------------------------------------------
const RETEACH_KEY = "selve-reteach";
function pendingReteach() {
  try { return JSON.parse(localStorage.getItem(RETEACH_KEY) || "[]"); } catch { return []; }
}
function savePendingReteach(list) {
  try { localStorage.setItem(RETEACH_KEY, JSON.stringify(list)); } catch { }
  renderReteachBanner();
}
function setPending(job) { savePendingReteach([...pendingReteach().filter(j => j.addr !== job.addr), job]); }
function clearPending(addr) { savePendingReteach(pendingReteach().filter(j => j.addr !== addr)); }

function renderReteachBanner() {
  let b = $("#reteachBanner");
  if (!b) { b = h("div", { id: "reteachBanner", class: "warnbox", style: "margin-bottom:12px" }); $("#devList").before(b); }
  const jobs = pendingReteach();
  b.hidden = !jobs.length;
  b.replaceChildren(h("strong", {}, "Neu einlernen nicht abgeschlossen: "),
    ...jobs.map(j => h("button", { class: "btn small", style: "margin-left:6px", onclick: () => reteachDialog(j) }, `${j.name} (#${j.id}) fortsetzen`)));
}

async function deviceGroups(id) {
  // Gruppen frisch lesen, damit keine veraltete Zuordnung zurückgeschrieben wird
  await loadGroups();
  return [...state.groups.values()].filter(g => g.members.includes(id)).map(g => g.id);
}

async function restoreGroups(job, newId) {
  for (const gid of job.groups) {
    const [, m, name] = await call("group.read", gid);
    if (!m.mask.includes(newId)) expectOk(await call("group.write", gid, mask([...m.mask, newId]), name), "Gruppe wiederherstellen");
  }
  await loadGroups();
}

async function finishReteach(job, newId) {
  if (job.name) await quiet(call("device.setLabel", newId, job.name));
  if (job.type) await quiet(call("device.setType", newId, job.type));
  await restoreGroups(job, newId);
  clearPending(job.addr);
  await loadDevices();
  const d = state.devices.get(newId);
  return d && !(d.flags & 1) && !(d.flags >> 6 & 1);
}

async function reteachDialog(arg) {
  // arg: AktorID (Start aus dem Aktor-Dialog) oder ein gespeicherter Auftrag
  let job = typeof arg === "object" ? arg : null;
  if (!job) {
    const d = state.devices.get(arg);
    job = { id: d.id, addr: d.addr, name: d.name, type: d.type || 1, groups: [], step: "start" };
  }
  const d = state.devices.get(job.id);
  const flags = d?.flags ?? 0;
  const log = h("div", { class: "card-sub" });
  const say = t => { log.append(h("div", {}, t)); };
  const groupNames = () => job.groups.map(g => state.groups.get(g)?.name || `#${g}`).join(", ") || "keine";

  const startBtn = h("button", { type: "button", class: "btn primary" }, job.step === "start" ? "Neu einlernen" : "Erneut versuchen");
  const scanBtn = h("button", { type: "button", class: "btn" }, "Per Suchlauf finden …");
  const testBtn = h("button", { type: "button", class: "btn" }, "Verbindung testen");

  testBtn.addEventListener("click", () => quiet(run(async () => {
    testBtn.disabled = true;
    try {
      say("Sende „Zucken“ und frage den Status neu ab …");
      await quiet(call("device.setFunction", job.id, FUNC.Select));
      await new Promise(r => setTimeout(r, 2500));
      const [, , , , f] = await call("device.getValues", job.id);
      say(f & 1 ? "→ Weiterhin nicht erreichbar." : "→ Aktor antwortet wieder. Neu einlernen ist vermutlich nicht nötig.");
      if (state.devices.get(job.id)) { state.devices.get(job.id).flags = f; updateDeviceCard(job.id); }
    } finally { testBtn.disabled = false; }
  })));

  startBtn.addEventListener("click", () => quiet(run(async () => {
    startBtn.disabled = scanBtn.disabled = testBtn.disabled = true;
    try {
      if (job.step === "start") {
        job.groups = await deviceGroups(job.id);
        say(`Gemerkt: ${job.name}, ${TYPES[job.type]}, Adresse ${hex(job.addr)}, Gruppen: ${groupNames()}`);
        job.step = "deleted";
        setPending(job);           // ab hier ist der Auftrag gesichert
        say("Lösche Aktor im Gateway …");
        try { await call("device.delete", job.id); }
        catch (e) { say(`Löschen meldet: ${e.message} – fahre fort.`); }
      }
      say(`Richte Aktor mit ID ${job.id} neu ein (Aktor muss in Funkreichweite sein) …`);
      let newId = job.id;
      try {
        expectOk(await call("device.writeManual", job.id, job.addr, checkName(job.name), job.type), "Neu einrichten");
      } catch (e) {
        // ID oder Adresse noch blockiert (Fehler 11/12) → freie ID verwenden
        if (e.code !== 11 && e.code !== 12) throw e;
        const [m] = await call("device.getIDs");
        newId = [...Array(64).keys()].find(i => i !== job.id && !m.mask.includes(i));
        if (newId == null) throw e;
        say(`ID ${job.id} ist noch belegt – verwende ID ${newId} …`);
        expectOk(await call("device.writeManual", newId, job.addr, checkName(job.name), job.type), "Neu einrichten");
      }
      say("Stelle Name, Typ und Gruppen wieder her …");
      const ok = await finishReteach(job, newId);
      say(ok ? "✓ Fertig – der Aktor ist wieder eingelernt und erreichbar." : "Eingelernt, meldet aber noch einen Fehler – bitte Status prüfen.");
      toast(`${job.name} neu eingelernt`, "ok");
      startBtn.hidden = scanBtn.hidden = true;
    } catch (e) {
      if (job.step === "deleted") say(`✗ ${e.message} – Die Daten bleiben gespeichert. Aktor prüfen (Strom, Reichweite) und erneut versuchen oder per Suchlauf finden.`);
      startBtn.textContent = "Erneut versuchen";
      throw e;
    } finally {
      startBtn.disabled = scanBtn.disabled = testBtn.disabled = false;
    }
  })));

  scanBtn.addEventListener("click", async () => {
    if (job.step === "start") {
      if (!await confirmDialog("Per Suchlauf einlernen", `„${job.name}“ wird im Gateway gelöscht und anschließend über einen Suchlauf neu gefunden. Name, Typ und Gruppen werden danach automatisch übernommen. Fortfahren?`, "Fortfahren", true)) return reteachDialog(job.id);
      job.groups = await deviceGroups(job.id);
      job.step = "deleted";
      setPending(job);
      await quiet(call("device.delete", job.id));
    }
    scanDialog();
  });

  openDialog(`Neu einlernen · ${job.name}`, [
    h("dl", { class: "kv" },
      h("dt", {}, "Aktor"), h("dd", {}, `#${job.id} · ${TYPES[job.type]} · ${hex(job.addr)}`),
      h("dt", {}, "Zustand"), h("dd", {}, d ? (FLAGS.filter(([b]) => flags >> b & 1).map(([, t]) => t).join(", ") || "OK") : "im Gateway gelöscht – wartet auf neues Einrichten"),
      job.groups.length ? [h("dt", {}, "Gruppen"), h("dd", {}, groupNames())] : null),
    h("div", { class: "warnbox" },
      h("strong", {}, "Vorher prüfen: "),
      "Hat der Aktor Strom (Sicherung)? Ist er in Funkreichweite? Ist der Aktor nur nicht erreichbar, hilft Neu-Einlernen nichts – das Gateway braucht für das Einlernen ebenfalls Funkkontakt. ",
      "Tipp: Den Aktor kurz vom Netz trennen und wieder einschalten – dann ist er 4 Minuten im Installationsmodus und lässt sich sicher einlernen."),
    h("p", { class: "hint" }, "Ablauf: Daten merken → Aktor im Gateway löschen → mit gleicher ID, Adresse, Name und Typ neu einrichten → Gruppen wiederherstellen. Schlägt das Einrichten fehl, bleiben die Daten gespeichert und du kannst es erneut versuchen."),
    log,
  ], [
    d ? testBtn : null, scanBtn,
    h("button", { type: "button", class: "btn", onclick: () => closeDialog() }, "Schließen"),
    startBtn,
  ], () => { quiet(loadDevices()); });
}

function endlagenDialog(id) {
  const d = state.devices.get(id);
  const fn = (f, label) => quiet(run(async () => expectOk(await call("device.setFunction", id, f), label)));
  const hold = (label, f) => {
    const b = h("button", { type: "button", class: "btn hold", style: "min-width:110px" }, label);
    let active = false;
    const stop = () => { if (active) { active = false; fn(FUNC.KeyRelease, "Loslassen"); } };
    b.addEventListener("pointerdown", e => { e.preventDefault(); b.setPointerCapture(e.pointerId); active = true; fn(f, label); });
    b.addEventListener("pointerup", stop);
    b.addEventListener("pointercancel", stop);
    b.addEventListener("lostpointercapture", stop);
    return b;
  };
  openDialog(`Endlagen · ${d.name}`, [
    h("div", { class: "warnbox" }, h("strong", {}, "Achtung: "), "Endlagen nur einstellen, wenn du den Behang siehst. Während der Einstellung läuft der Motor im Totmannbetrieb – er fährt nur solange die Taste gedrückt ist. Funkstörungen oder Verzögerungen können die Anlage beschädigen. Im Zweifel „Stopp“ drücken."),
    h("div", { class: "section-title" }, "1. Modus starten (löscht vorhandene Endlagen!)"),
    h("div", { class: "row" },
      h("button", { type: "button", class: "btn", onclick: () => fn(FUNC.Select, "Auswahl") }, "Zucken lassen"),
      h("button", { type: "button", class: "btn", onclick: async () => { if (await confirmDialog("Manuelle Endlageneinstellung", "Vorhandene Endlagen werden gelöscht. Fortfahren?", "Starten", true)) { await fn(FUNC.ManProg, "Manuelle Einstellung"); } endlagenDialog(id); } }, "Manuell starten"),
      h("button", { type: "button", class: "btn", onclick: async () => { if (await confirmDialog("Automatische Endlageneinstellung", "Vorhandene Endlagen werden gelöscht. Fortfahren?", "Starten", true)) { await fn(FUNC.AutoProg, "Automatische Einstellung"); } endlagenDialog(id); } }, "Automatisch starten")),
    h("div", { class: "section-title" }, "2. Fahren (gedrückt halten)"),
    h("div", { class: "row" }, hold("▲ Auf (halten)", FUNC.DriveUp), hold("▼ Ab (halten)", FUNC.DriveDown),
      h("button", { type: "button", class: "btn danger solid", onclick: () => fn(FUNC.DriveStop, "Stopp") }, "■ Stopp")),
    h("div", { class: "section-title" }, "3. Speichern (nur manueller Modus)"),
    h("p", { class: "hint" }, "Manuell: zuerst untere Endlage anfahren und speichern, dann obere Endlage anfahren und speichern. Automatisch: unten beginnen, dann nur bis zur oberen Endlage fahren – der Aktor sucht die untere selbst."),
    h("div", { class: "row" }, h("button", { type: "button", class: "btn primary", onclick: () => fn(FUNC.StorePosition, "Position speichern") }, "Position als Endlage speichern")),
  ], [h("button", { type: "button", class: "btn", onclick: () => deviceDialog(id) }, "Zurück")]);
}

// Suchlauf / Einlernen neuer Aktore
let scan = null;
$("#devScan").addEventListener("click", () => scanDialog());

function scanDialog() {
  scan = { status: 0, count: 0, found: [] };
  renderScan();
}

function renderScan() {
  if (!scan) return;
  const statusTxt = ["Bereit", "Suche läuft …", "Gefundene Aktore werden geprüft …", "Suche abgeschlossen", "Suche fehlgeschlagen"][scan.status];
  const body = [
    h("p", { class: "hint" }, "Die neuen Aktore zuerst in den Installationsmodus bringen: mit einem bereits eingelernten Handsender oder durch kurzes Trennen vom Netz. Danach sind sie 4 Minuten lang auffindbar."),
    h("div", { class: "big-status" }, statusTxt + (scan.status ? ` · ${scan.count} neu` : "")),
  ];
  if (scan.found.length) {
    body.push(h("div", { class: "section-title" }, "Gefunden"));
    for (const f of scan.found) {
      const name = h("input", { value: f.name || `Aktor ${f.id}`, maxlength: 23 });
      body.push(h("div", { class: "card" },
        h("div", { class: "card-sub" }, `#${f.id} · ${TYPES[f.type] ?? f.type} · ${hex(f.addr)}`),
        f.saved
          ? h("div", { class: "badge ok" }, "Eingelernt")
          : h("div", { class: "row" }, name,
            h("button", { type: "button", class: "btn small", onclick: () => quiet(run(() => call("device.setFunction", f.id, FUNC.Select))) }, "Zucken"),
            h("button", { type: "button", class: "btn small primary", onclick: async e => {
              e.currentTarget.disabled = true;
              await quiet(run(async () => {
                expectOk(await call("device.save", f.id), "Einlernen");
                // gehört der Fund zu einem unterbrochenen Neu-Einlernen, Daten übernehmen
                const job = pendingReteach().find(j => j.addr === f.addr);
                if (job) {
                  await finishReteach(job, f.id);
                  toast(`${job.name}: Name, Typ und Gruppen übernommen`, "ok");
                } else {
                  const n = name.value.trim();
                  if (n && n !== f.name) await call("device.setLabel", f.id, checkName(n));
                }
                f.saved = true;
              }, "Aktor eingelernt"));
              renderScan();
            } }, "Einlernen"))));
    }
  }
  openDialog("Neue Aktore suchen", body, [
    h("button", { type: "button", class: "btn", onclick: () => quiet(run(async () => { expectOk(await call("device.scanStart"), "Suchlauf"); scan.found = []; scan.status = 1; renderScan(); })) }, scan.status ? "Neu suchen" : "Suche starten"),
    h("button", { type: "button", class: "btn primary", onclick: () => closeDialog() }, "Fertig"),
  ], async () => {
    // temporäre Aktore freigeben
    if (scan && scan.status) await quiet(call("device.scanStop"));
    scan = null;
    quiet(loadDevices());
  });
}

async function onScanResult([status, count, m]) {
  if (!scan) return;
  scan.status = status; scan.count = count;
  if (status === 3) {
    for (const id of m.mask) {
      if (scan.found.some(f => f.id === id)) continue;
      try {
        const [, addr, name, type] = await call("device.getInfo", id);
        scan.found.push({ id, addr, name, type });
      } catch { }
    }
  }
  renderScan();
}

// ---------------------------------------------------------------------------
// Gruppen
// ---------------------------------------------------------------------------
async function loadGroups() {
  const [m] = await call("group.getIDs");
  state.groups.clear();
  for (const id of m.mask) {
    const [, members, name] = await call("group.read", id);
    state.groups.set(id, { id, members: members.mask, name });
  }
  renderGroups();
}

function renderGroups() {
  const list = $("#grpList");
  $("#cnt-groups").textContent = state.groups.size || "";
  if (!state.groups.size) return list.replaceChildren(h("div", { class: "empty" }, "Keine Gruppen angelegt."));
  list.replaceChildren(...[...state.groups.values()].map(g => {
    const names = g.members.map(id => state.devices.get(id)?.name || `#${id}`);
    const cmd = c => quiet(run(async () => expectOk(await call("command.group", g.id, c, CMD_TYPE.Manual, 0), `Gruppe „${CMD_NAMES[c]}“`)));
    return h("div", { class: "card" },
      h("div", { class: "card-head" },
        h("div", { class: "grow" },
          h("div", { class: "card-title" }, g.name || `Gruppe ${g.id}`),
          h("div", { class: "card-sub" }, `#${g.id} · ${g.members.length} Aktore`)),
        h("button", { class: "btn small ghost", onclick: () => groupDialog(g.id) }, "Bearbeiten")),
      h("div", { class: "card-sub" }, names.join(", ") || "keine Mitglieder"),
      h("div", { class: "ctrl" },
        h("button", { class: "btn icon", title: "Auf", onclick: () => cmd(CMD.Up) }, "▲"),
        h("button", { class: "btn icon", title: "Stopp", onclick: () => cmd(CMD.Stop) }, "■"),
        h("button", { class: "btn icon", title: "Ab", onclick: () => cmd(CMD.Down) }, "▼"),
        h("button", { class: "btn small", onclick: () => cmd(CMD.Pos1) }, "Pos 1"),
        h("button", { class: "btn small", onclick: () => cmd(CMD.Pos2) }, "Pos 2")));
  }));
}

function groupDialog(id) {
  const isNew = id == null;
  if (isNew) {
    id = [...Array(32).keys()].find(i => !state.groups.has(i));
    if (id == null) return toast("Alle 32 Gruppen sind belegt.", "bad");
  }
  const g = state.groups.get(id) || { id, members: [], name: "" };
  const name = h("input", { value: g.name, maxlength: 23, placeholder: "z.B. Erdgeschoss" });
  const boxes = [...state.devices.values()].map(d =>
    h("label", { title: d.name }, h("input", { type: "checkbox", value: d.id, checked: g.members.includes(d.id) }), d.name || `#${d.id}`));
  openDialog(isNew ? "Neue Gruppe" : `Gruppe bearbeiten · #${id}`, [
    field("Name (max. 23 Byte)", name),
    h("div", { class: "section-title" }, "Mitglieder"),
    boxes.length ? h("div", { class: "members" }, boxes) : h("p", { class: "hint" }, "Keine Aktore vorhanden."),
  ], [
    isNew ? null : h("button", { type: "button", class: "btn danger", onclick: async () => {
      if (!await confirmDialog("Gruppe löschen", `Gruppe „${g.name}“ löschen? Die Aktore bleiben erhalten.`, "Löschen", true)) return groupDialog(id);
      await quiet(run(async () => { expectOk(await call("group.delete", id), "Löschen"); state.groups.delete(id); renderGroups(); }, "Gruppe gelöscht"));
    } }, "Löschen"),
    h("button", { type: "button", class: "btn", onclick: () => closeDialog() }, "Abbrechen"),
    h("button", { type: "button", class: "btn primary", onclick: () => quiet(run(async () => {
      const members = boxes.map(b => b.firstChild).filter(c => c.checked).map(c => Number(c.value));
      expectOk(await call("group.write", id, mask(members), checkName(name.value)), "Speichern");
      state.groups.set(id, { id, members, name: name.value });
      renderGroups(); closeDialog();
    }, "Gruppe gespeichert")) }, "Speichern"),
  ]);
}
$("#grpNew").addEventListener("click", () => groupDialog(null));
$("#grpRefresh").addEventListener("click", () => quiet(run(loadGroups)));

// ---------------------------------------------------------------------------
// iveo
// ---------------------------------------------------------------------------
async function loadIveo() {
  const [m] = await call("iveo.getIDs");
  state.iveo.clear();
  for (const id of m.mask) {
    const [, active, name, type] = await call("iveo.getConfig", id);
    state.iveo.set(id, { id, active, name, type });
  }
  const [rep] = await call("iveo.getRepeater");
  $("#iveoRepeater").value = rep;
  renderIveo();
}

function iveoCmd(ids, c) {
  return quiet(run(async () => expectOk(await call("iveo.commandManual", mask(ids), c), `iveo „${IVEO_CMD[c]}“`)));
}

function renderIveo() {
  const list = $("#iveoList");
  $("#cnt-iveo").textContent = state.iveo.size || "";
  if (!state.iveo.size) return list.replaceChildren(h("div", { class: "empty" }, "Keine iveo-Kanäle aktiv. Mit „Neuer Kanal“ anlegen und dann in den Aktor einlernen."));
  list.replaceChildren(...[...state.iveo.values()].map(c => h("div", { class: "card", "data-iveo": c.id },
    h("div", { class: "card-head" },
      h("div", { class: "grow" },
        h("div", { class: "card-title" }, c.name || `Kanal ${c.id}`),
        h("div", { class: "card-sub" }, `#${c.id} · ${TYPES[c.type] ?? "–"}`)),
      h("button", { class: "btn small ghost", onclick: () => iveoDialog(c.id) }, "⋯")),
    h("div", { class: "ctrl" },
      h("button", { class: "btn icon", title: "Auf", onclick: () => iveoCmd([c.id], 1) }, "▲"),
      h("button", { class: "btn icon", title: "Stopp", onclick: () => iveoCmd([c.id], 0) }, "■"),
      h("button", { class: "btn icon", title: "Ab", onclick: () => iveoCmd([c.id], 2) }, "▼"),
      h("button", { class: "btn small", onclick: () => iveoCmd([c.id], 3) }, "Pos 1"),
      h("button", { class: "btn small", onclick: () => iveoCmd([c.id], 4) }, "Pos 2")))));
}

function iveoDialog(id) {
  const isNew = id == null;
  if (isNew) {
    id = [...Array(64).keys()].find(i => !state.iveo.has(i));
    if (id == null) return toast("Alle 64 iveo-Kanäle sind belegt.", "bad");
  }
  const c = state.iveo.get(id) || { id, active: 1, name: "", type: 1 };
  const name = h("input", { value: c.name, maxlength: 23 });
  const type = typeSelect(c.type, true);
  const save = async () => {
    expectOk(await call("iveo.setConfig", id, 1, Number(type.value)), "Konfiguration");
    expectOk(await call("iveo.setLabel", id, checkName(name.value)), "Name");
    state.iveo.set(id, { id, active: 1, name: name.value, type: Number(type.value) });
    renderIveo();
  };
  openDialog(isNew ? `Neuer iveo-Kanal · #${id}` : `iveo-Kanal · #${id}`, [
    h("div", { class: "fields" }, field("Name (max. 23 Byte)", name), field("Typ", type)),
    h("div", { class: "section-title" }, "In Aktor einlernen / auslernen"),
    h("p", { class: "hint" }, "1. Am iveo-Aktor mit einem bereits eingelernten Handsender 3 s die PROG-Taste drücken (der Aktor fährt kurz auf und ab). 2. Innerhalb 1 Minute hier „Einlernen / Auslernen“ drücken. Ist der Kanal schon eingelernt, wird er dadurch ausgelernt."),
    h("div", { class: "row" },
      h("button", { type: "button", class: "btn", onclick: () => quiet(run(async () => { if (isNew || !state.iveo.has(id)) await save(); expectOk(await call("iveo.commandTeach", id), "Lernbefehl"); }, "Lernbefehl gesendet")) }, "Einlernen / Auslernen"),
      h("button", { type: "button", class: "btn", title: "Aktore dieses Kanals in Lernbereitschaft versetzen (für weitere Sender)", onclick: () => quiet(run(async () => expectOk(await call("iveo.commandLearn", id), "Lernbereitschaft"), "Lernbereitschaft gestartet")) }, "Lernbereitschaft starten")),
  ], [
    isNew ? null : h("button", { type: "button", class: "btn danger", onclick: async () => {
      if (!await confirmDialog("Kanal zurücksetzen", "Kanal auf Werkszustand setzen? Vorher sollte er aus allen Aktoren ausgelernt sein.", "Zurücksetzen", true)) return iveoDialog(id);
      await quiet(run(async () => { expectOk(await call("iveo.factory", id), "Zurücksetzen"); state.iveo.delete(id); renderIveo(); }, "Kanal gelöscht"));
    } }, "Kanal löschen"),
    h("button", { type: "button", class: "btn", onclick: () => closeDialog() }, "Schließen"),
    h("button", { type: "button", class: "btn primary", onclick: () => quiet(run(async () => { await save(); closeDialog(); }, "Kanal gespeichert")) }, "Speichern"),
  ]);
}
$("#iveoNew").addEventListener("click", () => iveoDialog(null));
$("#iveoRefresh").addEventListener("click", () => quiet(run(loadIveo)));
$("#iveoRepeater").addEventListener("change", e => quiet(run(async () => expectOk(await call("iveo.setRepeater", Number(e.target.value)), "Repeater"), "Repeater-Einstellung gespeichert")));

// ---------------------------------------------------------------------------
// Sensoren
// ---------------------------------------------------------------------------
const fmtTemp = v => v < 0 ? "–" : `${(v * 0.5 - 40).toFixed(1)} °C`;
const fmtWind = v => v < 0 ? "–" : `${(v * 0.5).toFixed(1)} m/s`;
const fmtSun = v => v < 0 ? "–" : `${(v * 0.5).toFixed(1)} kLux`;
const fmtDay = v => v < 0 ? "–" : `${v * 4} Lux`;

function sensorValues(v) {
  const [wind, rain, temp, light] = v.digital;
  const [tA, wA, s1, dl, s2, s3] = v.analog;
  return h("dl", { class: "kv" },
    h("dt", {}, "Temperatur"), h("dd", {}, `${fmtTemp(tA)} · ${TEMP_D[temp] ?? temp}`),
    h("dt", {}, "Wind"), h("dd", {}, `${fmtWind(wA)} · ${WIND_D[wind] ?? wind}`),
    h("dt", {}, "Regen"), h("dd", {}, RAIN_D[rain] ?? rain),
    h("dt", {}, "Helligkeit"), h("dd", {}, `${LIGHT_D[light] ?? light} · Tageslicht ${fmtDay(dl)}`),
    h("dt", {}, "Sonne"), h("dd", {}, [s1, s2, s3].map(fmtSun).join(" / ")));
}

async function loadSensors() {
  const [m] = await call("sensor.getIDs", );
  state.sensors.clear();
  for (const id of m.mask) {
    const [, addr, name] = await call("sensor.getInfo", id);
    const s = { id, addr, name };
    try {
      const v = await call("sensor.getValues", id);
      setSensorValues(s, v.slice(1));
    } catch { }
    state.sensors.set(id, s);
  }
  renderSensors();
}
function setSensorValues(s, v) {
  s.digital = v.slice(0, 4); s.status = v[4]; s.analog = v.slice(5, 11);
}

function renderSensors() {
  const list = $("#senList");
  $("#cnt-sensors").textContent = state.sensors.size || "";
  if (!state.sensors.size) return list.replaceChildren(h("div", { class: "empty" }, "Keine Sensoren eingelernt."));
  list.replaceChildren(...[...state.sensors.values()].map(s => h("div", { class: "card", "data-sensor": s.id },
    h("div", { class: "card-head" },
      h("div", { class: "grow" },
        h("div", { class: "card-title" }, s.name || `Sensor ${s.id}`),
        h("div", { class: "card-sub" }, `#${s.id} · ${hex(s.addr)}`)),
      h("button", { class: "btn small ghost", onclick: () => simpleItemDialog("sensor", s, renderSensors, state.sensors) }, "⋯")),
    h("div", { class: "badges" }, h("span", { class: "badge " + (s.status === 1 ? "ok" : s.status >= 2 ? "warn" : "") }, SENSOR_STATUS[s.status] ?? "–")),
    s.digital ? sensorValues(s) : null)));
}

// Name ändern / löschen für Sensoren und Sender
function simpleItemDialog(kind, item, render, map) {
  const label = kind === "sensor" ? "Sensor" : "Sender";
  const name = h("input", { value: item.name, maxlength: 23 });
  openDialog(`${label} · #${item.id}`, [
    h("div", { class: "card-sub" }, `Funkadresse ${hex(item.addr)}` + (item.channel != null ? ` · Kanal ${item.channel} · Resetzähler ${item.resetCount}` : "")),
    field("Name (max. 23 Byte)", name),
    kind === "sender" ? h("p", { class: "hint" }, "Hinweis: Nach dem Löschen hier muss der Gateway-Kanal zusätzlich im Handsender selbst gelöscht werden. Besser: am Handsender mit SELECT das Gateway wählen und PROG drücken – dann wird die Verbindung sauber getrennt.") : null,
  ], [
    h("button", { type: "button", class: "btn danger", onclick: async () => {
      if (!await confirmDialog(`${label} löschen`, `„${item.name}“ aus dem Gateway löschen?`, "Löschen", true)) return simpleItemDialog(kind, item, render, map);
      await quiet(run(async () => { expectOk(await call(`${kind}.delete`, item.id), "Löschen"); map.delete(item.id); render(); }, `${label} gelöscht`));
    } }, "Löschen"),
    h("button", { type: "button", class: "btn", onclick: () => closeDialog() }, "Abbrechen"),
    h("button", { type: "button", class: "btn primary", onclick: () => quiet(run(async () => {
      expectOk(await call(`${kind}.setLabel`, item.id, checkName(name.value)), "Name");
      item.name = name.value; render(); closeDialog();
    }, "Name gespeichert")) }, "Speichern"),
  ]);
}

// Einlern-Assistent für Sensoren und Sender
let teach = null;
function teachDialog(kind) {
  teach = { kind, status: 0, timeLeft: 240, id: -1, name: "", event: 0 };
  renderTeach();
  quiet(run(async () => { expectOk(await call(`${kind}.teachStart`), "Einlernen"); teach.status = 1; renderTeach(); }));
}
function renderTeach() {
  if (!teach) return;
  const isSensor = teach.kind === "sensor";
  const done = teach.status === 2;
  const steps = isSensor
    ? "Am commeo-Sensor kurz die PROG-Taste drücken."
    : "Am commeo-Handsender mit der SELECT-Taste den Suchlauf starten und das Gateway auswählen, dann die PROG-Taste drücken.";
  openDialog(isSensor ? "Sensor einlernen" : "Handsender einlernen", [
    h("p", { class: "hint" }, steps),
    h("div", { class: "big-status" }, done ? `Eingelernt als #${teach.id}${teach.name ? " · " + teach.name : ""}` : teach.status === 1 ? `Warte auf ${isSensor ? "Sensor" : "Sender"} … noch ${teach.timeLeft} s` : "Wird gestartet …"),
    !done ? h("div", { class: "progress" }, h("i", { style: `width:${(teach.timeLeft / 240) * 100}%` })) : null,
    !isSensor && teach.event ? h("div", { class: "card-sub" }, `Letzte Taste: ${SENDER_EVENTS[teach.event] ?? teach.event}`) : null,
  ], [h("button", { type: "button", class: "btn primary", onclick: () => closeDialog() }, done ? "Fertig" : "Abbrechen")],
  async () => {
    const t = teach; teach = null;
    if (t && t.status !== 2) await quiet(call(`${t.kind}.teachStop`));
    quiet(t.kind === "sensor" ? loadSensors() : loadSenders());
  });
}
function onTeachResult(kind, v) {
  if (!teach || teach.kind !== kind) return;
  teach.status = v[0]; teach.timeLeft = v[1]; teach.id = v[2];
  if (kind === "sender") { teach.name = v[3]; teach.event = v[4]; }
  if (teach.status === 0) { toast("Einlernzeit abgelaufen."); closeDialog(); return; }
  renderTeach();
}
$("#senTeach").addEventListener("click", () => teachDialog("sensor"));
$("#senRefresh").addEventListener("click", () => quiet(run(loadSensors)));

// ---------------------------------------------------------------------------
// Sender
// ---------------------------------------------------------------------------
async function loadSenders() {
  const [m] = await call("sender.getIDs");
  state.senders.clear();
  for (const id of m.mask) {
    const [, addr, channel, resetCount, name] = await call("sender.getInfo", id);
    let lastEvent = 0;
    try { [, lastEvent] = await call("sender.getValues", id); } catch { }
    state.senders.set(id, { id, addr, channel, resetCount, name, lastEvent });
  }
  renderSenders();
}
function renderSenders() {
  const list = $("#sndList");
  $("#cnt-senders").textContent = state.senders.size || "";
  if (!state.senders.size) return list.replaceChildren(h("div", { class: "empty" }, "Keine Handsender eingelernt."));
  list.replaceChildren(...[...state.senders.values()].map(s => h("div", { class: "card", "data-sender": s.id },
    h("div", { class: "card-head" },
      h("div", { class: "grow" },
        h("div", { class: "card-title" }, s.name || `Sender ${s.id}`),
        h("div", { class: "card-sub" }, `#${s.id} · ${hex(s.addr)} · Kanal ${s.channel}`)),
      h("button", { class: "btn small ghost", onclick: () => simpleItemDialog("sender", s, renderSenders, state.senders) }, "⋯")),
    h("div", { class: "card-sub" }, `Letztes Ereignis: ${SENDER_EVENTS[s.lastEvent] ?? s.lastEvent}${s.lastTime ? " · " + s.lastTime : ""}`))));
}
$("#sndTeach").addEventListener("click", () => teachDialog("sender"));
$("#sndRefresh").addEventListener("click", () => quiet(run(loadSenders)));

// ---------------------------------------------------------------------------
// Sensorsimulation
// ---------------------------------------------------------------------------
async function loadSensim() {
  const [m] = await call("senSim.getIDs");
  state.sensim.clear();
  for (let id = 0; id < 8; id++) {
    const used = m.mask.includes(id);
    const s = { id, used, active: 0, name: "", values: null, test: 0 };
    if (used) {
      try { [, s.active, s.name] = await call("senSim.getConfig", id); } catch { }
      try { s.values = (await call("senSim.getValues", id)).slice(1); } catch { }
      try { [, s.test] = await call("senSim.getTest", id); } catch { }
    }
    state.sensim.set(id, s);
  }
  renderSensim();
}
function renderSensim() {
  const list = $("#simList");
  const used = [...state.sensim.values()].filter(s => s.used);
  $("#cnt-sensim").textContent = used.length || "";
  list.replaceChildren(...[...state.sensim.values()].map(s => h("div", { class: "card" },
    h("div", { class: "card-head" },
      h("div", { class: "grow" },
        h("div", { class: "card-title" }, s.used ? (s.name || `Simulation ${s.id}`) : `Platz ${s.id} · frei`),
        h("div", { class: "card-sub" }, `#${s.id}` + (s.used ? ` · ${s.active ? "aktiv" : "deaktiviert"}${s.test ? " · Testmodus" : ""}` : ""))),
      h("button", { class: "btn small " + (s.used ? "ghost" : ""), onclick: () => sensimDialog(s.id) }, s.used ? "⋯" : "Einrichten")),
    s.values ? sensorValues({ digital: s.values.slice(0, 4), analog: s.values.slice(4, 10) }) : null)));
}

function sensimDialog(id) {
  const s = state.sensim.get(id);
  const v = s.values || [0, 0, 0, 0, -1, -1, -1, -1, -1, -1];
  const name = h("input", { value: s.name || `Simulation ${id}`, maxlength: 23 });
  const active = h("input", { type: "checkbox", checked: !!s.active || !s.used });
  const sel = (opts, val) => h("select", {}, opts.map((o, i) => h("option", { value: i, selected: i === val }, o)));
  const num = (val, min, max, step) => h("input", { type: "number", value: val, min, max, step, style: "width:100%" });
  const wind = sel(WIND_D, v[0]), rain = sel(RAIN_D, v[1]), temp = sel(TEMP_D, v[2]), light = sel(LIGHT_D, v[3]);
  // Analogwerte in echten Einheiten, -1 / leer = nicht verfügbar
  const tA = num(v[4] < 0 ? "" : v[4] * 0.5 - 40, -40, 85, 0.5);
  const wA = num(v[5] < 0 ? "" : v[5] * 0.5, 0, 50, 0.5);
  const s1 = num(v[6] < 0 ? "" : v[6] * 0.5, 0, 125, 0.5);
  const dl = num(v[7] < 0 ? "" : v[7] * 4, 0, 1000, 4);
  const s2 = num(v[8] < 0 ? "" : v[8] * 0.5, 0, 125, 0.5);
  const s3 = num(v[9] < 0 ? "" : v[9] * 0.5, 0, 125, 0.5);
  const enc = (inp, f) => inp.value === "" ? -1 : Math.round(f(Number(inp.value)));
  const actorSel = h("select", {}, [...state.devices.values()].map(d => h("option", { value: d.id }, `#${d.id} ${d.name}`)));

  openDialog(`Sensorsimulation · #${id}`, [
    h("div", { class: "row" }, field("Name (max. 23 Byte)", name), h("label", { class: "switch", style: "align-self:flex-end" }, active, "Aktiv")),
    h("div", { class: "section-title" }, "Sensorwerte"),
    h("div", { class: "fields" },
      field("Wind (digital)", wind), field("Regen", rain), field("Temperatur (digital)", temp), field("Helligkeit", light),
      field("Temperatur °C", tA), field("Wind m/s", wA), field("Tageslicht Lux", dl),
      field("Sonne 1 kLux", s1), field("Sonne 2 kLux", s2), field("Sonne 3 kLux", s3)),
    h("p", { class: "hint" }, "Leere Analogfelder = Wert nicht verfügbar."),
    h("div", { class: "section-title" }, "In Aktor ein-/auslernen"),
    h("p", { class: "hint" }, "Ein commeo-Aktor unterstützt meist nur eine Sensorik – eine vorhandene wird überschrieben. Der Aktor muss in Funkreichweite sein."),
    h("div", { class: "row" }, actorSel,
      h("button", { type: "button", class: "btn", onclick: () => quiet(run(async () => expectOk(await call("senSim.store", id, Number(actorSel.value)), "Einlernen"), "Simulation in Aktor eingelernt")) }, "Einlernen"),
      h("button", { type: "button", class: "btn", onclick: () => quiet(run(async () => expectOk(await call("senSim.delete", id, Number(actorSel.value)), "Auslernen"), "Simulation aus Aktor ausgelernt")) }, "Auslernen")),
    h("div", { class: "section-title" }, "Test"),
    h("div", { class: "row" },
      ...[["▲", 1], ["■", 0], ["▼", 2], ["Pos 1", 3], ["Pos 2", 5]].map(([t, c]) =>
        h("button", { type: "button", class: "btn small", onclick: () => quiet(run(async () => expectOk(await call("senSim.drive", id, c), "Fahrbefehl"))) }, t)),
      h("button", { type: "button", class: "btn small", title: "Sensorzeit 20× beschleunigt, endet nach 5 Minuten automatisch", onclick: () => quiet(run(async () => { expectOk(await call("senSim.setTest", id, s.test ? 0 : 1), "Testmodus"); s.test = s.test ? 0 : 1; renderSensim(); }, "Testmodus umgeschaltet")) }, s.test ? "Testmodus aus" : "Testmodus an")),
  ], [
    s.used ? h("button", { type: "button", class: "btn danger", onclick: async () => {
      if (!await confirmDialog("Simulation löschen", "Simulation auf Werkszustand setzen? Vorher aus allen Aktoren auslernen, sonst melden diese Sensorverlust.", "Löschen", true)) return sensimDialog(id);
      await quiet(run(async () => { expectOk(await call("senSim.factory", id), "Löschen"); await loadSensim(); }, "Simulation gelöscht"));
    } }, "Löschen") : null,
    h("button", { type: "button", class: "btn", onclick: () => closeDialog() }, "Schließen"),
    h("button", { type: "button", class: "btn primary", onclick: () => quiet(run(async () => {
      expectOk(await call("senSim.setConfig", id, active.checked ? 1 : 0), "Konfiguration");
      expectOk(await call("senSim.setLabel", id, checkName(name.value)), "Name");
      expectOk(await call("senSim.setValues", id, Number(wind.value), Number(rain.value), Number(temp.value), Number(light.value),
        enc(tA, x => (x + 40) * 2), enc(wA, x => x * 2), enc(s1, x => x * 2), enc(dl, x => x / 4), enc(s2, x => x * 2), enc(s3, x => x * 2)), "Werte");
      await loadSensim(); closeDialog();
    }, "Simulation gespeichert")) }, "Speichern"),
  ]);
}
$("#simRefresh").addEventListener("click", () => quiet(run(loadSensim)));

// ---------------------------------------------------------------------------
// Gateway
// ---------------------------------------------------------------------------
async function loadDuty() {
  const [mode, util] = await call("param.getDuty");
  setDuty(mode, util);
}
function setDuty(mode, util) {
  const d = $("#duty");
  d.textContent = `Funk ${util} %` + (mode && util >= 100 ? " · blockiert" : "");
  d.className = "pill " + (util >= 100 ? "off" : util >= 70 ? "warn" : "");
}

async function getRF() {
  // Die Spezifikation nennt beide Namen
  try { return await call("param.getRF"); } catch { return await call("service.getRF"); }
}

async function loadGateway() {
  const [st] = await call("service.getState");
  const [v1, v2, v3, sp1, sp2, serial, rev] = await call("service.getVersion");
  const [led] = await call("service.getLED");
  const [fwd] = await call("param.getForward");
  const ev = await call("param.getEvent");
  const [dm, du] = await call("param.getDuty");
  setDuty(dm, du);
  const kv = pairs => pairs.flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)]);
  $("#gwInfo").replaceChildren(...kv([
    ["Status", GW_STATE[st] ?? st],
    ["Seriennummer", serial],
    ["Firmware", [v1, v2, v3, rev].map(hex2).join(".")],
    ["XML-Spezifikation", `${Number(sp1).toString(16)}.${Number(sp2).toString(16)}`],
    ["Port", $("#connState").textContent.replace("Verbunden · ", "")],
    ["Funkauslastung", `${du} % (${dm ? "Senden wird bei 100 % blockiert" : "keine Sperre"})`],
  ]));
  try {
    const [net, rc, base, snet, sid, irc, iid] = await getRF();
    $("#gwRF").replaceChildren(...kv([
      ["commeo Netzwerk", hex(net)], ["commeo Funkadresse", hex(base)], ["commeo Resetzähler", rc],
      ["Sensorsim. Netzwerk", hex(snet)], ["Sensorsim. Adresse", hex(sid)],
      ["iveo Funkadresse", hex(iid)], ["iveo Resetzähler", irc],
    ]));
  } catch (e) { $("#gwRF").replaceChildren(h("dd", {}, e.message)); }

  const sw = (label, desc, checked, onChange) => {
    const inp = h("input", { type: "checkbox", checked: !!checked });
    inp.addEventListener("change", async () => {
      inp.disabled = true;
      try { await run(() => onChange(inp.checked), "Einstellung gespeichert"); } catch { inp.checked = !inp.checked; }
      inp.disabled = false;
    });
    return h("label", { class: "switch" }, inp, h("div", {}, label, h("small", {}, desc)));
  };
  const evNames = [["Aktor-Ereignisse", "Positionen und Zustände live melden"], ["Sensor-Ereignisse", "Neue Sensordaten melden"], ["Sender-Ereignisse", "Tastendrücke eingelernter Handsender melden"], ["Protokoll", "Interne Meldungen des Gateways senden"], ["Funkauslastung", "Änderungen des Duty Cycle melden"]];
  const evState = [...ev];
  $("#gwSettings").replaceChildren(
    sw("LED-Anzeige", "Status-LED am Stick im Normalbetrieb", led, async on => expectOk(await call("service.setLED", on ? 1 : 0), "LED")),
    sw("commeo-Weiterleitung", "Gateway leitet als Repeater commeo-Telegramme weiter", fwd, async on => expectOk(await call("param.setForward", on ? 1 : 0), "Weiterleitung")),
    ...evNames.map(([l, d], i) => sw(l, d, ev[i], async on => {
      const next = [...evState]; next[i] = on ? 1 : 0;
      expectOk(await call("param.setEvent", ...next), "Ereignisse");
      evState[i] = next[i];
    })),
  );
}
$("#gwRefresh").addEventListener("click", () => quiet(run(loadGateway)));
$("#gwReset").addEventListener("click", async () => {
  if (!await confirmDialog("Gateway neu starten", "Das Gateway wird neu gestartet und liest danach alle Aktorzustände neu ein.", "Neu starten")) return;
  await quiet(run(async () => {
    expectOk(await call("service.reset"), "Neustart");
    toast("Gateway startet neu …");
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 1000));
      try { const [st] = await call("service.getState"); if (st === 3) { toast("Gateway ist bereit.", "ok"); state.loaded = {}; await initialLoad(); return; } } catch { }
    }
    toast("Gateway hat nach 60 s nicht „Bereit“ gemeldet.", "bad");
  }));
});
$("#gwFactory").addEventListener("click", () => {
  const inp = h("input", { placeholder: "WERKSZUSTAND" });
  openDialog("Werkszustand herstellen", [
    h("div", { class: "warnbox" }, "Alle eingelernten Aktore, Sender, Sensoren, Gruppen, iveo-Kanäle und Einstellungen werden im Gateway gelöscht. Die Aktore selbst müssen danach neu gesucht und eingelernt werden. Vorher eine Sicherung exportieren!"),
    field("Zur Bestätigung WERKSZUSTAND eingeben", inp),
  ], [
    h("button", { type: "button", class: "btn", onclick: () => closeDialog() }, "Abbrechen"),
    h("button", { type: "button", class: "btn danger solid", onclick: () => {
      if (inp.value.trim().toUpperCase() !== "WERKSZUSTAND") return toast("Bestätigung fehlt.", "bad");
      quiet(run(async () => { expectOk(await call("service.factoryReset"), "Werkszustand"); closeDialog(); state.loaded = {}; await initialLoad(); }, "Gateway auf Werkszustand gesetzt"));
    } }, "Alles löschen"),
  ]);
});

$("#gwBackup").addEventListener("click", () => quiet(run(async () => {
  const backup = { created: new Date().toISOString(), gateway: {}, devices: [], groups: [], iveo: [], sensors: [], senders: [], sensim: [] };
  const [v1, v2, v3, , , serial, rev] = await call("service.getVersion");
  backup.gateway = { serial, firmware: [v1, v2, v3, rev].map(hex2).join("."), forward: (await call("param.getForward"))[0], events: await call("param.getEvent"), led: (await call("service.getLED"))[0], iveoRepeater: (await call("iveo.getRepeater"))[0] };
  try { backup.gateway.rf = await getRF(); } catch { }
  for (const id of (await call("device.getIDs"))[0].mask) {
    const [, addr, name, type, slot] = await call("device.getInfo", id);
    backup.devices.push({ id, addr, name, type, slot });
  }
  for (const id of (await call("group.getIDs"))[0].mask) {
    const [, m, name] = await call("group.read", id);
    backup.groups.push({ id, members: m.mask, name });
  }
  for (const id of (await call("iveo.getIDs"))[0].mask) {
    const [, active, name, type] = await call("iveo.getConfig", id);
    backup.iveo.push({ id, active, name, type });
  }
  for (const id of (await call("sensor.getIDs"))[0].mask) {
    const [, addr, name] = await call("sensor.getInfo", id);
    backup.sensors.push({ id, addr, name });
  }
  for (const id of (await call("sender.getIDs"))[0].mask) {
    const [, addr, channel, resetCount, name] = await call("sender.getInfo", id);
    backup.senders.push({ id, addr, channel, resetCount, name });
  }
  for (const id of (await call("senSim.getIDs"))[0].mask) {
    const [, active, name] = await call("senSim.getConfig", id);
    backup.sensim.push({ id, active, name });
  }
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const a = h("a", { href: URL.createObjectURL(blob), download: `selve-gateway-${serial}-${backup.created.slice(0, 10)}.json` });
  document.body.append(a); a.click(); a.remove();
}, "Sicherung erstellt")));

// ---------------------------------------------------------------------------
// Protokoll
// ---------------------------------------------------------------------------
const LOG_MAX = 500;
function logAdd(kind, text, cls = kind) {
  const list = $("#logList");
  const item = h("div", { class: "log-item " + cls },
    h("time", {}, new Date().toLocaleTimeString("de-DE")),
    h("span", { class: "kind" }, kind),
    h("pre", {}, text));
  list.prepend(item);
  while (list.children.length > LOG_MAX) list.lastChild.remove();
}
$("#logClear").addEventListener("click", () => $("#logList").replaceChildren());
$("#methodList").replaceChildren(...METHODS.map(m => h("option", { value: m })));
$("#consoleForm").addEventListener("submit", async e => {
  e.preventDefault();
  let params = [];
  const raw = $("#consoleParams").value.trim();
  try { if (raw) params = JSON.parse(raw); if (!Array.isArray(params)) params = [params]; }
  catch { return toast("Parameter sind kein gültiges JSON.", "bad"); }
  const method = $("#consoleMethod").value.trim();
  const r = await api("api/call", { method, params });
  logAdd(r.ok ? "Antwort" : "Fehler", r.ok ? `${method} → ${JSON.stringify(r.values)}` : `${method}: ${r.error}`, r.ok ? "rx" : "err");
});

function describeEvent(method, v) {
  const short = method.replace("selve.GW.", "");
  switch (method) {
    case "selve.GW.event.device": return `${v[6] || "Aktor " + v[0]}: ${(SWITCH_TYPES.has(v[7]) ? DEV_STATE_SWITCH : DEV_STATE)[v[1]]}, ${pct(v[2])} %`;
    case "selve.GW.event.sender": return `Sender ${v[2] || v[0]}: ${SENDER_EVENTS[v[1]] ?? v[1]}`;
    case "selve.GW.event.sensor": return `Sensor ${v[0]}: neue Werte`;
    case "selve.GW.event.log": return `[${v[1]}] ${v[4]}${v[3] ? " (" + v[3] + ")" : ""}`;
    case "selve.GW.event.dutyCycle": return `Funkauslastung ${v[1]} %`;
    case "selve.GW.command.result": {
      const fail = v[4].mask.map(id => state.devices.get(id)?.name || "#" + id);
      return `Befehl „${CMD_NAMES[v[0]] ?? v[0]}“ ${v[2] ? "erfolgreich" : "mit Fehlern"}` + (fail.length ? ` – nicht ausgeführt: ${fail.join(", ")}` : "");
    }
    case "selve.GW.iveo.commandResult": return `iveo ${v[0] === 254 ? "Lernbereitschaft" : v[0] === 255 ? "Lernbefehl" : IVEO_CMD[v[0]]} ${v[2] ? "wird gesendet" : "gesendet"} (Kanäle ${v[1].mask.join(", ")})`;
    case "selve.GW.device.scanResult": return `Suchlauf: Status ${v[0]}, ${v[1]} neu`;
    default: return `${short} ${JSON.stringify(v)}`;
  }
}

// ---------------------------------------------------------------------------
// Live-Ereignisse vom Gateway
// ---------------------------------------------------------------------------
function flash(sel) { const el = $(sel); if (el) { el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); } }

function onEvent(method, v) {
  // Fortschrittsmeldungen kommen zyklisch und werden nicht protokolliert
  const quietEvents = new Set(["selve.GW.device.scanResult", "selve.GW.sensor.teachResult", "selve.GW.sender.teachResult"]);
  if (!quietEvents.has(method)) {
    const cls = method === "selve.GW.event.log" ? LOG_TYPE[v[0]] : "event";
    logAdd(method === "selve.GW.event.log" ? LOG_TYPE[v[0]] : "Ereignis", describeEvent(method, v), cls);
  }
  switch (method) {
    case "selve.GW.event.device": {
      const [id, status, value, target, flags, dayMode, name, type] = v;
      const d = state.devices.get(id);
      if (d) { Object.assign(d, { status, value, target, flags, dayMode, name, type }); updateDeviceCard(id); }
      else if (state.loaded.devices) quiet(loadDevices());
      break;
    }
    case "selve.GW.event.sensor": {
      const s = state.sensors.get(v[0]);
      if (s) { setSensorValues(s, v.slice(1)); renderSensors(); flash(`[data-sensor="${v[0]}"]`); }
      break;
    }
    case "selve.GW.event.sender": {
      const s = state.senders.get(v[0]);
      if (s) { s.lastEvent = v[1]; s.name = v[2]; s.lastTime = new Date().toLocaleTimeString("de-DE"); renderSenders(); flash(`[data-sender="${v[0]}"]`); }
      if (v[1] === 13) quiet(loadSenders());
      break;
    }
    case "selve.GW.event.dutyCycle": setDuty(v[0], v[1]); break;
    case "selve.GW.command.result":
      if (!v[2] || v[4].mask.length) toast(describeEvent(method, v), "bad");
      break;
    case "selve.GW.device.scanResult": onScanResult(v); break;
    case "selve.GW.sensor.teachResult": onTeachResult("sensor", v); break;
    case "selve.GW.sender.teachResult": onTeachResult("sender", v); break;
  }
}

function connectStream() {
  const es = new EventSource("api/stream");
  es.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.kind === "event") onEvent(m.method, m.values);
    else if (m.kind === "traffic") {
      if (m.dir === "err") logAdd("Fehler", m.text, "err");
      else if ($("#logRaw").checked) logAdd(m.dir === "tx" ? "→ TX" : "← RX", m.text, m.dir);
    } else if (m.kind === "connection") {
      if (!m.connected && state.connected) { setConnected(false); toast("Verbindung zum Gateway getrennt" + (m.error ? `: ${m.error}` : ""), "bad"); loadPorts(); }
    }
  };
  es.onerror = () => { /* EventSource verbindet sich selbst neu */ };
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
(async function init() {
  try {
    const t = localStorage.getItem("selve-tab");
    if (t && $(`#tabs [data-tab="${t}"]`)) $(`#tabs [data-tab="${t}"]`).click();
  } catch { }
  renderDevices();
  renderReteachBanner();
  connectStream();
  await loadPorts();
  const st = await api("api/status");
  setConnected(st.connected, st.port);
  if (st.connected) await initialLoad();
})();
