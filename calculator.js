/* ==============================================================
   Calculadora de Cuotas Claro + Seguro Claro up
   - Fórmula de anualidad (cuota fija): Cuota = Saldo * i / (1-(1+i)^-n)
   - Tasas según aplique IVA (configurables)
   - Rangos de seguro configurables
   - Persistencia en localStorage
   ============================================================== */

// ---------- ESTADO POR DEFECTO ----------
const DEFAULTS = {
  tasas: {
    noIva: 2.18,      // % mensual, sin IVA
    siIva: 2.5942,    // % mensual, con IVA
  },
  // Rangos de seguro: {desde, hasta, valor} en COP
  rangosSeguro: [
    { desde: 800000, hasta: 1200000, valor: 16000 },
    { desde: 1200000, hasta: 1900000, valor: 22000 },
    { desde: 2000000, hasta: null, valor: 38000 }, // null = sin tope superior
  ],
};

const STORAGE_KEY = 'claro-calculadora-config-v1';

let config = loadConfig();
let estado = {
  valorEquipo: null,
  aplicaIva: 'si',   // 'si' por defecto (el más común)
  pagoInicial: 0,
  meses: 12,
};

// ---------- PERSISTENCIA ----------
function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Mezcla con defaults para tolerar campos faltantes
      return {
        tasas: { ...DEFAULTS.tasas, ...(parsed.tasas || {}) },
        rangosSeguro: parsed.rangosSeguro && parsed.rangosSeguro.length
          ? parsed.rangosSeguro
          : DEFAULTS.rangosSeguro,
      };
    }
  } catch (e) {
    console.warn('No se pudo cargar la configuración guardada:', e);
  }
  return JSON.parse(JSON.stringify(DEFAULTS));
}

function saveConfig() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    return true;
  } catch (e) {
    console.error('No se pudo guardar la configuración:', e);
    return false;
  }
}

// ---------- UTILIDADES ----------
function formatearCOP(valor) {
  if (valor === null || valor === undefined || isNaN(valor)) return '—';
  return '$' + Math.round(valor).toLocaleString('es-CO');
}

// Parsea un input de monto (quito puntos, comas y signos) -> número entero
function parseMonto(str) {
  if (!str) return 0;
  const limpio = String(str).replace(/[^\d]/g, '');
  return limpio ? parseInt(limpio, 10) : 0;
}

// ---------- TASA ----------
function tasaMensualDecimal() {
  const t = estado.aplicaIva === 'si' ? config.tasas.siIva : config.tasas.noIva;
  return t / 100;
}

// ---------- CÁLCULO DE CUOTA (anualidad) ----------
function calcularCuota(saldo, tasaDecimal, meses) {
  if (!saldo || saldo <= 0 || !meses || meses <= 0) return 0;
  if (tasaDecimal === 0) return saldo / meses;
  return (saldo * tasaDecimal) / (1 - Math.pow(1 + tasaDecimal, -meses));
}

// ---------- SEGURO ----------
function obtenerSeguro(precioEquipo) {
  const rangos = config.rangosSeguro;
  for (const r of rangos) {
    const desdeOk = r.desde === null || precioEquipo >= r.desde;
    const hastaOk = r.hasta === null || precioEquipo <= r.hasta;
    if (desdeOk && hastaOk) return r.valor;
  }
  return 0; // no aplica seguro
}

// ---------- PRINCIPAL ----------
function recalcular() {
  const valorEquipo = estado.valorEquipo;
  const resultado = document.getElementById('resultado');

  if (!valorEquipo || valorEquipo <= 0) {
    resultado.classList.add('hidden');
    return;
  }

  const tasaMensual = tasaMensualDecimal();
  const saldo = Math.max(0, valorEquipo - estado.pagoInicial);
  const cuotaEquipo = calcularCuota(saldo, tasaMensual, estado.meses);
  const seguro = obtenerSeguro(valorEquipo);
  const total = cuotaEquipo + seguro;

  document.getElementById('res-saldo').textContent = formatearCOP(saldo);
  document.getElementById('res-cuota').textContent = formatearCOP(cuotaEquipo);
  document.getElementById('res-seguro').textContent = formatearCOP(seguro);
  document.getElementById('res-plazo').textContent = `Durante ${estado.meses} meses`;
  document.getElementById('res-total').textContent = formatearCOP(total);

  resultado.classList.remove('hidden');
}

