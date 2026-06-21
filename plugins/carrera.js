'use strict';

// Guardamos las carreras activas en memoria
const carreras = {};
const esperar = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Extraída de tu robaxp.js para mantener el mismo formato de ID
function cleanJid(jid = '') {
    return String(jid).split(':')[0];
}

// Función para obtener solo el número y formatear la mención
function number(jid = '') {
    return cleanJid(jid)
        .split('@')[0]
        .replace(/\D/g, '');
}

module.exports = {
    commands: ['carrera', 'unirse'],
    execute: async ({ sock, remoteJid, sender, pushName, args, command, db, reply, fromGroup }) => {
        
        if (!fromGroup) {
            return reply('❌ Este comando solo funciona en grupos.');
        }

        const userKey = cleanJid(sender);
        const userData = await db.getUser(userKey);

        // ==========================================
        // COMANDO: .carrera
        // ==========================================
        if (command === 'carrera') {
            if (carreras[remoteJid]) {
                return reply('⚠️ Ya hay una carrera organizándose o corriendo en este grupo.');
            }

            let apuesta = 0;

            // Si el usuario puso un número (ej. .carrera 500)
            if (args[0]) {
                apuesta = parseInt(args[0]);
                
                if (isNaN(apuesta) || apuesta <= 0) {
                    return reply('🏁 Debes ingresar una cantidad válida si quieres apostar.\n\nEjemplos:\n*.carrera* (para jugar por diversión)\n*.carrera 500* (para apostar 500 XP)');
                }

                if ((userData.xp || 0) < apuesta) {
                    return reply(`❌ No tienes suficiente experiencia para esta apuesta.\nTu XP actual es: *${userData.xp || 0}*`);
                }

                // Descontamos la XP inmediatamente
                await db.removeXP(userKey, apuesta);
            }

            // Registramos la carrera (usamos cleanJid(sender) para la mención)
            carreras[remoteJid] = {
                estado: 'esperando',
                apuesta: apuesta,
                participantes: [{ id: cleanJid(sender), userKey: userKey, nombre: pushName || 'Jugador', posicion: 0 }],
                longitudPista: 12
            };

            // Construir el mensaje dependiendo de si hay apuesta o no
            let msgInicial = `🏁 ¡Se ha iniciado una carrera de caballos!\n\n`;
            if (apuesta > 0) {
                msgInicial += `💰 Apuesta fijada: *${apuesta} XP*\n\n`;
            } else {
                msgInicial += `🎮 *Carrera amistosa* (Sin apuestas)\n\n`;
            }
            msgInicial += `⏳ Tienen 2 minutos para unirse escribiendo *.unirse*`;

            reply(msgInicial);

            // Temporizador de 2 minutos (120,000 ms)
            setTimeout(async () => {
                let carrera = carreras[remoteJid];
                if (!carrera) return; 

                if (carrera.participantes.length === 1) {
                    await sock.sendMessage(remoteJid, { text: "🤖 SiriusBot no encontró rivales.\n\n🐎 Entraré yo mismo a la carrera.\n\n🏁 ¡Que empiece la competencia!" });
                    carrera.participantes.push({ id: 'bot', userKey: 'bot', nombre: 'SiriusBot', posicion: 0 });
                    await esperar(2000);
                } else {
                    await sock.sendMessage(remoteJid, { text: "🏁 ¡Tiempo de inscripción agotado! Que empiece la competencia." });
                    await esperar(1500);
                }

                carrera.estado = 'corriendo';
                await animarCarrera(sock, remoteJid, db);
                
            }, 120000);
        }

        // ==========================================
        // COMANDO: .unirse
        // ==========================================
        if (command === 'unirse') {
            let carrera = carreras[remoteJid];
            
            if (!carrera || carrera.estado !== 'esperando') {
                return reply('⚠️ No hay ninguna carrera en fase de inscripción ahora mismo.');
            }

            if (carrera.participantes.find(p => p.id === cleanJid(sender))) {
                return reply('⚠️ Ya estás inscrito en esta carrera.');
            }

            // Si la carrera tiene apuesta, validamos y cobramos
            if (carrera.apuesta > 0) {
                if ((userData.xp || 0) < carrera.apuesta) {
                    return reply(`❌ No tienes suficiente XP para igualar la apuesta de *${carrera.apuesta} XP*.\nTu XP actual es: *${userData.xp || 0}*`);
                }
                await db.removeXP(userKey, carrera.apuesta);
                
                await sock.sendMessage(remoteJid, {
                    text: `🐎 @${number(sender)} se ha unido a la carrera apostando *${carrera.apuesta} XP*.`,
                    mentions: [cleanJid(sender)]
                });
            } else {
                await sock.sendMessage(remoteJid, {
                    text: `🐎 @${number(sender)} se ha unido a la carrera amistosa.`,
                    mentions: [cleanJid(sender)]
                });
            }
            
            carrera.participantes.push({ id: cleanJid(sender), userKey: userKey, nombre: pushName || 'Jugador', posicion: 0 });
        }
    }
};

