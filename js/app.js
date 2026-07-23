// ============================================================================
// APP — estado, navegação e renderização das telas
// ============================================================================

const State = {
  user: null,
  produtos: [],
  filtro: { termo: "", dataIni: "", dataFim: "" },
  aba: "conferencia",
  abaPendente: null,
  unsubscribe: null,
  areaProtegidaDesbloqueada: false,
};

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const fmtData = (iso) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR") : "—");
const fmtDataHora = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR") : "—");

// Evita recalcular/re-renderizar a cada tecla digitada — só executa a
// função depois que o usuário para de digitar por `espera` ms.
function debounce(fn, espera = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), espera);
  };
}

// ---------------------------------------------------------------------------
// BOOT
// ---------------------------------------------------------------------------
window.addEventListener("DOMContentLoaded", async () => {
  applyTheme(localStorage.getItem("cm_theme") || "light");
  $("#demoNotice").classList.toggle("hidden", !window.APP_CONFIG.DEMO_MODE);

  const user = await DB.auth.getSession();
  if (user) {
    await enterApp(user);
  } else {
    showLogin();
  }

  wireLoginForm();
  wireGlobalUI();
});

// ---------------------------------------------------------------------------
// LOGIN
// ---------------------------------------------------------------------------
function showLogin() {
  $("#loginScreen").classList.remove("hidden");
  $("#appScreen").classList.add("hidden");
}

function wireLoginForm() {
  const form = $("#loginForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#loginEmail").value.trim();
    const senha = $("#loginSenha").value;
    const errBox = $("#loginError");
    errBox.classList.add("hidden");
    try {
      const user = await DB.auth.signIn(email, senha);
      await enterApp(user);
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.remove("hidden");
    }
  });

  // Alterna entre o formulário de login e o de criação de conta
  $("#linkCriarConta").addEventListener("click", (e) => {
    e.preventDefault();
    $("#loginForm").classList.add("hidden");
    $("#signupForm").classList.remove("hidden");
    $("#loginLinks").classList.add("hidden");
    $("#loginError").classList.add("hidden");
    $("#signupNome").focus();
  });
  $("#linkVoltarLogin").addEventListener("click", (e) => {
    e.preventDefault();
    $("#signupForm").classList.add("hidden");
    $("#loginForm").classList.remove("hidden");
    $("#loginLinks").classList.remove("hidden");
    $("#signupError").classList.add("hidden");
  });

  $("#signupForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nome = $("#signupNome").value.trim();
    const email = $("#signupEmail").value.trim();
    const senha = $("#signupSenha").value;
    const confirmar = $("#signupConfirmarSenha").value;
    const errBox = $("#signupError");
    errBox.classList.add("hidden");

    if (senha !== confirmar) {
      errBox.textContent = "As senhas informadas não coincidem.";
      errBox.classList.remove("hidden");
      return;
    }
    try {
      const user = await DB.auth.signUp(nome, email, senha);
      await enterApp(user);
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.remove("hidden");
    }
  });
}

async function enterApp(user) {
  State.user = user;
  $("#loginScreen").classList.add("hidden");
  $("#appScreen").classList.remove("hidden");

  $("#userNome").textContent = user.nome;
  $("#userPapel").textContent = rotuloPapel(user.role);
  $("#userPapel").className = "role-badge role-" + user.role;

  configurarAbasPorPapel(user.role);
  await carregarProdutos();

  if (State.unsubscribe) State.unsubscribe();
  State.unsubscribe = DB.produtos.subscribe(async () => {
    await carregarProdutos();
    renderAbaAtual();
  });

  irParaAba(user.role === "funcionario" ? "conferencia" : "dashboard");
}

function rotuloPapel(role) {
  return { funcionario: "Funcionário", gerente: "Gerente", administrador: "Administrador" }[role] || role;
}

function configurarAbasPorPapel(role) {
  $$(".nav-btn").forEach((btn) => {
    const permitido = btn.dataset.rolesPermitidas.split(",").includes(role);
    btn.classList.toggle("hidden", !permitido);
  });
}

