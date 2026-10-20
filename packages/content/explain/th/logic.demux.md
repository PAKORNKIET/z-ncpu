## หลักการ
DEMUX กลับด้านกับ MUX: ส่ง **in** ไปทางเดียวตาม sel และอีกทางเป็น 0 ถ้า sel = 0 ไปที่ a, sel = 1 ไปที่ b

- b = in AND sel
- a = in AND NOT sel

## ต่ออย่างไร
- nand1: in, sel และ nand2: ขาออกของ nand1 ทั้งสองขา ได้ **b** = in AND sel
- nand3: in กับขาออกของ nand1 ได้ NOT(in AND NOT sel)
- nand4: ขาออกของ nand3 ทั้งสองขา ได้ **a** = in AND NOT sel

## ทำไมต้องแบบนี้
NAND(in, NAND(in, sel)) จะเป็น 0 เฉพาะตอน in = 1 และ sel = 0 จึงได้ "in AND NOT sel" โดยไม่ต้องสร้าง NOT sel แยก ใช้ NAND 4 ตัว ภายหลัง DEMUX ใช้ส่งคำสั่ง "เขียน" ไปที่ช่องหน่วยความจำช่องเดียว
