'use strict';

const ytdl = require('@distube/ytdl-core');
const yts = require('yt-search');
const fs = require('fs');
const path = require('path');

// ⏱️ SISTEMA DE COOLDOWN POR USUARIO
const cooldowns = new Map();
const COOLDOWN_TIME = 60000; // 60 segundos (1 minuto exacto)

// Asegurarnos de que exista la carpeta temporal para guardar los audios antes de enviarlos
const TEMP_DIR = path.join(process.cwd(), 'temp');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

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
      // Reacción de "cargando"
      await sock.sendMessage(remoteJid, { react: { text: '⏳', key: msg.key } });

      // 2. 🔍 BÚSQUEDA DEL VIDEO (Por nombre o enlace)
      let videoInfo;
      if (query.includes('youtube.com') || query.includes('youtu.be')) {
        const videoId = ytdl.getVideoID(query);
        const searchRes = await yts({ videoId });
        videoInfo = searchRes;
      } else {
        const search = await yts(query);
        if (!search.videos.length) return reply('❌ No encontré ningún resultado para esa búsqueda.');
        videoInfo = search.videos[0];
      }

      if (!videoInfo) return reply('❌ Error al obtener la información de la canción.');

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

      // 4. ⬇️ DESCARGA DEL AUDIO
      const id = Date.now();
      const filePath = path.join(TEMP_DIR, `play_${id}.mp3`);
      
      const stream = ytdl(videoInfo.url, { filter: 'audioonly', quality: 'highestaudio' });
      const file = fs.createWriteStream(filePath);
      
      stream.pipe(file);

      // 5. 📤 ENVÍO DEL ARCHIVO
      file.on('finish', async () => {
        await sock.sendMessage(remoteJid, {
          audio: { url: filePath },
          mimetype: 'audio/mpeg',
          ptt: false // false = Documento de audio normal. Si quieres que sea Nota de Voz, ponlo en true.
        }, { quoted: msg });

        // 🔥 REGISTRAMOS EL COOLDOWN JUSTO DESPUÉS DE ENVIAR LA CANCIÓN
        cooldowns.set(sender, Date.now());
        
        // Reacción de "listo"
        await sock.sendMessage(remoteJid, { react: { text: '✅', key: msg.key } });
        
        // Borramos el archivo pesado del servidor para no saturar la memoria
        try { fs.unlinkSync(filePath); } catch (e) {}
      });

      file.on('error', (err) => {
        console.error('Error al guardar el audio:', err);
        reply('❌ Hubo un error al procesar el archivo. Intenta de nuevo.');
        try { fs.unlinkSync(filePath); } catch (e) {}
      });

    } catch (e) {
      console.error('Error en play.js:', e);
      reply('❌ Hubo un fallo general al intentar descargar la canción. Puede que el enlace esté roto o bloqueado.');
    }
  }
};
