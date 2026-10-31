// 1. Obtener la fecha de hoy como número entero (ej: 20261031)
function obtenerSemillaDelDia() {
    const hoy = new Date();
    const año = hoy.getFullYear();
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const dia = String(hoy.getDate()).padStart(2, '0');
    return parseInt(`${año}${mes}${dia}`);
}

// 2. Generador pseudo-aleatorio con semilla (algoritmo Mulberry32 simplificado)
function crearGeneradorAleatorio(semilla) {
    return function() {
        semilla |= 0; semilla = semilla + 0x6D2B79F5 | 0;
        let t = Math.imul(semilla ^ semilla >>> 15, 1 | semilla);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

// 3. Generar un código de 4 dígitos SIN repetir números (ej: [4, 8, 1, 9])
function generarCodigo(randomFunc) {
    const digitosDisponibles = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const codigo = [];

    for (let i = 0; i < 4; i++) {
        // Elegimos un índice al azar usando nuestra función con semilla
        const indiceAleatorio = Math.floor(randomFunc() * digitosDisponibles.length);
        // Sacamos ese número del array para que no se pueda repetir
        codigo.push(digitosDisponibles.splice(indiceAleatorio, 1)[0]);
    }
    return codigo;
}

// 4. El validador tipo Wordle (Compara un intento con el código secreto)
function evaluarIntento(secreto, intento) {
    // Como no hay dígitos repetidos en el secreto, la lógica es súper directa:
    return intento.map((digito, posicion) => {
        if (digito === secreto[posicion]) {
            return "🟩"; // Número correcto en el sitio exacto
        } else if (secreto.includes(digito)) {
            return "🟨"; // El número está en la caja fuerte, pero en otra posición
        } else {
            return "⬛"; // Ese número no está en el código
        }
    });
}

// Inicializamos el motor con la fecha de hoy
const semillaHoy = obtenerSemillaDelDia();
const randomHoy = crearGeneradorAleatorio(semillaHoy);

// Generamos el código que abre la caja fuerte hoy
const CODIGO_SECRETO = generarCodigo(randomHoy);

// Generamos 2 pistas iniciales usando la misma semilla (saldrán iguales para todos)
const pista1 = generarCodigo(randomHoy);
const pista2 = generarCodigo(randomHoy);

// Mostramos por consola cómo quedaría el reto de hoy
console.log("🔒 CÓDIGO SECRETO DE HOY (Oculto al jugador):", CODIGO_SECRETO.join(""));
console.log("-----------------------------------------");
console.log("🕵️ PISTA 1:", pista1.join(" "), "->", evaluarIntento(CODIGO_SECRETO, pista1).join(" "));
console.log("🕵️ PISTA 2:", pista2.join(" "), "->", evaluarIntento(CODIGO_SECRETO, pista2).join(" "));