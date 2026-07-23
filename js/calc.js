// ============================================================================
// CÁLCULOS — funções puras, sem dependência de UI, fáceis de testar
// ============================================================================

window.Calc = {
  temPreco(p) {
    return typeof p.valor_compra === "number" && typeof p.valor_venda === "number";
  },

  totalCompra(p) {
    return (Number(p.quantidade) || 0) * (Number(p.valor_compra) || 0);
  },

  totalVenda(p) {
    return (Number(p.quantidade) || 0) * (Number(p.valor_venda) || 0);
  },

  lucroUnidade(p) {
    if (!this.temPreco(p)) return null;
    return Number(p.valor_venda) - Number(p.valor_compra);
  },

  lucroTotal(p) {
    const lu = this.lucroUnidade(p);
    if (lu === null) return null;
    return (Number(p.quantidade) || 0) * lu;
  },

  margem(p) {
    if (!this.temPreco(p) || Number(p.valor_venda) === 0) return null;
    const lu = this.lucroUnidade(p);
    return (lu / Number(p.valor_venda)) * 100;
  },

  estoqueBaixo(p, padrao) {
    const minimo = p.estoque_minimo != null ? Number(p.estoque_minimo) : padrao;
    return Number(p.quantidade) <= minimo;
  },

  // Agrupa por fornecedor: total de compra, total de venda, lucro e
  // quantidade de produtos — usado no resumo da Área Gerencial.
  totaisPorFornecedor(produtos) {
    const mapa = new Map();
    for (const p of produtos) {
      const chave = (p.fornecedor || "Sem fornecedor").trim() || "Sem fornecedor";
      if (!mapa.has(chave)) {
        mapa.set(chave, { fornecedor: chave, produtos: 0, quantidade: 0, totalCompra: 0, totalVenda: 0, lucroTotal: 0 });
      }
      const acc = mapa.get(chave);
      acc.produtos += 1;
      acc.quantidade += Number(p.quantidade) || 0;
      acc.totalCompra += this.totalCompra(p);
      acc.totalVenda += this.totalVenda(p);
      acc.lucroTotal += this.lucroTotal(p) || 0;
    }
    return [...mapa.values()].sort((a, b) => b.totalCompra - a.totalCompra);
  },

  // KPIs agregados para o Dashboard
  resumo(produtos, estoqueBaixoPadrao) {
    const total = produtos.length;
    const fornecedores = new Set(produtos.map((p) => (p.fornecedor || "").trim().toLowerCase())).size;
    const marcas = new Set(produtos.map((p) => (p.marca || "").trim().toLowerCase())).size;
    const qtdEstoque = produtos.reduce((s, p) => s + (Number(p.quantidade) || 0), 0);

    const comPreco = produtos.filter((p) => this.temPreco(p));
    const valorInvestido = produtos.reduce((s, p) => s + this.totalCompra(p), 0);
    const valorVendaEstimado = comPreco.reduce((s, p) => s + this.totalVenda(p), 0);
    const lucroEstimado = comPreco.reduce((s, p) => s + (this.lucroTotal(p) || 0), 0);

    const margens = comPreco.map((p) => this.margem(p)).filter((m) => m !== null);
    const margemMedia = margens.length ? margens.reduce((a, b) => a + b, 0) / margens.length : 0;

    const semPreco = produtos.filter((p) => !this.temPreco(p));
    const estoqueBaixo = produtos.filter((p) => this.estoqueBaixo(p, estoqueBaixoPadrao));

    const maisLucrativos = [...comPreco]
      .sort((a, b) => (this.lucroTotal(b) || 0) - (this.lucroTotal(a) || 0))
      .slice(0, 5);

    const precoMedio = comPreco.length
      ? comPreco.reduce((s, p) => s + Number(p.valor_venda), 0) / comPreco.length
      : 0;

    const ticketMedio = total ? valorVendaEstimado / total : 0;

    const ultimasConferencias = [...produtos]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 8);

    return {
      total,
      fornecedores,
      marcas,
      qtdEstoque,
      valorInvestido,
      valorVendaEstimado,
      lucroEstimado,
      margemMedia,
      semPreco,
      estoqueBaixo,
      maisLucrativos,
      precoMedio,
      ticketMedio,
      ultimasConferencias,
    };
  },

  moeda(v) {
    if (v == null || isNaN(v)) return "—";
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  },

  percentual(v) {
    if (v == null || isNaN(v)) return "—";
    return v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
  },
};
