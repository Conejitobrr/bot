'use strict';

const path = require('path');
const fs = require('fs');
const chalk = require('chalk');

const config = require('./config');
const db = require('./lib/database');

const {
  getBody,
  normalizeJid,
  detectPrefix,
  getGroupAdmins
} = require('./lib/utils');

// ⏱️ RELOJ GLOBAL PARA LA CONSOLA TIPO NASA
function getTime() {
  return new Date().toLocaleTimeString('es-PE', { hour12: false });
}

// ─────────────────────────────────────────
// 🚀 SILENCIADOR DE RUIDO DE BAILEYS
// ─────────────────────────────────────────
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

function shouldHideConsole(args = []) {
  const text = args.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(' ');
  const blocked = ['Closing session', 'Closing stale open session', 'Closing open session', 'SessionEntry', '_chains', 'Removing old closed session', 'chainKey', 'ephemeralKeyPair', 'rootKey', 'indexInfo', 'registrationId', 'currentRatchet', 'pendingPreKey', 'messageKeys', 'remoteIdentityKey'];
  return blocked.some(word => text.includes(word));
}

console.log = (...args) => { if (!shouldHideConsole(args)) originalConsoleLog(...args); };
console.error = (...args) => { if (!shouldHideConsole(args)) originalConsoleError(...args); };
console.warn = (...args) => { if (!shouldHideConsole(args)) originalConsoleWarn(...args); };

// ─────────────────────────────────────────
// 📤 MONITOR DE ENVÍOS DEL BOT
// ─────────────────────────────────────────
function attachSendLogger(sock) {
  if (sock._loggerAttached) return;
  sock._loggerAttached = true;

  const originalSend = sock.sendMessage.bind(sock);

  sock.sendMessage = async (jid, content = {}, options = {}) => {
    try {
      if (config.debug) {
        let type = 'Desconocido', preview = '';
        if (content.text) { type = 'Texto'; preview = content.text; }
        else if (content.image) { type = 'Imagen'; preview = content.caption || '[Imagen]'; }
        else if (content.video) { type = 'Video'; preview = content.caption || '[Video]'; }
        else if (content.audio) { type = content.ptt ? 'Nota de Voz' : 'Audio'; preview = '[Audio]'; }
        else if (content.sticker) { type = 'Sticker'; preview = '[Sticker]'; }
        else if (content.document) { type = 'Documento'; preview = content.fileName || '[Documento]'; }

        console.log(chalk.gray(`[${getTime()}] `) + chalk.cyan('📤 [BOT RESPONDE]') + chalk.gray(` a +${cleanNumber(jid)} `) + chalk.yellow(`[${type}] `) + chalk.white(`-> ${String(preview).slice(0, 60).replace(/\n/g, ' ')}...`));
      }
      return await originalSend(jid, content, options);
    } catch (err) {
      console.log(chalk.gray(`[${getTime()}] `) + chalk.red('❌ [ERROR DE ENVÍO]:'), err?.message || err);
    }
  };
}

// ─────────────────────────────────────────
// 📦 GESTOR DE PLUGINS
// ─────────────────────────────────────────
function getPluginsDir() {
  const plugin = path.join(process.cwd(), 'plugin');
  const plugins = path.join(process.cwd(), 'plugins');
  if (fs.existsSync(plugin)) return plugin;
  if (fs.existsSync(plugins)) return plugins;
  fs.mkdirSync(plugin, { recursive: true });
  return plugin;
}

const PLUGINS_DIR = getPluginsDir();
const plugins = new Map();
const messagePlugins = [];

function loadPlugins() {
  plugins.clear();
  messagePlugins.length = 0;
  const files = fs.readdirSync(PLUGINS_DIR).filter(file => file.endsWith('.js'));

  let commandFiles = 0, eventFiles = 0;

  for (const file of files) {
    try {
      const filepath = path.join(PLUGINS_DIR, file);
      delete require.cache[require.resolve(filepath)];
      const plugin = require(filepath);

      if (!plugin) continue;

      if (typeof plugin.onMessage === 'function') {
        messagePlugins.push({ ...plugin, file });
        eventFiles++;
      }

      if (typeof plugin.execute === 'function') {
        const commands = Array.isArray(plugin.commands) ? plugin.commands : [];
        for (const cmd of commands) {
          plugins.set(String(cmd).toLowerCase(), { ...plugin, file });
        }
        if (commands.length) commandFiles++;
      }
    } catch (err) {
      console.log(chalk.gray(`[${getTime()}] `) + chalk.red(`❌ [ERROR PLUGIN] ${file}:`), err?.message || err);
    }
  }
  console.log(chalk.gray(`[${getTime()}] `) + chalk.green(`♻️ Motor cargado: ${plugins.size} comandos | ${messagePlugins.length} eventos automáticos.`));
}

