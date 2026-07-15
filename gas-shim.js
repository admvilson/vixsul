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
  'Faturamentos':'faturamentos','Aportes financeiros':'aportes','CAP':'cap',
  'Orçamentos':'orcamentos','Despesas':'despesas'
};
const _ABA_NOME = {
  obras:'Obras', custos:'Custos',
  faturamentos:'Faturamentos', aportes:'Aportes financeiros', cap:'CAP',
  orcamentos:'Orçamentos', despesas:'Despesas'
};
const _CHAVES = ['obras','custos','faturamentos','aportes','cap','orcamentos','despesas'];

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
    // IMPORTANTE: espalha o item PRIMEIRO e sobrescreve data_lancamento/titulo_obra depois,
    // para que TODAS as linhas da composição fiquem com a MESMA data (a da composição). Se o
    // item trouxesse sua própria data por linha, cada linha viraria um "card" separado.
    const linhas = itens.map(item => ({
      row_data: { ...item, data_lancamento: dataLancamento, titulo_obra: tituloObra }
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

  return { ok: true, nome: u.nome || cpf, perfil: u.perfil || 'Usuário', acessos: _parseAcessos(u.acessos) };
}

// ─── Controle de acesso: gestão de usuários (tela Admin) ───────────────────────
// A coluna "acessos" guarda um JSON com a lista de módulos que o usuário pode ver
// (ex.: ["dashboard","obras","orcamentos"]). null/ausente = sem restrição (todos os
// módulos) — mantém compatível com usuários antigos até o Admin definir os acessos.
function _parseAcessos(v){
  if (v == null || v === '') return null;
  if (Array.isArray(v)) return v;
  try { const a = JSON.parse(v); return Array.isArray(a) ? a : null; } catch (e) { return null; }
}

async function _listarUsuarios() {
  const { data, error } = await _sb.from('usuarios')
    .select('id,nome,cpf,perfil,status,email,acessos').order('id', { ascending: true });
  if (error) return { ok: false, msg: error.message };
  const usuarios = (data || []).map(u => ({
    id: u.id, nome: u.nome, cpf: u.cpf, perfil: u.perfil, status: u.status,
    email: u.email || '', acessos: _parseAcessos(u.acessos)
  }));
  return { ok: true, usuarios };
}

async function _salvarUsuario(dados, id) {
  const cpf = String(dados.cpf || '').replace(/[.\-\s]/g, '').trim();
  if (!String(dados.nome || '').trim() || !cpf) return { ok: false, msg: 'Nome e CPF são obrigatórios.' };

  const payload = {
    nome: String(dados.nome).trim(),
    cpf,
    perfil: dados.perfil || 'Usuário',
    status: dados.status || 'ativo',
    email: String(dados.email || '').trim(),
    acessos: Array.isArray(dados.acessos) ? JSON.stringify(dados.acessos) : null
  };
  // Só grava a senha se veio preenchida (na edição, em branco = mantém a atual).
  if (dados.senha) payload.senha = String(dados.senha).trim();

  let error;
  if (id && Number(id) > 0) {
    ({ error } = await _sb.from('usuarios').update(payload).eq('id', Number(id)));
  } else {
    if (!dados.senha) return { ok: false, msg: 'Senha é obrigatória para um novo usuário.' };
    ({ error } = await _sb.from('usuarios').insert(payload));
  }
  if (error) return { ok: false, msg: error.message };
  return await _listarUsuarios();
}

async function _excluirUsuario(id) {
  if (!id || Number(id) <= 0) return { ok: false, msg: 'Usuário inválido.' };
  const { error } = await _sb.from('usuarios').delete().eq('id', Number(id));
  if (error) return { ok: false, msg: error.message };
  return await _listarUsuarios();
}

// ─── Recuperação/alteração de senha ────────────────────────────────────────────
async function _buscarUsuario(cpf) {
  const cpfNorm = String(cpf || '').replace(/[.\-\s]/g, '').trim();
  if (!cpfNorm) return null;
  const { data, error } = await _sb.from('usuarios').select('*');
  if (error || !data) return null;
  return data.find(r => String(r.cpf || '').replace(/[.\-\s]/g, '').trim() === cpfNorm) || null;
}

// "Esqueci a senha": só o CPF. Retorna o e-mail cadastrado (para o app enviar o código
// por e-mail via FormSubmit) — ou avisa que o CPF não tem cadastro.
async function _buscarEmailPorCpf(cpf) {
  const u = await _buscarUsuario(cpf);
  if (!u) return { ok: false, existe: false, msg: 'CPF não possui cadastro.' };
  const email = String(u.email || '').trim();
  if (!email) return { ok: true, existe: true, temEmail: false, nome: u.nome || '' };
  return { ok: true, existe: true, temEmail: true, email, nome: u.nome || '' };
}

// "Alterar senha": CPF + senha atual + nova senha.
async function _alterarSenha(cpf, senhaAtual, senhaNova) {
  const u = await _buscarUsuario(cpf);
  if (!u) return { ok: false, existe: false, msg: 'CPF não possui cadastro.' };
  if (String(u.senha || '').trim() !== String(senhaAtual || '').trim())
    return { ok: false, msg: 'A senha anterior informada está incorreta.' };
  const nova = String(senhaNova || '').trim();
  if (nova.length < 4) return { ok: false, msg: 'A nova senha deve ter ao menos 4 caracteres.' };
  const { error } = await _sb.from('usuarios').update({ senha: nova }).eq('id', u.id);
  if (error) return { ok: false, msg: error.message };
  return { ok: true, msg: 'Senha alterada com sucesso.' };
}

// Redefinição após validar o código de 6 dígitos enviado por e-mail (esqueci a senha).
async function _redefinirSenhaPorCpf(cpf, senhaNova) {
  const u = await _buscarUsuario(cpf);
  if (!u) return { ok: false, existe: false, msg: 'CPF não possui cadastro.' };
  const nova = String(senhaNova || '').trim();
  if (nova.length < 4) return { ok: false, msg: 'A nova senha deve ter ao menos 4 caracteres.' };
  const { error } = await _sb.from('usuarios').update({ senha: nova }).eq('id', u.id);
  if (error) return { ok: false, msg: error.message };
  return { ok: true, msg: 'Senha redefinida com sucesso.' };
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
  login:                (a,b)     => _login(a,b),
  listarUsuarios:       ()        => _listarUsuarios(),
  salvarUsuario:        (a,b)     => _salvarUsuario(a,b),
  excluirUsuario:       (a)       => _excluirUsuario(a),
  buscarEmailPorCpf:    (a)       => _buscarEmailPorCpf(a),
  alterarSenha:         (a,b,c)   => _alterarSenha(a,b,c),
  redefinirSenhaPorCpf: (a,b)     => _redefinirSenhaPorCpf(a,b)
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
