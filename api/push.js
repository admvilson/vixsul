/* NOTIFICAÇÕES NO APP — o que o sistema (logado) pede ao servidor. A lógica fica em _push.js.
   POST { acao }:
   - estado            → se o servidor está pronto, a chave pública (para o aparelho se inscrever) e os aparelhos do usuário
   - inscrever {sub}   → liga as notificações neste aparelho para o usuário do passe
   - sair {endpoint}   → desliga neste aparelho (também ao sair do sistema)
   - testar            → manda uma notificação de teste para os aparelhos do próprio usuário
   - mensagens         → a caixa de entrada do usuário (só as dele) · lidas {ids|'todas'} · anexo {id} (o PDF da mensagem)
   - pessoas           → (Administrador) quem pode receber e quantos aparelhos cada um ligou
   GET → { ok, pronto } (sem dados). */
const { ORIGENS, cors, exigirLogin } = require('./_auth');
const PU = require('./_push');

module.exports = async (req, res) => {
  cors(req, res);
  const responder = (st, o) => { res.statusCode = st; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)); };
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  try {
    if (req.method === 'GET') return responder(200, { ok: true, pronto: PU.pronto() });
    if (req.method !== 'POST') return responder(405, { ok: false, msg: 'Use GET ou POST.' });
    const l = exigirLogin(req);
    if (!l.ok) return responder(401, { ok: false, sair: true, msg: 'A sessão terminou. Entre no sistema de novo.' });
    if (!ORIGENS.some(r => r.test(req.headers.origin || ''))) return responder(403, { ok: false, msg: 'Origem não permitida.' });
    if (!l.p) return responder(200, { ok: false, msg: 'As notificações precisam da segurança do login ligada na Vercel.' });
    const b = (typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch (e) { return {}; } })() : req.body) || {};
    const p = l.p;
    switch (b.acao) {
      case 'estado': return responder(200, await PU.estado(p));
      case 'inscrever': return responder(200, await PU.inscrever(p, b.sub, b.aparelho));
      case 'sair': return responder(200, await PU.sair(p, b.endpoint));
      case 'testar': {
        const r = await PU.mandar({ ids: [p.uidn] }, { titulo: 'Teste do app da Vixsul', texto: 'As notificações estão funcionando neste aparelho. Os avisos e relatórios marcados para você vão chegar assim, como no WhatsApp.', aviso: 'teste', urgente: true });
        return responder(200, { ...r, ok: r.ok !== false, msg: r.aparelhos ? '' : 'Nenhum aparelho ligado para você ainda.' });
      }
      case 'mensagens': return responder(200, await PU.mensagens(p));
      case 'lidas': return responder(200, await PU.lidas(p, b.ids));
      case 'anexo': return responder(200, await PU.anexo(p, b.id));
      case 'pessoas':
        if (!p.adm) return responder(403, { ok: false, msg: 'Só o Administrador escolhe quem recebe os avisos.' });
        return responder(200, await PU.pessoas());
      default: return responder(400, { ok: false, msg: 'Ação desconhecida.' });
    }
  } catch (e) {
    return responder(500, { ok: false, msg: (e && e.message) || String(e) });
  }
};
