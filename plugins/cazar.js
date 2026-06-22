'use strict';

const esperar = (ms) => new Promise(resolve => setTimeout(resolve, ms));
let shop;
try { shop = require('../lib/shop'); } catch (e) { shop = { getInventory: async () => ({}) }; }

// 🔥 CANDADO ANTI-SPAM
const enUso = new Set();

function cleanJid(jid = '') { return String(jid).split(':')[0]; }
function number(jid = '') { return cleanJid(jid).split('@')[0].replace(/\D/g, ''); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randXP(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

// ==========================================
// 🏹 DICCIONARIOS DE VARIEDAD (CAZA AMPLIADA)
// ==========================================
const cazaLegendaria = [
    '🐉 ¡MÍTICO! Lograste abatir a un *Dragón Ancestral* que aterrorizaba la región.',
    '🦄 ¡Increíble! Encontraste un *Unicornio Mágico* y te regaló parte de su magia por dejarlo ir.',
    '🦖 Viajaste en el tiempo y cazaste a un mismísimo *T-Rex*.',
    '🦍 Te adentraste en la nieve y lograste capturar al *Yeti*.',
    '🦇 ¡Sobreviviste a la noche! Cazaste al temible *Chupacabras*.',
    '🦅 En lo alto de la montaña, lograste atrapar a un *Grifo Mitológico*.',
    '🐙 Viajaste a mar abierto y lograste arponear a las crías de un *Kraken*.',
    '🐍 Sobreviviste a la mirada de un *Basilisco* y lograste derrotarlo.',
    '🔥 Encontraste las plumas de un *Ave Fénix* recién renacido.',
    '🐺 Cazaste a un legendario *Hombre Lobo* durante la luna llena.',
    '🌌 Te adentraste en una grieta extraña y lograste abatir a un *Demogorgon* del mismísimo mundo al revés.',
    '🦁 Derrotaste al invulnerable *León de Nemea* y tomaste su piel como trofeo.'
];

const cazaEpica = [
    '🐻 Te enfrentaste cuerpo a cuerpo contra un enorme *Oso Pardo*.',
    '🐅 Tuviste una puntería perfecta y cazaste a un *Tigre de Bengala*.',
    '🦁 Te convertiste en el rey de la selva al cazar a un *León Africano*.',
    '🐊 Te metiste al pantano y cazaste a un *Cocodrilo del Nilo* gigante.',
    '🐆 Fuiste más rápido que un *Leopardo* y te quedaste con su piel.',
    '🦏 Lograste derribar a un pesado *Rinoceronte Negro*.',
    '🦍 Derrotaste en su territorio a un *Gorila Espalda Plateada*.',
    '🐍 Tuviste que luchar por horas para cazar una *Anaconda Gigante*.',
    '🐺 Rastreaste a la manada y lograste cazar al *Lobo Alfa*.',
    '🐘 Sobreviviste a la estampida y atrapaste a un *Elefante Salvaje*.',
    '🦅 Lograste abatir a una imponente *Águila Arpía* en pleno vuelo.',
    '🐃 Derribaste a un *Búfalo Cafre* que amenazaba el campamento.'
];

const cazaNormal = [
    '🦌 Apuntaste con calma y cazaste un *Venado de Cola Blanca*.',
    '🐇 Fuiste silencioso y atrapaste a un par de *Conejos de Campo*.',
    '🐗 Te subiste a un árbol y cazaste a un *Jabalí Salvaje*.',
    '🦆 Te escondiste en los arbustos y cazaste un *Pato Silvestre*.',
    '🦃 Tuviste suerte y cazaste un *Pavo Gordo* para la cena.',
    '🦊 Viste un movimiento rápido y lograste cazar a un *Zorro Escurridizo*.',
    '🦡 Tuviste una pelea difícil, pero lograste cazar un *Tejón*.',
    '🐿️ Solo conseguiste cazar unas cuantas *Ardillas Gordas*.',
    '🦝 Cazaste a un *Mapache* que intentaba robarte la comida.',
    '🦎 Atrapaste a una gran *Iguana* escondida en las rocas.',
    '🦔 Atrapaste a un *Puercoespín*, pero te pinchaste un poco.',
    '🏜️ Atrapaste un *Armadillo* rodando por el desierto.',
    '🐐 Escalaste la montaña y lograste cazar una *Cabra Montesa*.'
];

const cazaBasura = [
    '🌳 Viste una sombra gigante, disparaste... y era un *tronco de árbol*.',
    '🪨 Creíste ver a una tortuga gigante, pero le disparaste a una *roca redonda*.',
    '💨 Ibas a disparar, pero te dio alergia, *estornudaste*, y todos los animales huyeron.',
    '🔫 Tu presa estaba en la mira, pero tu *arma se atascó*.',
    '🏃‍♂️ Pisaste una rama seca, el animal te vio y *salió corriendo a toda velocidad*.',
    '📸 En lugar de disparar tu rifle, por error sacaste tu celular y le *tomaste una foto*.',
    '🐶 Apuntaste con fiereza pero resultó ser el *perro callejero* del vecindario.',
    '🎃 Disparaste a lo lejos y destruiste un *espantapájaros* de un granjero.',
    '🐿️ Te asustó una *ardilla* que te saltó a la cara y tiraste el arma.',
    '💩 Pisaste estiércol de oso, resbalaste y ahuyentaste a toda la fauna.',
    '🛑 Disparaste a algo brillante y resultó ser una *señal de tránsito abandonada*.'
];

const cazaCastigo = [
    '🐍 Caminabas distraído y pisaste una *Víbora Venenosa*. Pagaste antídotos carísimos.',
    '🐻 Le disparaste a un osito, pero apareció su mamá y *tuviste que huir tirando tu dinero*.',
    '🕳️ Ibas caminando hacia atrás y *caíste en una trampa de cazadores*.',
    '🦌 Un venado que creías muerto se levantó y *te dio una patada en la cara*.',
    '🐝 Te apoyaste en un árbol equivocado y *pateaste un panal de abejas asesinas*.',
    '🐗 Un jabalí te embistió por la espalda y *rompió todo tu equipo de caza*.',
    '🐒 Un mono bajó de un árbol, te golpeó y *se robó tu billetera*.',
    '🦨 Un zorrillo te roció. Apestabas tanto que *pagaste una fortuna en jabones especiales*.',
    '🕷️ Te picó una enorme *Viuda Negra*. Los gastos médicos te dejaron pobre.',
    '🚁 Te perdiste en medio del bosque y *tuviste que pagar un helicóptero de rescate*.',
    '👮‍♂️ El guardabosques te atrapó *cazando en reserva natural* y te multó severamente.'
];

module.exports = {
    commands: ['cazar', 'hunt'],
    description: 'Ve de cacería para ganar o perder experiencia.',
    
    async execute(ctx) {
        const { sock, remoteJid, sender, db, reply, fromGroup } = ctx;

        if (!fromGroup) return reply('❌ Este comando es más divertido y funciona mejor en grupos.');

        const userKey = cleanJid(sender);
        if (enUso.has(userKey)) return;

        const userData = await db.getUser(userKey);
        const now = Date.now();
        const cooldown = 5 * 60 * 1000; 

        const remaining = cooldown - (now - (userData.lastCazar || 0));

        if (remaining > 0) {
            const m = Math.floor(remaining / 60000);
            const s = Math.floor((remaining % 60000) / 1000);
            return reply(`⏳ Tus presas están escondidas. Debes esperar *${m}m ${s}s* para volver a cazar.`);
        }

        enUso.add(userKey);
        await db.setUser(userKey, { lastCazar: now });

        try {
            // Carga segura del inventario
            let inv = {};
            try { inv = await shop.getInventory(userKey); } catch (e) { inv = {}; }

            let multiplicador = (inv.arma_pro || 0) > 0 ? 1.5 : 1;
            let avisoPro = multiplicador > 1 ? '\n🏹 *¡Tu Arma Profesional te dio un bono del 50%!*' : '';

            // ==========================================
            // ANIMACIÓN DE CAZA
            // ==========================================
            let msg = await sock.sendMessage(remoteJid, { text: `🌳 @${number(sender)} se adentra en lo profundo del bosque con su arma lista...`, mentions: [userKey] });
            await esperar(3000);
            try { await sock.sendMessage(remoteJid, { text: `🐾 *¡CRACK!* Se escucha una rama romperse...\n@${number(sender)} contiene la respiración y apunta 🎯`, edit: msg.key, mentions: [userKey] }); } catch (e) {}
            await esperar(3000);

            // ==========================================
            // MATEMÁTICAS Y PROBABILIDADES
            // ==========================================
            let rand = Math.random() * 100;
            let critico = Math.random() < 0.10; // 10% de probabilidad de Tiro a la Cabeza (x2)
            let premio = 0;
            let resultadoTxt = '';
            let textoCritico = critico ? `\n💥 *¡TIRO PERFECTO A LA CABEZA! Tu XP se ha duplicado.*` : '';

            if (rand < 5) { 
                premio = Math.floor(randXP(4000, 6000) * multiplicador); 
                if (critico) premio *= 2;
                resultadoTxt = `${pick(cazaLegendaria)}${avisoPro}${textoCritico}\n💰 Recompensa: *+${premio.toLocaleString()} XP*.`;
            } else if (rand < 20) { 
                premio = Math.floor(randXP(1500, 2500) * multiplicador); 
                if (critico) premio *= 2;
                resultadoTxt = `${pick(cazaEpica)}${avisoPro}${textoCritico}\n💰 Recompensa: *+${premio.toLocaleString()} XP*.`;
            } else if (rand < 70) { 
                premio = Math.floor(randXP(400, 1000) * multiplicador);  
                if (critico) premio *= 2;
                resultadoTxt = `${pick(cazaNormal)}${avisoPro}${textoCritico}\n💰 Recompensa: *+${premio.toLocaleString()} XP*.`;
            } else if (rand < 90) { 
                resultadoTxt = `${pick(cazaBasura)}\n💸 No ganas nada de XP.`;
            } else { 
                let castigo = randXP(500, 1000);
                if ((userData.xp || 0) < castigo) castigo = userData.xp || 0; 
                await db.removeXP(userKey, castigo);
                resultadoTxt = `${pick(cazaCastigo)}\n❌ Perdiste: *-${castigo.toLocaleString()} XP*.`;
            }

            // ==========================================
            // SINERGIA DE MASCOTA RASTREADORA
            // ==========================================
            if (premio > 0 && userData.pet && userData.pet.name) {
                if (Math.random() < 0.25) { 
                    let bonoMascota = Math.floor(premio * 0.20); 
                    premio += bonoMascota;
                    resultadoTxt += `\n✨ ¡Tu mascota *${userData.pet.name}* rastreó el área y encontró *+${bonoMascota.toLocaleString()} XP* extra que se te había caído!`;
                }
            }

            // Entregar el premio
            if (premio > 0) {
                await db.addXP(userKey, premio);
            }

            // ==========================================
            // RESULTADO FINAL
            // ==========================================
            let finalMsg = `*RESULTADO DE LA CACERÍA* 🏹\n\n${resultadoTxt}\n👤 Cazador: @${number(sender)}`;
            
            try { await sock.sendMessage(remoteJid, { text: finalMsg, edit: msg.key, mentions: [userKey] }); } 
            catch (e) { await sock.sendMessage(remoteJid, { text: finalMsg, mentions: [userKey] }); }

        } finally {
            enUso.delete(userKey);
        }
    }
};
