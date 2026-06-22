'use strict';

const FEATURES = [
    'bot',
    'audios',
    'welcome',
    'antilink',
    'antispam',
    'chatbot'
];

function cleanJid(jid = '') {
    return String(jid).split(':')[0];
}

module.exports = {
    // 🔥 Escucha ambos comandos en un solo archivo
    commands: ['enable', 'disable', 'on', 'off'],
    description: 'Activa o desactiva funciones del bot',

    async execute(ctx) {
        const { remoteJid, sender, args, command, fromGroup, isOwner, isAdmin, db, reply } = ctx;

        // 1. Determinar la acción (¿Activar o Desactivar?)
        const cmd = command.toLowerCase();
        const isEnable = cmd === 'enable' || cmd === 'on';
        const actionText = isEnable ? 'Activado ✅' : 'Desactivado ❌';

        const feature = (args[0] || '').toLowerCase();

        // 2. Menú visual si no pone qué función cambiar o pone una inválida
        if (!feature || !FEATURES.includes(feature)) {
            return reply(
`⚙️ *PANEL DE CONFIGURACIÓN*

Uso correcto:
> .${cmd} [opción]

📋 *Funciones disponibles:*
${FEATURES.map(f => `➤ ${f}`).join('\n')}`
            );
        }

        // 3. 🌐 CHATBOT GLOBAL (Exclusivo del Owner)
        if (feature === 'chatbot') {
            if (!isOwner) return reply('❌ *Acceso Denegado:* Solo el creador del bot puede modificar el Chatbot Global.');
            
            await db.setGlobalSetting('chatbot', isEnable);
            return reply(`🌐 *Chatbot Inteligente:* ${actionText}\n_El ajuste se aplicó globalmente para todos los chats._`);
        }

        // 4. VERIFICACIÓN DE PERMISOS GENERALES
        // Si no es el Owner ni tampoco un Admin del grupo, se bloquea.
        if (!isOwner && !isAdmin) {
            return reply('❌ *Acceso Denegado:* Necesitas ser Administrador o Creador para cambiar la configuración.');
        }

        // 5. 👤 AJUSTES EN CHAT PRIVADO
        if (!fromGroup) {
            if (!['bot', 'audios'].includes(feature)) {
                return reply('❌ En el chat privado solo puedes configurar:\n➤ bot\n➤ audios');
            }

            const userKey = cleanJid(sender);
            await db.setUserSetting(userKey, feature, isEnable);

            return reply(`👤 *Ajuste Privado actualizado:*\n${feature.toUpperCase()} ➔ ${actionText}`);
        }

        // 6. 👥 AJUSTES EN GRUPOS
        await db.setGroupSetting(remoteJid, feature, isEnable);
        
        return reply(`👥 *Ajuste del Grupo actualizado:*\n${feature.toUpperCase()} ➔ ${actionText}`);
    }
};
