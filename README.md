# Acervo Campus Web

Front-end independente em React, TypeScript e Vite. Requer Node.js 20+ e a API disponível em `http://localhost:3000`.

## Instalação

```bash
npm install
cp .envex .env
npm run dev
```

No Windows PowerShell, use `Copy-Item .envex .env`. Acesse `http://localhost:5173`.

A variável `VITE_API_URL` aponta para a base da API, por padrão `http://localhost:3000/v1`. Se a porta do front for alterada, atualize `FRONT_URL` no `.env` da API para permitir a origem no CORS.

## Telas implementadas

- Login com validação e retorno de erro.
- Dashboard com total de títulos, exemplares, empréstimos ativos, atrasos e multas.
- Categorias e autores: listagem, cadastro, edição e exclusão.
- Livros: listagem, busca por título/ISBN/autor, filtros por categoria/autor/disponibilidade, cadastro com categoria e múltiplos autores, edição e exclusão.
- Leitores: cadastro, edição e histórico de empréstimos para usuários autenticados.
- Empréstimos: cadastro com seleção de leitor e livro, filtro por status, devolução e multa.
- Atendentes: cadastro e ativação/desativação, somente para administrador.
- Identificação do usuário no topo e logout.

Atendentes visualizam o acervo, podem cadastrar leitores e operar empréstimos/devoluções. Menus administrativos são omitidos para atendentes e a API mantém a autorização no servidor.

## Sessão e renovação automática

Os tokens são mantidos em `sessionStorage`, que é limpo ao encerrar a aba. O JavaScript da mesma origem consegue ler esse armazenamento; uma vulnerabilidade XSS poderia expor os tokens. Essa decisão e seu risco são intencionais e documentados, como solicitado no enunciado. O refresh token é enviado ao endpoint de renovação pelo cliente; o desafio extra de cookie `httpOnly` não faz parte da implementação obrigatória.

O interceptor Axios:

1. envia o access token em `Authorization: Bearer ...`;
2. diante de um 401 de uma requisição autenticada, chama `/auth/refresh` uma única vez;
3. guarda o novo par de tokens e repete a requisição original;
4. faz requisições simultâneas aguardarem a mesma renovação;
5. limpa a sessão e volta ao login se o refresh falhar.

## Verificação

```bash
npm run build
```
