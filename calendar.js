// Supabase config: usa los mismos valores de tu app
const SUPABASE_URL = 'https://zsavhkkhdhlhwmtxqyon.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzYXZoa2toZGhsaHdtdHhxeW9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ3MDU5ODUsImV4cCI6MjA3MDI4MTk4NX0.mecvMpBJDNeebA_bygW3zP_Qwdbp0An-9B8z1WYh59w'
const supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// helpers
const $ = s => document.querySelector(s)
const fmtYmd = d => {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}
function uid() { return Math.random().toString(36).slice(2, 10) }

// estado
const state = { workers: [], clients: [], colorByWorker: {} }
function buildWorkerColors() {
    // paleta simple
    const palette = ['#2563eb', '#16a34a', '#f59e0b', '#db2777', '#059669', '#7c3aed', '#ea580c', '#0ea5e9', '#84cc16', '#ef4444']
    state.colorByWorker = {}
    state.workers.forEach((w, i) => state.colorByWorker[w.id] = palette[i % palette.length])
}

// datos
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
async function fetchSchedulesRange(startYmd, endYmd) {
    const { data, error } = await supa
        .from('schedules')
        .select('id,date,minutes,client_id,worker_id,worker')
        .gte('date', startYmd)
        .lte('date', endYmd)
        .order('date', { ascending: true })
    if (error) { console.warn('schedules', error); return [] }
    return data || []
}
async function insertSchedule(obj) {
    const { data, error } = await supa.from('schedules').insert(obj).select().maybeSingle()
    if (error) { alert('No se pudo guardar la agenda: ' + error.message); return null }
    return data
}
async function updateSchedule(id, patch) {
    const { data, error } = await supa.from('schedules').update(patch).eq('id', id).select().maybeSingle()
    if (error) { alert('No se pudo actualizar: ' + error.message); return null }
    return data
}
async function deleteSchedule(id) {
    const { error } = await supa.from('schedules').delete().eq('id', id)
    if (error) { alert('No se pudo eliminar: ' + error.message) }
}

// UI selects
function fillSelects() {
    const w = $('#dlgWorker'), c = $('#dlgClient')
    if (w) w.innerHTML = ['<option value="">Selecciona</option>'].concat(
        state.workers.map(x => `<option value="${x.id}">${x.name}</option>`)
    ).join('')
    if (c) c.innerHTML = ['<option value="">Selecciona</option>'].concat(
        state.clients.map(x => `<option value="${x.id}">${x.name}</option>`)
    ).join('')
}

// map schedules → events
function schedulesToEvents(rows) {
    return rows.map(r => {
        // usamos 09:00 por defecto si no tenemos hora; en diálogo sí la pedimos
        const dateStr = r.date
        const start = `${dateStr}T09:00:00`
        const durationMin = r.minutes ?? 60
        const end = new Date(`${dateStr}T09:00:00Z`)
        const endLoc = new Date(end.getTime() + durationMin * 60000)
        const workerName = r.worker || (state.workers.find(w => w.id === r.worker_id)?.name) || 'Trabajador'
        return {
            id: r.id,
            title: `${workerName} · ${state.clients.find(c => c.id === r.client_id)?.name || 'Cliente'}`,
            start: start,
            end: `${dateStr}T${String(endLoc.getUTCHours()).padStart(2, '0')}:${String(endLoc.getUTCMinutes()).padStart(2, '0')}:00`,
            backgroundColor: state.colorByWorker[r.worker_id] || '#64748b',
            borderColor: state.colorByWorker[r.worker_id] || '#64748b',
            extendedProps: { sched: r }
        }
    })
}

// Modal helpers
function openDialog(mode, dateInfo = null, eventInfo = null) {
    const dlg = $('#schedDialog'); const form = $('#schedForm'); const del = $('#btnDelete'); const title = $('#dlgTitle')
    if (!dlg) return
    form.reset()

    if (mode === 'create' && dateInfo) {
        title.textContent = 'Nueva agenda'
        $('#dlgDate').value = dateInfo.dateStr
        $('#dlgTime').value = '09:00'
        del.style.display = 'none'
        dlg.showModal()
        $('#btnCancel').onclick = () => dlg.close('cancel')
        form.onsubmit = async (e) => {
            e.preventDefault()
            const workerId = $('#dlgWorker').value
            const clientId = $('#dlgClient').value
            const date = $('#dlgDate').value
            const time = $('#dlgTime').value
            const minutes = parseInt($('#dlgMinutes').value, 10) || 60
            if (!workerId || !clientId) { alert('Trabajador y cliente son obligatorios'); return }
            const worker = state.workers.find(w => w.id === workerId)
            const saved = await insertSchedule({
                id: uid(),
                date,
                minutes,
                client_id: clientId,
                worker_id: workerId,
                worker: worker?.name || ''
            })
            if (saved) { calendar.refetchEvents(); dlg.close() }
        }
    }

    if (mode === 'edit' && eventInfo) {
        const s = eventInfo.event.extendedProps.sched
        title.textContent = 'Editar agenda'
        $('#dlgWorker').value = s.worker_id || ''
        $('#dlgClient').value = s.client_id || ''
        $('#dlgDate').value = s.date
        $('#dlgTime').value = '09:00'
        $('#dlgMinutes').value = s.minutes || 60
        del.style.display = 'inline-block'
        dlg.showModal()

        del.onclick = async () => {
            if (confirm('¿Eliminar esta agenda?')) {
                await deleteSchedule(s.id); calendar.refetchEvents(); dlg.close()
            }
        }
        form.onsubmit = async (e) => {
            e.preventDefault()
            const workerId = $('#dlgWorker').value
            const clientId = $('#dlgClient').value
            const date = $('#dlgDate').value
            const time = $('#dlgTime').value
            const minutes = parseInt($('#dlgMinutes').value, 10) || 60
            if (!workerId || !clientId) { alert('Trabajador y cliente son obligatorios'); return }
            const worker = state.workers.find(w => w.id === workerId)
            const patched = await updateSchedule(s.id, {
                date, minutes, client_id: clientId, worker_id: workerId, worker: worker?.name || ''
            })
            if (patched) { calendar.refetchEvents(); dlg.close() }
        }
    }
}

//btn Index
$('#btnVolver')?.addEventListener('click', () => {
  window.location.href = 'index.html'
})

// FullCalendar init
let calendar = null
async function init() {
    // auth opcional: si quieres bloquear a no autenticados, verifica sesión aquí
    const [workers, clients] = await Promise.all([fetchWorkers(), fetchClients()])
    state.workers = workers; state.clients = clients; buildWorkerColors(); fillSelects()

    const el = document.getElementById('calendar')

    calendar = new FullCalendar.Calendar(el, {
        initialView: 'dayGridMonth',
        headerToolbar: { left: 'prev', center: 'title', right: 'next' },
        height: 'auto',
        selectable: true,
        selectMirror: true,
        navLinks: true,
        locale: 'es',
        dateClick: (info) => openDialog('create', info, null),
        eventClick: (info) => openDialog('edit', null, info),
        events: async (info, success, failure) => {
            try {
                const startYmd = fmtYmd(info.start)
                const endYmd = fmtYmd(info.end)
                const rows = await fetchSchedulesRange(startYmd, endYmd)
                success(schedulesToEvents(rows))
            } catch (e) { console.error(e); failure(e) }
        }
    })
    calendar.render()
}
init()
