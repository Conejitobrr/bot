'use strict';

const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

// ==========================================
// 🧠 MEMORIA RAM DEL BOT (Caché de mensajes)
// ==========================================
const deletedCache = new Map();
const handledDeletes = new Set(); // Para evitar que el bot repita el mismo mensaje borrado 2 veces

const MAX_CACHE = 1000; // Guarda los últimos 1000 mensajes
const CACHE_TIME = 2 * 60 * 60 * 1000; // Borra de la memoria los mensajes de hace más de 2 horas
const MAX_MEDIA_BUFFER = 60 * 1024 * 1024; // 60 MB máximo por archivo (Evita crasheos por falta de RAM)

// Utilidades básicas
function cleanJid(jid = '') { return String(jid).split(':')[0]; }
function number(jid = '') { return cleanJid(jid).split('@')[0].replace(/\D/g, ''); }

function getMsgKey(remoteJid, id) { return `${remoteJid}:${id}`; }
function getHandledKey(remoteJid, id) { return `${remoteJid}:${id}:handled`; }

// ==========================================
// 🔍 DETECTORES DE MENSAJE
// ==========================================
function isDeleteMessage(msg) {
    const protocol = msg.message?.protocolMessage;
    if (!protocol) return false;
    // Tipo 0 o REVOKE significa que el usuario presionó "Eliminar para todos"
    return protocol.type === 0 || protocol.type === 'REVOKE' || protocol.key?.id;
}

function getDeletedKey(msg) {
    return msg.message?.protocolMessage?.key || null;
}

function unwrapMessage(message = {}) {
    if (message.ephemeralMessage?.message) return unwrapMessage(message.ephemeralMessage.message);
    if (message.documentWithCaptionMessage?.message) return unwrapMessage(message.documentWithCaptionMessage.message);
    return message;
}

function getMessageMentions(message = {}) {
    const ctx = message.extendedTextMessage?.contextInfo || message.imageMessage?.contextInfo || message.videoMessage?.contextInfo || null;
    return Array.isArray(ctx?.mentionedJid) ? ctx.mentionedJid.map(cleanJid).filter(Boolean) : [];
}

function getText(message = {}) {
    return message.conversation || message.extendedTextMessage?.text || message.imageMessage?.caption || message.videoMessage?.caption || message.documentMessage?.caption || '';
}

// Analizador de archivos multimedia
function getMediaInfo(message = {}) {
    if (message.imageMessage) return { type: 'image', mediaType: 'image', media: message.imageMessage, mimetype: message.imageMessage.mimetype || 'image/jpeg', caption: message.imageMessage.caption || '' };
    if (message.videoMessage) return { type: 'video', mediaType: 'video', media: message.videoMessage, mimetype: message.videoMessage.mimetype || 'video/mp4', caption: message.videoMessage.caption || '', gifPlayback: message.videoMessage.gifPlayback || false };
    if (message.audioMessage) return { type: 'audio', mediaType: 'audio', media: message.audioMessage, mimetype: message.audioMessage.mimetype || 'audio/mpeg', ptt: message.audioMessage.ptt || false, caption: '' };
    if (message.stickerMessage) return { type: 'sticker', mediaType: 'sticker', media: message.stickerMessage, mimetype: message.stickerMessage.mimetype || 'image/webp', caption: '' };
    if (message.documentMessage) return { type: 'document', mediaType: 'document', media: message.documentMessage, mimetype: message.documentMessage.mimetype || 'application/octet-stream', fileName: message.documentMessage.fileName || 'archivo', caption: message.documentMessage.caption || '' };
    return null;
}

// ==========================================
// 📥 DESCARGADOR SILENCIOSO
// ==========================================
async function streamToBuffer(stream) {
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
    return buffer;
}

async function downloadMediaBuffer(mediaInfo) {
    const stream = await downloadContentFromMessage(mediaInfo.media, mediaInfo.mediaType);
    const buffer = await streamToBuffer(stream);
    if (!buffer || buffer.length > MAX_MEDIA_BUFFER) return null; // Si pesa más de 60MB, no lo guarda en caché
    return buffer;
}

// ==========================================
// 💾 GUARDADO EN CACHÉ (Lo hace con cada mensaje nuevo)
// ==========================================
async function saveMessage(msg, remoteJid, sender, pushName) {
    const id = msg.key?.id;
    if (!id || !msg.message || isDeleteMessage(msg)) return;

    const message = unwrapMessage(msg.message);
    const media = getMediaInfo(message);
    let mediaBuffer = null;

    if (media) {
        try { mediaBuffer = await downloadMediaBuffer(media); } catch {}
    }

    const key = getMsgKey(remoteJid, id);

    deletedCache.set(key, {
        remoteJid,
        sender: cleanJid(sender),
        pushName: pushName || 'Usuario',
        message,
        mentions: getMessageMentions(message),
        media,
        mediaBuffer,
        text: getText(message),
        time: Date.now()
    });

    if (deletedCache.size > MAX_CACHE) {
        const first = deletedCache.keys().next().value;
        deletedCache.delete(first);
    }
}

function cleanOldCache() {
    const now = Date.now();
    for (const [key, value] of deletedCache.entries()) {
        if (now - value.time > CACHE_TIME) deletedCache.delete(key);
    }
}

