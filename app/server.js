'use strict';

const express = require('express');
const { Pool } = require('pg');
const path    = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── PostgreSQL ────────────────────────────────────────────────────────────────
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function waitForDB(retries = 15, delayMs = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query('SELECT 1');
      console.log('✅ Conectado ao PostgreSQL');
      return;
    } catch {
      console.log(`⏳ Aguardando PostgreSQL... (${i + 1}/${retries})`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw new Error('❌ Não foi possível conectar ao PostgreSQL após várias tentativas');
}

// ── Configuração do Ollama ────────────────────────────────────────────────────
const OLLAMA_URL   = process.env.OLLAMA_URL   || 'http://host.docker.internal:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1:8b';

const SYSTEM_PROMPT = `Você é um tutor de Inteligência Artificial para alunos da faculdade FAPA.
Seu objetivo é ajudar os alunos a entenderem os conceitos de IA de forma didática e clara.
Responda sempre em português brasileiro.
Seja encorajador, paciente e use exemplos práticos com analogias simples sempre que possível.
Se a pergunta não for sobre IA, computação ou tecnologia, redirecione gentilmente para o tema do curso de IA.`;

// ── POST /api/chat — streaming SSE ───────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { studentName, message, history } = req.body;

  if (!studentName?.trim() || !message?.trim()) {
    return res.status(400).json({ error: 'studentName e message são obrigatórios' });
  }

  // Montar prompt com histórico recente (até 4 trocas)
  let prompt = '';
  if (Array.isArray(history) && history.length > 0) {
    prompt += 'Histórico recente da conversa:\n';
    history.slice(-4).forEach(h => {
      prompt += `Aluno: ${h.question}\nTutor: ${h.answer}\n\n`;
    });
  }
  prompt += `Aluno: ${message.trim()}\nTutor:`;

  // Cabeçalhos SSE (Server-Sent Events)
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let fullAnswer = '';

  try {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:  OLLAMA_MODEL,
        system: SYSTEM_PROMPT,
        prompt,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama retornou status ${response.status}`);
    }

    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let   buffer  = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // guarda linha incompleta para próxima iteração

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);
          if (json.response) {
            fullAnswer += json.response;
            res.write(`data: ${JSON.stringify({ token: json.response })}\n\n`);
          }
          if (json.done) {
            // Salva conversa completa no banco ao final do stream
            await pool.query(
              'INSERT INTO conversations (student_name, question, answer) VALUES ($1, $2, $3)',
              [studentName.trim(), message.trim(), fullAnswer.trim()]
            );
            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          }
        } catch {
          // ignora linhas com JSON inválido
        }
      }
    }
  } catch (err) {
    console.error('Erro no chat:', err.message);
    const msg = (err.message.includes('fetch failed') || err.message.includes('ECONNREFUSED'))
      ? 'Não foi possível conectar ao Ollama. Verifique se o serviço está rodando (ollama serve).'
      : 'Erro interno ao processar a mensagem.';
    res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
  } finally {
    if (!res.writableEnded) res.end();
  }
});

// ── GET /api/history/:studentName ────────────────────────────────────────────
app.get('/api/history/:studentName', async (req, res) => {
  const { studentName } = req.params;
  try {
    const result = await pool.query(
      `SELECT id, student_name, question, answer, created_at
         FROM conversations
        WHERE LOWER(student_name) = LOWER($1)
        ORDER BY created_at DESC
        LIMIT 50`,
      [studentName]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao buscar histórico:', err.message);
    res.status(500).json({ error: 'Erro ao buscar histórico' });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

if (require.main === module) {
  waitForDB()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`🚀 Tutor IA rodando na porta ${PORT}`);
        console.log(`   Ollama: ${OLLAMA_URL}  |  Modelo: ${OLLAMA_MODEL}`);
      });
    })
    .catch(err => {
      console.error(err.message);
      process.exit(1);
    });
}

module.exports = { app, pool };
