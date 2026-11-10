from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
import sys,json
folder=Path(sys.argv[1]);views=json.loads((folder/'orientation-views.json').read_text())['views']
for name,order in [('orientation-sheet-a.png',list(range(8))),('orientation-sheet-b.png',[5,2,7,0,3,6,1,4])]:
 sheet=Image.new('RGB',(1280,720),'white');draw=ImageDraw.Draw(sheet);font=ImageFont.load_default(size=24)
 for k,index in enumerate(order):
  v=views[index];im=Image.open(folder/v['file']).convert('RGB').resize((320,320));x=(k%4)*320;y=(k//4)*360;sheet.paste(im,(x,y+36));draw.text((x+10,y+10),'V'+str(v['id']),fill='black',font=font)
 sheet.save(folder/name)