// ==========================================
// 🕵️ PLUGIN PRINCIPAL
// ==========================================
module.exports = {
    commands: ['antidelete', 'antiborrar'],
    description: 'Atrapa y reenvía mensajes eliminados',

    // 🔥 EL EVENTO AUTOMÁTICO
    async onMessage(ctx) {
        const { sock, msg, remoteJid, sender, pushName, fromGroup, db } = ctx;

        try {
            cleanOldCache();

            // 1. Si no es un mensaje de "Borrar", lo guarda en la RAM por si acaso
            if (!isDeleteMessage(msg)) {
                await saveMessage(msg, remoteJid, sender, pushName);
                return;
            }

            // 2. Comprueba si el grupo tiene activado el Antidelete (En privado siempre está activo)
            const isEnabled = !fromGroup || await db.getGroupSetting(remoteJid, 'antidelete') === true;
            if (!isEnabled) return;

            // 3. Obtiene qué mensaje borraron
            const deletedKey = getDeletedKey(msg);
            const deletedId = deletedKey?.id;
            if (!deletedId) return;

            // Evita duplicados si WhatsApp envía el evento de borrado dos veces rápido
            const handledKey = getHandledKey(remoteJid, deletedId);
            if (handledDeletes.has(handledKey)) return;
            handledDeletes.add(handledKey);
            setTimeout(() => handledDeletes.delete(handledKey), 30 * 1000);

            // 4. Busca el mensaje borrado en la memoria RAM del bot
            const cacheKey = getMsgKey(remoteJid, deletedId);
            const saved = deletedCache.get(cacheKey);
            if (!saved) return; // Si era muy viejo o no se guardó, lo ignora

            const user = saved.sender;
            const text = saved.text || getText(saved.message);
            const media = saved.media || getMediaInfo(saved.message);
            const mentions = [...new Set([user, ...(saved.mentions || [])])];

            const captionHeader = `🕵️ *MENSAJE ELIMINADO*\n👤 *Por:* @${number(user)}`;

            // 5. REENVÍA EL MENSAJE SEGÚN SU TIPO
            if (!media) {
                if (text) {
                    await sock.sendMessage(remoteJid, { text: `${captionHeader}\n\n💬 *Mensaje:*\n${text}`, mentions });
                }
            } else {
                let buffer = saved.mediaBuffer;
                if (!buffer || !buffer.length) {
                    try { buffer = await downloadMediaBuffer(media); } catch {}
                }

                if (!buffer || !buffer.length) {
                    await sock.sendMessage(remoteJid, { text: `${captionHeader}\n\n⚠️ _El mensaje tenía un archivo pesado que no se pudo recuperar._${text ? `\n\n💬 *Texto adjunto:*\n${text}` : ''}`, mentions });
                } else {
                    const caption = `${captionHeader}${media.caption || text ? `\n\n💬 *Adjunto:*\n${media.caption || text}` : ''}`;

                    if (media.type === 'image') await sock.sendMessage(remoteJid, { image: buffer, mimetype: media.mimetype, caption, mentions });
                    else if (media.type === 'video') await sock.sendMessage(remoteJid, { video: buffer, mimetype: media.mimetype, caption, gifPlayback: media.gifPlayback || false, mentions });
                    else if (media.type === 'audio') {
                        await sock.sendMessage(remoteJid, { audio: buffer, mimetype: media.mimetype, ptt: media.ptt || false });
                        await sock.sendMessage(remoteJid, { text: captionHeader, mentions });
                    }
                    else if (media.type === 'sticker') {
                        await sock.sendMessage(remoteJid, { sticker: buffer });
                        await sock.sendMessage(remoteJid, { text: captionHeader, mentions });
                    }
                    else if (media.type === 'document') await sock.sendMessage(remoteJid, { document: buffer, mimetype: media.mimetype, fileName: media.fileName || 'archivo', caption, mentions });
                }
            }

            // Limpiamos la caché después de reenviarlo para no saturar memoria
            deletedCache.delete(cacheKey);

        } catch (err) {
            console.error('❌ Error en antidelete (onMessage):', err);
        }
    },

    // ⚙️ EL COMANDO PARA PRENDER O APAGAR EL SISTEMA
    async execute(ctx) {
        const { remoteJid, args, fromGroup, isAdmin, isOwner, db, reply } = ctx;

        if (!fromGroup) return reply('✅ En chats privados, el sistema *Antidelete* siempre está activo por seguridad.');
        if (!isOwner && !isAdmin) return reply('❌ *Acceso Denegado:* Solo los Administradores pueden cambiar este ajuste.');

        const option = String(args[0] || '').toLowerCase();

        if (option === 'on' || option === 'off') {
            const state = option === 'on';
            await db.setGroupSetting(remoteJid, 'antidelete', state);
            return reply(`🕵️ Sistema Antidelete *${state ? 'ACTIVADO ✅' : 'DESACTIVADO ❌'}* en este grupo.`);
        }

        const enabled = await db.getGroupSetting(remoteJid, 'antidelete');
        return reply(`🕵️ *ESTADO DEL ANTIDELETE*\n\nActualmente está: *${enabled ? 'Activado ✅' : 'Desactivado ❌'}*\n\n_Para cambiarlo usa:_\n> .antidelete on\n> .antidelete off`);
    }
};
