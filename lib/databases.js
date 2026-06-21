'use strict';

const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const chalk = require('chalk');
const config = require('../config');

// ⏱️ RELOJ PARA LA CONSOLA NASA
function getTime() {
  return new Date().toLocaleTimeString('es-PE', { hour12: false });
}

const DB_PATH = path.resolve(process.cwd(), config.dbPath || './lib/database.json');
const DEFAULT_DB = { users: {}, groups: {}, global: {} };

// 🧠 CACHÉ EN RAM Y BANDERAS DE SEGURIDAD
let dbCache = null;
let isDirty = false; // ¿Hubo cambios que necesitan guardarse?
let isSaving = false; // ¿Está guardando en este momento?

function cloneDefaultDB() {
  return { users: {}, groups: {}, global: {} };
}

function ensureDir() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ─────────────────────────────────────────
// 🚀 INICIALIZACIÓN (Síncrona, solo 1 vez al iniciar)
// ─────────────────────────────────────────
function loadDB() {
  if (dbCache) return dbCache;
  try {
    ensureDir();
    if (!fs.existsSync(DB_PATH)) {
      fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DB, null, 2));
    }
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw || '{}');

    dbCache = {
      users: parsed.users || {},
      groups: parsed.groups || {},
      global: parsed.global || {}
    };
    return dbCache;
  } catch (err) {
    console.log(chalk.gray(`[${getTime()}] `) + chalk.red('❌ [ERROR FATAL DB] No se pudo leer database.json. Creando una nueva...'), err);
    dbCache = cloneDefaultDB();
    isDirty = true;
    return dbCache;
  }
}

// ─────────────────────────────────────────
// 💾 MOTOR ASÍNCRONO DE GUARDADO (NO BLOQUEA EL BOT)
// ─────────────────────────────────────────
async function flushToDisk() {
  if (!isDirty || isSaving) return; // Si no hay cambios o ya está guardando, ignora.
  
  isSaving = true;
  isDirty = false; // Resetea la bandera ANTES de guardar para no perder cambios nuevos

  try {
    const tmpPath = DB_PATH + '.tmp';
    const dataString = JSON.stringify(dbCache, null, 2);
    
    // Escritura asíncrona: el bot sigue respondiendo mensajes mientras esto ocurre
    await fsPromises.writeFile(tmpPath, dataString, 'utf8');
    await fsPromises.rename(tmpPath, DB_PATH); // Renombre atómico (Anti-Corrupción)
    
  } catch (e) {
    console.log(chalk.gray(`[${getTime()}] `) + chalk.red('❌ [ERROR GUARDANDO DB]:'), e?.message || e);
    isDirty = true; // Si falló, la vuelve a marcar para intentarlo en el siguiente ciclo
  } finally {
    isSaving = false;
  }
}

// Notifica a la RAM que hubo un cambio para que el auto-guardado actúe
function markDirty() {
  isDirty = true;
}

// 🚀 AUTO-GUARDADO (Cada 10 segundos guarda en el fondo silenciosamente)
setInterval(() => {
  flushToDisk();
}, 10000); 

async function init() {
  loadDB();
  console.log(chalk.gray(`[${getTime()}] `) + chalk.blue('🗄️  [DATABASE] Motor Híbrido RAM/Disco inicializado.'));
}

// ─────────────────────────────────────────
// ESTRUCTURAS POR DEFECTO
// ─────────────────────────────────────────
function defaultUser() {
  return {
    banned: false, bot: true, audios: true, premium: false, premiumUntil: 0,
    xp: 0, level: 1, lastDailyXp: 0, lastRobXp: 0, notifyCount: 0, notifyDate: ''
  };
}

function defaultGroup() {
  return {
    welcome: false, bot: true, audios: true, antilink: false, antispam: false
  };
}

// ─────────────────────────────────────────
// ⚡ OPERACIONES EN RAM (ULTRA RÁPIDAS)
// *Todas siguen siendo async para no romper tus plugins actuales*
// ─────────────────────────────────────────

async function getUser(id) {
  if (!id) return defaultUser();
  if (!dbCache.users[id]) {
    dbCache.users[id] = defaultUser();
    markDirty();
  }
  return dbCache.users[id];
}

async function setUser(id, data = {}) {
  if (!id) return null;
  const user = await getUser(id);
  dbCache.users[id] = { ...user, ...data };
  markDirty();
  return dbCache.users[id];
}

async function getUserSetting(userId, key) {
  const user = await getUser(userId);
  return user[key];
}

async function setUserSetting(userId, key, value) {
  const user = await getUser(userId);
  user[key] = value;
  markDirty();
  return user;
}

async function getGroup(id) {
  if (!id) return defaultGroup();
  if (!dbCache.groups[id]) {
    dbCache.groups[id] = defaultGroup();
    markDirty();
  }
  return dbCache.groups[id];
}

