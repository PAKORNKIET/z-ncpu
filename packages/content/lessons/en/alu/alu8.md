# 8-bit ALU

op (3 bits) matches the func field of Z8 group-01 instructions: 000 ADD, 001 SUB, 010 AND, 011 OR, 100 XOR, 101 NOT a, 110 unused (0), 111 CMP (same as SUB). Outputs y plus flags z (y = 0), n (bit 7 of y) and c (adder carry-out; SUB/CMP compute a + NOT b + 1, so c = 1 means a ≥ b; logic ops give c = 0). Compute everything in parallel and select by op.
