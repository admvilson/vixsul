/**
 * gas-shim.js — Polyfill de google.script.run usando Supabase direto no browser
 *
 * Substitua SUPABASE_URL e SUPABASE_ANON_KEY pelos valores do seu projeto:
 *   Supabase → Settings → API → Project URL  e  anon / public key
 */

const SUPABASE_URL      = 'https://sfnldcqwpwokqfjikxeu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmbmxkY3F3cHdva3FmamlreGV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4NzA2MjMsImV4cCI6MjA5ODQ0NjYyM30.HWMRAuhjEdBqS-3q-oIsRIhNaT5D6dcguT2YzSWnPvM';

// ─── Cliente Supabase (carregado via CDN no index.html) ───────────────────────
const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Mapeamento de abas ────────────────────────────────────────────────────────
const _NOME_PARA_CHAVE = {
  'Obras':'obras','Custos':'custos',
  'Faturamentos':'faturamentos','Aportes financeiros':'aportes','CAP':'cap'
};
const _ABA_NOME = {
  obras:'Obras', custos:'Custos',
  faturamentos:'Faturamentos', aportes:'Aportes financeiros', cap:'CAP'
};
const _CHAVES = ['obras','custos','faturamentos','aportes','cap'];

// ─── Funções que espelham o Código.gs ─────────────────────────────────────────

async function _getSistemaData() {
  const pacote = { obras:[], custos:[], faturamentos:[], aportes:[], cap:[], metadata:{} };

  // Busca as 5 tabelas em paralelo (antes era uma de cada vez, em sequência —
  // isso sozinho já multiplicava por 5 o tempo de qualquer atualização/sincronização).
  const resultados = await Promise.all(
    _CHAVES.map(chave => _sb.from(chave).select('*').order('id', { ascending: true }))
  );

  _CHAVES.forEach((chave, idx) => {
    const { data, error } = resultados[idx];
    if (error || !data || data.length === 0) {
      pacote[chave] = []; pacote.metadata[chave] = []; return;
    }

    const headers = Object.keys(data[0].row_data || {});
    pacote.metadata[chave] = headers;
    pacote[chave] = data.map((row, i) => ({
      rowid: row.id, visualId: i + 1, _aba: _ABA_NOME[chave],
      ...row.row_data
    }));
  });
  return pacote;
}

async function _upsertRegistro(abaNome, dados, rowId) {
  const chave = _NOME_PARA_CHAVE[abaNome] || abaNome.toLowerCase();
  const { rowid, visualId, _aba, ...rowData } = dados;

  let error;
  if (rowId && Number(rowId) > 0) {
    ({ error } = await _sb.from(chave).update({ row_data: rowData }).eq('id', Number(rowId)));
  } else {
    ({ error } = await _sb.from(chave).insert({ row_data: rowData }));
  }

  if (error) return { ok: false, msg: error.message };
  const data = await _getSistemaData();
  return { ok: true, data };
}

async function _excluirRegistro(abaNome, rowId) {
  if (!rowId || Number(rowId) <= 0) return { ok: false, msg: 'Registro inválido.' };
  const chave = _NOME_PARA_CHAVE[abaNome] || abaNome.toLowerCase();
  const { error } = await _sb.from(chave).delete().eq('id', Number(rowId));
  if (error) return { ok: false, msg: error.message };
  const data = await _getSistemaData();
  return { ok: true, data };
}

// ─── Versões "em lote": gravam/excluem SEM recarregar o sistema inteiro a cada
// chamada. Usadas pelos editores em grupo (Custos/Faturamentos/Aportes), que salvam
// várias linhas de uma vez — chamar _getSistemaData() a cada linha (como as funções
// acima fazem) multiplicava o tempo de salvar por N linhas. Aqui só grava; quem chama
// busca os dados atualizados UMA vez, no final, depois que todas as linhas terminarem. ──

async function _upsertRegistroLote(abaNome, dados, rowId) {
  const chave = _NOME_PARA_CHAVE[abaNome] || abaNome.toLowerCase();
  const { rowid, visualId, _aba, ...rowData } = dados;
  let error;
  if (rowId && Number(rowId) > 0) {
    ({ error } = await _sb.from(chave).update({ row_data: rowData }).eq('id', Number(rowId)));
  } else {
    ({ error } = await _sb.from(chave).insert({ row_data: rowData }));
  }
  if (error) return { ok: false, msg: error.message };
  return { ok: true };
}

