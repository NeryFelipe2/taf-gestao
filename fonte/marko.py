# Gera public/marko.html (página só do Marko) a partir de fonte/marko.html, com o logo e o núcleo do ciclo (ciclo-core.js) embutidos.
import base64,io,os
from PIL import Image
t=open('marko.html',encoding='utf-8').read()
im=Image.open(io.BytesIO(base64.b64decode(open('logo_canto.b64').read())))
w=200;h=round(im.size[1]*w/im.size[0]);im=im.resize((w,h),Image.LANCZOS)
b=io.BytesIO();im.save(b,'WEBP',quality=60,alpha_quality=40,method=6)
assert t.count('/*LOGOCANTO*/')==1
t=t.replace('/*LOGOCANTO*/',base64.b64encode(b.getvalue()).decode())
core=open('ciclo-core.js',encoding='utf-8').read()+'\n'+open('ciclo-erp.js',encoding='utf-8').read()+'\n'+open('embed.js',encoding='utf-8').read()   # núcleo + ligação com o ERP
assert '</'+'script' not in core.lower() and '<'+'!--' not in core
assert t.count('/*CICLOCORE*/')==1
t=t.replace('/*CICLOCORE*/',core)
open(os.path.join('..','public','marko.html'),'w',encoding='utf-8').write(t)
print(len(t))
