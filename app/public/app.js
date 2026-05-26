'use strict';

let studentName = '';
const conversationHistory = [];

// ── DOM ───────────────────────────────────────────────────────────────────────
const welcomeScreen      = document.getElementById('welcome-screen');
const chatScreen         = document.getElementById('chat-screen');
const nameInput          = document.getElementById('name-input');
const startBtn           = document.getElementById('start-btn');
const messagesDiv        = document.getElementById('messages');
const messageInput       = document.getElementById('message-input');
const sendBtn            = document.getElementById('send-btn');
const studentNameDisplay = document.getElementById('student-name-display');
const historyBtn         = document.getElementById('history-btn');
const historyModal       = document.getElementById('history-modal');
const historyContent     = document.getElementById('history-content');
const closeHistoryBtn    = document.getElementById('close-history-btn');

// ── Tela de boas-vindas ───────────────────────────────────────────────────────
startBtn.addEventListener('click', startChat);
nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') startChat(); });

function startChat() {
  const name = nameInput.value.trim();
  if (!name) {
    nameInput.classList.add('shake');
    setTimeout(() => nameInput.classList.remove('shake'), 500);
    return;
  }
  studentName = name;
  studentNameDisplay.textContent = `Olá, ${studentName}`;
  welcomeScreen.classList.add('hidden');
  chatScreen.classList.remove('hidden');
  addMessage('tutor',
    `Olá, ${studentName}! 👋 Sou seu tutor de Inteligência Artificial.\n` +
    `Pode me fazer qualquer pergunta sobre o conteúdo do curso — estou aqui para ajudar!`
  );
  messageInput.focus();
}

// ── Envio de mensagens ────────────────────────────────────────────────────────
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || sendBtn.disabled) return;

  messageInput.value = '';
  autoResize(messageInput);
  setInputEnabled(false);

  addMessage('student', text);
  const bubble = addMessage('tutor', 'Pensando...', true);
  bubble.classList.add('thinking');

  let fullAnswer = '';

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentName,
        message: text,
        history: conversationHistory.slice(-4),
      }),
    });

    if (!res.ok) throw new Error(`Servidor retornou ${res.status}`);

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let   buffer  = '';
    let   firstToken = true;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.slice(6));

          if (data.token) {
            if (firstToken) {
              bubble.classList.remove('thinking');
              bubble.textContent = '';
              firstToken = false;
            }
            fullAnswer += data.token;
            bubble.textContent = fullAnswer;
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
          }

          if (data.done) {
            conversationHistory.push({ question: text, answer: fullAnswer });
          }

          if (data.error) {
            bubble.classList.remove('thinking');
            bubble.classList.add('error');
            bubble.textContent = `⚠️ ${data.error}`;
          }
        } catch { /* ignora erros de parse SSE */ }
      }
    }
  } catch (err) {
    bubble.classList.remove('thinking');
    bubble.classList.add('error');
    bubble.textContent = '⚠️ Erro ao conectar ao servidor. Tente novamente.';
    console.error(err);
  } finally {
    setInputEnabled(true);
    messageInput.focus();
  }
}

function setInputEnabled(enabled) {
  sendBtn.disabled      = !enabled;
  messageInput.disabled = !enabled;
}

function addMessage(role, text, returnBubble = false) {
  const wrapper = document.createElement('div');
  wrapper.className = `message ${role}`;
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;
  wrapper.appendChild(bubble);
  messagesDiv.appendChild(wrapper);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
  return returnBubble ? bubble : wrapper;
}

// Auto-resize do textarea conforme o usuário digita
messageInput.addEventListener('input', () => autoResize(messageInput));
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

// ── Histórico ─────────────────────────────────────────────────────────────────
historyBtn.addEventListener('click', openHistory);
closeHistoryBtn.addEventListener('click', () => historyModal.classList.add('hidden'));
historyModal.addEventListener('click', e => {
  if (e.target === historyModal) historyModal.classList.add('hidden');
});

async function openHistory() {
  historyModal.classList.remove('hidden');
  historyContent.innerHTML = '<p class="loading">Carregando histórico...</p>';
  try {
    const res  = await fetch(`/api/history/${encodeURIComponent(studentName)}`);
    const rows = await res.json();
    if (!rows.length) {
      historyContent.innerHTML = '<p class="empty">Nenhuma conversa salva ainda.</p>';
      return;
    }
    historyContent.innerHTML = rows.map(row => `
      <div class="history-item">
        <div class="history-meta">${new Date(row.created_at).toLocaleString('pt-BR')}</div>
        <div class="history-q"><strong>Pergunta:</strong> ${esc(row.question)}</div>
        <div class="history-a"><strong>Resposta:</strong> ${esc(row.answer)}</div>
      </div>
    `).join('');
  } catch {
    historyContent.innerHTML = '<p class="error">⚠️ Erro ao carregar histórico.</p>';
  }
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
