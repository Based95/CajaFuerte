let codigoSecreto = [];
let pistasDelDia = [];
let intentoActual = [null, null, null, null];
let intentosGuardados = [];
let columnaSeleccionada = 0;
let filaActual = 0;
let juegoTerminado = false;
let modoTacharTeclado = false;
let temporizadorMensaje = null;
let idFechaHoy = "";

const MAX_INTENTOS = 4;
const NUM_PISTAS = 3;
const STORAGE_STATE_KEY = "crackthevault_daily_state_v1";
const STORAGE_STATS_KEY = "crackthevault_stats_v1";

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function sonar(frecuencia, tipo, duracion) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = tipo;
    osc.frequency.setValueAtTime(frecuencia, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duracion);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duracion);
}

function sonidoTecla() { sonar(680, 'sine', 0.06); }
function sonidoNota() { sonar(420, 'triangle', 0.05); }
function sonidoError() { sonar(150, 'sawtooth', 0.2); }
function sonidoVictoria() {
    sonar(523.25, 'sine', 0.12);
    setTimeout(() => sonar(659.25, 'sine', 0.12), 120);
    setTimeout(() => sonar(1046.50, 'sine', 0.35), 240);
}

// --- DAILY SEED GENERATOR (Deterministic PRNG) ---
function obtenerDatosFechaHoy() {
    const ahora = new Date();
    const yyyy = ahora.getFullYear();
    const mm = String(ahora.getMonth() + 1).padStart(2, '0');
    const dd = String(ahora.getDate()).padStart(2, '0');
    const idFecha = `${yyyy}-${mm}-${dd}`;

    const inicioEpoca = new Date(2026, 0, 1);
    const hoyMedianoche = new Date(yyyy, ahora.getMonth(), ahora.getDate());
    const numDia = Math.floor((hoyMedianoche - inicioEpoca) / (1000 * 60 * 60 * 24)) + 1;

    // Numeric seed from YYYYMMDD
    const seedNum = parseInt(`${yyyy}${mm}${dd}`, 10);
    return { idFecha, numDia, seedNum };
}

