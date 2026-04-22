let groups = JSON.parse(localStorage.getItem('attendance_archive_v1')) || {};
let currentGroupId = null;
let currentMonthKey = new Date().toISOString().slice(0, 7);
let deferredPrompt;

// ========== КАСТОМНЫЕ ДИАЛОГИ ==========
const promptModal = document.getElementById('custom-prompt-modal');
const promptInput = document.getElementById('prompt-input');
const promptTitle = document.getElementById('prompt-title');
const promptError = document.getElementById('prompt-error');
const promptConfirm = document.getElementById('prompt-confirm');
const promptCancel = document.getElementById('prompt-cancel');

const confirmModal = document.getElementById('custom-confirm-modal');
const confirmTitle = document.getElementById('confirm-title');
const confirmMessage = document.getElementById('confirm-message');
const confirmYes = document.getElementById('confirm-yes');
const confirmNo = document.getElementById('confirm-no');

let currentPromptResolver = null;
let currentConfirmResolver = null;

// Функция показа кастомного prompt
function showCustomPrompt(title, placeholder = '', defaultValue = '', validator = null) {
    return new Promise((resolve) => {
        currentPromptResolver = resolve;
        promptTitle.innerHTML = `<i class="fas fa-pencil-alt"></i> ${title}`;
        promptInput.placeholder = placeholder;
        promptInput.value = defaultValue;
        promptError.textContent = '';
        promptModal.classList.remove('hidden');
        promptInput.focus();

        promptInput.dataset.validator = validator ? true : false;
        promptInput.validator = validator;
    });
}

// Функция показа кастомного confirm
function showCustomConfirm(title, message, isDanger = false) {
    return new Promise((resolve) => {
        currentConfirmResolver = resolve;
        confirmTitle.innerHTML = `<i class="fas fa-${isDanger ? 'exclamation-triangle' : 'question-circle'}"></i> ${title}`;
        confirmMessage.textContent = message;
        if (isDanger) {
            confirmYes.style.background = 'var(--n-color)';
        } else {
            confirmYes.style.background = 'var(--accent)';
        }
        confirmModal.classList.remove('hidden');
    });
}

// Закрытие prompt
function closePrompt(value) {
    promptModal.classList.add('hidden');
    if (currentPromptResolver) {
        currentPromptResolver(value);
        currentPromptResolver = null;
    }
    promptInput.value = '';
    promptError.textContent = '';
}

// Закрытие confirm
function closeConfirm(value) {
    confirmModal.classList.add('hidden');
    if (currentConfirmResolver) {
        currentConfirmResolver(value);
        currentConfirmResolver = null;
    }
}

// Обработчики для prompt
promptConfirm.addEventListener('click', () => {
    const value = promptInput.value.trim();
    const validator = promptInput.validator;

    if (validator && !validator(value)) {
        promptError.textContent = 'Некорректное значение!';
        promptInput.focus();
        return;
    }
    closePrompt(value);
});

promptCancel.addEventListener('click', () => closePrompt(null));
promptInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') promptConfirm.click();
    if (e.key === 'Escape') promptCancel.click();
});

// Обработчики для confirm
confirmYes.addEventListener('click', () => closeConfirm(true));
confirmNo.addEventListener('click', () => closeConfirm(false));

// Закрытие по клику на фон
promptModal.addEventListener('click', (e) => {
    if (e.target === promptModal) closePrompt(null);
});
confirmModal.addEventListener('click', (e) => {
    if (e.target === confirmModal) closeConfirm(false);
});

// ========== SERVICE WORKER ==========
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.log("SW error:", err));
}

// ========== PWA УСТАНОВКА ==========
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const installBtn = document.getElementById('btn-install-app');
    if (!isStandalone && installBtn) {
        installBtn.classList.remove('hidden');
    }
});

// ========== ИНИЦИАЛИЗАЦИЯ МЕСЯЦА ==========
function initMonthPicker() {
    const select = document.getElementById('month-select');
    if (!select) return;
    select.innerHTML = '';
    for (let i = 0; i > -12; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() + i);
        const val = d.toISOString().slice(0, 7);
        const label = d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
        const opt = new Option(label, val);
        if (val === currentMonthKey) opt.selected = true;
        select.add(opt);
    }
}

