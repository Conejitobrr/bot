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

// ⏱️ RELOJ GLOBAL
function getTime() { return new Date().toLocaleTimeString('es-PE', { hour12: false }); }

// ─────────────────────────────────────────
// 🚀 SILENCIADOR DE ERRORES (Filtro Anti-Spam de Consola)
// ─────────────────────────────────────────
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

const blocked = [
  'Closing session', 'SessionEntry', '_chains', 'BAD MAC', 'Failed to decrypt', 
  'Session error', 'verifyMAC', 'Error: Session not found', 'pendingPreKey',
  'messageKeys', 'remoteIdentityKey', 'indexInfo'
];

console.log = (...args) => {
  const text = args.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(' ');
  if (!blocked.some(word => text.includes(word))) originalConsoleLog(...args);
};

console.error = (...args) => {
  const text = args.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(' ');
  if (!blocked.some(word => text.includes(word))) originalConsoleError(...args);
};

// ─────────────────────────────────────────
// 🎨 LOGGER DE CAJA (NASA STYLE)
// ─────────────────────────────────────────
function logBox(title, data = []) {
  if (!config.debug) return;
  const time = getTime();
  console.log(chalk.gray(`\n┌─── 🕒 [${time}] ─── ${chalk.cyan(title)} ───`));
  data.forEach(line => console.log(chalk.gray('│ ') + line));
  console.log(chalk.gray('└────────────────────────────────────────────\n'));
}

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
// 📦 GESTOR DE PLUGINS
// ─────────────────────────────────────────
const PLUGINS_DIR = path.join(process.cwd(), 'plugins');
if (!fs.existsSync(PLUGINS_DIR)) fs.mkdirSync(PLUGINS_DIR, { recursive: true });
const plugins = new Map();
const messagePlugins = [];

function loadPlugins() {
  plugins.clear();
  messagePlugins.length = 0;
  fs.readdirSync(PLUGINS_DIR).filter(f => f.endsWith('.js')).forEach(file => {
    try {
      const filepath = path.join(PLUGINS_DIR, file);
      delete require.cache[require.resolve(filepath)];
      const plugin = require(filepath);
      if (plugin.onMessage) messagePlugins.push({ ...plugin, file });
      if (plugin.execute) {
        (Array.isArray(plugin.commands) ? plugin.commands : []).forEach(cmd => plugins.set(String(cmd).toLowerCase(), { ...plugin, file }));
      }
    } catch (e) { console.log(chalk.red(`❌ Error cargando ${file}:`), e.message); }
  });
  console.log(chalk.gray(`[${getTime()}] `) + chalk.green(`♻️ Motor cargado: ${plugins.size} comandos | ${messagePlugins.length} eventos.`));
}
global.loadPlugins = loadPlugins;
loadPlugins();

// ─────────────────────────────────────────
// 🛡️ ANTI-SPAM Y COOLDOWNS
// ─────────────────────────────────────────
const spamCache = new Map();
const commandCooldowns = new Map();

function checkSpam(sender) {
  const now = Date.now();
  let user = spamCache.get(sender) || { timestamps: [], bannedUntil: 0 };
  if (user.bannedUntil > now) return 'BANNED';
  user.timestamps = user.timestamps.filter(t => now - t < 10000);
  user.timestamps.push(now);
  if (user.timestamps.length >= 6) { user.bannedUntil = now + 60000; spamCache.set(sender, user); return 'BANNED'; }
  spamCache.set(sender, user);
  return false;
}

function isOnCooldown(sender) {
  const now = Date.now();
  if (commandCooldowns.has(sender) && now < (commandCooldowns.get(sender) + 3000)) return true;
  commandCooldowns.set(sender, now);
  return false;
}

// ─────────────────────────────────────────
// 🧠 CEREBRO PRINCIPAL (HANDLER)
// ─────────────────────────────────────────
async function messageHandler(sock, msg, store = {}) {
  try {
    if (!msg?.message) return;
    const key = msg.key || {};
    const remoteJid = key.remoteJid;
    if (!remoteJid || remoteJid === 'status@broadcast') return;

    const fromGroup = remoteJid.endsWith('@g.us');
    let sender = normalizeJid(fromGroup ? key.participant : remoteJid);
    const body = getBody(msg);
    const pushName = msg.pushName || 'Usuario';
    const number = sender.split('@')[0];

    // ⚡ LOG VISTOSO
    if (config.debug && body) {
      logBox('MENSAJE RECIBIDO', [
        `${chalk.blue('👥')} Chat: ${chalk.white(fromGroup ? 'Grupo' : 'Privado')}`,
        `${chalk.yellow('👤')} De: ${chalk.white(pushName)} (${chalk.gray('+' + number)})`,
        `${chalk.magenta('🎞️')} Tipo: ${chalk.green(getMsgIcon(msg))}`,
        `${chalk.cyan('💬')} Msg: ${chalk.white(body.slice(0, 40) || '---')}`
      ]);
    }

    // --- LÓGICA DE EJECUCIÓN ---
    const parsed = detectPrefix(body, config.prefix);
    if (!parsed) return;

    const args = parsed.body.trim().split(/\s+/).filter(Boolean);
    const command = args.shift()?.toLowerCase();
    const plugin = plugins.get(command);
    if (!plugin) return;

    // COOLDOWN Y SEGURIDAD
    const isOwner = config.owner.includes(number);
    if (!isOwner) {
      if (checkSpam(sender) === 'BANNED') return;
      if (isOnCooldown(sender)) return;
    }

    // LOG DE EJECUCIÓN
    if (config.debug) {
      logBox('COMANDO EJECUTADO', [
        `${chalk.magenta('⚡')} Cmd: ${chalk.cyan(config.prefix + command)}`,
        `${chalk.yellow('👤')} User: ${chalk.white(pushName)}`
      ]);
    }

    await plugin.execute({
      sock, msg, remoteJid, sender, body, args, command, db,
      reply: text => sock.sendMessage(remoteJid, { text: String(text) }, { quoted: msg })
    });

  } catch (err) {
    console.log(chalk.red('❌ [FATAL ERROR]:'), err.message);
  }
}

module.exports = { messageHandler, loadPlugins, plugins, messagePlugins };
