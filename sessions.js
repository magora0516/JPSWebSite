// Supabase (igual que en tu app)
const SUPABASE_URL = 'https://zsavhkkhdhlhwmtxqyon.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzYXZoa2toZGhsaHdtdHhxeW9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ3MDU5ODUsImV4cCI6MjA3MDI4MTk4NX0.mecvMpBJDNeebA_bygW3zP_Qwdbp0An-9B8z1WYh59w'
const supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

//Helpers
const $ = s => document.querySelector(s)
const pad = n => String(n).padStart(2, '0')
const fmtDateTime = d => new Date(d).toLocaleString()
const fmtDuration = (ms) => {
    if (!ms || ms < 0) return '—'
    const h = Math.floor(ms / 3600000)
    const m = Math.floor((ms % 3600000) / 60000)
    const s = Math.floor((ms % 60000) / 1000)
    return `${pad(h)}:${pad(m)}:${pad(s)}`
}
const ymdLocal = d => {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}
function todayStr() {
    const d = new Date(); d.setHours(0, 0, 0, 0); return ymdLocal(d)
}

const state = { isAdmin: false, session: null, clients: [], workers: [], rows: [] }

async function isEmailAdmin(email) {
    if (!email) return false
    const { data, error } = await supa.from('admins').select('email').eq('email', email.toLowerCase()).maybeSingle()
    if (error) { console.warn(error); return false }
    return !!data
}
async function refreshSession() {
    const { data: { session } } = await supa.auth.getSession()
    console.log('Session:', session)
    state.session = session
    const email = session?.user?.email || ''
    state.isAdmin = await isEmailAdmin(email)
    if (!session) { window.location.href = 'index.html#tab-worker'; return }
    if (!state.isAdmin) { window.location.href = 'index.html#tab-worker'; return }
}

async function fetchWorkers() {
    const { data, error } = await supa.from('workers').select('id,name,active').eq('active', true).order('name')
    if (error) { console.warn('workers', error); return [] }
    return data || []
}
async function fetchClients() {
    const { data, error } = await supa.from('clients').select('id,name').order('name')
    if (error) { console.warn('clients', error); return [] }
    return data || []
}

async function fetchSessionsRange(fromYmd, toYmd, workerId = null, clientId = null) {
    let q = supa.from('sessions').select('*')
        .gte('date', fromYmd).lte('date', toYmd)
        .order('date', { ascending: true })
        .order('start_at', { ascending: true })
    if (workerId) q = q.eq('worker_id', workerId)
    if (clientId) q = q.eq('client_id', clientId)
    const { data, error } = await q
    if (error) { console.warn('sessions', error); return [] }
    return data || []
}

async function fetchAttendees(sessionId) {
    const { data, error } = await supa
        .from('session_attendees')
        .select('worker_id, role, minutes, notes')
        .eq('session_id', sessionId)
    if (error) { console.warn('attendees', error); return [] }
    return data || []
}

async function upsertAttendees(sessionId, list) {
    // estrategia sencilla: borrar e insertar (transacción idealmente en RPC; aquí client-side)
    const { error: delErr } = await supa.from('session_attendees').delete().eq('session_id', sessionId)
    if (delErr) { alert('No se pudieron limpiar asistentes: ' + delErr.message); return false }
    if (!list.length) return true
    const rows = list.map(a => ({ session_id: sessionId, ...a }))
    const { error: insErr } = await supa.from('session_attendees').insert(rows)
    if (insErr) { alert('No se pudieron guardar asistentes: ' + insErr.message); return false }
    return true
}

function attendeeRowTemplate(value = {}) {
    const workerOptions = ['<option value="">Selecciona</option>']
        .concat(state.workers.map(w => `<option value="${w.id}">${w.name}</option>`)).join('')
    const sel = `<select class="att-worker">${workerOptions}</select>`
    const minutes = `<input class="att-minutes" type="number" min="0" step="5" placeholder="min" style="max-width:90px">`
    const removeBtn = `<button type="button" class="att-remove ghost" title="Quitar">–</button>`

    const row = document.createElement('div')
    row.className = 'att-row'
    row.style.display = 'contents' // respeta la grid del contenedor
    row.innerHTML = `
      <div>${sel}</div>
      <div>${removeBtn}</div>
      <div>${minutes}</div>
    `
    // set values
    const selEl = row.querySelector('.att-worker')
    selEl.value = value.worker_id || ''
    const minEl = row.querySelector('.att-minutes')
    if (value.minutes != null) minEl.value = value.minutes
    return row
}

