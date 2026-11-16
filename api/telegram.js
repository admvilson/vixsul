/* TELEGRAM — o robô da Vixsul no celular: lembretes, avisos e perguntas sobre os números do sistema.
   - O robô é criado pelo dono no Telegram (@BotFather); a chave dele fica SÓ na Vercel (TELEGRAM_BOT_TOKEN).
   - "Ligar o robô" (no sistema) aponta o Telegram para esta função (webhook com senha própria, tirada da chave).
   - "Ligar meu Telegram" gera um link de uso único (30 minutos) para o Administrador logado: ao tocar em Iniciar, a
     conversa fica ligada ao usuário dele. O banco guarda só o resumo (HMAC) do código, e cada conversa ligada leva uma
     assinatura feita com a chave do robô — linha forjada ou alterada no banco por outra pessoa não vale.
   - Só conversa ligada recebe resposta. Comandos: /hoje /contas /agenda /aportes /obras /lembretes /lembrar /ajuda;
     texto livre: as perguntas mais comuns são respondidas de graça (_perguntas.js) e os lembretes pelo leitor de frases.
   - O robô também FAZ coisas no sistema (_bot.js): lança contas (obra, rateio, empresa), dá baixa, busca nota fiscal,
     cria tarefa e reunião, lança o diesel; lê foto/PDF/XML de pagamento e entende áudio (Groq, grátis).
   - GET ?tick=1 (tarefa "Lembretes do Telegram" do GitHub, a cada 15 minutos): manda os lembretes que chegaram na hora,
     o aviso antes das reuniões, o resumo do dia, as contas de hoje ainda abertas (16h), os aportes lançados e, de
     reserva, o e-mail do dia (avisos.js). Só grava no banco quando manda alguma coisa (cada gravação faz os sistemas
     abertos recarregarem os dados).
   - POST do sistema (Administrador logado): estado, conectar, vincular, testar, resumo, desligar, salvar. */
const crypto = require('crypto');
const { ORIGENS, cors, exigirLogin } = require('./_auth');
const R = require('./_resumo');
const P = require('./_perguntas');   // perguntas sem IA (grátis)
const RL = require('./_relatorio');  // relatório semanal (PDF), alerta de caixa, cobrança, chuva e fechamento do mês
const E = require('./_email');       // e-mail pelo Gmail do dono

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAVE_SB = process.env.SUPABASE_SERVICE_KEY || '';
const CHAVE_IA = process.env.ANTHROPIC_API_KEY || '';
const URL_WEBHOOK = 'https://vixsul.vercel.app/api/telegram';
const SITE = 'https://gestao.vixsulempreendimentos.com.br';
const MODELOS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'];
const esc = R.escH;

// ── segredos tirados da chave do robô (trocar o robô invalida tudo, como deve ser) ──
const hmac = txt => crypto.createHmac('sha256', TOKEN).update(String(txt)).digest('hex');
const segredoWebhook = () => hmac('webhook').slice(0, 48);
const assinaturaChat = c => hmac(`chat|${c.chat_id}|${c.usuario_uid || ''}`).slice(0, 32);
const hashCodigo = cod => hmac('vinculo|' + cod).slice(0, 40);
const iguais = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && crypto.timingSafeEqual(x, y); };

// ── horário da Bahia (UTC−3) ──
const agoraStr = () => R.agoraBahia().toISOString().slice(0, 16);              // 'AAAA-MM-DDTHH:MM'
const somaMin = (s, n) => new Date(new Date(s + ':00Z').getTime() + n * 60e3).toISOString().slice(0, 16);
const minutos = (a, b) => Math.round((new Date(b + ':00Z') - new Date(a + ':00Z')) / 60e3);
const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const diaSem = d => DIAS[new Date(d + 'T12:00:00Z').getUTCDay()];
const quandoBR = q => { const hj = agoraStr().slice(0, 10), d = q.slice(0, 10); return `${d === hj ? 'hoje' : d === R.somaDias(hj, 1) ? 'amanhã' : diaSem(d)}, ${R.brAno(d)} às ${q.slice(11, 16)}`; };
const REPETE = { nao: 'não repete', diario: 'todo dia', semanal: 'toda semana', mensal: 'todo mês' };

// ── Telegram ──
async function tg(metodo, corpo) {
  let r;
  try { r = await fetch(`https://api.telegram.org/bot${TOKEN}/${metodo}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo || {}) }); }
  catch (e) { throw new Error('O Telegram não respondeu (internet do servidor).'); }
  let j = null; try { j = await r.json(); } catch (e) { j = null; }
  if (!j || !j.ok) { const e = new Error((j && j.description) || ('O Telegram respondeu ' + r.status)); e.codigo = j && j.error_code; throw e; }
  return j.result;
}
const semTags = s => String(s).replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
// quebra o texto em pedaços de até ~3.900 letras (o Telegram aceita 4.096), sempre entre parágrafos ou linhas
function pedacos(txt, max = 3900) {
  const out = []; let atual = '';
  const poe = b => { if (!atual) atual = b; else if ((atual + '\n\n' + b).length <= max) atual += '\n\n' + b; else { out.push(atual); atual = b; } };
  for (const bloco of String(txt).split('\n\n')) {
    if (bloco.length <= max) { poe(bloco); continue; }
    let parte = '';
    for (let linha of bloco.split('\n')) {
      if (linha.length > max) linha = esc(semTags(linha).slice(0, max - 20)) + '…';
      if (parte && (parte + '\n' + linha).length > max) { poe(parte); parte = linha; } else parte = parte ? parte + '\n' + linha : linha;
    }
    if (parte) poe(parte);
  }
  if (atual) out.push(atual);
  return out.length ? out : [''];
}
async function mandar(chat_id, texto, teclado) {
  const partes = pedacos(texto); let ultimo = null;
  for (let i = 0; i < partes.length; i++) {
    const corpo = { chat_id, text: partes[i] || '…', parse_mode: 'HTML', link_preview_options: { is_disabled: true } };
    if (teclado && i === partes.length - 1) corpo.reply_markup = { inline_keyboard: teclado };
    try { ultimo = await tg('sendMessage', corpo); }
    catch (e) { if (!/parse|entit|tag/i.test(e.message)) throw e; delete corpo.parse_mode; corpo.text = semTags(partes[i]); ultimo = await tg('sendMessage', corpo); }
  }
  return ultimo;
}
async function paraTodos(chats, texto, teclado) { const falhas = []; for (const c of chats) { try { await mandar(c.chat_id, texto, teclado); } catch (e) { falhas.push((c.nome || c.chat_id) + ': ' + e.message); } } return falhas; }
// um arquivo (o PDF do relatório, o PDF e o XML de uma nota) no Telegram
async function mandarArq(chat_id, buf, nome, mime, legenda, teclado) {
  const fd = new FormData(); fd.append('chat_id', String(chat_id)); if (legenda) fd.append('caption', String(legenda).slice(0, 1000));
  // com botões (aviso de boleto do e-mail): legenda em HTML e os botões embaixo do arquivo
  if (teclado) { fd.append('parse_mode', 'HTML'); fd.append('reply_markup', JSON.stringify({ inline_keyboard: teclado })); }
  fd.append('document', new Blob([buf], { type: mime || 'application/octet-stream' }), nome);
  let r; try { r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendDocument`, { method: 'POST', body: fd }); } catch (e) { throw new Error('O Telegram não respondeu (internet do servidor).'); }
  const j = await r.json().catch(() => null); if (!j || !j.ok) throw new Error((j && j.description) || ('O Telegram respondeu ' + r.status)); return j.result;
}
const mandarDoc = (chat_id, buf, nome, legenda) => mandarArq(chat_id, buf, nome, 'application/pdf', legenda);
// as ações do robô no sistema (contas, baixa, notas, tarefas, reuniões, diesel, foto e áudio)
const BOT = require('./_bot')({ tg, mandar, mandarArq, TOKEN });
const BU = require('./_bot').util;   // cn, corta, valorDe, obrasNoTexto, semOi
/* PARA QUEM VAI cada aviso automático — o Administrador escolhe em Agenda › Lembretes e Telegram ("Para quem vai"):
   cfg_telegram.destinos = { aviso: { chats: [ids das conversas ligadas] , emails: 'a@b.com, c@d.com' } }.
   Sem escolha: todas as conversas ligadas; e-mail só no relatório semanal e no fechamento (os dos Avisos por e-mail). */
const AUTOS = ['resumo', 'reuniao', 'tarde', 'aportes', 'relatorio', 'caixa', 'cobranca', 'chuva', 'fechamento', 'email'];
const COM_EMAIL = ['relatorio', 'caixa', 'cobranca', 'chuva', 'fechamento'];
function chatsPara(st, k) {
  const d = (st.cfg.destinos || {})[k];
  if (d && Array.isArray(d.chats)) return st.chats.filter(c => d.chats.includes(String(c._id)));
  return k === 'resumo' ? st.chats.filter(c => c.resumo !== 'nao') : st.chats;
}
async function emailsPara(st, k) {
  if (!COM_EMAIL.includes(k)) return [];
  const d = (st.cfg.destinos || {})[k];
  if (d && d.emails != null) return E.emailsDe(d.emails);
  if (k !== 'relatorio' && k !== 'fechamento') return [];
  const ca = (await R.lerTipos(['cfg_avisos'])).sort((a, b) => (b._id || 0) - (a._id || 0))[0];
  return ca && ca.ativo !== 'nao' ? E.emailsDe(ca.emails) : [];
}
// e-mail automático do aviso "k" para quem o Administrador escolheu (se o Gmail estiver ligado)
async function emailAuto(st, k, titulo, partes, anexos) {
  if (!E.emailPronto()) return false;
  try {
    const para = await emailsPara(st, k); if (!para.length) return false;
    await E.mandarEmail({ para, assunto: titulo + ' — Vixsul Empreendimentos', html: E.htmlPartes(titulo, partes), texto: E.textoPartes(titulo, partes), anexos: anexos || undefined });
    return true;
  } catch (e) { console.error('email', e && e.message); return false; }
}
// /avisos — para onde vai cada aviso automático (o escolhido em Agenda › Lembretes e Telegram › "Para quem vai cada aviso")
const NOME_AVISO = { resumo: 'Resumo do dia', reuniao: 'Aviso antes das reuniões', tarde: 'Contas de hoje ainda em aberto (16h)', aportes: 'Aportes lançados', relatorio: 'Relatório semanal (segunda, 7h, com PDF)', caixa: 'Alerta de caixa (8h)', cobranca: 'Cobranças de notas paradas (8h)', chuva: 'Chuva amanhã nas obras (17h)', fechamento: 'Fechamento do mês (dia 1º)', email: 'Boletos e notas que chegam no e-mail' };
function avisoLigado(cfg, k) { const m = { resumo: cfg.resumo, reuniao: cfg.aviso_reuniao, tarde: cfg.aviso_tarde, aportes: cfg.aviso_aportes, relatorio: cfg.relatorio_semanal, caixa: cfg.alerta_caixa, cobranca: cfg.cobranca_dias === '0' ? 'nao' : '', chuva: cfg.aviso_chuva, fechamento: cfg.fechamento_mes, email: cfg.email_caixa }; return m[k] !== 'nao'; }
async function textoAvisos(st) {
  const nome = c => c.nome || c.usuario || 'conversa ' + c.chat_id;
  const ca = (await R.lerTipos(['cfg_avisos'])).sort((a, b) => (b._id || 0) - (a._id || 0))[0], dia = ca && ca.ativo !== 'nao' ? E.emailsDe(ca.emails) : [];
  const L = [];
  for (const k of AUTOS) {
    const tgs = chatsPara(st, k).map(nome), em = await emailsPara(st, k);
    L.push(`• <b>${NOME_AVISO[k]}</b>${avisoLigado(st.cfg, k) ? '' : ' — <i>desligado</i>'}\n   📱 ${tgs.length ? tgs.map(esc).join(', ') : 'ninguém'}${COM_EMAIL.includes(k) ? '\n   📧 ' + (em.length ? em.map(esc).join(', ') : 'nenhum e-mail') : ''}`);
  }
  return `📬 <b>Para onde vão os avisos automáticos</b>\n\n<b>E-mail do dia (7h)</b> — agenda, tarefas, contas, recebimentos, certidões…\n   📧 ${dia.length ? dia.map(esc).join(', ') : ca && ca.ativo === 'nao' ? 'desligado' : 'nenhum e-mail cadastrado'}\n\n` + L.join('\n') +
    `\n\n<b>Lembretes</b>: cada um vai só para quem criou (ou para todos, quando marcado "todos").\n<b>Conversas ligadas ao robô</b>: ${st.chats.length ? st.chats.map(c => esc(nome(c)) + (c.usuario ? ' (usuário ' + esc(c.usuario) + ')' : '')).join(', ') : 'nenhuma'}\n<b>Quem manda os e-mails</b>: o Gmail do sistema${E.remetente() ? ' (' + esc(E.remetente()) + ')' : ''}.\n\nPara mudar: no sistema, <b>Agenda › Lembretes e Telegram › Para quem vai cada aviso</b>; o e-mail do dia em <b>Configurações › Avisos por e-mail</b>.`;
}
// os textos das automações (também pedidos pelos comandos /relatorio /caixa /cobrar /fechamento)
async function enviarRelatorio(chats, D, hj) {
  const rel = RL.semanal(D, hj); let pdf = null;
  try { pdf = RL.pdfDePartes(rel.titulo, 'Vixsul Empreendimentos — semana de ' + rel.rot, rel.partes); } catch (e) { console.error('pdf', e && e.message); }
  for (const c of chats) { try { await mandar(c.chat_id, rel.tg); if (pdf) await mandarDoc(c.chat_id, pdf, rel.arquivo, 'Relatório semanal — ' + rel.rot); } catch (e) { console.error('relatorio', e && e.message); } }
  return { rel, pdf };
}
function textoCaixa(cx) {
  if (!cx) return 'Para o alerta de caixa, informe o saldo das contas em <b>Planejamento › Fluxo de caixa projetado</b> (o sistema parte dele).';
  const base = `pelo saldo informado (${R.reais(cx.saldo)} em ${R.brAno(cx.dataSaldo)}) e pelo que está lançado`;
  if (!cx.neg) return `✅ <b>Caixa dos próximos 15 dias</b>: ${base}, o saldo não fica negativo. O menor saldo é ${R.reais(cx.min)} em ${R.brAno(cx.dMin)}; no fim, ${R.reais(cx.fim)}.`;
  return `🚨 <b>Alerta de caixa</b>\n${base[0].toUpperCase() + base.slice(1)}, o caixa fica <b>negativo em ${R.brAno(cx.neg)}</b> — o pior momento é ${R.brAno(cx.dMin)} (${R.reais(cx.min)}).` +
    (cx.saidas.length ? '\nMaiores saídas até lá:\n' + cx.saidas.map(x => `• ${R.br(x.v)} — ${esc(x.forn)} — ${R.reais(x.valor)}`).join('\n') : '') + '\nVeja em Planejamento › Fluxo de caixa projetado.';
}
const textoCobranca = c => `💸 <b>Cobrança: NF ${esc(c.x.n)}</b>${c.x.obra ? ' — ' + esc(c.x.obra) : ''}\nEmitida em ${R.brAno(c.x.e)} (${c.dias} dias) · ${R.reais(c.x.liq)} a receber${c.contratante ? ' · ' + esc(c.contratante) : ''}\n\nTexto pronto (toque nele para copiar):\n<pre>${esc(c.texto)}</pre>`;
const textoChuva = L => `🌧️ <b>Previsão de chuva amanhã (${R.brAno(L[0].amanha)})</b>\n` + L.map(c => `<b>${esc(c.cidade)}</b>${c.forte ? ' — <b>chuva forte</b>' : ''} · obra(s): ${esc(c.obras.join(', '))}\nManhã: ${esc(c.manha || '—')}\nTarde: ${esc(c.tarde || '—')}`).join('\n\n') + '\n\nSe tiver concretagem, aterro ou serviço externo marcado, vale replanejar.';

