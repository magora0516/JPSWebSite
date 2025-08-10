// --- Configuración de Supabase ---
const SUPABASE_URL = 'https://zsavhkkhdhlhwmtxqyon.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzYXZoa2toZGhsaHdtdHhxeW9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ3MDU5ODUsImV4cCI6MjA3MDI4MTk4NX0.mecvMpBJDNeebA_bygW3zP_Qwdbp0An-9B8z1WYh59w'
const supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// --- Utilidades ---
const $ = (s) => document.querySelector(s)
const pad = (n) => String(n).padStart(2, '0')
const fmtDateTime = (d) => new Date(d).toLocaleString()
const fmtDate = (d) => new Date(d).toISOString().slice(0,10)
const fmtDuration = (ms) => {
  if (!ms || ms < 0) return '—'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}
function todayStr(){ return fmtDate(Date.now()) }
function setToday(){
  $('#today').textContent = new Date().toLocaleDateString(undefined, {
    weekday:'long', year:'numeric', month:'long', day:'numeric'
  })
}
function uid(){ return Math.random().toString(36).slice(2,10) }

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
async function isEmailAdmin(email){
  if (!email) return false
  const { data, error } = await supa
    .from('admins')
    .select('email')
    .eq('email', email.toLowerCase())
    .maybeSingle()
  if (error){ console.warn('admin check', error); return false }
  return !!data
}

async function refreshSession(){
  const { data: { session } } = await supa.auth.getSession()
  state.session = session
  const email = session?.user?.email || ''
  state.isAdmin = await isEmailAdmin(email)


  // Actualiza panel de autenticación
  $('#authEmail').value = email
  const logged = !!session
  $('#authEmail').style.display = logged ? 'none' : 'inline-block'
  $('#authPwd').style.display   = logged ? 'none' : 'inline-block'
  $('#btnSignIn').style.display = logged ? 'none' : 'inline-block'
  $('#btnSignUp').style.display = logged ? 'none' : 'inline-block'
  $('#btnSignOut').style.display= logged ? 'inline-block' : 'none'


  $('#authInfo').textContent = logged
    ? `Conectado como ${email}${state.isAdmin ? ' · Administrador' : ''}`
    : 'Entra con correo y contraseña'

  // Mostrar u ocultar el contenido principal según sesión
  const mainContent = document.getElementById('mainContent')
  if (mainContent) mainContent.style.display = logged ? 'block' : 'none'

  // Tabs solo para admin
  const tabContainer = document.querySelector('#tabs-container')
  if (state.isAdmin) {
    tabContainer?.classList.remove('hidden')
  } else {
    tabContainer?.classList.add('hidden')
  }




  
}

// --- Funciones de autenticación ---
async function signIn(){
  const email = $('#authEmail').value.trim().toLowerCase()
  const password = $('#authPwd').value
  if (!email || !password){ alert('Correo y contraseña'); return }
  const { error } = await supa.auth.signInWithPassword({ email, password })
  if (error){ alert('No se pudo iniciar sesión: ' + error.message); return }
  await refreshSession()
  // --- Cargar listas y actualizar panel tras iniciar sesión ---
  state.workers = await supaFetchWorkers()
  renderWorkers()
  state.clients = await supaFetchClients()
  renderClients()
  if (state.session) {
    state.activeSession = await getActiveSessionForCurrentUser();
    console.log('Sesión activa encontrada:', state.activeSession);
  } 

}

async function signUp(){
  const email = $('#authEmail').value.trim().toLowerCase()
  const password = $('#authPwd').value
  if (!email || !password){ alert('Correo y contraseña'); return }
  if (password.length < 6){ alert('Mínimo 6 caracteres'); return }
  const { error } = await supa.auth.signUp({ email, password, options:{ emailRedirectTo: window.location.origin } })
  if (error){ alert('No se pudo crear la cuenta: ' + error.message); return }
  $('#authInfo').textContent = 'Cuenta creada. Revisa tu correo si requiere confirmación.'
}
async function signOut(){
  await supa.auth.signOut()
  // --- NUEVO: Limpiar listas al cerrar sesión ---
  state.workers = []
  state.clients = []
  fillWorkerSelects()
  renderClients()
  await refreshSession()
}

// --- Escucha cambios de autenticación ---
supa.auth.onAuthStateChange((_e, _s) => { refreshSession() })

