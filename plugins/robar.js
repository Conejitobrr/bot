'use strict';

const fs = require('fs');
const path = require('path');
const shop = require('../lib/shop');

const ROBOS_PATH = path.join(process.cwd(), 'lib', 'robos_recientes.json');

// 🛠️ UTILIDADES
function ensureRobosDB() {
  const dir = path.dirname(ROBOS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(ROBOS_PATH)) fs.writeFileSync(ROBOS_PATH, JSON.stringify({}, null, 2));
}

function loadRobos() {
  ensureRobosDB();
  try { return JSON.parse(fs.readFileSync(ROBOS_PATH, 'utf8') || '{}'); } catch { return {}; }
}

function saveRobos(data) {
  ensureRobosDB();
  fs.writeFileSync(ROBOS_PATH, JSON.stringify(data, null, 2));
}

function saveRecentRobbery(remoteJid, thief, victim, amount) {
  const data = loadRobos();
  if (!data[remoteJid]) data[remoteJid] = [];
  const now = Date.now();
  data[remoteJid] = data[remoteJid].filter(r => now - Number(r.time || 0) <= 10 * 60 * 1000);
  data[remoteJid].push({ thief, victim, amount, time: now, caught: false });
  saveRobos(data);
}

module.exports = {
  commands: ['robar'],
  description: 'Roba experiencia a otro usuario',

  async execute(ctx) {
    const { sock, remoteJid, sender, msg, fromGroup, db, reply, isOwner } = ctx;

    if (!fromGroup) return reply('❌ Este comando solo funciona en grupos.');

    let target;
    if (msg.message?.extendedTextMessage?.contextInfo?.participant) {
      target = msg.message.extendedTextMessage.contextInfo.participant;
    } else if (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
      target = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
    }

    if (!target) return reply('❌ Debes mencionar o responder a alguien.');
    if (target === sender) return reply('❌ No puedes robarte a ti mismo.');

    const robber = await db.getUser(sender);
    const victim = await db.getUser(target);

    // 🔥 Inmunidad para Owners
    // Si tienes un sistema de isOwner en el handler, esto evita problemas
    if (ctx.isOwner && !isOwner) { /* lógica opcional */ }

    // 🛡️ LÓGICA DE ESCUDO
    const victimInv = await shop.getInventory(target);
    const now = Date.now();

    if ((victimInv.shieldUses || 0) > 0) {
        await shop.useItem(target, 'shieldUses', 1);
        await db.setUser(sender, { lastRobXp: now });
        return reply(`🛡️ @${target.split('@')[0]} tiene un *Escudo Anti-Robo* activo. ¡El escudo absorbió el ataque y se rompió!`);
    }

    // Cooldown
    const cooldown = 10 * 60 * 1000;
    const remaining = cooldown - (now - (robber.lastRobXp || 0));

    if (remaining > 0) {
      const m = Math.floor(remaining / 60000);
      return reply(`⏳ Debes esperar ${m} minuto(s) antes de volver a robar XP.`);
    }

    if ((victim.xp || 0) < 2000) {
      return reply('❌ Esa persona es demasiado pobre para ser asaltada (Mínimo 2000 XP).');
    }

    // 🔥 Cálculo de robo
    let amount = 0;
    let jackpot = false;
    if (Math.random() < 0.05) { // 5% Probabilidad de Jackpot
      amount = Math.floor(victim.xp * ((Math.random() * 0.08) + 0.12));
      jackpot = true;
    } else {
      amount = Math.floor(victim.xp * ((Math.random() * 0.05) + 0.03));
    }

    amount = Math.min(amount, victim.xp);

    // Ejecución
    await db.removeXP(target, amount);
    await db.addXP(sender, amount);
    await db.setUser(sender, { lastRobXp: now });

    saveRecentRobbery(remoteJid, sender, target, amount);

    const msgRobo = jackpot
      ? `💎 ¡JACKPOT MAFIOSO!\n\nDiste un gran golpe y le robaste *${amount.toLocaleString()} XP* a @${target.split('@')[0]}.\n\n🚨 La policía puede atraparte si usan *.policia* en los próximos 5 minutos.`
      : `🦹 Te metiste en los bolsillos de @${target.split('@')[0]} y le robaste *${amount.toLocaleString()} XP*.\n\n🚨 La policía puede atraparte si usan *.policia* en los próximos 5 minutos.`;

    await sock.sendMessage(remoteJid, { text: msgRobo, mentions: [target] }, { quoted: msg });
  }
};
