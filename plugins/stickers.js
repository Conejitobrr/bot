'use strict';

const fs = require('fs').promises;
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const db = require('../lib/database');
const config = require('../config');

const execFileAsync = promisify(execFile);
const TEMP_DIR = path.join(process.cwd(), 'temp');

async function ensureTemp() {
  try { await fs.mkdir(TEMP_DIR, { recursive: true }); } catch {}
}

// ─────────────────────────────────────────
// 🛠️ UTILIDADES DE STICKER
// ─────────────────────────────────────────
async function downloadMedia(media, downloadType) {
  const stream = await downloadContentFromMessage(media, downloadType);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function makeSticker(input, output, isImage) {
  const args = isImage
    ? ['-y', '-i', input, '-vf', 'scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000', '-vcodec', 'libwebp', '-q:v', '60', '-compression_level', '6', '-loop', '0', output]
    : ['-y', '-i', input, '-t', '5', '-vf', 'scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos,fps=10,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000', '-vcodec', 'libwebp', '-fs', '700k', '-loop', '0', '-an', output];
  await execFileAsync('ffmpeg', args);
}

function createExif() {
  const json = {
    'sticker-pack-id': 'com.siriusbot.sticker',
    'sticker-pack-name': config.botName,
    'sticker-pack-publisher': 'SiriusBot',
    emojis: ['🤖', '⚡']
  };
  const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
  const exifHeader = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
  exifHeader.writeUIntLE(jsonBuffer.length, 14, 4);
  return Buffer.concat([exifHeader, jsonBuffer]);
}

async function addMetadata(input, output, exifPath) {
  await fs.writeFile(exifPath, createExif());
  await execFileAsync('webpmux', ['-set', 'exif', exifPath, input, '-o', output]);
}

// ─────────────────────────────────────────
// 🚀 COMANDO PRINCIPAL
// ─────────────────────────────────────────
module.exports = {
  commands: ['s', 'sticker', 'stiker'],

  async execute(ctx) {
    const { sock, msg, remoteJid, sender } = ctx;
    
    // Obtener contenido (incluye respuesta a mensaje)
    const m = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage || msg.message;
    const type = Object.keys(m || {})[0];
    const media = m[type]?.message ? m[type].message[Object.keys(m[type].message)[0]] : m[type];

    if (!media || (!media.url && !media.mediaKey)) {
      return ctx.reply('❌ Envía o responde a una imagen o video.');
    }

    const id = `${Date.now()}`;
    const input = path.join(TEMP_DIR, `in_${id}.tmp`);
    const output = path.join(TEMP_DIR, `out_${id}.webp`);
    const exif = path.join(TEMP_DIR, `exif_${id}.tmp`);
    const final = path.join(TEMP_DIR, `final_${id}.webp`);

    try {
      await ensureTemp();
      const buffer = await downloadMedia(media, type === 'videoMessage' ? 'video' : 'image');
      await fs.writeFile(input, buffer);

      await makeSticker(input, output, type === 'imageMessage');
      await addMetadata(output, final, exif);

      const sticker = await fs.readFile(final);
      await sock.sendMessage(remoteJid, { sticker }, { quoted: msg });
      
      await db.addXP(sender, 50); // XP por crear sticker
    } catch (e) {
      console.error(e);
      ctx.reply('❌ Error al procesar el sticker.');
    } finally {
      // Limpieza asíncrona
      [input, output, exif, final].forEach(f => fs.unlink(f).catch(() => {}));
    }
  }
};