async function setGroup(id, data = {}) {
  if (!id) return null;
  const group = await getGroup(id);
  dbCache.groups[id] = { ...group, ...data };
  markDirty();
  return dbCache.groups[id];
}

async function getGroupSetting(groupId, key) {
  const group = await getGroup(groupId);
  return group[key];
}

async function setGroupSetting(groupId, key, value) {
  const group = await getGroup(groupId);
  group[key] = value;
  markDirty();
  return group;
}

async function isBanned(id) {
  const user = await getUser(id);
  return user.banned === true;
}

async function banUser(id) { return await setUser(id, { banned: true }); }
async function unbanUser(id) { return await setUser(id, { banned: false }); }

function calculateLevel(xp = 0) { return Math.floor(Number(xp || 0) / 10000) + 1; }

async function addXP(id, amount = 0) {
  const user = await getUser(id);
  const value = Math.max(0, Number(amount) || 0);
  user.xp = Math.max(0, Number(user.xp || 0) + value);
  user.level = calculateLevel(user.xp);
  markDirty();
  return user;
}

async function removeXP(id, amount = 0) {
  const user = await getUser(id);
  const value = Math.max(0, Number(amount) || 0);
  user.xp = Math.max(0, Number(user.xp || 0) - value);
  user.level = calculateLevel(user.xp);
  markDirty();
  return user;
}

async function transferXP(from, to, amount = 0) {
  const value = Math.max(0, Number(amount) || 0);
  if (!from || !to || value <= 0) return false;
  const sender = await getUser(from);
  if ((sender.xp || 0) < value) return false;
  
  await removeXP(from, value);
  await addXP(to, value);
  return true;
}

// ─────────────────────────────────────────
// PREMIUM Y LÍMITES
// ─────────────────────────────────────────
async function addPremium(id, days = 1) {
  const user = await getUser(id);
  const now = Date.now();
  const current = user.premiumUntil && user.premiumUntil > now ? user.premiumUntil : now;
  user.premium = true;
  user.premiumUntil = current + Number(days) * 24 * 60 * 60 * 1000;
  markDirty();
  return user;
}

async function removePremium(id) {
  return await setUser(id, { premium: false, premiumUntil: 0 });
}

async function getPremiumTime(id) {
  const user = await getUser(id);
  const left = Number(user.premiumUntil || 0) - Date.now();
  if (left <= 0) {
    if (user.premium || user.premiumUntil) await removePremium(id);
    return 0;
  }
  return left;
}

async function isPremium(id) { return (await getPremiumTime(id)) > 0; }

function getToday() { return new Date().toISOString().slice(0, 10); }

async function canUseNotify(userId, isAdmin = false, isOwner = false, isPremiumUser = false) {
  if (isAdmin || isOwner || isPremiumUser) return true;
  const user = await getUser(userId);
  const today = getToday();

  if (user.notifyDate !== today) {
    user.notifyDate = today;
    user.notifyCount = 0;
  }

  if ((user.notifyCount || 0) >= 5) return false;
  user.notifyCount = (user.notifyCount || 0) + 1;
  markDirty();
  return true;
}

async function getRemainingUses(userId) {
  const user = await getUser(userId);
  const today = getToday();
  if (user.notifyDate !== today) return 5;
  return Math.max(0, 5 - (user.notifyCount || 0));
}

// ─────────────────────────────────────────
// GLOBAL SETTINGS
// ─────────────────────────────────────────
async function getGlobalSetting(key) {
  if (!dbCache.global) dbCache.global = {};
  return dbCache.global[key];
}

async function setGlobalSetting(key, value) {
  if (!dbCache.global) dbCache.global = {};
  dbCache.global[key] = value;
  markDirty();
  return dbCache.global[key];
}

async function getAll() { return dbCache; }

async function saveAll(data = DEFAULT_DB) {
  dbCache = { users: data.users || {}, groups: data.groups || {}, global: data.global || {} };
  markDirty();
  await flushToDisk(); // Forzamos escritura inmediata al restaurar todo
  return dbCache;
}

// SALVADO DE EMERGENCIA SÍNCRONO AL APAGAR EL SERVIDOR
process.on('exit', () => {
  if (isDirty && dbCache) {
    try {
      console.log(chalk.gray(`[${getTime()}] `) + chalk.yellow('💾 [EXIT] Guardado de emergencia síncrono...'));
      fs.writeFileSync(DB_PATH, JSON.stringify(dbCache, null, 2));
    } catch {}
  }
});

module.exports = {
  init, getUser, setUser, getUserSetting, setUserSetting, getGroup, setGroup, getGroupSetting,
  setGroupSetting, isBanned, banUser, unbanUser, addXP, removeXP, transferXP, calculateLevel,
  addPremium, removePremium, getPremiumTime, isPremium, canUseNotify, getRemainingUses,
  getGlobalSetting, setGlobalSetting, getAll, saveAll
};
