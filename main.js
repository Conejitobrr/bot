'use strict';

require('dotenv').config();

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  jidNormalizedUser
} = require('@whiskeysockets/baileys');

const { Boom } = require('@hapi/boom');
const pino = require('pino');
const chalk = require('chalk');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

const config = require('./config');
const { messageHandler } = require('./handler');
const events = require('./lib/events');
const db = require('./lib/database'); // 🔥 IMPORTANTE

const SESSION_DIR = path.resolve(config.sessionPath || './session');

if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}

const logger = pino({ level: config.debug ? 'silent' : 'fatal' });

const store = {
  contacts: {},
  messages: {}
};

let restarting = false;

// ─────────────────────────────────────────
// 🚀 MOTOR 1: RECOLECTOR DE BASURA (GARBAGE COLLECTOR)
// ─────────────────────────────────────────
// Evita crear miles de setTimeouts. Un solo reloj limpia la memoria.
const processedMessages = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [msgId, timestamp] of processedMessages.entries()) {
    if (now - timestamp > 60000) { // Borra IDs con más de 60 segundos
      processedMessages.delete(msgId);
    }
  }
}, 60000); // Se ejecuta una vez por minuto

// ─────────────────────────────────────────
// 🚀 MOTOR 2: COLA DE MENSAJES CONCURRENTE (MESSAGE QUEUE)
// ─────────────────────────────────────────
class MessageQueue {
  constructor(concurrency = 15) { // Procesa hasta 15 mensajes al mismo tiempo
    this.concurrency = concurrency;
    this.running = 0;
    this.queue = [];
  }

  enqueue(task) {
    this.queue.push(task);
    this.processNext();
  }

  async processNext() {
    if (this.running >= this.concurrency || this.queue.length === 0) return;
    
    this.running++;
    const task = this.queue.shift();
    
    try {
      await task();
    } catch (e) {
      console.error(chalk.red('❌ Error en cola de procesamiento:'), e);
    } finally {
      this.running--;
      this.processNext(); // Llama al siguiente en la fila
    }
  }
}

const messageQueue = new MessageQueue();

// ─────────────────────────────────────────
// FORMATEAR NÚMERO
// ─────────────────────────────────────────
function extractNumber(jid = '') {
  if (!jid) return '';

  try {
    jid = jidNormalizedUser(jid);
  } catch {}

  let number = jid.split('@')[0].split(':')[0];
  number = number.replace(/\D/g, '');

  if (!number) return '';
  if (number.length > 15) number = number.slice(0, 15);

  return `+${number}`;
}

// ─────────────────────────────────────────
// TEXTO MENSAJE
// ─────────────────────────────────────────
function getMessageText(msg) {
  const m = msg.message;
  if (!m) return '';

  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    ''
  );
}

// ─────────────────────────────────────────
// INICIAR BOT
// ─────────────────────────────────────────
async function startBot(opts = {}) {

  // 🔥 INICIAR BASE DE DATOS (ANTES DE TODO)
  await db.init();

  const useCode = opts.method === 'code';
  const phoneNum = opts.phone || null;

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger,

    browser: useCode
      ? ['Ubuntu', 'Chrome', '20.0.04']
      : [config.botName, 'Safari', config.botVersion],

    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },

    printQRInTerminal: false,
    emitOwnEvents: true,
    markOnlineOnConnect: false
  });

  // ─────────────────────────────────────────
  // CÓDIGO DE EMPAREJAMIENTO
  // ─────────────────────────────────────────
  if (useCode && phoneNum && !state.creds?.registered) {
    setTimeout(async () => {
      try {
        const cleanPhone = phoneNum.replace(/\D/g, '');
        const code = await sock.requestPairingCode(cleanPhone);

        console.log(chalk.cyan('\nCódigo de vinculación:\n'));
        console.log(chalk.bgCyan.black(`   ${code}   \n`));
      } catch (e) {
        console.log(chalk.red('❌ Error generando código'));
      }
    }, 3000);
  }

  // ─────────────────────────────────────────
  // CONEXIÓN
  // ─────────────────────────────────────────
  sock.ev.on('connection.update', update => {
    const { connection, qr, lastDisconnect } = update;

    if (qr && !useCode) {
      console.log(chalk.yellow('\nEscanea el QR:\n'));
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      restarting = false;

      console.log(chalk.green('\n✅ BOT CONECTADO EN MODO ALTO RENDIMIENTO'));
      console.log(chalk.green('🤖 Nombre:'), config.botName);
      console.log(chalk.green('📱 Número:'), extractNumber(sock.user?.id || ''));

      // 🔥 INICIAR EVENTOS
      try {
        events.init(sock);
      } catch (e) {
        console.log(chalk.red('Error events:'), e);
      }
    }

    if (connection === 'close') {
      const reason =
        lastDisconnect?.error instanceof Boom
          ? lastDisconnect.error.output?.statusCode
          : 0;

      const shouldReconnect = reason !== DisconnectReason.loggedOut;

      if (shouldReconnect && config.autoReconnect) {
        if (restarting) return;

        restarting = true;

        console.log(chalk.yellow('⚠️ Reconectando...'));

        setTimeout(() => {
          startBot({ method: 'saved' });
        }, config.reconnectDelay || 3000);
      } else {
        console.log(chalk.red('❌ Sesión cerrada.'));
      }
    }
  });

  // ─────────────────────────────────────────
  // GUARDAR CREDENCIALES
  // ─────────────────────────────────────────
  sock.ev.on('creds.update', saveCreds);

  // ─────────────────────────────────────────
  // CONTACTOS
  // ─────────────────────────────────────────
  sock.ev.on('contacts.upsert', contacts => {
    for (const c of contacts || []) {
      if (!c.id) continue;

      const jid = jidNormalizedUser(c.id);

      store.contacts[jid] = {
        id: jid,
        name: c.name || c.notify || '',
        number: extractNumber(jid)
      };
    }
  });

  // ─────────────────────────────────────────
  // MENSAJES (SISTEMA MULTI-HILO SIMULADO)
  // ─────────────────────────────────────────
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      const msgId = msg.key?.id;
      if (!msgId) continue;

      // 🔥 ANTI-SPAM SÚPER RÁPIDO
      if (processedMessages.has(msgId)) continue;
      processedMessages.set(msgId, Date.now());

      // 🔥 DELEGAR EL MENSAJE A LA COLA DE PROCESAMIENTO
      messageQueue.enqueue(async () => {
        try {
          if (!msg.message) return;
          if (!msg.key?.remoteJid) return;
          if (msg.key.remoteJid === 'status@broadcast') return;

          const remoteJid = msg.key.remoteJid;
          const fromGroup = remoteJid.endsWith('@g.us');
          const senderJid = fromGroup ? msg.key.participant : remoteJid;
          const body = getMessageText(msg);

          msg.bodyText = body;
          msg.realNumber = extractNumber(senderJid);

          // 🔥 EJECUTAR EVENTOS
          try {
            await events.onMessage({
              sock,
              remoteJid,
              body,
              sender: senderJid,
              pushName: msg.pushName || 'Usuario',
              fromGroup,
              msg
            });
          } catch (e) {
            console.log(chalk.red('Error events:'), e);
          }

          // 🔥 EJECUTAR HANDLER (COMANDOS)
          await messageHandler(sock, msg, store);

        } catch (e) {
          console.log(chalk.red('❌ Error procesando mensaje:'), e);
        }
      });
    }
  });

  return sock;
}

module.exports = {
  startBot
};
