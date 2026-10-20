## หลักการ
CPU single-cycle ทำหนึ่งคำสั่งต่อหนึ่งจังหวะ ทุกอย่างเป็นวงจรที่ไหลต่อกันในจังหวะเดียว แล้ว register ทุกตัว (rd, flags, RAM, SP, PC) รับค่าใหม่พร้อมกันตอนขอบนาฬิกา

## ต่ออย่างไร
- **Fetch**: PC → addr ของ ROM256 (data = prog) ได้คำสั่ง 16 บิต
- **Decode**: แยกคำสั่งเป็น operand (บิต 0–7), m (8), rd (9–10), func (11–13), group (14–15) แล้วเข้า Decoder
- **Read**: Register file อ่าน rd ออก x และ rs (บิต 0–1 ของ operand) ออก y แล้ว MUX8 ใช้ src_sel เลือก src = y หรือค่าคงที่
- **Execute**: ALU คำนวณ x กับ src ตาม alu_op และ flags เข้า BIT 3 ตัว (เขียนเมื่อ flag_write)
- **Memory**: SEL4 ใช้ addr_sel เลือก address จาก src, SP หรือ SP − 1 ส่วนข้อมูลที่เขียนมาจาก rd หรือ PC + 1 (CALL) ถ้า address ≥ 0xF0 ส่งไป I/O (จอ, LED, 7-segment, สวิตช์) แทน RAM
- **Write back**: SEL4 ใช้ wb_sel เลือกผล ALU, ค่าจาก RAM/I/O หรือ src กลับเข้า register file
- **Next PC**: pc_sel เลือก PC + 1, src (กระโดด) หรือค่าจาก RAM (RET) และ halt หยุด PC ไว้ที่เดิม

## ทำไมต้องแบบนี้
แต่ละส่วนคือชิ้นที่คุณสร้างและทดสอบแล้วในบทก่อนๆ ด่านนี้แค่ต่อ "ทางเดินข้อมูล" ให้ตรงกับตารางของ Decoder ถ้าผิด เกมจะบอก cycle และคำสั่งที่ทำให้ค่าเพี้ยน ให้ใช้ Why? ไล่ย้อนจากขาที่ผิด