global.loadPlugins = loadPlugins;
loadPlugins();

// ─────────────────────────────────────────
// 🧰 UTILIDADES INTERNAS
// ─────────────────────────────────────────
function cleanNumber(jid = '') { return String(jid).split('@')[0].split(':')[0].replace(/\D/g, ''); }
function isObject(value) { return value && typeof value === 'object'; }
function hasMediaMessage(m = {}) { return m.imageMessage || m.videoMessage || m.audioMessage || m.ptvMessage || m.stickerMessage || m.documentMessage || m.locationMessage || m.contactMessage || m.contactsArrayMessage || m.reactionMessage; }

function hasViewOnceDeep(node, depth = 0, seen = new Set()) {
  if (!isObject(node) || depth > 12 || seen.has(node)) return false;
  seen.add(node);
  const keys = Object.keys(node);
  if (keys.some(k => String(k).toLowerCase().includes('viewonce'))) return true;
  if (node.imageMessage?.viewOnce || node.videoMessage?.viewOnce || node.audioMessage?.viewOnce || node.ptvMessage?.viewOnce) return true;
  for (const key of keys) if (isObject(node[key]) && hasViewOnceDeep(node[key], depth + 1, seen)) return true;
  return false;
}

function findMediaDeep(node, isOnce = false, depth = 0, seen = new Set()) {
  if (!isObject(node) || depth > 12 || seen.has(node)) return null;
  seen.add(node);
  const keys = Object.keys(node);
  const nowOnce = isOnce || keys.some(k => String(k).toLowerCase().includes('viewonce')) || node.imageMessage?.viewOnce || node.videoMessage?.viewOnce || node.audioMessage?.viewOnce || node.ptvMessage?.viewOnce;
  
  if (hasMediaMessage(node)) return { message: node, isOnce: nowOnce };
  for (const key of keys) {
    if (isObject(node[key])) {
      const found = findMediaDeep(node[key], nowOnce || key.toLowerCase().includes('viewonce'), depth + 1, seen);
      if (found) return found;
    }
  }
  return null;
}

function getReadableMessage(msg) {
  const message = msg.message || {};
  const found = findMediaDeep(message);
  const hasOnce = hasViewOnceDeep(message);
  const m = found?.message || message;
  const once = found?.isOnce || hasOnce ? ' (1 sola vez)' : '';

  if (found?.isOnce || hasOnce) {
    if (m.imageMessage) return `[Imagen${once}]`;
    if (m.videoMessage) return m.videoMessage.gifPlayback ? `[GIF${once}]` : `[Video${once}]`;
    if (m.stickerMessage) return `[Sticker${once}]`;
    if (m.audioMessage) return m.audioMessage.ptt ? `[Nota de voz${once}]` : `[Audio${once}]`;
    return '[Archivo de 1 sola vez]';
  }
  const body = getBody(msg);
  if (body) return body;
  if (m.imageMessage) return '[Imagen]';
  if (m.videoMessage) return m.videoMessage.gifPlayback ? '[GIF]' : '[Video]';
  if (m.stickerMessage) return '[Sticker]';
  if (m.audioMessage) return m.audioMessage.ptt ? '[Nota de voz]' : '[Audio]';
  if (m.documentMessage) return '[Documento]';
  return '[Sin texto detectado]';
}

async function safeGroupMetadata(sock, jid) { try { return await sock.groupMetadata(jid); } catch { return null; } }

