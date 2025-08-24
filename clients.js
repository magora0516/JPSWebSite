// Configura Supabase como en tu app
const SUPABASE_URL = 'https://zsavhkkhdhlhwmtxqyon.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzYXZoa2toZGhsaHdtdHhxeW9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ3MDU5ODUsImV4cCI6MjA3MDI4MTk4NX0.mecvMpBJDNeebA_bygW3zP_Qwdbp0An-9B8z1WYh59w'
const supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const $ = s => document.querySelector(s)
function uid() { return Math.random().toString(36).slice(2, 10) }

const state = { isAdmin: false, session: null, clients: [] }

async function isEmailAdmin(email) {
    if (!email) return false
    const { data, error } = await supa.from('admins').select('email').eq('email', email.toLowerCase()).maybeSingle()
    if (error) { console.warn(error); return false }
    return !!data
}

async function refreshSession() {
    const { data: { session } } = await supa.auth.getSession()
    state.session = session
    const email = session?.user?.email || ''
    state.isAdmin = await isEmailAdmin(email)
    if (!session) { window.location.href = 'index.html#tab-worker'; return }
    if (!state.isAdmin) { window.location.href = 'index.html#tab-worker'; return }
}

async function fetchClients() {
    const { data, error } = await supa
        .from('clients')
        .select('id,name,formal_name,location,frequency,square_feet,service_value,client_type,start_date')
        .order('name')
    if (error) { console.warn('fetchClients', error); return [] }
    return data || []
}

async function insertClient(obj) {
    const { data, error } = await supa.from('clients').insert(obj).select().maybeSingle()
    if (error) { alert('No se pudo crear el cliente: ' + error.message); return null }
    return data
}
async function updateClient(id, patch) {
    const { data, error } = await supa.from('clients').update(patch).eq('id', id).select().maybeSingle()
    if (error) { alert('No se pudo actualizar: ' + error.message); return null }
    return data
}
async function deleteClient(id) {
    const { error } = await supa.from('clients').delete().eq('id', id)
    if (error) { alert('No se pudo eliminar: ' + error.message) }
}

function renderTable() {
    const tbody = $('#tblClients tbody'); tbody.innerHTML = ''
    state.clients.forEach(c => {
        const tr = document.createElement('tr')
        tr.innerHTML = `
      <td>${c.name ?? ''}</td>
      <td>${c.formal_name ?? ''}</td>
      <td>${c.frequency ?? ''}</td>
      <td>${c.client_type ?? ''}</td>
      <td>${c.square_feet ?? ''}</td>
      <td>${c.service_value ?? ''}</td>
      <td>${c.start_date ?? ''}</td>
      <td>${c.location ?? ''}</td>
      <td><button class="btn-link" data-id="${c.id}">Editar</button></td>
    `
        tbody.appendChild(tr)
    })
}

function openEditDialog(c) {
    $('#e_id').value = c.id
    $('#e_name').value = c.name ?? ''
    $('#e_formal_name').value = c.formal_name ?? ''
    $('#e_location').value = c.location ?? ''
    $('#e_frequency').value = c.frequency ?? ''
    $('#e_square_feet').value = c.square_feet ?? ''
    $('#e_service_value').value = c.service_value ?? ''
    $('#e_client_type').value = c.client_type ?? ''
    $('#e_start_date').value = c.start_date ?? ''
    $('#dlgEdit').showModal()
}

function bindEvents() {
    $('#btnVolver')?.addEventListener('click', () => window.location.href = 'index.html#tab-admin')

    // crear
    $('#formNew').addEventListener('submit', async (e) => {
        e.preventDefault()
        await refreshSession()
        if (!state.isAdmin) { alert('Solo admin'); return }

        const obj = {
            id: uid(),
            name: $('#name').value.trim(),
            formal_name: $('#formal_name').value.trim() || null,
            location: $('#location').value.trim() || null,
            frequency: $('#frequency').value || null,
            square_feet: $('#square_feet').value ? parseInt($('#square_feet').value, 10) : null,
            service_value: $('#service_value').value ? parseFloat($('#service_value').value) : null,
            client_type: $('#client_type').value || null,
            start_date: $('#start_date').value || null
        }
        if (!obj.name) { alert('Nombre es obligatorio'); return }

        const saved = await insertClient(obj)
        if (saved) {
            state.clients.push(saved)
            renderTable()
            e.target.reset()
        }
    })

    // abrir edición
    $('#tblClients').addEventListener('click', (ev) => {
        const btn = ev.target.closest('button[data-id]')
        if (!btn) return
        const id = btn.getAttribute('data-id')
        const c = state.clients.find(x => x.id === id)
        if (c) openEditDialog(c)
    })

    // botones del diálogo
    $('#btnCancel').addEventListener('click', () => $('#dlgEdit').close())
    $('#btnDel').addEventListener('click', async () => {
        if (!confirm('¿Eliminar este cliente?')) return
        const id = $('#e_id').value
        await deleteClient(id)
        state.clients = state.clients.filter(x => x.id !== id)
        renderTable()
        $('#dlgEdit').close()
    })

    // guardar edición
    $('#formEdit').addEventListener('submit', async (e) => {
        e.preventDefault()
        await refreshSession()
        if (!state.isAdmin) { alert('Solo admin'); return }
        const id = $('#e_id').value
        const patch = {
            name: $('#e_name').value.trim(),
            formal_name: $('#e_formal_name').value.trim() || null,
            location: $('#e_location').value.trim() || null,
            frequency: $('#e_frequency').value || null,
            square_feet: $('#e_square_feet').value ? parseInt($('#e_square_feet').value, 10) : null,
            service_value: $('#e_service_value').value ? parseFloat($('#e_service_value').value) : null,
            client_type: $('#e_client_type').value || null,
            start_date: $('#e_start_date').value || null
        }
        if (!patch.name) { alert('Nombre es obligatorio'); return }

        const updated = await updateClient(id, patch)
        if (updated) {
            const i = state.clients.findIndex(x => x.id === id)
            if (i >= 0) state.clients[i] = updated
            renderTable()
            $('#dlgEdit').close()
        }
    })
}

async function init() {
    await refreshSession()
    state.clients = await fetchClients()
    renderTable()
    bindEvents()
}
init()