// ---------- RENDER CONFIG (tabla de seguros) ----------
function renderSeguroTable() {
  const tbody = document.getElementById('seguro-tbody');
  tbody.innerHTML = '';

  config.rangosSeguro.forEach((r, idx) => {
    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td><input type="text" class="seguro-desde" data-idx="${idx}" value="${r.desde === null ? '' : r.desde.toLocaleString('es-CO')}"></td>
      <td><input type="text" class="seguro-hasta" data-idx="${idx}" value="${r.hasta === null ? '' : r.hasta.toLocaleString('es-CO')}"></td>
      <td><input type="text" class="seguro-valor" data-idx="${idx}" value="${r.valor.toLocaleString('es-CO')}"></td>
      <td><button class="btn-remove" data-idx="${idx}" title="Eliminar rango">×</button></td>
    `;

    tbody.appendChild(tr);
  });
}

// ---------- LEER CONFIG DESDE LA UI ----------
function leerConfigDesdeUI() {
  const nuevo = {
    tasas: {
      noIva: parseFloat(document.getElementById('tasaNoIva').value) || 0,
      siIva: parseFloat(document.getElementById('tasaSiIva').value) || 0,
    },
    rangosSeguro: [],
  };

  document.querySelectorAll('#seguro-tbody tr').forEach((tr) => {
    const desde = parseMonto(tr.querySelector('.seguro-desde').value);
    const hastaRaw = tr.querySelector('.seguro-hasta').value;
    const hasta = hastaRaw.trim() === '' ? null : parseMonto(hastaRaw);
    const valor = parseMonto(tr.querySelector('.seguro-valor').value);
    nuevo.rangosSeguro.push({ desde, hasta, valor });
  });

  // validación: al menos 1 rango con valor > 0
  const validos = nuevo.rangosSeguro.filter(r => r.valor > 0);
  if (validos.length === 0) {
    return { error: 'Debe existir al menos un rango de seguro con valor mayor a 0.' };
  }

  // normalizar: filtra huecos dejando solo los con valor
  nuevo.rangosSeguro = validos
    .sort((a, b) => actualizarDesde(a) - actualizarDesde(b));

  return nuevo;
}

// ordena por 'desde'; null se trata como 0
function actualizarDesde(r) { return r.desde === null ? 0 : r.desde; }

// ---------- CARGAR CONFIG EN LA UI ----------
function cargarConfigEnUI() {
  document.getElementById('tasaNoIva').value = config.tasas.noIva;
  document.getElementById('tasaSiIva').value = config.tasas.siIva;
  renderSeguroTable();
}

function mostrarEstadoGuardado(mensaje, ok) {
  const el = document.getElementById('save-status');
  el.textContent = mensaje;
  el.className = 'save-status ' + (ok ? 'success' : 'error');
  setTimeout(() => { el.textContent = ''; el.className = 'save-status'; }, 2500);
}

// ---------- EVENTOS: TABS ----------
function cambiarTab(nombre) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const active = btn.dataset.tab === nombre;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  document.querySelectorAll('.tab-panel').forEach(p => {
    p.classList.toggle('active', p.id === 'tab-' + nombre);
  });
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => cambiarTab(btn.dataset.tab));
});

// ---------- EVENTOS: CALCULADORA ----------
const inputEquipo = document.getElementById('valorEquipo');
const inputPago = document.getElementById('pagoInicial');

// Auto-formato del monto mientras se escribe
function bindMontoInput(input, setterKey) {
  input.addEventListener('input', () => {
    const num = parseMonto(input.value);
    if (setterKey) estado[setterKey] = num;
    if (input.value) input.value = num.toLocaleString('es-CO');
    recalcular();
  });
  input.addEventListener('focus', () => {
    if (input.value) input.value = parseMonto(input.value).toString();
  });
  input.addEventListener('blur', () => {
    if (input.value) input.value = parseMonto(input.value).toLocaleString('es-CO');
  });
}

bindMontoInput(inputEquipo, 'valorEquipo');
bindMontoInput(inputPago, 'pagoInicial');

// Toggle IVA
document.querySelectorAll('.toggle-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    estado.aplicaIva = btn.dataset.iva;
    recalcular();
  });
});

// Plazo
document.querySelectorAll('.plazo-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.plazo-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    estado.meses = parseInt(btn.dataset.meses, 10);
    recalcular();
  });
});

// ---------- EVENTOS: CONFIG ----------
document.getElementById('btn-add-range').addEventListener('click', () => {
  config.rangosSeguro.push({ desde: null, hasta: null, valor: 0 });
  renderSeguroTable();
});

document.getElementById('seguro-tbody').addEventListener('click', (e) => {
  if (!e.target.classList.contains('btn-remove')) return;
  const idx = parseInt(e.target.dataset.idx, 10);
  config.rangosSeguro.splice(idx, 1);
  renderSeguroTable();
});

document.getElementById('btn-save').addEventListener('click', () => {
  const resultado = leerConfigDesdeUI();
  if (resultado.error) {
    mostrarEstadoGuardado(resultado.error, false);
    return;
  }
  config = resultado;
  const ok = saveConfig();
  if (ok) {
    mostrarEstadoGuardado('✔ Configuración guardada correctamente.', true);
    recalcular();
  } else {
    mostrarEstadoGuardado('✖ No se pudo guardar. Revisa la consola.', false);
  }
});

// ---------- INIT ----------
cargarConfigEnUI();
