import base64, hashlib, io, os
from PIL import Image

# Gera ../public/ciclo.html: logo no /*LOGOCANTO*/, núcleo (ciclo-core.js) no /*CICLOCORE*/ e o hash da versão no /*VERSAO*/.
t = open('ciclo.html', encoding='utf-8').read()
core = open('ciclo-core.js', encoding='utf-8').read() + '\n' + open('ciclo-erp.js', encoding='utf-8').read() + '\n' + open('embed.js', encoding='utf-8').read()   # núcleo + ligação com o ERP
assert '</script' not in core.lower() and '<!--' not in core, 'o núcleo não pode fechar a tag script'

im = Image.open(io.BytesIO(base64.b64decode(open('logo_canto.b64').read())))
w = 200; h = round(im.size[1] * w / im.size[0]); im = im.resize((w, h), Image.LANCZOS)
b = io.BytesIO(); im.save(b, 'WEBP', quality=60, alpha_quality=40, method=6)
logo = base64.b64encode(b.getvalue()).decode()

assert t.count('/*LOGOCANTO*/') == 1
assert t.count('/*CICLOCORE*/') == 1
assert t.count('/*VERSAO*/') == 2
versao = hashlib.sha256((t + core + logo).encode('utf-8')).hexdigest()[:10]

# a versão entra primeiro (só no molde); o núcleo entra por último, para nenhum marcador dele ser trocado
t = t.replace('/*VERSAO*/', versao)
t = t.replace('/*LOGOCANTO*/', logo)
a, z = t.split('/*CICLOCORE*/')
t = a + core + z
open(os.path.join('..', 'public', 'ciclo.html'), 'w', encoding='utf-8').write(t)
print(len(t), versao)
