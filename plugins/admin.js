'use strict';

const fs = require('fs').promises;
const path = require('path');
const config = require('../config');

// 🔥 SISTEMA DE CACHÉ EN RAM PARA ADVERTENCIAS (Rápido y sin lag)
const WARN_FILE = path.join(process.cwd(), 'lib', 'warnings.json');
const MAX_WARN = 3;

let warnCache = null;
let isDirty = false;

async function loadWarns() {
    if (warnCache) return warnCache;
    try {
        const data = await fs.readFile(WARN_FILE, 'utf8');
        warnCache = JSON.parse(data);
    } catch {
        warnCache = {};
    }
    return warnCache;
}

async function saveWarns() {
    if (!isDirty || !warnCache) return;
    try { await fs.writeFile(WARN_FILE, JSON.stringify(warnCache, null, 2)); } catch {}
    isDirty = false;
}
setInterval(saveWarns, 30000); // Auto-guardado cada 30 segundos

// ==========================================
// UTILIDADES Y FILTROS
// ==========================================
function cleanJid(jid = '') { return String(jid).split(':')[0]; }
function number(jid = '') { return cleanJid(jid).split('@')[0].replace(/\D/g, ''); }

async function extractTargets(ctx) {
    const { msg, args } = ctx;
    const targets = [];
    
    // Menciones directas
    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    targets.push(...mentioned);
    
    // Mensaje respondido (Quoted)
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.participant;
    if (quoted) targets.push(quoted);
    
    // Números sueltos en el texto
    for (const arg of args || []) {
        const num = arg.replace(/\D/g, '');
        if (num.length >= 10 && num.length <= 15) {
            targets.push(`${num}@s.whatsapp.net`);
        }
    }
    return [...new Set(targets.map(cleanJid))]; // Devuelve IDs limpios y únicos
}

// Verifica si alguien es dueño del bot
function isOwnerUser(jid = '') {
    const num = number(jid);
    const owners = Array.isArray(config.owner) ? config.owner.map(n => String(n).replace(/\D/g, '')) : [];
    return owners.includes(num);
}

// 🔥 Detector de links exclusivo de grupos de WhatsApp
function containsLink(text = '') {
    return /chat\.whatsapp\.com\/[a-zA-Z0-9]+/i.test(String(text || ''));
}

