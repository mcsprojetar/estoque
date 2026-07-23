// ============================================================================
// CONFIGURAÇÃO — cole aqui os dados do SEU projeto Supabase
// ============================================================================
// Onde encontrar: painel Supabase > Project Settings > API
//   - "Project URL"           -> SUPABASE_URL
//   - "anon public" API key   -> SUPABASE_ANON_KEY
//
// Enquanto os dois campos abaixo estiverem vazios, o sistema roda em
// MODO DEMONSTRAÇÃO (dados salvos no navegador, sem nuvem), para você
// testar tudo antes de conectar o banco de dados real.
// ============================================================================

window.APP_CONFIG = {
  SUPABASE_URL: "",       // ex: "https://xxxxxxxxxxxx.supabase.co"
  SUPABASE_ANON_KEY: "",  // ex: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

  APP_NAME: "Conferência de Mercadorias",
  ESTOQUE_BAIXO_PADRAO: 5, // usado quando o produto não tem "estoque mínimo" definido

  // Senha extra para entrar na Área Gerencial, além do login normal.
  // Só gerente/administrador veem essa tela, e mesmo assim precisam digitar
  // esta senha a cada novo login para abri-la. Troque para a senha que quiser.
  AREA_GERENCIAL_SENHA: "gerente123",
};

window.APP_CONFIG.DEMO_MODE = !window.APP_CONFIG.SUPABASE_URL || !window.APP_CONFIG.SUPABASE_ANON_KEY;