// --- API: Trabajadores ---
async function supaFetchWorkers(){
  const { data, error } = await supa.from('workers').select('*').eq('active', true).order('name')
  if (error) { console.warn('supaFetchWorkers', error); return [] }
  return data || []
}
async function supaInsertWorker(w){
  const { data, error } = await supa.from('workers').insert(w).select().single()
  if (error) { console.log('workers insert error', error); alert('No se pudo guardar el trabajador: ' + error.message); return null }
  return data
}
async function supaDeleteWorker(id){
  const { error } = await supa.from('workers').delete().eq('id', id)
  if (error) { alert('No se pudo eliminar el trabajador: ' + error.message) }
}

// --- API: Clientes ---
async function supaFetchClients(){
  const { data, error } = await supa.from('clients').select('*').order('name')
  if (error) { console.warn('supaFetchClients', error); return [] }
  return data || []
}
async function supaInsertClient(client){
  const { data, error } = await supa.from('clients').insert(client).select().single()
  if (error) { alert('No se pudo guardar el cliente: ' + error.message); return null }
  return data
}
async function supaDeleteClient(id){
  const { error } = await supa.from('clients').delete().eq('id', id)
  if (error) { alert('No se pudo eliminar el cliente: ' + error.message) }
}

// --- API: Agendas ---
async function supaFetchSchedules(){
  const { data, error } = await supa.from('schedules').select('*').order('date', { ascending: true })
  if (error) { console.warn('supaFetchSchedules', error); return [] }
  return data || []
}
async function supaInsertSchedule(s){
  const { data, error } = await supa.from('schedules').insert(s).select().single()
  if (error) { console.log('schedules insert error', error); alert('No se pudo guardar la agenda: ' + error.message); return null }
  return data
}
async function supaDeleteSchedule(id){
  const { error } = await supa.from('schedules').delete().eq('id', id)
  if (error) { alert('No se pudo eliminar la agenda: ' + error.message) }
}

// --- API: Sesiones ---
async function supaFetchSessionsToday(){
  const { data, error } = await supa
    .from('sessions')
    .select('*')
    .eq('date', todayStr())
    .order('start_at', { ascending: false })
  if (error) { console.warn('supaFetchSessionsToday', error); return [] }
  return data || []
}
async function supaInsertSession(s){
  const { data, error } = await supa.from('sessions').insert(s).select().single()
  if (error) { alert('No se pudo iniciar la sesión: ' + error.message); return null }
  return data
}
async function supaUpdateSessionEnd(id, end, loc){
  const { error } = await supa.from('sessions').update({ end_at:end, loc_end_lat:loc?.lat, loc_end_lng:loc?.lng }).eq('id', id)
  if (error) { alert('No se pudo finalizar la sesión: ' + error.message) }
}

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
    .is('end_at', null)
    .maybeSingle();

  if (sessionError) {
    console.error('Error obteniendo sesión activa:', sessionError);
    return null;
  }

  return session || null;
}


