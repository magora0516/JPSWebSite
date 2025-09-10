// Supabase
const SUPABASE_URL = 'https://zsavhkkhdhlhwmtxqyon.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzYXZoa2toZGhsaHdtdHhxeW9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ3MDU5ODUsImV4cCI6MjA3MDI4MTk4NX0.mecvMpBJDNeebA_bygW3zP_Qwdbp0An-9B8z1WYh59w'
const supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// helpers
const $ = s => document.querySelector(s)
const pad = n => String(n).padStart(2, '0')
const fmtHMS = ms => {
    if (!ms || ms < 0) return '00:00:00'
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000)
    return `${pad(h)}:${pad(m)}:${pad(s)}`
}
function ymdLocal(d) { const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0'); return `${y}-${m}-${day}` }
function todayStr() { const d = new Date(); d.setHours(0, 0, 0, 0); return ymdLocal(d) }
const fmtDateTime = d => new Date(d).toLocaleString()

// estado
const state = { session: null, worker: null, clients: [] }

async function refreshSession() {
    const { data: { session } } = await supa.auth.getSession()
    state.session = session
    if (!session) { window.location.href = 'index.html#tab-worker'; return }
}

async function findCurrentWorkerByEmail() {
    const email = state.session?.user?.email
    if (!email) return null
    const { data, error } = await supa.from('workers').select('id,name,email,user_id').eq('email', email.toLowerCase()).maybeSingle()
    if (error) { console.warn('worker lookup', error); return null }
    return data
}

async function fetchClients() {
    const { data, error } = await supa.from('clients').select('id,name')
    if (error) { console.warn('clients', error); return [] }
    return data || []
}

// Sesiones del responsable principal
async function fetchSessionsByOwner(workerId, dateYmd) {
    const { data, error } = await supa
        .from('sessions')
        .select('*')
        .eq('worker_id', workerId)
        .eq('date', dateYmd)
        .order('start_at', { ascending: true })
    if (error) { console.warn('sessions owner', error); return [] }
    return data || []
}

// Sesiones donde es asistente (tabla session_attendees)
async function fetchSessionsByAttendee(workerId, dateYmd) {
    // 1) filas de asistencia del trabajador
    const { data: att, error: e1 } = await supa
        .from('session_attendees')
        .select('session_id')
        .eq('worker_id', workerId)
    if (e1) { console.warn('attendees', e1); return [] }
    if (!att?.length) return []

    const ids = att.map(a => a.session_id)
    // 2) sesiones de ese día entre esos IDs
    const { data: sess, error: e2 } = await supa
        .from('sessions')
        .select('*')
        .in('id', ids)
        .eq('date', dateYmd)
        .order('start_at', { ascending: true })
    if (e2) { console.warn('sessions by attendee', e2); return [] }
    return sess || []
}

function uniqueById(list) {
    const out = [], seen = new Set()
    for (const x of list) { if (seen.has(x.id)) continue; seen.add(x.id); out.push(x) }
    return out
}

function renderTable(rows) {
    const tbody = $('#tblSummary tbody'); tbody.innerHTML = ''
    const cById = Object.fromEntries(state.clients.map(c => [c.id, c.name]))
    let total = 0

    rows.forEach(r => {
        // duración: si no tiene fin, cuenta hasta ahora
        const end = r.end_at ? new Date(r.end_at) : new Date()
        const dur = end - new Date(r.start_at)
        total += Math.max(0, dur)

        const tr = document.createElement('tr')
        tr.innerHTML = `
      <td>${cById[r.client_id] || '—'}</td>
      <td>${fmtDateTime(r.start_at)}</td>
      <td>${r.end_at ? fmtDateTime(r.end_at) : 'En curso'}</td>
      <td>${fmtHMS(dur)}</td>
    `
        tbody.appendChild(tr)
    })

    $('#totalCell').textContent = fmtHMS(total)
}

async function loadAndRender(dateYmd) {
    await refreshSession()
    const worker = state.worker || await findCurrentWorkerByEmail()
    if (!worker) { alert('No se encontró el trabajador para el usuario actual'); return }
    state.worker = worker
    if (!state.clients?.length) state.clients = await fetchClients()

    const [owner, attendee] = await Promise.all([
        fetchSessionsByOwner(worker.id, dateYmd),
        fetchSessionsByAttendee(worker.id, dateYmd)
    ])
    const rows = uniqueById(owner.concat(attendee))
    renderTable(rows)
}

function bindEvents() {
    $('#btnVolver')?.addEventListener('click', () => window.location.href = 'index.html#tab-worker')
    $('#formFilter').addEventListener('submit', async e => {
        e.preventDefault()
        const d = $('#fDate').value || todayStr()
        await loadAndRender(d)
    })
}

async function init() {
    await refreshSession()
    $('#fDate').value = todayStr()
    bindEvents()
    await loadAndRender($('#fDate').value)
}
init()
