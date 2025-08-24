// --- Configuración de Supabase ---
const SUPABASE_URL = 'https://zsavhkkhdhlhwmtxqyon.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzYXZoa2toZGhsaHdtdHhxeW9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ3MDU5ODUsImV4cCI6MjA3MDI4MTk4NX0.mecvMpBJDNeebA_bygW3zP_Qwdbp0An-9B8z1WYh59w'
const supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// --- Utilidades ---
const $ = (s) => document.querySelector(s)
const pad = (n) => String(n).padStart(2, '0')
const fmtDateTime = (d) => new Date(d).toLocaleString()
const fmtDate = (d) => new Date(d).toISOString().slice(0, 10)
const fmtDuration = (ms) => {
  if (!ms || ms < 0) return '—'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}
function todayStr() {
  const d = new Date()
  d.setHours(0, 0, 0, 0) // quita hora, minuto y segundo
  return fmtDate(d)
}
function setToday() {
  $('#today').textContent = new Date().toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })
}
function uid() { return Math.random().toString(36).slice(2, 10) }

// --- Estado global ---
const state = {
  session: null,
  isAdmin: false,
  workers: [],
  clients: [],
  schedules: [],
  activeSession: null,
  currentWorker: []
}

// --- Autenticación y roles ---
async function isEmailAdmin(email) {
  if (!email) return false
  const { data, error } = await supa
    .from('admins')
    .select('email')
    .eq('email', email.toLowerCase())
    .maybeSingle()
  if (error) { console.warn('admin check', error); return false }
  return !!data
}

function applyRoleUI() {
  const tabs = document.getElementById('tabs-container')
  if (tabs) tabs.classList.toggle('hidden', !state.isAdmin)

  // ocultar select de trabajador en la vista del trabajador para no-admin
  const workerSelectWrap = document.querySelector('label+select#workerSel')?.parentElement
  if (workerSelectWrap) workerSelectWrap.style.display = state.isAdmin ? 'block' : 'none'
}

async function refreshSession() {
  const { data: { session } } = await supa.auth.getSession()
  state.session = session
  const email = session?.user?.email || ''
  state.isAdmin = await isEmailAdmin(email)


  // Actualiza panel de autenticación
  $('#authEmail').value = email
  const logged = !!session
  $('#authEmail').style.display = logged ? 'none' : 'inline-block'
  $('#authPwd').style.display = logged ? 'none' : 'inline-block'
  $('#btnSignIn').style.display = logged ? 'none' : 'inline-block'
  $('#btnSignUp').style.display = logged ? 'none' : 'inline-block'
  $('#btnSignOut').style.display = logged ? 'inline-block' : 'none'

  // Actualiza información de autenticación
  $('#authInfo').textContent = logged
    ? `Conectado como ${email}${state.isAdmin ? ' · Administrador' : ''}`
    : 'Entra con correo y contraseña'

  // Mostrar u ocultar el contenido principal (panel de ingreso de credenciales) según sesión
  const mainContent = document.getElementById('mainContent')
  if (mainContent) mainContent.style.display = logged ? 'block' : 'none'

  // Tabs solo para admin
  const tabContainer = document.querySelector('#tabs-container')
  if (state.isAdmin) {
    tabContainer?.classList.remove('hidden')
  } else {
    tabContainer?.classList.add('hidden')
  }

  applyRoleUI()
  toggleShiftCards()



}

// --- Funciones de autenticación ---
async function signIn() {
  const email = $('#authEmail').value.trim().toLowerCase()
  const password = $('#authPwd').value
  if (!email || !password) { alert('Correo y contraseña'); return }
  const { error } = await supa.auth.signInWithPassword({ email, password })
  if (error) { alert('No se pudo iniciar sesión: ' + error.message); return }
  await refreshSession()

  // --- Cargar listas y actualizar panel tras iniciar sesión ---
  state.workers = await supaFetchWorkers(); renderWorkers()
  state.clients = await supaFetchClients(); renderClients()
  state.schedules = await supaFetchSchedules(); renderSchedules()

  await isSessionActiveForUser(); renderWorkerPanel(); startCountdownIfPlanned(); startTimeOut()

  if (state.session) {
    console.log('Verificacion de usuario')
    await ensureCurrentWorker()

  }

}

