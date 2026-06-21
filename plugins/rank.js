'use strict';

const db = require('../lib/database');

function getRole(level) {
  if (level >= 150) return '👑 DIOS PRO';
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
  
  async execute(ctx) {
    const { sock, remoteJid, sender, pushName, msg } = ctx;

    let target = sender;
    if (msg.message?.extendedTextMessage?.contextInfo?.participant) {
      target = msg.message.extendedTextMessage.contextInfo.participant;
    } else if (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
      target = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
    }

    const user = await db.getUser(target);
    const xp = user.xp || 0;
    // Usamos la función de tu antigua base de datos para que sea consistente
    const level = db.calculateLevel ? db.calculateLevel(xp) : Math.floor(xp / 10000); 

    const currentBase = level * 10000;
    const progress = xp - currentBase;
    const needed = 10000 - progress; // Siempre faltan 10k para el siguiente

    const role = getRole(level);
    const bar = makeBar(progress, 10000);
    const displayUser = target === sender ? `👤 ${pushName || 'Usuario'}` : `👤 @${target.split('@')[0]}`;

    await sock.sendMessage(remoteJid, {
      text: `╔════════════════════╗
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
      mentions: [target]
    }, { quoted: msg });
  }
};
