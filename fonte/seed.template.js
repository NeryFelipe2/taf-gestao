// Atualiza a leitura da rev6 no banco (Supabase). Gerado por fonte/gerar-seed.js; não editar à mão.
// Uso: GET /api/seed?k=<chave de acesso>. Só grava a leitura embutida abaixo.
const URL_ = 'https://vblfdikfobsirwpdnybw.supabase.co/rest/v1/rpc/';
const KEY = 'sb_publishable_pXs7_21V-PWatZ0iqZJ_ew_1Rm3JogW';
const FONTE = /*FONTE*/;
const SNAP = /*SNAP*/;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const k = String((req.query && req.query.k) || '');
  if (!k) return res.status(400).json({ erro: 'falta a chave (?k=)' });
  try {
    const r = await fetch(URL_ + 'taf_snap_salvar', {
      method: 'POST',
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_chave: k, p_snap: SNAP, p_fonte: FONTE, p_quem: 'Claude' }),
    });
    const t = await r.text();
    return res.status(r.ok ? 200 : r.status === 400 ? 403 : r.status).json({ ok: r.ok, fonte: FONTE, resposta: t.slice(0, 300) });
  } catch (e) {
    return res.status(502).json({ ok: false, erro: String(e.message || e) });
  }
};
