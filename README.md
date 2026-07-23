# Conferência de Mercadorias — Sistema Web

Sistema de conferência de mercadorias com Área Gerencial, cálculos automáticos,
dashboard em tempo real, relatórios (PDF/Excel), 3 níveis de acesso e PWA
instalável, construído em HTML/CSS/JS puro + Supabase.

## 1. Testar agora (modo demonstração)

Sem configurar nada, abra `index.html` num navegador (ou hospede os arquivos
em qualquer servidor estático) e use um destes logins de teste:

| Papel          | E-mail                | Senha     |
|----------------|------------------------|-----------|
| Funcionário    | funcionario@demo.com   | demo123   |
| Gerente        | gerente@demo.com       | demo123   |
| Administrador  | admin@demo.com         | demo123   |

Neste modo os dados ficam salvos apenas no navegador (localStorage), sem
nuvem — é só para você validar as telas e o fluxo antes de conectar o banco
de dados real.

## 2. Conectar ao banco de dados em nuvem (Supabase)

1. Crie uma conta gratuita em https://supabase.com e um novo projeto.
2. Abra **SQL Editor** no painel do projeto, cole o conteúdo de
   `schema.sql` (na raiz deste pacote) e clique em **Run**. Isso cria:
   - tabela `produtos` (conferência + dados gerenciais no mesmo registro)
   - tabela `profiles` (usuários e papéis: funcionário / gerente / administrador)
   - tabela `audit_log` (log de auditoria de criação/edição/exclusão)
   - políticas de segurança (Row Level Security) por papel
   - Realtime habilitado na tabela `produtos`
3. Em **Project Settings > API**, copie a **Project URL** e a chave
   **anon public**.
4. Abra `js/config.js` e preencha:
   ```js
   SUPABASE_URL: "https://SEU-PROJETO.supabase.co",
   SUPABASE_ANON_KEY: "sua-chave-anon-aqui",
   ```
   Nesse mesmo arquivo você pode trocar `AREA_GERENCIAL_SENHA` pela senha
   que quiser usar para proteger a Área Gerencial (padrão: `gerente123`).
   Gerente e administrador precisam digitá-la uma vez a cada novo login.
5. Salve, publique os arquivos (passo 3 abaixo) e crie sua conta pela tela
   de login ("Criar uma conta"). O primeiro usuário nasce como
   **funcionário** — para virar administrador, rode no SQL Editor:
   ```sql
   update public.profiles set role = 'administrador'
   where email = 'seuemail@empresa.com';
   ```
   A partir daí, promova os demais colegas pela própria tela **Usuários**
   dentro do sistema (visível só para administrador).

## 3. Publicar o sistema (acesso de qualquer lugar)

Qualquer hospedagem de arquivos estáticos funciona. Opções gratuitas mais
simples:

- **Netlify / Vercel**: arraste a pasta do projeto no painel, ou conecte a
  um repositório Git — o deploy é automático a cada alteração.
- **GitHub Pages**: suba os arquivos para um repositório e ative Pages nas
  configurações.

Depois de publicado, o endereço (ex: `https://sua-empresa.netlify.app`)
já funciona em qualquer celular, tablet ou computador com internet.

## 4. Instalar como aplicativo (PWA)

Com o site publicado (HTTPS é obrigatório para PWA funcionar), basta abrir
o link:
- **Android/Chrome**: menu ⋮ → "Instalar aplicativo" ou "Adicionar à tela inicial".
- **iPhone/Safari**: botão Compartilhar → "Adicionar à Tela de Início".
- **Desktop (Chrome/Edge)**: ícone de instalação na barra de endereço.

Não é necessário publicar em nenhuma loja de aplicativos.

## 5. Estrutura do projeto

```
estoqueapp/
├── index.html          Telas: login, conferência, gerencial, dashboard, relatórios, usuários
├── manifest.json        Configuração do PWA
├── sw.js                Service worker (cache/offline)
├── schema.sql            Schema completo do Supabase (rodar 1x no SQL Editor)
├── css/
│   └── styles.css        Design tokens, layout responsivo, modo claro/escuro
├── js/
│   ├── config.js          Suas chaves do Supabase (só isso precisa editar)
│   ├── db.js                Camada de dados (Supabase real ou demo local, mesma API)
│   ├── calc.js               Fórmulas: totais, lucro, margem, KPIs
│   └── app.js                Navegação, telas, formulários e regras por papel
└── icons/                     Ícones do PWA
```

O código foi organizado em módulos justamente para facilitar as expansões
futuras já previstas no projeto: leitura de código de barras por câmera,
importação de notas fiscais, impressão de etiquetas, cadastro completo de
clientes/fornecedores, módulo de vendas e compras, e integração com
leitores de código de barras físicos — todas podem ser adicionadas como
novos arquivos em `js/` sem reescrever o que já existe.

## 6. O que já está pronto

- Login com e-mail/senha e 3 níveis de acesso (funcionário, gerente, administrador)
- Cadastro de conta por formulário próprio na tela de login (sem pop-ups do navegador)
- Cada papel só vê as abas/campos permitidos (funcionário não vê preços/custos)
- Conferência de mercadorias com todos os campos pedidos + busca e filtro por data
- Cadastro em lote: informe o fornecedor e a data uma vez, e acrescente quantos produtos quiser antes de salvar tudo de uma vez
- Editar/excluir restrito a gerente e administrador (validado também no servidor)
- Área Gerencial vinculada ao mesmo produto (preço, categoria, localização etc.), protegida por senha extra além do login
- Resumo do valor total de compra, venda e lucro por fornecedor
- Cálculos automáticos: total de compra/venda, lucro por unidade e total,
  margem %, valor total do estoque, preço médio, ticket médio
- Dashboard em tempo real com todos os indicadores pedidos
- Relatórios em PDF e Excel com filtros
- Pesquisa instantânea por descrição, marca e fornecedor
- Log de auditoria de todas as alterações, com tela própria para consulta (administrador)
- Modo claro/escuro, responsivo, instalável como PWA
- Sincronização em tempo real entre usuários (via Supabase Realtime)
- Desativar um usuário revoga o acesso de verdade (banco de dados), não só a interface

## 7. Limitação importante sobre segurança de campos

O Postgres (banco usado pelo Supabase) restringe **linhas** por política de
segurança (RLS), não colunas isoladas dentro da mesma linha. Por isso, no
front-end, os campos financeiros (valor de compra/venda etc.) só aparecem
na interface para gerente/administrador — mas um usuário técnico poderia,
em teoria, consultar a tabela `produtos` diretamente via API e ver esses
campos. Para blindagem adicional em produção, recomenda-se usar a view
`produtos_conferencia` (já criada no `schema.sql`, sem os campos
financeiros) como fonte de dados para o papel "funcionário" em vez da
tabela completa. Ficou pronta a estrutura; a troca é de poucas linhas em
`js/db.js` caso você quantifique esse risco como relevante para o seu
negócio.
