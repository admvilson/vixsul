const { supabase, NOME_PARA_CHAVE, getSistemaData, cors } = require('./_db');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const [abaNome, rowId] = req.body;

    if (!rowId || Number(rowId) <= 0) {
      return res.json({ ok: false, msg: 'Registro inválido.' });
    }

    const chave  = NOME_PARA_CHAVE[abaNome] || abaNome.toLowerCase();
    const tabela = chave;

    const result = await supabase
      .from(tabela)
      .delete()
      .eq('id', Number(rowId));

    if (result.error) {
      return res.json({ ok: false, msg: result.error.message });
    }

    const data = await getSistemaData();
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, msg: e.message });
  }
};
