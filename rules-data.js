// Shared Rules Database - Sincronizado entre rules.html y mod-panel.html
// Este archivo contiene todas las reglas y funciones compartidas

const RULES_STORAGE_KEY = 'houstonRPRulesShared';

// Mapa de iconos por tipo de regla
const ICON_MAP = {
    "RDM": "fas fa-gun",
    "VDM": "fas fa-car-crash",
    "MG": "fas fa-brain",
    "PG": "fas fa-eye-slash",
    "CK": "fas fa-skull",
    "NLR": "fas fa-redo",
    "FAIL RP": "fas fa-times-circle",
    "ERP": "fas fa-ban",
    "TROLL RP": "fas fa-clown",
    "SIN ROLEPLAY EN CHOQUE": "fas fa-exclamation-circle",
    "ANTIROL: VELOCIDAD": "fas fa-tachometer-alt",
    "NO VALORA SU VIDA": "fas fa-heart",
    "EXPLOITS": "fas fa-bug",
    "BAD DRIVING": "fas fa-warning",
    "SIN VERIFICAR": "fas fa-check-circle",
    "CARRO VIP SIN PERMISO": "fas fa-car",
    "RESPETO IC / OOC": "fas fa-handshake",
    "ZONAS SEGURAS": "fas fa-map-marker-alt",
    "PERSECUCIONES CIVILES": "fas fa-car",
    "BUNNY JUMPING": "fas fa-rabbit",
    "CHALECO PERSONALIZADO": "fas fa-vest",
    "FORZAR ROL": "fas fa-theater-masks",
    "RESPETAR A TODOS": "fas fa-handshake",
    "ANTIRECLUTAMIENTO": "fas fa-ban",
    "SPAM": "fas fa-ban",
    "CONTENIDO ADULTO": "fas fa-exclamation-circle",
    "FLOOD": "fas fa-water",
    "MENCIONES EXCESIVAS": "fas fa-at",
    "OFF-TOPIC": "fas fa-random",
    "IMPERSONACIÓN": "fas fa-mask",
    "LENGUAJE TÓXICO": "fas fa-fire",
    "SIN POLÍTICA": "fas fa-dove"
};

