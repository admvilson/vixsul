/**
 * gas-shim.js — Polyfill de google.script.run usando Supabase direto no browser
 *
 * Substitua SUPABASE_URL e SUPABASE_ANON_KEY pelos valores do seu projeto:
 *   Supabase → Settings → API → Project URL  e  anon / public key
 */

const SUPABASE_URL      = 'https://sfnldcqwpwokqfjikxeu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmbmxkY3F3cHdva3FmamlreGV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4NzA2MjMsImV4cCI6MjA5ODQ0NjYyM30.HWMRAuhjEdBqS-3q-oIsRIhNaT5D6dcguT2YzSWnPvM';

// ─── Cliente Supabase (carregado via CDN no index.html) ───────────────────────
// Com a segurança ligada, o banco só atende quem apresenta o "passe" de login (JWT emitido pela função
// /api/sessao da Vercel, depois de conferir CPF/e-mail e senha no servidor). A chave pública sozinha não lê nada.
const _API_SESSAO = 'https://vixsul.vercel.app/api/sessao';
const _TOK_KEY = 'vixsul_token';
function _lerToken() { try { return JSON.parse(sessionStorage.getItem(_TOK_KEY) || 'null'); } catch (e) { return null; } }
function _tokenAtual() { const t = _lerToken(); return t && t.token && t.exp > Date.now() ? t : null; }
// um cliente só: a cada pedido ele pega o passe atual (o renovado também) — sem passe, usa a chave pública
const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { accessToken: async () => { const t = _tokenAtual(); return t ? t.token : null; } });
function _usarToken(t) { try { _sb.realtime.setAuth(t ? t.token : null); } catch (e) { } }
function _guardarToken(r) { const t = { token: r.token, exp: r.exp }; try { sessionStorage.setItem(_TOK_KEY, JSON.stringify(t)); } catch (e) { } _usarToken(t); try { localStorage.setItem('vx_seg', '1'); } catch (e) { } }
function _segLigada() { try { return localStorage.getItem('vx_seg') === '1'; } catch (e) { return false; } }
// sessão vencida (ou do modo antigo depois que a segurança foi ligada): volta para a tela de login
function _encerrarSessao(recarregar) {
  try { sessionStorage.removeItem(_TOK_KEY); sessionStorage.removeItem('vixsul_session'); } catch (e) { }
  try { delete document.documentElement.dataset.authed; } catch (e) { }
  _usarToken(null);
  if (recarregar) location.reload();
}
(function () {
  const t = _lerToken();
  if (t && t.token) { if (t.exp > Date.now()) _usarToken(t); else _encerrarSessao(false); }
  else if (_segLigada()) { try { if (sessionStorage.getItem('vixsul_session')) _encerrarSessao(false); } catch (e) { } }
})();
// chamada à função de sessão; null = segurança ainda não configurada na Vercel (segue o modo antigo)
async function _api(acao, dados) {
  const h = { 'Content-Type': 'application/json' }, t = _tokenAtual();
  if (t) h.Authorization = 'Bearer ' + t.token;
  let r;
  try { r = await _fetch0(_API_SESSAO, { method: 'POST', headers: h, body: JSON.stringify(Object.assign({ acao }, dados || {})) }); }
  catch (e) { if (_segLigada()) throw new Error('Sem conexão com o servidor de login. Confira a internet e tente de novo.'); return null; }
  let j = null; try { j = await r.json(); } catch (e) { j = null; }
  if (!j) { if (_segLigada()) throw new Error('O servidor de login não respondeu. Tente de novo em instantes.'); return null; }
  if (j.semConfig) return null;
  try { localStorage.setItem('vx_seg', '1'); } catch (e) { }
  return j;
}
// as funções do sistema na Vercel (nota fiscal, leitura de documento) recebem o passe automaticamente
const _fetch0 = window.fetch.bind(window);
window.fetch = function (u, o) {
  try {
    const url = typeof u === 'string' ? u : (u && u.url) || '', t = _tokenAtual();
    if (t && url.indexOf('https://vixsul.vercel.app/api/') === 0) { o = Object.assign({}, o || {}); const h = new Headers(o.headers || {}); if (!h.has('Authorization')) h.set('Authorization', 'Bearer ' + t.token); o.headers = h; }
  } catch (e) { }
  return _fetch0(u, o);
};
// o passe vale 12 h: é renovado sozinho enquanto o sistema está aberto
setInterval(async () => {
  const t = _tokenAtual(); if (!t || t.exp - Date.now() > 3 * 3600e3) return;
  try { const r = await _api('renovar'); if (r && r.ok) _guardarToken(r); else if (r && r.sair) _encerrarSessao(true); } catch (e) { }
}, 10 * 60e3);
window.vxSeg = {
  ligada: () => _segLigada() || !!_tokenAtual(),
  enviarCodigo: (modo, id) => _api('codigo_enviar', { modo, id }),
  conferirCodigo: (modo, id, codigo) => _api('codigo_conferir', { modo, id, codigo })
};

// ─── Mapeamento de abas ────────────────────────────────────────────────────────
const _NOME_PARA_CHAVE = {
  'Obras':'obras','Custos':'custos',
  'Faturamentos':'faturamentos','Aportes financeiros':'aportes','CAP':'cap',
  'Orçamentos':'orcamentos','Despesas':'despesas','Etapas':'etapas',
  'Imagens da Obra':'obra_imagens',
  'Medições':'medicoes','Diário de obra':'diario_obra','Documentos':'documentos','Fornecedores':'fornecedores',
  'Contratos':'contratos','Plano de ação':'acoes','Reuniões':'reunioes','Planejamento':'planejamento',
  'Arquivos':'arquivos','Pré-moldados':'premoldados'
};
const _ABA_NOME = {
  obras:'Obras', custos:'Custos',
  faturamentos:'Faturamentos', aportes:'Aportes financeiros', cap:'CAP',
  orcamentos:'Orçamentos', despesas:'Despesas', etapas:'Etapas',
  obra_imagens:'Imagens da Obra',
  medicoes:'Medições', diario_obra:'Diário de obra', documentos:'Documentos', fornecedores:'Fornecedores',
  contratos:'Contratos', acoes:'Plano de ação', reunioes:'Reuniões', planejamento:'Planejamento',
  arquivos:'Arquivos', premoldados:'Pré-moldados'
};
// Tabelas de engenharia (2026-10): ficam numa lista à parte porque dependem do SQL de
// instalação (schema.sql) — enquanto ele não roda, a leitura delas volta vazia sem afetar
// as outras, e o tempo real delas fica num canal separado (ver subscribeRealtime).
// premoldados (2026-10-24): a fábrica de peças — tabela criada pelo passo 6 (seguranca/passo-6-premoldados.sql)
const _CHAVES_ENG = ['medicoes','diario_obra','documentos','fornecedores','contratos','acoes','reunioes','planejamento','premoldados'];
const _CHAVES = ['obras','custos','faturamentos','aportes','cap','orcamentos','despesas','etapas','obra_imagens'].concat(_CHAVES_ENG);

