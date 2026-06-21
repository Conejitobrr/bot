'use strict';

const yts = require('yt-search');

// ⏱️ SISTEMA DE COOLDOWN POR USUARIO
const cooldowns = new Map();
const COOLDOWN_TIME = 60000; // 60 segundos (1 minuto)

module.exports = {
  commands: ['play', 'p', 'audio', 'musica'],
  description: 'Descarga música de YouTube',

  async execute(ctx) {
    const { sock, remoteJid, sender, msg, args, reply } = ctx;

    // 1. 🛡️ VERIFICAR COOLDOWN INDIVIDUAL
    const now = Date.now();
    const lastUsed = cooldowns.get(sender) || 0;
    
    if (now - lastUsed < COOLDOWN_TIME) {
      const waitTime = Math.ceil((COOLDOWN_TIME - (now - lastUsed)) / 1000);
      return reply(`⏳ *¡Tranquilo!*\nPara evitar reportes de spam por parte de WhatsApp, debes esperar *${waitTime} segundos* antes de pedir otra canción.`);
    }

    const query = args.join(' ');
    if (!query) {
      return reply('❌ *Dime qué canción quieres buscar.*\nEjemplo: `.play Alan Walker Faded` o pega un enlace directo.');
    }

    try {
      await sock.sendMessage(remoteJid, { react: { text: '⏳', key: msg.key } });

      // 2. 🔍 BÚSQUEDA DEL VIDEO
      const search = await yts(query);
      const videoInfo = search.videos.length ? search.videos[0] : null;

      if (!videoInfo) {
          await sock.sendMessage(remoteJid, { react: { text: '❌', key: msg.key } });
          return reply('❌ No encontré ningún resultado para esa búsqueda.');
      }

      // 3. 🖼️ TARJETA VISUAL DE CONFIRMACIÓN
      const infoTxt = `🎧 *DESCARGANDO MÚSICA* 🎧\n\n📌 *Título:* ${videoInfo.title}\n👤 *Canal:* ${videoInfo.author.name}\n⏱️ *Duración:* ${videoInfo.timestamp}\n\n_Tu canción se enviará en un momento..._`;
      
      await sock.sendMessage(remoteJid, {
        text: infoTxt,
        contextInfo: {
          externalAdReply: {
            title: videoInfo.title,
            body: 'SiriusBot Play',
            thumbnailUrl: videoInfo.thumbnail,
            mediaType: 1,
            renderLargerThumbnail: true
          }
        }
      }, { quoted: msg });

      // 4. 🌐 DESCARGA MEDIANTE API EXTERNA (Anti-Bloqueos de YouTube)
      let audioUrl = null;
      
      // Intento 1: API Principal
      try {
        const res1 = await fetch(`https://api.siputzx.my.id/api/d/ytmp3?url=${videoInfo.url}`);
        const data1 = await res1.json();
        if (data1?.data?.dl) audioUrl = data1.data.dl;
      } catch (e) {}

      // Intento 2: API Secundaria de Respaldo (Por si la primera falla)
      if (!audioUrl) {
        try {
          const res2 = await fetch(`https://api.ryzendesu.vip/api/downloader/ytmp3?url=${videoInfo.url}`);
          const data2 = await res2.json();
          if (data2?.url) audioUrl = data2.url;
        } catch (e) {}
      }

      if (!audioUrl) {
         await sock.sendMessage(remoteJid, { react: { text: '❌', key: msg.key } });
         return reply('❌ Los servidores de descarga están saturados. Intenta de nuevo en unos minutos.');
      }

      // 5. 📤 ENVÍO DIRECTO A WHATSAPP
      await sock.sendMessage(remoteJid, {
        audio: { url: audioUrl },
        mimetype: 'audio/mpeg',
        ptt: false 
      }, { quoted: msg });

      // 🔥 REGISTRAMOS EL COOLDOWN
      cooldowns.set(sender, Date.now());
      
      // Reacción de éxito
      await sock.sendMessage(remoteJid, { react: { text: '✅', key: msg.key } });

    } catch (e) {
      console.error('Error en play.js:', e);
      await sock.sendMessage(remoteJid, { react: { text: '❌', key: msg.key } });
      reply('❌ Hubo un fallo general al intentar descargar la canción.');
    }
  }
};
