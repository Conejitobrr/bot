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
  getGroupAdmins,
  cleanNumber
} = require('./lib/utils');

// ⏱️ RELOJ GLOBAL
function getTime() { return new Date().toLocaleTimeString('es-PE', { hour12: false }); }

// ─────────────────────────────────────────
// 🎨 LOGGER VISTOSO (ESTILO NASA)
// ─────────────────────────────────────────
function logBox(title, lines = []) {
  if (!config.debug) return;
  const time = getTime();
  console.log(chalk.gray(`\n┌─── 🕒 [${time}] ─── ${chalk.cyan(title)} ───`));
  lines.forEach(line => console.log(chalk.gray('│ ') + line));
  console.log(chalk.gray('└────────────────────────────────────────────\n'));
}

function getMsgType(msg) {
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
// 🚀 SILENCIADOR DE RUIDO (FILTROS)
// ─────────────────────────────────────────
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

function shouldHideConsole(args = []) {
  const text = args.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(' ');
  const blocked = [
    'Closing session', 'SessionEntry', '_chains', 'BAD MAC', 'Failed to decrypt', 
    'Session error', 'verifyMAC', 'Error: Session not found', 'pendingPreKey', 
    'messageKeys', 'remoteIdentityKey', 'indexInfo'
  ];
  return blocked.some(word => text.includes(word));
}

console.log = (...args) => { if (!shouldHideConsole(args)) originalConsoleLog(...args); };
console.error = (...args) => { if (!shouldHideConsole(args)) originalConsoleError(...args); };
console.warn = (...args) => { if (!shouldHideConsole(args)) originalConsoleWarn(...args); };

// ─────────────────────────────────────────
// 📤 MONITOR DE ENVÍOS
// ─────────────────────────────────────────
function attachSendLogger(sock) {
  if (sock._loggerAttached) return;
  sock._loggerAttached = true;
  const originalSend = sock.sendMessage.bind(sock);
  sock.sendMessage = async (jid, content = {}, options = {}) => {
    try {
      if (config.debug) {
        let type = 'Texto', preview = content.text || '[Multimedia]';
        console.log(chalk.gray(`[${getTime()}] `) + chalk.cyan('📤 [BOT RESPONDE] ') + chalk.gray(`a +${cleanNumber(jid)} `) + chalk.yellow(`[${type}] `) + chalk.white(`-> ${String(preview).slice(0, 50)}...`));
      }
      return await originalSend(jid, content, options);
    } catch (err) { console.log(chalk.gray(`[${getTime()}] `) + chalk.red('❌ [ERROR DE ENVÍO]:'), err?.message || err); }
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
  for (const file of files) {
    try {
      const filepath = path.join(PLUGINS_DIR, file);
      delete require.cache[require.resolve(filepath)];
      const plugin = require(filepath);
      if (!plugin) continue;
      if (typeof plugin.onMessage === 'function') messagePlugins.push({ ...plugin, file });
      if (typeof plugin.execute === 'function') {
        (Array.isArray(plugin.commands) ? plugin.commands : []).forEach(cmd => plugins.set(String(cmd).toLowerCase(), { ...plugin, file }));
      }
    } catch (err) { console.log(chalk.red(`❌ [ERROR PLUGIN] ${file}:`), err?.message || err); }
  }
}
global.loadPlugins = loadPlugins;
loadPlugins();

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
    const body = getBody(msg);
    const pushName = msg.pushName || 'Usuario';
    const number = cleanNumber(sender);
    
    // --- LÓGICA DE OWNER QUE YA FUNCIONABA ---
    const ownerNumbers = Array.isArray(config.owner) ? config.owner.map(n => String(n).replace(/\D/g, '')) : [];
    const isOwner = fromMe || ownerNumbers.includes(number) || ownerNumbers.includes(cleanNumber(remoteJid)) || ownerNumbers.includes(cleanNumber(msg.realNumber || ''));
    
    // ⚡ LOG VISTOSO EN CAJA
    if (config.debug && body) {
      logBox('MENSAJE RECIBIDO', [
        `${chalk.blue('👥')} Chat: ${chalk.white(fromGroup ? 'Grupo' : 'Privado')}`,
        `${chalk.yellow('👤')} De: ${chalk.white(pushName)} (${chalk.gray('+' + number)}) ${isOwner ? chalk.red('👑 [OWNER]') : ''}`,
        `${chalk.magenta('🎞️')} Tipo: ${chalk.green(getMsgType(msg))}`,
        `${chalk.cyan('💬')} Msg: ${chalk.white(body.slice(0, 40))}`
      ]);
    }

    // --- LÓGICA RESTANTE ---
    const parsed = detectPrefix(body, config.prefix);
    if (!parsed) return;

    const args = parsed.body.trim().split(/\s+/).filter(Boolean);
    const command = args.shift()?.toLowerCase();
    const plugin = plugins.get(command);
    if (!plugin) return;

    await plugin.execute({
      sock, msg, key, remoteJid, sender, pushName, body, args, command, store, config, db, isOwner,
      reply: text => sock.sendMessage(remoteJid, { text: String(text) }, { quoted: msg })
    });

  } catch (err) {
    console.log(chalk.red('❌ [FATAL ERROR]:'), err?.stack || err);
  }
}

module.exports = { messageHandler, loadPlugins, plugins, messagePlugins };