const JAIL_PATH = path.join(process.cwd(), 'lib', 'jail.json');
function msToTime(ms = 0) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)} min ${total % 60} seg`;
}

function loadJailDB() {
  try { return fs.existsSync(JAIL_PATH) ? JSON.parse(fs.readFileSync(JAIL_PATH, 'utf8') || '{}') : { jailed: {}, fame: {} }; } 
  catch { return { jailed: {}, fame: {} }; }
}

function saveJailDB(data) {
  try { fs.writeFileSync(JAIL_PATH, JSON.stringify(data, null, 2)); } catch {}
}

function checkJail(jid) {
  const data = loadJailDB();
  const clean = String(jid || '').split(':')[0];
  const jail = data.jailed?.[clean];
  if (!jail) return null;
  if (Number(jail.until || 0) <= Date.now()) { delete data.jailed[clean]; saveJailDB(data); return null; }
  return jail;
}

// ─────────────────────────────────────────
// 🛡️ SISTEMAS ANTI-SPAM (GENERAL Y COMANDOS)
// ─────────────────────────────────────────
const spamCache = new Map();
const commandCooldowns = new Map();

function checkSpam(sender) {
  const now = Date.now();
  let user = spamCache.get(sender) || { timestamps: [], bannedUntil: 0 };
  if (user.bannedUntil > now) return 'BANNED';
  
  user.timestamps = user.timestamps.filter(t => now - t < 10000);
  user.timestamps.push(now);

  if (user.timestamps.length === 5) { spamCache.set(sender, user); return 'WARN'; }
  if (user.timestamps.length >= 6) {
    user.bannedUntil = now + 60000; 
    user.timestamps = []; 
    spamCache.set(sender, user);
    return 'BANNED';
  }
  spamCache.set(sender, user);
  return false;
}

function isOnCooldown(sender) {
  const now = Date.now();
  if (commandCooldowns.has(sender)) {
    const expiration = commandCooldowns.get(sender) + 3000; // 3 SEGUNDOS DE ESPERA ENTRE COMANDOS
    if (now < expiration) return true;
  }
  commandCooldowns.set(sender, now);
  return false;
}

// ─────────────────────────────────────────
// 🧠 CEREBRO PRINCIPAL (HANDLER)
// ─────────────────────────────────────────
async function messageHandler(sock, msg, store = {}) {
  try {
    attachSendLogger(sock);
    if (!msg?.message) return;

    const key = msg.key || {};
    const remoteJid = key.remoteJid;
    if (!remoteJid || remoteJid === 'status@broadcast') return;

    const fromMe = !!key.fromMe;
    const fromGroup = remoteJid.endsWith('@g.us');
    let sender = normalizeJid(fromGroup ? key.participant : remoteJid);
    const botJid = normalizeJid(sock.user?.id || '');

    const body = getBody(msg);
    const displayMsg = getReadableMessage(msg);
    const pushName = msg.pushName || store.contacts?.[sender]?.name || 'Usuario';
    const number = cleanNumber(sender);
    const userKey = number;

    let groupMetadata = null, groupAdmins = [], isAdmin = false, isBotAdmin = false;
    let chatName = 'Chat Privado';

    if (fromGroup) {
      groupMetadata = await safeGroupMetadata(sock, remoteJid);
      chatName = groupMetadata?.subject || 'Grupo';
      try {
        groupAdmins = await getGroupAdmins(sock, remoteJid);
        isAdmin = groupAdmins.includes(sender);
        isBotAdmin = groupAdmins.includes(botJid);
      } catch {}
    }

    const ownerNumbers = Array.isArray(config.owner) ? config.owner.map(n => String(n).replace(/\D/g, '')) : [];
    const isOwner = fromMe || ownerNumbers.includes(number) || ownerNumbers.includes(cleanNumber(remoteJid)) || ownerNumbers.includes(cleanNumber(msg.realNumber || ''));

    // 🔥 LOG DE RECEPCIÓN (Modo Lector)
    if (config.debug && body) {
      const etiqueta = fromGroup ? chalk.magenta('[GRUPO]') : chalk.blue('[PRIVADO]');
      console.log(chalk.gray(`[${getTime()}] `) + etiqueta + chalk.gray(` ${chatName.slice(0,15)} | De: `) + chalk.yellow(`${pushName} (+${number}) `) + chalk.white(`-> ${displayMsg.slice(0, 60).replace(/\n/g, ' ')}`));
    }

    // ==========================================
    // 🛑 APAGADO ABSOLUTO DEL BOT 
    // ==========================================
    let botEncendido = true;
    if (fromGroup) {
      const gData = await db.getGroup(remoteJid);
      if (gData.bot === false) botEncendido = false;
    } else {
      const uData = await db.getUser(userKey);
      if (uData.bot === false) botEncendido = false;
    }

    // ⚡ EJECUTAR EVENTOS AUTOMÁTICOS (Si está encendido)
    if (botEncendido && messagePlugins.length) {
      for (const plugin of messagePlugins) {
        try {
          await plugin.onMessage({
            sock, msg, key, remoteJid, sender, botJid, pushName, body, store, config, db,
            fromMe, fromGroup, isOwner, isAdmin, isBotAdmin, groupMetadata, groupAdmins,
            reply: text => sock.sendMessage(remoteJid, { text: String(text) }, { quoted: msg })
          });
        } catch (e) {
          console.log(chalk.gray(`[${getTime()}] `) + chalk.red(`❌ [ERROR EVENTO] ${plugin.file}:`), e?.message || e);
        }
      }
    }

    if (!body) return;
    const parsed = detectPrefix(body, config.prefix);
    if (!parsed) return;

    const args = parsed.body.trim().split(/\s+/).filter(Boolean);
    const command = args.shift()?.toLowerCase();
    if (!command) return;

    if (!botEncendido && !['enable', 'disable', 'menu', 'help'].includes(command)) {
       if (!isOwner) return; 
    }

    const plugin = plugins.get(command);
    if (!plugin) return; // Si no es un comando válido, ignora.

    // ✅ AUTO-LECTURA (Solo lee el mensaje si es un comando válido)
    try { await sock.readMessages([msg.key]); } catch {}

    if (!isOwner) {
      const banned = await db.isBanned(sender);
      if (banned) return;

      const spamStatus = checkSpam(sender);
      if (spamStatus === 'WARN') {
        return sock.sendMessage(remoteJid, { text: `⚠️ *¡ALTO AHÍ!*\n\nEstás enviando demasiados mensajes rápido.\nSi sigues haciendo spam, te silenciaré por 1 minuto.` }, { quoted: msg });
      }
      if (spamStatus === 'BANNED') return;

      // 🛡️ COOLDOWN DE COMANDOS (3 segundos)
      if (isOnCooldown(sender)) {
        return sock.sendMessage(remoteJid, { text: `⏳ *Relájate un poco.*\nEspera 3 segundos antes de usar otro comando.` }, { quoted: msg });
      }
    }

    const jail = checkJail(sender);
    if (jail && !isOwner && !['sobornar', 'fianza', 'usar', 'llave', 'inventario'].includes(command)) {
      return sock.sendMessage(remoteJid, { text: `⛓️ *ESTÁS ARRESTADO*\n\nNo puedes usar comandos por ahora.\n⏳ Tiempo restante: *${msToTime(jail.until - Date.now())}*` }, { quoted: msg });
    }

    // 🚀 LOG DE EJECUCIÓN TIPO NASA
    if (config.debug) {
      console.log(chalk.gray(`[${getTime()}] `) + chalk.green('🟢 [COMANDO EJECUTADO] ') + chalk.cyan(config.prefix + command) + chalk.gray(' | Por: ') + chalk.yellow(`${pushName} (+${number})`));
    }

    try {
      await plugin.execute({
        sock, msg, key, remoteJid, sender, botJid, pushName, body, args, command, store, config, db,
        fromMe, fromGroup, isOwner, isAdmin, isBotAdmin, groupMetadata, groupAdmins,
        reply: text => sock.sendMessage(remoteJid, { text: String(text) }, { quoted: msg })
      });

      try { await db.addXP(sender, Math.floor(Math.random() * 16) + 5); } catch (e) {}

    } catch (e) {
      // 🐛 CAPTURADOR EXACTO DE ERRORES
      console.log(chalk.gray(`[${getTime()}] `) + chalk.red(`❌ [CRASH EN COMANDO] ${command} (${plugin.file}):\n`), e?.stack || e);
      try { await sock.sendMessage(remoteJid, { text: `❌ *Error interno del sistema.*\nMi código falló al ejecutar \`${command}\`. El Owner ya fue notificado en consola.` }, { quoted: msg }); } catch {}
    }

  } catch (err) {
    console.log(chalk.gray(`[${getTime()}] `) + chalk.red('❌ [FATAL ERROR EN HANDLER]:'), err?.stack || err);
  }
}

module.exports = {
  messageHandler, loadPlugins, plugins, messagePlugins
};
