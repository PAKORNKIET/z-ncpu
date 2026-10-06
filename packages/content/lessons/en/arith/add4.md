# 4-bit Adder

Inputs **a** and **b** are 4-bit **buses** (values 0–15). Compute **sum = a + b + cin**, with the overflow bit on **cout** (for example 9 + 8 = 17 gives sum = 1, cout = 1).

Use the **Splitter** to break a bus into bits b0–b3 (**b0 is the least significant bit**) and the **Merger** to join bits back into a bus. Chain four Full Adders so each cout feeds the next cin. The test checks all 512 cases.