async function signUp() {
  const email = $('#authEmail').value.trim().toLowerCase()
  const password = $('#authPwd').value
  if (!email || !password) { alert('Correo y contraseña'); return }
  if (password.length < 6) { alert('Mínimo 6 caracteres'); return }
  const { error } = await supa.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
  if (error) { alert('No se pudo crear la cuenta: ' + error.message); return }
  $('#authInfo').textContent = 'Cuenta creada. Revisa tu correo si requiere confirmación.'

  await refreshSession()

  // --- Cargar listas y actualizar panel tras iniciar sesión ---
  state.workers = await supaFetchWorkers(); renderWorkers()
  state.clients = await supaFetchClients(); renderClients()
  state.schedules = await supaFetchSchedules(); renderSchedules()

  await isSessionActiveForUser(); renderWorkerPanel(); startCountdownIfPlanned(); startTimeOut()

  console.log(state.session)

  if (state.session) {
    console.log('Verificacion de usuario')
    await ensureCurrentWorker()

  }

}


async function ensureCurrentWorker() {
  if (!state.session?.user) return null
  const uid = state.session.user.id
  const email = state.session.user.email?.toLowerCase()

  // si no existe pero hay fila por email, la vinculas
  if (email) {
    const { data: byEmail } = await supa.from('workers').select('id,name,email,user_id').eq('email', email).maybeSingle()
    console.log('usuario encontrado ', byEmail)
    if (byEmail && !byEmail.user_id) {
      console.log('actualizando usuario ', email)
      const { data: patched } = await supa.from('workers').update({ user_id: uid }).eq('id', byEmail.id)
      state.currentWorker = patched || byEmail
      return state.currentWorker
    }

  }
}



async function signOut() {
  await supa.auth.signOut()
  // --- NUEVO: Limpiar listas al cerrar sesión ---
  state.workers = []
  state.clients = []
  fillWorkerSelects()
  renderClients()
  await refreshSession()
}

function toggleShiftCards() {
  const hasActive = !!state.activeSession
  const startCard = document.getElementById('cardStart')
  const statusCard = document.getElementById('cardStatus')
  if (startCard) startCard.style.display = hasActive ? 'none' : 'block'
  if (statusCard) statusCard.style.display = hasActive ? 'block' : 'none'
}

// --- Escucha cambios de autenticación ---
supa.auth.onAuthStateChange((_e, _s) => { refreshSession() })

// --- API: Trabajadores ---
async function supaFetchWorkers() {
  const { data, error } = await supa.from('workers').select('*').eq('active', true).order('name')
  if (error) { console.warn('supaFetchWorkers', error); return [] }
  return data || []
}
async function supaInsertWorker(w) {
  const { data, error } = await supa.from('workers').insert(w).select().single()
  if (error) { console.log('workers insert error', error); alert('No se pudo guardar el trabajador: ' + error.message); return null }
  return data
}
async function supaDeleteWorker(id) {
  const { error } = await supa.from('workers').delete().eq('id', id)
  if (error) { alert('No se pudo eliminar el trabajador: ' + error.message) }
}

// --- API: Clientes ---
async function supaFetchClients() {
  const { data, error } = await supa.from('clients').select('*').order('name')
  if (error) { console.warn('supaFetchClients', error); return [] }
  return data || []
}
async function supaInsertClient(client) {
  const { data, error } = await supa.from('clients').insert(client).select().single()
  if (error) { alert('No se pudo guardar el cliente: ' + error.message); return null }
  return data
}
async function supaDeleteClient(id) {
  const { error } = await supa.from('clients').delete().eq('id', id)
  if (error) { alert('No se pudo eliminar el cliente: ' + error.message) }
}