// Reglas por defecto
const DEFAULT_RULES = [
    // ROLEPLAY
    {title: "RDM", code: "Random Death Match", description: "Matar a un jugador sin razón válida de roleplay.", sanction: "KICK", section: "roleplay"},
    {title: "VDM", code: "Vehicle Death Match", description: "Usar vehículo para golpear o matar sin razón válida.", sanction: "WARN", section: "roleplay"},
    {title: "MG", code: "Metagaming", description: "Usar información fuera del juego para beneficiarte en roleplay.", sanction: "BANNED", section: "roleplay"},
    {title: "PG", code: "Powergaming", description: "Realizar acciones sin permitir respuesta a otros jugadores.", sanction: "KICK", section: "roleplay"},
    {title: "CK", code: "Character Kill", description: "Matar permanentemente personaje sin consentimiento previo.", sanction: "WARN", section: "roleplay"},
    {title: "NLR", code: "New Life Rule", description: "Después de morir, tu personaje pierde toda memoria de eventos anteriores.", sanction: "KICK", section: "roleplay"},
    {title: "FAIL RP", code: "Roleplay Fallido", description: "No actuar de forma realista ante situaciones.", sanction: "WARN", section: "roleplay"},
    {title: "ERP", code: "Explicit Roleplay", description: "Contenido sexual, erótico o explícito está prohibido.", sanction: "5 PUNTOS (BAN)", section: "roleplay"},
    {title: "TROLL RP", code: "Disruptivo", description: "Jugar para molestar o arruinar experiencia de otros.", sanction: "5 PUNTOS (BAN)", section: "roleplay"},
    {title: "SIN ROLEPLAY EN CHOQUE", code: "Reacción Realista", description: "Actúa como si realmente estuvieras en shock o asustado.", sanction: "KICK", section: "roleplay"},
    {title: "ANTIROL: VELOCIDAD", code: "> 150 MPH", description: "Conducir >150 MPH sin razón válida de emergencia.", sanction: "ANTIROL", section: "roleplay"},
    {title: "NO VALORA SU VIDA", code: "Fear RP", description: "Debes actuar como si tu vida tuviera valor real.", sanction: "ANTIROL", section: "roleplay"},
    {title: "EXPLOITS", code: "Abuso de Fallos", description: "Usar bugs para obtener ventaja. Se reporta automáticamente.", sanction: "5 PUNTOS (BAN)", section: "roleplay"},
    {title: "BAD DRIVING", code: "Conducción Peligrosa", description: "Conducir irresponsablemente chocando constantemente.", sanction: "KICK", section: "roleplay"},
    {title: "SIN VERIFICAR", code: "Verificación Edad", description: "Debes verificar edad en el servidor.", sanction: "KICK", section: "roleplay"},
    {title: "CARRO VIP SIN PERMISO", code: "Vehículos Exclusivos", description: "Solo usuarios con VIP pueden usar estos vehículos.", sanction: "KICK", section: "roleplay"},
    {title: "RESPETO IC / OOC", code: "Tolerancia Cero", description: "Respeta a todos en IC y OOC. Sin discriminación.", sanction: "BANNED", section: "roleplay"},
    {title: "ZONAS SEGURAS", code: "Pasaporte Safe Zone", description: "Las zonas seguras están protegidas. No combate, robos ni actividades delictivas.", sanction: "KICK", section: "roleplay"},
    {title: "PERSECUCIONES CIVILES", code: "Razón Válida Requerida", description: "Debes tener razón válida para perseguir como civil.", sanction: "WARN", section: "roleplay"},
    {title: "BUNNY JUMPING", code: "Abuso de Mecánicas", description: "No se permite saltos repetidos para obtener ventaja.", sanction: "2 PUNTOS", section: "roleplay"},
    {title: "CHALECO PERSONALIZADO", code: "Prohibido Logo/Diseño", description: "Solo se permite el chaleco estándar sin modificaciones.", sanction: "WARN", section: "roleplay"},
    {title: "FORZAR ROL", code: "Roleplay Consensual", description: "No se permite forzar rol sin consentimiento del otro jugador.", sanction: "3 PUNTOS", section: "roleplay"},
    // DISCORD
    {title: "RESPETAR A TODOS", code: "Básico", description: "Sé respetuoso con todos. Sin insultos ni discriminación.", sanction: "1 PUNTO", section: "discord"},
    {title: "ANTIRECLUTAMIENTO", code: "Prohibido", description: "No reclutar para otros servidores sin permiso.", sanction: "4 PUNTOS", section: "discord"},
    {title: "SPAM", code: "Mensajes Repetitivos", description: "No spamear mensajes, emojis o menciones.", sanction: "1 PUNTO", section: "discord"},
    {title: "CONTENIDO ADULTO", code: "NSFW Prohibido", description: "Sin sexual, gore o imágenes ofensivas.", sanction: "5 PUNTOS (BAN)", section: "discord"},
    {title: "FLOOD", code: "Inundación", description: "No enviar muchos mensajes cortos seguidos.", sanction: "1 PUNTO", section: "discord"},
    {title: "MENCIONES EXCESIVAS", code: "Sin Abusar @", description: "No mencionar constantemente a staff sin razón.", sanction: "1 PUNTO", section: "discord"},
    {title: "OFF-TOPIC", code: "Tema del Canal", description: "Usa canales para su propósito específico.", sanction: "1 PUNTO", section: "discord"},
    {title: "IMPERSONACIÓN", code: "Hacerse Pasar", description: "No pretender ser staff o impersonar jugadores.", sanction: "4 PUNTOS", section: "discord"},
    {title: "LENGUAJE TÓXICO", code: "Insultos", description: "Sin insultos, palabrotas dirigidas a otros.", sanction: "4 PUNTOS", section: "discord"},
    {title: "SIN POLÍTICA", code: "Temas Sensibles", description: "Evita debates sobre política, religión o división.", sanction: "1 PUNTO", section: "discord"}
];

// Cargar reglas desde localStorage
function loadRulesShared() {
    const stored = localStorage.getItem(RULES_STORAGE_KEY);
    if (stored) {
        try {
            return JSON.parse(stored);
        } catch (e) {
            console.error('Error al cargar reglas compartidas:', e);
            return DEFAULT_RULES;
        }
    }
    return DEFAULT_RULES;
}

// Guardar reglas en localStorage
function saveRulesShared(rules) {
    localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(rules));
    // Disparar evento global para que todos los tabs se actualicen
    window.dispatchEvent(new CustomEvent('rulesUpdated', { detail: { rules } }));
}

// Obtener icono por título de regla
function getIconForRule(title) {
    return ICON_MAP[title] || 'fas fa-circle';
}

// Obtener todas las reglas de una sección
function getRulesBySection(section) {
    const rules = loadRulesShared();
    return rules.filter(r => r.section === section);
}

// Obtener todas las reglas
function getAllRules() {
    return loadRulesShared();
}

// Actualizar una regla
function updateRule(index, updatedRule) {
    const rules = loadRulesShared();
    if (rules[index]) {
        rules[index] = updatedRule;
        saveRulesShared(rules);
        return true;
    }
    return false;
}

// Agregar una regla
function addRule(rule) {
    const rules = loadRulesShared();
    rules.push(rule);
    saveRulesShared(rules);
    return rules.length - 1;
}

// Eliminar una regla
function deleteRule(index) {
    const rules = loadRulesShared();
    if (rules[index]) {
        rules.splice(index, 1);
        saveRulesShared(rules);
        return true;
    }
    return false;
}

// Listener global para cambios en localStorage desde otro tab
window.addEventListener('storage', function(e) {
    if (e.key === RULES_STORAGE_KEY) {
        window.dispatchEvent(new CustomEvent('rulesUpdated', { detail: { rules: JSON.parse(e.newValue) } }));
    }
});
