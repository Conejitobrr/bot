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
  
  // 🛡️ Filtro de seguridad para evitar números negativos o barras sobrecargadas
  if (filled < 0) filled = 0;
  if (filled > size) filled = size;

  const empty = size - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

module.exports = {
  commands: ['rank'],
  description: 'Muestra tu rango o el de otro usuario',

  async execute(ctx) {
    const {
      sock,
      remoteJid,
      sender,
      pushName,
      msg
    } = ctx;

    let target = sender;
    let targetName = pushName;

    if (msg.message?.extendedTextMessage?.contextInfo?.participant) {
      target = msg.message.extendedTextMessage.contextInfo.participant;
    } else if (
      msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length
    ) {
      target = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
    }

    const user = await db.getUser(target);

    const xp = user.xp || 0;
    const level = user.level || 1;

    // 🔥 Cambiado el límite a 10,000 XP
    const currentBase = (level - 1) * 10000;
    const nextBase = level * 10000;

    const progress = xp - currentBase;
    const needed = nextBase - xp;

    const role = getRole(level);
    
    // 🔥 La barra ahora se calcula sobre una meta de 10,000
    const bar = makeBar(progress, 10000);

    const number = target.split('@')[0];
    const displayUser =
      target === sender
        ? `👤 ${pushName}`
        : `👤 @${number}`;

    await sock.sendMessage(remoteJid, {
      text:
`╔════════════════════╗
║      🎖️ PERFIL RANK
╠════════════════════╣
║ ${displayUser}
║
║ ⭐ XP: ${xp}
║ 📈 Nivel: ${level}
║ 🎭 Rol: ${role}
║
║ ${bar}
║ ${progress}/10000 XP
║
║ ⏳ Faltan: ${needed} XP
╚════════════════════╝`,
      mentions: [target]
    }, { quoted: msg });
  }
};