// ── o que está no banco (só os tipos do Telegram: leitura leve) ──
async function estadoBanco() {
  const L = await R.lerTipos(['cfg_telegram', 'telegram_chat', 'lembrete']);
  const cfg = L.filter(x => x.tipo === 'cfg_telegram').sort((a, b) => (b._id || 0) - (a._id || 0))[0] || { tipo: 'cfg_telegram' };
  const todas = L.filter(x => x.tipo === 'telegram_chat');
  const chats = TOKEN ? todas.filter(c => c.ativo !== 'nao' && iguais(c.assinatura, assinaturaChat(c))) : [];
  return { cfg, todas, chats, lembretes: L.filter(x => x.tipo === 'lembrete') };
}
async function gravarCfg(st, mud) { const novo = await R.gravarPlan({ ...st.cfg, ...mud, tipo: 'cfg_telegram' }); st.cfg = novo; return novo; }
// para quem vai o lembrete: "todos" = todas as conversas ligadas; senão, as do usuário que o criou (ou a conversa de onde veio)
function destinos(l, chats) {
  if (l.para === 'todos') return chats;
  const uid = l.criado_por_id || l.usuario_uid || '';
  return chats.filter(c => (l.chat_id && String(c.chat_id) === String(l.chat_id)) || (uid && c.usuario_uid === uid));
}
const lembreteVivo = l => l.ativo !== 'nao' && !(l.repetir === 'nao' && l.enviado === 'sim' && !l.adiar_ate);
const proxDoLembrete = l => l.adiar_ate || R.proximaVez(l, l.ultimo_envio || '0000-00-00T00:00');

// ── textos dos comandos ──
const ajuda = () => `<b>O que eu faço</b>
/hoje — o resumo do dia (agenda, tarefas, contas, recebimentos, aportes…)
/contas — contas a pagar vencidas e dos próximos 7 dias
/agenda — reuniões e tarefas dos próximos 7 dias
/aportes — aportes do mês e do ano por sócio
/obras — os números de cada obra
/obra — a ficha de uma obra (números, contas em aberto, a receber, tarefas, último diário). Ex.: <i>/obra Itarantim</i>
/fornecedor — cadastro (com o PIX para copiar), quanto já foi pago e o que está em aberto. Ex.: <i>/fornecedor casa do construtor</i>
/buscar — procurar nas contas pelo nome, pelo que foi comprado ou pelo valor. Ex.: <i>/buscar cimento</i>
/receber — notas emitidas esperando o dinheiro e medições aprovadas sem nota
/aprovar — as contas aguardando a sua aprovação
/doc — documentos da empresa (certidões, FGTS, contrato social, cartão CNPJ…) e arquivos das obras. Ex.: <i>/doc fgts</i>
/avisos — para onde vai cada aviso automático (quais conversas do Telegram e quais e-mails)
/app — o link que instala o app da Vixsul no celular (para mandar à equipe)
/lembretes — os seus lembretes (com botão para apagar)
/lembrar — criar um lembrete. Exemplo: <i>/lembrar amanhã 9h pagar o aluguel</i>
/relatorio — o relatório da semana passada (com PDF)
/caixa — o caixa dos próximos 15 dias
/cobrar — notas paradas há 30 dias ou mais, com o texto de cobrança pronto
/fechamento — o que falta fechar do mês passado
/chuva — previsão de chuva para amanhã nas obras

<b>No sistema eu também faço</b> (sempre mostro um cartão para você conferir antes de gravar)
/conta — lançar uma conta: numa obra, rateada entre obras ou na Empresa (custo indireto). Ou escreva: <i>lança 350 de cimento na obra Itarantim, vence dia 20</i> · <i>paguei 120 de gasolina no pix, empresa</i> · <i>paguei 80 de almoço com meu cartão</i>
🖊️ Tudo o que eu lanço em Contas a pagar fica <b>Aguardando aprovação</b> até você conferir no sistema. Se um sócio pagou (cartão, PIX ou conta pessoal), eu pergunto quem foi: o aporte dele entra quando você aprovar.
/pagar — dar baixa numa conta em aberto
/recebi — registrar que o dinheiro de uma nota emitida entrou. Ou escreva: <i>recebi a nota 123</i>
/concluir — marcar uma tarefa como feita
/nota — buscar nota fiscal e receber o PDF e o XML. Ex.: <i>/nota 1234</i> ou <i>/nota casa do construtor</i>
/tarefa — nova tarefa. Ex.: <i>/tarefa pedir a medição sexta obra Itarantim</i>
/reuniao — marcar reunião. Ex.: <i>/reuniao amanhã 9h com a fiscalização</i>
/diesel — abastecimento da retroescavadeira. Ex.: <i>/diesel 120 litros 750 reais obra Itarantim</i>
/cancelar — desistir do que estiver pela metade
📷 Mande a <b>foto</b>, o <b>PDF</b> ou o <b>XML</b> do boleto, da nota ou do comprovante (ou cole o código do PIX ou a linha do boleto): eu leio o valor e preparo a conta.
🏗 <b>Fotos da obra</b>: mande com a legenda <i>fotos da obra Itarantim</i> (pode ser várias de uma vez) — vão para a galeria da obra.
📧 Eu também olho o <b>e-mail</b> da empresa e aviso quando chega boleto ou nota, com o botão <b>Lançar conta</b>.
🎤 Mande <b>áudio</b> falando o que quer${BOT.temGroq() ? '' : ' (falta ligar a leitura grátis de foto e áudio — Agenda › Lembretes e Telegram)'}.

${CHAVE_IA ?'Ou escreva uma pergunta, como: <i>quanto gastei na obra de Itarantim em outubro?</i>, <i>quais contas vencem esta semana?</i> ou <i>me lembra sexta às 10h de ligar para o fiscal</i>. Para continuar um assunto, responda (deslize para a esquerda) a minha mensagem.' : 'Ou escreva a pergunta do seu jeito. ' + P.EXEMPLOS + '\n• <i>me lembra sexta às 10h de ligar para o fiscal</i>'}

Sozinho eu mando: o resumo do dia (7h), o aviso antes de cada reunião, os lembretes na hora marcada, o alerta de caixa e as cobranças (8h), as contas de hoje ainda em aberto (16h), a chuva de amanhã nas obras (17h), os aportes lançados, o relatório semanal (segunda, 7h) e o fechamento do mês (dia 1º).`;

