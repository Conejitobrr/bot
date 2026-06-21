'use strict';

const path = require('path');
const fs = require('fs');
const chalk = require('chalk');

const config = require('./config');
const db = require('./lib/database');
const { getBody, normalizeJid, detectPrefix, getGroupAdmins, cleanNumber } = require('./lib/utils');

// ⏱️ RELOJ GLOBAL
function getTime() { return new Date().toLocaleTimeString('es-PE', { hour12: false }); }

// ─────────────────────────────────────────
// 🎨 LOGGER PROFESIONAL (NASA STYLE)
// ─────────────────────────────────────────
function logBox(title, lines = []) {
  if (!config.debug) return;
  const time = getTime();
  console.log(chalk.gray(`\n┌─── 🕒 [${time}] ─── ${chalk.cyan(title)} ───`));
  lines.forEach(line => console.log(chalk.gray('│ ') + line));
  console.log(chalk.gray('└────────────────────────────────────────────\n'));
}

// Detector de iconos para archivos
function getMsgIcon(msg) {
  const m = msg.message || {};
  if (m.imageMessage) return '📸 Imagen';
  if (m.videoMessage) return m.videoMessage.gifPlayback ? '🎞️ GIF' : '🎥 Video';
  if (m.audioMessage) return m.audioMessage.ptt ? '🎤 Nota de Voz' : '🔊 Audio';
  if (m.stickerMessage) return '🏷️ Sticker';
  if (m.documentMessage) return '📄 Documento';
  if (m.locationMessage) return '📍 Ubicación';
  return '💬 Texto';
}

// ─────────────────────────────────────────
// 🚀 SILENCIADOR DE ERRORES (Filtro Anti-Spam)
// ─────────────────────────────────────────
const originalConsoleLog = console.log;
const blocked = ['Closing session', 'SessionEntry', '_chains', 'BAD MAC', 'Failed to decrypt', 'Session error', 'verifyMAC', 'pendingPreKey', 'messageKeys', 'remoteIdentityKey', 'indexInfo'];

console.log = (...args) => {
  const text = args.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(' ');
  if (!blocked.some(word => text.includes(word))) originalConsoleLog(...args);
};

// ─────────────────────────────────────────
// 📦 GESTOR DE PLUGINS
// ─────────────────────────────────────────
const PLUGINS_DIR = path.join(process.cwd(), 'plugins');
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
// 🧠 CEREBRO PRINCIPAL (HANDLER)
// ─────────────────────────────────────────
async function messageHandler(sock, msg, store = {}) {
  try {
    if (!msg?.message) return;
    const remoteJid = msg.key.remoteJid;
    if (!remoteJid || remoteJid === 'status@broadcast') return;

    const fromGroup = remoteJid.endsWith('@g.us');
    let sender = normalizeJid(fromGroup ? msg.key.participant : remoteJid);
    const body = getBody(msg) || '';
    const pushName = msg.pushName || 'Usuario';
    const senderNumber = cleanNumber(sender);
    const isOwner = config.owner.includes(senderNumber);

    // Detección de comandos
    const parsed = detectPrefix(body, config.prefix);
    const command = parsed ? parsed.body.trim().split(/\s+/)[0].toLowerCase() : null;
    const isCommand = !!plugins.get(command);

    // 🔥 LOG DE RECEPCIÓN (Detecta todo, hasta fotos sin texto)
    if (config.debug) {
      const msgDisplay = body || getMsgIcon(msg); // Si no hay cuerpo, muestra el tipo de archivo
      const colorMsg = isCommand ? chalk.yellowBright : chalk.white; // Color diferente si es comando
      
      logBox('MENSAJE RECIBIDO', [
        `${chalk.blue('👥')} Chat: ${chalk.white(fromGroup ? 'Grupo' : 'Privado')}`,
        `${chalk.yellow('👤')} De: ${chalk.white(pushName)} ${chalk.gray('+' + senderNumber)} ${isOwner ? chalk.red('👑 [OWNER]') : ''}`,
        `${chalk.magenta('🎞️')} Tipo: ${chalk.green(getMsgIcon(msg))}`,
        `${chalk.cyan('💬')} Msg: ${colorMsg(msgDisplay.slice(0, 50))}`
      ]);
    }

    if (!parsed) return;
    const plugin = plugins.get(command);
    if (!plugin) return;

    // Ejecución
    await plugin.execute({
      sock, msg, remoteJid, sender, body, args: parsed.body.trim().split(/\s+/).slice(1), command, db, isOwner,
      reply: text => sock.sendMessage(remoteJid, { text: String(text) }, { quoted: msg })
    });

  } catch (err) {
    console.log(chalk.red('❌ [FATAL ERROR]:'), err.message);
  }
}

module.exports = { messageHandler, loadPlugins, plugins, messagePlugins };
