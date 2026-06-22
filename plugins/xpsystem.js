'use strict';

const cooldown = new Map();

// Helper para limpiar el JID y dejar solo el número puro
function cleanJid(jid = '') {
    return String(jid).split('@')[0].split(':')[0];
}

module.exports = {
    // 🔥 EVENTO DE GANANCIA DE XP
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

        // Recalcular lista global
        const list = Object.entries(users).map(([id, u]) => ({
            id: cleanJid(id),
            xp: Number(u.xp || 0),
            level: db.calculateLevel(u.xp || 0)
        }));

        // 🏆 TOP GRUPO
        if (command === 'topxp') {
            let metadata;
            try { metadata = await sock.groupMetadata(remoteJid); } 
            catch { return reply('❌ Este comando solo funciona en grupos.'); }

            // Filtramos solo los participantes actuales del grupo
            const participants = metadata.participants.map(p => cleanJid(p.id));
            const groupUsers = list.filter(u => participants.includes(u.id));

            if (!groupUsers.length) return reply('❌ Nadie en este grupo ha ganado XP aún.');

            const top = groupUsers.sort((a, b) => b.xp - a.xp).slice(0, 10);

            let text = `🏆 *TOP 10 XP DEL GRUPO*\n\n`;
            let mentions = [];

            for (let i = 0; i < top.length; i++) {
                const u = top[i];
                mentions.push(`${u.id}@s.whatsapp.net`);
                const medal = ['🥇','🥈','🥉'][i] || `*${i + 1}.*`;
                
                // 🔥 AQUÍ ESTÁ LA MENCION NATIVA: Al poner @id, WhatsApp lo convierte en enlace
                text += `${medal} @${u.id}\n  ✨ Nivel: ${u.level} | ⚡ XP: ${u.xp.toLocaleString()}\n\n`;
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
                mentions.push(`${u.id}@s.whatsapp.net`);
                const medal = ['🥇','🥈','🥉'][i] || `*${i + 1}.*`;
                
                text += `${medal} @${u.id}\n  ✨ Nivel: ${u.level} | ⚡ XP: ${u.xp.toLocaleString()}\n\n`;
            }

            return sock.sendMessage(remoteJid, { text, mentions }, { quoted: msg });
        }
    }
};
