'use strict';

const db = require('../lib/database');

function getRole(level) {
  if (level >= 500) return '🐉 Trascendido';
  if (level >= 250) return '☄️ Celestial';
  if (level >= 150) return '🪐 Divino';
  if (level >= 100) return '👑 Inmortal';
  if (level >= 70) return '💠 Mítico';
  if (level >= 50) return '🌟 Leyenda';
  if (level >= 35) return '🧙 Maestro';
  if (level >= 25) return '🔥 Elite';
  if (level >= 18) return '⚔️ Veterano';
  if (level >= 12) return '🛡️ Guerrero';
  if (level >= 8) return '⚡ Aventurero';
  if (level >= 5) return '📚 Aprendiz';
  if (level >= 3) return '🌱 Principiante';
  return '🐣 Novato';
}

function makeBar(progress, total, size = 10) {
  let filled = Math.round((progress / total) * size);
  if (filled < 0) filled = 0;
  if (filled > size) filled = size;
  return '█'.repeat(filled) + '░'.repeat(size - filled);
}

module.exports = {
  commands: ['rank', 'nivel', 'xp'],
  description: 'Muestra tu rango o el de otro usuario',

  async execute(ctx) {
    const { sock, remoteJid, sender, pushName, msg } = ctx;

    let target = sender;
    // Detectar si respondieron o mencionaron a alguien
    if (msg.message?.extendedTextMessage?.contextInfo?.participant) {
      target = msg.message.extendedTextMessage.contextInfo.participant;
    } else if (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
      target = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
    }

    const user = await db.getUser(target);
    const xp = user.xp || 0;
    
    // 🔥 CÁLCULO MATEMÁTICO CORREGIDO:
    // Nivel basado en bloques de 10,000
    const level = Math.floor(xp / 10000);
    // Progreso: el resto de la división (XP dentro del nivel actual)
    const progress = xp % 10000;
    // Lo que falta para el siguiente bloque de 10,000
    const needed = 10000 - progress;

    const role = getRole(level);
    const bar = makeBar(progress, 10000);
    
    // Para que WhatsApp lo reconozca como mención, el formato es @numero
    const number = target.split('@')[0];
    const displayUser = `👤 @${number}`;

    await sock.sendMessage(remoteJid, {
      text:
`╔════════════════════╗
║      🎖️ PERFIL RANK
╠════════════════════╣
║ ${displayUser}
║
║ ⭐ XP: ${xp.toLocaleString()}
║ 📈 Nivel: ${level}
║ 🎭 Rol: ${role}
║
║ ${bar}
║ ${progress.toLocaleString()}/10000 XP
║
║ ⏳ Faltan: ${needed.toLocaleString()} XP
╚════════════════════╝`,
      mentions: [target] // Esto hace que el @numero sea clickeable
    }, { quoted: msg });
  }
};
