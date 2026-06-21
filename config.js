'use strict';

require('dotenv').config();

// 🧹 Función para limpiar los números automáticamente y evitar errores de permisos
const cleanNumbers = (nums) => nums.map(n => String(n).replace(/\D/g, ''));

module.exports = {

  // ─────────────────────────────────────────
  // 👤 DIOSES DEL BOT (OWNERS)
  // ─────────────────────────────────────────
  // Puedes ponerlos con '+', con '@s.whatsapp.net' o solo el número. El bot lo limpiará solo.
  owner: cleanNumbers([
    process.env.DEFAULT_PHONE || '51958959882', // Tu número principal por defecto
    '51958959882@s.whatsapp.net',
    '42696337031354',
    '+132482980696170',
    '5493884466806@s.whatsapp.net'
  ]),

  // Si tienes administradores secundarios que no son dueños absolutos:
  rowner: cleanNumbers([
    // '51999999999'
  ]),

  // ─────────────────────────────────────────
  // 🤖 IDENTIDAD DEL BOT
  // ─────────────────────────────────────────
  botName    : process.env.BOT_NAME    || '𝑺𝒊𝒓𝒊𝒖𝒔𝑩𝒐𝒕',
  botVersion : process.env.BOT_VERSION || '2.0.0', // ¡Subimos a versión 2.0 por la nueva arquitectura!
  footer     : process.env.BOT_FOOTER  || '𝑺𝒊𝒓𝒊𝒖𝒔𝑩𝒐𝒕',

  // ─────────────────────────────────────────
  // ⚙️ PREFIJOS MULTIPLES
  // ─────────────────────────────────────────
  // Ahora el bot responderá a cualquiera de estos símbolos
  prefix: process.env.PREFIX ? process.env.PREFIX.split(',') : ['.', '/', '!', '#'],

  // ─────────────────────────────────────────
  // 💾 ALMACENAMIENTO Y BD
  // ─────────────────────────────────────────
  mongoUri: process.env.MONGO_URI || '', // Preparado para una futura migración a MongoDB
  dbPath  : './lib/database.json',

  // ─────────────────────────────────────────
  // 🔌 MOTOR DE CONEXIÓN
  // ─────────────────────────────────────────
  sessionPath   : './session',
  readMessages  : true,      // Controlado inteligentemente por nuestro handler
  autoReconnect : true,      // Reconexión automática si el servidor de Clouding.io pierde red
  reconnectDelay: 3000,      // Tiempo de espera antes de reconectar (3 segundos)

  // ─────────────────────────────────────────
  // ⚡ SEGURIDAD Y RENDIMIENTO (MODO NASA)
  // ─────────────────────────────────────────
  debug: process.env.DEBUG_MODE === 'false' ? false : true, // Muestra los logs bonitos en la terminal
  antiSpam: true,                                           // Bloqueador de atacantes activado
  maxMessagesPerMinute: 20,                                 // Límite antes de advertir a un usuario
  commandCooldown: 3000                                     // 3000 ms (3 segundos) de espera entre comandos
};