// ─── Funções que espelham o Código.gs ─────────────────────────────────────────

async function _getSistemaData() {
  const pacote = { obras:[], custos:[], faturamentos:[], aportes:[], cap:[], metadata:{}, lixeira:{} };

  // Busca as 5 tabelas em paralelo (antes era uma de cada vez, em sequência —
  // isso sozinho já multiplicava por 5 o tempo de qualquer atualização/sincronização).
  const resultados = await Promise.all(
    _CHAVES.map(chave => _sb.from(chave).select('*').order('id', { ascending: true }))
  );

  // passe vencido (ou sessão do modo antigo depois que a segurança foi ligada): volta para o login
  if ((_segLigada() && !_tokenAtual()) || resultados.some(r => r.error && /jwt|token/i.test(String(r.error.message || '')))) { _encerrarSessao(true); return pacote; }
  _CHAVES.forEach((chave, idx) => {
    const { data, error } = resultados[idx];
    if (error || !data || data.length === 0) {
      pacote[chave] = []; pacote.metadata[chave] = []; pacote.lixeira[chave] = []; return;
    }

    const headers = Object.keys(data[0].row_data || {});
    pacote.metadata[chave] = headers;
    const todos = data.map((row, i) => ({
      rowid: row.id, visualId: i + 1, _aba: _ABA_NOME[chave],
      ...row.row_data
    }));
    // Linhas marcadas com "_lixeira_em" (uma Obra excluída, ou um lançamento que pertencia
    // a ela) ficam de fora das listas normais do sistema e só aparecem na tela da Lixeira.
    pacote[chave] = todos.filter(r => !r._lixeira_em);
    pacote.lixeira[chave] = todos.filter(r => r._lixeira_em);
  });
  _filtrarPorObras(pacote);
  return pacote;
}

// Usuário com obras marcadas (interno ou externo, que não seja administrador) só recebe o que é dessas
// obras: as próprias obras e as linhas ligadas a elas. Configurações do sistema (planejamento sem obra),
// fornecedores e as tarefas em que ele é o responsável continuam; o resto da empresa fica de fora.
function _filtrarPorObras(pacote) {
  let s = null;
  try { s = JSON.parse(sessionStorage.getItem('vixsul_session') || 'null'); } catch (e) { s = null; }
  const ids = s && Array.isArray(s.obrasPermitidas) ? s.obrasPermitidas.map(String) : [];
  if (!s || !ids.length || String(s.perfil || '').trim().toLowerCase().startsWith('admin')) return;
  const nomeObra = o => o.titulo_obra || o.nome_obra || o.titulo || '';
  pacote.obras = (pacote.obras || []).filter(o => ids.includes(String(o.rowid)));
  const nomes = new Set(pacote.obras.map(nomeObra).filter(Boolean));
  const eu = String(s.nome || '').trim().toLowerCase();
  Object.keys(pacote).forEach(ch => {
    // a fábrica de pré-moldados não pertence a obra nenhuma: quem tem acesso a ela vê tudo dela
    if (['obras', 'metadata', 'lixeira', 'fornecedores', 'premoldados'].includes(ch) || !Array.isArray(pacote[ch])) return;
    pacote[ch] = pacote[ch].filter(r => {
      const ob = r.titulo_obra || r.obra || (ch === 'orcamentos' ? r.titulo : '') || '';
      if (ob) return nomes.has(ob);
      if (ch === 'planejamento') return !['doc_gerado', 'nfse_emitida', 'obra_fiscal'].includes(r.tipo || '');
      if (ch === 'acoes') return !!eu && String(r.responsavel || r.quem || '').trim().toLowerCase() === eu;
      return false;
    });
  });
  pacote.lixeira = {};
}

// ─── Quem lançou: todo registro novo leva quem o criou (criado_por / criado_por_id). Só quem lançou — ou um
// Administrador — pode excluir; registro antigo, sem dono, continua liberado. ───
function _sessaoAtual() { try { return JSON.parse(sessionStorage.getItem('vixsul_session') || 'null'); } catch (e) { return null; } }
const _euId = s => String((s && (s.uid || s.cpf || s.email || s.nome)) || '');
const _ehAdmin = s => !!s && String(s.perfil || '').trim().toLowerCase().startsWith('admin');
function _carimbar(rowData) {
  const s = _sessaoAtual(); if (!s) return rowData;
  if (!rowData.criado_por_id) rowData.criado_por_id = _euId(s);
  if (!rowData.criado_por) rowData.criado_por = s.nome || '';
  return rowData;
}
async function _donoPermite(chave, rowId) {
  const s = _sessaoAtual(); if (!s || _ehAdmin(s)) return true;
  try {
    const { data } = await _sb.from(chave).select('row_data').eq('id', Number(rowId)).maybeSingle();
    const dono = data && data.row_data && data.row_data.criado_por_id;
    return !dono || [s.uid, s.cpf, s.email, s.nome].filter(Boolean).map(String).includes(String(dono));
  } catch (e) { return true; }
}
// Ao editar, a tela às vezes manda a linha sem os campos de quem lançou: busca no banco para não perder o dono.
async function _manterDono(chave, rowId, rowData) {
  if (rowData.criado_por_id) return rowData;
  try {
    const { data } = await _sb.from(chave).select('row_data').eq('id', Number(rowId)).maybeSingle();
    const rd = data && data.row_data;
    if (rd && rd.criado_por_id) { rowData.criado_por_id = rd.criado_por_id; rowData.criado_por = rd.criado_por || ''; }
  } catch (e) { /* sem dono: segue */ }
  return rowData;
}
const _MSG_DONO = 'Só quem lançou (ou um Administrador) pode excluir.';

async function _upsertRegistro(abaNome, dados, rowId) {
  const chave = _NOME_PARA_CHAVE[abaNome] || abaNome.toLowerCase();
  const { rowid, visualId, _aba, ...rowData } = dados;

  let error;
  if (rowId && Number(rowId) > 0) {
    ({ error } = await _sb.from(chave).update({ row_data: await _manterDono(chave, rowId, rowData) }).eq('id', Number(rowId)));
  } else {
    ({ error } = await _sb.from(chave).insert({ row_data: _carimbar(rowData) }));
  }

  if (error) return { ok: false, msg: error.message };
  const data = await _getSistemaData();
  return { ok: true, data };
}