// ==========================================
// MOTOR DE ANIMACIÓN Y RESULTADOS
// ==========================================
async function animarCarrera(sock, remoteJid, db) {
    let carrera = carreras[remoteJid];
    let hayGanador = false;
    let mensajeId = null;

    let pozoTotal = carrera.apuesta * carrera.participantes.length;
    
    // Filtramos al bot para obtener solo los JIDs de jugadores reales
    let arrayMenciones = carrera.participantes.filter(p => p.id !== 'bot').map(p => p.id);

    while (!hayGanador) {
        let textoFrame = `🏁 *CARRERA DE CABALLOS*\n`;
        
        if (carrera.apuesta > 0) {
            textoFrame += `💰 Pozo en juego: *${pozoTotal} XP*\n\n`;
        } else {
            textoFrame += `🎮 Carrera Amistosa\n\n`;
        }

        for (let p of carrera.participantes) {
            p.posicion += Math.floor(Math.random() * 3);
            
            if (p.posicion >= carrera.longitudPista) {
                p.posicion = carrera.longitudPista;
                hayGanador = true;
            }

            let izquierda = Math.max(0, carrera.longitudPista - p.posicion);
            let derecha = Math.max(0, p.posicion);
            
            // Asignamos la mención si es jugador, o el nombre normal si es el bot
            let tagNombre = p.id === 'bot' ? 'SiriusBot' : `@${number(p.id)}`;
            
            textoFrame += `🏁${'─'.repeat(izquierda)}🐎${'─'.repeat(derecha)} ${tagNombre}\n`;
        }

        if (!mensajeId) {
            let msg = await sock.sendMessage(remoteJid, { 
                text: textoFrame,
                mentions: arrayMenciones 
            });
            mensajeId = msg.key;
        } else {
            try {
                await sock.sendMessage(remoteJid, { 
                    text: textoFrame, 
                    edit: mensajeId,
                    mentions: arrayMenciones 
                });
            } catch (err) {
                // Se ignora el error si falla la edición por latencia
            }
        }

        await esperar(1500); 
    }

    let ganadores = carrera.participantes.filter(p => p.posicion >= carrera.longitudPista);
    let textoFinal = "🏆 *¡LA CARRERA HA TERMINADO!*\n\n";

    // Si hubo apuestas
    if (carrera.apuesta > 0) {
        let premioPorGanador = Math.floor(pozoTotal / ganadores.length);

        if (ganadores.some(g => g.id === 'bot')) {
            textoFinal += `🤖 ¡SiriusBot ha cruzado la meta y se queda con todo el botín de *${pozoTotal} XP*! Suerte para la próxima.`;
        } else {
            let tagsGanadores = ganadores.map(g => `@${number(g.id)}`).join(', ');
            textoFinal += `🎉 ¡Felicidades a ${tagsGanadores}!\n💰 Has ganado *${premioPorGanador} XP*.`;

            for (let g of ganadores) {
                if (g.id !== 'bot') {
                    await db.addXP(g.userKey, premioPorGanador);
                }
            }
        }
    } 
    // Si fue una carrera amistosa
    else {
        if (ganadores.some(g => g.id === 'bot')) {
            textoFinal += `🤖 ¡SiriusBot ha cruzado la meta en primer lugar! Nadie me puede ganar.`;
        } else {
            let tagsGanadores = ganadores.map(g => `@${number(g.id)}`).join(', ');
            textoFinal += `🎉 ¡Felicidades a ${tagsGanadores} por ganar la carrera!`;
        }
    }

    // Obtenemos solo los JIDs de los ganadores para la mención final
    let mencionesGanadores = ganadores.filter(g => g.id !== 'bot').map(g => g.id);

    await sock.sendMessage(remoteJid, { 
        text: textoFinal,
        mentions: mencionesGanadores
    });
    
    delete carreras[remoteJid];
}
