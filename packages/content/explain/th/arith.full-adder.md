## หลักการ
บวก 3 บิต (a, b และตัวทดจากหลักก่อน cin) ได้ผล 0–3 คือบวก a + b ก่อน แล้วบวกผลนั้นกับ cin
- x = a XOR b
- **sum** = x XOR cin
- **cout** = (a AND b) OR (x AND cin) คือทดเมื่อ a, b เป็น 1 ทั้งคู่ หรือเมื่อ a ต่างกับ b และ cin = 1

## ต่ออย่างไร
- nand1–nand4: XOR ของ a, b ได้ x (nand1 = NAND(a, b))
- nand5–nand8: XOR ของ x กับ cin ได้ **sum** (nand5 = NAND(x, cin))
- nand9: NAND(nand1, nand5) ได้ **cout**

## ทำไมต้องแบบนี้
nand1 คือ NOT(a AND b) และ nand5 คือ NOT(x AND cin) ซึ่งเป็นค่าที่มีอยู่แล้วในวงจร XOR ทั้งสองตัว NAND ของสองค่านี้ก็คือ OR ของสองกรณีที่ต้องทด ใช้ NAND 9 ตัว ซึ่งน้อยที่สุด