// --- Renderizado de tablas y paneles ---
function fillWorkerSelects(){
  const opts = ['<option value="">Selecciona</option>'].concat(state.workers.map(w => `<option value="${w.id}">${w.name}</option>`)).join('')
  $('#workerSel').innerHTML = opts
  $('#schedWorkerSel').innerHTML = opts
}
function renderWorkers(){
  fillWorkerSelects()
  const tbody = $('#workersTable tbody')
  tbody.innerHTML = ''
  state.workers.forEach(w => {
    const tr = document.createElement('tr')
    tr.innerHTML = `<td>${w.name}</td><td>${w.email || ''}</td><td><button class="ghost" data-id="${w.id}">Eliminar</button></td>`
    tbody.appendChild(tr)
  })
}
function renderClients(){
  const tbody = $('#clientsTable tbody')
  tbody.innerHTML = ''
  state.clients.forEach(c => {
    const tr = document.createElement('tr')
    tr.innerHTML = `<td>${c.name}</td><td>${c.location||''}</td><td><button class="ghost" data-id="${c.id}">Eliminar</button></td>`
    tbody.appendChild(tr)
  })
  const clientOpts = ['<option value="">Selecciona un cliente</option>'].concat(state.clients.map(c => `<option value="${c.id}">${c.name}</option>`)).join('')
  $('#workerClient').innerHTML = clientOpts
  $('#schedClient').innerHTML = clientOpts
}
function renderSchedules(){
  const tbody = $('#schedTable tbody')
  tbody.innerHTML = ''
  state.schedules.forEach(s => {
    const client = state.clients.find(c => c.id === s.client_id || c.id === s.clientId)
    const clientName = client ? client.name : '—'
    const workerName = s.worker || (state.workers.find(w => w.id === s.worker_id)?.name) || '—'
    const tr = document.createElement('tr')
    tr.innerHTML = `<td>${s.date}</td><td>${workerName}</td><td>${clientName}</td><td>${s.minutes} min</td><td><button class="ghost" data-id="${s.id}">Eliminar</button></td>`
    tbody.appendChild(tr)
  })
}
function renderLogs(sessions){
  const tbody = $('#logsTable tbody')
  tbody.innerHTML = ''
  sessions.forEach(s => {
    const client = state.clients.find(c => c.id === s.client_id)
    const workerName = s.worker || (state.workers.find(w => w.id === s.worker_id)?.name) || '—'
    const dur = s.end_at ? fmtDuration(new Date(s.end_at) - new Date(s.start_at)) : 'En curso'
    const tr = document.createElement('tr')
    tr.innerHTML = `<td>${workerName}</td><td>${client?client.name:'—'}</td><td>${fmtDateTime(s.start_at)}</td><td>${s.end_at?fmtDateTime(s.end_at):'—'}</td><td>${dur}</td>`
    tbody.appendChild(tr)
  })
}
function renderWorkerPanel(){
  const a = state.activeSession
  $('#btnStart').disabled = !!a
  $('#btnStop').disabled = !a
  if (!a){
    $('#state').textContent = 'Libre'
    $('#startAt').textContent = '—'
    $('#endAt').textContent = '—'
    $('#duration').textContent = '—'
    $('#locStart').textContent = '—'
    $('#locEnd').textContent = '—'
    $('#countdown').textContent = '00:00:00'
    return
  }
  $('#state').textContent = 'En servicio'
  $('#startAt').textContent = fmtDateTime(a.start_at)
  $('#endAt').textContent = a.end_at ? fmtDateTime(a.end_at) : '—'
  const durMs = (a.end_at? new Date(a.end_at) : new Date()) - new Date(a.start_at)
  $('#duration').textContent = fmtDuration(durMs)
  $('#locStart').textContent = a.loc_start_lat ? `${a.loc_start_lat.toFixed(5)}, ${a.loc_start_lng.toFixed(5)}` : '—'
  $('#locEnd').textContent = a.loc_end_lat ? `${a.loc_end_lat.toFixed(5)}, ${a.loc_end_lng.toFixed(5)}` : '—'
}

// --- Cuenta regresiva de sesión ---
let timerHandle = null
function clearTimer(){ if (timerHandle) { clearInterval(timerHandle); timerHandle = null } }
function startCountdownIfPlanned(){
  clearTimer()
  const a = state.activeSession
  if (!a) { $('#countdown').textContent = '00:00:00'; return }
  const plan = state.schedules.find(s =>
    s.date === a.date && s.client_id === a.client_id &&
    ((s.worker_id && a.worker_id && s.worker_id === a.worker_id) ||
     (!s.worker_id && s.worker && a.worker && s.worker.toLowerCase() === a.worker.toLowerCase()))
  )
  if (!plan) { $('#countdown').textContent = '00:00:00'; return }
  const endTarget = new Date(a.start_at).getTime() + plan.minutes * 60000
  function tick(){
    const left = endTarget - Date.now()
    $('#countdown').textContent = fmtDuration(Math.max(left, 0))
    if (left <= 0) $('#countdown').style.color = 'var(--warn)'; else $('#countdown').style.color = 'inherit'
  }
  tick(); timerHandle = setInterval(tick, 1000)
}