function crearGeneradorConSemilla(seed) {
    let a = seed;
    return function() {
        let t = a += 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function generarCodigoConRNG(rng) {
    const disponibles = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const codigo = [];
    for (let i = 0; i < 4; i++) {
        const idx = Math.floor(rng() * disponibles.length);
        codigo.push(disponibles.splice(idx, 1)[0]);
    }
    return codigo;
}

function evaluarResumen(secreto, intento) {
    let exactos = 0, descolocados = 0;
    intento.forEach((num, i) => {
        if (num === secreto[i]) exactos++;
        else if (secreto.includes(num)) descolocados++;
    });
    return { exactos, descolocados };
}

function generarPistasBalanceadas(secreto, rng) {
    while (true) {
        const pistas = [];
        const digitosUsados = new Set();
        let totalExactos = 0;
        let util = true;

        for (let i = 0; i < NUM_PISTAS; i++) {
            const p = generarCodigoConRNG(rng);
            const res = evaluarResumen(secreto, p);
            if (res.exactos >= 3 || (res.exactos === 0 && res.descolocados === 0)) {
                util = false;
                break;
            }
            totalExactos += res.exactos;
            p.forEach(d => digitosUsados.add(d));
            pistas.push({ codigo: p, res });
        }

        if (util && totalExactos <= 2 && digitosUsados.size >= 7 && digitosUsados.size <= 9) {
            return pistas;
        }
    }
}

function crearHTMLPips(exactos, descolocados) {
    let html = "";
    for (let i = 0; i < 4; i++) {
        if (i < exactos) html += `<div class="pip verde"></div>`;
        else if (i < exactos + descolocados) html += `<div class="pip amarillo"></div>`;
        else html += `<div class="pip"></div>`;
    }
    return html;
}

// --- INITIALIZATION & LOCALSTORAGE ---
function iniciarPartidaDiaria() {
    const { idFecha, numDia, seedNum } = obtenerDatosFechaHoy();
    idFechaHoy = idFecha;
    document.getElementById("num-dia").textContent = `#${numDia}`;

    const rng = crearGeneradorConSemilla(seedNum);
    codigoSecreto = generarCodigoConRNG(rng);
    pistasDelDia = generarPistasBalanceadas(codigoSecreto, rng);

    intentoActual = [null, null, null, null];
    intentosGuardados = [];
    columnaSeleccionada = 0;
    filaActual = 0;
    juegoTerminado = false;
    modoTacharTeclado = false;

    actualizarBotonModoNota();
    document.getElementById("led-box").classList.remove("abierta");
    document.getElementById("led-status").textContent = "LOCKED";
    document.getElementById("mensaje").textContent = "";

    dibujarTeclado();
    dibujarPistas();
    dibujarTableroJugador();

    cargarProgresoDiario();
    actualizarDisplayLED();
    iniciarRelojCuentaAtras();
}

function guardarProgresoDiario(estadoFinal = "PLAYING") {
    const data = {
        fecha: idFechaHoy,
        intentos: intentosGuardados,
        estado: estadoFinal
    };
    localStorage.setItem(STORAGE_STATE_KEY, JSON.stringify(data));
}

function cargarProgresoDiario() {
    const raw = localStorage.getItem(STORAGE_STATE_KEY);
    if (!raw) return;

    try {
        const data = JSON.parse(raw);
        if (data.fecha !== idFechaHoy) return; // New day, fresh start

        data.intentos.forEach(intento => {
            reproducirIntentoGuardado(intento);
        });
    } catch (e) {
        console.error(e);
    }
}

function reproducirIntentoGuardado(intento) {
    intentosGuardados.push(intento);
    const res = evaluarResumen(codigoSecreto, intento);

    intento.forEach((num, idx) => {
        const casilla = document.getElementById(`casilla-${filaActual}-${idx}`);
        casilla.textContent = num;
        casilla.className = `casilla num-${num}`;
        casilla.dataset.estado = "0";
        casilla.onclick = () => rotarNotaCasillaIndividual(casilla);
    });

    document.getElementById(`radar-${filaActual}`).innerHTML = crearHTMLPips(res.exactos, res.descolocados);

    if (res.exactos === 4) {
        juegoTerminado = true;
        for (let c = 0; c < 4; c++) {
            document.getElementById(`casilla-${filaActual}-${c}`).className = "casilla victoria";
        }
        document.getElementById("led-box").classList.add("abierta");
        document.getElementById("led-status").textContent = "ACCESS GRANTED";
        mostrarMensajeFijo(`🔓 Vault cracked in ${filaActual + 1}/${MAX_INTENTOS}!`);
    } else if (filaActual === MAX_INTENTOS - 1) {
        juegoTerminado = true;
        document.getElementById("led-status").textContent = "ALARM TRIGGERED";
        mostrarMensajeFijo(`🚨 Correct code: ${codigoSecreto.join("")}`);
    } else {
        filaActual++;
        actualizarVistaFilaActual();
    }
}

// --- STATS MANAGEMENT ---
function obtenerEstadisticas() {
    const raw = localStorage.getItem(STORAGE_STATS_KEY);
    if (!raw) {
        return { jugadas: 0, victorias: 0, rachaActual: 0, maxRacha: 0, ultimaFechaJugada: "" };
    }
    return JSON.parse(raw);
}

function registrarResultadoEstadisticas(victoria) {
    const stats = obtenerEstadisticas();
    if (stats.ultimaFechaJugada === idFechaHoy) return; // Prevent double counting

    stats.jugadas++;
    if (victoria) {
        stats.victorias++;
        stats.rachaActual++;
        if (stats.rachaActual > stats.maxRacha) {
            stats.maxRacha = stats.rachaActual;
        }
    } else {
        stats.rachaActual = 0;
    }
    stats.ultimaFechaJugada = idFechaHoy;
    localStorage.setItem(STORAGE_STATS_KEY, JSON.stringify(stats));
}

function renderizarModalEstadisticas() {
    const stats = obtenerEstadisticas();
    const winrate = stats.jugadas > 0 ? Math.round((stats.victorias / stats.jugadas) * 100) : 0;

    document.getElementById("stat-jugadas").textContent = stats.jugadas;
    document.getElementById("stat-winrate").textContent = `${winrate}%`;
    document.getElementById("stat-racha").textContent = stats.rachaActual;
    document.getElementById("stat-max-racha").textContent = stats.maxRacha;
}

function toggleModalAyuda() {
    document.getElementById("modal-ayuda").classList.toggle("visible");
}

function toggleModalEstadisticas() {
    renderizarModalEstadisticas();
    document.getElementById("modal-stats").classList.toggle("visible");
}

function iniciarRelojCuentaAtras() {
    function actualizarReloj() {
        const ahora = new Date();
        const manana = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1);
        const diff = Math.max(0, manana - ahora);

        const hh = String(Math.floor(diff / (1000 * 60 * 60))).padStart(2, '0');
        const mm = String(Math.floor((diff / (1000 * 60)) % 60)).padStart(2, '0');
        const ss = String(Math.floor((diff / 1000) % 60)).padStart(2, '0');

        document.getElementById("countdown-timer").textContent = `${hh}:${mm}:${ss}`;
    }
    actualizarReloj();
    setInterval(actualizarReloj, 1000);
}

// --- UI & INTERACTION ---
function alternarModoTachar() {
    if (juegoTerminado) return;
    sonidoNota();
    modoTacharTeclado = !modoTacharTeclado;
    actualizarBotonModoNota();
    mostrarMensajeTemporal(modoTacharTeclado ? "✏️ Keypad strikeout mode ON" : "Typing mode ON");
}

function actualizarBotonModoNota() {
    const btn = document.getElementById("btn-modo-nota");
    if (modoTacharTeclado) btn.classList.add("activo");
    else btn.classList.remove("activo");
}

function limpiarTodasLasNotas() {
    if (juegoTerminado) return;
    sonidoNota();
    document.querySelectorAll(".casilla, .tecla").forEach(el => aplicarClaseNota(el, 0));
    mostrarMensajeTemporal("🧹 All marks cleared");
}

function actualizarDisplayLED() {
    const display = document.getElementById("led-display");
    if (juegoTerminado) {
        display.textContent = codigoSecreto.join(" ");
        return;
    }
    display.textContent = intentoActual.map(n => (n !== null ? n : "-")).join(" ");
}

function dibujarPistas() {
    const contenedor = document.getElementById("contenedor-pistas");
    contenedor.innerHTML = "";

    pistasDelDia.forEach(({ codigo, res }) => {
        const fila = document.createElement("div");
        fila.className = "fila";

        codigo.forEach(num => {
            const casilla = document.createElement("div");
            casilla.className = `casilla num-${num}`;
            casilla.textContent = num;
            casilla.dataset.estado = "0";
            casilla.onclick = () => rotarNotaCasillaIndividual(casilla);
            fila.appendChild(casilla);
        });

        const radar = document.createElement("div");
        radar.className = "radar-pips";
        radar.innerHTML = crearHTMLPips(res.exactos, res.descolocados);
        fila.appendChild(radar);

        contenedor.appendChild(fila);
    });
}

function dibujarTableroJugador() {
    const contenedor = document.getElementById("contenedor-intentos");
    contenedor.innerHTML = "";
    for (let f = 0; f < MAX_INTENTOS; f++) {
        const fila = document.createElement("div");
        fila.className = "fila";
        fila.id = `fila-jugador-${f}`;
        for (let c = 0; c < 4; c++) {
            const casilla = document.createElement("div");
            casilla.className = "casilla";
            casilla.id = `casilla-${f}-${c}`;
            casilla.onclick = () => seleccionarHueco(f, c);
            fila.appendChild(casilla);
        }
        const radar = document.createElement("div");
        radar.className = "radar-pips";
        radar.id = `radar-${f}`;
        radar.innerHTML = crearHTMLPips(0, 0);
        fila.appendChild(radar);
        contenedor.appendChild(fila);
    }
    actualizarVistaFilaActual();
}

function dibujarTeclado() {
    const teclado = document.getElementById("teclado");
    teclado.innerHTML = "";
    for (let i = 0; i <= 9; i++) {
        const btn = document.createElement("button");
        btn.className = "tecla";
        btn.id = `tecla-${i}`;
        btn.textContent = i;
        btn.dataset.estado = "0";
        btn.onclick = () => {
            if (modoTacharTeclado) tacharEnTeclado(btn);
            else pulsarNumero(i);
        };
        teclado.appendChild(btn);
    }
}

function aplicarClaseNota(el, estado) {
    el.classList.remove("nota-duda", "nota-posible", "nota-seguro", "nota-descartado");
    el.dataset.estado = String(estado);
    if (estado === 1) el.classList.add("nota-duda");
    if (estado === 2) el.classList.add("nota-posible");
    if (estado === 3) el.classList.add("nota-seguro");
    if (estado === 4) el.classList.add("nota-descartado");
}

function rotarNotaCasillaIndividual(casillaClicada) {
    if (juegoTerminado) return;
    sonidoNota();
    const estadoActual = parseInt(casillaClicada.dataset.estado || "0");
    const nuevoEstado = (estadoActual + 1) % 5;
    aplicarClaseNota(casillaClicada, nuevoEstado);
}

function tacharEnTeclado(botonTecla) {
    if (juegoTerminado) return;
    sonidoNota();
    const estadoActual = parseInt(botonTecla.dataset.estado || "0");
    const nuevoEstado = estadoActual === 4 ? 0 : 4;
    aplicarClaseNota(botonTecla, nuevoEstado);
}

function seleccionarHueco(fila, col) {
    if (juegoTerminado || fila !== filaActual) return;
    columnaSeleccionada = col;
    actualizarVistaFilaActual();
}

function pulsarNumero(num) {
    if (juegoTerminado) return;
    const posExistente = intentoActual.indexOf(num);
    if (posExistente !== -1 && posExistente !== columnaSeleccionada) {
        sonidoError();
        mostrarMensajeTemporal(`⚠️ Digit ${num} is already in slot ${posExistente + 1}`);
        sacudirTablero();
        return;
    }

    sonidoTecla();
    intentoActual[columnaSeleccionada] = num;

    const sigVacio = intentoActual.findIndex((val, idx) => idx > columnaSeleccionada && val === null);
    const primVacio = intentoActual.indexOf(null);
    if (sigVacio !== -1) columnaSeleccionada = sigVacio;
    else if (primVacio !== -1) columnaSeleccionada = primVacio;

    actualizarVistaFilaActual();
    actualizarDisplayLED();
}

function borrarNumero() {
    if (juegoTerminado) return;
    sonidoTecla();
    if (intentoActual[columnaSeleccionada] !== null) {
        intentoActual[columnaSeleccionada] = null;
    } else if (columnaSeleccionada > 0) {
        columnaSeleccionada--;
        intentoActual[columnaSeleccionada] = null;
    }
    actualizarVistaFilaActual();
    actualizarDisplayLED();
}

function actualizarVistaFilaActual() {
    for (let f = 0; f < MAX_INTENTOS; f++) {
        const filaEl = document.getElementById(`fila-jugador-${f}`);
        if (f > filaActual) filaEl.classList.add("fila-futura");
        else filaEl.classList.remove("fila-futura");
    }

    if (juegoTerminado) return;

    for (let c = 0; c < 4; c++) {
        const casilla = document.getElementById(`casilla-${filaActual}-${c}`);
        casilla.textContent = intentoActual[c] !== null ? intentoActual[c] : "";
        casilla.className = "casilla";
        if (c === columnaSeleccionada) {
            casilla.classList.add("seleccionada");
        }
    }
}

function enviarIntento() {
    if (juegoTerminado) return;
    if (intentoActual.includes(null)) {
        sonidoError();
        mostrarMensajeTemporal("⚠️ Enter all 4 digits first");
        sacudirTablero();
        return;
    }

    const copiaIntento = [...intentoActual];
    intentosGuardados.push(copiaIntento);
    const res = evaluarResumen(codigoSecreto, copiaIntento);

    copiaIntento.forEach((num, idx) => {
        const casilla = document.getElementById(`casilla-${filaActual}-${idx}`);
        casilla.className = `casilla num-${num}`;
        casilla.dataset.estado = "0";
        casilla.onclick = () => rotarNotaCasillaIndividual(casilla);
    });

    document.getElementById(`radar-${filaActual}`).innerHTML = crearHTMLPips(res.exactos, res.descolocados);

    if (res.exactos === 4) {
        juegoTerminado = true;
        sonidoVictoria();
        for (let c = 0; c < 4; c++) {
            document.getElementById(`casilla-${filaActual}-${c}`).className = "casilla victoria";
        }
        document.getElementById("led-box").classList.add("abierta");
        document.getElementById("led-status").textContent = "ACCESS GRANTED";
        actualizarDisplayLED();
        mostrarMensajeFijo(`🔓 Vault cracked in ${filaActual + 1}/${MAX_INTENTOS}!`);
        guardarProgresoDiario("WON");
        registrarResultadoEstadisticas(true);
        setTimeout(toggleModalEstadisticas, 1400);
    } else if (filaActual === MAX_INTENTOS - 1) {
        juegoTerminado = true;
        sonidoError();
        sacudirTablero();
        document.getElementById("led-status").textContent = "ALARM TRIGGERED";
        actualizarDisplayLED();
        mostrarMensajeFijo(`🚨 Correct code: ${codigoSecreto.join("")}`);
        guardarProgresoDiario("LOST");
        registrarResultadoEstadisticas(false);
        setTimeout(toggleModalEstadisticas, 1800);
    } else {
        sonidoTecla();
        guardarProgresoDiario("PLAYING");
        filaActual++;
        intentoActual = [null, null, null, null];
        columnaSeleccionada = 0;
        actualizarVistaFilaActual();
        actualizarDisplayLED();
    }
}

function mostrarMensajeTemporal(txt) {
    const el = document.getElementById("mensaje");
    el.textContent = txt;
    clearTimeout(temporizadorMensaje);
    temporizadorMensaje = setTimeout(() => {
        if (!juegoTerminado) el.textContent = "";
    }, 2200);
}

function mostrarMensajeFijo(txt) {
    clearTimeout(temporizadorMensaje);
    document.getElementById("mensaje").textContent = txt;
}

function sacudirTablero() {
    const cont = document.querySelector(".juego-contenedor");
    cont.classList.remove("shake");
    void cont.offsetWidth;
    cont.classList.add("shake");
}

document.addEventListener("keydown", (e) => {
    if (juegoTerminado) return;
    if (e.key >= "0" && e.key <= "9") pulsarNumero(parseInt(e.key));
    if (e.key === "Backspace" || e.key === "Delete") borrarNumero();
    if (e.key === "Enter") enviarIntento();
    if (e.key === "ArrowLeft") {
        columnaSeleccionada = (columnaSeleccionada + 3) % 4;
        actualizarVistaFilaActual();
    }
    if (e.key === "ArrowRight") {
        columnaSeleccionada = (columnaSeleccionada + 1) % 4;
        actualizarVistaFilaActual();
    }
});

iniciarPartidaDiaria();