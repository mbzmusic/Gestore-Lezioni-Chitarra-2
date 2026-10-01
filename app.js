// =====================================================================
//  GuitarStudio - logica dell'app
//  Dati iniziali: data.json  |  Dati dell'utente: localStorage
// =====================================================================

const STORAGE_KEYS = { students: 'gs_students', lessons: 'gs_lessons' };

// Valori usati se mancano nel file data.json
const DEFAULT_CONFIG = {
    pricePerLesson: 25,
    lessonDurationMinutes: 60,
    autoDeductCredit: true,
    calendarStart: '2026-08',
    calendarEnd: '2027-08',
    monthNames: ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']
};

// Copia di sicurezza usata solo se data.json non è raggiungibile
// (succede aprendo index.html con doppio clic, cioè da file://).
const FALLBACK_DATA = {"config": {"pricePerLesson": 25, "lessonDurationMinutes": 60, "autoDeductCredit": true, "calendarStart": "2026-08", "calendarEnd": "2027-08", "monthNames": ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"]}, "students": [{"id": "1", "name": "Marco Rossi", "level": "Intermedio", "phone": "3331234567", "prefDay": "Lunedì", "prefTime": "15:00", "credit": 2}, {"id": "2", "name": "Giulia Bianchi", "level": "Principiante", "phone": "3489876543", "prefDay": "Mercoledì", "prefTime": "17:30", "credit": 4}], "lessons": [{"id": "l1", "studentId": "1", "date": "2026-10-05", "time": "15:00", "status": "Programmata", "payment": "Da Saldare"}, {"id": "l2", "studentId": "2", "date": "2026-10-07", "time": "17:30", "status": "Completata", "payment": "Pagata"}]};

let config = { ...DEFAULT_CONFIG };
let students = [];
let lessons = [];

// ---------------------------------------------------------------------
// Utilità
// ---------------------------------------------------------------------

// Evita che testo digitato dall'utente (es. "<b>") venga interpretato come HTML
function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

// ID univoci (usa crypto.randomUUID quando disponibile)
function newId(prefix) {
    const uid = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : Date.now().toString(36) + Math.random().toString(36).slice(2);
    return prefix + uid;
}

// Date in ORA LOCALE (toISOString userebbe l'UTC e sposterebbe il giorno)
function toLocalISO(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
function parseLocalDate(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
}
function todayISO() { return toLocalISO(new Date()); }

function formatDateItalian(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatEuro(n) {
    return '€' + (Number.isInteger(n) ? n : n.toFixed(2).replace('.', ','));
}
function formatHours(minutes) {
    const h = minutes / 60;
    return (Number.isInteger(h) ? h : parseFloat(h.toFixed(2)).toString().replace('.', ',')) + 'h';
}

function getStudent(id) { return students.find(s => s.id === id); }

// Tariffa e durata: valore dell'alunno, altrimenti quello predefinito in data.json
function lessonPrice(lesson) {
    if (Number.isFinite(lesson.price)) return lesson.price;
    const s = getStudent(lesson.studentId);
    return (s && Number.isFinite(s.price)) ? s.price : config.pricePerLesson;
}
function lessonMinutes(lesson) {
    const s = getStudent(lesson.studentId);
    return lesson.duration || (s && s.duration) || config.lessonDurationMinutes;
}
// Le lezioni annullate non generano incasso né ore
function isBillable(lesson) { return lesson.status !== 'Annullata'; }

// ---------------------------------------------------------------------
// Caricamento e salvataggio dati
// ---------------------------------------------------------------------

// Legge da localStorage. Se i dati sono corrotti li conserva in una chiave
// "_corrotto" (per poterli recuperare) e ricade sui dati di esempio.
function loadStored(key, fallback) {
    let raw = null;
    try {
        raw = localStorage.getItem(key);
        if (raw === null) return fallback;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) throw new Error('formato non valido');
        return parsed;
    } catch (err) {
        console.warn(`Dati "${key}" illeggibili:`, err);
        try { if (raw !== null) localStorage.setItem(key + '_corrotto', raw); } catch (e) { /* ignora */ }
        return fallback;
    }
}

async function loadData() {
    let seed;
    try {
        const res = await fetch('data.json');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        seed = await res.json();
    } catch (err) {
        console.warn('data.json non caricabile, uso i dati di riserva:', err);
        seed = FALLBACK_DATA;
    }
    config = { ...DEFAULT_CONFIG, ...(seed.config || {}) };
    students = loadStored(STORAGE_KEYS.students, seed.students || []);
    lessons = loadStored(STORAGE_KEYS.lessons, seed.lessons || []);
}

function saveData() {
    try {
        localStorage.setItem(STORAGE_KEYS.students, JSON.stringify(students));
        localStorage.setItem(STORAGE_KEYS.lessons, JSON.stringify(lessons));
    } catch (err) {
        console.error(err);
        alert('Impossibile salvare i dati nel browser (memoria piena o archiviazione bloccata). Esporta un backup con Ctrl+Alt+E.');
    }
    updateDashboardStats();
}

function updateDashboardStats() {
    renderDashboard();
}

// ---------------------------------------------------------------------
// Backup: esporta / importa (Ctrl+Alt+E  e  Ctrl+Alt+I)
// ---------------------------------------------------------------------
function exportData() {
    const payload = { app: 'GuitarStudio', version: 1, exportedAt: new Date().toISOString(), students, lessons };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `guitarstudio-backup-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const data = JSON.parse(reader.result);
                const idOk = v => typeof v === 'string' && /^[\w.-]+$/.test(v);
                if (!Array.isArray(data.students) || !Array.isArray(data.lessons)) throw new Error('mancano alunni o lezioni');
                if (!data.students.every(s => idOk(s.id) && typeof s.name === 'string')) throw new Error('alunni non validi');
                if (!data.lessons.every(l => idOk(l.id) && idOk(l.studentId) && /^\d{4}-\d{2}-\d{2}$/.test(l.date))) throw new Error('lezioni non valide');
                if (!confirm(`Importare ${data.students.length} alunni e ${data.lessons.length} lezioni?\nI dati attuali verranno sostituiti.`)) return;
                students = data.students;
                lessons = data.lessons;
                saveData();
                renderStudentsList();
                renderCalendarView();
                alert('Backup importato correttamente.');
            } catch (err) {
                alert('File di backup non valido: ' + err.message);
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

// ---------------------------------------------------------------------
// Credito ore: si scala quando una lezione diventa "Completata"
// e si restituisce se torna in un altro stato.
// ---------------------------------------------------------------------
function applyCreditForStatus(lesson, newStatus) {
    if (!config.autoDeductCredit) return;
    const s = getStudent(lesson.studentId);
    if (!s) return;
    if (newStatus === 'Completata' && !lesson.creditUsed && (s.credit || 0) > 0) {
        s.credit -= 1;
        lesson.creditUsed = true;
    } else if (newStatus !== 'Completata' && lesson.creditUsed) {
        s.credit = (s.credit || 0) + 1;
        lesson.creditUsed = false;
    }
}

// Mesi dell'anno accademico (config.calendarStart -> config.calendarEnd)
function buildMonthOptions() {
    const [sy, sm] = config.calendarStart.split('-').map(Number);
    const [ey, em] = config.calendarEnd.split('-').map(Number);
    let d = new Date(sy, sm - 1, 1);
    const endD = new Date(ey, em, 1);
    let opts = '';
    while (d < endD) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        opts += `<option value="${y}-${m}">${config.monthNames[d.getMonth()]} ${y}</option>`;
        d.setMonth(d.getMonth() + 1);
    }
    return opts;
}

// ---------------------------------------------------------------------
// Navigazione
// ---------------------------------------------------------------------
function switchTab(tabId) {
    ['dashboard', 'students', 'calendar', 'monthly'].forEach(t => {
        document.getElementById(`tab-${t}`).classList.add('hidden');
        document.getElementById(`nav-${t}`).classList.remove('bg-amber-500', 'text-slate-900', 'shadow');
        document.getElementById(`nav-${t}`).classList.add('bg-slate-700', 'text-slate-200');
    });
    document.getElementById(`tab-${tabId}`).classList.remove('hidden');
    document.getElementById(`nav-${tabId}`).classList.remove('bg-slate-700', 'text-slate-200');
    document.getElementById(`nav-${tabId}`).classList.add('bg-amber-500', 'text-slate-900', 'shadow');

    if (tabId === 'dashboard') renderDashboard();
    if (tabId === 'students') renderStudentsList();
    if (tabId === 'calendar') initCalendarFilters();
    if (tabId === 'monthly') initMonthlySummary();
}

// ---------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------
function renderDashboard() {
    document.getElementById('stat-total-students').innerText = students.length;

    const todayStr = todayISO();
    const currentMonthStr = todayStr.substring(0, 7);

    const monthLessons = lessons.filter(l => l.date.startsWith(currentMonthStr));
    document.getElementById('stat-month-lessons').innerText = monthLessons.length;

    const pendingRev = lessons
        .filter(l => l.payment === 'Da Saldare' && isBillable(l))
        .reduce((sum, l) => sum + lessonPrice(l), 0);
    document.getElementById('stat-pending-revenue').innerText = formatEuro(pendingRev);

    const recovery = lessons.filter(l => l.status === 'Da recuperare').length;
    document.getElementById('stat-recovery-lessons').innerText = recovery;

    const upcomingContainer = document.getElementById('dashboard-upcoming-list');
    const upcoming = lessons
        .filter(l => l.date >= todayStr && l.status === 'Programmata')
        .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
        .slice(0, 5);

    if (upcoming.length === 0) {
        upcomingContainer.innerHTML = `<p class="text-slate-400 text-sm py-4 text-center">Nessuna lezione imminente programmata.</p>`;
        return;
    }

    upcomingContainer.innerHTML = upcoming.map(l => {
        const st = getStudent(l.studentId) || { name: 'Sconosciuto' };
        return `
            <div class="bg-slate-700/30 border border-slate-700/60 p-4 rounded-xl flex items-center justify-between gap-4">
                <div class="flex items-center gap-3">
                    <div class="bg-amber-500/10 text-amber-400 p-2.5 rounded-xl"><i class="fa-solid fa-guitar"></i></div>
                    <div>
                        <h4 class="font-bold text-white text-sm">${escapeHtml(st.name)}</h4>
                        <p class="text-xs text-slate-400">${formatDateItalian(l.date)} ore ${escapeHtml(l.time)}</p>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">${escapeHtml(l.status)}</span>
                    <button onclick="sendWhatsApp('${escapeHtml(l.id)}')" class="bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white p-2 rounded-lg transition text-xs" title="Promemoria WhatsApp"><i class="fa-brands fa-whatsapp text-base"></i></button>
                </div>
            </div>
        `;
    }).join('');
}

// ---------------------------------------------------------------------
// Alunni
// ---------------------------------------------------------------------
function renderStudentsList() {
    const query = (document.getElementById('student-search').value || '').toLowerCase();
    const grid = document.getElementById('students-grid');
    const filtered = students.filter(s => s.name.toLowerCase().includes(query) || (s.level || '').toLowerCase().includes(query));

    if (filtered.length === 0) {
        grid.innerHTML = `<div class="col-span-full py-12 text-center text-slate-400">Nessun alunno trovato.</div>`;
        return;
    }

    grid.innerHTML = filtered.map(s => `
        <div class="bg-slate-800 border border-slate-700 rounded-2xl p-5 shadow flex flex-col justify-between gap-4">
            <div>
                <div class="flex justify-between items-start">
                    <div>
                        <h3 class="font-bold text-lg text-white">${escapeHtml(s.name)}</h3>
                        <span class="inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">${escapeHtml(s.level)}</span>
                    </div>
                    <div class="flex gap-1">
                        <button onclick="editStudent('${escapeHtml(s.id)}')" class="p-2 text-slate-400 hover:text-white transition"><i class="fa-solid fa-pen text-sm"></i></button>
                        <button onclick="deleteStudent('${escapeHtml(s.id)}')" class="p-2 text-rose-400 hover:text-rose-300 transition"><i class="fa-solid fa-trash text-sm"></i></button>
                    </div>
                </div>
                <div class="mt-4 space-y-2 text-xs text-slate-300">
                    <div class="flex items-center gap-2"><i class="fa-solid fa-phone text-slate-400 w-4"></i> ${escapeHtml(s.phone) || 'Non specificato'}</div>
                    <div class="flex items-center gap-2"><i class="fa-solid fa-clock text-slate-400 w-4"></i> ${escapeHtml(s.prefDay)} ore ${escapeHtml(s.prefTime)}</div>
                    <div class="flex items-center gap-2"><i class="fa-solid fa-ticket text-amber-400 w-4"></i> Credito Pacchetto: <strong class="text-white">${Number(s.credit) || 0} ore</strong></div>
                </div>
            </div>
            <div class="pt-3 border-t border-slate-700/60 flex justify-between items-center text-xs">
                <button onclick="quickAddCredit('${escapeHtml(s.id)}')" class="bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded-lg transition font-medium">+1 Credito Ora</button>
                <button onclick="viewStudentCalendar('${escapeHtml(s.id)}')" class="text-amber-400 hover:underline font-medium">Vedi Calendario <i class="fa-solid fa-arrow-right ml-1"></i></button>
            </div>
        </div>
    `).join('');
}

function openStudentModal(studentId = null) {
    document.getElementById('student-modal').classList.remove('hidden');
    if (studentId) {
        document.getElementById('student-modal-title').innerText = 'Modifica Alunno';
        const s = getStudent(studentId);
        document.getElementById('student-id').value = s.id;
        document.getElementById('s-name').value = s.name;
        document.getElementById('s-level').value = s.level;
        document.getElementById('s-phone').value = s.phone;
        document.getElementById('s-pref-day').value = s.prefDay;
        document.getElementById('s-pref-time').value = s.prefTime;
        document.getElementById('s-credit').value = s.credit || 0;
        document.getElementById('s-price').value = Number.isFinite(s.price) ? s.price : '';
        document.getElementById('s-duration').value = s.duration || '';
    } else {
        document.getElementById('student-modal-title').innerText = 'Nuovo Alunno';
        document.getElementById('student-form').reset();
        document.getElementById('student-id').value = '';
    }
}
function closeStudentModal() { document.getElementById('student-modal').classList.add('hidden'); }

function saveStudent(e) {
    e.preventDefault();
    const id = document.getElementById('student-id').value;
    const name = document.getElementById('s-name').value.trim();
    if (!name) { alert('Inserisci il nome dell\'alunno.'); return; }

    const priceRaw = document.getElementById('s-price').value;
    const durationRaw = document.getElementById('s-duration').value;
    const data = {
        id: id || newId('s_'),
        name: name,
        level: document.getElementById('s-level').value,
        phone: document.getElementById('s-phone').value.trim(),
        prefDay: document.getElementById('s-pref-day').value,
        prefTime: document.getElementById('s-pref-time').value,
        credit: Math.max(0, parseInt(document.getElementById('s-credit').value) || 0)
    };
    // Campi facoltativi: se vuoti vale il valore predefinito di data.json
    if (priceRaw !== '' && Number(priceRaw) >= 0) data.price = Number(priceRaw);
    if (durationRaw !== '' && Number(durationRaw) > 0) data.duration = parseInt(durationRaw);

    if (id) {
        const idx = students.findIndex(x => x.id === id);
        students[idx] = data;
    } else {
        students.push(data);
    }
    saveData();
    closeStudentModal();
    renderStudentsList();
}

function editStudent(id) { openStudentModal(id); }
function deleteStudent(id) {
    if (confirm('Eliminare questo alunno e tutte le lezioni associate?')) {
        students = students.filter(s => s.id !== id);
        lessons = lessons.filter(l => l.studentId !== id);
        saveData();
        renderStudentsList();
    }
}

function quickAddCredit(id) {
    const s = getStudent(id);
    if (s) {
        s.credit = (s.credit || 0) + 1;
        saveData();
        renderStudentsList();
    }
}

function viewStudentCalendar(studentId) {
    switchTab('calendar');
    document.getElementById('cal-filter-student').value = studentId;
    renderCalendarView();
}

// ---------------------------------------------------------------------
// Generatore lezioni ricorrenti
// ---------------------------------------------------------------------
function openBulkGeneratorModal() {
    const sel = document.getElementById('bulk-student-id');
    sel.innerHTML = students.map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)} (${escapeHtml(s.prefDay)} ore ${escapeHtml(s.prefTime)})</option>`).join('');
    document.getElementById('bulk-modal').classList.remove('hidden');
}
function closeBulkGeneratorModal() { document.getElementById('bulk-modal').classList.add('hidden'); }

function generateBulkLessons(e) {
    e.preventDefault();
    const studentId = document.getElementById('bulk-student-id').value;
    const targetDay = parseInt(document.getElementById('bulk-day').value);
    const time = document.getElementById('bulk-time').value;
    const startVal = document.getElementById('bulk-start-date').value;
    const endVal = document.getElementById('bulk-end-date').value;

    if (!studentId) { alert('Aggiungi prima almeno un alunno.'); return; }
    if (!startVal || !endVal) { alert('Inserisci sia la data di inizio sia quella di fine.'); return; }

    const startDate = parseLocalDate(startVal);
    const endDate = parseLocalDate(endVal);
    if (endDate < startDate) { alert('La data di fine non può precedere quella di inizio.'); return; }

    let curr = new Date(startDate);
    while (curr.getDay() !== targetDay) {
        curr.setDate(curr.getDate() + 1);
    }

    let count = 0;
    while (curr <= endDate) {
        const dateStr = toLocalISO(curr);
        const exists = lessons.some(l => l.studentId === studentId && l.date === dateStr);
        if (!exists) {
            lessons.push({
                id: newId('l_'),
                studentId: studentId,
                date: dateStr,
                time: time,
                status: 'Programmata',
                payment: 'Da Saldare'
            });
            count++;
        }
        curr.setDate(curr.getDate() + 7);
    }

    saveData();
    closeBulkGeneratorModal();
    alert(`Generate con successo ${count} lezioni ricorrenti!`);
    switchTab('calendar');
}

// ---------------------------------------------------------------------
// Calendario e lezioni
// ---------------------------------------------------------------------
function initCalendarFilters() {
    const sSelect = document.getElementById('cal-filter-student');
    const currentVal = sSelect.value;
    sSelect.innerHTML = `<option value="">-- Tutti gli Alunni --</option>` + students.map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`).join('');
    sSelect.value = currentVal;

    const mSelect = document.getElementById('cal-filter-month');
    const currentMonth = mSelect.value;
    mSelect.innerHTML = `<option value="">Tutti i Mesi (2026-2027)</option>` + buildMonthOptions();
    mSelect.value = currentMonth;

    renderCalendarView();
}

function renderCalendarView() {
    const studentFilter = document.getElementById('cal-filter-student').value;
    const monthFilter = document.getElementById('cal-filter-month').value;
    const tbody = document.getElementById('calendar-table-body');

    let filtered = lessons.filter(l => {
        if (studentFilter && l.studentId !== studentFilter) return false;
        if (monthFilter && !l.date.startsWith(monthFilter)) return false;
        return true;
    });

    filtered.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-slate-400">Nessuna lezione trovata con i filtri selezionati.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(l => {
        const st = getStudent(l.studentId) || { name: 'Alunno Eliminato' };
        const id = escapeHtml(l.id);

        let statusBg = 'bg-blue-500/10 text-blue-300 border-blue-500/30';
        if (l.status === 'Completata') statusBg = 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30';
        if (l.status === 'Annullata') statusBg = 'bg-slate-600/30 text-slate-400 border-slate-600/30';
        if (l.status === 'Da recuperare') statusBg = 'bg-rose-500/10 text-rose-300 border-rose-500/30';

        return `
            <tr class="hover:bg-slate-700/20 transition">
                <td class="p-4 font-medium text-white">
                    <div>${formatDateItalian(l.date)}</div>
                    <div class="text-xs text-slate-400 font-normal"><i class="fa-regular fa-clock mr-1"></i>${escapeHtml(l.time)}</div>
                </td>
                <td class="p-4 font-semibold text-white">${escapeHtml(st.name)}<div class="text-xs text-slate-400 font-normal mt-0.5">${formatEuro(lessonPrice(l))} &middot; ${lessonMinutes(l)} min</div></td>
                <td class="p-4">
                    <select onchange="updateLessonStatus('${id}', this.value)" class="px-3 py-1 rounded-lg text-xs font-semibold border ${statusBg} outline-none cursor-pointer">
                        <option value="Programmata" ${l.status === 'Programmata' ? 'selected' : ''}>Programmata</option>
                        <option value="Completata" ${l.status === 'Completata' ? 'selected' : ''}>Completata</option>
                        <option value="Annullata" ${l.status === 'Annullata' ? 'selected' : ''}>Annullata</option>
                        <option value="Da recuperare" ${l.status === 'Da recuperare' ? 'selected' : ''}>Da recuperare</option>
                    </select>
                </td>
                <td class="p-4">
                    <select onchange="updateLessonPayment('${id}', this.value)" class="px-3 py-1 rounded-lg text-xs font-semibold ${l.payment === 'Pagata' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'} outline-none cursor-pointer">
                        <option value="Da Saldare" ${l.payment === 'Da Saldare' ? 'selected' : ''}>Da Saldare</option>
                        <option value="Pagata" ${l.payment === 'Pagata' ? 'selected' : ''}>Pagata</option>
                    </select>
                </td>
                <td class="p-4 text-center">
                    <button onclick="openLessonEditModal('${id}')" class="bg-slate-600/40 hover:bg-slate-600 text-slate-300 hover:text-white p-2 rounded-lg transition text-xs" title="Modifica data, ora, costo..."><i class="fa-solid fa-pen"></i></button>
                    <button onclick="sendWhatsApp('${id}')" class="bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white px-3 py-1.5 rounded-lg transition text-xs font-medium inline-flex items-center gap-1.5 shadow">
                        <i class="fa-brands fa-whatsapp"></i> WhatsApp
                    </button>
                </td>
                <td class="p-4 text-center">
                    <button onclick="deleteSingleLesson('${id}')" class="bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white p-2 rounded-lg transition text-xs" title="Elimina questa lezione">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function updateLessonStatus(id, newStatus) {
    const l = lessons.find(x => x.id === id);
    if (l) {
        applyCreditForStatus(l, newStatus);
        l.status = newStatus;
        saveData();
        renderCalendarView();
    }
}

function updateLessonPayment(id, newPayment) {
    const l = lessons.find(x => x.id === id);
    if (l) {
        l.payment = newPayment;
        saveData();
        renderCalendarView();
    }
}

function deleteSingleLesson(id) {
    if (confirm('Sei sicuro di voler eliminare questa singola data di lezione dal calendario?')) {
        const l = lessons.find(x => x.id === id);
        if (l) applyCreditForStatus(l, 'Eliminata'); // restituisce l'eventuale credito già scalato
        lessons = lessons.filter(x => x.id !== id);
        saveData();
        renderCalendarView();
    }
}

function openLessonCreateModal() {
    const sel = document.getElementById('l-student-id');
    sel.innerHTML = students.map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`).join('');
    document.getElementById('lesson-modal-title').innerText = 'Nuova Singola Lezione';
    document.getElementById('lesson-id').value = '';
    document.getElementById('l-date').value = todayISO();
    document.getElementById('l-time').value = '15:00';
    document.getElementById('l-status').value = 'Programmata';
    document.getElementById('l-payment').value = 'Da Saldare';
    document.getElementById('l-price').value = '';
    document.getElementById('l-duration').value = '';
    document.getElementById('lesson-modal').classList.remove('hidden');
}

function openLessonEditModal(id) {
    const l = lessons.find(x => x.id === id);
    if (!l) return;
    openLessonCreateModal();
    document.getElementById('lesson-modal-title').innerText = 'Modifica Lezione';
    document.getElementById('lesson-id').value = l.id;
    document.getElementById('l-student-id').value = l.studentId;
    document.getElementById('l-date').value = l.date;
    document.getElementById('l-time').value = l.time;
    document.getElementById('l-status').value = l.status;
    document.getElementById('l-payment').value = l.payment;
    document.getElementById('l-price').value = Number.isFinite(l.price) ? l.price : '';
    document.getElementById('l-duration').value = l.duration || '';
}

function closeLessonModal() { document.getElementById('lesson-modal').classList.add('hidden'); }

function saveSingleLesson(e) {
    e.preventDefault();
    const editId = document.getElementById('lesson-id').value;
    const priceRaw = document.getElementById('l-price').value;
    const durationRaw = document.getElementById('l-duration').value;
    const chosenStatus = document.getElementById('l-status').value;

    if (editId) {
        // ------ MODIFICA lezione esistente ------
        const l = lessons.find(x => x.id === editId);
        if (!l) return;
        applyCreditForStatus(l, 'Ripristinata'); // restituisce eventuale credito scalato
        l.studentId = document.getElementById('l-student-id').value;
        l.date = document.getElementById('l-date').value;
        l.time = document.getElementById('l-time').value;
        l.payment = document.getElementById('l-payment').value;
        if (priceRaw !== '' && Number(priceRaw) >= 0) l.price = Number(priceRaw); else delete l.price;
        if (durationRaw !== '' && Number(durationRaw) > 0) l.duration = parseInt(durationRaw); else delete l.duration;
        applyCreditForStatus(l, chosenStatus);
        l.status = chosenStatus;
    } else {
        // ------ NUOVA lezione ------
        const data = {
            id: newId('l_'),
            studentId: document.getElementById('l-student-id').value,
            date: document.getElementById('l-date').value,
            time: document.getElementById('l-time').value,
            status: 'Programmata',
            payment: document.getElementById('l-payment').value
        };
        if (!data.studentId) { alert('Aggiungi prima almeno un alunno.'); return; }
        if (!data.date) { alert('Inserisci la data della lezione.'); return; }
        if (priceRaw !== '' && Number(priceRaw) >= 0) data.price = Number(priceRaw);
        if (durationRaw !== '' && Number(durationRaw) > 0) data.duration = parseInt(durationRaw);
        lessons.push(data);
        applyCreditForStatus(data, chosenStatus);
        data.status = chosenStatus;
    }

    saveData();
    closeLessonModal();
    renderCalendarView();
}

// ---------------------------------------------------------------------
// Promemoria WhatsApp
// ---------------------------------------------------------------------
function sendWhatsApp(lessonId) {
    const l = lessons.find(x => x.id === lessonId);
    const st = l && getStudent(l.studentId);
    if (!st || !st.phone) {
        alert('Questo alunno non ha un numero di telefono WhatsApp registrato.');
        return;
    }

    const msg = `Ciao ${st.name.split(' ')[0]}! Ti ricordo della nostra lezione di chitarra fissata per *${formatDateItalian(l.date)}* alle ore *${l.time}*. Inoltre oggi iniziamo un nuovo ciclo di lezioni, A presto! 🎸`;
    document.getElementById('whatsapp-text-area').value = msg;

    let cleanPhone = st.phone.replace(/[^0-9]/g, '');
    if (!cleanPhone.startsWith('39') && cleanPhone.length === 10) cleanPhone = '39' + cleanPhone;

    document.getElementById('whatsapp-send-btn').href = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
    document.getElementById('whatsapp-modal').classList.remove('hidden');
}
function closeWhatsAppModal() { document.getElementById('whatsapp-modal').classList.add('hidden'); }

// ---------------------------------------------------------------------
// Riepilogo mensile
// ---------------------------------------------------------------------
function initMonthlySummary() {
    const mSelect = document.getElementById('summary-month-select');
    mSelect.innerHTML = buildMonthOptions();

    const currentYm = todayISO().substring(0, 7);
    if (document.querySelector(`#summary-month-select option[value="${currentYm}"]`)) {
        mSelect.value = currentYm;
    } else {
        mSelect.value = config.calendarStart;
    }

    renderMonthlySummary();
}

function renderMonthlySummary() {
    const ym = document.getElementById('summary-month-select').value;
    const [year, month] = ym.split('-');
    document.getElementById('print-month-title').innerText = `Mese di ${config.monthNames[parseInt(month) - 1]} ${year}`;

    const monthLessons = lessons.filter(l => l.date.startsWith(ym));
    const billable = monthLessons.filter(isBillable);
    document.getElementById('summary-total-lessons').innerText = monthLessons.length;

    const paidSum = billable.filter(l => l.payment === 'Pagata').reduce((sum, l) => sum + lessonPrice(l), 0);
    const pendingSum = billable.filter(l => l.payment === 'Da Saldare').reduce((sum, l) => sum + lessonPrice(l), 0);
    document.getElementById('summary-revenue').innerText = `${formatEuro(paidSum)} / ${formatEuro(pendingSum)}`;
    document.getElementById('summary-hours').innerText = formatHours(billable.reduce((sum, l) => sum + lessonMinutes(l), 0));

    const tbody = document.getElementById('summary-table-body');
    if (students.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-slate-400">Nessun alunno registrato.</td></tr>`;
        return;
    }

    tbody.innerHTML = students.map(s => {
        const sLessons = monthLessons.filter(l => l.studentId === s.id);
        const completed = sLessons.filter(l => l.status === 'Completata').length;
        const paidAll = sLessons.length > 0 && sLessons.filter(isBillable).every(l => l.payment === 'Pagata');

        return `
            <tr class="hover:bg-slate-700/20">
                <td class="p-4 font-bold text-white">${escapeHtml(s.name)}</td>
                <td class="p-4 text-slate-300">${escapeHtml(s.level)}</td>
                <td class="p-4 text-center">${sLessons.length}</td>
                <td class="p-4 text-center">${completed}</td>
                <td class="p-4 text-center font-semibold text-amber-400">${Number(s.credit) || 0} ore</td>
                <td class="p-4">
                    <span class="px-2.5 py-1 rounded-full text-xs font-semibold ${sLessons.length === 0 ? 'bg-slate-600/30 text-slate-400' : (paidAll ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300')}">
                        ${sLessons.length === 0 ? 'Nessuna lezione' : (paidAll ? 'Saldato' : 'In sospeso')}
                    </span>
                </td>
            </tr>
        `;
    }).join('');
}

// ---------------------------------------------------------------------
// Scorciatoie da tastiera e avvio
// ---------------------------------------------------------------------
const MODAL_IDS = ['student-modal', 'bulk-modal', 'lesson-modal', 'whatsapp-modal'];

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        MODAL_IDS.forEach(id => document.getElementById(id).classList.add('hidden'));
    }
    if (e.ctrlKey && e.altKey && e.code === 'KeyE') { e.preventDefault(); exportData(); }
    if (e.ctrlKey && e.altKey && e.code === 'KeyI') { e.preventDefault(); importData(); }
});