// --- API: Agendas ---
async function supaFetchSchedules() {
  const today = new Date()
  const tomorrow = new Date()
  tomorrow.setDate(today.getDate() + 1)

  const fmt = d => d.toISOString().split('T')[0]
  const todayStr = fmt(today)
  const tomorrowStr = fmt(tomorrow)

  const { data, error } = await supa
    .from('schedules')
    .select('*')
    .gte('date', todayStr)     // mayor o igual a hoy
    .lte('date', tomorrowStr)  // menor o igual a mañana
    .order('date', { ascending: true })
  if (error) { console.warn('supaFetchSchedules', error); return [] }
  return data || []
}
async function supaInsertSchedule(s) {
  const { data, error } = await supa.from('schedules').insert(s).select().single()
  if (error) { console.log('schedules insert error', error); alert('No se pudo guardar la agenda: ' + error.message); return null }
  return data
}
async function supaDeleteSchedule(id) {
  const { error } = await supa.from('schedules').delete().eq('id', id)
  if (error) { alert('No se pudo eliminar la agenda: ' + error.message) }
}

// --- API: Sesiones ---
async function supaFetchSessionsToday() {

  console.log('Fecha actual:', todayStr())
  const { data, error } = await supa
    .from('sessions')
    .select('*')
    .eq('date', todayStr())
    .order('start_at', { ascending: false })
  if (error) { console.warn('supaFetchSessionsToday', error); return [] }
  return data || []
}
async function supaInsertSession(s) {
  const { data, error } = await supa.from('sessions').insert(s).select().single()
  if (error) { alert('No se pudo iniciar la sesión: ' + error.message); return null }
  return data
}
async function supaUpdateSessionEnd(id, end, loc, addr) {
  console.log('Actualizando sesión', id, 'con fin en', end, 'y loc', loc)
  const { error } = await supa
    .from('sessions')
    .update({
      end_at: end,
      loc_end_lat: loc?.lat,
      loc_end_lng: loc?.lng,
      loc_end_addr: addr
    })
    .eq('id', id)
  if (error) { alert('No se pudo finalizar la sesión: ' + error.message) }
}

