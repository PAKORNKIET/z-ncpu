# Multiply two 4-bit numbers

Z8 has no multiply instruction. The switches hold **a in the upper 4 bits and b in the lower 4 bits**; show **a × b**.

Split first: subtract 16 while the value is ≥ 16 (`CMP A, 16` then `JC`); the count is a and the rest is b. Then multiply by adding b to a total a times.