function getAttendeesFromUI() {
    const rows = Array.from(document.querySelectorAll('#attendeesList .att-row'))
    const list = []
    for (const r of rows) {
        const worker_id = r.querySelector('.att-worker')?.value || ''
        const minutes = r.querySelector('.att-minutes')?.value
        if (worker_id) {
            list.push({ worker_id, minutes: minutes ? parseInt(minutes, 10) : null })
        }
    }
    // dedup por trabajador
    const seen = new Set()
    return list.filter(a => {
        if (seen.has(a.worker_id)) return false
        seen.add(a.worker_id); return true
    })
}

function setAttendeesUI(attendees) {
    const wrap = document.getElementById('attendeesList')
    wrap.innerHTML = ''
    attendees.forEach(a => wrap.appendChild(attendeeRowTemplate(a)))
    if (!attendees.length) {
        // sugerencia: si hay worker_id en la sesión, precargarlo como primera fila
        const w = $('#e_worker').value
        if (w) wrap.appendChild(attendeeRowTemplate({ worker_id: w }))
    }
}


async function updateSession(id, patch) {
    const { data, error } = await supa.from('sessions').update(patch).eq('id', id).select().maybeSingle()
    if (error) { alert('No se pudo actualizar: ' + error.message); return null }
    return data
}
async function deleteSession(id) {
    const { error } = await supa.from('sessions').delete().eq('id', id)
    if (error) { alert('No se pudo eliminar: ' + error.message) }
}

function fillSelects() {
    $('#fWorker').innerHTML = ['<option value="">—</option>']
        .concat(state.workers.map(w => `<option value="${w.id}">${w.name}</option>`)).join('')
    $('#fClient').innerHTML = ['<option value="">—</option>']
        .concat(state.clients.map(c => `<option value="${c.id}">${c.name}</option>`)).join('')

    // Diálogo de edición
    $('#e_worker').innerHTML = ['<option value="">—</option>']
        .concat(state.workers.map(w => `<option value="${w.id}">${w.name}</option>`)).join('')
    $('#e_client').innerHTML = ['<option value="">—</option>']
        .concat(state.clients.map(c => `<option value="${c.id}">${c.name}</option>`)).join('')
}

function renderTable() {
    const tbody = $('#tblSessions tbody'); tbody.innerHTML = ''
    state.rows.forEach(r => {
        const workerName = r.worker || (state.workers.find(w => w.id === r.worker_id)?.name) || '—'
        const clientName = (state.clients.find(c => c.id === r.client_id)?.name) || '—'
        const dur = r.end_at ? fmtDuration(new Date(r.end_at) - new Date(r.start_at)) : 'En curso'
        const tr = document.createElement('tr')
        tr.innerHTML = `
      <td>${r.date ?? ''}</td>
      <td>${workerName}</td>
      <td>${clientName}</td>
      <td>${r.start_at ? fmtDateTime(r.start_at) : '—'}</td>
      <td>${r.end_at ? fmtDateTime(r.end_at) : '—'}</td>
      <td>${dur}</td>
      <td>${r.loc_start_addr ?? ''}</td>
      <td>${r.loc_end_addr ?? ''}</td>
      <td><button class="btn-link" data-id="${r.id}">Editar</button></td>
    `
        tbody.appendChild(tr)
    })
}

function openEditDialog(row) {
    const attendees = await fetchAttendees(row.id)
    setAttendeesUI(attendees)
    $('#e_id').value = row.id
    $('#e_date').value = row.date ?? todayStr()
    $('#e_worker').value = row.worker_id || ''
    $('#e_client').value = row.client_id || ''
    // normaliza datetime-local (YYYY-MM-DDTHH:MM)
    const toLocalInputValue = (iso) => {
        if (!iso) return '';
        const d = new Date(iso);
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); // “des-UTC” para el input local
        return d.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
    };
    $('#e_start').value = toLocalInputValue(row.start_at);
    $('#e_end').value = toLocalInputValue(row.end_at);
    //$('#e_start').value = toLocal(row.start_at)
    //$('#e_end').value = toLocal(row.end_at)
    $('#e_start_addr').value = row.loc_start_addr ?? ''
    $('#e_end_addr').value = row.loc_end_addr ?? ''
    $('#dlgEdit').showModal()
    // tras setear los inputs de la sesión…

    

}