//API Exportar CSV
function ymdLocal(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

async function supaFetchSessionsRange(fromYmd, toYmd) {
  const { data, error } = await supa
    .from('sessions')
    .select('*')
    .gte('date', fromYmd)
    .lte('date', toYmd)
    .order('date', { ascending: true })
    .order('start_at', { ascending: true })
  if (error) { console.warn('supaFetchSessionsRange', error); return [] }
  return data || []
}

function csvEscape(v) {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function downloadCsv(filename, csvText) {
  const blob = new Blob([`\uFEFF${csvText}`], { type: 'text/csv;charset=utf-8;' }) // BOM para Excel
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click()
  document.body.removeChild(a); URL.revokeObjectURL(url)
}

function buildSessionsCsv(rows) {
  const headers = [
    'date', 'worker_name', 'client_name', 'duration_hms', 'loc_start_addr', 'loc_end_addr', 'loc_start_url', 'loc_end_url'
  ]
  const lines = [headers.join(',')]

  for (const r of rows) {
    const dur = r.end_at ? fmtDuration(new Date(r.end_at) - new Date(r.start_at)) : ''
    const startUrl = mapsLink(r.loc_start_lat, r.loc_start_lng)
    const endUrl = mapsLink(r.loc_end_lat, r.loc_end_lng)

    lines.push([
      r.date || '',
      r.worker_name || '',
      r.client_name || '',
      dur,
      r.loc_start_addr || '',
      r.loc_end_addr || '',
      startUrl,
      endUrl
    ].map(csvEscape).join(','))
  }
  return lines.join('\n')
}


function mapsLink(lat, lng) {
  if (lat == null || lng == null) return ''
  const a = Number(lat), b = Number(lng)
  if (Number.isNaN(a) || Number.isNaN(b)) return ''
  return `https://maps.apple.com/?ll=${a.toFixed(6)},${b.toFixed(6)}`
}

//Fin API Exportar CSV




async function getActiveSessionForCurrentUser() {
  if (!state.session?.user?.email) return null;

  // Buscar el trabajador vinculado al email
  const { data: worker, error: workerError } = await supa
    .from('workers')
    .select('id, name')
    .eq('email', state.session.user.email)
    .maybeSingle();

  if (workerError || !worker) {
    console.warn('No se encontró trabajador para el usuario actual');
    return null;
  }

  state.currentWorker = worker; // Guardamos el trabajador actual


  // Buscar la sesión activa (sin end_at)
  const { data: session, error: sessionError } = await supa
    .from('sessions')
    .select('*')
    .eq('worker_id', worker.id)
    .eq('date', todayStr())
    .is('end_at', null)
    .maybeSingle();

  if (sessionError) {
    console.error('Error obteniendo sesión activa:', sessionError);
    return null;
  }

  return session || null;
}


// --- Renderizado de tablas y paneles ---
function fillWorkerSelects() {
  const opts = ['<option value="">Selecciona</option>'].concat(state.workers.map(w => `<option value="${w.id}">${w.name}</option>`)).join('')
  $('#workerSel').innerHTML = opts
  $('#schedWorkerSel').innerHTML = opts
}
function renderWorkers() {
  fillWorkerSelects()
  const tbody = $('#workersTable tbody')
  tbody.innerHTML = ''
  state.workers.forEach(w => {
    const tr = document.createElement('tr')
    tr.innerHTML = `<td>${w.name}</td><td>${w.email || ''}</td><td><button class="ghost" data-id="${w.id}">Eliminar</button></td>`
    tbody.appendChild(tr)
  })
}
/* function renderClients() {
  const tbody = $('#clientsTable tbody')
  tbody.innerHTML = ''
  state.clients.forEach(c => {
    const tr = document.createElement('tr')
    tr.innerHTML = `<td>${c.name}</td><td>${c.location || ''}</td><td><button class="ghost" data-id="${c.id}">Eliminar</button></td>`
    tbody.appendChild(tr)
  })
  const clientOpts = ['<option value="">Selecciona un cliente</option>'].concat(state.clients.map(c => `<option value="${c.id}">${c.name}</option>`)).join('')
  $('#workerClient').innerHTML = clientOpts
  $('#schedClient').innerHTML = clientOpts
} */

function renderClients() {
  const tbody = $('#clientsTable tbody'); if (!tbody) return
  tbody.innerHTML = ''
  state.clients.forEach(c => {
    const tr = document.createElement('tr')
    tr.innerHTML = `<td>${c.name}</td><td>${c.location || ''}</td><td><button class="ghost" data-id="${c.id}">Eliminar</button></td>`
    tbody.appendChild(tr)
  })
  // antes llenabas workerClient aquí; ahora:
  renderWorkerClientSelect()

  // si quieres que en admin siga viendo todos:
  const schedClient = $('#schedClient')
  if (schedClient) {
    const clientOpts = ['<option value="">Selecciona un cliente</option>']
      .concat(state.clients.map(c => `<option value="${c.id}">${c.name}</option>`)).join('')
    schedClient.innerHTML = clientOpts
  }
}


function renderSchedules() {
  const tbody = $('#schedTable tbody')
  tbody.innerHTML = ''
  state.schedules.forEach(s => {
    const client = state.clients.find(c => c.id === s.client_id || c.id === s.clientId)
    const clientName = client ? client.name : '—'
    const workerName = s.worker || (state.workers.find(w => w.id === s.worker_id)?.name) || '—'
    const tr = document.createElement('tr')
    tr.innerHTML = `<td>${s.date}</td><td>${workerName}</td><td>${clientName}</td><td>${s.minutes} min</td><td><button class="ghost" data-id="${s.id}">X</button></td>`
    tbody.appendChild(tr)
  })
}
function renderLogs(sessions) {
  const tbody = $('#logsTable tbody')
  tbody.innerHTML = ''
  sessions.forEach(s => {
    const client = state.clients.find(c => c.id === s.client_id)
    const workerName = s.worker || (state.workers.find(w => w.id === s.worker_id)?.name) || '—'
    const dur = s.end_at ? fmtDuration(new Date(s.end_at) - new Date(s.start_at)) : 'En curso'
    const tr = document.createElement('tr')
    tr.innerHTML = `<td>${workerName}</td><td>${client ? client.name : '—'}</td><td>${fmtDateTime(s.start_at)}</td><td>${s.end_at ? fmtDateTime(s.end_at) : '—'}</td><td>${dur}</td>`
    tbody.appendChild(tr)
  })
}
function renderWorkerPanel() {
  const a = state.activeSession
  // Actualizar botones y estado
  $('#btnStart').disabled = !!a
  $('#btnStop').disabled = !a

  if (!a) {
    $('#state').textContent = 'Libre'
    $('#startAt').textContent = '—'
    $('#duration').textContent = '00:00:00'
    $('#locStart').textContent = '—'
    $('#countdown').textContent = '00:00:00'
    toggleShiftCards()
    return
  }
  $('#state').textContent = 'En servicio'
  $('#startAt').textContent = fmtDateTime(a.start_at)
  const durMs = (a.end_at ? new Date(a.end_at) : new Date()) - new Date(a.start_at)
  $('#locStart').textContent = a.loc_start_addr ? a.loc_start_addr : '—'
  //$('#duration').textContent = fmtDuration(durMs)
  //$('#locStart').textContent = a.loc_start_lat ? `${a.loc_start_lat.toFixed(5)}, ${a.loc_start_lng.toFixed(5)}` : '—'
  //$('#locEnd').textContent = a.loc_end_lat ? `${a.loc_end_lat.toFixed(5)}, ${a.loc_end_lng.toFixed(5)}` : '—'
  toggleShiftCards()
}

function clientsScheduledToday() {
  const today = todayStr()
  const ids = new Set(state.schedules.filter(s => s.date === today).map(s => s.client_id))
  return state.clients.filter(c => ids.has(c.id))
}

function renderWorkerClientSelect() {
  const onlyToday = $('#chkOnlyToday')?.checked
  const list = onlyToday ? clientsScheduledToday() : state.clients
  const opts = (list.length
    ? ['<option value="">Selecciona un cliente</option>']
      .concat(list.map(c => `<option value="${c.id}">${c.name}</option>`))
    : ['<option value="">No hay clientes</option>']
  ).join('')
  const el = $('#workerClient')
  if (el) el.innerHTML = opts
}

// --- Cuenta regresiva de sesión ---
let timerHandle = null
let timerHandleDuration = null

function clearTimer() { if (timerHandle) { clearInterval(timerHandle); timerHandle = null } }
function clearTimerDuration() { if (timerHandleDuration) { clearTimeout(timerHandleDuration); timerHandleDuration = null } }

async function isSessionActiveForUser() {
  if (state.session) {
    state.activeSession = await getActiveSessionForCurrentUser();
    console.log('Sesión activa encontrada')
  }

}

function startCountdownIfPlanned() {
  clearTimer()

  const a = state.activeSession

  if (!a) { $('#countdown').textContent = '00:00:00'; return }
  // Buscar si hay un plan para la sesión activa
  // (basado en fecha, cliente y trabajador)
  const plan = state.schedules.find(s =>
    s.date === a.date && s.client_id === a.client_id
  )

  if (!plan) { $('#countdown').textContent = '00:00:00'; return }
  const endTarget = new Date(a.start_at).getTime() + plan.minutes * 60000
  function tick() {
    const left = endTarget - Date.now()
    $('#countdown').textContent = fmtDuration(Math.max(left, 0))
    if (left <= 0) $('#countdown').style.color = 'var(--warn)'; else $('#countdown').style.color = 'inherit'
  }
  tick()
  timerHandle = setInterval(tick, 1000)
}

function startTimeOut() {
  clearTimerDuration()

  const a = state.activeSession

  if (!a) { $('#duration').textContent = '00:00:00'; return }



  function tickDuration() {
    const elapsed = Date.now() - new Date(a.start_at).getTime()
    $('#duration').textContent = fmtDuration(Math.max(elapsed, 0))
    $('#duration').style.color = 'inherit'
  }

  tickDuration()
  timerHandleDuration = setInterval(tickDuration, 1000)

}

// --- Geolocalización ---
function ensureGeo(cb) {
  if (!navigator.geolocation) { cb(null); return }
  navigator.geolocation.getCurrentPosition(
    pos => cb({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
    _err => cb(null),
    { enableHighAccuracy: true, maximumAge: 30000, timeout: 8000 }
  )
}

async function reverseGeocode(lat, lon) {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", lat);
  url.searchParams.set("lon", lon);
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("zoom", "18");            // forzar nivel de detalle
  url.searchParams.set("email", "services@jpsmagiccleaning.com"); // identificación

  const res = await fetch(url.toString(), {
    headers: { "Accept": "application/json" }
  });
  if (!res.ok) throw new Error("Error " + res.status);
  const data = await res.json();

  // Toma dirección “bonita” si existe; si no, compón con campos
  const pretty =
    `${data.address.house_number ?? ""} ${data.address.road ?? ""}, ${data.address.city ?? data.address.town ?? data.address.village ?? ""}, ${data.address.state ?? ""} ${data.address.postcode ?? ""}`.replace(/\s+,/g, ",").trim();

  //  data.display_name ||
  //  `${data.address.house_number ?? ""} ${data.address.road ?? ""}, ${data.address.city ?? data.address.town ?? data.address.village ?? ""}, ${data.address.state ?? ""} ${data.address.postcode ?? ""}, ${data.address.country ?? ""}`.replace(/\s+,/g, ",").trim();
  //4394, Southwest 10th Place, Lakeview, Deerfield Beach, Broward County, Florida, 33442, United States

  return { pretty, raw: data };
}

// helper de timeout para promesas
// (para evitar que se cuelgue la app si no responde el servidor)
async function withTimeout(promise, ms = 5000) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))
  ])
}