async function _excluirRegistro(abaNome, rowId) {
  if (!rowId || Number(rowId) <= 0) return { ok: false, msg: 'Registro inválido.' };
  const chave = _NOME_PARA_CHAVE[abaNome] || abaNome.toLowerCase();
  if (!(await _donoPermite(chave, rowId))) return { ok: false, msg: _MSG_DONO };
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
    // desenho já no Storage: a tela devolve o conteúdo remontado — não grava de novo no banco
    if (chave === 'arquivos' && rowData.conteudo_st && /^data:/.test(rowData.conteudo || '')) rowData.conteudo = '';
    ({ error } = await _sb.from(chave).update({ row_data: await _manterDono(chave, rowId, rowData) }).eq('id', Number(rowId)));
  } else {
    // conteúdo pesado (parte de anexo, desenho do projeto) vai para o Storage; o banco fica só com o cabeçalho
    if (chave === 'arquivos' && (await _arquivoParaStorage(rowData)) === 'ok') return { ok: true };
    ({ error } = await _sb.from(chave).insert({ row_data: chave === 'arquivos' && rowData.tipo === 'anexo_parte' ? rowData : _carimbar(rowData) }));
  }
  if (error) return { ok: false, msg: error.message };
  return { ok: true };
}

// ─── Storage do Supabase: o conteúdo pesado dos arquivos fica FORA do banco (passo 5 do SQL) ───
// Partes dos anexos (documentos, notas, fotos do diário) → anexos/p/<anexo_uid>/<ordem> (binário);
// desenhos do projeto → anexos/d/<nome>. A linha da tabela "arquivos" guarda só o cabeçalho.
// Sem o Storage pronto, tudo continua no banco como antes; o que já está no banco continua sendo lido.
const _BUCKET = 'anexos';
let _stOk = null;
const _B64 = /^[A-Za-z0-9+/]*={0,2}$/;
const _stSeguro = s => String(s || '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120);
const _stParte = (uid, ordem) => `p/${_stSeguro(uid)}/${String(+ordem || 0).padStart(4, '0')}`;
function _b64ParaBytes(b64) { const s = atob(String(b64 || '')), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
function _bytesParaB64(u) { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
async function _storagePronto() {
  if (_stOk !== null) return _stOk;
  if (_segLigada() && !_tokenAtual()) return false;
  try { const { error } = await _sb.storage.from(_BUCKET).list('', { limit: 1 }); _stOk = !error; } catch (e) { _stOk = false; }
  return _stOk;
}
async function _stEnviar(caminho, bytes, tipo) {
  try {
    const t = tipo || 'application/octet-stream';
    const { error } = await _sb.storage.from(_BUCKET).upload(caminho, new Blob([bytes], { type: t }), { upsert: true, contentType: t });
    return !error;
  } catch (e) { return false; }
}
async function _stBaixar(caminho) {
  const { data, error } = await _sb.storage.from(_BUCKET).download(caminho);
  if (error || !data) throw new Error('Não consegui ler o arquivo guardado (' + ((error && error.message) || 'sem conteúdo') + ').');
  return new Uint8Array(await data.arrayBuffer());
}
async function _stListar(pasta) {
  const L = [];
  for (let off = 0; ; off += 1000) {
    const { data, error } = await _sb.storage.from(_BUCKET).list(pasta, { limit: 1000, offset: off, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error(error.message);
    L.push(...(data || [])); if (!data || data.length < 1000) break;
  }
  return L;
}
async function _stApagar(caminhos) {
  const c = (caminhos || []).filter(Boolean);
  for (let i = 0; i < c.length; i += 100) { try { await _sb.storage.from(_BUCKET).remove(c.slice(i, i + 100)); } catch (e) { /* sobra no Storage não atrapalha */ } }
}
const _stNomeDesenho = mime => `d/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}.${/png/i.test(mime) ? 'png' : 'jpg'}`;
// 'ok' = parte guardada no Storage (nada vai para o banco); desenho: troca o conteúdo pelo caminho no Storage
async function _arquivoParaStorage(d) {
  if (!(await _storagePronto())) return '';
  if (d.tipo === 'anexo_parte' && d.anexo_uid && _B64.test(d.conteudo || ''))
    return (await _stEnviar(_stParte(d.anexo_uid, d.ordem), _b64ParaBytes(d.conteudo))) ? 'ok' : '';
  const m = d.tipo === 'projeto' && String(d.conteudo || '').match(/^data:([^;,]+);base64,(.*)$/);
  if (m && _B64.test(m[2])) { const cam = _stNomeDesenho(m[1]); if (await _stEnviar(cam, _b64ParaBytes(m[2]), m[1])) { d.conteudo_st = cam; d.conteudo = ''; } }
  return '';
}
// leva para o Storage, aos poucos, o que ainda está dentro do banco (a tela chama de novo até zerar)
async function _moverAnexosLote() {
  if (!(await _storagePronto())) return { ok: false, msg: 'O Storage ainda não está pronto: rode o passo 5 no Supabase (seguranca/passo-5-storage.sql).' };
  let movidos = 0;
  const { data: ps, error: e1 } = await _sb.from('arquivos').select('id,row_data').eq('row_data->>tipo', 'anexo_parte').order('id', { ascending: true }).limit(6);
  if (e1) return { ok: false, msg: e1.message };
  for (const r of ps || []) {
    const d = r.row_data || {};
    if (!d.anexo_uid || !_B64.test(d.conteudo || '')) continue;
    if (!(await _stEnviar(_stParte(d.anexo_uid, d.ordem), _b64ParaBytes(d.conteudo)))) return { ok: false, msg: 'Não consegui enviar um arquivo ao Storage. Tente de novo.' };
    const { error } = await _sb.from('arquivos').delete().eq('id', r.id);
    if (error) return { ok: false, msg: error.message };
    movidos++;
  }
  if (!movidos) {
    const { data: pj, error: e2 } = await _sb.from('arquivos').select('id,row_data').eq('row_data->>tipo', 'projeto').like('row_data->>conteudo', 'data:%').order('id', { ascending: true }).limit(4);
    if (e2) return { ok: false, msg: e2.message };
    for (const r of pj || []) {
      const d = { ...(r.row_data || {}) }, m = String(d.conteudo || '').match(/^data:([^;,]+);base64,(.*)$/);
      if (!m || !_B64.test(m[2])) continue;
      const cam = _stNomeDesenho(m[1]);
      if (!(await _stEnviar(cam, _b64ParaBytes(m[2]), m[1]))) return { ok: false, msg: 'Não consegui enviar um desenho ao Storage. Tente de novo.' };
      d.conteudo_st = cam; d.conteudo = '';
      const { error } = await _sb.from('arquivos').update({ row_data: d }).eq('id', r.id);
      if (error) { await _stApagar([cam]); return { ok: false, msg: error.message }; }
      movidos++;
    }
  }
  return { ok: true, movidos, restam: await _pendentesStorage() };
}
async function _pendentesStorage() {
  const a = await _sb.from('arquivos').select('id', { count: 'exact', head: true }).eq('row_data->>tipo', 'anexo_parte');
  const b = await _sb.from('arquivos').select('id', { count: 'exact', head: true }).eq('row_data->>tipo', 'projeto').like('row_data->>conteudo', 'data:%');
  return (a.count || 0) + (b.count || 0);
}
// espaço usado (só o Administrador): banco, tabela de arquivos, auditoria e Storage
async function _espacoUsado() {
  const { data, error } = await _sb.rpc('vx_espaco');
  if (error) return { ok: false, msg: /vx_espaco|function|does not exist|schema cache/i.test(error.message) ? 'Rode o passo 5 no Supabase (seguranca/passo-5-storage.sql) para ver o espaço usado.' : error.message };
  if (!data) return { ok: false, msg: 'Só o Administrador vê o espaço usado.' };
  let pendentes = 0; try { pendentes = await _pendentesStorage(); } catch (e) { }
  return { ok: true, ...data, pendentes, storagePronto: await _storagePronto() };
}
// cópia de segurança: os arquivos do Storage (caminho → conteúdo em base64)
async function _exportarStorage() {
  if (!(await _storagePronto())) return { ok: true, arquivos: {} };
  try {
    const cams = [], arq = o => o.id && o.name !== '.emptyFolderPlaceholder';
    for (const p of (await _stListar('p')).filter(o => !o.id)) (await _stListar('p/' + p.name)).filter(arq).forEach(o => cams.push(`p/${p.name}/${o.name}`));
    (await _stListar('d')).filter(arq).forEach(o => cams.push('d/' + o.name));
    const out = {};
    for (let i = 0; i < cams.length; i += 6) await Promise.all(cams.slice(i, i + 6).map(async c => { out[c] = _bytesParaB64(await _stBaixar(c)); }));
    return { ok: true, arquivos: out };
  } catch (e) { return { ok: false, msg: 'Arquivos do Storage: ' + e.message }; }
}


async function _excluirRegistroLote(abaNome, rowId) {
  if (!rowId || Number(rowId) <= 0) return { ok: false, msg: 'Registro inválido.' };
  const chave = _NOME_PARA_CHAVE[abaNome] || abaNome.toLowerCase();
  if (!(await _donoPermite(chave, rowId))) return { ok: false, msg: _MSG_DONO };
  let st = '';
  if (chave === 'arquivos') { try { const { data: r0 } = await _sb.from('arquivos').select('st:row_data->>conteudo_st').eq('id', Number(rowId)).maybeSingle(); st = (r0 && r0.st) || ''; } catch (e) { } }
  const { error } = await _sb.from(chave).delete().eq('id', Number(rowId));
  if (error) return { ok: false, msg: error.message };
  if (st) await _stApagar([st]);
  return { ok: true };
}


// Arquivos (desenhos do projeto e as frentes marcadas neles): ficam fora do carregamento
// geral do sistema — só são lidos, por obra, quando a tela de Planejamento abre.
async function _listarArquivos(obra) {
  // as PARTES dos anexos (conteúdo pesado) ficam de fora: só são lidas ao abrir o anexo (_partesAnexo)
  const { data, error } = await _sb.from('arquivos').select('id,row_data').eq('row_data->>titulo_obra', String(obra || ''))
    .or('row_data->>tipo.is.null,row_data->>tipo.neq.anexo_parte').order('id', { ascending: true });
  if (error) return { ok: false, msg: error.message };
  const itens = (data || []).map(r => ({ rowid: r.id, ...r.row_data }));
  await Promise.all(itens.filter(x => x.conteudo_st && !x.conteudo).map(async x => {
    try { x.conteudo = `data:${x.mime || 'image/jpeg'};base64,` + _bytesParaB64(await _stBaixar(x.conteudo_st)); } catch (e) { x.erro_st = e.message; }
  }));
  return { ok: true, itens };
}


// Anexos das abas da obra (Orçamento, CAP, Contrato, Medição): o documento vai em partes (base64) na
// tabela arquivos — linha 'anexo' = cabeçalho (nome, tipo, tamanho, quem enviou); linhas 'anexo_parte' =
// conteúdo, ligadas pelo anexo_uid. A lista só lê os cabeçalhos.
async function _listarAnexos(obra) {
  const { data, error } = await _sb.from('arquivos').select('id,row_data').eq('row_data->>titulo_obra', String(obra || ''))
    .eq('row_data->>tipo', 'anexo').order('id', { ascending: true });
  if (error) return { ok: false, msg: error.message };
  return { ok: true, itens: (data || []).map(r => ({ rowid: r.id, ...r.row_data })) };
}
async function _partesAnexo(uid) {
  const { data, error } = await _sb.from('arquivos').select('id,row_data').eq('row_data->>anexo_uid', String(uid || ''))
    .order('id', { ascending: true });
  if (error) return { ok: false, msg: error.message };
  let partes = (data || []).map(r => ({ rowid: r.id, ordem: +r.row_data.ordem || 0, conteudo: r.row_data.conteudo || '' }));
  if (uid && await _storagePronto()) {
    try {
      const pasta = 'p/' + _stSeguro(uid), objs = (await _stListar(pasta)).filter(o => o.id && /^\d+$/.test(o.name));
      if (objs.length) {
        const st = await Promise.all(objs.map(async o => ({ rowid: null, ordem: parseInt(o.name, 10), conteudo: _bytesParaB64(await _stBaixar(`${pasta}/${o.name}`)) })));
        const tem = new Set(st.map(p => p.ordem)); partes = st.concat(partes.filter(p => !tem.has(p.ordem)));
      }
    } catch (e) { if (!partes.length) return { ok: false, msg: e.message }; }
  }
  return { ok: true, partes: partes.sort((a, b) => a.ordem - b.ordem) };
}

async function _excluirAnexo(uid, rowid) {
  if (!uid) return { ok: false, msg: 'Anexo inválido.' };
  let r = await _sb.from('arquivos').delete().eq('row_data->>anexo_uid', String(uid));
  if (r.error) return { ok: false, msg: r.error.message };
  if (await _storagePronto()) { try { const pasta = 'p/' + _stSeguro(uid); await _stApagar((await _stListar(pasta)).filter(o => o.id).map(o => `${pasta}/${o.name}`)); } catch (e) { } }

  if (rowid) { r = await _sb.from('arquivos').delete().eq('id', Number(rowid)); if (r.error) return { ok: false, msg: r.error.message }; }
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
      row_data: _carimbar({ ...item, data_lancamento: dataLancamento, titulo_obra: tituloObra })
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

// ─── Hash de senha (PBKDF2-SHA256 via Web Crypto API — nativo do navegador, sem libs) ──
// Formato armazenado: "pbkdf2$<iterações>$<saltBase64>$<hashBase64>". Senhas antigas em
// texto puro (de antes desta atualização) continuam sendo aceitas no login — no primeiro
// login bem-sucedido com uma senha "legada", ela é migrada para hash automaticamente e em
// silêncio (o usuário não percebe nada, só passa a estar protegido a partir dali).
const _PBKDF2_ITERACOES = 100000;
function _bufParaB64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
function _b64ParaBuf(b64) { return Uint8Array.from(atob(b64), c => c.charCodeAt(0)); }
async function _pbkdf2(senha, saltBytes, iteracoes) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(senha), { name: 'PBKDF2' }, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations: iteracoes, hash: 'SHA-256' }, keyMaterial, 256);
  return _bufParaB64(bits);
}
async function _hashSenha(senhaPlana) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await _pbkdf2(senhaPlana, salt, _PBKDF2_ITERACOES);
  return 'pbkdf2$' + _PBKDF2_ITERACOES + '$' + _bufParaB64(salt) + '$' + hash;
}
async function _verificarSenha(senhaPlana, armazenada) {
  const s = String(armazenada || '');
  if (!s.startsWith('pbkdf2$')) {
    // Senha legada (texto puro, de antes do hash) — compara direto.
    return { ok: s === String(senhaPlana || '').trim(), legado: true };
  }
  const partes = s.split('$');
  if (partes.length !== 4) return { ok: false, legado: false };
  const iteracoes = Number(partes[1]) || _PBKDF2_ITERACOES;
  const salt = _b64ParaBuf(partes[2]);
  const hashCalculado = await _pbkdf2(senhaPlana, salt, iteracoes);
  return { ok: hashCalculado === partes[3], legado: false };
}

// CPF do administrador permanente do sistema: sempre Interno, sempre Administrador,
// com acesso a TODAS as seções — independente do que estiver salvo no banco (protege
// contra edição acidental que tire o acesso desse usuário).
const _SUPER_ADMIN_CPF = '05582376577';

function _aposEntrar(r) {
  if (!r.ok) return { ok: false, msg: r.msg || 'Não foi possível entrar.', precisaCodigo: !!r.precisaCodigo };
  _guardarToken(r);
  return Object.assign({ ok: true, senhaFraca: !!r.senhaFraca }, r.sessao);
}
// codigo2 = código do aplicativo autenticador (verificação em duas etapas), quando a conta tem
async function _login(cpf, senha, codigo2) {
  const r = await _api('entrar', { modo: 'interno', cpf, senha, codigo2: codigo2 || '' });
  return r ? _aposEntrar(r) : _loginLegado(cpf, senha);
}
async function _loginExterno(email, senha, codigo2) {
  const r = await _api('entrar', { modo: 'externo', email, senha, codigo2: codigo2 || '' });
  return r ? _aposEntrar(r) : _loginExternoLegado(email, senha);
}
// ─── Segurança (tela do Administrador) ───
// ações do servidor de login (duas etapas, desligar de outro usuário)
async function _seguranca(acao, dados) {
  if (!/^(mfa_estado|mfa_iniciar|mfa_confirmar|mfa_desligar|usuarios_mfa_desligar)$/.test(String(acao))) return { ok: false, msg: 'Ação inválida.' };
  const r = await _api(acao, dados); return r || { ok: false, msg: 'A segurança ainda não está ligada.' };
}
const _TAB_DADOS = () => _CHAVES.concat(['arquivos']);
// auditoria: o banco só entrega ao Administrador
async function _listarAuditoria(f) {
  f = f || {};
  let q = _sb.from('auditoria').select('*').order('quando', { ascending: false }).limit(Math.min(+f.limite || 400, 2000));
  if (f.de) q = q.gte('quando', f.de); if (f.ate) q = q.lte('quando', f.ate);
  if (f.tabela) q = q.eq('tabela', f.tabela); if (f.acao) q = q.eq('acao', f.acao); if (f.quem) q = q.eq('quem_nome', f.quem);
  const { data, error } = await q;
  if (error) return { ok: false, msg: /auditoria|relation|does not exist/i.test(error.message) ? 'A auditoria começa a funcionar depois do passo 2 da segurança.' : error.message };
  return { ok: true, itens: data || [] };
}
// desfaz pela auditoria: exclusão → o registro volta; alteração → volta ao conteúdo de antes
async function _restaurarAuditoria(id) {
  const { data: a, error } = await _sb.from('auditoria').select('*').eq('id', Number(id)).maybeSingle();
  if (error || !a) return { ok: false, msg: 'Registro da auditoria não encontrado.' };
  if (!a.antes || a.antes._grande) return { ok: false, msg: 'Não ficou cópia do conteúdo anterior (registro muito grande).' };
  if (!_TAB_DADOS().includes(a.tabela)) return { ok: false, msg: 'Esta tabela não pode ser restaurada por aqui.' };
  let e;
  if (a.acao === 'DELETE') ({ error: e } = await _sb.from(a.tabela).insert({ row_data: a.antes }));
  else if (a.acao === 'UPDATE') {
    let rd = a.antes;
    // auditoria enxuta (passo 4): só ficaram os campos que mudaram — volta só eles, no registro como está hoje
    if (a.parcial) {
      const { data: cur, error: e1 } = await _sb.from(a.tabela).select('row_data').eq('id', Number(a.registro)).maybeSingle();
      if (e1 || !cur) return { ok: false, msg: 'O registro não existe mais — desfaça antes a exclusão dele.' };
      const { _sem, _id, ...velhos } = a.antes;
      rd = { ...(cur.row_data || {}), ...velhos };
      (_sem || []).forEach(k => { delete rd[k]; });
    }
    ({ error: e } = await _sb.from(a.tabela).update({ row_data: rd }).eq('id', Number(a.registro)));
  }
  else return { ok: false, msg: 'Só dá para desfazer alterações e exclusões.' };
  if (e) return { ok: false, msg: e.message };
  return { ok: true };
}
// cópia de segurança: a tabela inteira, de 1000 em 1000 linhas
async function _exportarTabela(chave) {
  if (!_TAB_DADOS().includes(chave)) return { ok: false, msg: 'Tabela inválida.' };
  const L = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await _sb.from(chave).select('id,row_data').order('id', { ascending: true }).range(i, i + 999);
    if (error) return { ok: false, msg: error.message };
    L.push(...(data || [])); if (!data || data.length < 1000) break;
  }
  return { ok: true, linhas: L };
}
async function _loginLegado(cpf, senha) {
  const cpfNorm   = String(cpf   || '').replace(/[.\-\s]/g, '').trim();
  const senhaTrim = String(senha  || '').trim();
  if (!cpfNorm || !senhaTrim) return { ok: false, msg: 'CPF e senha são obrigatórios.' };

  const { data, error } = await _sb.from('usuarios').select('*');
  if (error) return { ok: false, msg: 'Erro ao acessar banco de dados.' };
  if (!data || data.length === 0) return { ok: false, msg: 'Nenhum usuário cadastrado.' };

  const u = data.find(r => String(r.cpf || '').replace(/[.\-\s]/g, '').trim() === cpfNorm);
  if (!u) return { ok: false, msg: 'Usuário não encontrado.' };
  const ehSuperAdmin = cpfNorm === _SUPER_ADMIN_CPF;
  if (String(u.status || 'ativo').toLowerCase() !== 'ativo' && !ehSuperAdmin)
    return { ok: false, msg: 'Usuário inativo. Entre em contato com o administrador.' };
  // Usuário externo entra pelo CPF/e-mail? Não — externo é só por e-mail, na outra aba.
  if (!ehSuperAdmin && String(u.tipo_usuario || 'interno').toLowerCase() === 'externo')
    return { ok: false, msg: 'Este usuário deve entrar pela opção "Usuário Externo".' };

  const verif = await _verificarSenha(senhaTrim, u.senha);
  if (!verif.ok) return { ok: false, msg: 'Senha incorreta.' };

  // Migração silenciosa: senha antiga em texto puro vira hash assim que loga com sucesso.
  if (verif.legado) {
    const novoHash = await _hashSenha(senhaTrim);
    await _sb.from('usuarios').update({ senha: novoHash }).eq('id', u.id);
  }

  if (ehSuperAdmin) return { ok: true, nome: u.nome || cpf, perfil: 'admin', acessos: null, tipoUsuario: 'interno' };
  return { ok: true, nome: u.nome || cpf, perfil: u.perfil || 'Usuário', acessos: _parseAcessos(u.acessos), tipoUsuario: 'interno', obrasPermitidas: _parseAcessos(u.obras_permitidas) || [] };
}

// Usuário Externo: entra com E-MAIL + senha (não tem CPF cadastrado pra digitar) e,
// independente do que estiver salvo em "acessos", só enxerga o módulo Obras — a tela
// de Obras, por sua vez, restringe ainda mais e mostra só a aba Avanço & Gantt (ver
// UI._obraHubRenderTabs no index.html). Só loga quem estiver marcado tipo_usuario='externo',
// pra não misturar com a conta interna da mesma pessoa (se ela tiver as duas).
async function _loginExternoLegado(email, senha) {
  const emailNorm = String(email || '').trim().toLowerCase();
  const senhaTrim = String(senha || '').trim();
  if (!emailNorm || !senhaTrim) return { ok: false, msg: 'E-mail e senha são obrigatórios.' };

  const { data, error } = await _sb.from('usuarios').select('*');
  if (error) return { ok: false, msg: 'Erro ao acessar banco de dados.' };
  if (!data || data.length === 0) return { ok: false, msg: 'Nenhum usuário cadastrado.' };

  const u = data.find(r => String(r.email || '').trim().toLowerCase() === emailNorm
    && String(r.tipo_usuario || 'interno').toLowerCase() === 'externo');
  if (!u) return { ok: false, msg: 'Usuário não encontrado.' };
  if (String(u.status || 'ativo').toLowerCase() !== 'ativo')
    return { ok: false, msg: 'Usuário inativo. Entre em contato com o administrador.' };

  const verif = await _verificarSenha(senhaTrim, u.senha);
  if (!verif.ok) return { ok: false, msg: 'Senha incorreta.' };

  if (verif.legado) {
    const novoHash = await _hashSenha(senhaTrim);
    await _sb.from('usuarios').update({ senha: novoHash }).eq('id', u.id);
  }

  return { ok: true, nome: u.nome || email, perfil: 'Usuário Externo', acessos: ['obras', 'relatorios'], tipoUsuario: 'externo', obrasPermitidas: _parseAcessos(u.obras_permitidas) || [] };
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
  if (_tokenAtual()) { const r = await _api('usuarios_listar'); if (r) return r; }
  const { data, error } = await _sb.from('usuarios')
    .select('id,nome,cpf,perfil,status,email,acessos,tipo_usuario,obras_permitidas').order('id', { ascending: true });
  if (error) return { ok: false, msg: error.message };
  const usuarios = (data || []).map(u => ({
    id: u.id, nome: u.nome, cpf: u.cpf, perfil: u.perfil, status: u.status,
    email: u.email || '', acessos: _parseAcessos(u.acessos),
    tipoUsuario: String(u.tipo_usuario || 'interno').toLowerCase() === 'externo' ? 'externo' : 'interno',
    obrasPermitidas: _parseAcessos(u.obras_permitidas) || []
  }));
  return { ok: true, usuarios };
}

async function _salvarUsuario(dados, id) {
  if (_tokenAtual()) { const r = await _api('usuarios_salvar', { dados, id }); if (r) return r; }
  let tipoUsuario = dados.tipoUsuario === 'externo' ? 'externo' : 'interno';
  let cpf = String(dados.cpf || '').replace(/[.\-\s]/g, '').trim();
  const email = String(dados.email || '').trim();
  const emailNorm = email.toLowerCase();
  if (!String(dados.nome || '').trim()) return { ok: false, msg: 'Nome é obrigatório.' };
  if (tipoUsuario === 'interno' && !cpf) return { ok: false, msg: 'CPF é obrigatório para Usuário Interno.' };
  if (!email) return { ok: false, msg: 'E-mail é obrigatório.' };
  const obrasPermitidas = Array.isArray(dados.obrasPermitidas) ? dados.obrasPermitidas : [];
  if (tipoUsuario === 'externo' && obrasPermitidas.length === 0)
    return { ok: false, msg: 'Selecione ao menos uma obra que o Usuário Externo pode acessar.' };

  // CPF do administrador permanente: nunca pode virar Externo nem perder o perfil admin,
  // mesmo que o formulário tenha sido enviado com outros valores por engano.
  let perfil = dados.perfil || 'Usuário';
  if (cpf === _SUPER_ADMIN_CPF) { tipoUsuario = 'interno'; perfil = 'admin'; }

  // Não pode haver dois usuários com o mesmo CPF nem dois com o mesmo e-mail.
  const { data: existentes, error: errBusca } = await _sb.from('usuarios').select('id,cpf,email');
  if (errBusca) return { ok: false, msg: errBusca.message };
  const idAtual = id ? Number(id) : null;
  if (tipoUsuario === 'interno' && cpf) {
    const dupCpf = (existentes || []).some(r => Number(r.id) !== idAtual && String(r.cpf || '').replace(/[.\-\s]/g, '').trim() === cpf);
    if (dupCpf) return { ok: false, msg: 'Já existe um usuário cadastrado com este CPF.' };
  }
  const dupEmail = (existentes || []).some(r => Number(r.id) !== idAtual && String(r.email || '').trim().toLowerCase() === emailNorm);
  if (dupEmail) return { ok: false, msg: 'Já existe um usuário cadastrado com este e-mail.' };

  const payload = {
    nome: String(dados.nome).trim(),
    cpf: tipoUsuario === 'interno' ? cpf : null, // Externo entra por e-mail, não tem CPF cadastrado.
    perfil,
    status: dados.status || 'ativo',
    email,
    acessos: tipoUsuario === 'externo' ? JSON.stringify(['obras', 'relatorios']) : (Array.isArray(dados.acessos) ? JSON.stringify(dados.acessos) : null),
    tipo_usuario: tipoUsuario,
    obras_permitidas: (tipoUsuario === 'externo' || (obrasPermitidas.length && perfil !== 'admin')) ? JSON.stringify(obrasPermitidas) : null
  };
  // Só grava a senha se veio preenchida (na edição, em branco = mantém a atual). Sempre
  // gravada como hash, nunca em texto puro.
  if (dados.senha) payload.senha = await _hashSenha(String(dados.senha).trim());

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
  if (_tokenAtual()) { const r = await _api('usuarios_excluir', { id }); if (r) return r; }
  if (!id || Number(id) <= 0) return { ok: false, msg: 'Usuário inválido.' };
  const { error } = await _sb.from('usuarios').delete().eq('id', Number(id));
  if (error) return { ok: false, msg: error.message };
  return await _listarUsuarios();
}

// ─── Recuperação/alteração de senha ────────────────────────────────────────────
// Usuário Interno: fluxo por CPF (como era antes) — localiza o e-mail cadastrado
// para aquele CPF, o app pede confirmação ("é este seu e-mail?") antes de enviar o código.
async function _buscarUsuario(cpf) {
  const cpfNorm = String(cpf || '').replace(/[.\-\s]/g, '').trim();
  if (!cpfNorm) return null;
  const { data, error } = await _sb.from('usuarios').select('*');
  if (error || !data) return null;
  // Só considera cadastros de Usuário Interno — Externo não tem CPF, então isso também
  // impede que um CPF equivocadamente salvo numa linha "externo" seja usado aqui.
  return data.find(r => String(r.cpf || '').replace(/[.\-\s]/g, '').trim() === cpfNorm
    && String(r.tipo_usuario || 'interno').toLowerCase() === 'interno') || null;
}

async function _buscarEmailPorCpf(cpf) {
  { const r = await _api('email_cpf', { cpf }); if (r) return r; }
  const u = await _buscarUsuario(cpf);
  if (!u) return { ok: false, existe: false, msg: 'CPF não possui cadastro.' };
  const email = String(u.email || '').trim();
  if (!email) return { ok: true, existe: true, temEmail: false, nome: u.nome || '' };
  return { ok: true, existe: true, temEmail: true, email, nome: u.nome || '' };
}

// "Alterar senha" (Interno): CPF + senha atual + nova senha.
async function _alterarSenhaPorCpf(cpf, senhaAtual, senhaNova) {
  { const r = await _api('senha_alterar', { modo: 'interno', id: cpf, atual: senhaAtual, nova: senhaNova }); if (r) return r; }
  const u = await _buscarUsuario(cpf);
  if (!u) return { ok: false, existe: false, msg: 'CPF não possui cadastro.' };
  const verif = await _verificarSenha(String(senhaAtual || '').trim(), u.senha);
  if (!verif.ok)
    return { ok: false, msg: 'A senha anterior informada está incorreta.' };
  const nova = String(senhaNova || '').trim();
  if (nova.length < 4) return { ok: false, msg: 'A nova senha deve ter ao menos 4 caracteres.' };
  const hash = await _hashSenha(nova);
  const { error } = await _sb.from('usuarios').update({ senha: hash }).eq('id', u.id);
  if (error) return { ok: false, msg: error.message };
  return { ok: true, msg: 'Senha alterada com sucesso.' };
}

// Redefinição (Interno) após validar o código de 6 dígitos enviado por e-mail.
async function _redefinirSenhaPorCpf(cpf, senhaNova, ticket) {
  if (ticket) { const r = await _api('senha_redefinir', { ticket, nova: senhaNova }); if (r) return r; }
  if (_segLigada()) return { ok: false, msg: 'Peça um novo código para trocar a senha.' };
  const u = await _buscarUsuario(cpf);
  if (!u) return { ok: false, existe: false, msg: 'CPF não possui cadastro.' };
  const nova = String(senhaNova || '').trim();
  if (nova.length < 4) return { ok: false, msg: 'A nova senha deve ter ao menos 4 caracteres.' };
  const hash = await _hashSenha(nova);
  const { error } = await _sb.from('usuarios').update({ senha: hash }).eq('id', u.id);
  if (error) return { ok: false, msg: error.message };
  return { ok: true, msg: 'Senha redefinida com sucesso.' };
}

// Usuário Externo: fluxo por e-mail (é como ele faz login, não tem CPF cadastrado).
// Só considera cadastros de Usuário Externo — impede alterar/redefinir a senha de um
// Usuário Interno por aqui mesmo que alguém saiba o e-mail dele.
async function _buscarUsuarioPorEmail(email) {
  const emailNorm = String(email || '').trim().toLowerCase();
  if (!emailNorm) return null;
  const { data, error } = await _sb.from('usuarios').select('*');
  if (error || !data) return null;
  return data.find(r => String(r.email || '').trim().toLowerCase() === emailNorm
    && String(r.tipo_usuario || 'interno').toLowerCase() === 'externo') || null;
}

// "Esqueci a senha" (Externo): confirma que existe um cadastro de Usuário Externo
// (tipo_usuario='externo') com esse e-mail antes de enviar o código.
async function _buscarUsuarioExternoPorEmail(email) {
  { const r = await _api('externo_existe', { email }); if (r) return r; }
  const u = await _buscarUsuarioPorEmail(email);
  if (!u || String(u.tipo_usuario || 'interno').toLowerCase() !== 'externo')
    return { ok: true, existe: false, msg: 'E-mail não possui cadastro de Usuário Externo.' };
  return { ok: true, existe: true, nome: u.nome || '' };
}

// "Alterar senha" (Externo): e-mail + senha atual + nova senha.
async function _alterarSenhaPorEmail(email, senhaAtual, senhaNova) {
  { const r = await _api('senha_alterar', { modo: 'externo', id: email, atual: senhaAtual, nova: senhaNova }); if (r) return r; }
  const u = await _buscarUsuarioPorEmail(email);
  if (!u) return { ok: false, existe: false, msg: 'E-mail não possui cadastro.' };
  const verif = await _verificarSenha(String(senhaAtual || '').trim(), u.senha);
  if (!verif.ok)
    return { ok: false, msg: 'A senha anterior informada está incorreta.' };
  const nova = String(senhaNova || '').trim();
  if (nova.length < 4) return { ok: false, msg: 'A nova senha deve ter ao menos 4 caracteres.' };
  const hash = await _hashSenha(nova);
  const { error } = await _sb.from('usuarios').update({ senha: hash }).eq('id', u.id);
  if (error) return { ok: false, msg: error.message };
  return { ok: true, msg: 'Senha alterada com sucesso.' };
}

// Redefinição após validar o código de 6 dígitos enviado por e-mail (esqueci a senha).
async function _redefinirSenhaPorEmail(email, senhaNova, ticket) {
  if (ticket) { const r = await _api('senha_redefinir', { ticket, nova: senhaNova }); if (r) return r; }
  if (_segLigada()) return { ok: false, msg: 'Peça um novo código para trocar a senha.' };
  const u = await _buscarUsuarioPorEmail(email);
  if (!u) return { ok: false, existe: false, msg: 'E-mail não possui cadastro.' };
  const nova = String(senhaNova || '').trim();
  if (nova.length < 4) return { ok: false, msg: 'A nova senha deve ter ao menos 4 caracteres.' };
  const hash = await _hashSenha(nova);
  const { error } = await _sb.from('usuarios').update({ senha: hash }).eq('id', u.id);
  if (error) return { ok: false, msg: error.message };
  return { ok: true, msg: 'Senha redefinida com sucesso.' };
}

// ─── Tempo real: avisa a página quando outra máquina/aba salva ou exclui algo ──
// Usa o Supabase Realtime (Postgres Changes) — não precisa de servidor extra nem de
// clicar em "Atualizar": todas as janelas abertas do sistema recebem o aviso e recarregam
// os dados sozinhas.
function subscribeRealtime(onChange) {
  const canal = _sb.channel('vixsul-mudancas');
  _CHAVES.filter(c => !_CHAVES_ENG.includes(c)).forEach((chave) => {
    canal.on('postgres_changes', { event: '*', schema: 'public', table: chave }, () => onChange(chave));
  });
  canal.subscribe();
  // Canal separado para as tabelas de engenharia: se o SQL delas ainda não rodou (ou a
  // tabela não está na publicação de tempo real), um erro aqui não derruba o tempo real
  // das tabelas de sempre.
  try {
    const canalEng = _sb.channel('vixsul-engenharia');
    _CHAVES_ENG.forEach((chave) => {
      canalEng.on('postgres_changes', { event: '*', schema: 'public', table: chave }, () => onChange(chave));
    });
    canalEng.subscribe();
  } catch (e) { console.warn('Tempo real das tabelas de engenharia indisponível:', e); }
  return canal;
}
window.subscribeRealtime = subscribeRealtime;

// ─── Polyfill google.script.run ───────────────────────────────────────────────

const _FNS = {
  getSistemaData:       ()        => _getSistemaData(),
  listarArquivos:       (a)       => _listarArquivos(a),
  listarAnexos:         (a)       => _listarAnexos(a),
  partesAnexo:          (a)       => _partesAnexo(a),
  excluirAnexo:         (a,b)     => _excluirAnexo(a,b),
  moverAnexosLote:      ()        => _moverAnexosLote(),
  espacoUsado:          ()        => _espacoUsado(),
  exportarStorage:      ()        => _exportarStorage(),

  upsertRegistro:       (a,b,c)   => _upsertRegistro(a,b,c),
  excluirRegistro:      (a,b)     => _excluirRegistro(a,b),
  upsertRegistroLote:   (a,b,c)   => _upsertRegistroLote(a,b,c),
  excluirRegistroLote:  (a,b)     => _excluirRegistroLote(a,b),
  salvarComposicaoCAP:  (a,b,c,d) => _salvarComposicaoCAP(a,b,c,d),
  excluirComposicaoCAP: (a,b)     => _excluirComposicaoCAP(a,b),
  login:                (a,b,c)   => _login(a,b,c),
  loginExterno:         (a,b,c)   => _loginExterno(a,b,c),
  seguranca:            (a,b)     => _seguranca(a,b),
  listarAuditoria:      (a)       => _listarAuditoria(a),
  restaurarAuditoria:   (a)       => _restaurarAuditoria(a),
  exportarTabela:       (a)       => _exportarTabela(a),
  tabelasDados:         ()        => Promise.resolve(_TAB_DADOS()),
  listarUsuarios:       ()        => _listarUsuarios(),
  salvarUsuario:        (a,b)     => _salvarUsuario(a,b),
  excluirUsuario:       (a)       => _excluirUsuario(a),
  buscarEmailPorCpf:         (a)     => _buscarEmailPorCpf(a),
  alterarSenhaPorCpf:        (a,b,c) => _alterarSenhaPorCpf(a,b,c),
  redefinirSenhaPorCpf:      (a,b,c) => _redefinirSenhaPorCpf(a,b,c),
  buscarUsuarioExternoPorEmail: (a)  => _buscarUsuarioExternoPorEmail(a),
  alterarSenhaPorEmail:      (a,b,c) => _alterarSenhaPorEmail(a,b,c),
  redefinirSenhaPorEmail:    (a,b,c) => _redefinirSenhaPorEmail(a,b,c)
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