function textoContas(D, hj) {
  const ab = R.contasAbertas(D, hj).sort((a, b) => a.v.localeCompare(b.v)), ate = R.somaDias(hj, 7);
  const venc = ab.filter(x => x.v < hj), prox = ab.filter(x => x.v >= hj && x.v <= ate), tot = L => R.reais(L.reduce((s, x) => s + x.valor, 0));
  const fx = x => `• ${R.br(x.v)} — ${esc(x.forn)} — ${R.reais(x.valor)}${x.onde ? ' <i>(' + esc(x.onde) + ')</i>' : ''}`;
  const parte = (t, L) => L.length ? `<b>${t}</b>: ${L.length} · ${tot(L)}\n` + L.slice(0, 25).map(fx).join('\n') + (L.length > 25 ? `\n• … e mais ${L.length - 25}` : '') : `<b>${t}</b>: nenhuma`;
  return `<b>Contas a pagar</b> (em aberto: ${ab.length} · ${tot(ab)})\n\n${parte('Vencidas', venc)}\n\n${parte('Hoje e próximos 7 dias', prox)}`;
}
function textoAgenda(D, hj) {
  const ate = R.somaDias(hj, 7);
  const reu = D.reunioes.filter(r => R.reuniaoValida(r) && R.iso(r.data) >= hj && R.iso(r.data) <= ate).sort((a, b) => (R.iso(a.data) + (a.hora || '')).localeCompare(R.iso(b.data) + (b.hora || '')));
  const ab = D.acoes.filter(t => R.tarefaAberta(t)), atr = ab.filter(t => R.iso(t.quando) && R.iso(t.quando) < hj), prox = ab.filter(t => R.iso(t.quando) >= hj && R.iso(t.quando) <= ate).sort((a, b) => R.iso(a.quando).localeCompare(R.iso(b.quando)));
  const fr = r => `• ${R.br(R.iso(r.data))}${r.hora ? ' ' + esc(r.hora) : ''} — ${esc(r.titulo || r.tipo || 'Reunião')}${r.titulo_obra ? ' <i>(' + esc(r.titulo_obra) + ')</i>' : ''}${r.link ? '\n   ' + esc(r.link) : r.local ? ' · ' + esc(r.local) : ''}`;
  const ft = t => `• ${R.br(R.iso(t.quando))} — ${esc(t.o_que || 'Tarefa')}${t.quem ? ' · ' + esc(t.quem) : ''}${t.titulo_obra ? ' <i>(' + esc(t.titulo_obra) + ')</i>' : ''}`;
  return `<b>Agenda dos próximos 7 dias</b>\n\n<b>Reuniões</b>: ${reu.length ? '\n' + reu.slice(0, 20).map(fr).join('\n') : 'nenhuma'}\n\n<b>Tarefas</b>: ${prox.length ? '\n' + prox.slice(0, 20).map(ft).join('\n') : 'nenhuma com prazo nestes dias'}${atr.length ? `\n\n<b>Atrasadas</b>: ${atr.length}\n` + atr.sort((a, b) => R.iso(a.quando).localeCompare(R.iso(b.quando))).slice(0, 10).map(ft).join('\n') : ''}`;
}
function textoAportes(D, hj) {
  const ano = hj.slice(0, 4), mes = hj.slice(0, 7), pM = {}, pA = {}; let dev = 0;
  D.aportes.forEach(a => { const d = R.iso(R.campo(a, 'data_aporte', 'data')); if (!d.startsWith(ano)) return; const v = R.valorAporte(a), q = R.campo(a, 'quem_aportou', 'socio') || 'Sócio';
    if (v < 0) { dev += -v; return; } pA[q] = (pA[q] || 0) + v; if (d.startsWith(mes)) pM[q] = (pM[q] || 0) + v; });
  const L = o => Object.entries(o).sort((a, b) => b[1] - a[1]), soma = o => Object.values(o).reduce((s, v) => s + v, 0);
  const lin = o => L(o).length ? L(o).map(([q, v]) => `• ${esc(q)} — ${R.reais(v)}`).join('\n') : '• nenhum';
  return `<b>Aportes de ${R.MESES[+mes.slice(5) - 1]}</b> — ${R.reais(soma(pM))}\n${lin(pM)}\n\n<b>Aportes de ${ano}</b> — ${R.reais(soma(pA))}\n${lin(pA)}${dev ? `\n\nDevolvido aos sócios em ${ano}: ${R.reais(dev)}` : ''}`;
}
function textoObras(D) {
  const L = R.porObra(D).slice(0, 15);
  if (!L.length) return 'Nenhuma obra com números lançados.';
  return '<b>Números das obras</b> (as de maior gasto primeiro)\n\n' + L.map(x => `<b>${esc(x.obra)}</b>\n` + [x.contrato ? 'Contrato ' + R.reais(x.contrato) : '', x.medido ? 'Medido ' + R.reais(x.medido) : '', 'Notas ' + R.reais(x.faturado), 'Recebido ' + R.reais(x.recebido), 'Gasto ' + R.reais(x.gasto), x.aportes ? 'Aportes ' + R.reais(x.aportes) : ''].filter(Boolean).join(' · ')).join('\n\n');
}
// ── consultas novas: uma obra, um fornecedor, busca nas contas e o que falta receber ──
// todas as contas (custos das obras + despesas da empresa) num formato só
function contasTodas(D, hj) {
  const L = [];
  D.custos.forEach(c => { const real = String(R.campo(c, 'tipo_de_custo', 'tipo_custo')).toLowerCase() === 'real', pg = R.iso(R.campo(c, 'data_pgto', 'data_pagamento'));
    L.push({ forn: String(R.campo(c, 'fornecedor') || ''), desc: String(R.campo(c, 'descricao') || ''), valor: R.num(R.campo(c, 'p_total', 'valor_total', 'valor')), onde: c.titulo_obra || '', venc: R.iso(R.campo(c, 'vencimento', 'data_vencimento')), pago: real && pg && pg <= hj ? pg : '', prev: !real, pend: c.aprovacao === 'pendente' }); });
  D.despesas.forEach(d => { const prev = /previst/i.test(String(R.campo(d, 'tipo_despesa'))), pago = String(R.campo(d, 'status_pagamento')).toLowerCase() === 'pago';
    L.push({ forn: String(R.campo(d, 'fornecedor_beneficiario', 'fornecedor') || ''), desc: String(d.descricao || ''), valor: R.num(R.campo(d, 'valor', 'valor_total')), onde: 'Empresa', venc: R.iso(R.campo(d, 'data_despesa', 'vencimento')), pago: pago ? (R.iso(R.campo(d, 'data_pagamento')) || R.iso(R.campo(d, 'data_despesa'))) : '', prev, pend: d.aprovacao === 'pendente' }); });
  return L.filter(x => x.valor > 0);
}
const dAno = d => d ? R.br(d) + '/' + d.slice(2, 4) : '—';
const marca = (x, hj) => x.pend ? '🖊️' : x.pago ? '✅' : x.venc && x.venc < hj ? '⚠️' : '🕒';
const LEGENDA = '✅ paga · 🕒 a pagar · ⚠️ vencida · 🖊️ aguardando aprovação';
const PALAVRAS_VAZIAS = /^(?:de|do|da|dos|das|com|para|pra|pro|na|no|nas|nos|em|um|uma|o|a|os|as|e|conta|contas|gasto|gastos|pagamento|pagamentos|quanto|qual|quais|tudo|todas|todos)$/;
function textoBuscar(D, termo, hj) {
  const t = String(termo || '').trim();
  if (!t) return 'O que procurar? Exemplos: <i>/buscar cimento</i>, <i>/buscar casa do construtor</i>, <i>/buscar 1.500,00</i>, <i>/buscar areia Itarantim</i>.';
  const v = /\d[.,]\d{2}\b|r\$|reais/i.test(t) ? BU.valorDe(t).valor : 0, ws = BU.cn(t).split(' ').filter(w => w.length >= 3 && !PALAVRAS_VAZIAS.test(w));
  let L = contasTodas(D, hj).filter(x => !x.prev);
  L = v > 0 ? L.filter(x => Math.abs(x.valor - v) < 0.01) : ws.length ? L.filter(x => { const a = BU.cn([x.forn, x.desc, x.onde].join(' ')); return ws.every(w => a.includes(w)); }) : [];
  if (!L.length) return `Não achei conta com “${esc(t)}”. Tente outra palavra (o fornecedor, o que foi comprado, a obra) ou o valor (ex.: 1.500,00).`;
  L.sort((a, b) => (b.pago || b.venc || '').localeCompare(a.pago || a.venc || ''));
  const soma = M => R.reais(M.reduce((s, x) => s + x.valor, 0)), pg = L.filter(x => x.pago), ab = L.filter(x => !x.pago);
  return `🔎 <b>${L.length} conta(s) com “${esc(t)}”</b> · ${soma(L)}\nPagas: ${soma(pg)} (${pg.length}) · em aberto: ${soma(ab)} (${ab.length})\n\n` +
    L.slice(0, 15).map(x => `${marca(x, hj)} ${dAno(x.pago || x.venc)} — ${esc(BU.corta(x.forn || x.desc || 'Conta', 40))}${x.forn && x.desc ? ' · ' + esc(BU.corta(x.desc, 30)) : ''} — <b>${R.reais(x.valor)}</b>${x.onde ? ' <i>(' + esc(BU.corta(x.onde, 30)) + ')</i>' : ''}`).join('\n') +
    (L.length > 15 ? `\n… e mais ${L.length - 15}` : '') + '\n\n' + LEGENDA;
}
function textoFornecedor(D, forns, termo, hj) {
  const t = BU.cn(termo), ws = t.split(' ').filter(w => w.length >= 2 && !PALAVRAS_VAZIAS.test(w));
  if (!ws.length) return 'Qual fornecedor? Exemplo: <i>/fornecedor casa do construtor</i> (mostro o cadastro com o PIX, o que já foi pago e o que está em aberto).';
  const bate = s => { const a = BU.cn(s); return ws.every(w => a.includes(w)); };
  const cad = (forns || []).filter(f => f.nome && bate([f.nome, f.documento || f.cnpj || ''].join(' ')));
  const todas = contasTodas(D, hj).filter(x => !x.prev && x.forn && bate(x.forn));
  const nomes = [...new Map(cad.map(f => f.nome).concat(todas.map(x => x.forn)).map(n => [BU.cn(n), n])).values()];
  if (!nomes.length) return `Não achei fornecedor com “${esc(termo)}”. Veja os cadastrados na tela <b>Fornecedores</b> do sistema.`;
  const exato = nomes.find(n => BU.cn(n) === t);
  if (nomes.length > 1 && !exato) return `Achei ${nomes.length} fornecedores com “${esc(termo)}”:\n` + nomes.slice(0, 10).map(n => '• ' + esc(n)).join('\n') + '\n\nMande /fornecedor e o nome mais completo.';
  const nome = exato || nomes[0], f = cad.find(x => BU.cn(x.nome) === BU.cn(nome)) || {}, deles = todas.filter(x => BU.cn(x.forn) === BU.cn(nome));
  const ano = hj.slice(0, 4), pgAno = deles.filter(x => x.pago && x.pago.startsWith(ano)), ab = deles.filter(x => !x.pago).sort((a, b) => (a.venc || '9').localeCompare(b.venc || '9'));
  const soma = M => R.reais(M.reduce((s, x) => s + x.valor, 0));
  const cadL = [f.documento || f.cnpj ? 'CNPJ/CPF: ' + esc(f.documento || f.cnpj) : '', f.contato || f.telefone ? [f.contato ? 'Contato: ' + esc(f.contato) : '', f.telefone ? 'Tel.: ' + esc(f.telefone) : ''].filter(Boolean).join(' · ') : '', f.email ? 'E-mail: ' + esc(f.email) : '', f.cidade ? 'Cidade: ' + esc(f.cidade) : '', f.pix ? 'PIX / banco (toque para copiar): <code>' + esc(f.pix) + '</code>' : ''].filter(Boolean);
  return `🏪 <b>${esc(nome)}</b>${f.tipo ? ' · ' + esc(f.tipo) : ''}${f.situacao === 'Inativo' ? ' · <i>inativo</i>' : ''}\n` + (cadL.length ? cadL.join('\n') : '<i>Sem cadastro em Fornecedores (só aparece nas contas).</i>') +
    `\n\nPago em ${ano}: <b>${soma(pgAno)}</b> (${pgAno.length} conta(s)) · desde o início: ${soma(deles.filter(x => x.pago))}` +
    `\nEm aberto: <b>${soma(ab)}</b> (${ab.length})${ab.length ? ' — a próxima vence ' + dAno(ab[0].venc) : ''}` +
    (deles.length ? '\n\nÚltimas contas:\n' + deles.slice().sort((a, b) => (b.pago || b.venc || '').localeCompare(a.pago || a.venc || '')).slice(0, 8).map(x => `${marca(x, hj)} ${dAno(x.pago || x.venc)} — ${esc(BU.corta(x.desc || 'Conta', 36))} — ${R.reais(x.valor)}${x.onde ? ' <i>(' + esc(BU.corta(x.onde, 28)) + ')</i>' : ''}`).join('\n') + '\n\n' + LEGENDA : '');
}
// notas emitidas ainda sem o dinheiro (as antecipadas sem a confirmação também) e as medições aprovadas sem nota
function textoReceber(D, hj) {
  const L = D.faturamentos.filter(f => R.iso(R.campo(f, 'emissao_nf')) && String(R.campo(f, 'n_nf')).trim() && !/previst/i.test(String(f.tipo_faturamento || '')))
    .filter(f => { const r = R.iso(R.campo(f, 'data_recebimento')), antPend = f.antecipada === 'sim' && f.antec_recebida !== 'sim' && !f.antec_depositado; return !(r && r <= hj) || antPend; })
    .map(f => ({ n: String(R.campo(f, 'n_nf')).trim(), obra: f.titulo_obra || '', e: R.iso(R.campo(f, 'emissao_nf')), liq: R.num(f.faturamento_liquido) || R.num(f.faturamento_bruto), comb: R.iso(R.campo(f, 'data_recebimento')), ant: f.antecipada === 'sim' }))
    .sort((a, b) => a.e.localeCompare(b.e));
  const med = D.medicoes.filter(m => /aprov/i.test(String(m.status || '')) && !/fatur/i.test(String(m.status || '')) && !m.faturado_em);
  if (!L.length && !med.length) return '✅ Nada a receber: todas as notas emitidas já foram recebidas.';
  const tot = L.reduce((s, x) => s + x.liq, 0);
  return `💵 <b>A receber</b>: ${L.length} nota(s) · ${R.reais(tot)} líquido\n` + L.slice(0, 25).map(x => `• NF ${esc(x.n)} — ${esc(BU.corta(x.obra, 34))} — emitida ${dAno(x.e)} (${R.diasEntre(x.e, hj)} dias) — <b>${R.reais(x.liq)}</b>${x.ant ? ' · antecipada' : ''}${x.comb && x.comb > hj ? ' · combinado ' + dAno(x.comb) : ''}`).join('\n') + (L.length > 25 ? `\n• … e mais ${L.length - 25}` : '') +
    (med.length ? `\n\n📐 <b>Medições aprovadas ainda sem nota</b>: ${med.length} · ${R.reais(med.reduce((s, m) => s + R.num(m.valor_total), 0))}\n` + med.slice(0, 10).map(m => `• Medição nº ${esc(m.numero || '—')} — ${esc(BU.corta(m.titulo_obra || '', 34))} — ${R.reais(R.num(m.valor_total))}`).join('\n') : '') +
    '\n\nQuando o dinheiro entrar: /recebi (ou escreva <i>recebi a nota 123</i>). Para cobrar as paradas: /cobrar.';
}
// a ficha de uma obra: números, o que falta pagar e receber, tarefas, reuniões e o último diário
function textoObra(D, termo, hj) {
  const lista = [...new Map(D.obras.map(o => ({ nome: o.titulo_obra || o.nome_obra || o.titulo || '', cidade: o.cidade_obra || o.cidade || '', st: String(o.status_proposta || o.status_obra || o.status_da_obra || o.status || '') })).filter(o => o.nome).map(o => [o.nome, o])).values()];
  const ganhas = lista.filter(o => /^ganha/i.test(BU.cn(o.st)));
  let L = BU.obrasNoTexto(termo, ganhas); if (!L.length) L = BU.obrasNoTexto(termo, lista);
  if (!L.length) return `Não achei obra com “${esc(termo)}”. Mande /obras para ver os números de todas.`;
  if (L.length > 1) return 'Achei mais de uma obra:\n' + L.slice(0, 8).map(o => '• ' + esc(o.nome)).join('\n') + '\n\nMande /obra e uma palavra que só a obra que você quer tem (a cidade, o bairro…).';
  const ob = L[0].nome, x = R.porObra(D).find(y => y.obra === ob) || { contrato: 0, medido: 0, faturado: 0, recebido: 0, gasto: 0, pago: 0, aportes: 0 };
  const contas = contasTodas(D, hj).filter(c => c.onde === ob && !c.prev), ab = contas.filter(c => !c.pago).sort((a, b) => (a.venc || '9').localeCompare(b.venc || '9')), venc = ab.filter(c => c.venc && c.venc < hj);
  const aRec = D.faturamentos.filter(f => f.titulo_obra === ob && R.iso(R.campo(f, 'emissao_nf')) && !/previst/i.test(String(f.tipo_faturamento || '')) && !(R.iso(f.data_recebimento) && R.iso(f.data_recebimento) <= hj)).reduce((s, f) => s + (R.num(f.faturamento_liquido) || R.num(f.faturamento_bruto)), 0);
  const tar = D.acoes.filter(t => R.tarefaAberta(t) && t.titulo_obra === ob).sort((a, b) => (R.iso(a.quando) || '9').localeCompare(R.iso(b.quando) || '9'));
  const reu = D.reunioes.filter(r => R.reuniaoValida(r) && r.titulo_obra === ob && R.iso(r.data) >= hj).sort((a, b) => (R.iso(a.data) + (a.hora || '')).localeCompare(R.iso(b.data) + (b.hora || '')));
  const dia = D.diario_obra.filter(d => d.titulo_obra === ob && R.iso(d.data)).sort((a, b) => R.iso(b.data).localeCompare(R.iso(a.data)))[0];
  const meds = D.medicoes.filter(m => m.titulo_obra === ob).sort((a, b) => (+b.numero || 0) - (+a.numero || 0));
  const pct = (a, b) => b > 0 ? ` (${Math.round(a / b * 100)}% do contrato)` : '', soma = M => R.reais(M.reduce((s, c) => s + c.valor, 0));
  const P = [`🏗 <b>${esc(ob)}</b>${L[0].st ? ' · ' + esc(L[0].st) : ''}`,
    [x.contrato ? 'Contrato ' + R.reais(x.contrato) : '', x.medido ? 'Medido ' + R.reais(x.medido) + pct(x.medido, x.contrato) : ''].filter(Boolean).join(' · '),
    `Notas ${R.reais(x.faturado)} · Recebido ${R.reais(x.recebido)}${aRec ? ' · a receber ' + R.reais(aRec) : ''}`,
    `Gasto ${R.reais(x.gasto)} (pago ${R.reais(x.pago)})${x.aportes ? ' · Aportes ' + R.reais(x.aportes) : ''}`,
    `Resultado até agora (recebido − gasto): <b>${R.reais(x.recebido - x.gasto)}</b>`].filter(Boolean);
  if (meds[0]) P.push(`Última medição: nº ${esc(meds[0].numero || '—')} · ${esc(meds[0].status || '—')} · ${R.reais(R.num(meds[0].valor_total))}`);
  if (ab.length) P.push(`\n<b>Contas em aberto</b>: ${ab.length} · ${soma(ab)}${venc.length ? ` — ⚠️ ${venc.length} vencida(s): ${soma(venc)}` : ''}\n` + ab.slice(0, 6).map(c => `${marca(c, hj)} ${dAno(c.venc)} — ${esc(BU.corta(c.forn || c.desc, 36))} — ${R.reais(c.valor)}`).join('\n'));
  if (tar.length) P.push(`\n<b>Tarefas abertas</b>: ${tar.length}\n` + tar.slice(0, 5).map(t => `• ${R.iso(t.quando) ? dAno(R.iso(t.quando)) + (R.iso(t.quando) < hj ? ' ⚠️' : '') + ' — ' : ''}${esc(BU.corta(t.o_que || 'Tarefa', 60))}${t.quem ? ' · ' + esc(t.quem) : ''}`).join('\n'));
  if (reu.length) P.push(`\n<b>Próximas reuniões</b>\n` + reu.slice(0, 3).map(r => `• ${dAno(R.iso(r.data))}${r.hora ? ' ' + esc(r.hora) : ''} — ${esc(BU.corta(r.titulo || r.tipo || 'Reunião', 60))}`).join('\n'));
  if (dia) P.push(`\n<b>Último diário</b> (${dAno(R.iso(dia.data))}): ${[dia.efetivo_total ? dia.efetivo_total + ' pessoa(s)' : '', dia.condicao || dia.clima_manha || ''].filter(Boolean).map(esc).join(' · ')}${dia.atividades ? '\n' + esc(BU.corta(dia.atividades, 300)) : ''}`);
  else P.push('\n<i>Nenhum diário de obra registrado.</i>');
  return P.join('\n');
}
function textoLembretes(st, ctx) {
  const L = st.lembretes.filter(l => lembreteVivo(l) && destinos(l, [ctx.meu]).length).map(l => ({ l, p: proxDoLembrete(l) })).filter(x => x.p).sort((a, b) => a.p.localeCompare(b.p)).slice(0, 20);
  if (!L.length) return { texto: 'Você não tem lembretes ativos. Crie com /lembrar ou pelo sistema (Agenda › Lembretes e Telegram).' };
  return { texto: '<b>Seus lembretes</b>\n' + L.map((x, i) => `${i + 1}) ${quandoBR(x.p)} — ${esc(x.l.texto)}${x.l.repetir && x.l.repetir !== 'nao' ? ' <i>(' + REPETE[x.l.repetir] + ')</i>' : ''}`).join('\n') + '\n\nPara apagar, toque no número:',
    teclado: L.reduce((t, x, i) => { const b = { text: `🗑 ${i + 1}`, callback_data: 'apagar:' + x.l._id }; if (!t.length || t[t.length - 1].length >= 5) t.push([b]); else t[t.length - 1].push(b); return t; }, []) };
}

