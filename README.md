# ollama-classroom

> Chat educacional com IA local — sem depender da nuvem.

![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=node.js&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Ollama](https://img.shields.io/badge/Ollama-llama3.1:8b-black?logo=ollama)
![License](https://img.shields.io/badge/license-MIT-green)

Apliçação de chat educacional que usa o modelo **llama3.1:8b** via [Ollama](https://ollama.com)
para responder dúvidas dos alunos sobre Inteligência Artificial (curso FAPA).
Todo o processamento ocorre localmente — sem envio de dados para a nuvem.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Node.js 20 + Express |
| Frontend | HTML / CSS / JavaScript vanilla |
| Banco de dados | PostgreSQL 16 |
| LLM local | Ollama + llama3.1:8b |
| Reverse proxy | Traefik v3 |
| Gerenciamento | Portainer CE |
| DB UI | pgAdmin 4 |
| Orquestração | Docker Compose |

---

## Pré-requisitos

| Requisito | Versão mínima | Verificação |
|---|---|---|
| Docker | 24+ | `docker --version` |
| Docker Compose | v2 | `docker compose version` |
| Ollama | qualquer | `ollama --version` |
| llama3.1:8b instalado | — | `ollama list` |

> O Ollama deve estar rodando **no host** (fora do Docker).
> Se não estiver, inicie com: `ollama serve`

---

## Estrutura do projeto

```
ollama-classroom/
├── .gitignore
├── docker-compose.yml          ← orquestração dos 5 serviços
├── traefik/
│   └── traefik.yml             ← configuração do reverse proxy
├── postgres/
│   └── init.sql                ← criação automática da tabela de conversas
└── app/
    ├── Dockerfile
    ├── package.json
    ├── server.js               ← backend Node.js + Express (SSE streaming)
    ├── tests/
    │   └── server.test.js      ← testes unitários (Jest + Supertest)
    └── public/
        ├── index.html          ← interface de chat
        ├── style.css
        └── app.js
```

---

## Iniciar a aplicação

Abra um terminal na pasta `edu-app/` e execute:

```bash
docker compose up -d --build
```

Na **primeira vez** o Docker irá:
1. Baixar as imagens (traefik, postgres, portainer, pgadmin4)
2. Fazer o build da imagem da aplicação Node.js
3. Inicializar o banco de dados e criar a tabela `conversations`

Aguarde cerca de 30–60 segundos na primeira execução.

### Verificar se tudo está rodando

```bash
docker compose ps
```

Todos os serviços devem aparecer com status `running`.

### Acompanhar logs da aplicação

```bash
docker compose logs -f app
```

Saída esperada:
```
✅ Conectado ao PostgreSQL
🚀 Tutor IA rodando na porta 3000
   Ollama: http://host.docker.internal:11434  |  Modelo: llama3.1:8b
```

---

## Acesso aos serviços

> **Importante:** Os domínios `*.localhost` funcionam automaticamente no **Chrome** e **Edge**.
> No Firefox pode ser necessário adicionar entradas no arquivo `hosts` (veja seção Solução de problemas).

| Serviço | URL | Credenciais |
|---|---|---|
| 🤖 **Chat Tutor IA** | http://app.localhost | — (nome livre) |
| 🗄️ **pgAdmin4** | http://pgadmin4.localhost | Email: `admin@fapa.edu.br` / Senha: `admin123` |
| 🐳 **Portainer** | http://portainer.localhost | Cria na 1ª vez |
| 🔀 **Traefik Dashboard** | http://traefik.localhost/dashboard/ | — (sem auth) |

### Dados do banco de dados (para configurar no pgAdmin4)

| Campo | Valor |
|---|---|
| Host | `postgres` |
| Porta | `5432` |
| Banco | `tutoria_db` |
| Usuário | `tutor` |
| Senha | `tutor123` |

---

## Como usar o Chat Tutor IA

1. Acesse **http://app.localhost** no Chrome ou Edge
2. Digite seu **nome** e clique em "Começar"
3. Digite sua dúvida sobre IA no campo de texto
4. Pressione **Enter** para enviar (Shift+Enter para nova linha)
5. A resposta aparece em tempo real, token a token
6. Clique em **📋 Histórico** para ver suas conversas anteriores salvas no banco

---

## Parar e gerenciar os serviços

```bash
# Parar todos os serviços (mantém os dados)
docker compose stop

# Iniciar novamente (sem rebuild)
docker compose start

# Parar e remover os containers (mantém os volumes com dados)
docker compose down

# Parar, remover containers E apagar todos os dados
docker compose down -v

# Rebuild da aplicação após alterações no código
docker compose up -d --build app
```

---

## Consultar o banco de dados via terminal

```bash
# Abrir o psql dentro do container
docker compose exec postgres psql -U tutor -d tutoria_db

# Exemplos de queries
SELECT student_name, question, created_at FROM conversations ORDER BY created_at DESC LIMIT 10;
SELECT student_name, COUNT(*) as total FROM conversations GROUP BY student_name;
```

---

## Trocar o modelo do Ollama

Edite a variável `OLLAMA_MODEL` no `docker-compose.yml`:

```yaml
environment:
  OLLAMA_MODEL: llama3.2:3b   # ou qualquer modelo instalado
```

E reinicie o serviço:
```bash
docker compose up -d app
```

---

## Solução de problemas

### `*.localhost` não abre no Firefox

Adicione as entradas abaixo no arquivo hosts do sistema:

**Linux / macOS** — `/etc/hosts`:
```
127.0.0.1  app.localhost
127.0.0.1  pgadmin4.localhost
127.0.0.1  portainer.localhost
127.0.0.1  traefik.localhost
```

**Windows** — `C:\Windows\System32\drivers\etc\hosts` (requer admin):
```
127.0.0.1  app.localhost
127.0.0.1  pgadmin4.localhost
127.0.0.1  portainer.localhost
127.0.0.1  traefik.localhost
```

---

### Erro "Não foi possível conectar ao Ollama"

Verifique se o Ollama está rodando no host:
```bash
ollama serve          # inicia o servidor Ollama
ollama list           # confirma que llama3.1:8b está disponível
```

---

### Porta 80 já está em uso

Altere a porta no `docker-compose.yml`:
```yaml
traefik:
  ports:
    - "8888:80"    # troca 80 por 8888
```
E acesse os serviços como `http://app.localhost:8888` etc.

---

### Ver logs de todos os serviços

```bash
docker compose logs -f
```

### Reiniciar um serviço específico

```bash
docker compose restart app
docker compose restart postgres
```

---

## Testes

Os testes cobrem as rotas da API com mocks do banco de dados e do Ollama, sem depender de
serviços externos.

### Executar localmente (fora do Docker)

```bash
cd app
npm install
npm test
```

### Cobertura

| Suite | Casos | O que testa |
|---|---|---|
| `POST /api/chat` | 6 | Validação de entrada, SSE de erro, streaming de tokens, persistência no DB, histórico no prompt |
| `GET /api/history/:student` | 4 | Retorno de histórico, array vazio, erro 500, case-insensitive |
| `GET /` | 2 | Serve HTML, 404 em rota inexistente |

---

## Arquitetura

```
 Browser
    │
    ▼
 Traefik (porta 80)  ← roteia por subdomínio .localhost
    │
    ├──► app.localhost       → tutor-ia (Node.js :3000)
    │                              │
    │                    ┌────────┼────────────────────────┐
    │                    │  PostgreSQL  │  Ollama (host :11434)  │
    │                    └─────────────┴────────────────────────┘
    ├──► pgadmin4.localhost  → pgAdmin 4
    ├──► portainer.localhost → Portainer CE
    └──► traefik.localhost   → Traefik Dashboard
```

---

## Contribuindo

1. Faça um fork do repositório
2. Crie uma branch: `git checkout -b feature/minha-melhoria`
3. Commit: `git commit -m 'feat: descrição da melhoria'`
4. Push: `git push origin feature/minha-melhoria`
5. Abra um Pull Request

### Ideias de contribuição

- Suporte a outros modelos Ollama (`qwen2.5-coder`, `mistral`, etc.)
- Autenticação de alunos
- Exportar histórico de conversas em PDF/CSV
- Dashboard do professor com estatísticas de uso
- Suporte a RAG com material das aulas

---

## Licença

Distribuído sob a licença [MIT](https://opensource.org/licenses/MIT).
Livre para usar, modificar e distribuir com atribuição.
