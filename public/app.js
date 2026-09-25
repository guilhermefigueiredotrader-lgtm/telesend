const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const passwordInput = document.getElementById('password-input');
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');
const configWarning = document.getElementById('config-warning');
const newTitleInput = document.getElementById('new-title');
const newMessageInput = document.getElementById('new-message');
const saveBtn = document.getElementById('save-btn');
const messagesList = document.getElementById('messages-list');
const tabBtns = document.querySelectorAll('.tab-btn');
const scheduleSubtabs = document.getElementById('schedule-subtabs');
const subtabBtns = document.querySelectorAll('.subtab-btn');
const mediaInput = document.getElementById('media-input');
const mediaFilename = document.getElementById('media-filename');
const mediaPreview = document.getElementById('media-preview');
const searchInput = document.getElementById('search-input');
const clearSearchBtn = document.getElementById('clear-search-btn');

let sitePassword = sessionStorage.getItem('sitePassword') || '';
let currentFilter = 'rascunho';
let currentSubFilter = 'todos';
let currentSearch = '';
let selectedFile = null;

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function authHeaders() {
  const headers = {};
  if (sitePassword) headers['x-site-password'] = sitePassword;
  return headers;
}

function authHeadersJson() {
  return { ...authHeaders(), 'Content-Type': 'application/json' };
}

async function init() {
  const configRes = await fetch('/api/config');
  const config = await configRes.json();

  if (!config.configured) {
    configWarning.classList.remove('hidden');
  }

  if (config.requiresPassword && !sitePassword) {
    showLogin();
  } else {
    showApp();
  }
}

function showLogin() {
  loginScreen.classList.remove('hidden');
  appScreen.classList.add('hidden');
}

function showApp() {
  loginScreen.classList.add('hidden');
  appScreen.classList.remove('hidden');
  loadMessages();
}

loginBtn.addEventListener('click', async () => {
  const senha = passwordInput.value;
  const res = await fetch('/api/messages', { headers: { 'x-site-password': senha } });
  if (res.ok) {
    sitePassword = senha;
    sessionStorage.setItem('sitePassword', senha);
    loginError.classList.add('hidden');
    showApp();
  } else {
    loginError.textContent = 'Senha incorreta.';
    loginError.classList.remove('hidden');
  }
});

passwordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loginBtn.click();
});

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    tabBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    scheduleSubtabs.classList.toggle('hidden', currentFilter !== 'agendamentos');
    loadMessages();
  });
});

subtabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    subtabBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentSubFilter = btn.dataset.subfilter;
    loadMessages();
  });
});

searchInput.addEventListener('input', () => {
  currentSearch = searchInput.value.trim().toLowerCase();
  clearSearchBtn.classList.toggle('hidden', !currentSearch);
  loadMessages();
});

clearSearchBtn.addEventListener('click', () => {
  searchInput.value = '';
  currentSearch = '';
  clearSearchBtn.classList.add('hidden');
  loadMessages();
});

function matchesSearch(msg) {
  if (!currentSearch) return true;
  const titulo = (msg.title || '').toLowerCase();
  const texto = (msg.text || '').toLowerCase();
  return titulo.includes(currentSearch) || texto.includes(currentSearch);
}

mediaInput.addEventListener('change', () => {
  selectedFile = mediaInput.files[0] || null;
  renderNewMediaPreview();
});

function renderNewMediaPreview() {
  mediaPreview.innerHTML = '';
  if (!selectedFile) {
    mediaPreview.classList.add('hidden');
    mediaFilename.textContent = '';
    return;
  }

  mediaFilename.textContent = selectedFile.name;
  mediaPreview.classList.remove('hidden');

  const url = URL.createObjectURL(selectedFile);
  const isVideo = selectedFile.type.startsWith('video/');
  const el = document.createElement(isVideo ? 'video' : 'img');
  el.src = url;
  if (isVideo) el.controls = true;

  const removeBtn = document.createElement('button');
  removeBtn.className = 'media-remove';
  removeBtn.textContent = '✕';
  removeBtn.addEventListener('click', () => {
    selectedFile = null;
    mediaInput.value = '';
    renderNewMediaPreview();
  });

  mediaPreview.append(el, removeBtn);
}

