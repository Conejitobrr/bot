'use strict';

const cooldown = new Map();

// 🔥 NUEVO: Limpiador extremo (quita todo lo que no sea número)
function getPureNumber(id) {
    return String(id).replace(/\D/g, ''); 
}

function key(g, u) {
    return `${g}:${u}`;
}

module.exports = {
    onMessage: async (ctx) => {
        const { sender, remoteJid, fromGroup, db } = ctx;
        if (!fromGroup) return;

        const k = `${remoteJid}:${sender}`;
        const now = Date.now();

        if (cooldown.has(k) && (now - cooldown.get(k) < 8000)) return;
        cooldown.set(k, now);

        const xp = Math.floor(Math.random() * 11) + 5;
        await db.addXP(sender, xp);
    },

    commands: ['topxp', 'topglobal'],
    description: 'Mira los rankings de XP del grupo o globales',

    execute: async (ctx) => {
        const { sock, remoteJid, command, db, msg, reply } = ctx;

        const allData = await db.getAll();
        const users = allData.users || {};

        // Recalcular lista
        const list = Object.entries(users).map(([id, u]) => ({
            id: id, // Mantenemos el ID original para trabajar
            xp: Number(u.xp || 0),
            level: db.calculateLevel(u.xp || 0)
        }));

        // 🏆 TOP GRUPO
        if (command === 'topxp') {
            let metadata;
            try { metadata = await sock.groupMetadata(remoteJid); } 
            catch { return reply('❌ Este comando solo funciona en grupos.'); }

            const participants = metadata.participants.map(p => p.id);
            const groupUsers = list.filter(u => participants.includes(u.id));

            if (!groupUsers.length) return reply('❌ Nadie en este grupo ha ganado XP aún.');

            const top = groupUsers.sort((a, b) => b.xp - a.xp).slice(0, 10);

            let text = `🏆 *TOP 10 XP DEL GRUPO*\n\n`;
            let mentions = [];

            for (let i = 0; i < top.length; i++) {
                const u = top[i];
                const pureNumber = getPureNumber(u.id); // 🔥 LIMPIEZA EXTREMA
                
                mentions.push(u.id); // Guardamos el JID completo para la mención
                const medal = ['🥇','🥈','🥉'][i] || `*${i + 1}.*`;
                
                // 🔥 MENCION NATIVA: @ seguido de números puros
                text += `${medal} @${pureNumber}\n  ✨ Nivel: ${u.level} | ⚡ XP: ${u.xp.toLocaleString()}\n\n`;
            }

            return sock.sendMessage(remoteJid, { text, mentions }, { quoted: msg });
        }

        // 🌍 TOP GLOBAL
        if (command === 'topglobal') {
            const top = list.sort((a, b) => b.xp - a.xp).slice(0, 10);
            
            let text = `🌍 *TOP 10 XP GLOBAL*\n\n`;
            let mentions = [];

            for (let i = 0; i < top.length; i++) {
                const u = top[i];
                const pureNumber = getPureNumber(u.id); // 🔥 LIMPIEZA EXTREMA
                
                mentions.push(u.id);
                const medal = ['🥇','🥈','🥉'][i] || `*${i + 1}.*`;
                
                text += `${medal} @${pureNumber}\n  ✨ Nivel: ${u.level} | ⚡ XP: ${u.xp.toLocaleString()}\n\n`;
            }

            return sock.sendMessage(remoteJid, { text, mentions }, { quoted: msg });
        }
    }
};
