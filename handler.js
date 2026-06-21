'use strict';

const path = require('path');
const fs = require('fs');
const chalk = require('chalk');

const config = require('./config');
const db = require('./lib/database');
const { getBody, normalizeJid, detectPrefix, getGroupAdmins } = require('./lib/utils');

// ⏱️ RELOJ GLOBAL
function getTime() { return new Date().toLocaleTimeString('es-PE', { hour12: false }); }

// ─────────────────────────────────────────
// 🚀 LOGGER DE CAJA (NASA STYLE)
// ─────────────────────────────────────────
function logBox(title, lines = []) {
  if (!config.debug) return;
  console.log(chalk.gray(`\n┌─${chalk.cyan(title)}`));
  lines.forEach(line => console.log(chalk.gray('│ ') + line));
  console.log(chalk.gray('└────────────────────────────\n'));
}

// ─────────────────────────────────────────
// 🚀 FILTRO DE RUIDO (¡ADIÓS ERRORES ROJOS!)
// ─────────────────────────────────────────
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

function shouldHideConsole(args = []) {
  const text = args.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(' ');
  const blocked = [
    'Closing session', 'SessionEntry', '_chains', 'indexInfo', 'currentRatchet', 'messageKeys', 
    'BAD MAC', 'Failed to decrypt', 'Session error', 'verifyMAC', 'Error: Session not found'
  ];
  return blocked.some(word => text.includes(word));
}

console.log = (...args) => { if (!shouldHideConsole(args)) originalConsoleLog(...args); };
console.error = (...args) => { if (!shouldHideConsole(args)) originalConsoleError(...args); };

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
}
global.loadPlugins = loadPlugins;
loadPlugins();

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

    // ⚡ LOG VISUALIZADO
    if (config.debug && body) {
      logBox('MENSAJE RECIBIDO', [
        `${chalk.blue('👥')} Chat: ${chalk.white(fromGroup ? 'Grupo' : 'Privado')}`,
        `${chalk.yellow('👤')} De: ${chalk.white(pushName)} (${chalk.gray('+' + number)})`,
        `${chalk.green('💬')} Msg: ${chalk.white(body.slice(0, 40))}`
      ]);
    }

    // Lógica de plugins y ejecución...
    const parsed = detectPrefix(body, config.prefix);
    if (!parsed) return;

    const args = parsed.body.trim().split(/\s+/).filter(Boolean);
    const command = args.shift()?.toLowerCase();
    const plugin = plugins.get(command);
    if (!plugin) return;

    // 🟢 EJECUCIÓN CON ESTILO
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