async function startShift() {
  await refreshSession()
  const clientId = $('#workerClient').value
  if (!clientId) { alert('Selecciona un cliente'); return }

  let worker // decide el worker según rol
  if (state.isAdmin) {
    const workerId = $('#workerSel').value
    if (!workerId) { alert('Selecciona un trabajador'); return }
    worker = state.workers.find(w => w.id === workerId)
  } else {
    if (!state.currentWorker) { await ensureCurrentWorker() }
    worker = state.currentWorker
  }
  if (!worker) { alert('Trabajador inválido'); return }

  ensureGeo(async loc => {
    let locStartAddr = null
    if (loc) {
      try {
        const rev = await withTimeout(reverseGeocode(loc.lat, loc.lng), 5000)
        locStartAddr = rev?.pretty || null
      } catch (err) { /*ignora errores de geocodificación*/ }
    }
    const session = {
      id: uid(),
      worker: worker.name,
      worker_id: worker.id,           // RLS depende de esto
      client_id: clientId,
      date: todayStr(),
      start_at: new Date().toISOString(),
      end_at: null,
      loc_start_lat: loc?.lat ?? null,
      loc_start_lng: loc?.lng ?? null,
      loc_start_addr: locStartAddr,
      loc_end_lat: null,
      loc_end_lng: null,
      loc_end_addr: null
    }
    const saved = await supaInsertSession(session)

    const finalS = saved || session
    state.activeSession = finalS
    renderWorkerPanel(); startCountdownIfPlanned(); startTimeOut()
    const todaySessions = await supaFetchSessionsToday();
    renderLogs(todaySessions)
  })
}