// ---------------------------------------------------------------------------
// NAVEGAÇÃO
// ---------------------------------------------------------------------------
function wireGlobalUI() {
  $$(".nav-btn").forEach((btn) => btn.addEventListener("click", () => irParaAba(btn.dataset.aba)));

  $("#btnLogout").addEventListener("click", async () => {
    await DB.auth.signOut();
    if (State.unsubscribe) State.unsubscribe();
    location.reload();
  });

  $("#btnTema").addEventListener("click", () => {
    const atual = document.documentElement.dataset.theme;
    applyTheme(atual === "dark" ? "light" : "dark");
  });

  $("#buscaGlobal").addEventListener(
    "input",
    debounce((e) => {
      State.filtro.termo = e.target.value.trim().toLowerCase();
      renderAbaAtual();
    }, 200)
  );
  $("#filtroDataIni").addEventListener("change", (e) => {
    State.filtro.dataIni = e.target.value;
    renderAbaAtual();
  });
  $("#filtroDataFim").addEventListener("change", (e) => {
    State.filtro.dataFim = e.target.value;
    renderAbaAtual();
  });

  $("#formConferencia").addEventListener("submit", onSalvarConferencia);
  $("#btnNovoRegistro").addEventListener("click", () => abrirModalProduto(null));
  $("#btnAdicionarProdutoConferencia").addEventListener("click", () => abrirModalProduto(null));
  $("#btnAdicionarItem").addEventListener("click", adicionarItemConferencia);
  $("#itensConferencia").addEventListener("click", (e) => {
    if (e.target.closest(".btn-remover-item")) removerItemConferencia(e.target.closest(".item-conferencia"));
  });
  $("#formModalProduto").addEventListener("submit", onSalvarModalProduto);
  $("#btnFecharModal").addEventListener("click", fecharModal);
  $("#btnCancelarModal").addEventListener("click", fecharModal);

  $("#btnGerarPDF").addEventListener("click", gerarRelatorioPDF);
  $("#btnGerarExcel").addEventListener("click", gerarRelatorioExcel);

  $("#formSenhaArea").addEventListener("submit", (e) => {
    e.preventDefault();
    const campo = $("#campoSenhaArea");
    const erroBox = $("#erroSenhaArea");
    if (campo.value === window.APP_CONFIG.AREA_GERENCIAL_SENHA) {
      State.areaProtegidaDesbloqueada = true;
      campo.value = "";
      erroBox.classList.add("hidden");
      irParaAba(State.abaPendente || "dashboard");
    } else {
      erroBox.textContent = "Senha incorreta.";
      erroBox.classList.remove("hidden");
      campo.value = "";
      campo.focus();
    }
  });

  // Acessibilidade/UX do modal: fechar com Esc ou clicando fora do card
  $("#modalProduto").addEventListener("click", (e) => {
    if (e.target.id === "modalProduto") fecharModal();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#modalProduto").classList.contains("hidden")) fecharModal();
  });

  $("#campoData").valueAsDate = new Date();
  adicionarItemConferencia(); // começa com 1 item pronto para preencher
}

// Toda aba, exceto "conferencia", exige a senha da área protegida — uma vez
// digitada corretamente, libera todas elas na mesma sessão (até logout).
function irParaAba(aba) {
  if (aba !== "conferencia" && !State.areaProtegidaDesbloqueada) {
    State.abaPendente = aba;
    $$(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.aba === aba));
    $$(".tela").forEach((t) => t.classList.toggle("hidden", t.id !== "tela-bloqueada"));
    setTimeout(() => $("#campoSenhaArea")?.focus(), 0);
    return;
  }
  State.aba = aba;
  $$(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.aba === aba));
  $$(".tela").forEach((t) => t.classList.toggle("hidden", t.id !== "tela-" + aba));
  renderAbaAtual();
}

function renderAbaAtual() {
  const map = {
    conferencia: renderConferencia,
    gerencial: renderGerencial,
    dashboard: renderDashboard,
    relatorios: renderRelatoriosFiltros,
    usuarios: renderUsuarios,
    auditoria: renderAuditoria,
  };
  (map[State.aba] || (() => {}))();
}

