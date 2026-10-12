# Bonus: add SHR to your CPU

Z8 reserves instruction group `11` (eight func slots) for your own instructions; right now every slot acts as a NOP.

Add **SHR rd** (shift right): every bit of rd moves one place to the right and the top bit becomes 0 — integer division by two. Encoding: group 11, func 000, rd in bits 10–9. Formula: `rd = rd >> 1`. Flags are unchanged.

This level creates a new part, **Z8+ CPU**, starting from a copy of the CPU you built in chapter 7, so your original CPU and the chapter 8–9 levels are untouched. You need a shifter (pure wiring, zero NANDs), a detector for the SHR opcode, and control signals that write the shifted value back.

The test compares every debug pin with an emulator that knows SHR from its formula, and also reruns chapter 7 programs so the old instructions must still work. Afterwards, the Sandbox has a **My ISA** section where you can define more instructions with your own formulas.