saveBtn.addEventListener('click', async () => {
  const title = newTitleInput.value.trim();
  const text = newMessageInput.value.trim();
  if (!text && !selectedFile) {
    alert('Escreva algo ou anexe uma foto/vídeo.');
    return;
  }

  saveBtn.disabled = true;
  const formData = new FormData();
  formData.append('title', title);
  formData.append('text', text);
  if (selectedFile) formData.append('media', selectedFile);

  const res = await fetch('/api/messages', {
    method: 'POST',
    headers: authHeaders(),
    body: formData
  });
  saveBtn.disabled = false;

  if (res.ok) {
    newTitleInput.value = '';
    newMessageInput.value = '';
    selectedFile = null;
    mediaInput.value = '';
    renderNewMediaPreview();
    if (currentFilter === 'rascunho') loadMessages();
  } else {
    const data = await res.json().catch(() => ({}));
    alert('Não deu pra salvar a mensagem: ' + (data.error || 'erro desconhecido'));
  }
});

async function loadMessages() {
  const res = await fetch('/api/messages', { headers: authHeaders() });
  if (!res.ok) return;
  const all = await res.json().then(list => list.filter(matchesSearch));

  if (currentFilter === 'agendamentos') {
    renderAgendamentos(all.filter(m => m.schedule).filter(matchesSubFilter));
    return;
  }

  if (currentFilter === 'rascunho') {
    const filtered = all.filter(m => m.status === 'rascunho' && (!m.schedule || m.schedule.status === 'cancelado'));
    renderMessages(filtered);
    return;
  }

  renderMessages(all.filter(m => m.status === 'enviada'));
}