// ---------------------------------------------------------------------------
// TEMA
// ---------------------------------------------------------------------------
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("cm_theme", theme);
  $("#iconeTema").textContent = theme === "dark" ? "☀️" : "🌙";
}

// ---------------------------------------------------------------------------
// DADOS
// ---------------------------------------------------------------------------
async function carregarProdutos() {
  State.produtos = await DB.produtos.list();
}

function produtosFiltradosPorData() {
  const { dataIni, dataFim } = State.filtro;
  return State.produtos.filter((p) => {
    if (dataIni && p.data_conferencia < dataIni) return false;
    if (dataFim && p.data_conferencia > dataFim) return false;
    return true;
  });
}

function produtosFiltrados() {
  const { termo } = State.filtro;
  return produtosFiltradosPorData().filter((p) => {
    if (termo) {
      const alvo = [p.descricao, p.marca, p.fornecedor].join(" ").toLowerCase();
      if (!alvo.includes(termo)) return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// VALIDAÇÃO
// ---------------------------------------------------------------------------
// O atributo HTML "required" só barra um campo totalmente vazio — um valor
// composto só de espaços passa pela validação nativa do navegador e, depois
// do .trim(), seria salvo como string vazia. Esta função re-valida os
// campos já "trimados" antes de qualquer gravação no banco.
function validarCamposObrigatorios(dados) {
  const obrigatorios = { fornecedor: "Fornecedor", marca: "Marca", descricao: "Descrição" };
  for (const [campo, rotulo] of Object.entries(obrigatorios)) {
    if (!dados[campo]) return `O campo "${rotulo}" é obrigatório.`;
  }
  if (!dados.data_conferencia) return 'O campo "Data" é obrigatório.';
  if (dados.quantidade === null || isNaN(dados.quantidade) || dados.quantidade < 0) {
    return "Informe uma quantidade válida (maior ou igual a zero).";
  }
  if (dados.valor_compra != null && dados.valor_compra < 0) return "O valor de compra não pode ser negativo.";
  if (dados.valor_venda != null && dados.valor_venda < 0) return "O valor de venda não pode ser negativo.";
  if (dados.estoque_minimo != null && dados.estoque_minimo < 0) return "O estoque mínimo não pode ser negativo.";
  return null;
}

// "Nunca criar cadastros duplicados sem avisar o usuário": compara
// fornecedor + marca + descrição (ignorando maiúsculas/espaços). Não
// bloqueia — só avisa e deixa a pessoa decidir, já que reposições legítimas
// do mesmo produto são comuns numa conferência de mercadorias.
function encontrarPossivelDuplicata(dados, idIgnorar) {
  const norm = (v) => (v || "").trim().toLowerCase();
  return State.produtos.find(
    (p) =>
      p.id !== idIgnorar &&
      norm(p.fornecedor) === norm(dados.fornecedor) &&
      norm(p.marca) === norm(dados.marca) &&
      norm(p.descricao) === norm(dados.descricao)
  );
}

function confirmarSeDuplicado(dados, idIgnorar) {
  const duplicata = encontrarPossivelDuplicata(dados, idIgnorar);
  if (!duplicata) return true;
  return confirm(
    `Já existe um produto cadastrado com o mesmo fornecedor, marca e descrição (quantidade atual: ${duplicata.quantidade}).\n\nDeseja cadastrar mesmo assim?`
  );
}

// ---------------------------------------------------------------------------
// TELA: CONFERÊNCIA — lista dinâmica de itens (vários produtos, 1 fornecedor)
// ---------------------------------------------------------------------------
function adicionarItemConferencia() {
  const tpl = $("#tplItemConferencia");
  const clone = tpl.content.cloneNode(true);
  $("#itensConferencia").appendChild(clone);
  const itens = $$(".item-conferencia", $("#itensConferencia"));
  const novo = itens[itens.length - 1];
  novo.querySelector('[name="marca"]').focus();
}

function removerItemConferencia(itemEl) {
  const itens = $$(".item-conferencia", $("#itensConferencia"));
  if (itens.length <= 1) {
    // Sempre mantém pelo menos 1 item na tela — se só sobrou um, só limpa os campos
    itemEl.querySelectorAll("input").forEach((i) => (i.value = ""));
    return;
  }
  itemEl.remove();
}

function limparItensConferencia() {
  $("#itensConferencia").innerHTML = "";
  adicionarItemConferencia();
}

async function onSalvarConferencia(e) {
  e.preventDefault();
  const f = e.target;
  const dataConferencia = f.data_conferencia.value;
  const fornecedor = f.fornecedor.value.trim();

  // Limpa destaques de validação de uma tentativa anterior
  $$(".item-conferencia.item-invalido").forEach((el) => el.classList.remove("item-invalido"));

  if (!dataConferencia) { toast('⚠ O campo "Data" é obrigatório.'); return; }
  if (!fornecedor) { toast('⚠ O campo "Fornecedor" é obrigatório.'); return; }

  const linhas = $$(".item-conferencia", $("#itensConferencia"));
  const itens = [];
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    const marca = linha.querySelector('[name="marca"]').value.trim();
    const descricao = linha.querySelector('[name="descricao"]').value.trim();
    const quantidadeStr = linha.querySelector('[name="quantidade"]').value;
    const observacao = linha.querySelector('[name="observacao"]').value.trim();

    // Linha totalmente vazia: ignora silenciosamente (não obriga preencher todas)
    if (!marca && !descricao && !quantidadeStr && !observacao) continue;

    const item = { data_conferencia: dataConferencia, fornecedor, marca, descricao, quantidade: Number(quantidadeStr), observacao };
    const erro = validarCamposObrigatorios(item);
    if (erro) {
      linha.classList.add("item-invalido");
      linha.scrollIntoView({ behavior: "smooth", block: "center" });
      toast(`⚠ Item ${i + 1}: ${erro}`);
      return;
    }
    itens.push(item);
  }

  if (itens.length === 0) { toast("⚠ Adicione pelo menos um produto antes de salvar."); return; }

  // Checa duplicidade de todos os itens de uma vez, num único aviso
  const duplicados = itens
    .map((item) => encontrarPossivelDuplicata(item, null))
    .filter(Boolean);
  if (duplicados.length > 0) {
    const lista = [...new Set(duplicados.map((d) => `• ${d.marca} — ${d.descricao}`))].join("\n");
    const prosseguir = confirm(
      `${duplicados.length} produto(s) já parecem estar cadastrados (mesmo fornecedor, marca e descrição):\n\n${lista}\n\nDeseja salvar mesmo assim?`
    );
    if (!prosseguir) return;
  }

  try {
    for (const item of itens) {
      await DB.produtos.create(item, State.user);
    }
    limparItensConferencia();
    toast(`${itens.length} produto(s) salvo(s) e enviado(s) para a Área Gerencial ✔`);
    await carregarProdutos();
    renderAbaAtual();
  } catch (err) {
    alert("Erro ao salvar: " + err.message);
  }
}

function podeEditarExcluir() {
  return ["gerente", "administrador"].includes(State.user.role);
}

function renderConferencia() {
  const podeGerir = podeEditarExcluir();
  const lista = produtosFiltrados();
  const tbody = $("#tabelaConferencia tbody");
  tbody.innerHTML = lista
    .map(
      (p) => `
    <tr>
      <td>${fmtData(p.data_conferencia)}</td>
      <td>${escapeHtml(p.fornecedor)}</td>
      <td>${escapeHtml(p.marca)}</td>
      <td>${escapeHtml(p.descricao)}</td>
      <td class="num">${p.quantidade}</td>
      <td>${escapeHtml(p.observacao || "—")}</td>
      <td class="col-acoes">
        ${
          podeGerir
            ? `<button class="btn-icon" title="Editar" data-acao="editar" data-id="${p.id}">✏️</button>
               <button class="btn-icon" title="Excluir" data-acao="excluir" data-id="${p.id}">🗑️</button>`
            : `<span class="muted">—</span>`
        }
      </td>
    </tr>`
    )
    .join("");

  $("#contadorConferencia").textContent = `${lista.length} registro(s)`;

  $$('#tabelaConferencia [data-acao="editar"]').forEach((b) =>
    b.addEventListener("click", () => abrirModalProduto(b.dataset.id))
  );
  $$('#tabelaConferencia [data-acao="excluir"]').forEach((b) =>
    b.addEventListener("click", () => excluirProduto(b.dataset.id))
  );
}

async function excluirProduto(id) {
  if (!confirm("Excluir este registro definitivamente?")) return;
  await DB.produtos.remove(id, State.user);
  await carregarProdutos();
  renderAbaAtual();
  toast("Registro excluído.");
}

// ---------------------------------------------------------------------------
// MODAL DE PRODUTO (usado pela Conferência - editar - e pela Área Gerencial)
// ---------------------------------------------------------------------------
function abrirModalProduto(id) {
  const modal = $("#modalProduto");
  const f = $("#formModalProduto");
  f.reset();
  f.dataset.id = id || "";

  const ehGerencial = ["gerente", "administrador"].includes(State.user.role);
  $$(".campo-gerencial", f).forEach((el) => el.classList.toggle("hidden", !ehGerencial));

  if (id) {
    const p = State.produtos.find((x) => x.id === id);
    $("#modalTitulo").textContent = "Editar registro";
    f.data_conferencia.value = p.data_conferencia;
    f.fornecedor.value = p.fornecedor;
    f.marca.value = p.marca;
    f.descricao.value = p.descricao;
    f.quantidade.value = p.quantidade;
    f.observacao.value = p.observacao || "";
    if (ehGerencial) {
      f.valor_compra.value = p.valor_compra ?? "";
      f.valor_venda.value = p.valor_venda ?? "";
      f.estoque_minimo.value = p.estoque_minimo ?? "";
      f.categoria.value = p.categoria ?? "";
      f.localizacao.value = p.localizacao ?? "";
      f.observacoes_gerencial.value = p.observacoes_gerencial ?? "";
    }
  } else {
    $("#modalTitulo").textContent = "Novo registro";
    f.data_conferencia.valueAsDate = new Date();
  }

  modal.classList.remove("hidden");
  // Foca o primeiro campo para quem navega por teclado/leitor de tela
  setTimeout(() => f.data_conferencia.focus(), 0);
}

function fecharModal() {
  $("#modalProduto").classList.add("hidden");
}

async function onSalvarModalProduto(e) {
  e.preventDefault();
  const f = e.target;
  const id = f.dataset.id;
  const ehGerencial = ["gerente", "administrador"].includes(State.user.role);

  const patch = {
    data_conferencia: f.data_conferencia.value,
    fornecedor: f.fornecedor.value.trim(),
    marca: f.marca.value.trim(),
    descricao: f.descricao.value.trim(),
    quantidade: Number(f.quantidade.value),
    observacao: f.observacao.value.trim(),
  };

  if (ehGerencial) {
    patch.valor_compra = f.valor_compra.value === "" ? null : Number(f.valor_compra.value);
    patch.valor_venda = f.valor_venda.value === "" ? null : Number(f.valor_venda.value);
    patch.estoque_minimo = f.estoque_minimo.value === "" ? null : Number(f.estoque_minimo.value);
    patch.categoria = f.categoria.value.trim();
    patch.localizacao = f.localizacao.value.trim();
    patch.observacoes_gerencial = f.observacoes_gerencial.value.trim();
  }

  const erro = validarCamposObrigatorios(patch);
  if (erro) { toast("⚠ " + erro); return; }
  if (!confirmarSeDuplicado(patch, id || null)) return;

  try {
    if (id) {
      await DB.produtos.update(id, patch, State.user);
      toast("Registro atualizado ✔");
    } else {
      await DB.produtos.create(patch, State.user);
      toast("Registro criado ✔");
    }
    fecharModal();
    await carregarProdutos();
    renderAbaAtual();
  } catch (err) {
    alert("Erro ao salvar: " + err.message);
  }
}

// ---------------------------------------------------------------------------
// TELA: GERENCIAL
// ---------------------------------------------------------------------------
function renderGerencial() {
  const lista = produtosFiltrados();
  renderResumoFornecedores(lista);
  const tbody = $("#tabelaGerencial tbody");
  tbody.innerHTML = lista
    .map((p) => {
      const totalCompra = Calc.totalCompra(p);
      const totalVenda = Calc.totalVenda(p);
      const lucroUn = Calc.lucroUnidade(p);
      const lucroTot = Calc.lucroTotal(p);
      const margem = Calc.margem(p);
      const baixo = Calc.estoqueBaixo(p, window.APP_CONFIG.ESTOQUE_BAIXO_PADRAO);
      return `
      <tr class="${baixo ? "linha-alerta" : ""}">
        <td>${escapeHtml(p.descricao)}</td>
        <td>${escapeHtml(p.fornecedor)}</td>
        <td>${escapeHtml(p.marca)}</td>
        <td>${escapeHtml(p.categoria || "—")}</td>
        <td>${escapeHtml(p.localizacao || "—")}</td>
        <td class="num">${p.quantidade}${baixo ? ' <span class="pill pill-alerta">baixo</span>' : ""}</td>
        <td class="num">${Calc.moeda(p.valor_compra)}</td>
        <td class="num">${Calc.moeda(p.valor_venda)}</td>
        <td class="num">${Calc.moeda(totalCompra)}</td>
        <td class="num">${Calc.moeda(totalVenda)}</td>
        <td class="num">${Calc.moeda(lucroUn)}</td>
        <td class="num">${Calc.moeda(lucroTot)}</td>
        <td class="num">${Calc.percentual(margem)}</td>
        <td class="col-acoes">
          <button class="btn-icon" title="Editar" data-acao="editar" data-id="${p.id}">✏️</button>
          <button class="btn-icon" title="Excluir" data-acao="excluir" data-id="${p.id}">🗑️</button>
        </td>
      </tr>`;
    })
    .join("");

  $("#contadorGerencial").textContent = `${lista.length} produto(s)`;

  $$('#tabelaGerencial [data-acao="editar"]').forEach((b) =>
    b.addEventListener("click", () => abrirModalProduto(b.dataset.id))
  );
  $$('#tabelaGerencial [data-acao="excluir"]').forEach((b) =>
    b.addEventListener("click", () => excluirProduto(b.dataset.id))
  );
}

function renderResumoFornecedores(lista) {
  const totais = Calc.totaisPorFornecedor(lista);
  const tbody = $("#tabelaFornecedores tbody");
  tbody.innerHTML =
    totais
      .map(
        (f) => `
    <tr>
      <td>${escapeHtml(f.fornecedor)}</td>
      <td class="num">${f.produtos}</td>
      <td class="num">${f.quantidade.toLocaleString("pt-BR")}</td>
      <td class="num">${Calc.moeda(f.totalCompra)}</td>
      <td class="num">${Calc.moeda(f.totalVenda)}</td>
      <td class="num">${Calc.moeda(f.lucroTotal)}</td>
    </tr>`
      )
      .join("") || `<tr><td colspan="6" class="muted">Nenhum produto cadastrado ainda.</td></tr>`;
}

// ---------------------------------------------------------------------------
// TELA: DASHBOARD
// ---------------------------------------------------------------------------
function renderDashboard() {
  const dados = produtosFiltradosPorData();
  const r = Calc.resumo(dados, window.APP_CONFIG.ESTOQUE_BAIXO_PADRAO);
  const ehGerencia = ["gerente", "administrador"].includes(State.user.role);

  $$(".kpi-financeiro").forEach((el) => el.classList.toggle("hidden", !ehGerencia));

  $("#kpiTotalProdutos").textContent = r.total;
  $("#kpiFornecedores").textContent = r.fornecedores;
  $("#kpiMarcas").textContent = r.marcas;
  $("#kpiEstoque").textContent = r.qtdEstoque.toLocaleString("pt-BR");

  if (ehGerencia) {
    $("#kpiValorInvestido").textContent = Calc.moeda(r.valorInvestido);
    $("#kpiValorVenda").textContent = Calc.moeda(r.valorVendaEstimado);
    $("#kpiLucro").textContent = Calc.moeda(r.lucroEstimado);
    $("#kpiMargem").textContent = Calc.percentual(r.margemMedia);
    $("#kpiPrecoMedio").textContent = Calc.moeda(r.precoMedio);
    $("#kpiTicketMedio").textContent = Calc.moeda(r.ticketMedio);
    $("#kpiSemPreco").textContent = r.semPreco.length;
    $("#kpiEstoqueBaixo").textContent = r.estoqueBaixo.length;
  }

  $("#listaMaisLucrativos").innerHTML =
    r.maisLucrativos
      .map((p) => `<li><span>${escapeHtml(p.descricao)}</span><strong>${Calc.moeda(Calc.lucroTotal(p))}</strong></li>`)
      .join("") || `<li class="muted">Sem dados suficientes ainda.</li>`;

  $("#listaEstoqueBaixo").innerHTML =
    r.estoqueBaixo
      .slice(0, 8)
      .map((p) => `<li><span>${escapeHtml(p.descricao)}</span><strong>${p.quantidade} un.</strong></li>`)
      .join("") || `<li class="muted">Nenhum produto com estoque baixo.</li>`;

  $("#listaUltimasConferencias").innerHTML =
    r.ultimasConferencias
      .map(
        (p) =>
          `<li><span>${escapeHtml(p.descricao)} <span class="muted small">(${escapeHtml(p.fornecedor)})</span></span><strong>${fmtDataHora(p.created_at)}</strong></li>`
      )
      .join("") || `<li class="muted">Nenhuma conferência registrada.</li>`;
}

// ---------------------------------------------------------------------------
// TELA: RELATÓRIOS
// ---------------------------------------------------------------------------
function renderRelatoriosFiltros() {
  const dl = (id, campo) => {
    const el = $(id);
    const valores = [...new Set(State.produtos.map((p) => p[campo]).filter(Boolean))].sort();
    el.innerHTML = `<option value="">Todos</option>` + valores.map((v) => `<option>${escapeHtml(v)}</option>`).join("");
  };
  dl("#relFornecedor", "fornecedor");
  dl("#relMarca", "marca");
  dl("#relCategoria", "categoria");
}

function produtosParaRelatorio() {
  const dataIni = $("#relDataIni").value;
  const dataFim = $("#relDataFim").value;
  const fornecedor = $("#relFornecedor").value;
  const marca = $("#relMarca").value;
  const categoria = $("#relCategoria").value;
  const produto = $("#relProduto").value.trim().toLowerCase();

  return State.produtos.filter((p) => {
    if (dataIni && p.data_conferencia < dataIni) return false;
    if (dataFim && p.data_conferencia > dataFim) return false;
    if (fornecedor && p.fornecedor !== fornecedor) return false;
    if (marca && p.marca !== marca) return false;
    if (categoria && p.categoria !== categoria) return false;
    if (produto && !p.descricao.toLowerCase().includes(produto)) return false;
    return true;
  });
}

function gerarRelatorioPDF() {
  const lista = produtosParaRelatorio();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape" });

  doc.setFontSize(14);
  doc.text(window.APP_CONFIG.APP_NAME + " — Relatório de Produtos", 14, 14);
  doc.setFontSize(9);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")} por ${State.user.nome}`, 14, 20);

  const linhas = lista.map((p) => [
    fmtData(p.data_conferencia),
    p.fornecedor,
    p.marca,
    p.descricao,
    p.categoria || "",
    p.localizacao || "",
    p.quantidade,
    Calc.moeda(p.valor_compra),
    Calc.moeda(p.valor_venda),
    Calc.moeda(Calc.lucroTotal(p)),
    Calc.percentual(Calc.margem(p)),
  ]);

  doc.autoTable({
    startY: 26,
    head: [["Data", "Fornecedor", "Marca", "Descrição", "Categoria", "Localização", "Qtd", "V. Compra", "V. Venda", "Lucro Total", "Margem"]],
    body: linhas,
    styles: { fontSize: 7 },
    headStyles: { fillColor: [30, 42, 74] },
  });

  doc.save(`relatorio-produtos-${Date.now()}.pdf`);
}

function gerarRelatorioExcel() {
  const lista = produtosParaRelatorio();
  const linhas = lista.map((p) => ({
    Data: fmtData(p.data_conferencia),
    Fornecedor: p.fornecedor,
    Marca: p.marca,
    Descrição: p.descricao,
    Categoria: p.categoria || "",
    Localização: p.localizacao || "",
    Quantidade: p.quantidade,
    "Valor Compra": p.valor_compra ?? "",
    "Valor Venda": p.valor_venda ?? "",
    "Total Compra": Calc.totalCompra(p),
    "Total Venda": Calc.totalVenda(p),
    "Lucro Unidade": Calc.lucroUnidade(p),
    "Lucro Total": Calc.lucroTotal(p),
    "Margem %": Calc.margem(p),
    Observação: p.observacao || "",
  }));
  const ws = XLSX.utils.json_to_sheet(linhas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Produtos");
  XLSX.writeFile(wb, `relatorio-produtos-${Date.now()}.xlsx`);
}

// ---------------------------------------------------------------------------
// TELA: USUÁRIOS (somente administrador)
// ---------------------------------------------------------------------------
async function renderUsuarios() {
  const usuarios = await DB.profiles.list();
  const tbody = $("#tabelaUsuarios tbody");
  tbody.innerHTML = usuarios
    .map(
      (u) => `
    <tr>
      <td>${escapeHtml(u.nome)}</td>
      <td>${escapeHtml(u.email)}</td>
      <td>
        <select data-id="${u.id}" class="select-papel" ${u.id === State.user.id ? "disabled" : ""}>
          ${["funcionario", "gerente", "administrador"]
            .map((r) => `<option value="${r}" ${u.role === r ? "selected" : ""}>${rotuloPapel(r)}</option>`)
            .join("")}
        </select>
      </td>
      <td>
        <label class="switch">
          <input type="checkbox" data-id="${u.id}" class="chk-ativo" ${u.ativo ? "checked" : ""} ${u.id === State.user.id ? "disabled" : ""}>
          <span>${u.ativo ? "Ativo" : "Inativo"}</span>
        </label>
      </td>
    </tr>`
    )
    .join("");

  $$(".select-papel").forEach((sel) => {
    const valorAnterior = sel.value;
    sel.addEventListener("change", async () => {
      try {
        await DB.profiles.updateRole(sel.dataset.id, sel.value, State.user);
        toast("Papel de acesso atualizado.");
      } catch (err) {
        alert(err.message);
        sel.value = valorAnterior;
      }
    });
  });
  $$(".chk-ativo").forEach((chk) =>
    chk.addEventListener("change", async () => {
      try {
        await DB.profiles.setAtivo(chk.dataset.id, chk.checked, State.user);
        toast("Status do usuário atualizado.");
      } catch (err) {
        alert(err.message);
        chk.checked = !chk.checked;
      }
      renderUsuarios();
    })
  );
}

// ---------------------------------------------------------------------------
// TELA: AUDITORIA (somente administrador)
// ---------------------------------------------------------------------------
const rotuloAcao = { criar: "Criação", editar: "Edição", excluir: "Exclusão" };

async function renderAuditoria() {
  const tbody = $("#tabelaAuditoria tbody");
  tbody.innerHTML = `<tr><td colspan="4" class="muted">Carregando...</td></tr>`;
  let registros = [];
  try {
    registros = await DB.auditLog.list();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="muted">Erro ao carregar o log: ${escapeHtml(err.message)}</td></tr>`;
    return;
  }

  tbody.innerHTML =
    registros
      .map((r) => {
        const produto = State.produtos.find((p) => p.id === r.produto_id);
        return `<tr>
        <td>${fmtDataHora(r.created_at)}</td>
        <td>${escapeHtml(r.usuario_nome || "—")}</td>
        <td><span class="pill ${r.acao === "excluir" ? "pill-alerta" : ""}">${rotuloAcao[r.acao] || r.acao}</span></td>
        <td>${escapeHtml(produto ? produto.descricao : (r.detalhes && r.detalhes.descricao) || r.produto_id || "—")}</td>
      </tr>`;
      })
      .join("") || `<tr><td colspan="4" class="muted">Nenhum registro de auditoria ainda.</td></tr>`;
}

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let toastTimer;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3000);
}

// PWA: registra o service worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
