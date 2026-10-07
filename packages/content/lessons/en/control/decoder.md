# Instruction Decoder

A Z8 instruction is 16 bits: group (2), func (3), rd (2), m (1) and an 8-bit operand. The decoder reads group, func, m and the flags and produces the **control signals** that tell every part of the CPU what to do this cycle:

- alu_op = func; reg_write for MOV, LOAD, POP and ALU ops except CMP; flag_write for group 01; mem_write for STORE, PUSH, CALL; src_sel = m.
- wb_sel: 0 ALU, 1 RAM (LOAD, POP), 2 src (MOV). addr_sel: 0 src, 1 SP (POP, RET), 2 SP−1 (PUSH, CALL).
- sp_op: 0 keep, 1 decrement (PUSH, CALL), 2 increment (POP, RET).
- pc_sel: 0 PC+1, 1 src (taken jump, CALL), 2 RAM (RET). Conditional jumps only jump when their flag condition holds.
- mem_src: 1 for CALL (write PC+1). halt for HALT. Unused opcodes behave like NOP.