// ========== ОТРИСОВКА ЗАГОЛОВКОВ ==========
function renderTableHeaders() {
    const headerRow = document.getElementById('header-row');
    headerRow.innerHTML = '<th class="sticky-col">ФИО</th>';
    const [year, month] = currentMonthKey.split('-').map(Number);
    const daysCount = new Date(year, month, 0).getDate();
    const today = new Date();
    const isThisMonth = today.toISOString().slice(0, 7) === currentMonthKey;

    for (let i = 1; i <= daysCount; i++) {
        const th = document.createElement('th');
        th.textContent = i < 10 ? '0' + i : i;

        if (isThisMonth && i === today.getDate()) {
            th.className = 'today-mark';
        }

        headerRow.appendChild(th);
    }
}

// ========== ОСНОВНОЙ РЕНДЕР ==========
function render() {
    const gScreen = document.getElementById('group-screen');
    const aScreen = document.getElementById('attendance-screen');
    const dutyBtn = document.getElementById('btn-duty-open');
    const helpBtn = document.getElementById('btn-help-open');

    if (currentGroupId === null) {
        gScreen.classList.add('active');
        aScreen.classList.remove('active');
        aScreen.classList.add('hidden');
        if (dutyBtn) dutyBtn.style.display = 'none';
        if (dutyBtn) dutyBtn.style.display = 'none';

        const list = document.getElementById('group-list');
        list.innerHTML = '';
        Object.keys(groups).forEach(id => {
            const wrap = document.createElement('div');
            wrap.className = 'group-card-wrapper';
            wrap.innerHTML = `<div class="group-card" data-id="${id}">${id}</div><button class="btn-del" data-del-group="${id}"><i class="fas fa-times"></i></button>`;
            list.appendChild(wrap);
        });
    } else {
        gScreen.classList.remove('active');
        aScreen.classList.remove('hidden');
        aScreen.classList.add('active');
        if (helpBtn) helpBtn.style.display = 'none';
        if (dutyBtn) dutyBtn.style.display = 'flex';

        document.getElementById('current-group-title').textContent = currentGroupId;
        initMonthPicker();
        renderTableHeaders();

        // Автоматический перенос студентов из прошлых месяцев
        if (!groups[currentGroupId][currentMonthKey]) {
            const monthKeys = Object.keys(groups[currentGroupId]).sort();
            const [y, m] = currentMonthKey.split('-').map(Number);

            // Собираем ВСЕХ уникальных студентов из всех существующих месяцев
            const allStudents = new Map();

            monthKeys.forEach(monthKey => {
                groups[currentGroupId][monthKey].forEach(student => {
                    if (student.name && student.name.trim() !== '') {
                        allStudents.set(student.name, student.name);
                    }
                });
            });

            // Если есть студенты в прошлых месяцах - переносим их
            if (allStudents.size > 0) {
                const studentNames = Array.from(allStudents.keys()).sort();
                groups[currentGroupId][currentMonthKey] = studentNames.map(name => ({
                    name: name,
                    data: Array(new Date(y, m, 0).getDate()).fill("")
                }));
            } else {
                // Если студентов вообще нет - создаём пустой массив
                groups[currentGroupId][currentMonthKey] = [];
            }

            save();
        }

        const body = document.getElementById('table-body');
        body.innerHTML = '';

        groups[currentGroupId][currentMonthKey].forEach((row, idx) => {
            const tr = document.createElement('tr');

            let cells = row.data.map((valObj, d) => {
                const val = typeof valObj === 'object' ? valObj.status : valObj;
                const solved = typeof valObj === 'object' ? valObj.solved : false;

                return `<td class="cell-${val}">
                    ${val === 'О' ? `<div class="duty-status-mark ${solved ? 'mark-solved' : 'mark-unsolved'}" data-row="${idx}" data-day="${d}">${solved ? '✓' : '×'}</div>` : ''}
                    <select class="status-select" data-row="${idx}" data-day="${d}">
                        <option value="" ${val === '' ? 'selected' : ''}>-</option>
                        <option value="Б" ${val === 'Б' ? 'selected' : ''}>Б</option>
                        <option value="О" ${val === 'О' ? 'selected' : ''}>О</option>
                        <option value="Н" ${val === 'Н' ? 'selected' : ''}>Н</option>
                    </select>
                </td>`;
            }).join('');

            tr.innerHTML = `<td class="sticky-col"><button class="btn-del-row" data-del-row="${idx}"><i class="fas fa-times"></i></button><span contenteditable="true" class="edit-name" data-idx="${idx}" data-placeholder="Введите ФИО...">${row.name}</span></td>${cells}`;
            body.appendChild(tr);
        });
    }
}