window.onload = async function() {
    await loadData();
    renderDashboard();
};

// ---------------------------------------------------------------------
// Copia lezioni da un alunno a un altro
// ---------------------------------------------------------------------
function openCopyModal() {
    if (students.length < 2) { alert('Servono almeno due alunni per usare la copia.'); return; }
    const opts = students.map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`).join('');
    document.getElementById('copy-source-id').innerHTML = opts;
    document.getElementById('copy-target-id').innerHTML = opts;
    document.getElementById('copy-start-date').value = '';
    document.getElementById('copy-end-date').value = '';
    document.getElementById('copy-modal').classList.remove('hidden');
}
function closeCopyModal() { document.getElementById('copy-modal').classList.add('hidden'); }

function executeCopyLessons(e) {
    e.preventDefault();
    const sourceId = document.getElementById('copy-source-id').value;
    const targetId = document.getElementById('copy-target-id').value;
    if (!sourceId || !targetId) { alert('Seleziona entrambi gli alunni.'); return; }
    if (sourceId === targetId) { alert('Scegli due alunni diversi.'); return; }
    const start = document.getElementById('copy-start-date').value;
    const end = document.getElementById('copy-end-date').value;

    const toCopy = lessons.filter(l =>
        l.studentId === sourceId &&
        (!start || l.date >= start) &&
        (!end || l.date <= end)
    );
    if (toCopy.length === 0) { alert('Nessuna lezione da copiare nel periodo selezionato.'); return; }

    let copied = 0, skipped = 0;
    toCopy.forEach(l => {
        if (lessons.some(x => x.studentId === targetId && x.date === l.date && x.time === l.time)) {
            skipped++;
            return;
        }
        const copy = {
            id: newId('l_'),
            studentId: targetId,
            date: l.date,
            time: l.time,
            status: l.status,
            payment: l.payment
        };
        if (Number.isFinite(l.price)) copy.price = l.price;
        if (l.duration) copy.duration = l.duration;
        lessons.push(copy);
        applyCreditForStatus(copy, copy.status);
        copied++;
    });

    saveData();
    renderCalendarView();
    closeCopyModal();
    alert(`Copiate ${copied} lezioni.` + (skipped ? `\nSaltate ${skipped} lezioni già presenti alla stessa data e ora.` : ''));
}
