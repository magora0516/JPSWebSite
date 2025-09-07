// sessions.js
// Requiere app.js con supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
// y helpers de UI si ya existen.

(() => {
  const supa = window.supa || createSupabase();
  const qs = s => document.querySelector(s);
  const qsa = s => [...document.querySelectorAll(s)];
  const fmtHMS = mins => {
    const m = Math.max(0, Math.round(mins));
    const h = Math.floor(m / 60);
    const r = m % 60;
    return `${String(h).padStart(2,'0')}:${String(r).padStart(2,'0')}:00`;
  };
  const parseTimeToMinutes = (t) => {
    if (!t) return null;
    const [hh, mm] = t.split(':').map(Number);
    return hh * 60 + mm;
    };
  const minutesDiffFromTimes = (start, end) => {
    const ms = parseTimeToMinutes(start);
    const me = parseTimeToMinutes(end);
    if (ms == null || me == null) return null;
    let d = me - ms;
    if (d < 0) d += 24 * 60;
    return d;
  };

  // Estado
  const state = {
    page: 1,
    pageSize: 20,
    workers: [],
    clients: [],
    schedulesByKey: new Set(), // date|client_id
    sessions: [],
    editing: null,
    filters: {}
  };

  // Inicio
  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    setDefaultDates();
    await Promise.all([loadWorkers(), loadClients()]);
    bindFilters();
    await fetchScheduledKeys();
    await loadSessions();

    qs('#btnNew').addEventListener('click', () => openEditor());
    qs('#btnPrev').addEventListener('click', prevPage);
    qs('#btnNext').addEventListener('click', nextPage);
  }

  function setDefaultDates() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    qs('#fFrom').value = `${yyyy}-${mm}-${dd}`;
    qs('#fTo').value = `${yyyy}-${mm}-${dd}`;
  }

  function bindFilters() {
    qs('#btnFilter').addEventListener('click', async () => {
      state.page = 1;
      await fetchScheduledKeys();
      await loadSessions();
    });
  }

  async function loadWorkers() {
    const { data, error } = await supa.from('workers').select('id,name,active').order('name');
    if (error) return toast(error.message);
    state.workers = data || [];
    fillSelect(qs('#fWorker'), [{ id: '', name: 'Todos' }, ...state.workers]);
  }

  async function loadClients() {
    const { data, error } = await supa.from('clients').select('id,name').order('name');
    if (error) return toast(error.message);
    state.clients = data || [];
    fillSelect(qs('#fClient'), [{ id: '', name: 'Todos' }, ...state.clients]);
  }

  function fillSelect(sel, items) {
    sel.innerHTML = items.map(i => `<option value="${i.id}">${i.name}</option>`).join('');
  }

  async function fetchScheduledKeys() {
    const from = qs('#fFrom').value;
    const to = qs('#fTo').value;
    const { data, error } = await supa
      .from('schedules')
      .select('date, client_id')
      .gte('date', from)
      .lte('date', to);
    if (error) return toast(error.message);
    const set = new Set();
    (data || []).forEach(r => set.add(`${r.date}|${r.client_id}`));
    state.schedulesByKey = set;
    qs('#flagScheduled').hidden = set.size === 0;
  }

  async function loadSessions() {
    const from = qs('#fFrom').value;
    const to = qs('#fTo').value;
    const workerId = qs('#fWorker').value;
    const clientId = qs('#fClient').value;

    let q = supa
      .from('sessions')
      .select('id,date,client_id,start_at,end_at,minutes,session_workers(worker_id,full_duration,minutes,start_at,end_at), clients(name)')
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: false })
      .range((state.page - 1) * state.pageSize, state.page * state.pageSize - 1);

    if (workerId) q = q.contains('session_workers', [{ worker_id: Number(workerId) }]);
    if (clientId) q = q.eq('client_id', clientId);

    const { data, error, count } = await q;
    if (error) return toast(error.message);

    state.sessions = data || [];
    renderTable();
    updatePager((count ?? state.sessions.length) > state.page * state.pageSize);
  }

  function renderTable() {
    const tbody = qs('#tblSessions tbody');
    tbody.innerHTML = state.sessions.map(row => {
      const sw = row.session_workers || [];
      const workers = sw.map(w => {
        const ww = state.workers.find(x => x.id === w.worker_id);
        const nm = ww ? ww.name : `ID ${w.worker_id}`;
        const part = w.full_duration ? 'completo' : `${w.minutes ?? minutesDiffFromTimes(w.start_at, w.end_at) ?? 0} min`;
        return `${nm} (${part})`;
      }).join(', ');
      const totalMin = row.minutes ?? minutesDiffFromTimes(row.start_at, row.end_at) ?? 0;
      const key = `${row.date}|${row.client_id}`;
      const scheduled = state.schedulesByKey.has(key) ? 'Sí' : 'No';

      return `
        <tr>
          <td>${row.date}</td>
          <td>${row.clients?.name ?? ''}</td>
          <td>${workers}</td>
          <td>${row.start_at ?? ''}</td>
          <td>${row.end_at ?? ''}</td>
          <td>${fmtHMS(totalMin)}</td>
          <td>${scheduled}</td>
          <td>
            <button class="link" data-act="edit" data-id="${row.id}">Editar</button>
          </td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('button[data-act="edit"]').forEach(b => {
      b.addEventListener('click', () => openEditor(b.dataset.id));
    });
  }

  function updatePager(hasNext) {
    qs('#pageInfo').textContent = String(state.page);
    qs('#btnPrev').disabled = state.page <= 1;
    qs('#btnNext').disabled = !hasNext;
  }
  async function nextPage() { state.page += 1; await loadSessions(); }
  async function prevPage() { state.page = Math.max(1, state.page - 1); await loadSessions(); }

  async function openEditor(id) {
    const dlg = qs('#dlgEdit');
    const form = qs('#formEdit');
    form.reset();
    qs('#workersList').innerHTML = '';
    qs('#sumWarning').hidden = true;
    qs('#btnDelete').hidden = !id;

    await seedSelectsInForm(form);

    if (id) {
      const { data, error } = await supa
        .from('sessions')
        .select('*, session_workers(*)')
        .eq('id', id).single();
      if (error) return toast(error.message);
      state.editing = data;
      fillForm(form, data);
      data.session_workers?.forEach(w => addWorkerRow(w));
      qs('#dlgTitle').textContent = 'Editar sesión';
    } else {
      state.editing = null;
      qs('#dlgTitle').textContent = 'Nueva sesión';
      addWorkerRow();
    }

    bindTimeMode(form);
    bindFormEvents(form);
    dlg.showModal();
  }

  async function seedSelectsInForm(form) {
    const csel = form.elements.namedItem('client_id');
    csel.innerHTML = state.clients.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  }

  function fillForm(form, row) {
    form.elements.namedItem('id').value = row.id;
    form.elements.namedItem('date').value = row.date;
    form.elements.namedItem('client_id').value = row.client_id;

    if (row.minutes != null && (!row.start_at || !row.end_at)) {
      form.elements.namedItem('time_mode').value = 'total';
      toggleTimeMode(form, 'total');
      form.elements.namedItem('minutes_total').value = row.minutes;
    } else {
      form.elements.namedItem('time_mode').value = 'range';
      toggleTimeMode(form, 'range');
      form.elements.namedItem('start_at').value = row.start_at || '';
      form.elements.namedItem('end_at').value = row.end_at || '';
      form.elements.namedItem('duration_calc').value = fmtHMS(minutesDiffFromTimes(row.start_at, row.end_at) ?? 0);
    }

    form.elements.namedItem('loc_start_addr').value = row.loc_start_addr || '';
    form.elements.namedItem('loc_end_addr').value = row.loc_end_addr || '';
  }

  function bindTimeMode(form) {
    qsa('input[name="time_mode"]').forEach(r => {
      r.addEventListener('change', () => toggleTimeMode(form, r.value));
    });
    form.elements.namedItem('start_at').addEventListener('input', updateDurationCalc);
    form.elements.namedItem('end_at').addEventListener('input', updateDurationCalc);
  }

  function toggleTimeMode(form, mode) {
    qsa('[data-mode="range"]').forEach(d => d.hidden = mode !== 'range');
    qsa('[data-mode="total"]').forEach(d => d.hidden = mode !== 'total');
  }
  function updateDurationCalc() {
    const form = qs('#formEdit');
    const s = form.elements.namedItem('start_at').value;
    const e = form.elements.namedItem('end_at').value;
    form.elements.namedItem('duration_calc').value = fmtHMS(minutesDiffFromTimes(s, e) ?? 0);
    validateWorkersSum();
  }

  function addWorkerRow(pref) {
    const wrap = qs('#workersList');
    const tpl = qs('#tplWorkerRow').content.cloneNode(true);
    const row = tpl.querySelector('.worker-row');

    const sel = row.querySelector('select[name="worker_id"]');
    sel.innerHTML = state.workers.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
    if (pref?.worker_id) sel.value = pref.worker_id;

    const chk = row.querySelector('input[name="full_duration"]');
    const part = row.querySelector('.partial');
    const minutes = row.querySelector('input[name="minutes"]');
    const ws = row.querySelector('input[name="w_start_at"]');
    const we = row.querySelector('input[name="w_end_at"]');

    chk.addEventListener('change', () => {
      part.hidden = chk.checked;
      validateWorkersSum();
    });

    [minutes, ws, we].forEach(el => el.addEventListener('input', validateWorkersSum));
    row.querySelector('.remove').addEventListener('click', () => {
      row.remove();
      validateWorkersSum();
    });

    if (pref) {
      chk.checked = !!pref.full_duration;
      part.hidden = chk.checked;
      minutes.value = pref.minutes ?? '';
      ws.value = pref.start_at ?? '';
      we.value = pref.end_at ?? '';
    }

    wrap.appendChild(tpl);
  }

  function bindFormEvents(form) {
    qs('#btnAddWorker').onclick = () => addWorkerRow();
    qs('#btnGeocode').onclick = geocodeAddresses;
    form.onsubmit = onSave;
    qs('#btnDelete').onclick = onDelete;
  }

  function totalServiceMinutes() {
    const form = qs('#formEdit');
    const mode = form.elements.namedItem('time_mode').value;
    if (mode === 'total') return Number(form.elements.namedItem('minutes_total').value || 0);
    const s = form.elements.namedItem('start_at').value;
    const e = form.elements.namedItem('end_at').value;
    return minutesDiffFromTimes(s, e) ?? 0;
  }

  function validateWorkersSum() {
    const form = qs('#formEdit');
    const total = totalServiceMinutes();
    const rows = qsa('#workersList .worker-row');
    let sum = 0;
    rows.forEach(r => {
      const full = r.querySelector('input[name="full_duration"]').checked;
      if (!full) {
        const m = Number(r.querySelector('input[name="minutes"]').value || 0)
          || minutesDiffFromTimes(
              r.querySelector('input[name="w_start_at"]').value,
              r.querySelector('input[name="w_end_at"]').value
            ) || 0;
        sum += m;
      }
    });
    const warn = qs('#sumWarning');
    warn.hidden = sum <= total || total === 0;
    return warn.hidden;
  }

  async function onSave(ev) {
    ev.preventDefault();
    const form = ev.target;
    if (!validateWorkersSum()) return toast('La suma de parciales excede la duración total');

    const payload = formToSessionPayload(form);
    let sessionId = payload.id || undefined;

    if (sessionId) {
      const { error } = await supa.from('sessions').update(payload.update).eq('id', sessionId);
      if (error) return toast(error.message);
      await saveWorkers(sessionId, payload.workers);
    } else {
      const { data, error } = await supa.from('sessions').insert(payload.insert).select('id').single();
      if (error) return toast(error.message);
      sessionId = data.id;
      await saveWorkers(sessionId, payload.workers);
    }

    qs('#dlgEdit').close();
    await loadSessions();
    toast('Guardado');
  }

  function formToSessionPayload(form) {
    const id = form.elements.namedItem('id').value || null;
    const date = form.elements.namedItem('date').value;
    const client_id = Number(form.elements.namedItem('client_id').value);
    const mode = form.elements.namedItem('time_mode').value;

    let start_at = null, end_at = null, minutes = null;
    if (mode === 'total') {
      minutes = Number(form.elements.namedItem('minutes_total').value || 0);
    } else {
      start_at = form.elements.namedItem('start_at').value || null;
      end_at = form.elements.namedItem('end_at').value || null;
      minutes = minutesDiffFromTimes(start_at, end_at);
    }

    const loc_start_addr = form.elements.namedItem('loc_start_addr').value || null;
    const loc_end_addr = form.elements.namedItem('loc_end_addr').value || null;

    const workers = qsa('#workersList .worker-row').map(r => {
      const worker_id = Number(r.querySelector('select[name="worker_id"]').value);
      const full_duration = r.querySelector('input[name="full_duration"]').checked;
      const wm = Number(r.querySelector('input[name="minutes"]').value || 0) || null;
      const w_start_at = r.querySelector('input[name="w_start_at"]').value || null;
      const w_end_at = r.querySelector('input[name="w_end_at"]').value || null;
      return { worker_id, full_duration, minutes: wm, start_at: w_start_at, end_at: w_end_at };
    });

    return {
      id,
      insert: { date, client_id, start_at, end_at, minutes, loc_start_addr, loc_end_addr },
      update: { date, client_id, start_at, end_at, minutes, loc_start_addr, loc_end_addr },
      workers
    };
  }

  async function saveWorkers(sessionId, workers) {
    // Estrategia simple: borrar y reinsertar
    const { error: delErr } = await supa.from('session_workers').delete().eq('session_id', sessionId);
    if (delErr) throw delErr;

    const rows = workers.map(w => ({ ...w, session_id: sessionId }));
    if (rows.length) {
      const { error } = await supa.from('session_workers').insert(rows);
      if (error) throw error;
    }
  }

  async function onDelete() {
    if (!state.editing?.id) return;
    if (!confirm('¿Eliminar esta sesión?')) return;
    const id = state.editing.id;
    const { error } = await supa.from('sessions').delete().eq('id', id);
    if (error) return toast(error.message);
    qs('#dlgEdit').close();
    await loadSessions();
    toast('Eliminada');
  }

  async function geocodeAddresses() {
    const form = qs('#formEdit');
    const s = form.elements.namedItem('loc_start_addr').value.trim();
    const e = form.elements.namedItem('loc_end_addr').value.trim();
    qs('#geoStatus').textContent = 'Buscando...';
    try {
      const [gs, ge] = await Promise.all([geocodeOnce(s), geocodeOnce(e)]);
      // Si tienes columnas lat/lng separadas, asígnalas aquí
      // form.elements.namedItem('loc_start_lat').value = gs?.lat ?? '';
      // form.elements.namedItem('loc_start_lng').value = gs?.lon ?? '';
      // Igual para fin
      qs('#geoStatus').textContent = 'OK';
    } catch (err) {
      qs('#geoStatus').textContent = 'Error geocodificando';
      console.error(err);
    }
  }

  async function geocodeOnce(addr) {
    if (!addr) return null;
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', addr);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');
    return retry(async () => {
      const res = await fetch(url.href, { headers: { 'Accept-Language': 'es' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const arr = await res.json();
      return arr[0] || null;
    }, 3, 600);
  }

  async function retry(fn, times, delayMs) {
    let last;
    for (let i = 0; i < times; i++) {
      try { return await fn(); } catch (e) { last = e; await new Promise(r => setTimeout(r, delayMs)); }
    }
    throw last;
  }

  function createSupabase() {
    // Lee de variables globales definidas en app.js
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = window;
    return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  function toast(msg) {
    console.log(msg);
    alert(msg);
  }
})();
