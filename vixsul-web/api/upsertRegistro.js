const { supabase, NOME_PARA_CHAVE, getSistemaData, cors } = require('./_db');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const [abaNome, dados, rowId] = req.body;

    const chave  = NOME_PARA_CHAVE[abaNome] || abaNome.toLowerCase();
    const tabela = chave;

    // Remove campos internos do sistema antes de persistir
    const { rowid, visualId, _aba, ...rowData } = dados;

    let result;
    if (rowId && Number(rowId) > 0) {
      result = await supabase
        .from(tabela)
        .update({ row_data: rowData })
        .eq('id', Number(rowId));
    } else {
      result = await supabase
        .from(tabela)
        .insert({ row_data: rowData });
    }

    if (result.error) {
      return res.json({ ok: false, msg: result.error.message });
    }

    const data = await getSistemaData();
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, msg: e.message });
  }
};