function csvEscape(v) {
    if (v == null) return ''
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function downloadCsv(filename, csv) {
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = filename
    document.body.appendChild(a); a.click()
    document.body.removeChild(a); URL.revokeObjectURL(url)
}
function buildCsv(rows) {
    const headers = ['date', 'worker_name', 'client_name', 'start_at', 'end_at', 'duration_hms', 'loc_start_addr', 'loc_end_addr']
    const lines = [headers.join(',')]
    rows.forEach(r => {
        const workerName = r.worker || (state.workers.find(w => w.id === r.worker_id)?.name) || ''
        const clientName = (state.clients.find(c => c.id === r.client_id)?.name) || ''
        const dur = r.end_at ? fmtDuration(new Date(r.end_at) - new Date(r.start_at)) : ''
        lines.push([
            r.date || '', workerName, clientName,
            r.start_at || '', r.end_at || '', dur,
            r.loc_start_addr || '', r.loc_end_addr || ''
        ].map(csvEscape).join(','))
    })
    return lines.join('\n')
}

function bindEvents() {

    console.log('Binding events')
    // volver al index (como en clientes/calendario)
    $('#btnVolver')?.addEventListener('click', () => window.location.href = 'index.html#tab-admin')

    // buscar
    $('#formFilter').addEventListener('submit', async (e) => {
        e.preventDefault()
        await refreshSession()
        if (!state.isAdmin) { alert('Solo admin'); return }
        const from = $('#fFrom').value || todayStr()
        const to = $('#fTo').value || from
        const workerId = $('#fWorker').value || null
        const clientId = $('#fClient').value || null
        state.rows = await fetchSessionsRange(from, to, workerId, clientId)
        renderTable()
    })

    // exportar
    $('#btnExport').addEventListener('click', () => {
        if (!state.rows?.length) { alert('No hay datos para exportar'); return }
        downloadCsv('sessions.csv', buildCsv(state.rows))
    })

    // abrir edición
    $('#tblSessions').addEventListener('click', (e) => {
        const id = e.target.closest('button[data-id]')?.getAttribute('data-id')
        if (!id) return
        const row = state.rows.find(r => r.id === id)
        if (row) openEditDialog(row)
    })

    // diálogo
    $('#btnCancel').addEventListener('click', () => $('#dlgEdit').close())
    $('#btnDel').addEventListener('click', async () => {
        if (!confirm('¿Eliminar esta sesión?')) return
        const id = $('#e_id').value
        await deleteSession(id)
        state.rows = state.rows.filter(r => r.id !== id)
        renderTable()
        $('#dlgEdit').close()
    })

    // Añadir filas
    document.getElementById('btnAddAttendee')?.addEventListener('click', () => {
        document.getElementById('attendeesList').appendChild(attendeeRowTemplate())
    })

    // Delegación para quitar
    document.getElementById('attendeesList')?.addEventListener('click', (e) => {
        if (e.target.classList.contains('att-remove')) {
            const row = e.target.closest('.att-row')
            if (row) row.remove()
        }
    })


    // guardar edición
    $('#formEdit').addEventListener('submit', async (e) => {
        e.preventDefault()
        await refreshSession()
        if (!state.isAdmin) { alert('Solo admin'); return }

        const id = $('#e_id').value
        const patch = {
            date: $('#e_date').value || null,
            worker_id: $('#e_worker').value || null,
            client_id: $('#e_client').value || null,
            start_at: $('#e_start').value ? new Date($('#e_start').value).toISOString() : null,
            end_at: $('#e_end').value ? new Date($('#e_end').value).toISOString() : null,
            loc_start_addr: $('#e_start_addr').value.trim() || null,
            loc_end_addr: $('#e_end_addr').value.trim() || null
        }
        const saved = await updateSession(id, patch)

        // tras const saved = await updateSession(id, patch) …
        if (saved) {
            // guardar asistentes
            const list = getAttendeesFromUI()
            const ok = await upsertAttendees(id, list)
            if (!ok) return // si falló, no cierres para que el usuario corrija

            // actualizar la fila en memoria y refrescar tabla
            const idx = state.rows.findIndex(r => r.id === id)
            if (idx >= 0) state.rows[idx] = saved
            renderTable()
            $('#dlgEdit').close()
        }

    })
}

async function init() {
    console.log('Sessions admin init')
    await refreshSession()
    const [workers, clients] = await Promise.all([fetchWorkers(), fetchClients()])
    state.workers = workers; state.clients = clients
    fillSelects()

    // precarga: hoy
    $('#fFrom').value = todayStr()
    $('#fTo').value = todayStr()
    state.rows = await fetchSessionsRange(todayStr(), todayStr(), null, null)
    renderTable()
}

bindEvents()
init()
