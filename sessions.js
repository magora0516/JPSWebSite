// Supabase
const SUPABASE_URL = 'https://zsavhkkhdhlhwmtxqyon.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzYXZoa2toZGhsaHdtdHhxeW9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ3MDU5ODUsImV4cCI6MjA3MDI4MTk4NX0.mecvMpBJDNeebA_bygW3zP_Qwdbp0An-9B8z1WYh59w'
const supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Utils
const $ = s => document.querySelector(s)
const fmtHMS = ms => {
    if (!ms || ms < 0) return ''
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000)
    const pad = n => String(n).padStart(2, '0')
    return `${pad(h)}:${pad(m)}:${pad(s)}`
}
function ymdLocal(d) { const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0'); return `${y}-${m}-${day}` }
function uid() { return Math.random().toString(36).slice(2, 10) }
function toIso(dateStr, timeStr) { return timeStr ? `${dateStr}T${timeStr}:00.000Z` : null } // simplificado
async function geocodeAddress(q) {
    const u = new URL('https://nominatim.openstreetmap.org/search')
    u.searchParams.set('format', 'jsonv2'); u.searchParams.set('q', q); u.searchParams.set('limit', '1')
    const r = await fetch(u.toString(), { headers: { 'Accept': 'application/json' } })
    if (!r.ok) return null
    const arr = await r.json()
    if (!arr.length) return null
    return { lat: parseFloat(arr[0].lat), lng: parseFloat(arr[0].lon), display: arr[0].display_name }
}






// Estado
const state = { isAdmin: false, session: null, workers: [], clients: [], schedules: [], rows: [], swRows: [] }

// Auth y datos base
async function isEmailAdmin(email) {
    if (!email) return false
    const { data } = await supa.from('admins').select('email').eq('email', email.toLowerCase()).maybeSingle()
    return !!data
}
async function refreshSession() {
    const { data: { session } } = await supa.auth.getSession()
    state.session = session
    const email = session?.user?.email || ''
    state.isAdmin = await isEmailAdmin(email)
    if (!session || !state.isAdmin) { location.href = 'index.html#tab-worker'; return }
}
async function fetchWorkers() { const { data } = await supa.from('workers').select('id,name').eq('active', true).order('name'); return data || [] }
async function fetchClients() { const { data } = await supa.from('clients').select('id,name').order('name'); return data || [] }
async function fetchSchedulesRange(from, to) {
    const { data } = await supa.from('schedules').select('id,date,client_id,worker_id').gte('date', from).lte('date', to)
    return data || []
}

// Sesiones
async function fetchSessionsRange(from, to) {
    const { data, error } = await supa
        .from('sessions')
        .select('*')
        .gte('date', from).lte('date', to)
        .order('date', { ascending: true })
        .order('start_at', { ascending: true })
    if (error) { console.warn('fetchSessionsRange', error); return [] }
    return data || []
}
async function fetchSessionWorkers(sessionId) {
    const { data } = await supa.from('session_workers').select('*').eq('session_id', sessionId).order('start_at', { ascending: true })
    return data || []
}
async function upsertSession(patch) {
    const { data, error } = await supa.from('sessions').update(patch).eq('id', patch.id).select().maybeSingle()
    if (error) { alert('No se pudo guardar la sesión: ' + error.message); return null }
    return data
}
async function deleteSession(id) {
    const { error } = await supa.from('sessions').delete().eq('id', id)
    if (error) { alert('No se pudo eliminar: ' + error.message) }
}
async function insertSessionWorker(row) {
    const { data, error } = await supa.from('session_workers').insert(row).select().maybeSingle()
    if (error) { alert('No se pudo agregar trabajador: ' + error.message); return null }
    return data
}


async function deleteSessionWorker(id) {
    const { error } = await supa.from('session_workers').delete().eq('id', id)
    if (error) { alert('No se pudo quitar trabajador: ' + error.message) }
}

// UI selects
function fillSelects() {
    const cSel = $('#e_client'); cSel.innerHTML = ['<option value="">Selecciona</option>'].concat(state.clients.map(c => `<option value="${c.id}">${c.name}</option>`)).join('')
    const swSel = $('#sw_worker'); swSel.innerHTML = ['<option value="">Trabajador</option>'].concat(state.workers.map(w => `<option value="${w.id}">${w.name}</option>`)).join('')
}

// Programada: detecta si existe schedule que coincida por fecha+cliente (y opcionalmente trabajador)
function isScheduled(sess) {
    return state.schedules.some(s => s.date === sess.date && s.client_id === sess.client_id && (!s.worker_id || s.worker_id === sess.worker_id))
}

// Render tabla principal
function renderTable() {
    const cById = Object.fromEntries(state.clients.map(c => [c.id, c]))
    const tb = $('#tblSessions tbody'); tb.innerHTML = ''
    for (const r of state.rows) {
        const dur = r.end_at ? fmtHMS(new Date(r.end_at) - new Date(r.start_at)) : ''
        const tr = document.createElement('tr')
        tr.innerHTML = `
      <td>${r.date}</td>
      <td>${cById[r.client_id]?.name || '—'}</td>
      <td>${r.start_at ? new Date(r.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
      <td>${r.end_at ? new Date(r.end_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
      <td>${dur}</td>
      <td>${isScheduled(r) ? 'Sí' : 'No'}</td>
      <td><button class="btn-link" data-id="${r.id}">Editar</button></td>
    `
        tb.appendChild(tr)
    }
}

function sessionTotalMinutes(r) {
    if (r.start_at && r.end_at) return Math.max(0, Math.round((new Date(r.end_at) - new Date(r.start_at)) / 60000))
    const m = parseInt($('#e_minutes').value || '0', 10)
    return Number.isFinite(m) ? m : 0
}


// Editar
async function openEdit(id) {
    const r = state.rows.find(x => x.id === id); if (!r) return
    $('#e_id').value = r.id
    $('#e_client').value = r.client_id
    $('#e_date').value = r.date
    $('#e_scheduled').value = isScheduled(r) ? 'Sí' : 'No'
    // tiempos
    if (r.start_at) { $('#e_start_time').value = new Date(r.start_at).toISOString().slice(11, 16) } else $('#e_start_time').value = ''
    if (r.end_at) { $('#e_end_time').value = new Date(r.end_at).toISOString().slice(11, 16) } else $('#e_end_time').value = ''
    const durMin = (r.start_at && r.end_at) ? Math.round((new Date(r.end_at) - new Date(r.start_at)) / 60000) : (r.minutes || 0)
    $('#e_minutes').value = String(durMin || 0)
    // direcciones
    $('#e_loc_start_addr').value = r.loc_start_addr || ''
    $('#e_loc_end_addr').value = r.loc_end_addr || ''

    // trabajadores sesión
    state.swRows = await fetchSessionWorkers(r.id)
    renderSW()
    $('#dlgEdit').showModal()
}

function renderSW(){
    const wById = Object.fromEntries(state.workers.map(w=>[w.id,w]))
    const tb = document.querySelector('#tblSW tbody'); tb.innerHTML = ''
    for (const sw of state.swRows){
      const tr = document.createElement('tr')
      tr.innerHTML = `
        <td>${wById[sw.worker_id]?.name || '—'}</td>
        <td>${sw.full_duration ? 'Sí' : 'No'}</td>
        <td>${sw.full_duration ? '' : (sw.minutes ?? '')}</td>
        <td>${sw.full_duration ? '' : (sw.start_at ? new Date(sw.start_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '')}</td>
        <td>${sw.full_duration ? '' : (sw.end_at ? new Date(sw.end_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '')}</td>
        <td><button type="button" class="danger" data-swid="${sw.id}">Quitar</button></td>
      `
      tb.appendChild(tr)
    }
  }
  

  function bindEvents() {
    $('#btnVolver')?.addEventListener('click', () => location.href = 'index.html#tab-admin')
  
    $('#formFilter')?.addEventListener('submit', async e => {
      e.preventDefault()
      const from = $('#fFrom')?.value || ymdLocal(new Date())
      const to   = $('#fTo')?.value   || from
      ;[state.workers, state.clients, state.schedules, state.rows] = await Promise.all([
        fetchWorkers(), fetchClients(), fetchSchedulesRange(from, to), fetchSessionsRange(from, to)
      ])
      fillSelects()
      renderTable()
    })
  
    $('#tblSessions')?.addEventListener('click', e => {
      const id = e.target.closest('button[data-id]')?.getAttribute('data-id')
      if (id) openEdit(id)
    })
  
    document.querySelectorAll('input[name="modeTime"]')?.forEach(r => {
      r.addEventListener('change', () => {
        const m = document.querySelector('input[name="modeTime"]:checked')?.value || 'range'
        $('#timeByRange').style.display    = m === 'range'    ? 'grid' : 'none'
        $('#timeByDuration').style.display = m === 'duration' ? 'grid' : 'none'
      })
    })
  
    $('#btnGeocodeStart')?.addEventListener('click', async () => {
      const q = $('#e_loc_start_addr')?.value?.trim(); if (!q) return
      const g = await geocodeAddress(q); if (!g) { alert('No encontrado'); return }
      $('#e_loc_start_addr').value = g.display
      await upsertSession({ id: $('#e_id')?.value, loc_start_lat: g.lat, loc_start_lng: g.lng, loc_start_addr: g.display })
    })
    $('#btnGeocodeEnd')?.addEventListener('click', async () => {
      const q = $('#e_loc_end_addr')?.value?.trim(); if (!q) return
      const g = await geocodeAddress(q); if (!g) { alert('No encontrado'); return }
      $('#e_loc_end_addr').value = g.display
      await upsertSession({ id: $('#e_id')?.value, loc_end_lat: g.lat, loc_end_lng: g.lng, loc_end_addr: g.display })
    })
  
    document.getElementById('btnAddSW')?.addEventListener('click', async () => {
      const session_id = document.getElementById('e_id')?.value
      const worker_id  = document.getElementById('sw_worker')?.value
      const full       = document.getElementById('sw_full')?.checked
      if (!worker_id) { alert('Selecciona trabajador'); return }
  
      let minutes = null, start_at = null, end_at = null
      if (!full) {
        const date = document.getElementById('e_date')?.value
        const s = document.getElementById('sw_start')?.value
        const e = document.getElementById('sw_end')?.value
        if (s) start_at = toIso(date, s)
        if (e) end_at   = toIso(date, e)
        const mField = document.getElementById('sw_minutes')?.value
        if (mField) {
          minutes = parseInt(mField, 10)
          if (!Number.isFinite(minutes) || minutes < 0) { alert('Minutos inválidos'); return }
        } else if (start_at && end_at) {
          minutes = Math.max(0, Math.round((new Date(end_at) - new Date(start_at)) / 60000))
        } else {
          alert('Define minutos o rango inicio/fin para un tramo parcial')
          return
        }
      }
  
      const saved = await insertSessionWorker({ id: uid(), session_id, worker_id, full_duration: full, minutes, start_at, end_at })
      if (saved) { state.swRows.push(saved); renderSW() }
    })
  
    $('#tblSW')?.addEventListener('click', async e => {
      const id = e.target.closest('button[data-swid]')?.getAttribute('data-swid')
      if (!id) return
      await deleteSessionWorker(id)
      state.swRows = state.swRows.filter(x => x.id !== id)
      renderSW()
    })
  
    $('#btnCancel')?.addEventListener('click', () => $('#dlgEdit')?.close())
    $('#btnDel')?.addEventListener('click', async () => {
      const id = $('#e_id')?.value
      if (!confirm('¿Eliminar la sesión?')) return
      await deleteSession(id)
      state.rows = state.rows.filter(x => x.id !== id)
      renderTable()
      $('#dlgEdit')?.close()
    })
  
    $('#formEdit')?.addEventListener('submit', async e => {
      e.preventDefault()
      const id        = $('#e_id')?.value
      const date      = $('#e_date')?.value
      const client_id = $('#e_client')?.value
      const mode      = document.querySelector('input[name="modeTime"]:checked')?.value || 'range'
  
      let start_at = null, end_at = null
      if (mode === 'range') {
        const t1 = $('#e_start_time')?.value, t2 = $('#e_end_time')?.value
        start_at = t1 ? toIso(date, t1) : null
        end_at   = t2 ? toIso(date, t2) : null
      } else {
        const minutes = parseInt($('#e_minutes')?.value || '0', 10)
        if (!Number.isNaN(minutes) && minutes > 0) {
          const t1 = $('#e_start_time')?.value || '09:00'
          start_at = toIso(date, t1)
          end_at   = new Date(new Date(start_at).getTime() + minutes * 60000).toISOString()
        }
      }
  
      const patch = {
        id, date, client_id,
        start_at, end_at,
        loc_start_addr: $('#e_loc_start_addr')?.value || null,
        loc_end_addr:   $('#e_loc_end_addr')?.value   || null
      }
  
      const saved = await upsertSession(patch)
      if (saved) {
        const i = state.rows.findIndex(x => x.id === id)
        if (i >= 0) state.rows[i] = saved
        renderTable()
        $('#dlgEdit')?.close()
      }
    })
  
    document.getElementById('sw_full')?.addEventListener('change', () => {
      const full = document.getElementById('sw_full')?.checked
      document.getElementById('sw_minutes').disabled = full
      document.getElementById('sw_start').disabled   = full
      document.getElementById('sw_end').disabled     = full
    })
  }
  

async function init() {
    await refreshSession()
    // rango por defecto: hoy
    const today = new Date(); const ymd = ymdLocal(today)
    $('#fFrom').value = ymd; $('#fTo').value = ymd

    state.workers = await fetchWorkers()
    state.clients = await fetchClients()
    state.schedules = await fetchSchedulesRange(ymd, ymd)
    fillSelects()

    state.rows = await fetchSessionsRange(ymd, ymd)
    renderTable()
    bindEvents()
}
init()
