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
  'Orçamentos':'orcamentos','Despesas':'despesas','Etapas':'etapas',
  'Imagens da Obra':'obra_imagens'
};
const _ABA_NOME = {
  obras:'Obras', custos:'Custos',
  faturamentos:'Faturamentos', aportes:'Aportes financeiros', cap:'CAP',
  orcamentos:'Orçamentos', despesas:'Despesas', etapas:'Etapas',
  obra_imagens:'Imagens da Obra'
};
const _CHAVES = ['obras','custos','faturamentos','aportes','cap','orcamentos','despesas','etapas','obra_imagens'];

// ─── Funções que espelham o Código.gs ─────────────────────────────────────────

async function _getSistemaData() {
  const pacote = { obras:[], custos:[], faturamentos:[], aportes:[], cap:[], metadata:{}, lixeira:{} };

  // Busca as 5 tabelas em paralelo (antes era uma de cada vez, em sequência —
  // isso sozinho já multiplicava por 5 o tempo de qualquer atualização/sincronização).
  const resultados = await Promise.all(
    _CHAVES.map(chave => _sb.from(chave).select('*').order('id', { ascending: true }))
  );

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

async function _login(cpf, senha) {
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
  return { ok: true, nome: u.nome || cpf, perfil: u.perfil || 'Usuário', acessos: _parseAcessos(u.acessos), tipoUsuario: 'interno' };
}

// Usuário Externo: entra com E-MAIL + senha (não tem CPF cadastrado pra digitar) e,
// independente do que estiver salvo em "acessos", só enxerga o módulo Obras — a tela
// de Obras, por sua vez, restringe ainda mais e mostra só a aba Avanço & Gantt (ver
// UI._obraHubRenderTabs no index.html). Só loga quem estiver marcado tipo_usuario='externo',
// pra não misturar com a conta interna da mesma pessoa (se ela tiver as duas).
async function _loginExterno(email, senha) {
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
    obras_permitidas: tipoUsuario === 'externo' ? JSON.stringify(obrasPermitidas) : null
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
  const u = await _buscarUsuario(cpf);
  if (!u) return { ok: false, existe: false, msg: 'CPF não possui cadastro.' };
  const email = String(u.email || '').trim();
  if (!email) return { ok: true, existe: true, temEmail: false, nome: u.nome || '' };
  return { ok: true, existe: true, temEmail: true, email, nome: u.nome || '' };
}

// "Alterar senha" (Interno): CPF + senha atual + nova senha.
async function _alterarSenhaPorCpf(cpf, senhaAtual, senhaNova) {
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
async function _redefinirSenhaPorCpf(cpf, senhaNova) {
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
  const u = await _buscarUsuarioPorEmail(email);
  if (!u || String(u.tipo_usuario || 'interno').toLowerCase() !== 'externo')
    return { ok: true, existe: false, msg: 'E-mail não possui cadastro de Usuário Externo.' };
  return { ok: true, existe: true, nome: u.nome || '' };
}

// "Alterar senha" (Externo): e-mail + senha atual + nova senha.
async function _alterarSenhaPorEmail(email, senhaAtual, senhaNova) {
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
async function _redefinirSenhaPorEmail(email, senhaNova) {
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
  loginExterno:         (a,b)     => _loginExterno(a,b),
  listarUsuarios:       ()        => _listarUsuarios(),
  salvarUsuario:        (a,b)     => _salvarUsuario(a,b),
  excluirUsuario:       (a)       => _excluirUsuario(a),
  buscarEmailPorCpf:         (a)     => _buscarEmailPorCpf(a),
  alterarSenhaPorCpf:        (a,b,c) => _alterarSenhaPorCpf(a,b,c),
  redefinirSenhaPorCpf:      (a,b)   => _redefinirSenhaPorCpf(a,b),
  buscarUsuarioExternoPorEmail: (a)  => _buscarUsuarioExternoPorEmail(a),
  alterarSenhaPorEmail:      (a,b,c) => _alterarSenhaPorEmail(a,b,c),
  redefinirSenhaPorEmail:    (a,b)   => _redefinirSenhaPorEmail(a,b)
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
