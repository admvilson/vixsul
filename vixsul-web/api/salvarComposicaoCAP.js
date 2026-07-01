const { supabase, cors } = require('./_db');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const [dataLancamento, tituloObra, itens, isEdicao] = req.body;

    // Em edição, remove as linhas antigas da composição antes de reinserir
    if (isEdicao) {
      const { error: delErr } = await supabase
        .from('cap')
        .delete()
        .filter('row_data->>data_lancamento', 'eq', dataLancamento)
        .filter('row_data->>titulo_obra',     'eq', tituloObra);

      if (delErr) return res.json({ ok: false, msg: delErr.message });
    }

    if (itens && itens.length > 0) {
      const linhas = itens.map(item => ({
        row_data: {
          data_lancamento: dataLancamento,
          titulo_obra:     tituloObra,
          ...item
        }
      }));

      const { error: insErr } = await supabase.from('cap').insert(linhas);
      if (insErr) return res.json({ ok: false, msg: insErr.message });
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, msg: e.message });
  }
};
