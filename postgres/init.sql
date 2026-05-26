-- Tabela principal de conversas do tutor IA
CREATE TABLE IF NOT EXISTS conversations (
    id           SERIAL PRIMARY KEY,
    student_name VARCHAR(100) NOT NULL,
    question     TEXT         NOT NULL,
    answer       TEXT         NOT NULL,
    created_at   TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- Índices para consultas comuns
CREATE INDEX IF NOT EXISTS idx_conversations_student
    ON conversations (LOWER(student_name));

CREATE INDEX IF NOT EXISTS idx_conversations_created_at
    ON conversations (created_at DESC);
