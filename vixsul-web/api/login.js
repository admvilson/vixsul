const { supabase, cors } = require('./_db');

function normCpf(cpf) {
  return String(cpf || '').replace(/[.\-\s]/g, '').trim();
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const [cpf, senha] = req.body;

    const cpfInput   = normCpf(cpf);
    const senhaInput = String(senha || '').trim();

    if (!cpfInput || !senhaInput) {
      return res.json({ ok: false, msg: 'CPF e senha são obrigatórios.' });
    }

    // Busca todos os usuários com esse CPF (após normalização)
    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .limit(100);

    if (error) return res.json({ ok: false, msg: 'Erro ao acessar banco de dados.' });
    if (!data || data.length === 0) return res.json({ ok: false, msg: 'Nenhum usuário cadastrado.' });

    const usuario = data.find(u => normCpf(u.cpf) === cpfInput);

    if (!usuario) return res.json({ ok: false, msg: 'CPF não encontrado.' });

    if (String(usuario.status || 'ativo').toLowerCase() !== 'ativo') {
      return res.json({ ok: false, msg: 'Usuário inativo. Entre em contato com o administrador.' });
    }

    if (String(usuario.senha || '').trim() !== senhaInput) {
      return res.json({ ok: false, msg: 'Senha incorreta.' });
    }

    res.json({
      ok:     true,
      nome:   usuario.nome   || cpf,
      perfil: usuario.perfil || 'Usuário'
    });
  } catch (e) {
    res.status(500).json({ ok: false, msg: e.message });
  }
};
