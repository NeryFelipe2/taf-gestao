#!/usr/bin/env python3 -I
"""Monta public/erp.html (o ERP "TAF Admin" dentro do site) a partir de fonte/erp: shell.html + style.css + js/*.js em ordem de nome.
Rodar de qualquer pasta:  python3 -I fonte/erp/build.py
- Os manuais (fonte/erp/manuais/*.md) viram os dados da Ajuda embutida.
- A configuração (endereço do banco e chave PÚBLICA de leitura, a mesma das outras páginas do site) entra no lugar de config.js, em modo 'chave'.
- Nenhum dado das obras entra aqui: a EAP, as metas, o extrato e a ficha de cada obra ficam no banco, atrás da chave do site."""
import json, re
from pathlib import Path

AQUI = Path(__file__).resolve().parent
FONTE = AQUI.parent
PUBLIC = FONTE.parent / "public"

# endereço e chave pública do banco: os mesmos que o /marko já usa (nada é copiado à mão)
m = (FONTE / "marko.html").read_text(encoding="utf-8")
url = re.search(r"https://[a-z0-9]+\.supabase\.co", m).group(0)
chave = re.search(r"sb_publishable_[A-Za-z0-9_-]+", m).group(0)

man = {f.stem[7:]: f.read_text(encoding="utf-8") for f in sorted((AQUI / "manuais").glob("MANUAL_*.md"))}
ajuda = "/* GERADO por build.py a partir de manuais/MANUAL_*.md: não edite. */\nconst MANUAIS=" + json.dumps(man, ensure_ascii=False).replace("</", "<\\/") + ";\n"

shell = (AQUI / "shell.html").read_text(encoding="utf-8")
css = (AQUI / "style.css").read_text(encoding="utf-8").rstrip("\n")
mods = [(FONTE / "embed.js").read_text(encoding="utf-8").rstrip("\n")]   # telas dentro do Centro de Gestão
for p in sorted((AQUI / "js").glob("*.js")):
    if p.name == "40_ajuda_dados.js":
        continue
    mods.append(p.read_text(encoding="utf-8").rstrip("\n"))
    if p.name == "40_ajuda.js":
        mods.append(ajuda.rstrip("\n"))
js = "\n".join(mods)
assert "</script" not in js.lower().replace("<\\/script", ""), "um módulo fecha a tag script"

cfg = "window.TAF_CONFIG=" + json.dumps({"modo": "chave", "supabaseUrl": url, "supabaseKey": chave, "marca": "TAF"}) + ";"
assert shell.count('<script src="vendor/supabase.js"></script>') == 1 and shell.count('<script src="config.js"></script>') == 1
out = shell.replace('<script src="vendor/supabase.js"></script>\n', "").replace('<script src="config.js"></script>', "<script>" + cfg + "</script>")
out = out.replace("<title>TAF Admin</title>", "<title>ERP TAF</title>").replace("/*@@STYLE@@*/", css).replace("/*@@SCRIPT@@*/", js)
PUBLIC.mkdir(exist_ok=True)
(PUBLIC / "erp.html").write_text(out, encoding="utf-8")
print("public/erp.html", len(out) // 1024, "KB,", len(mods) - 2, "módulos")