/* ── lembrete escrito em português ("amanhã 9h pagar o aluguel", "toda segunda 8h reunião", "dia 20 às 14:30 …") ──
   Devolve {texto, quando, repetir} ou null quando não achou dia nem hora. */
const DSEM = { domingo: 0, segunda: 1, terca: 2, 'terça': 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6, 'sábado': 6 };
function lerLembrete(txt, agoraS) {
  let s = ' ' + String(txt || '').replace(/\s+/g, ' ').trim() + ' ';
  const hj = agoraS.slice(0, 10); let dia = null, hora = null, rep = 'nao', semana = null, diaMes = null;
  const tira = re => { const m = s.match(re); if (m) s = s.replace(re, ' '); return m; };
  tira(/^\s*(?:me\s+)?(?:lembr[ae]r?|lembrete|avis[ae]r?)(?:\s+(?:me|-me))?(?:\s+(?:de|que|para|pra))?\s/i);
  let m;
  if ((m = tira(/\stodo\s+dia\s+(\d{1,2})(?![\d:h])\s/i))) { rep = 'mensal'; diaMes = +m[1]; }
  else if ((m = tira(/\stod[ao]s?\s+(?:as\s+|os\s+)?(segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo)s?(?:-feiras?)?\s/i))) { rep = 'semanal'; semana = DSEM[m[1].toLowerCase()]; }
  else if (tira(/\s(?:todos?\s+(?:os\s+)?dias?|diariamente)\s/i)) rep = 'diario';
  else if (tira(/\s(?:todas?\s+(?:as\s+)?semanas?|semanalmente)\s/i)) rep = 'semanal';
  else if (tira(/\s(?:todos?\s+(?:os\s+)?m[eê]s(?:es)?|mensalmente)\s/i)) rep = 'mensal';
  if ((m = tira(/\s(?:[àa]s?\s+)?(\d{1,2})\s*(?::|h)\s*(\d{2})(?:\s*(?:h|hs|horas))?\s/i))) hora = `${m[1].padStart(2, '0')}:${m[2]}`;
  else if ((m = tira(/\s(?:[àa]s?\s+)?(\d{1,2})\s*(?:h|hs|horas)\s/i))) hora = `${m[1].padStart(2, '0')}:00`;
  else if (tira(/\s(?:ao\s+)?meio[- ]dia\s/i)) hora = '12:00';
  if (hora && (+hora.slice(0, 2) > 23 || +hora.slice(3) > 59)) hora = null;
  if (tira(/\sdepois\s+de\s+amanh[ãa]\s/i)) dia = R.somaDias(hj, 2);
  else if (tira(/\samanh[ãa]\s/i)) dia = R.somaDias(hj, 1);
  else if (tira(/\shoje\s/i)) dia = hj;
  else if ((m = tira(/\s(?:dia\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s/))) {
    let a = m[3] ? +m[3] : +hj.slice(0, 4); if (a < 100) a += 2000;
    dia = `${a}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
    if (!m[3] && dia < hj) dia = `${a + 1}${dia.slice(4)}`;
  } else if ((m = tira(/\s(?:n[ao]\s+|nest[ae]\s+|pr[óo]xim[ao]\s+)?(segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo)(?:-feira)?\s/i))) semana = DSEM[m[1].toLowerCase()];
  else if (!diaMes && (m = tira(/\sdia\s+(\d{1,2})(?![\d:h/])\s/i))) diaMes = +m[1];
  if (diaMes) { const d0 = `${hj.slice(0, 8)}${String(diaMes).padStart(2, '0')}`; dia = d0 >= hj ? d0 : (() => { const x = new Date(hj.slice(0, 8) + '01T12:00:00Z'); x.setUTCMonth(x.getUTCMonth() + 1); return x.toISOString().slice(0, 8) + String(diaMes).padStart(2, '0'); })(); }
  if (semana != null && !dia) { const hoje = new Date(hj + 'T12:00:00Z').getUTCDay(); let n = (semana - hoje + 7) % 7; if (n === 0 && (hora || '08:00') <= agoraS.slice(11)) n = 7; dia = R.somaDias(hj, n); }
  if (!dia && !hora && rep === 'nao') return null;
  hora = hora || '08:00';
  if (!dia) dia = `${hj}T${hora}` > agoraS ? hj : R.somaDias(hj, 1);
  if (isNaN(new Date(dia + 'T12:00:00Z'))) return null;
  let texto = s.replace(/^\s*(?:de|que|para|pra|o|a)\s+/i, ' ').replace(/\s+/g, ' ').trim().replace(/^[,.:;-]\s*/, '');
  if (!texto) return null;
  texto = texto[0].toUpperCase() + texto.slice(1);
  return { texto, quando: `${dia}T${hora}`, repetir: rep };
}
async function criarLembrete(o, ctx) {
  const agora = agoraStr();
  const l = await R.gravarPlan({ tipo: 'lembrete', texto: String(o.texto || '').slice(0, 500), quando: o.quando, repetir: o.repetir || 'nao', para: 'eu', ativo: 'sim',
    ultimo_envio: agora, chat_id: ctx.chat, usuario_uid: ctx.uid, usuario: ctx.usuario, origem: 'telegram', criado_em: new Date().toISOString() });
  ctx.criados.push(l);
  return l;
}
async function lembrarPorTexto(txt, ctx) {
  const o = lerLembrete(txt, agoraStr());
  if (!o) {
    if (CHAVE_IA && txt.trim()) return responderIA('Crie este lembrete: ' + txt, '', ctx);
    return mandar(ctx.chat, 'Não entendi o dia ou a hora. Escreva assim: <i>/lembrar amanhã 9h pagar o aluguel</i>, <i>/lembrar 20/11 14:30 reunião na prefeitura</i> ou <i>/lembrar toda segunda 8h conferir o caixa</i>.');
  }
  if (o.repetir === 'nao' && o.quando <= agoraStr()) return mandar(ctx.chat, `Esse horário (${esc(quandoBR(o.quando))}) já passou. Mande de novo com um dia ou hora mais à frente.`);
  const l = await criarLembrete(o, ctx);
  return mandar(ctx.chat, `✅ Lembrete criado para <b>${esc(quandoBR(o.repetir === 'nao' ? o.quando : R.proximaVez(l, l.ultimo_envio)))}</b>${o.repetir !== 'nao' ? ` (${REPETE[o.repetir]})` : ''}:\n${esc(o.texto)}`, [[{ text: '🗑 Apagar este lembrete', callback_data: 'apagar:' + l._id }]]);
}

// ── IA: responde pelos números do sistema (o "retrato") e cria/apaga lembretes ──
let sdkA = null;
const Anthropic = () => { if (!sdkA) { const m = require('@anthropic-ai/sdk'); sdkA = m.default || m; } return sdkA; };
const FERRAMENTAS = [
  { name: 'criar_lembrete', strict: true, description: 'Cria um lembrete que o robô manda neste Telegram na data e hora marcadas (horário da Bahia).',
    input_schema: { type: 'object', additionalProperties: false, required: ['texto', 'quando', 'repetir'], properties: {
      texto: { type: 'string', description: 'O que lembrar, curto e claro, em português.' },
      quando: { type: 'string', description: 'Data e hora da (primeira) vez, no formato AAAA-MM-DDTHH:MM, horário da Bahia.' },
      repetir: { type: 'string', enum: ['nao', 'diario', 'semanal', 'mensal'], description: 'nao = só uma vez; diario, semanal ou mensal = repete a partir da data.' } } } },
  { name: 'apagar_lembrete', strict: true, description: 'Apaga (desliga) um lembrete ativo pelo id que aparece na lista "Lembretes ativos" do retrato.',
    input_schema: { type: 'object', additionalProperties: false, required: ['id'], properties: { id: { type: 'string', description: 'O id do lembrete.' } } } }
];
const INSTRUCOES = `Você é o assistente da Vixsul Empreendimentos (construtora de obras públicas na Bahia) no Telegram, falando com um sócio que é Administrador do sistema de gestão.
Regras:
- Responda em português do Brasil simples, curto e direto (de 1 a 12 linhas), sem palavras em inglês.
- Use SOMENTE os dados do retrato do sistema abaixo. Se a resposta não estiver nele, diga que não encontrou e indique a tela do sistema onde ver (por exemplo: Financeiro › Contas a pagar; Financeiro › Sócios e investimentos; Contratos › Medições).
- Não invente números. Para totais por obra ou por sócio, prefira as partes "já somadas". Quando somar linhas, confira uma a uma e diga o que entrou na conta (período, obra, quantos lançamentos).
- Dinheiro no formato R$ 1.234,56 e datas no formato dd/mm/aaaa.
- Formato do Telegram: sem tabelas e sem títulos com #. Pode usar **negrito** e listas com •.
- Para lembrar algo, use a ferramenta criar_lembrete (horário da Bahia; sem hora dita, use 08:00; "amanhã" é o dia seguinte a hoje). Depois confirme o dia e a hora numa frase.
- Para apagar um lembrete, use apagar_lembrete com o id da lista de lembretes ativos.
- Você não altera mais nada no sistema (contas, aportes, obras, tarefas): para isso, diga em que tela fazer.`;
async function ferramenta(nome, inp, ctx) {
  if (nome === 'criar_lembrete') {
    const q = String(inp.quando || '').replace(' ', 'T').slice(0, 16), rep = REPETE[inp.repetir] ? inp.repetir : 'nao';
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(q) || isNaN(new Date(q + ':00Z'))) return 'Data inválida: use AAAA-MM-DDTHH:MM.';
    if (rep === 'nao' && q <= agoraStr()) return 'Essa data e hora já passaram. Peça à pessoa um horário futuro.';
    if (!String(inp.texto || '').trim()) return 'Falta o texto do lembrete.';
    const l = await criarLembrete({ texto: String(inp.texto).trim(), quando: q, repetir: rep }, ctx);
    return `Lembrete criado (id ${l._id}): ${quandoBR(rep === 'nao' ? q : R.proximaVez(l, l.ultimo_envio))}${rep !== 'nao' ? ', ' + REPETE[rep] : ''}.`;
  }
  if (nome === 'apagar_lembrete') {
    const l = ctx.st.lembretes.find(x => String(x._id) === String(inp.id).trim());
    if (!l || l.ativo === 'nao') return 'Não achei um lembrete ativo com esse id.';
    await R.gravarPlan({ ...l, ativo: 'nao', adiar_ate: '' }); l.ativo = 'nao';
    return 'Lembrete apagado: ' + l.texto;
  }
  return 'Ferramenta desconhecida.';
}
async function perguntarIA(pergunta, anterior, ctx) {
  const Anth = Anthropic(), cli = new Anth({ apiKey: CHAVE_IA, timeout: 50000, maxRetries: 0 });
  const modelo = MODELOS.includes(ctx.st.cfg.modelo_ia) ? ctx.st.cfg.modelo_ia : (process.env.ANTHROPIC_MODEL || 'claude-opus-5-5');
  const D = ctx.D || (ctx.D = await R.carregar());
  // o retrato vai no "system" com marca de cache: perguntas seguidas em poucos minutos saem bem mais baratas
  const sistema = [{ type: 'text', text: INSTRUCOES }, { type: 'text', text: R.retrato(D), cache_control: { type: 'ephemeral' } }];
  const ag = agoraStr();
  const msgs = [{ role: 'user', content: `Agora: ${diaSem(ag.slice(0, 10))}, ${R.brAno(ag.slice(0, 10))} ${ag.slice(11)} (horário da Bahia).${anterior ? `\nA pessoa está respondendo a esta mensagem anterior do robô:\n"""${String(anterior).slice(0, 1500)}"""` : ''}\n\nMensagem: ${String(pergunta).slice(0, 2000)}` }];
  for (let volta = 0; volta < 4; volta++) {
    const r = await cli.beta.messages.create({ model: modelo, max_tokens: 6000, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      output_config: { effort: ctx.st.cfg.esforco_ia === 'medium' ? 'medium' : 'low' }, system: sistema, tools: FERRAMENTAS, messages: msgs });
    if (r.stop_reason === 'refusal') return 'Não posso ajudar com esse pedido.';
    const usos = (r.content || []).filter(b => b.type === 'tool_use');
    if (r.stop_reason === 'tool_use' && usos.length) {
      msgs.push({ role: 'assistant', content: r.content });
      const res = [];
      for (const b of usos) { let saida; try { saida = await ferramenta(b.name, b.input || {}, ctx); } catch (e) { saida = 'Erro: ' + (e.message || e); } res.push({ type: 'tool_result', tool_use_id: b.id, content: String(saida) }); }
      msgs.push({ role: 'user', content: res });
      continue;
    }
    const txt = (r.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (txt) return txt;
    if (r.stop_reason === 'max_tokens') return 'A resposta ficou grande demais — pergunte de um jeito mais específico (uma obra, um mês).';
    return 'Não consegui responder agora. Tente de novo em instantes.';
  }
  return 'Não consegui terminar a resposta — tente perguntar de outro jeito.';
}
// o texto da IA vira HTML do Telegram: escapa tudo e transforma **negrito** em <b>
const paraHtml = t => esc(t).replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').replace(/^#{1,6}\s*/gm, '');
function erroIA(e) {
  const S = (() => { try { return Anthropic(); } catch (x) { return null; } })(), eh = n => S && typeof S[n] === 'function' && e instanceof S[n];
  if (eh('AuthenticationError') || e.status === 401) return 'A chave da IA (ANTHROPIC_API_KEY) na Vercel não foi aceita — confira se foi copiada inteira.';
  if (eh('RateLimitError') || e.status === 429) return 'A IA está com muitos pedidos agora (ou acabou o crédito da conta da Anthropic). Tente daqui a pouco.';
  if (eh('APIConnectionTimeoutError') || /timeout|timed out/i.test(e.message || '')) return 'A IA demorou demais para responder. Tente uma pergunta mais curta.';
  if (e.status === 400 && /credit|billing|balance/i.test(e.message || '')) return 'Acabou o crédito da conta da Anthropic (console.anthropic.com › Billing).';
  return 'A IA não respondeu agora (' + String(e.message || e).slice(0, 160) + ').';
}
// sem IA (ou se a IA falhar): o próprio sistema entende as perguntas mais comuns (grátis)
async function responderLivre(texto, ctx) {
  const D = ctx.D || (ctx.D = await R.carregar());
  const r = P.responder(texto, D, { agenda: () => textoAgenda(D, R.hojeBahia()) });
  if (r) return mandar(ctx.chat, r);
  // com a chave grátis da Groq, o pedido que as regras não entenderam ainda pode virar uma ação (conta, tarefa…)
  const ia = await BOT.textoIA(ctx, texto);
  if (ia === true) return;
  if (ia && ia.lembrete) return lembreteDaIA(ia.lembrete, texto, ctx);
  return mandar(ctx.chat, 'Não entendi. ' + P.EXEMPLOS + '\n\nPara lançar uma conta: <i>lança 350 de cimento na obra X</i> (ou mande a foto do boleto).\nComandos: /hoje /contas /conta /pagar /nota /tarefa /ajuda');
}
async function responderIA(texto, anterior, ctx) {
  let resp;
  try { resp = paraHtml(await perguntarIA(texto, anterior, ctx)); }
  catch (e) {
    console.error('IA', e && e.message);
    const D = ctx.D || (ctx.D = await R.carregar()), livre = P.responder(texto, D, { agenda: () => textoAgenda(D, R.hojeBahia()) });
    if (livre) return mandar(ctx.chat, livre);
    resp = esc(erroIA(e));
  }
  const tec = ctx.criados.length ? ctx.criados.map(l => [{ text: '🗑 Apagar o lembrete criado' + (ctx.criados.length > 1 ? ' (' + R.br(l.quando.slice(0, 10)) + ')' : ''), callback_data: 'apagar:' + l._id }]) : undefined;
  return mandar(ctx.chat, resp, tec);
}

// ── ligar uma conversa ao sistema (/start CÓDIGO do link de vínculo) ──
async function vincular(msg, cod, st) {
  const chat = String(msg.chat.id), agora = Date.now(), h = hashCodigo(cod);
  const peds = (st.cfg.pedidos || []).filter(p => new Date(p.expira).getTime() > agora);
  const ped = peds.find(p => iguais(p.hash, h));
  if (!ped) return mandar(chat, 'Este link de vínculo não vale mais (passou de 30 minutos ou já foi usado). No sistema, gere outro em <b>Agenda › Lembretes e Telegram › Ligar meu Telegram</b>.');
  await gravarCfg(st, { pedidos: peds.filter(p => p !== ped) });
  const ja = st.todas.find(c => String(c.chat_id) === chat), f = msg.from || {};
  const novo = { ...(ja || {}), tipo: 'telegram_chat', chat_id: chat, nome: [f.first_name, f.last_name].filter(Boolean).join(' ') || f.username || 'Telegram', usuario: ped.usuario, usuario_uid: ped.uid,
    ativo: 'sim', resumo: (ja && ja.resumo) || 'sim', ligado_em: new Date().toISOString() };
  novo.assinatura = assinaturaChat(novo);
  await R.gravarPlan(novo);
  return mandar(chat, `✅ Pronto, ${esc(f.first_name || '')}! Este Telegram está ligado ao sistema da Vixsul (usuário <b>${esc(ped.usuario)}</b>).\n\n` + ajuda());
}

// ── mensagens e botões que chegam do Telegram ──
const vistos = new Set();   // o Telegram repete a entrega se demorar: a mesma mensagem não é respondida duas vezes
async function aoBotao(cq, st) {
  const chat = cq.message && cq.message.chat && String(cq.message.chat.id);
  const ok = txt => tg('answerCallbackQuery', { callback_query_id: cq.id, text: txt || '' }).catch(() => {});
  if (!chat || !st.chats.some(c => String(c.chat_id) === chat)) return ok('Conversa não ligada ao sistema.');
  // botões dos cartões do robô (conta, baixa, nota, tarefa, reunião, diesel)
  if (/^[be]:/.test(String(cq.data || ''))) {
    const meu = st.chats.find(c => String(c.chat_id) === chat), ctx = { chat, meu, uid: meu.usuario_uid || '', usuario: meu.usuario || '', st };
    return String(cq.data).startsWith('e:') ? BOT.botaoEmail(ctx, cq) : BOT.botao(ctx, cq);   // e: = aviso de boleto/nota do e-mail
  }
  const [acao, id, extra] = String(cq.data || '').split(':');
  const l = st.lembretes.find(x => String(x._id) === id);
  if (!l) return ok('Lembrete não encontrado.');
  const kb = ((cq.message.reply_markup || {}).inline_keyboard || []).map(r => r.filter(b => b.callback_data !== cq.data)).filter(r => r.length);
  const teclado = t => tg('editMessageReplyMarkup', { chat_id: chat, message_id: cq.message.message_id, reply_markup: { inline_keyboard: t } }).catch(() => {});
  if (acao === 'apagar') {
    if (l.ativo === 'nao') { await teclado(kb); return ok('Já estava apagado.'); }
    await R.gravarPlan({ ...l, ativo: 'nao', adiar_ate: '' }); await teclado(kb);
    await mandar(chat, `🗑 Lembrete apagado: ${esc(l.texto)}`); return ok('Apagado');
  }
  if (acao === 'adiar') {
    const ag = agoraStr(), ate = extra === 'amanha' ? R.somaDias(ag.slice(0, 10), 1) + 'T' + (String(l.quando || '').slice(11, 16) || ag.slice(11)) : somaMin(ag, Math.min(1440, Math.max(5, +extra || 60)));
    await R.gravarPlan({ ...l, adiar_ate: ate }); await teclado([]);
    await mandar(chat, `⏱ Combinado: lembro de novo ${esc(quandoBR(ate))}.`); return ok('Adiado');
  }
  if (acao === 'feito') { await teclado([]); if (l.adiar_ate) await R.gravarPlan({ ...l, adiar_ate: '' }); return ok('✅ Feito'); }
  return ok('');
}
async function aoReceber(up) {
  if (up.update_id != null) { if (vistos.has(up.update_id)) return; vistos.add(up.update_id); if (vistos.size > 300) vistos.delete(vistos.values().next().value); }
  const st = await estadoBanco();
  if (up.callback_query) return aoBotao(up.callback_query, st);
  const msg = up.message; if (!msg || !msg.chat) return;
  const chat = String(msg.chat.id);
  if (msg.chat.type !== 'private') return mandar(chat, 'Eu só converso em conversa particular.');
  const texto = String(msg.text || msg.caption || '').trim();
  const mc = texto.match(/^\/([a-z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i), cmd = mc ? mc[1].toLowerCase() : '', arg = mc ? (mc[2] || '').trim() : texto;
  if (cmd === 'start' && arg) return vincular(msg, arg, st);
  const meu = st.chats.find(c => String(c.chat_id) === chat);
  if (!meu) return mandar(chat, 'Olá! Este robô é particular da <b>Vixsul Empreendimentos</b>. Para usar, o Administrador gera o link de vínculo no sistema: <b>Agenda › Lembretes e Telegram › Ligar meu Telegram</b>.');
  const ctx = { chat, meu, uid: meu.usuario_uid || '', usuario: meu.usuario || '', st, criados: [], D: null };
  // foto, PDF ou XML (boleto, nota, comprovante): o robô lê e prepara a conta
  if ((msg.photo && msg.photo.length) || msg.document) return BOT.arquivo(ctx, msg);
  // áudio: vira texto (Groq, grátis) e segue como se tivesse sido escrito
  let falado = '';
  if (msg.voice || msg.audio || msg.video_note) { falado = await BOT.audio(ctx, msg); if (!falado) return; }
  if (!texto && !falado) return mandar(chat, 'Eu entendo texto, foto, PDF, XML e áudio. Mande /ajuda para ver o que eu faço.');
  tg('sendChatAction', { chat_id: chat, action: 'typing' }).catch(() => {});
  const dados = async () => ctx.D || (ctx.D = await R.carregar()), hj = R.hojeBahia();
  if (falado) return livre(falado, ctx, '', true);
  if (cmd && await BOT.comando(ctx, cmd, arg)) return;
  switch (cmd) {
    case 'start': case 'ajuda': case 'help': return mandar(chat, ajuda());
    case 'hoje': return mandar(chat, R.resumoTelegram(await R.montar({}, await dados())));
    case 'contas': return mandar(chat, textoContas(await dados(), hj));
    case 'agenda': return mandar(chat, textoAgenda(await dados(), hj));
    case 'aportes': return mandar(chat, textoAportes(await dados(), hj));
    case 'obras': return mandar(chat, textoObras(await dados()));
    case 'obra': return mandar(chat, arg ? textoObra(await dados(), arg, hj) : 'Qual obra? Exemplo: <i>/obra Itarantim</i> (os números de todas: /obras).');
    case 'fornecedor': case 'forn': return mandar(chat, textoFornecedor(await dados(), await R.ler('fornecedores').catch(() => []), arg, hj));
    case 'buscar': case 'busca': case 'procurar': return mandar(chat, textoBuscar(await dados(), arg, hj));
    case 'receber': case 'areceber': return mandar(chat, textoReceber(await dados(), hj));
    case 'avisos': case 'destinos': return mandar(chat, await textoAvisos(st));
    case 'app': case 'instalar': return mandar(chat, `📲 <b>App da Vixsul</b>\nPara instalar no celular (ou no computador), abra este link — ele já abre na instalação:\n${SITE}/?instalar=1\n\nMande este link para a equipe. No Android é só tocar em <b>Instalar</b>; no iPhone a tela mostra os 3 toques no Safari (ou instala pelos Ajustes).`);
    case 'lembretes': { const x = textoLembretes(st, ctx); return mandar(chat, x.texto, x.teclado); }
    case 'relatorio': case 'relatório': case 'semana': { await enviarRelatorio([meu], await dados(), hj); return; }
    case 'caixa': return mandar(chat, textoCaixa(RL.caixa(await dados(), hj)));
    case 'cobrar': case 'cobranca': { const n = +arg || 30, L = RL.cobrancas(await dados(), hj, n); if (!L.length) return mandar(chat, `Nenhuma nota emitida há ${n} dias ou mais esperando pagamento. 🎉`); for (const c of L.slice(0, 8)) await mandar(chat, textoCobranca(c)); return L.length > 8 ? mandar(chat, `… e mais ${L.length - 8} nota(s). Veja em Faturamento e recebimentos.`) : null; }
    case 'fechamento': return mandar(chat, RL.fechamento(await dados(), hj).tg);
    case 'chuva': { const L = await RL.chuva(await dados(), hj); return mandar(chat, L.length ? textoChuva(L) : '☀️ Sem previsão de chuva para amanhã nas cidades das obras em andamento.'); }
    case 'lembrar': case 'lembrete': return arg ? lembrarPorTexto(arg, ctx) : mandar(chat, 'Escreva o lembrete junto: <i>/lembrar amanhã 9h pagar o aluguel</i>.');
    case '': break;
    default: return mandar(chat, 'Não conheço esse comando.\n\n' + ajuda());
  }
  return livre(texto, ctx, (msg.reply_to_message && (msg.reply_to_message.text || msg.reply_to_message.caption)) || '', false);
}
// texto livre (escrito ou falado): resposta a um cartão do robô, pedido (conta, baixa, nota…), lembrete ou pergunta
async function livre(texto, ctx, anterior, falado) {
  const r = await BOT.texto(ctx, texto, { audio: falado });
  if (r === true) return;
  if (r && r.lembrete) return lembreteDaIA(r.lembrete, texto, ctx);
  const t = BU.semOi(texto), hj = R.hojeBahia(), dados = async () => ctx.D || (ctx.D = await R.carregar());   // sem o "oi, bom dia…" do começo
  if (/^(?:me\s+)?(?:lembr|avis[ae]\b)/i.test(t)) return lembrarPorTexto(t, ctx);   // lembrete: o leitor de frases resolve (grátis)
  // "qual o pix do fornecedor X?", "como está a obra de Itarantim?" — respondidos sem IA
  const mF = t.match(/^(?:qual|quais|me\s+(?:passa|manda|d[áa]|envia))\s+(?:[ée]\s+)?(?:o\s+|a\s+|os\s+|as\s+)?(?:pix|chave(?:\s+(?:do\s+)?pix)?|cnpj|cpf|telefone|whats(?:app)?|contato|dados\s+banc[áa]rios|banco)\s+d[oa]s?\s+(?:fornecedor\s+)?(.{2,80}?)\s*\??\s*$/i);
  if (mF) return mandar(ctx.chat, textoFornecedor(await dados(), await R.ler('fornecedores').catch(() => []), mF[1], hj));
  const mO = t.match(/^(?:como\s+(?:est[áa]|anda|vai)|qual\s+[ée]\s+a\s+situa[çc][ãa]o|situa[çc][ãa]o|resumo|n[úu]meros)\s+d[ae]\s+obra\s+(?:d[ea]\s+|do\s+)?(.{2,80}?)\s*\??\s*$/i);
  if (mO) return mandar(ctx.chat, textoObra(await dados(), mO[1], hj));
  if (CHAVE_IA) return responderIA(texto, anterior, ctx);
  return responderLivre(texto, ctx);
}
// lembrete entendido no áudio (quando o leitor de frases não achou o dia e a hora)
async function lembreteDaIA(o, texto, ctx) {
  if (lerLembrete(texto, agoraStr())) return lembrarPorTexto(texto, ctx);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(o.quando || '') || o.quando <= agoraStr()) return lembrarPorTexto(texto, ctx);
  const l = await criarLembrete(o, ctx);
  return mandar(ctx.chat, `✅ Lembrete criado para <b>${esc(quandoBR(o.quando))}</b>:\n${esc(o.texto)}`, [[{ text: '🗑 Apagar este lembrete', callback_data: 'apagar:' + l._id }]]);
}

// ── a cada 15 minutos (tarefa do GitHub): lembretes, reuniões, resumo do dia, contas de hoje, aportes e o e-mail ──
async function lerJson(caminho) { const r = await fetch(`${R.URL_SB}/rest/v1/${caminho}`, { headers: R.cabecalhos() }); if (!r.ok) throw new Error('banco: erro ' + r.status); return r.json(); }
async function tick() {
  const ag = agoraStr(), hj = ag.slice(0, 10), hora = ag.slice(11), feito = [];
  if (hora >= '07:00') { try { const r = await require('./avisos').diario(); if (r && r.enviado) feito.push('e-mail do dia'); } catch (e) { feito.push('e-mail: ' + e.message); } }
  if (!TOKEN) return { ok: true, feito, msg: 'O robô do Telegram ainda não foi configurado.' };
  const st = await estadoBanco(), cfg = st.cfg, mud = {};
  await BOT.limpar().catch(() => {});   // rascunhos de conversa e avisos de e-mail vencidos saem do banco
  // teste automático da Groq (a cada 12 h; 1 h se algo falhou): acha os modelos de foto, áudio e texto que funcionam
  try { const g = await BOT.testarGroq(); if (g) feito.push(`groq testada: foto ${g.foto || 'NENHUM'} · áudio ${g.audio || 'NENHUM'} · texto ${g.texto || 'NENHUM'}`); } catch (e) { feito.push('groq: ' + e.message); }
  // o robô se liga sozinho (webhook e comandos) assim que a chave aparece na Vercel — e de novo quando os comandos mudam
  if (cfg.bot_versao !== VERSAO_BOT) { try { await ligarRobo(st); feito.push('robô ligado: @' + st.cfg.bot); } catch (e) { feito.push('robô: ' + e.message); } }
  const chats = st.chats, temTg = chats.length > 0;
  if (!temTg && !E.emailPronto()) return { ok: true, feito, msg: 'Nenhum Telegram ligado.' };
  let D = null; const dados = async () => D || (D = await R.carregar());
  // 1) lembretes que chegaram na hora (ou adiados) — só com Telegram ligado (senão esperam)
  for (const l of (temTg ? st.lembretes : [])) {
    if (!lembreteVivo(l)) continue;
    const prox = proxDoLembrete(l);
    if (!prox || prox > ag) continue;
    const para = destinos(l, chats);
    const atraso = minutos(prox, ag), rep = l.repetir && l.repetir !== 'nao';
    await R.gravarPlan({ ...l, ultimo_envio: ag, adiar_ate: '', ...(rep ? {} : { enviado: 'sim' }) });
    if (!para.length) continue;
    const id = l._id, txt = `⏰ <b>Lembrete</b>\n${esc(l.texto)}${rep ? `\n<i>(${REPETE[l.repetir]})</i>` : ''}${atraso > 45 ? `\n<i>era para ${esc(quandoBR(prox))}</i>` : ''}`;
    await paraTodos(para, txt, [[{ text: '⏱ Daqui a 1 hora', callback_data: `adiar:${id}:60` }, { text: '⏱ Amanhã', callback_data: `adiar:${id}:amanha` }], [{ text: '✅ Feito', callback_data: `feito:${id}` }]]);
    feito.push('lembrete ' + id);
  }
  // 2) aviso antes das reuniões de hoje (padrão: 60 minutos antes)
  if (temTg && cfg.aviso_reuniao !== 'nao') {
    const antes = Math.min(240, Math.max(10, +cfg.aviso_reuniao_min || 60));
    const reus = (await lerJson(`reunioes?select=id,row_data&row_data->>data=like.${hj}*&limit=200`)).map(x => ({ ...(x.row_data || {}), _id: x.id })).filter(r => !r._lixeira_em && R.reuniaoValida(r));
    const avisadas = (cfg.reunioes_avisadas || []).filter(k => String(k).split('|')[1] >= hj);
    for (const r of reus) {
      const h = String(r.hora || '').slice(0, 5); if (!/^\d{2}:\d{2}$/.test(h)) continue;
      const ini = `${hj}T${h}`, falta = minutos(ag, ini), k = `${r._id}|${ini}`;
      if (falta < 0 || falta > antes || avisadas.includes(k)) continue;
      avisadas.push(k);
      await paraTodos(chatsPara(st, 'reuniao'), `📅 <b>Reunião às ${h}</b> (daqui a ${falta} min)\n${esc(r.titulo || r.tipo || 'Reunião')}${r.titulo_obra ? ' — ' + esc(r.titulo_obra) : ''}${r.local ? '\nLocal: ' + esc(r.local) : ''}${r.link ? '\n' + esc(r.link) : ''}`);
      feito.push('reunião ' + r._id);
    }
    if (avisadas.length !== (cfg.reunioes_avisadas || []).length) mud.reunioes_avisadas = avisadas;
  }
  // 3) resumo do dia (padrão 7h)
  const hRes = /^\d{2}:\d{2}$/.test(cfg.resumo_hora || '') ? cfg.resumo_hora : '07:00';
  if (temTg && cfg.resumo !== 'nao' && hora >= hRes && cfg.ultimo_resumo !== hj) {
    await gravarCfg(st, { ...mud, ultimo_resumo: hj });   // marca antes: dois disparos não repetem
    const txt = R.resumoTelegram(await R.montar({}, await dados()));
    await paraTodos(chatsPara(st, 'resumo'), txt);
    feito.push('resumo do dia');
  }
  // 4) às 16h: contas que vencem hoje e ainda estão em aberto
  if (temTg && cfg.aviso_tarde !== 'nao' && hora >= '16:00' && st.cfg.ultima_tarde !== hj) {
    mud.ultima_tarde = hj;
    const L = R.contasAbertas(D || { custos: await R.ler('custos'), despesas: await R.ler('despesas') }, hj).filter(x => x.v === hj);
    if (L.length) { await paraTodos(chatsPara(st, 'tarde'), `⚠️ <b>Ainda em aberto hoje</b>: ${L.length} conta(s) que vencem hoje · ${R.reais(L.reduce((s, x) => s + x.valor, 0))}\n` + L.slice(0, 15).map(x => `• ${esc(x.forn)} — ${R.reais(x.valor)}${x.onde ? ' <i>(' + esc(x.onde) + ')</i>' : ''}`).join('\n')); feito.push('contas de hoje'); }
  }
  // 5) aportes lançados (novos ou somados ao mês) desde a última olhada
  if (temTg && cfg.aviso_aportes !== 'nao') {
    const rows = await lerJson('aportes?select=id,v:row_data->>valor_aportado,v2:row_data->>valor,q:row_data->>quem_aportou,o:row_data->>titulo_obra,m:row_data->>movimento,d:row_data->>data_aporte,x:row_data->>_lixeira_em&order=id.asc&limit=5000');
    const atual = {}; rows.filter(a => !a.x).forEach(a => { atual[a.id] = Math.round(R.num(a.v != null ? a.v : a.v2) * 100) / 100; });
    const antes = st.cfg.aportes_vistos;
    if (!antes) mud.aportes_vistos = atual;
    else {
      const novos = rows.filter(a => !a.x && !/devolu/i.test(a.m || '') && atual[a.id] > 0 && (antes[a.id] == null || atual[a.id] > antes[a.id] + 0.005))
        .map(a => ({ ...a, dif: antes[a.id] == null ? atual[a.id] : atual[a.id] - antes[a.id], somado: antes[a.id] != null }));
      if (JSON.stringify(atual) !== JSON.stringify(antes)) mud.aportes_vistos = atual;
      if (novos.length) {
        const tot = novos.reduce((s, a) => s + a.dif, 0);
        const txt = novos.length > 6 ? `💰 <b>${novos.length} aportes lançados</b> no sistema · ${R.reais(tot)}`
          : novos.map(a => `💰 <b>Aporte ${a.somado ? 'somado ao mês' : 'lançado'}</b>: ${esc(a.q || 'Sócio')} · ${R.reais(a.dif)}${a.somado ? ` (total do mês ${R.reais(atual[a.id])})` : ''}${a.o ? ' · ' + esc(a.o) : ''}${a.d ? ' · ' + R.br(R.iso(a.d)) : ''}`).join('\n');
        await paraTodos(chatsPara(st, 'aportes'), txt); feito.push('aportes');
      }
    }
  }
  const dSem = new Date(hj + 'T12:00:00Z').getUTCDay();
  // 6) relatório semanal dos sócios (segunda, 7h): resumo + PDF no Telegram e e-mail com o PDF
  if (cfg.relatorio_semanal !== 'nao' && dSem === 1 && hora >= '07:00' && st.cfg.ultimo_relatorio !== hj) {
    await gravarCfg(st, { ...mud, ultimo_relatorio: hj });
    const { rel, pdf } = await enviarRelatorio(chatsPara(st, 'relatorio'), await dados(), hj);
    if (await emailAuto(st, 'relatorio', rel.titulo, rel.partes, pdf ? [{ filename: rel.arquivo, content: pdf, contentType: 'application/pdf' }] : null)) feito.push('relatório por e-mail');
    feito.push('relatório semanal');
  }
  // 7) fechamento do mês (dia 1º a 3, a partir das 8h): o que falta fechar do mês que passou
  if (cfg.fechamento_mes !== 'nao' && +hj.slice(8, 10) <= 3 && hora >= '08:00' && st.cfg.ultimo_fechamento !== hj.slice(0, 7)) {
    await gravarCfg(st, { ...mud, ultimo_fechamento: hj.slice(0, 7) });
    const fx = RL.fechamento(await dados(), hj);
    await paraTodos(chatsPara(st, 'fechamento'), fx.tg); await emailAuto(st, 'fechamento', fx.titulo, fx.partes);
    feito.push('fechamento do mês');
  }
  // 8) às 8h: alerta de caixa (saldo negativo nos próximos 15 dias) e cobrança das notas paradas (dias úteis)
  if (hora >= '08:00' && st.cfg.ultimo_8h !== hj && (cfg.alerta_caixa !== 'nao' || cfg.cobranca_dias !== '0')) {
    mud.ultimo_8h = hj;
    if (cfg.alerta_caixa !== 'nao') {
      const cx = RL.caixa(await dados(), hj), ant = st.cfg.caixa_alerta || {};
      if (cx && cx.neg) {
        if (!ant.neg || cx.neg < ant.neg || R.diasEntre(ant.dia || '2000-01-01', hj) >= 3) { mud.caixa_alerta = { dia: hj, neg: cx.neg }; await paraTodos(chatsPara(st, 'caixa'), textoCaixa(cx)); await emailAuto(st, 'caixa', 'Alerta de caixa', [['Alerta de caixa', semTags(textoCaixa(cx))]]); feito.push('alerta de caixa'); }
      } else if (ant.neg) mud.caixa_alerta = {};
    }
    const nCob = cfg.cobranca_dias === '0' ? 0 : (+cfg.cobranca_dias || 30);
    if (nCob && dSem >= 1 && dSem <= 5) {
      const D1 = await dados(), av = { ...(st.cfg.cobrancas || {}) }, todas = RL.cobrancas(D1, hj, nCob), vivas = new Set(RL.cobrancas(D1, hj, 0).map(c => c.chave));
      const L = todas.filter(c => !av[c.chave] || R.diasEntre(av[c.chave], hj) >= 7).slice(0, 5);
      for (const c of L) { av[c.chave] = hj; await paraTodos(chatsPara(st, 'cobranca'), textoCobranca(c));
        await emailAuto(st, 'cobranca', `Cobrança: NF ${c.x.n}`, [['Nota parada', `NF ${c.x.n}${c.x.obra ? ' · ' + c.x.obra : ''} · emitida em ${R.brAno(c.x.e)} (${c.dias} dias) · ${R.reais(c.x.liq)} a receber${c.contratante ? ' · ' + c.contratante : ''}`], ['Texto pronto para mandar', c.texto]]); }
      Object.keys(av).forEach(k => { if (!vivas.has(k)) delete av[k]; });   // a nota recebida sai da lista
      mud.cobrancas = av; if (L.length) feito.push('cobranças ' + L.length);
    }
  }
  // 9) às 17h: chuva amanhã na cidade das obras em andamento (INMET)
  if (cfg.aviso_chuva !== 'nao' && hora >= '17:00' && st.cfg.ultima_chuva !== hj) {
    mud.ultima_chuva = hj;
    try { const L = await RL.chuva(await dados(), hj); if (L.length) { await paraTodos(chatsPara(st, 'chuva'), textoChuva(L)); await emailAuto(st, 'chuva', 'Previsão de chuva amanhã', [['Previsão de chuva amanhã', semTags(textoChuva(L))]]); feito.push('chuva'); } } catch (e) { feito.push('chuva: ' + e.message); }
  }
  // 10) boletos e notas que chegaram no e-mail (Gmail, só leitura): aviso no Telegram com "Lançar conta" e "Ignorar"
  if (temTg && cfg.email_caixa !== 'nao' && BOT.temGmail()) {
    try { const r = await BOT.caixaEmail(chatsPara(st, 'email')); if (r.avisos) feito.push(`e-mail: ${r.avisos} aviso(s) de cobrança`); else if (r.lidos) feito.push(`e-mail: ${r.lidos} novo(s), nenhum de cobrança`); }
    catch (e) { feito.push('caixa de e-mail: ' + e.message); }
  }
  if (Object.keys(mud).length) await gravarCfg(st, mud);
  return { ok: true, feito };
}

// ── ligar o robô: aponta o Telegram para esta função (webhook com senha) e cadastra os comandos ──
const VERSAO_BOT = '6';   // mude quando a lista de comandos mudar: o robô se recadastra sozinho na próxima tarefa
async function ligarRobo(st) {
  let eu;
  try { eu = await tg('getMe', {}); } catch (e) { throw new Error(e.codigo === 401 || e.codigo === 404 ? 'A chave do robô na Vercel não foi aceita pelo Telegram — confira se foi copiada inteira.' : e.message); }
  await tg('setWebhook', { url: URL_WEBHOOK, secret_token: segredoWebhook(), allowed_updates: ['message', 'callback_query'], drop_pending_updates: true, max_connections: 10 });
  await tg('setMyCommands', { commands: [['hoje', 'Resumo do dia'], ['conta', 'Lançar uma conta (obra, rateio ou empresa)'], ['pagar', 'Dar baixa numa conta'], ['aprovar', 'Contas aguardando aprovação'], ['recebi', 'Registrar o recebimento de uma nota'], ['nota', 'Buscar nota fiscal (PDF e XML)'], ['doc', 'Documentos da empresa e das obras'], ['tarefa', 'Nova tarefa'], ['concluir', 'Marcar tarefa como feita'], ['reuniao', 'Marcar reunião'], ['diesel', 'Diesel da retroescavadeira'], ['contas', 'Contas a pagar'], ['receber', 'O que falta receber'], ['buscar', 'Procurar nas contas'], ['fornecedor', 'Ficha de um fornecedor (com PIX)'], ['obra', 'Ficha de uma obra'], ['agenda', 'Reuniões e tarefas'], ['aportes', 'Aportes do mês e do ano'], ['obras', 'Números das obras'], ['avisos', 'Para onde vão os avisos automáticos'], ['app', 'Link para instalar o app no celular'], ['lembretes', 'Meus lembretes'], ['lembrar', 'Criar um lembrete'], ['relatorio', 'Relatório da semana (PDF)'], ['caixa', 'Caixa dos próximos 15 dias'], ['cobrar', 'Notas paradas para cobrar'], ['fechamento', 'Fechamento do mês'], ['chuva', 'Chuva amanhã nas obras'], ['cancelar', 'Desistir do que está pela metade'], ['ajuda', 'O que o robô faz']].map(([command, description]) => ({ command, description })) }).catch(() => {});
  await tg('setMyDescription', { description: 'Robô particular do sistema de gestão da Vixsul Empreendimentos: lança contas, dá baixa, busca notas, cria tarefas e reuniões, lê fotos de boletos e entende áudio.' }).catch(() => {});
  await gravarCfg(st, { bot: eu.username, bot_versao: VERSAO_BOT, bot_ligado_em: new Date().toISOString() });
}
// ── o que o sistema pede (Administrador logado) ──
async function estadoPublico(st, comWebhook, uid) {
  const o = { ok: true, token: !!TOKEN, ia: !!CHAVE_IA, groq: BOT.temGroq(), bot: st.cfg.bot || '', modelos: MODELOS,
    cfg: ['resumo', 'resumo_hora', 'aviso_reuniao', 'aviso_reuniao_min', 'aviso_tarde', 'aviso_aportes', 'relatorio_semanal', 'alerta_caixa', 'cobranca_dias', 'aviso_chuva', 'fechamento_mes', 'email_caixa', 'modelo_ia', 'esforco_ia'].reduce((a, k) => { a[k] = st.cfg[k] || ''; return a; }, {}),
    gmailLer: BOT.temGmail(), caixa: await BOT.infoCaixa(),
    email: E.emailPronto(), destinos: st.cfg.destinos || {},
    chats: st.chats.map(c => ({ id: c._id, nome: c.nome || '', usuario: c.usuario || '', ligado_em: c.ligado_em || '', resumo: c.resumo || 'sim', meu: !!uid && c.usuario_uid === uid })) };
  if (TOKEN && comWebhook) { try { const w = await tg('getWebhookInfo', {}); o.webhook = w.url === URL_WEBHOOK; o.pendentes = w.pending_update_count || 0; o.erro = w.last_error_message || ''; } catch (e) { o.erroTelegram = e.message; } }
  try { Object.assign(o, await BOT.estadoGroq()); } catch (e) { o.groqOk = false; o.groqMsg = e.message; }
  return o;
}
async function acaoSistema(b, l) {
  const st = await estadoBanco(), uid = (l.p && l.p.app_uid) || '';
  if (b.acao === 'estado') return estadoPublico(st, true, uid);
  if (!TOKEN) return { ok: false, msg: 'Falta a chave do robô (TELEGRAM_BOT_TOKEN) na Vercel.' };
  if (b.acao === 'conectar') {
    try { await ligarRobo(st); } catch (e) { return { ok: false, msg: e.message }; }
    return estadoPublico(st, true, uid);
  }
  if (b.acao === 'vincular') {
    if (!st.cfg.bot) return { ok: false, msg: 'Primeiro clique em "Ligar o robô".' };
    const cod = crypto.randomBytes(16).toString('hex'), expira = new Date(Date.now() + 30 * 60e3).toISOString();
    const peds = (st.cfg.pedidos || []).filter(p => new Date(p.expira).getTime() > Date.now()).slice(-4);
    await gravarCfg(st, { pedidos: peds.concat({ hash: hashCodigo(cod), usuario: (l.p && l.p.nome) || 'Administrador', uid: (l.p && l.p.app_uid) || '', expira }) });
    return { ok: true, link: `https://t.me/${st.cfg.bot}?start=${cod}`, expira, bot: st.cfg.bot };
  }
  const meus = st.chats.filter(c => !l.p || !l.p.app_uid || c.usuario_uid === l.p.app_uid), alvo = meus.length ? meus : st.chats;
  if (b.acao === 'testar') {
    if (!alvo.length) return { ok: false, msg: 'Nenhum Telegram ligado ainda — clique em "Ligar meu Telegram".' };
    const f = await paraTodos(alvo, `✅ <b>Teste do sistema Vixsul</b>\nO Telegram está ligado. Mande /ajuda para ver o que eu faço.`);
    return { ok: f.length < alvo.length, enviados: alvo.length - f.length, falhas: f };
  }
  if (b.acao === 'resumo') {
    if (!alvo.length) return { ok: false, msg: 'Nenhum Telegram ligado ainda.' };
    const f = await paraTodos(alvo, R.resumoTelegram(await R.montar({})));
    return { ok: f.length < alvo.length, enviados: alvo.length - f.length, falhas: f };
  }
  if (b.acao === 'relatorio') {
    // manda agora como na segunda-feira: para os Telegrams e e-mails escolhidos em "Para quem vai"
    const para = chatsPara(st, 'relatorio'), { rel, pdf } = await enviarRelatorio(para, await R.carregar(), R.hojeBahia());
    const foiEmail = await emailAuto(st, 'relatorio', rel.titulo, rel.partes, pdf ? [{ filename: rel.arquivo, content: pdf, contentType: 'application/pdf' }] : null);
    if (!para.length && !foiEmail) return { ok: false, msg: 'Ninguém escolhido para o relatório semanal (Telegram ou e-mail) em "Para quem vai".' };
    return { ok: true, enviados: para.length, email: foiEmail, falhas: pdf ? [] : ['o PDF não pôde ser montado'] };
  }
  if (b.acao === 'desligar') {
    const c = st.todas.find(x => String(x._id) === String(b.id));
    if (!c) return { ok: false, msg: 'Conversa não encontrada.' };
    await R.gravarPlan({ ...c, ativo: 'nao', desligado_em: new Date().toISOString() });
    try { await mandar(c.chat_id, 'Este Telegram foi desligado do sistema da Vixsul. Para ligar de novo, gere outro link no sistema.'); } catch (e) {}
    return estadoPublico(await estadoBanco(), true, uid);
  }
  if (b.acao === 'salvar') {
    const c = b.cfg || {}, mud = {};
    ['resumo', 'aviso_reuniao', 'aviso_tarde', 'aviso_aportes', 'relatorio_semanal', 'alerta_caixa', 'aviso_chuva', 'fechamento_mes', 'email_caixa'].forEach(k => { if (c[k] != null) mud[k] = c[k] === 'nao' ? 'nao' : 'sim'; });
    if (c.cobranca_dias != null) mud.cobranca_dias = String(Math.min(180, Math.max(0, parseInt(c.cobranca_dias, 10) || 0)));
    if (/^\d{2}:\d{2}$/.test(c.resumo_hora || '')) mud.resumo_hora = c.resumo_hora;
    if (c.aviso_reuniao_min != null) mud.aviso_reuniao_min = String(Math.min(240, Math.max(10, +c.aviso_reuniao_min || 60)));
    if (MODELOS.includes(c.modelo_ia)) mud.modelo_ia = c.modelo_ia;
    if (c.esforco_ia) mud.esforco_ia = c.esforco_ia === 'medium' ? 'medium' : 'low';
    if (b.resumoChat && b.resumoChat.id) { const x = st.todas.find(y => String(y._id) === String(b.resumoChat.id)); if (x) await R.gravarPlan({ ...x, resumo: b.resumoChat.resumo === 'nao' ? 'nao' : 'sim' }); }
    // para quem vai cada aviso: só conversas ligadas de verdade e e-mails válidos
    if (b.destinos && typeof b.destinos === 'object') {
      const ids = new Set(st.chats.map(c => String(c._id))), dest = {};
      AUTOS.forEach(k => { const d = b.destinos[k]; if (!d || typeof d !== 'object') return; const o = {};
        if (Array.isArray(d.chats)) o.chats = d.chats.map(String).filter(id => ids.has(id));
        if (COM_EMAIL.includes(k) && d.emails != null) o.emails = E.emailsDe(d.emails).join(', ');
        dest[k] = o; });
      mud.destinos = dest;
    }
    if (Object.keys(mud).length) await gravarCfg(st, mud);
    return estadoPublico(await estadoBanco(), true, uid);
  }
  return { ok: false, msg: 'Ação desconhecida.' };
}

module.exports = async (req, res) => {
  const responder = (st, o) => { res.statusCode = st; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(o)); };
  const corpo = () => (typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch (e) { return {}; } })() : req.body) || {};
  if (!CHAVE_SB) return responder(500, { ok: false, msg: 'Falta a chave de serviço do banco na Vercel.' });
  // 1) o Telegram entregando mensagem (webhook): confere a senha do cabeçalho; responde 200 sempre (senão ele repete)
  const segredo = req.headers['x-telegram-bot-api-secret-token'];
  if (req.method === 'POST' && segredo != null) {
    if (!TOKEN || !iguais(segredo, segredoWebhook())) return responder(401, { ok: false });
    try { await aoReceber(corpo()); } catch (e) { console.error('telegram', e && e.message); try { const u = corpo(), ch = (u.message && u.message.chat && u.message.chat.id) || (u.callback_query && u.callback_query.message && u.callback_query.message.chat.id); if (ch) await mandar(ch, 'Deu um erro aqui: ' + esc(String(e.message || e).slice(0, 200)) + '. Tente de novo.'); } catch (x) {} }
    return responder(200, { ok: true });
  }
  cors(req, res);
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  try {
    // 2) a tarefa agendada (GitHub) — e um estado mínimo, sem dados, para conferir se está configurado
    if (req.method === 'GET') {
      if (req.query && req.query.tick) return responder(200, await tick());
      return responder(200, { ok: true, token: !!TOKEN, ia: !!CHAVE_IA, email: E.emailPronto(), ...(await BOT.estadoGroq().catch(e => ({ groq: BOT.temGroq(), groqOk: false, groqMsg: e.message }))), caixa: await BOT.infoCaixa() });
    }
    if (req.method !== 'POST') return responder(405, { ok: false, msg: 'Use GET ou POST.' });
    // 3) o sistema (Administrador logado)
    const l = exigirLogin(req);
    if (!l.ok) return responder(401, { ok: false, sair: true, msg: 'A sessão terminou. Entre no sistema de novo.' });
    if (!ORIGENS.some(r => r.test(req.headers.origin || ''))) return responder(403, { ok: false, msg: 'Origem não permitida.' });
    if (l.p && !l.p.adm) return responder(403, { ok: false, msg: 'Só o Administrador liga o Telegram.' });
    return responder(200, await acaoSistema(corpo(), l));
  } catch (e) {
    return responder(500, { ok: false, msg: (e && e.message) || String(e) });
  }
};
