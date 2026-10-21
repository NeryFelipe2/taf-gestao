# Gera public/marko.html (página só do Marko) a partir de fonte/marko.html, com o logo embutido.
import base64,io,os
from PIL import Image
t=open('marko.html',encoding='utf-8').read()
im=Image.open(io.BytesIO(base64.b64decode(open('logo_canto.b64').read())))
w=200;h=round(im.size[1]*w/im.size[0]);im=im.resize((w,h),Image.LANCZOS)
b=io.BytesIO();im.save(b,'WEBP',quality=60,alpha_quality=40,method=6)
assert t.count('/*LOGOCANTO*/')==1
t=t.replace('/*LOGOCANTO*/',base64.b64encode(b.getvalue()).decode())
open(os.path.join('..','public','marko.html'),'w',encoding='utf-8').write(t)
print(len(t))
