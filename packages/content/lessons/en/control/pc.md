# Program Counter

The PC points at the next instruction. Each clock tick it becomes 0 if reset, in if load (jumps), out + 1 if inc (normal flow), or keeps its value. Higher rows win when several inputs are 1.
