'use strict';

// Función para limpiar números
function cleanJid(jid = '') {
    return String(jid).split('@')[0].split(':')[0].replace(/\D/g, '');
}

// 🎭 Sistema de Roles
function getRole(level) {
    if (level >= 500) return '🐉 Dios Supremo';
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

// 📊 Creador de barra de progreso visual
function makeBar(progress, total, size = 10) {
    let filled = Math.round((progress / total) * size);
    if (filled < 0) filled = 0;
    if (filled > size) filled = size;
    const empty = size - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
}

module.exports = {
    commands: ['rank', 'perfil', 'nivel', 'level'],
    description: 'Muestra tu rango, nivel y posición global',

    async execute(ctx) {
        const { sock, remoteJid, sender, pushName, msg, db } = ctx;

        // 1. IDENTIFICAR EL OBJETIVO (A quién estamos mirando)
        let target = sender;
        if (msg.message?.extendedTextMessage?.contextInfo?.participant) {
            target = msg.message.extendedTextMessage.contextInfo.participant;
        } else if (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
            target = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
        }

        const cleanTarget = cleanJid(target);
        const cleanSender = cleanJid(sender);

        // 2. OBTENER DATOS DEL USUARIO
        const user = await db.getUser(cleanTarget);
        const xp = Number(user.xp || 0);
        const level = Number(user.level || 0);

        // 3. CÁLCULO PERFECTO DE BARRAS (Base 10,000)
        // Nivel 0: 0-9,999 | Nivel 1: 10,000-19,999
        const currentBase = level * 10000; 
        const nextBase = (level + 1) * 10000;
        
        const progressXP = xp - currentBase;
        const neededXP = nextBase - xp;
        
        const porcentaje = Math.floor((progressXP / 10000) * 100);
        const bar = makeBar(progressXP, 10000, 10);
        const role = getRole(level);

        // 4. 🏆 CÁLCULO DEL TOP GLOBAL (Magia en memoria RAM)
        const allData = await db.getAll();
        const allUsers = allData.users || {};
        
        // Ordenamos a todos los usuarios de mayor a menor XP
        const sortedUsers = Object.entries(allUsers).sort((a, b) => (b[1].xp || 0) - (a[1].xp || 0));
        
        // Buscamos en qué posición está la persona
        const rankPosition = sortedUsers.findIndex(u => u[0] === cleanTarget) + 1;
        const totalUsers = sortedUsers.length;

        // Diseñamos el trofeo según la posición
        let trofeo = '';
        if (rankPosition === 1) trofeo = '🏆 *[TOP #1 GLOBAL]*';
        else if (rankPosition === 2) trofeo = '🥈 *[TOP #2 GLOBAL]*';
        else if (rankPosition === 3) trofeo = '🥉 *[TOP #3 GLOBAL]*';
        else if (rankPosition <= 10) trofeo = `🎖️ *[TOP #${rankPosition} GLOBAL]*`;
        else if (rankPosition === 0) trofeo = '👻 No registrado';
        else trofeo = `🏅 Posición: #${rankPosition} de ${totalUsers}`;

        // 5. DISEÑO DE LA INTERFAZ
        const isMe = cleanTarget === cleanSender;
        const displayName = isMe ? pushName : `@${cleanTarget}`;

        const rankMsg = 
`╭━━━〔 *PERFIL DE USUARIO* 〕━━━
┃ 👤 *Nombre:* ${displayName}
┃ ${trofeo}
┃ 🎭 *Clase:* ${role}
┣━━━━━━━━━━━━━━━━━━━━━━
┃ 📈 *Nivel:* ${level}
┃ ✨ *Experiencia:* ${xp.toLocaleString()} XP
┣━━━━━━━━━━━━━━━━━━━━━━
┃ 🚀 *Progreso al Nivel ${level + 1}*
┃ [${bar}] ${porcentaje}%
┃ ⏳ *Faltan:* ${neededXP.toLocaleString()} XP
╰━━━━━━━━━━━━━━━━━━━━━━`;

        // 6. ENVIAR RESULTADO
        await sock.sendMessage(remoteJid, {
            text: rankMsg,
            mentions: isMe ? [] : [target] // Solo menciona si miraste a otro
        }, { quoted: msg });
    }
};
