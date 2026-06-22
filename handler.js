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

// ⏱️ RELOJ GLOBAL (FORZADO A HORA PERUANA)
function getTime() {
  return new Date().toLocaleTimeString('es-PE', { 
    timeZone: 'America/Lima', 
    hour12: false 
  });
}

// ─────────────────────────────────────────
// 🎨 LOGGER PROFESIONAL (ESTILO NEÓN/GAMER)
// ─────────────────────────────────────────
function logBox(title, lines = []) {
  if (!config.debug) return;
  const time = getTime();
  // Bordes en Magenta Brillante y Título en Cian
  console.log(chalk.magentaBright(`\n╭━━━ 🕒 [${time}] ━━━ ⟨ ${chalk.cyanBright(title)} ⟩ ━━━`));
  lines.forEach(line => console.log(chalk.magentaBright('┃ ') + line));
  console.log(chalk.magentaBright('╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
}

// Detector de iconos para la consola
function getMsgIcon(msg) {
  const m = msg.message || {};
  if (m.imageMessage) return '📸 Imagen';
  if (m.videoMessage) return m.videoMessage.gifPlayback ? '🎞️ GIF' : '🎥 Video';
  if (m.audioMessage) return m.audioMessage.ptt ? '🎤 Nota de Voz' : '🔊 Audio';
  if (m.stickerMessage) return '🏷️ Sticker';
  if (m.documentMessage) return '📄 Documento';
  if (m.locationMessage) return '📍 Ubicación';
  if (m.contactMessage) return '👤 Contacto';
  return '💬 Texto';
}

// ─────────────────────────────────────────
// 🚀 SILENCIADOR DE RUIDO GLOBAL
// ─────────────────────────────────────────
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

function shouldHideConsole(args = []) {
  const text = args.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(' ');
  const blocked = [
    'Closing session', 'Closing stale open session', 'Closing open session', 
    'SessionEntry', '_chains', 'Removing old closed session', 'chainKey', 
    'ephemeralKeyPair', 'rootKey', 'indexInfo', 'registrationId', 
    'currentRatchet', 'pendingPreKey', 'messageKeys', 'remoteIdentityKey',
    'BAD MAC', 'Failed to decrypt', 'Session error', 'verifyMAC'
    // 'rate-overlimit' ELIMINADO: Ahora sí se mostrará en la consola
  ];
  return blocked.some(word => text.includes(word));
}

console.log = (...args) => { if (!shouldHideConsole(args)) originalConsoleLog(...args); };
console.error = (...args) => { if (!shouldHideConsole(args)) originalConsoleError(...args); };
console.warn = (...args) => { if (!shouldHideConsole(args)) originalConsoleWarn(...args); };

// ─────────────────────────────────────────
// 📤 MONITOR DE ENVÍOS Y ANTI-COLAPSO (SISTEMA DE COLA)
// ─────────────────────────────────────────
const sendQueue = [];
let isSending = false;
const SEND_DELAY = 1000; // 1 segundo exacto de pausa

async function processSendQueue() {
  if (isSending || sendQueue.length === 0) return;
  isSending = true;

  while (sendQueue.length > 0) {
    const task = sendQueue.shift();
    try {
      await task.execute();
    } catch (err) {
      // Manejado internamente
    }
    // Pausa protectora anti-bans
    await new Promise(resolve => setTimeout(resolve, SEND_DELAY));
  }

  isSending = false;
}

function attachSendLogger(sock) {
  if (sock._loggerAttached) return;
  sock._loggerAttached = true;

  const originalSend = sock.sendMessage.bind(sock);

  // Sobrescribimos el envío
  sock.sendMessage = async (jid, content = {}, options = {}) => {
    return new Promise((resolve, reject) => {
      sendQueue.push({
        execute: async () => {
          try {
            if (config.debug) {
              let type = 'Desconocido', preview = '';
              if (content.text) { type = 'Texto'; preview = content.text; }
              else if (content.image) { type = 'Imagen'; preview = content.caption || '[Imagen]'; }
              else if (content.video) { type = 'Video'; preview = content.caption || '[Video]'; }
              else if (content.audio) { type = content.ptt ? 'Nota de Voz' : 'Audio'; preview = '[Audio]'; }
              else if (content.sticker) { type = 'Sticker'; preview = '[Sticker]'; }
              else if (content.document) { type = 'Documento'; preview = content.fileName || '[Documento]'; }

              // 🔥 NUEVO DISEÑO DE RESPUESTA DEL BOT
              console.log(
                chalk.magentaBright(' ╰─➤ ') + 
                chalk.cyanBright(`[${getTime()}] `) + 
                chalk.greenBright('🤖 BOT RESPONDE ') + 
                chalk.whiteBright(`➔ +${cleanNumber(jid)} `) + 
                chalk.blueBright(`[${type}] `) + 
                chalk.yellowBright(`» ${String(preview).slice(0, 60).replace(/\n/g, ' ')}...`)
              );
            }
            
            const result = await originalSend(jid, content, options);
            resolve(result);
            
          } catch (err) {
            console.log(chalk.magentaBright(' ╰─➤ ') + chalk.cyanBright(`[${getTime()}] `) + chalk.redBright('❌ [ERROR DE ENVÍO]:'), err?.message || err);
            reject(err);
          }
        }
      });
      processSendQueue();
    });
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
      console.log(chalk.cyanBright(`[${getTime()}] `) + chalk.redBright(`❌ [ERROR PLUGIN] ${file}:`), err?.message || err);
    }
  }
  console.log(chalk.cyanBright(`[${getTime()}] `) + chalk.greenBright(`♻️ Motor cargado: ${plugins.size} comandos | ${messagePlugins.length} eventos automáticos.`));
}

global.loadPlugins = loadPlugins;
loadPlugins();

// ─────────────────────────────────────────
// 🧰 UTILIDADES INTERNAS
// ─────────────────────────────────────────
function cleanNumber(jid = '') { return String(jid).split('@')[0].split(':')[0].replace(/\D/g, ''); }
function isObject(value) { return value && typeof value === 'object'; }
function hasMediaMessage(m = {}) { return m.imageMessage || m.videoMessage || m.audioMessage || m.ptvMessage || m.stickerMessage || m.documentMessage || m.locationMessage || m.contactMessage || m.contactsArrayMessage || m.reactionMessage; }

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
function saveJailDB(data) { try { fs.writeFileSync(JAIL_PATH, JSON.stringify(data, null, 2)); } catch {} }

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
    const expiration = commandCooldowns.get(sender) + 3000; 
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

    const body = getBody(msg) || '';
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

    const parsed = detectPrefix(body, config.prefix);
    const command = parsed ? parsed.body.trim().split(/\s+/)[0].toLowerCase() : null;
    const isCommand = !!plugins.get(command);

    // 🔥 LOG DE RECEPCIÓN (NUEVOS COLORES)
    if (config.debug) {
      const msgDisplay = body || getMsgIcon(msg); 
      const colorMsg = isCommand ? chalk.yellowBright : chalk.whiteBright;
      
      logBox('MENSAJE RECIBIDO', [
        `${chalk.blueBright('👥 Chat:')} ${chalk.greenBright(chatName.slice(0, 25))}`,
        `${chalk.yellowBright('👤 De:')} ${chalk.cyanBright(pushName)} ${chalk.gray('(+'+number+')')} ${isOwner ? chalk.redBright('👑 [OWNER]') : ''}`,
        `${chalk.magentaBright('🎞️ Tipo:')} ${chalk.whiteBright(getMsgIcon(msg))}`,
        `${chalk.greenBright('💬 Msg:')} ${colorMsg(msgDisplay.slice(0, 50))}`
      ]);
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

    // ⚡ EJECUTAR EVENTOS AUTOMÁTICOS
    if (botEncendido && messagePlugins.length) {
      for (const plugin of messagePlugins) {
        try {
          await plugin.onMessage({
            sock, msg, key, remoteJid, sender, botJid, pushName, body, store, config, db,
            fromMe, fromGroup, isOwner, isAdmin, isBotAdmin, groupMetadata, groupAdmins,
            reply: text => sock.sendMessage(remoteJid, { text: String(text) }, { quoted: msg })
          });
        } catch (e) {
          console.log(chalk.cyanBright(`[${getTime()}] `) + chalk.redBright(`❌ [ERROR EVENTO] ${plugin.file}:`), e?.message || e);
        }
      }
    }

    if (!parsed || !command) return;

    if (!botEncendido && !['enable', 'disable', 'on', 'off', 'menu', 'help'].includes(command)) {
       if (!isOwner) return; 
    }

    const plugin = plugins.get(command);
    if (!plugin) return; 

    try { await sock.readMessages([msg.key]); } catch {}

    if (!isOwner) {
      const banned = await db.isBanned(sender);
      if (banned) return;

      const spamStatus = checkSpam(sender);
      if (spamStatus === 'WARN') {
        return sock.sendMessage(remoteJid, { text: `⚠️ *¡ALTO AHÍ!*\n\nEstás enviando demasiados mensajes rápido.\nSi sigues haciendo spam, te silenciaré por 1 minuto.` }, { quoted: msg });
      }
      if (spamStatus === 'BANNED') return;

      if (isOnCooldown(sender)) {
        return sock.sendMessage(remoteJid, { text: `⏳ *Relájate un poco.*\nEspera 3 segundos antes de usar otro comando.` }, { quoted: msg });
      }
    }

    const jail = checkJail(sender);
    if (jail && !isOwner && !['sobornar', 'fianza', 'usar', 'llave', 'inventario'].includes(command)) {
      return sock.sendMessage(remoteJid, { text: `⛓️ *ESTÁS ARRESTADO*\n\nNo puedes usar comandos por ahora.\n⏳ Tiempo restante: *${msToTime(jail.until - Date.now())}*` }, { quoted: msg });
    }

    // 🔥 LOG DE COMANDO (NUEVO DISEÑO)
    if (config.debug) {
      console.log(
        chalk.magentaBright(' ╭─➤ ') + 
        chalk.cyanBright(`[${getTime()}] `) + 
        chalk.greenBright('⚡ COMANDO: ') + 
        chalk.yellowBright(config.prefix + command) + 
        chalk.whiteBright(' | 👤 Por: ') + 
        chalk.cyanBright(`${pushName}`)
      );
    }

    const args = parsed.body.trim().split(/\s+/).filter(Boolean);
    args.shift();

    try {
      await plugin.execute({
        sock, msg, key, remoteJid, sender, botJid, pushName, body, args, command, store, config, db,
        fromMe, fromGroup, isOwner, isAdmin, isBotAdmin, groupMetadata, groupAdmins,
        reply: text => sock.sendMessage(remoteJid, { text: String(text) }, { quoted: msg })
      });

      try { await db.addXP(sender, Math.floor(Math.random() * 16) + 5); } catch (e) {}

    } catch (e) {
      console.log(chalk.magentaBright(' ╭─➤ ') + chalk.cyanBright(`[${getTime()}] `) + chalk.redBright(`❌ [CRASH EN COMANDO] ${command}:\n`), e?.stack || e);
      try { await sock.sendMessage(remoteJid, { text: `❌ *Error interno del sistema.*\nMi código falló al ejecutar \`${command}\`.` }, { quoted: msg }); } catch {}
    }

  } catch (err) {
    console.log(chalk.cyanBright(`[${getTime()}] `) + chalk.redBright('❌ [FATAL ERROR EN HANDLER]:'), err?.stack || err);
  }
}

module.exports = {
  messageHandler, loadPlugins, plugins, messagePlugins
};
