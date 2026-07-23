// ============================================================================
// CAMADA DE DADOS (DB)
// Expõe window.DB com a MESMA interface, esteja o app rodando contra o
// Supabase (nuvem, tempo real) ou em modo demonstração (localStorage).
// Assim o resto do app (app.js) nunca precisa saber qual dos dois está ativo.
// ============================================================================

(function () {
  const DEMO = window.APP_CONFIG.DEMO_MODE;

  // --------------------------------------------------------------------
  // Utilidades comuns
  // --------------------------------------------------------------------
  const uuid = () =>
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });

  // ======================================================================
  // MODO DEMONSTRAÇÃO — localStorage + pub/sub simulando tempo real
  // ======================================================================
  function buildDemoDB() {
    const LS_USERS = "cm_demo_users";
    const LS_PRODUTOS = "cm_demo_produtos";
    const LS_AUDIT = "cm_demo_audit";
    const LS_SESSION = "cm_demo_session";

    const listeners = new Set();
    const notify = () => listeners.forEach((cb) => cb());

    function seed() {
      if (!localStorage.getItem(LS_USERS)) {
        const users = [
          { id: uuid(), nome: "Ana Funcionária", email: "funcionario@demo.com", senha: "demo123", role: "funcionario", ativo: true },
          { id: uuid(), nome: "Carlos Gerente", email: "gerente@demo.com", senha: "demo123", role: "gerente", ativo: true },
          { id: uuid(), nome: "Rita Administradora", email: "admin@demo.com", senha: "demo123", role: "administrador", ativo: true },
        ];
        localStorage.setItem(LS_USERS, JSON.stringify(users));
      }
      if (!localStorage.getItem(LS_PRODUTOS)) {
        const users = JSON.parse(localStorage.getItem(LS_USERS));
        const funcionario = users[0];
        const hoje = new Date().toISOString().slice(0, 10);
        const exemplos = [
          { fornecedor: "Distribuidora Sul Ltda", marca: "Nestlé", descricao: "Leite em pó integral 400g", quantidade: 48, valor_compra: 12.5, valor_venda: 18.9, estoque_minimo: 20, categoria: "Alimentos", localizacao: "Corredor 3 - Prateleira A" },
          { fornecedor: "Comercial Bragança", marca: "Colgate", descricao: "Creme dental 90g", quantidade: 6, valor_compra: 3.2, valor_venda: 6.5, estoque_minimo: 15, categoria: "Higiene", localizacao: "Corredor 1 - Prateleira C" },
          { fornecedor: "Distribuidora Sul Ltda", marca: "Coca-Cola", descricao: "Refrigerante 2L", quantidade: 120, valor_compra: 5.1, valor_venda: 8.99, estoque_minimo: 30, categoria: "Bebidas", localizacao: "Câmara Fria 1" },
          { fornecedor: "Importadora Vitória", marca: "Sadia", descricao: "Presunto fatiado 200g", quantidade: 3, valor_compra: 6.8, valor_venda: null, estoque_minimo: 10, categoria: "Frios", localizacao: "Câmara Fria 2" },
        ];
        const produtos = exemplos.map((p) => ({
          id: uuid(),
          data_conferencia: hoje,
          observacao: "",
          observacoes_gerencial: "",
          criado_por: funcionario.id,
          criado_por_nome: funcionario.nome,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...p,
        }));
        localStorage.setItem(LS_PRODUTOS, JSON.stringify(produtos));
      }
      if (!localStorage.getItem(LS_AUDIT)) localStorage.setItem(LS_AUDIT, JSON.stringify([]));
    }
    seed();

    // Sincronização entre abas do navegador (simula "tempo real")
    window.addEventListener("storage", (e) => {
      if ([LS_PRODUTOS, LS_AUDIT].includes(e.key)) notify();
    });

    const readAll = (key) => JSON.parse(localStorage.getItem(key) || "[]");
    const writeAll = (key, arr) => localStorage.setItem(key, JSON.stringify(arr));

    return {
      mode: "demo",

      auth: {
        async signIn(email, senha) {
          const users = readAll(LS_USERS);
          const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase() && u.senha === senha);
          if (!user) throw new Error("E-mail ou senha inválidos.");
          if (!user.ativo) throw new Error("Este usuário está desativado.");
          localStorage.setItem(LS_SESSION, JSON.stringify({ id: user.id }));
          return user;
        },
        async signUp(nome, email, senha) {
          if (!nome.trim()) throw new Error("Informe seu nome completo.");
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new Error("Informe um e-mail válido.");
          if (!senha || senha.length < 6) throw new Error("A senha deve ter no mínimo 6 caracteres.");
          const users = readAll(LS_USERS);
          if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
            throw new Error("Já existe uma conta com este e-mail.");
          }
          const novo = { id: uuid(), nome: nome.trim(), email: email.trim(), senha, role: "funcionario", ativo: true };
          users.push(novo);
          writeAll(LS_USERS, users);
          localStorage.setItem(LS_SESSION, JSON.stringify({ id: novo.id }));
          return novo;
        },
        async signOut() {
          localStorage.removeItem(LS_SESSION);
        },
        async getSession() {
          const s = JSON.parse(localStorage.getItem(LS_SESSION) || "null");
          if (!s) return null;
          const users = readAll(LS_USERS);
          return users.find((u) => u.id === s.id) || null;
        },
      },

      profiles: {
        async list() {
          return readAll(LS_USERS).map(({ senha, ...rest }) => rest);
        },
        async updateRole(id, role, usuario) {
          if (!usuario || usuario.role !== "administrador") {
            throw new Error("Apenas administradores podem alterar o papel de acesso.");
          }
          if (!["funcionario", "gerente", "administrador"].includes(role)) {
            throw new Error("Papel de acesso inválido.");
          }
          const users = readAll(LS_USERS);
          const u = users.find((x) => x.id === id);
          if (u) u.role = role;
          writeAll(LS_USERS, users);
        },
        async setAtivo(id, ativo, usuario) {
          if (!usuario || usuario.role !== "administrador") {
            throw new Error("Apenas administradores podem ativar/desativar usuários.");
          }
          if (id === usuario.id) {
            throw new Error("Você não pode desativar a própria conta.");
          }
          const users = readAll(LS_USERS);
          const u = users.find((x) => x.id === id);
          if (u) u.ativo = ativo;
          writeAll(LS_USERS, users);
        },
      },

      produtos: {
        async list() {
          return readAll(LS_PRODUTOS).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        },
        async create(produto, usuario) {
          const produtos = readAll(LS_PRODUTOS);
          const novo = {
            id: uuid(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            criado_por: usuario.id,
            criado_por_nome: usuario.nome,
            ...produto,
          };
          produtos.push(novo);
          writeAll(LS_PRODUTOS, produtos);
          await DB.auditLog.create({ produto_id: novo.id, usuario, acao: "criar", detalhes: novo });
          notify();
          return novo;
        },
        async update(id, patch, usuario) {
          if (!usuario || !["gerente", "administrador"].includes(usuario.role)) {
            throw new Error("Você não tem permissão para editar registros.");
          }
          const produtos = readAll(LS_PRODUTOS);
          const idx = produtos.findIndex((p) => p.id === id);
          if (idx === -1) throw new Error("Produto não encontrado.");
          produtos[idx] = { ...produtos[idx], ...patch, updated_at: new Date().toISOString() };
          writeAll(LS_PRODUTOS, produtos);
          await DB.auditLog.create({ produto_id: id, usuario, acao: "editar", detalhes: patch });
          notify();
          return produtos[idx];
        },
        async remove(id, usuario) {
          if (!usuario || !["gerente", "administrador"].includes(usuario.role)) {
            throw new Error("Você não tem permissão para excluir registros.");
          }
          const produtos = readAll(LS_PRODUTOS).filter((p) => p.id !== id);
          writeAll(LS_PRODUTOS, produtos);
          await DB.auditLog.create({ produto_id: id, usuario, acao: "excluir", detalhes: null });
          notify();
        },
        subscribe(cb) {
          listeners.add(cb);
          return () => listeners.delete(cb);
        },
      },

      auditLog: {
        async list() {
          return readAll(LS_AUDIT).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        },
        async create({ produto_id, usuario, acao, detalhes }) {
          const log = readAll(LS_AUDIT);
          log.push({
            id: uuid(),
            produto_id,
            usuario_id: usuario?.id,
            usuario_nome: usuario?.nome || "Sistema",
            acao,
            detalhes,
            created_at: new Date().toISOString(),
          });
          writeAll(LS_AUDIT, log);
        },
      },
    };
  }

  // ======================================================================
  // MODO SUPABASE — nuvem real, autenticação e Realtime nativos
  // ======================================================================
  function buildSupabaseDB() {
    const client = window.supabase.createClient(
      window.APP_CONFIG.SUPABASE_URL,
      window.APP_CONFIG.SUPABASE_ANON_KEY
    );

    async function currentProfile() {
      const { data: { user } } = await client.auth.getUser();
      if (!user) return null;
      const { data, error } = await client.from("profiles").select("*").eq("id", user.id).single();
      if (error) throw error;
      return data;
    }

    return {
      mode: "supabase",
      client,

      auth: {
        async signIn(email, senha) {
          const { error } = await client.auth.signInWithPassword({ email, password: senha });
          if (error) throw new Error("E-mail ou senha inválidos.");
          const profile = await currentProfile();
          if (!profile || !profile.ativo) {
            await client.auth.signOut();
            throw new Error("Este usuário está desativado. Fale com um administrador.");
          }
          return profile;
        },
        async signUp(nome, email, senha) {
          if (!senha || senha.length < 6) throw new Error("A senha deve ter no mínimo 6 caracteres.");
          const { data, error } = await client.auth.signUp({ email, password: senha });
          if (error) throw new Error(error.message);
          // cria o perfil (papel padrão: funcionario, forçado também pela trigger no banco) via RLS "insert self"
          const { error: profileError } = await client.from("profiles").insert({ id: data.user.id, nome, email, role: "funcionario" });
          if (profileError) throw new Error(profileError.message);
          return currentProfile();
        },
        async signOut() {
          await client.auth.signOut();
        },
        async getSession() {
          const { data } = await client.auth.getSession();
          if (!data.session) return null;
          const profile = await currentProfile();
          if (!profile || !profile.ativo) {
            await client.auth.signOut();
            return null;
          }
          return profile;
        },
      },

      profiles: {
        async list() {
          const { data, error } = await client.from("profiles").select("*").order("nome");
          if (error) throw error;
          return data;
        },
        async updateRole(id, role, usuario) {
          // A autorização real é garantida pela trigger/RLS no banco; esta
          // checagem no cliente só evita uma chamada desnecessária e dá
          // feedback imediato ao usuário.
          if (!usuario || usuario.role !== "administrador") {
            throw new Error("Apenas administradores podem alterar o papel de acesso.");
          }
          const { error } = await client.from("profiles").update({ role }).eq("id", id);
          if (error) throw error;
        },
        async setAtivo(id, ativo, usuario) {
          if (!usuario || usuario.role !== "administrador") {
            throw new Error("Apenas administradores podem ativar/desativar usuários.");
          }
          if (id === usuario.id) {
            throw new Error("Você não pode desativar a própria conta.");
          }
          const { error } = await client.from("profiles").update({ ativo }).eq("id", id);
          if (error) throw error;
        },
      },

      produtos: {
        async list() {
          const { data, error } = await client.from("produtos").select("*").order("created_at", { ascending: false });
          if (error) throw error;
          return data;
        },
        async create(produto, usuario) {
          const { data, error } = await client
            .from("produtos")
            .insert({ ...produto, criado_por: usuario.id })
            .select()
            .single();
          if (error) throw error;
          return data;
        },
        async update(id, patch, usuario) {
          if (!usuario || !["gerente", "administrador"].includes(usuario.role)) {
            throw new Error("Você não tem permissão para editar registros.");
          }
          const { data, error } = await client
            .from("produtos")
            .update({ ...patch, atualizado_por: usuario.id })
            .eq("id", id)
            .select()
            .single();
          if (error) throw error;
          return data;
        },
        async remove(id, usuario) {
          if (!usuario || !["gerente", "administrador"].includes(usuario.role)) {
            throw new Error("Você não tem permissão para excluir registros.");
          }
          const { error } = await client.from("produtos").delete().eq("id", id);
          if (error) throw error;
        },
        subscribe(cb) {
          const channel = client
            .channel("produtos-realtime")
            .on("postgres_changes", { event: "*", schema: "public", table: "produtos" }, cb)
            .subscribe();
          return () => client.removeChannel(channel);
        },
      },

      auditLog: {
        async list() {
          const { data, error } = await client
            .from("audit_log")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(200);
          if (error) throw error;
          return data;
        },
        async create({ produto_id, usuario, acao, detalhes }) {
          await client.from("audit_log").insert({
            produto_id,
            usuario_id: usuario?.id,
            usuario_nome: usuario?.nome,
            acao,
            detalhes,
          });
        },
      },
    };
  }

  window.DB = DEMO ? buildDemoDB() : buildSupabaseDB();
})();
