# Stack Pointer

The stack is a last-in-first-out area in RAM. SP holds the address of the top item; on Z8 the stack starts at 0xF0 and grows downward. op 0 keeps SP, op 1 decrements it (PUSH, CALL write at SP−1), op 2 increments it (POP, RET read at SP). Output down always shows SP−1, because PUSH needs that address in the same cycle SP decrements. reset sets SP to 0xF0. Values wrap at 8 bits.