function matchesSubFilter(msg) {
  const ag = msg.schedule;
  switch (currentSubFilter) {
    case 'programado': return ag.type === 'once' && ag.status === 'programado';
    case 'recorrente': return ag.type === 'recurring';
    case 'executado': return ag.status === 'executado';
    case 'cancelado': return ag.status === 'cancelado' || ag.status === 'erro';
    default: return true;
  }
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

async function loadProtectedMediaUrl(mediaFile) {
  const res = await fetch(`/api/uploads/${mediaFile}`, { headers: authHeaders() });
  if (!res.ok) return null;
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

function renderMessages(messages) {
  messagesList.innerHTML = '';

  if (messages.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    if (currentSearch) {
      empty.textContent = `Nenhum resultado pra "${searchInput.value.trim()}".`;
    } else {
      empty.textContent = currentFilter === 'rascunho'
        ? 'Nenhum rascunho ainda. Escreva sua primeira mensagem acima!'
        : 'Nenhuma mensagem enviada ainda.';
    }
    messagesList.appendChild(empty);
    return;
  }

  messages.forEach(msg => {
    const card = document.createElement('div');
    card.className = 'message-card';

    const titleEl = document.createElement('div');
    titleEl.className = 'message-title';
    titleEl.textContent = msg.title || 'Sem título';
    titleEl.dataset.raw = msg.title || '';
    card.appendChild(titleEl);

    const meta = document.createElement('div');
    meta.className = 'message-meta';
    meta.textContent = msg.status === 'enviada'
      ? `Enviada pela última vez em ${formatDate(msg.sentAt)}`
      : `Criada em ${formatDate(msg.createdAt)}`;

    card.appendChild(meta);

    let textEl = null;

    if (msg.mediaFile) {
      const mediaWrap = document.createElement('div');
      mediaWrap.className = 'message-media';
      const el = document.createElement(msg.mediaType === 'video' ? 'video' : 'img');
      if (msg.mediaType === 'video') el.controls = true;
      mediaWrap.appendChild(el);
      card.appendChild(mediaWrap);

      loadProtectedMediaUrl(msg.mediaFile).then(url => {
        if (url) el.src = url;
      });
    }

    if (msg.text) {
      textEl = document.createElement('div');
      textEl.className = 'message-text';
      textEl.textContent = msg.text;
      card.appendChild(textEl);
    }

    const actions = document.createElement('div');
    actions.className = 'message-actions';
    let scheduleFormWrap = null;
    let mediaFormWrap = null;

    if (msg.status === 'rascunho') {
      const sendBtn = document.createElement('button');
      sendBtn.className = 'btn-send';
      sendBtn.textContent = '🚀 Enviar agora';
      sendBtn.addEventListener('click', () => enviarMensagem(msg.id, sendBtn));
      actions.appendChild(sendBtn);

      const editBtn = document.createElement('button');
      editBtn.className = 'btn-edit';
      editBtn.textContent = '✏️ Editar';
      editBtn.addEventListener('click', () => editarMensagem(msg.id, titleEl, textEl, editBtn));
      actions.appendChild(editBtn);

      mediaFormWrap = document.createElement('div');
      mediaFormWrap.classList.add('hidden');

      const mediaBtn = document.createElement('button');
      mediaBtn.className = 'btn-schedule';
      mediaBtn.textContent = msg.mediaFile ? '📎 Trocar mídia' : '📎 Anexar mídia';
      mediaBtn.addEventListener('click', () => {
        const aberto = !mediaFormWrap.classList.contains('hidden');
        mediaFormWrap.classList.toggle('hidden');
        mediaFormWrap.innerHTML = '';
        if (!aberto) mediaFormWrap.appendChild(criarFormularioMidia(msg));
      });
      actions.appendChild(mediaBtn);

      const cloneBtn = document.createElement('button');
      cloneBtn.className = 'btn-clone';
      cloneBtn.textContent = '📋 Clonar';
      cloneBtn.addEventListener('click', () => clonarMensagem(msg.id));
      actions.appendChild(cloneBtn);

      scheduleFormWrap = document.createElement('div');
      scheduleFormWrap.classList.add('hidden');

      const scheduleBtn = document.createElement('button');
      scheduleBtn.className = 'btn-schedule';
      scheduleBtn.textContent = '⏰ Agendar';
      scheduleBtn.addEventListener('click', () => {
        const aberto = !scheduleFormWrap.classList.contains('hidden');
        scheduleFormWrap.classList.toggle('hidden');
        scheduleFormWrap.innerHTML = '';
        if (!aberto) scheduleFormWrap.appendChild(criarFormularioAgendamento(msg.id));
      });
      actions.appendChild(scheduleBtn);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn-delete';
      deleteBtn.textContent = '🗑️ Excluir';
      deleteBtn.addEventListener('click', () => excluirMensagem(msg.id));
      actions.appendChild(deleteBtn);
    } else {
      const resendBtn = document.createElement('button');
      resendBtn.className = 'btn-send';
      resendBtn.textContent = '🚀 Enviar de novo';
      resendBtn.addEventListener('click', () => enviarMensagem(msg.id, resendBtn, '🚀 Enviar de novo'));
      actions.appendChild(resendBtn);

      const cloneBtn = document.createElement('button');
      cloneBtn.className = 'btn-clone';
      cloneBtn.textContent = '📋 Clonar';
      cloneBtn.addEventListener('click', () => clonarMensagem(msg.id));
      actions.appendChild(cloneBtn);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn-delete';
      deleteBtn.textContent = '🗑️ Excluir do histórico';
      deleteBtn.addEventListener('click', () => excluirMensagem(msg.id));
      actions.appendChild(deleteBtn);
    }

    card.appendChild(actions);
    if (mediaFormWrap) card.appendChild(mediaFormWrap);
    if (scheduleFormWrap) card.appendChild(scheduleFormWrap);
    messagesList.appendChild(card);
  });
}

function criarFormularioMidia(msg) {
  const form = document.createElement('div');
  form.className = 'schedule-form';
  let novoArquivo = null;

  const preview = document.createElement('div');
  preview.className = 'media-preview';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*,video/*';
  fileInput.className = 'hidden';

  const attachLabel = document.createElement('label');
  attachLabel.className = 'btn-attach';
  attachLabel.textContent = novoArquivo ? 'Trocar arquivo escolhido' : '📎 Escolher arquivo';

  const attachRow = document.createElement('div');
  attachRow.className = 'attach-row';
  attachRow.append(attachLabel, fileInput);
  attachLabel.addEventListener('click', () => fileInput.click());

  function renderPreview() {
    preview.innerHTML = '';
    if (!novoArquivo) {
      preview.classList.add('hidden');
      return;
    }
    preview.classList.remove('hidden');
    const url = URL.createObjectURL(novoArquivo);
    const isVideo = novoArquivo.type.startsWith('video/');
    const el = document.createElement(isVideo ? 'video' : 'img');
    el.src = url;
    if (isVideo) el.controls = true;
    preview.appendChild(el);
  }

  fileInput.addEventListener('change', () => {
    novoArquivo = fileInput.files[0] || null;
    renderPreview();
  });

  form.append(attachRow, preview);

  const actionsRow = document.createElement('div');
  actionsRow.className = 'schedule-form-actions';

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn-confirm-schedule';
  confirmBtn.textContent = '💾 Salvar mídia';
  confirmBtn.addEventListener('click', async () => {
    if (!novoArquivo) {
      alert('Escolha um arquivo primeiro.');
      return;
    }
    confirmBtn.disabled = true;
    const formData = new FormData();
    formData.append('title', msg.title || '');
    formData.append('text', msg.text || '');
    formData.append('media', novoArquivo);
    const res = await fetch(`/api/messages/${msg.id}`, { method: 'PUT', headers: authHeaders(), body: formData });
    const data = await res.json().catch(() => ({}));
    confirmBtn.disabled = false;
    if (res.ok) {
      loadMessages();
    } else {
      alert('Não deu pra salvar a mídia: ' + (data.error || 'erro desconhecido'));
    }
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-cancel-form';
  cancelBtn.textContent = 'Cancelar';
  cancelBtn.addEventListener('click', () => {
    form.classList.add('hidden');
    form.innerHTML = '';
  });

  actionsRow.append(confirmBtn, cancelBtn);
  form.appendChild(actionsRow);

  if (msg.mediaFile) {
    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-delete';
    removeBtn.textContent = '🗑️ Remover mídia atual';
    removeBtn.style.marginTop = '8px';
    removeBtn.style.width = '100%';
    removeBtn.addEventListener('click', async () => {
      if (!confirm('Remover a foto/vídeo desta mensagem?')) return;
      removeBtn.disabled = true;
      const formData = new FormData();
      formData.append('title', msg.title || '');
      formData.append('text', msg.text || '');
      formData.append('removeMedia', 'true');
      const res = await fetch(`/api/messages/${msg.id}`, { method: 'PUT', headers: authHeaders(), body: formData });
      const data = await res.json().catch(() => ({}));
      removeBtn.disabled = false;
      if (res.ok) {
        loadMessages();
      } else {
        alert('Não deu pra remover: ' + (data.error || 'erro desconhecido'));
      }
    });
    form.appendChild(removeBtn);
  }

  return form;
}

function criarFormularioAgendamento(id) {
  const form = document.createElement('div');
  form.className = 'schedule-form';

  let tipo = 'once';
  const diasSelecionados = new Set();

  const typeRow = document.createElement('div');
  typeRow.className = 'schedule-type-row';

  const btnOnce = document.createElement('button');
  btnOnce.textContent = '📅 Uma vez';
  btnOnce.classList.add('active');

  const btnRecurring = document.createElement('button');
  btnRecurring.textContent = '🔁 Recorrente';

  typeRow.append(btnOnce, btnRecurring);
  form.appendChild(typeRow);

  const onceField = document.createElement('input');
  onceField.type = 'datetime-local';

  const recurringWrap = document.createElement('div');
  recurringWrap.classList.add('hidden');

  const timeField = document.createElement('input');
  timeField.type = 'time';
  timeField.value = '08:00';

  const weekdayRow = document.createElement('div');
  weekdayRow.className = 'weekday-row';
  DIAS_SEMANA.forEach((nome, index) => {
    const dayBtn = document.createElement('button');
    dayBtn.className = 'weekday-btn';
    dayBtn.textContent = nome;
    dayBtn.addEventListener('click', () => {
      dayBtn.classList.toggle('active');
      if (diasSelecionados.has(index)) diasSelecionados.delete(index);
      else diasSelecionados.add(index);
    });
    weekdayRow.appendChild(dayBtn);
  });

  const weekdayHint = document.createElement('div');
  weekdayHint.className = 'media-filename';
  weekdayHint.textContent = 'Nenhum dia marcado = todo dia';
  weekdayHint.style.marginBottom = '10px';

  recurringWrap.append(timeField, weekdayRow, weekdayHint);
  form.append(onceField, recurringWrap);

  function selecionarTipo(novoTipo) {
    tipo = novoTipo;
    btnOnce.classList.toggle('active', tipo === 'once');
    btnRecurring.classList.toggle('active', tipo === 'recurring');
    onceField.classList.toggle('hidden', tipo !== 'once');
    recurringWrap.classList.toggle('hidden', tipo !== 'recurring');
  }
  btnOnce.addEventListener('click', () => selecionarTipo('once'));
  btnRecurring.addEventListener('click', () => selecionarTipo('recurring'));

  const actionsRow = document.createElement('div');
  actionsRow.className = 'schedule-form-actions';

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn-confirm-schedule';
  confirmBtn.textContent = '✅ Confirmar agendamento';
  confirmBtn.addEventListener('click', async () => {
    let body;
    if (tipo === 'once') {
      if (!onceField.value) {
        alert('Escolha a data e a hora do envio.');
        return;
      }
      body = { type: 'once', scheduledAt: new Date(onceField.value).toISOString() };
    } else {
      body = { type: 'recurring', time: timeField.value, daysOfWeek: Array.from(diasSelecionados) };
    }

    confirmBtn.disabled = true;
    const res = await fetch(`/api/messages/${id}/schedule`, {
      method: 'POST',
      headers: authHeadersJson(),
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    confirmBtn.disabled = false;

    if (res.ok) {
      loadMessages();
    } else {
      alert('Não deu pra agendar: ' + (data.error || 'erro desconhecido'));
    }
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-cancel-form';
  cancelBtn.textContent = 'Cancelar';
  cancelBtn.addEventListener('click', () => {
    form.classList.add('hidden');
    form.innerHTML = '';
  });

  actionsRow.append(confirmBtn, cancelBtn);
  form.appendChild(actionsRow);

  return form;
}

function descreverRecorrencia(schedule) {
  if (!schedule.daysOfWeek || schedule.daysOfWeek.length === 0) return 'Todo dia';
  return schedule.daysOfWeek
    .slice()
    .sort((a, b) => a - b)
    .map(d => DIAS_SEMANA[d])
    .join(', ');
}

function renderAgendamentos(messages) {
  messagesList.innerHTML = '';

  if (messages.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = currentSearch
      ? `Nenhum resultado pra "${searchInput.value.trim()}".`
      : 'Nenhum agendamento por aqui ainda.';
    messagesList.appendChild(empty);
    return;
  }

  messages.forEach(msg => {
    const ag = msg.schedule;
    const card = document.createElement('div');
    card.className = 'message-card';

    const titleRow = document.createElement('div');
    titleRow.style.display = 'flex';
    titleRow.style.alignItems = 'center';
    titleRow.style.justifyContent = 'space-between';
    titleRow.style.gap = '8px';

    const titleEl = document.createElement('div');
    titleEl.className = 'message-title';
    titleEl.textContent = msg.title || 'Sem título';

    const badge = document.createElement('span');
    badge.className = `status-badge ${ag.status}`;
    badge.textContent = {
      programado: 'Programado',
      executado: 'Executado',
      cancelado: 'Cancelado',
      ativo: 'Ativo',
      pausado: 'Pausado',
      erro: 'Erro'
    }[ag.status] || ag.status;

    titleRow.append(titleEl, badge);
    card.appendChild(titleRow);

    const meta = document.createElement('div');
    meta.className = 'message-meta';
    meta.textContent = `Criada em ${formatDate(msg.createdAt)}`;
    card.appendChild(meta);

    const info = document.createElement('div');
    info.className = 'schedule-info';
    if (ag.type === 'once') {
      info.innerHTML = `<strong>Uma vez</strong> — data programada: ${formatDate(ag.scheduledAt)}`;
    } else {
      info.innerHTML =
        `<strong>Recorrente</strong> — horário: ${ag.time} · dias: ${descreverRecorrencia(ag)}<br>` +
        `Próxima execução: ${ag.nextRun ? formatDate(ag.nextRun) : '—'}<br>` +
        `Última execução: ${ag.lastRun ? formatDate(ag.lastRun) : 'nunca'} · Execuções: ${ag.runCount || 0}`;
    }
    card.appendChild(info);

    if (ag.lastError) {
      const errEl = document.createElement('div');
      errEl.className = 'schedule-error';
      errEl.textContent = '⚠️ ' + ag.lastError;
      card.appendChild(errEl);
    }

    if (msg.text) {
      const textEl = document.createElement('div');
      textEl.className = 'message-text';
      textEl.textContent = msg.text;
      card.appendChild(textEl);
    }

    const actions = document.createElement('div');
    actions.className = 'message-actions';

    if (ag.type === 'once' && ag.status === 'programado') {
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn-delete';
      cancelBtn.textContent = '❌ Cancelar agendamento';
      cancelBtn.addEventListener('click', () => cancelarAgendamento(msg.id));
      actions.appendChild(cancelBtn);
    }

    if (ag.type === 'recurring' && ag.status === 'ativo') {
      const pauseBtn = document.createElement('button');
      pauseBtn.className = 'btn-edit';
      pauseBtn.textContent = '⏸️ Pausar';
      pauseBtn.addEventListener('click', () => pausarAgendamento(msg.id));
      actions.appendChild(pauseBtn);
    }

    if (ag.type === 'recurring' && ag.status === 'pausado') {
      const resumeBtn = document.createElement('button');
      resumeBtn.className = 'btn-send';
      resumeBtn.textContent = '▶️ Retomar';
      resumeBtn.addEventListener('click', () => retomarAgendamento(msg.id));
      actions.appendChild(resumeBtn);
    }

    if (ag.type === 'recurring' || ag.status === 'erro') {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn-delete';
      removeBtn.textContent = '🗑️ Remover agendamento';
      removeBtn.addEventListener('click', () => removerAgendamento(msg.id));
      actions.appendChild(removeBtn);
    }

    const cloneBtn = document.createElement('button');
    cloneBtn.className = 'btn-clone';
    cloneBtn.textContent = '📋 Clonar';
    cloneBtn.addEventListener('click', () => clonarMensagem(msg.id));
    actions.appendChild(cloneBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-delete';
    deleteBtn.textContent = '🗑️ Excluir mensagem';
    deleteBtn.addEventListener('click', () => excluirMensagem(msg.id));
    actions.appendChild(deleteBtn);

    card.appendChild(actions);
    messagesList.appendChild(card);
  });
}

async function cancelarAgendamento(id) {
  if (!confirm('Cancelar este agendamento?')) return;
  await fetch(`/api/messages/${id}/schedule/cancel`, { method: 'POST', headers: authHeaders() });
  loadMessages();
}

async function pausarAgendamento(id) {
  await fetch(`/api/messages/${id}/schedule/pause`, { method: 'POST', headers: authHeaders() });
  loadMessages();
}

async function retomarAgendamento(id) {
  await fetch(`/api/messages/${id}/schedule/resume`, { method: 'POST', headers: authHeaders() });
  loadMessages();
}

async function removerAgendamento(id) {
  if (!confirm('Remover este agendamento? A mensagem volta a ser um rascunho comum.')) return;
  await fetch(`/api/messages/${id}/schedule`, { method: 'DELETE', headers: authHeaders() });
  loadMessages();
}

async function enviarMensagem(id, btn, labelOriginal) {
  const textoOriginal = labelOriginal || btn.textContent;
  if (!confirm('Enviar esta mensagem agora para o Telegram?')) return;
  btn.disabled = true;
  btn.textContent = 'Enviando...';
  const res = await fetch(`/api/messages/${id}/send`, { method: 'POST', headers: authHeaders() });
  const data = await res.json();
  if (res.ok) {
    loadMessages();
  } else {
    alert('Erro ao enviar: ' + data.error);
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
}

function editarMensagem(id, titleEl, textEl, editBtn) {
  const jaEditando = titleEl.getAttribute('contenteditable') === 'true';
  if (!jaEditando) {
    if (!titleEl.dataset.raw) titleEl.textContent = '';
    titleEl.setAttribute('contenteditable', 'true');
    titleEl.focus();
    if (textEl) textEl.setAttribute('contenteditable', 'true');
    editBtn.textContent = '💾 Salvar edição';
    editBtn.classList.remove('btn-edit');
    editBtn.classList.add('btn-save-edit');
  } else {
    const novoTitulo = titleEl.textContent.trim();
    const novoTexto = textEl ? textEl.textContent.trim() : '';
    titleEl.setAttribute('contenteditable', 'false');
    if (textEl) textEl.setAttribute('contenteditable', 'false');
    fetch(`/api/messages/${id}`, {
      method: 'PUT',
      headers: authHeadersJson(),
      body: JSON.stringify({ title: novoTitulo, text: novoTexto })
    }).then(async (res) => {
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert('Não deu pra salvar: ' + (data.error || 'erro desconhecido'));
      }
      loadMessages();
    });
  }
}

async function excluirMensagem(id) {
  if (!confirm('Tem certeza que quer excluir esta mensagem?')) return;
  await fetch(`/api/messages/${id}`, { method: 'DELETE', headers: authHeaders() });
  loadMessages();
}

async function clonarMensagem(id) {
  const res = await fetch(`/api/messages/${id}/clone`, { method: 'POST', headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (res.ok) {
    tabBtns.forEach(b => b.classList.toggle('active', b.dataset.filter === 'rascunho'));
    currentFilter = 'rascunho';
    scheduleSubtabs.classList.add('hidden');
    loadMessages();
  } else {
    alert('Não deu pra clonar: ' + (data.error || 'erro desconhecido'));
  }
}

init();