async function _excluirRegistroLote(abaNome, rowId) {
  if (!rowId || Number(rowId) <= 0) return { ok: false, msg: 'Registro inválido.' };
  const chave = _NOME_PARA_CHAVE[abaNome] || abaNome.toLowerCase();
  const { error } = await _sb.from(chave).delete().eq('id', Number(rowId));
  if (error) return { ok: false, msg: error.message };
  return { ok: true };
}

async function _salvarComposicaoCAP(dataLancamento, tituloObra, itens, isEdicao) {
  if (isEdicao) {
    const { error } = await _sb.from('cap').delete()
      .filter('row_data->>data_lancamento', 'eq', dataLancamento)
      .filter('row_data->>titulo_obra',     'eq', tituloObra);
    if (error) return { ok: false, msg: error.message };
  }

  if (itens && itens.length > 0) {
    const linhas = itens.map(item => ({
      row_data: { data_lancamento: dataLancamento, titulo_obra: tituloObra, ...item }
    }));
    const { error } = await _sb.from('cap').insert(linhas);
    if (error) return { ok: false, msg: error.message };
  }
  return { ok: true };
}

async function _excluirComposicaoCAP(dataLancamento, tituloObra) {
  const { error } = await _sb.from('cap').delete()
    .filter('row_data->>data_lancamento', 'eq', dataLancamento)
    .filter('row_data->>titulo_obra',     'eq', tituloObra);
  if (error) return { ok: false, msg: error.message };
  return { ok: true };
}

async function _login(cpf, senha) {
  const cpfNorm   = String(cpf   || '').replace(/[.\-\s]/g, '').trim();
  const senhaTrim = String(senha  || '').trim();
  if (!cpfNorm || !senhaTrim) return { ok: false, msg: 'CPF e senha são obrigatórios.' };

  const { data, error } = await _sb.from('usuarios').select('*');
  if (error) return { ok: false, msg: 'Erro ao acessar banco de dados.' };
  if (!data || data.length === 0) return { ok: false, msg: 'Nenhum usuário cadastrado.' };

  const u = data.find(r => String(r.cpf || '').replace(/[.\-\s]/g, '').trim() === cpfNorm);
  if (!u) return { ok: false, msg: 'CPF não encontrado.' };
  if (String(u.status || 'ativo').toLowerCase() !== 'ativo')
    return { ok: false, msg: 'Usuário inativo. Entre em contato com o administrador.' };
  if (String(u.senha || '').trim() !== senhaTrim)
    return { ok: false, msg: 'Senha incorreta.' };

  return { ok: true, nome: u.nome || cpf, perfil: u.perfil || 'Usuário' };
}

// ─── Tempo real: avisa a página quando outra máquina/aba salva ou exclui algo ──
// Usa o Supabase Realtime (Postgres Changes) — não precisa de servidor extra nem de
// clicar em "Atualizar": todas as janelas abertas do sistema recebem o aviso e recarregam
// os dados sozinhas.
function subscribeRealtime(onChange) {
  const canal = _sb.channel('vixsul-mudancas');
  _CHAVES.forEach((chave) => {
    canal.on('postgres_changes', { event: '*', schema: 'public', table: chave }, () => onChange(chave));
  });
  canal.subscribe();
  return canal;
}
window.subscribeRealtime = subscribeRealtime;

// ─── Polyfill google.script.run ───────────────────────────────────────────────

const _FNS = {
  getSistemaData:       ()        => _getSistemaData(),
  upsertRegistro:       (a,b,c)   => _upsertRegistro(a,b,c),
  excluirRegistro:      (a,b)     => _excluirRegistro(a,b),
  upsertRegistroLote:   (a,b,c)   => _upsertRegistroLote(a,b,c),
  excluirRegistroLote:  (a,b)     => _excluirRegistroLote(a,b),
  salvarComposicaoCAP:  (a,b,c,d) => _salvarComposicaoCAP(a,b,c,d),
  excluirComposicaoCAP: (a,b)     => _excluirComposicaoCAP(a,b),
  login:                (a,b)     => _login(a,b)
};

window.google = {
  script: {
    get run() {
      let _ok = null, _err = null;
      const ctx = {
        withSuccessHandler(fn) { _ok  = fn; return ctx; },
        withFailureHandler(fn) { _err = fn; return ctx; }
      };
      for (const [nome, fn] of Object.entries(_FNS)) {
        ctx[nome] = (...args) => {
          fn(...args)
            .then(res  => _ok  && _ok(res))
            .catch(err => _err && _err(err));
        };
      }
      return ctx;
    }
  }
};