// ========== ДЕЖУРНЫЕ ==========
function updateDuty() {
    const qty = parseInt(document.getElementById('duty-qty').value) || 2;
    let priority = [];
    let others = [];

    const currentMonthData = groups[currentGroupId][currentMonthKey] || [];
    const studentNames = currentMonthData.map(s => s.name).filter(n => n.trim() !== "");

    Object.keys(groups[currentGroupId]).forEach(mKey => {
        groups[currentGroupId][mKey].forEach(student => {
            student.data.forEach(cell => {
                if (typeof cell === 'object' && cell.status === 'О' && !cell.solved) {
                    if (!priority.includes(student.name) && studentNames.includes(student.name)) {
                        priority.push(student.name);
                    }
                }
            });
        });
    });

    studentNames.forEach(n => { if (!priority.includes(n)) others.push(n); });
    const rotation = new Date().getDate() % (others.length || 1);
    const sortedOthers = [...others.slice(rotation), ...others.slice(0, rotation)];
    const finalDuty = [...priority, ...sortedOthers].slice(0, qty);

    document.getElementById('duty-list-display').innerHTML = finalDuty.map(n =>
        `<div class="duty-name"><i class="fas fa-user-check"></i> ${n}</div>`
    ).join('');
}

// ========== ОБРАБОТКА КЛИКОВ (С КАСТОМНЫМИ ДИАЛОГАМИ) ==========
document.addEventListener('click', async (e) => {
    const t = e.target.closest('button') || e.target;

    // Открытие группы
    if (t.classList.contains('group-card')) {
        currentGroupId = t.dataset.id;
        render();
    }

    // Удаление группы
    if (t.dataset.delGroup) {
        const confirmed = await showCustomConfirm(
            'Удаление группы',
            `Вы точно хотите удалить группу "${t.dataset.delGroup}" и ВСЮ её историю?`,
            true
        );
        if (confirmed) {
            delete groups[t.dataset.delGroup];
            save();
            render();
        }
    }

    // Удаление строки
    if (t.dataset.delRow !== undefined) {
        const confirmed = await showCustomConfirm(
            'Удаление студента',
            'Удалить этого студента из текущего месяца?',
            true
        );
        if (confirmed) {
            groups[currentGroupId][currentMonthKey].splice(t.dataset.delRow, 1);
            save();
            render();
        }
    }

    // Переключение отработки
    if (t.classList.contains('duty-status-mark')) {
        const r = t.dataset.row;
        const d = t.dataset.day;
        const current = groups[currentGroupId][currentMonthKey][r].data[d];

        if (typeof current === 'object') {
            current.solved = !current.solved;
        }
        save();
        render();
    }

    // Главная кнопка "+"
    if (t.id === 'btn-main-add') {
        if (!currentGroupId) {
            const groupName = await showCustomPrompt(
                'Новая группа',
                'Например: 25-03',
                '',
                (val) => val.length > 0 && !groups[val]
            );

            if (groupName) {
                if (!groups[groupName]) {
                    groups[groupName] = {};
                    save();
                    render();
                }
            }
        } else {
            const [y, m] = currentMonthKey.split('-').map(Number);
            groups[currentGroupId][currentMonthKey].push({
                name: "",
                data: Array(new Date(y, m, 0).getDate()).fill("")
            });
            save();
            render();
        }
    }

    if (t.id === 'btn-back') {
        currentGroupId = null;
        render();
    }

    if (t.id === 'btn-duty-open') {
        if (currentGroupId) {
            updateDuty();
            document.getElementById('duty-modal').classList.remove('hidden');
        }
    }

    if (t.id === 'btn-help-open') {
        if (currentGroupId) {
            updateDuty();
            document.getElementById('help-modal').classList.remove('hidden');
        }
    }

    if (t.id === 'btn-close-duty' || t.id === 'duty-modal') {
        document.getElementById('duty-modal').classList.add('hidden');
    }

    if (t.id === 'btn-open-settings') {
        document.getElementById('settings-modal').classList.remove('hidden');
    }

    if (t.id === 'btn-close-settings' || t.id === 'settings-modal') {
        document.getElementById('settings-modal').classList.add('hidden');
    }

    if (t.id === 'btn-refresh-duty') {
        updateDuty();
    }

    // Переключение темы
    if (t.id === 'btn-theme-toggle' || t.closest('#btn-theme-toggle')) {
        const currentTheme = document.body.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.body.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    }

    // Установка PWA
    if (t.id === 'btn-install-app' && deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') t.classList.add('hidden');
        deferredPrompt = null;
    }
});

