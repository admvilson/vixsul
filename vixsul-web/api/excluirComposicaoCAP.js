const { supabase, cors } = require('./_db');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const [dataLancamento, tituloObra] = req.body;

    const { error } = await supabase
      .from('cap')
      .delete()
      .filter('row_data->>data_lancamento', 'eq', dataLancamento)
      .filter('row_data->>titulo_obra',     'eq', tituloObra);

    if (error) return res.json({ ok: false, msg: error.message });

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, msg: e.message });
  }
};