module.exports = {
    commands: [
        'kick', 'ban', 'promote', 'demote', 'revoke', 
        'abrirgrupo', 'cerrargrupo', 'warn', 'unwarn', 
        'warnings', 'warns', 'resetwarn', 'antilink',
        'setname', 'setdesc' // Nuevos comandos añadidos
    ],
    description: 'Comandos completos de administración de grupos',

    // ==========================================
    // 🛡️ ESCUDO AUTOMÁTICO (ANTILINK)
    // ==========================================
    async onMessage(ctx) {
        const { sock, msg, remoteJid, sender, body, fromGroup, isOwner, isAdmin, groupMetadata, db } = ctx;

        if (!fromGroup || !body) return;

        // Verifica si el antilink está activado en la base de datos
        const enabled = await db.getGroupSetting(remoteJid, 'antilink');
        if (enabled !== true) return;

        if (!containsLink(body)) return;

        // Si es Admin u Owner, no le hace nada
        if (isOwner || isAdmin) return;

        // Verifica si el bot es administrador
        const botRaw = sock.user?.id || '';
        const botAdmin = groupMetadata?.participants?.find(p => cleanJid(p.id) === cleanJid(botRaw))?.admin;
        
        if (!botAdmin) return; // Si el bot no es admin, no puede borrar ni expulsar

        try {
            // 1. Borrar el enlace inmediatamente
            await sock.sendMessage(remoteJid, { delete: msg.key });

            // 2. Gestionar advertencias en RAM
            const cache = await loadWarns();
            if (!cache[remoteJid]) cache[remoteJid] = {};
            if (!cache[remoteJid][sender]) cache[remoteJid][sender] = { count: 0 };
            
            cache[remoteJid][sender].count += 1;
            isDirty = true;
            const warns = cache[remoteJid][sender].count;

            const numSender = number(sender);

            // 3. Castigo o Advertencia
            if (warns >= MAX_WARN) {
                await sock.groupParticipantsUpdate(remoteJid, [sender], 'remove');
                delete cache[remoteJid][sender]; // Limpia sus warns al expulsarlo
                
                await sock.sendMessage(remoteJid, {
                    text: `🚫 *¡ELIMINADO!*\n\n@${numSender} ha sido expulsado automáticamente por enviar enlaces repetidas veces (*${MAX_WARN}/${MAX_WARN} warns*).`,
                    mentions: [sender]
                });
            } else {
                await sock.sendMessage(remoteJid, {
                    text: `⚠️ *¡ALTO AHÍ! ANTILINK ACTIVADO*\n\n@${numSender}, está prohibido enviar enlaces de otros grupos aquí.\n\n🚨 *Advertencia:* ${warns}/${MAX_WARN}`,
                    mentions: [sender]
                });
            }
        } catch (err) {
            console.error('❌ Error en el sistema Antilink:', err);
        }
    },

    // ==========================================
    // ⚙️ EJECUCIÓN DE COMANDOS MANUALES
    // ==========================================
    async execute(ctx) {
        const { sock, msg, remoteJid, sender, args, command, fromGroup, db, isAdmin, isOwner, groupMetadata, reply } = ctx;

        if (!fromGroup) return reply('❌ Este comando es exclusivo para grupos.');
        
        const isUserAdmin = isAdmin || isOwner;
        if (!isUserAdmin) return reply('❌ *Acceso Denegado.* Necesitas ser Administrador para usar esto.');

        const botRaw = sock.user?.id || '';
        const isBotAdmin = groupMetadata?.participants?.find(p => cleanJid(p.id) === cleanJid(botRaw))?.admin;

        const cmd = command.toLowerCase();

        // 🛡️ CONFIGURACIÓN ANTILINK
        if (cmd === 'antilink') {
            const option = String(args[0] || '').toLowerCase();
            if (option === 'on' || option === 'off') {
                const state = option === 'on';
                await db.setGroupSetting(remoteJid, 'antilink', state);
                return reply(`🛡️ Sistema Antilink *${state ? 'ACTIVADO ✅' : 'DESACTIVADO ❌'}*`);
            }
            const enabled = await db.getGroupSetting(remoteJid, 'antilink');
            return reply(`🛡️ *ESTADO DEL ANTILINK*\n\nActualmente está: *${enabled ? 'Activado ✅' : 'Desactivado ❌'}*\n\n_Para cambiarlo usa:_\n> .antilink on\n> .antilink off`);
        }

        // ==========================================
        // COMANDOS QUE REQUIEREN QUE EL BOT SEA ADMIN
        // ==========================================
        if (['kick', 'ban', 'promote', 'demote', 'revoke', 'abrirgrupo', 'cerrargrupo', 'setname', 'setdesc'].includes(cmd)) {
            if (!isBotAdmin) return reply('❌ *Error:* El bot necesita ser Administrador para ejecutar esta acción.');
        }

        // 👢 EXPULSAR USUARIOS
        if (cmd === 'kick' || cmd === 'ban') {
            const targets = await extractTargets(ctx);
            if (!targets.length) return reply('❌ Debes etiquetar o responder al mensaje del usuario que quieres expulsar.');

            const safeTargets = targets.filter(t => !isOwnerUser(t) && cleanJid(t) !== cleanJid(botRaw));
            if (!safeTargets.length) return reply('🛡️ No puedo expulsar a un Creador del bot ni a mí mismo.');

            await sock.groupParticipantsUpdate(remoteJid, safeTargets, 'remove');
            return sock.sendMessage(remoteJid, { 
                text: `👢 *EXPULSIÓN EXITOSA*\n\nSe ha eliminado a ${safeTargets.length} usuario(s) del grupo.`,
                mentions: safeTargets 
            }, { quoted: msg });
        }

        // 🌟 DAR ADMIN
        if (cmd === 'promote') {
            const targets = await extractTargets(ctx);
            if (!targets.length) return reply('❌ Debes etiquetar o responder al mensaje del usuario.');
            await sock.groupParticipantsUpdate(remoteJid, targets, 'promote');
            return sock.sendMessage(remoteJid, { text: `🌟 *NUEVO ADMINISTRADOR*\n\nSe han otorgado permisos de administrador.`, mentions: targets });
        }

        // 📉 QUITAR ADMIN
        if (cmd === 'demote') {
            const targets = await extractTargets(ctx);
            if (!targets.length) return reply('❌ Debes etiquetar o responder al mensaje del usuario.');
            await sock.groupParticipantsUpdate(remoteJid, targets, 'demote');
            return sock.sendMessage(remoteJid, { text: `📉 *PERMISOS REVOCADOS*\n\nSe ha quitado el poder de administrador.`, mentions: targets });
        }

        // 🔗 RESETEAR ENLACE
        if (cmd === 'revoke') {
            await sock.groupRevokeInvite(remoteJid);
            const code = await sock.groupInviteCode(remoteJid);
            return reply(`✅ *Enlace del grupo restablecido exitosamente.*\n\nNuevo enlace:\nhttps://chat.whatsapp.com/${code}`);
        }

        // 🔒 CERRAR GRUPO
        if (cmd === 'cerrargrupo') {
            await sock.groupSettingUpdate(remoteJid, 'announcement');
            return reply('🔒 *GRUPO CERRADO*\nSolo los administradores pueden enviar mensajes ahora.');
        }

        // 🔓 ABRIR GRUPO
        if (cmd === 'abrirgrupo') {
            await sock.groupSettingUpdate(remoteJid, 'not_announcement');
            return reply('🔓 *GRUPO ABIERTO*\nTodos los participantes pueden enviar mensajes.');
        }

        // 📝 CAMBIAR NOMBRE DEL GRUPO
        if (cmd === 'setname') {
            const newName = args.join(' ');
            if (!newName) return reply('❌ Escribe el nuevo nombre del grupo tras el comando.\nEj: `.setname Fans del Bot`');
            await sock.groupUpdateSubject(remoteJid, newName);
            return reply(`✅ El nombre del grupo se ha cambiado a:\n*${newName}*`);
        }

        // 📝 CAMBIAR DESCRIPCIÓN DEL GRUPO
        if (cmd === 'setdesc') {
            const newDesc = args.join(' ');
            if (!newDesc) return reply('❌ Escribe la nueva descripción tras el comando.');
            await sock.groupUpdateDescription(remoteJid, newDesc);
            return reply('✅ La descripción del grupo ha sido actualizada.');
        }

        // ==========================================
        // SISTEMA DE ADVERTENCIAS (WARNS MANUALES)
        // ==========================================
        if (cmd === 'warn') {
            const targets = await extractTargets(ctx);
            if (!targets.length) return reply('❌ Menciona o responde al usuario que quieres advertir.');

            const reason = args.filter(a => !a.includes('@')).join(' ') || 'Falta a las reglas del grupo';
            const cache = await loadWarns();
            if (!cache[remoteJid]) cache[remoteJid] = {};

            for (const target of targets) {
                if (isOwnerUser(target) || cleanJid(target) === cleanJid(botRaw)) continue; // Inmunes

                if (!cache[remoteJid][target]) cache[remoteJid][target] = { count: 0 };
                cache[remoteJid][target].count += 1;
                isDirty = true;

                const warns = cache[remoteJid][target].count;

                if (warns >= MAX_WARN) {
                    if (isBotAdmin) {
                        await sock.groupParticipantsUpdate(remoteJid, [target], 'remove');
                        delete cache[remoteJid][target];
                        await sock.sendMessage(remoteJid, { text: `🚫 *LIMITE DE WARNS ALCANZADO*\n\n@${number(target)} ha sido expulsado del grupo automáticamente.`, mentions: [target] });
                    } else {
                        await sock.sendMessage(remoteJid, { text: `⚠️ @${number(target)} llegó a *${MAX_WARN}/${MAX_WARN}* warns, pero no puedo expulsarlo porque no soy admin.`, mentions: [target] });
                    }
                } else {
                    await sock.sendMessage(remoteJid, { 
                        text: `⚠️ *ADVERTENCIA APLICADA*\n\n👤 *Usuario:* @${number(target)}\n📌 *Motivo:* ${reason}\n🚨 *Warns:* [ ${warns} / ${MAX_WARN} ]`, 
                        mentions: [target] 
                    });
                }
            }
        }

        if (cmd === 'unwarn') {
            const targets = await extractTargets(ctx);
            if (!targets.length) return reply('❌ Menciona o responde al usuario.');

            const cache = await loadWarns();
            if (!cache[remoteJid]) return reply('✅ Este grupo no tiene registros de advertencias.');

            for (const target of targets) {
                if (cache[remoteJid][target] && cache[remoteJid][target].count > 0) {
                    cache[remoteJid][target].count -= 1;
                    isDirty = true;
                }
            }
            return reply(`✅ Se le ha quitado 1 advertencia a los usuarios mencionados.`);
        }

        if (cmd === 'resetwarn') {
            const targets = await extractTargets(ctx);
            if (!targets.length) return reply('❌ Menciona o responde al usuario.');

            const cache = await loadWarns();
            if (!cache[remoteJid]) return reply('✅ Todo limpio aquí.');

            for (const target of targets) {
                delete cache[remoteJid][target];
                isDirty = true;
            }
            return reply(`✅ Registro de advertencias limpiado exitosamente para esos usuarios.`);
        }

        if (cmd === 'warns' || cmd === 'warnings') {
            const cache = await loadWarns();
            const groupWarns = cache[remoteJid] || {};
            
            const list = Object.entries(groupWarns)
                .filter(([, data]) => data.count > 0)
                .sort((a, b) => b[1].count - a[1].count);

            if (!list.length) return reply('✨ *Excelente:* Nadie en este grupo tiene advertencias.');

            const formattedList = list.map(([jid, data], i) => `*${i + 1}.* @${number(jid)} — [ ${data.count} / ${MAX_WARN} ]`).join('\n');
            const mentions = list.map(([jid]) => jid);

            return sock.sendMessage(remoteJid, {
                text: `🛑 *LISTA DE ADVERTIDOS*\n\n${formattedList}`,
                mentions
            }, { quoted: msg });
        }
    }
};
