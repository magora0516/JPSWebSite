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

// corregido
function ymdLocal(d){
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

function ymdToDateLocal(ymd){
    const [y,m,d] = ymd.split('-').map(Number)
    return new Date(y, m-1, d, 0,0,0,0)
  }
  
  function startOfWeekMonday(d){
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0,0,0,0)
    const day = x.getDay() || 7
    x.setDate(x.getDate() - (day - 1))
    return x
  }
  
  function endOfWeekSunday(d){
    const s = startOfWeekMonday(d)
    const e = new Date(s)
    e.setDate(e.getDate() + 6)
    return e
  }
  
  function startOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1, 0,0,0,0) }
  function endOfMonth(d){ return new Date(d.getFullYear(), d.getMonth()+1, 0, 0,0,0,0) }
  
  function calcTotals(rows, refDayYmd){
    const cById = Object.fromEntries(state.clients.map(c => [c.id, c]))
    const ref = ymdToDateLocal(refDayYmd)
  
    const d0 = ymdToDateLocal(refDayYmd)
    const w0 = startOfWeekMonday(ref)
    const w1 = endOfWeekSunday(ref)
    const m0 = startOfMonth(ref)
    const m1 = endOfMonth(ref)
  
    let sumDay = 0, sumWeek = 0, sumMonth = 0
  
    for (const r of rows){
      const dt = ymdToDateLocal(r.date)
      const price = Number(cById[r.client_id]?.service_value) || 0
  
      if (dt.getTime() === d0.getTime()) sumDay += price
      if (dt >= w0 && dt <= w1) sumWeek += price
      if (dt >= m0 && dt <= m1) sumMonth += price
    }
  
    return { sumDay, sumWeek, sumMonth, d0, w0, w1, m0, m1 }
  }

  function setTotalsUI(t){
    const $ = s => document.querySelector(s)
    $('#totalDay').textContent = money(t.sumDay)
    $('#totalMonth').textContent = money(t.sumMonth)
  
    $('#totalDayHint').textContent = fmtYmd(t.d0)
    $('#totalMonthHint').textContent = `${fmtYmd(t.m0)} a ${fmtYmd(t.m1)}`
  }
  


function uid() { return Math.random().toString(36).slice(2, 10) }

//helpers values per week

function addDays(d, n){
    const x = new Date(d)
    x.setDate(x.getDate() + n)
    return x
  }
  
  function sameDay(a,b){
    return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate()
  }
  
  function weekKeyMonday(d){
    const m = startOfWeekMonday(d)
    return fmtYmd(m)
  }
  
  function calcWeeklyBuckets(rows, visibleStart, visibleEnd){
    const cById = Object.fromEntries(state.clients.map(c => [c.id, c]))
    const v0 = new Date(visibleStart.getFullYear(), visibleStart.getMonth(), visibleStart.getDate(), 0,0,0,0)
    const v1 = new Date(visibleEnd.getFullYear(), visibleEnd.getMonth(), visibleEnd.getDate(), 0,0,0,0)
  
    // crea todas las semanas visibles (lunes-domingo) dentro del grid
    const weeks = []
    let cur = startOfWeekMonday(v0)
    while (cur < v1){
      const wStart = new Date(cur)
      const wEnd = addDays(wStart, 6)
      weeks.push({ start: wStart, end: wEnd, sum: 0 })
      cur = addDays(cur, 7)
    }
  
    // índice por key (lunes)
    const idx = Object.fromEntries(weeks.map((w,i)=>[fmtYmd(w.start), i]))
  
    for (const r of rows){
      const dt = ymdToDateLocal(r.date)
      if (dt < v0 || dt >= v1) continue
      const price = Number(cById[r.client_id]?.service_value) || 0
      const k = weekKeyMonday(dt)
      const i = idx[k]
      if (i !== undefined) weeks[i].sum += price
    }
  
    return weeks
  }
  
  function renderWeeksList(weeks){
    const el = document.getElementById('weeksList')
    if (!el) return
    el.innerHTML = ''
  
    for (const w of weeks){
      const div = document.createElement('div')
      div.className = 'weekrow'
      div.innerHTML = `
        <span class="range">${fmtYmd(w.start)} a ${fmtYmd(w.end)}</span>
        <span class="amt">${money(w.sum)}</span>
      `
      el.appendChild(div)
    }
  }
  

// estado

const state = { workers: [], clients: [], colorByWorker: {}, schedules: [], refDayYmd: null }

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
    const { data, error } = await supa
      .from('clients')
      .select('id,name,service_value')
      .order('name')
  
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


function money(v){
    const n = Number(v)
    const x = Number.isFinite(n) ? n : 0
    if (!Number.isFinite(n)) return '$0'
    return n.toLocaleString('en-US', { 
        style:'currency', 
        currency:'USD',
        minimumFractionDigits:0,
        maximumFractionDigits: 0
    })
  }
  


/* function schedulesToEvents(rows) {
    return rows.map(r => {
        const clientName = state.clients.find(c => c.id === r.client_id)?.name || 'Cliente'
        const color = state.colorByWorker[r.worker_id] || '#64748b'
        return {
            id: r.id,
            title: clientName,           // ← solo cliente
            start: r.date,               // ← sin hora => evento de día completo
            allDay: true,                // ← asegura que sea all-day
            backgroundColor: color,
            borderColor: color,
            extendedProps: { sched: r, workerId: r.worker_id }
        }
    })
} */

function schedulesToEvents(rows) {
    const cById = Object.fromEntries(state.clients.map(c => [c.id, c]))
  
    return rows.map(r => {
      const c = cById[r.client_id]
      const clientName = c?.name || 'Cliente'
      const price = money(c?.service_value)
  
      const color = state.colorByWorker[r.worker_id] || '#64748b'
      return {
        id: r.id,
        title: `${clientName} ${price}`,
        start: r.date,
        allDay: true,
        backgroundColor: color,
        borderColor: color,
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
        //$('#dlgTime').value = '09:00'
        del.style.display = 'none'
        dlg.showModal()
        $('#btnCancel').onclick = () => dlg.close('cancel')
        form.onsubmit = async (e) => {
            e.preventDefault()
            const workerId = $('#dlgWorker').value
            const clientId = $('#dlgClient').value
            const date = $('#dlgDate').value
            //const time = $('#dlgTime').value
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
        //$('#dlgTime').value = '09:00'
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
            //const time = $('#dlgTime').value
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
        navLinks: false,  // desactiva navegación
        locale: 'es',
        displayEventTime: false,
        dateClick: (info) => {
            state.refDayYmd = info.dateStr
            setTotalsUI(calcTotals(state.schedules || [], state.refDayYmd))
            openDialog('create', info, null)
          },
          
          eventClick: (info) => openDialog('edit', null, info),
          
          datesSet: () => {
            if (!state.refDayYmd) state.refDayYmd = ymdLocal(new Date())
            setTotalsUI(calcTotals(state.schedules || [], state.refDayYmd))
          },
          
          events: async (info, success, failure) => {
            try {
              const startYmd = fmtYmd(info.start)
              const endYmd = fmtYmd(info.end)
          
              const rows = await fetchSchedulesRange(startYmd, endYmd)
          
              state.schedules = rows
              state.visibleStart = info.start
              state.visibleEnd = info.end
          
              const weeks = calcWeeklyBuckets(rows, info.start, info.end)
              renderWeeksList(weeks)
          
              success(schedulesToEvents(rows))
            } catch (e) {
              console.error(e)
              failure(e)
            }
          }

          
    })
    calendar.render()
}
init()
