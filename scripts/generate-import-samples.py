"""Generate fictional CSV/XLSX examples and hostile workbook test fixtures. No external libraries."""
from pathlib import Path
import csv, io, zipfile
from xml.sax.saxutils import escape
root = Path(__file__).resolve().parent.parent
samples = root / 'samples/imports'
fixtures = root / 'tests/fixtures/imports'
samples.mkdir(parents=True, exist_ok=True); fixtures.mkdir(parents=True, exist_ok=True)
data = {
 '01-participants': [['externalId','displayName'],['DEMO-P01','Synthetic participant one'],['DEMO-P02','Synthetic participant two']],
 '02-workers': [['externalId','displayName'],['DEMO-W01','Synthetic worker one']],
 '03-support-at-home-services': [['externalId','Client ID','scheme','Service Date','workerExternalId'],['DEMO-S01','DEMO-P01','support_at_home','2026-11-20','DEMO-W01'],['DEMO-S02','','support_at_home','2026-11-20',''],['DEMO-S03','DEMO-P01','support_at_home','2026-02-30','']],
 '04-support-at-home-claims': [['externalId','Client ID','scheme','serviceExternalId','Service Date','Amount'],['DEMO-C01','DEMO-P01','support_at_home','DEMO-S01','2026-11-20','125.50'],['DEMO-C01','DEMO-P01','support_at_home','DEMO-S01','2026-11-20','125.50'],['DEMO-C02','DEMO-P01','support_at_home','DEMO-S01','2026-11-20','twelve'],['DEMO-C03','','support_at_home','DEMO-S01','2026-11-20','0.999']],
 '05-payment-remittances': [['externalId','scheme','claimExternalId','paymentDate','paymentAmount'],['DEMO-PAY01','support_at_home','DEMO-C01','2026-11-22','125.50'],['DEMO-PAY02','support_at_home','MISSING-CLAIM','2026-11-22','50.00']],
 '06-ndis-services': [['externalId','participantExternalId','scheme','serviceDate'],['DEMO-N01','DEMO-P02','ndis','2026-11-21'],['DEMO-N02','DEMO-P02','ndis','11/12/2026']],
 '07-worker-compliance': [['externalId','workerExternalId','documentType','expiryDate'],['DEMO-D01','DEMO-W01','Synthetic training certificate','2027-11-20'],['DEMO-D02','MISSING-WORKER','Synthetic screening record','2027-02-30']],
 '08-missing-columns': [['scheme','serviceDate'],['support_at_home','2026-11-20']],
}
def xlsx(rows, extras=None, formula=False):
 def col(n):
  result=''
  while n: n,r=divmod(n-1,26);result=chr(65+r)+result
  return result
 sheet='<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
 for n,row in enumerate(rows,1):
  sheet+=f'<row r="{n}">'
  for c,value in enumerate(row,1):
   sheet+=f'<c r="{col(c)}{n}" t="inlineStr"><is><t>{escape(value)}</t></is></c>'
  sheet+='</row>'
 sheet+='</sheetData></worksheet>'
 if formula: sheet=sheet.replace('</sheetData>','<row r="3"><c r="A3"><f>1+1</f><v>2</v></c></row></sheetData>')
 files={
 '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
 '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
 'xl/workbook.xml':'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Synthetic" sheetId="1" r:id="rId1"/></sheets></workbook>',
 'xl/_rels/workbook.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
 'xl/worksheets/sheet1.xml':sheet,
 }
 files.update(extras or {})
 out=io.BytesIO()
 with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
  for name,value in files.items(): z.writestr(name,value)
 return out.getvalue()
for name,rows in data.items():
 with (samples/(name+'.csv')).open('w',newline='') as f: csv.writer(f).writerows(rows)
 (samples/(name+'.xlsx')).write_bytes(xlsx(rows))
base=data['01-participants']
for name,extras,formula in [
 ('sparse',{'xl/worksheets/sheet1.xml':'<worksheet><sheetData><row r="999999999"><c r="XFD999999999"><v>1</v></c></row></sheetData></worksheet>'},False),('formula',{},True),('macro',{'xl/vbaProject.bin':'unsafe'},False),('external',{'xl/_rels/test.rels':'<Relationship TargetMode="External" Target="https://example.invalid"/>'},False),('traversal',{'../outside.xml':'unsafe'},False),('entity',{'custom.xml':'<!DOCTYPE x [<!ENTITY a "x">]><x>&a;</x>'},False),('expanded',{'large.xml':'x'*8388609},False),('multiple-sheets',{'xl/worksheets/sheet2.xml':'<worksheet/>'},False)]:
 (fixtures/(name+'.xlsx')).write_bytes(xlsx(base,extras,formula))
