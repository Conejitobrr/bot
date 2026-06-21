'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ENV_PATH = path.join(process.cwd(), '.env');
const IS_CLOUD = process.env.NODE_ENV === 'production' || process.env.PM2_HOME || process.env.SERVER_MODE === 'true';

// ─────────────────────────────────────────
// 📦 GESTOR DE VERSIONES
// ─────────────────────────────────────────
function bumpVersion(version = '1.0.0') {
  let [major, minor, patch] = String(version).split('.').map(n => parseInt(n, 10));

  major = Number.isFinite(major) ? major : 1;
  minor = Number.isFinite(minor) ? minor : 0;
  patch = Number.isFinite(patch) ? patch : 0;

  patch++;
  if (patch > 9) { patch = 0; minor++; }
  if (minor > 9) { minor = 0; major++; }

  return `${major}.${minor}.${patch}`;
}

function getCurrentVersion() {
  if (process.env.BOT_VERSION) return process.env.BOT_VERSION;
  try {
    delete require.cache[require.resolve('../config')];
    const config = require('../config');
    return config.botVersion || '1.0.0';
  } catch { return '1.0.0'; }
}

function updateEnvVersion() {
  const oldVersion = getCurrentVersion();
  const newVersion = bumpVersion(oldVersion);
  let envContent = '';

  if (fs.existsSync(ENV_PATH)) envContent = fs.readFileSync(ENV_PATH, 'utf8');

  if (/^BOT_VERSION\s*=/m.test(envContent)) {
    envContent = envContent.replace(/^BOT_VERSION\s*=.*$/m, `BOT_VERSION=${newVersion}`);
  } else {
    if (envContent && !envContent.endsWith('\n')) envContent += '\n';
    envContent += `BOT_VERSION=${newVersion}\n`;
  }

  fs.writeFileSync(ENV_PATH, envContent);
  process.env.BOT_VERSION = newVersion;

  try { delete require.cache[require.resolve('../config')]; } catch {}
  return { oldVersion, newVersion };
}

// ─────────────────────────────────────────
// 🚀 COMANDO DE ACTUALIZACIÓN
// ─────────────────────────────────────────
module.exports = {
  commands: ['update', 'actualizar'],

  async execute(ctx) {
    const { sock, remoteJid, msg, isOwner } = ctx;

    if (!isOwner) {
      return sock.sendMessage(remoteJid, { text: '❌ Acceso denegado. Solo el Creador puede modificar el código fuente.' }, { quoted: msg });
    }

    try {
      const msgWait = await sock.sendMessage(remoteJid, { text: '🔄 *Conectando con GitHub...*\nDescargando actualizaciones...' }, { quoted: msg });

      const oldCommit = execSync('git rev-parse HEAD').toString().trim();
      
      // Descargamos los cambios
      execSync('git pull', { stdio: 'pipe' });
      
      const newCommit = execSync('git rev-parse HEAD').toString().trim();

      if (oldCommit === newCommit) {
        return sock.sendMessage(remoteJid, { text: '✅ El sistema ya se encuentra en la versión más reciente.', edit: msgWait.key });
      }

      // Analizamos qué archivos cambiaron
      const diff = execSync(`git diff --name-only ${oldCommit} ${newCommit}`).toString().trim();
      const changes = diff ? diff.split('\n') : [];

      const mediaFiles = changes.filter(f => f.startsWith('media/'));
      const pluginFiles = changes.filter(f => f.startsWith('plugins/') || f.startsWith('plugin/'));
      const coreFiles = changes.filter(f => !f.startsWith('media/') && !f.startsWith('plugins/') && !f.startsWith('plugin/'));

      // Si se modificó package.json, instalamos nuevas librerías
      if (coreFiles.includes('package.json')) {
        execSync('npm install', { stdio: 'pipe' });
      }

      const versionInfo = updateEnvVersion();
      
      let report = `✅ *ACTUALIZACIÓN COMPLETADA*\n\n`;
      report += `📦 *Anterior:* v${versionInfo.oldVersion}\n`;
      report += `🚀 *Nueva:* v${versionInfo.newVersion}\n\n`;

      if (mediaFiles.length) {
        report += '🎵 *Multimedia agregada:*\n' + mediaFiles.map(f => `➤ ${f}`).join('\n') + '\n\n';
      }
      if (pluginFiles.length) {
        report += '⚙️ *Plugins actualizados:*\n' + pluginFiles.map(f => `➤ ${f}`).join('\n') + '\n\n';
      }
      if (coreFiles.length) {
        report += '🧠 *Núcleo modificado:*\n' + coreFiles.map(f => `➤ ${f}`).join('\n') + '\n\n';
      }

      // 🔥 LÓGICA DE REINICIO INTELIGENTE
      if (coreFiles.length > 0) {
        if (IS_CLOUD) {
          report += '🔄 *Se detectaron cambios profundos.*\n_Reiniciando el motor principal (PM2)..._ Vuelvo en 2 segundos.';
          await sock.sendMessage(remoteJid, { text: report, edit: msgWait.key });
          
          // Apagamos el bot. PM2 lo encenderá inmediatamente con el código nuevo.
          setTimeout(() => process.exit(0), 1500); 
          return;
        } else {
          report += '⚠️ *Se detectaron cambios profundos.*\n_Como estás en Modo Local, debes reiniciar el bot manualmente en tu consola_ (Ctrl+C y volver a iniciar) para aplicar los cambios del núcleo.';
          await sock.sendMessage(remoteJid, { text: report, edit: msgWait.key });
          return;
        }
      } else {
        // Si solo fueron plugins o fotos, recargamos en caliente sin apagar el bot
        if (global.loadPlugins) global.loadPlugins();
        report += '♻️ *Plugins recargados en caliente.*\n_No fue necesario reiniciar el sistema._';
        await sock.sendMessage(remoteJid, { text: report, edit: msgWait.key });
        return;
      }

    } catch (e) {
      console.error(e);
      await sock.sendMessage(remoteJid, { text: `❌ *Error crítico al actualizar:*\n\n${e.message || 'Fallo desconocido'}` }, { quoted: msg });
    }
  }
};