// ========== ОБРАБОТКА ИЗМЕНЕНИЙ ==========
document.addEventListener('change', (e) => {
    if (e.target.id === 'month-select') {
        currentMonthKey = e.target.value;
        render();
    }

    if (e.target.classList.contains('status-select')) {
        const s = e.target;
        const row = s.dataset.row;
        const day = s.dataset.day;
        const val = s.value;

        groups[currentGroupId][currentMonthKey][row].data[day] =
            (val === 'О') ? { status: 'О', solved: false } : val;
        save();
        render();
    }
});

// Редактирование имени
document.addEventListener('focusout', (e) => {
    if (e.target.classList.contains('edit-name')) {
        const idx = e.target.getAttribute('data-idx');
        if (groups[currentGroupId] && groups[currentGroupId][currentMonthKey]) {
            groups[currentGroupId][currentMonthKey][idx].name = e.target.textContent;
            save();
        }
    }
});

// ========== ЭКСПОРТ/ИМПОРТ ==========
document.getElementById('btn-export').onclick = () => {
    const blob = new Blob([JSON.stringify(groups, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `checkin_backup_${currentMonthKey}.json`;
    a.click();
};

document.getElementById('btn-import').onclick = () => document.getElementById('import-file').click();

document.getElementById('import-file').onchange = async (e) => {
    const confirmed = await showCustomConfirm(
        'Импорт данных',
        'Это заменит все текущие данные. Продолжить?',
        true
    );

    if (confirmed) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                groups = JSON.parse(ev.target.result);
                save();
                location.reload();
            } catch (err) {
                alert("Ошибка: Неверный формат файла");
            }
        };
        reader.readAsText(e.target.files[0]);
    } else {
        e.target.value = '';
    }
};

function syncData() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(registration => {
      registration.sync.register('sync-attendance-data');
    });
  }
}

function save() {
  localStorage.setItem('attendance_archive_v1', JSON.stringify(groups));
  syncData();
}


// ========== ЗАПУСК ==========
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.body.setAttribute('data-theme', savedTheme);
    render();
});

document.getElementById('btn-force-update').addEventListener('click', async () => {
  const button = document.getElementById('btn-force-update');
  const textSpan = document.getElementById('update-btn-text');

  // Блокируем кнопку и показываем загрузку
  button.disabled = true;
  textSpan.textContent = 'Проверка...';
  button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${textSpan.outerHTML}`;

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      await registration.update();

      // Проверяем, есть ли новая версия в ожидании
      if (registration.waiting) {
        // Показываем диалог обновления
        const confirmed = await showCustomConfirm(
          'Обновление доступно',
          'Новая версия приложения готова. Перезагрузить сейчас?',
          false
        );
        if (confirmed) {
          // Пропускаем ожидание и перезагружаем
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          window.location.reload();
        } else {
          // Сбрасываем состояние кнопки
          button.disabled = false;
          textSpan.textContent = 'Проверить обновления';
          button.innerHTML = `<i class="fas fa-sync"></i> ${textSpan.outerHTML}`;
        }
      } else {
        // Обновлений нет — информируем пользователя
        alert('У вас уже последняя версия приложения!');
        button.disabled = false;
        textSpan.textContent = 'Проверить обновления';
        button.innerHTML = `<i class="fas fa-sync"></i> ${textSpan.outerHTML}`;
      }
    } else {
      alert('Сервис‑воркер не зарегистрирован');
      button.disabled = false;
      textSpan.textContent = 'Проверить обновления';
      button.innerHTML = `<i class="fas fa-sync"></i> ${textSpan.outerHTML}`;
    }
  } catch (error) {
    console.error('Ошибка обновления:', error);
    alert('Не удалось проверить обновления. Проверьте подключение к сети.');
    button.disabled = false;
    textSpan.textContent = 'Проверить обновления';
    button.innerHTML = `<i class="fas fa-sync"></i> ${textSpan.outerHTML}`;
  }
});