// --- Geolocalización ---
function ensureGeo(cb){
  if (!navigator.geolocation) { cb(null); return }
  navigator.geolocation.getCurrentPosition(
    pos => cb({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
    _err => cb(null),
    { enableHighAccuracy:true, maximumAge:30000, timeout:8000 }
  )
}

// --- Inicio y fin de turno ---
async function startShift(){
  const workerId = $('#workerSel').value
  const clientId = $('#workerClient').value
  if (!workerId){ alert('Selecciona un trabajador'); return }
  if (!clientId){ alert('Selecciona un cliente'); return }
  const worker = state.workers.find(w => w.id === workerId)
  ensureGeo(async loc => {
    const session = {
      id: uid(),
      worker: worker.name,
      worker_id: worker.id,
      client_id: clientId,
      date: todayStr(),
      start_at: new Date().toISOString(), end_at: null,
      loc_start_lat: loc?.lat || null, loc_start_lng: loc?.lng || null,
      loc_end_lat: null, loc_end_lng: null
    }
    const saved = await supaInsertSession(session)
    const finalS = saved || session
    state.activeSession = finalS
    renderWorkerPanel(); startCountdownIfPlanned()
    const todaySessions = await supaFetchSessionsToday(); renderLogs(todaySessions)
  })
}
async function stopShift(){
  const a = state.activeSession
  if (!a) return
  ensureGeo(async loc => {
    const end = new Date().toISOString()
    await supaUpdateSessionEnd(a.id, end, loc)
    a.end_at = end
    a.loc_end_lat = loc?.lat || null
    a.loc_end_lng = loc?.lng || null
    state.activeSession = null
    renderWorkerPanel(); clearTimer()
    const todaySessions = await supaFetchSessionsToday(); renderLogs(todaySessions)
  })
}

// --- Tabs y eventos ---
function initTabs(){
  $('#tab-worker').addEventListener('click', () => {
    $('#tab-worker').classList.add('active'); $('#tab-admin').classList.remove('active')
    $('#worker').style.display='grid'; $('#admin').style.display='none'
  })
  $('#tab-admin').addEventListener('click', async () => {
    await refreshSession()
    if (!state.isAdmin){ alert('Acceso solo para administradores'); return }
    $('#tab-admin').classList.add('active'); $('#tab-worker').classList.remove('active')
    $('#worker').style.display='none'; $('#admin').style.display='grid'
    renderLogs(await supaFetchSessionsToday())
  })
}
function bindEvents(){
  // Autenticación
  $('#btnSignIn').addEventListener('click', signIn)
  $('#btnSignUp').addEventListener('click', signUp)
  $('#btnSignOut').addEventListener('click', signOut)

  // Workers
  $('#btnAddWorker').addEventListener('click', async () => {
    await refreshSession()
    if (!state.isAdmin){ alert('Solo admin'); return }
    const name = $('#workerNameNew').value.trim()
    const email = $('#workerEmailNew').value.trim().toLowerCase()
    if (!name){ alert('Escribe el nombre del trabajador'); return }
    if (!email){ alert('Escribe el correo electrónico'); return }
    const w = { id: uid(), name, email, active: true }
    const saved = await supaInsertWorker(w)
    if (!saved) return
    state.workers.push(saved)
    $('#workerNameNew').value = ''
    $('#workerEmailNew').value = ''
    renderWorkers()
  })
  $('#workersTable').addEventListener('click', async e => {
    if (e.target.tagName === 'BUTTON'){
      await refreshSession()
      if (!state.isAdmin){ alert('Solo admin'); return }
      const id = e.target.getAttribute('data-id')
      await supaDeleteWorker(id)
      state.workers = state.workers.filter(w => w.id !== id)
      renderWorkers()
    }
  })

  // Clients
  $('#btnAddClient').addEventListener('click', async () => {
    await refreshSession()
    if (!state.isAdmin){ alert('Solo admin'); return }
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
    if (e.target.tagName === 'BUTTON'){
      await refreshSession()
      if (!state.isAdmin){ alert('Solo admin'); return }
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
    if (!state.isAdmin){ alert('Solo admin'); return }
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
    renderSchedules(); startCountdownIfPlanned()
  })
  $('#schedTable').addEventListener('click', async e => {
    if (e.target.tagName === 'BUTTON'){
      await refreshSession()
      if (!state.isAdmin){ alert('Solo admin'); return }
      const id = e.target.getAttribute('data-id')
      await supaDeleteSchedule(id)
      state.schedules = state.schedules.filter(s => s.id !== id)
      renderSchedules(); startCountdownIfPlanned()
    }
  })

  // Shifts
  $('#btnStart').addEventListener('click', startShift)
  $('#btnStop').addEventListener('click', stopShift)
}

function initForms(){ $('#schedDate').value = todayStr() }

// --- Inicialización principal ---
async function init(){
  setToday(); initTabs(); bindEvents(); initForms(); await refreshSession()
  state.workers = await supaFetchWorkers(); renderWorkers()
  state.clients = await supaFetchClients(); renderClients()
  state.schedules = await supaFetchSchedules(); renderSchedules()
  renderLogs(await supaFetchSessionsToday())
}

// --- Actualización en visibilidad ---
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible'){
    renderWorkerPanel(); startCountdownIfPlanned(); await refreshSession()
    state.workers = await supaFetchWorkers(); renderWorkers()
    state.clients = await supaFetchClients(); renderClients()
    state.schedules = await supaFetchSchedules(); renderSchedules()
    renderLogs(await supaFetchSessionsToday())
  }
})

// --- Arranque ---
init()
