const { getSistemaData, cors } = require('./_db');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const data = await getSistemaData();
    res.json(data);
  } catch (e) {
    res.status(500).json({ ok: false, msg: e.message });
  }
};