async function stopShift() {
  const a = state.activeSession
  if (!a) return
  ensureGeo(async loc => {
    const end = new Date().toISOString()
    let endAddr = null
    if (loc) {
      try {
        const rev = await withTimeout(reverseGeocode(loc.lat, loc.lng), 5000)
        endAddr = rev?.pretty || null
      } catch (err) { /*ignora errores de geocodificación*/ }
    }
    console.log('Finalizando sesión', a.id, 'a las', end, 'en la direccion', endAddr)
    await supaUpdateSessionEnd(a.id, end, loc, endAddr)
    a.end_at = end
    a.loc_end_lat = loc?.lat || null
    a.loc_end_lng = loc?.lng || null
    a.loc_end_addr = endAddr || null
    // Actualizar estado global
    state.activeSession = null
    renderWorkerPanel(); clearTimer()
    const todaySessions = await supaFetchSessionsToday(); renderLogs(todaySessions)
  })
}

// --- Tabs y eventos ---
function initTabs() {
  $('#tab-worker').addEventListener('click', () => {
    $('#tab-worker').classList.add('active'); $('#tab-admin').classList.remove('active')
    $('#worker').style.display = 'grid'; $('#admin').style.display = 'none'
  })
  $('#tab-admin').addEventListener('click', async () => {
    await refreshSession()
    if (!state.isAdmin) { alert('Acceso solo para administradores'); return }
    $('#tab-admin').classList.add('active'); $('#tab-worker').classList.remove('active')
    $('#worker').style.display = 'none'; $('#admin').style.display = 'grid'
    renderLogs(await supaFetchSessionsToday())
  })
}
function bindEvents() {
  // Autenticación
  $('#btnSignIn').addEventListener('click', signIn)
  $('#btnSignUp').addEventListener('click', signUp)
  $('#btnSignOut').addEventListener('click', signOut)

  // Workers
  $('#btnAddWorker').addEventListener('click', async () => {
    await refreshSession()
    if (!state.isAdmin) { alert('Solo admin'); return }
    const name = $('#workerNameNew').value.trim()
    const email = $('#workerEmailNew').value.trim().toLowerCase()
    if (!name) { alert('Escribe el nombre del trabajador'); return }
    if (!email) { alert('Escribe el correo electrónico'); return }
    const w = { id: uid(), name, email, active: true }
    const saved = await supaInsertWorker(w)
    if (!saved) return
    state.workers.push(saved)
    $('#workerNameNew').value = ''
    $('#workerEmailNew').value = ''
    renderWorkers()
  })
  $('#workersTable').addEventListener('click', async e => {
    if (e.target.tagName === 'BUTTON') {
      await refreshSession()
      if (!state.isAdmin) { alert('Solo admin'); return }
      const id = e.target.getAttribute('data-id')
      await supaDeleteWorker(id)
      state.workers = state.workers.filter(w => w.id !== id)
      renderWorkers()
    }
  })

  // Clients
  $('#btnAddClient').addEventListener('click', async () => {
    await refreshSession()
    if (!state.isAdmin) { alert('Solo admin'); return }
    const name = $('#clientName').value.trim()
    const location = $('#clientLocation').value.trim()
    if (!name) { alert('Escribe el nombre del cliente'); return }
    const newClient = { id: uid(), name, location }
    const saved = await supaInsertClient(newClient)
    if (!saved) return
    state.clients.push(saved)
    $('#clientName').value = ''
    $('#clientLocation').value = ''
    renderClients()
  })
  $('#clientsTable').addEventListener('click', async e => {
    if (e.target.tagName === 'BUTTON') {
      await refreshSession()
      if (!state.isAdmin) { alert('Solo admin'); return }
      const id = e.target.getAttribute('data-id')
      await supaDeleteClient(id)
      state.clients = state.clients.filter(c => c.id !== id)
      state.schedules = state.schedules.filter(s => s.client_id !== id)
      renderClients(); renderSchedules(); renderLogs(await supaFetchSessionsToday())
    }
  })

  // Schedules
  $('#btnSchedule').addEventListener('click', async () => {
    await refreshSession()
    if (!state.isAdmin) { alert('Solo admin'); return }
    const date = $('#schedDate').value || todayStr()
    const workerId = $('#schedWorkerSel').value
    const clientId = $('#schedClient').value
    const minutes = parseInt($('#schedMinutes').value, 10) || 60

    if (!workerId) { alert('Selecciona un trabajador'); return }
    if (!clientId) { alert('Selecciona un cliente'); return }
    const worker = state.workers.find(w => w.id === workerId)
    const sched = { id: uid(), date, worker: worker.name, worker_id: worker.id, client_id: clientId, minutes }
    const saved = await supaInsertSchedule(sched)
    if (!saved) return
    const finalSched = saved
    finalSched.clientId = finalSched.client_id
    state.schedules.push(finalSched)
    // Limpiar campos solo si se guardó correctamente
    $('#schedDate').value = todayStr()
    $('#schedWorkerSel').value = ''
    $('#schedClient').value = ''
    $('#schedMinutes').value = 60
    renderSchedules(); startCountdownIfPlanned(); startTimeOut()
  })
  $('#schedTable').addEventListener('click', async e => {
    if (e.target.tagName === 'BUTTON') {
      await refreshSession()
      if (!state.isAdmin) { alert('Solo admin'); return }
      const id = e.target.getAttribute('data-id')
      await supaDeleteSchedule(id)
      state.schedules = state.schedules.filter(s => s.id !== id)
      renderSchedules(); startCountdownIfPlanned(); startTimeOut()
    }
  })

  //btn calendario
  $('#btnCalendar')?.addEventListener('click', () => {
    window.location.href = 'calendar.html'
  })


  // Shifts
  $('#btnStart').addEventListener('click', startShift)
  $('#btnStop').addEventListener('click', stopShift)

  // Checkbox para clientes programados hoy
  $('#chkOnlyToday')?.addEventListener('change', renderWorkerClientSelect)

  //Exportar CSV
  $('#btnExportCsv')?.addEventListener('click', async (e) => {
    e.preventDefault()
    await refreshSession()
    // Opcional: solo admin exporta
    if (!state.isAdmin) { alert('Solo admin'); return }

    // Fechas
    const fromEl = $('#exportFrom'), toEl = $('#exportTo')
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const defFrom = new Date(today); defFrom.setDate(defFrom.getDate() - 7)

    const fromYmd = fromEl?.value || ymdLocal(defFrom)
    const toYmd = toEl?.value || ymdLocal(today)

    if (fromYmd > toYmd) { alert('Rango inválido: Desde > Hasta'); return }

    // Asegura catálogos cargados
    if (!state.workers?.length) state.workers = await supaFetchWorkers()
    if (!state.clients?.length) state.clients = await supaFetchClients()

    // Consulta
    const sessions = await supaFetchSessionsRange(fromYmd, toYmd)

    // Enriquecer con nombres
    const wById = Object.fromEntries(state.workers.map(w => [w.id, w]))
    const cById = Object.fromEntries(state.clients.map(c => [c.id, c]))
    const rows = sessions.map(s => ({
      ...s,
      worker_name: s.worker || wById[s.worker_id]?.name || '',
      client_name: cById[s.client_id]?.name || '',
      loc_start_addr: s.loc_start_addr || '',
      loc_end_addr: s.loc_end_addr || ''
    }))

    // CSV y descarga
    const csv = buildSessionsCsv(rows)
    const fname = `registros_${fromYmd}_a_${toYmd}.csv`
    downloadCsv(fname, csv)
  })
}


function initForms() { $('#schedDate').value = todayStr() }

// --- Inicialización principal ---
async function init() {
  setToday(); initTabs(); bindEvents(); initForms();
  state.workers = await supaFetchWorkers(); renderWorkers()
  state.clients = await supaFetchClients(); renderClients()
  state.schedules = await supaFetchSchedules(); renderSchedules()
  await isSessionActiveForUser(); renderWorkerPanel(); startCountdownIfPlanned(); startTimeOut(); await refreshSession()
  renderLogs(await supaFetchSessionsToday())

  console.log('Pagina recargada')
}

// --- Actualización en visibilidad ---
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible') {
    renderWorkerPanel(); startCountdownIfPlanned(); startTimeOut(); await refreshSession()
    state.workers = await supaFetchWorkers(); renderWorkers()
    state.clients = await supaFetchClients(); renderClients()
    state.schedules = await supaFetchSchedules(); renderSchedules()
    renderLogs(await supaFetchSessionsToday())
    console.log('Página visible, actualizando datos...')
  }
})

// --- Arranque ---
init()
