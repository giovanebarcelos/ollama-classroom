'use strict';

// jest.mock é içado automaticamente pelo Jest — deve ficar antes dos requires
jest.mock('pg', () => {
  const mQuery = jest.fn();
  return { Pool: jest.fn(() => ({ query: mQuery })) };
});

const request = require('supertest');
const { Pool } = require('pg');
const { app }  = require('../server');

// Instância mock do pool reutilizada nos testes
const mockPool = new Pool();

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Cria um ReadableStream simulando a resposta NDJSON do Ollama.
 * @param {string[]} tokens - Tokens a serem emitidos
 */
function makeOllamaStream(tokens) {
  const lines = [
    ...tokens.map(t  => JSON.stringify({ response: t, done: false })),
    JSON.stringify({ response: '', done: true }),
  ].join('\n') + '\n';

  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(lines));
      controller.close();
    },
  });
}

// ── POST /api/chat ─────────────────────────────────────────────────────────────
describe('POST /api/chat', () => {
  beforeEach(() => jest.clearAllMocks());

  test('retorna 400 quando studentName está ausente', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ message: 'O que é IA?' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/obrigatórios/);
  });

  test('retorna 400 quando message está ausente', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ studentName: 'João' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/obrigatórios/);
  });

  test('retorna 400 quando ambos os campos são strings vazias', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ studentName: '   ', message: '   ' });

    expect(res.status).toBe(400);
  });

  test('responde com SSE de erro quando Ollama está inacessível', async () => {
    global.fetch = jest.fn().mockRejectedValueOnce(new Error('fetch failed'));

    const res = await request(app)
      .post('/api/chat')
      .send({ studentName: 'João', message: 'O que é IA?' });

    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    expect(res.text).toContain('Não foi possível conectar ao Ollama');
  });

  test('responde com SSE de erro quando Ollama retorna status de falha', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({ ok: false, status: 503 });

    const res = await request(app)
      .post('/api/chat')
      .send({ studentName: 'João', message: 'O que é IA?' });

    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    expect(res.text).toContain('error');
  });

  test('transmite tokens via SSE e salva a conversa no banco', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok:   true,
      body: { getReader: () => makeOllamaStream(['IA é', ' incrível!']).getReader() },
    });
    mockPool.query.mockResolvedValueOnce({});

    const res = await request(app)
      .post('/api/chat')
      .send({ studentName: 'Maria', message: 'O que é IA?' });

    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    expect(res.text).toContain('"token":"IA é"');
    expect(res.text).toContain('"token":" incrível!"');
    expect(res.text).toContain('"done":true');

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO conversations'),
      ['Maria', 'O que é IA?', 'IA é incrível!']
    );
  });

  test('inclui histórico no prompt quando fornecido', async () => {
    let capturedBody;
    global.fetch = jest.fn().mockImplementationOnce((_url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return Promise.resolve({
        ok:   true,
        body: { getReader: () => makeOllamaStream(['Ok!']).getReader() },
      });
    });
    mockPool.query.mockResolvedValueOnce({});

    await request(app)
      .post('/api/chat')
      .send({
        studentName: 'Ana',
        message: 'E redes neurais?',
        history: [{ question: 'O que é IA?', answer: 'É incrível!' }],
      });

    expect(capturedBody.prompt).toContain('Histórico recente');
    expect(capturedBody.prompt).toContain('O que é IA?');
  });
});

// ── GET /api/history/:studentName ─────────────────────────────────────────────
describe('GET /api/history/:studentName', () => {
  beforeEach(() => jest.clearAllMocks());

  test('retorna histórico de conversas do aluno', async () => {
    const mockRows = [
      {
        id: 1,
        student_name: 'João',
        question: 'O que é IA?',
        answer: 'É a simulação da inteligência humana.',
        created_at: new Date().toISOString(),
      },
    ];
    mockPool.query.mockResolvedValueOnce({ rows: mockRows });

    const res = await request(app).get('/api/history/João');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].student_name).toBe('João');
    expect(res.body[0].question).toBe('O que é IA?');
  });

  test('retorna array vazio quando não há conversas', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/history/Desconhecido');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('retorna 500 em caso de erro no banco de dados', async () => {
    mockPool.query.mockRejectedValueOnce(new Error('DB connection failed'));

    const res = await request(app).get('/api/history/João');

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/histórico/);
  });

  test('a busca é case-insensitive (usa LOWER no SQL)', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await request(app).get('/api/history/JOAO');

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('LOWER'),
      ['JOAO']
    );
  });
});

// ── GET / (frontend) ──────────────────────────────────────────────────────────
describe('GET /', () => {
  test('serve o arquivo index.html do frontend', async () => {
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });

  test('retorna 404 para rotas não existentes', async () => {
    const res = await request(app).get('/rota-inexistente');

    expect(res.status).toBe(404);
  });
});
