# Fibonacci sequence

Start with 1, 1; each next term is the sum of the previous two. Show every term **up to 255** on the display, then HALT. The display only counts changes, so it should show **1, 2, 3, 5, 8, …, 233**.

When a sum goes past 255 the 8-bit result wraps around, but the ALU sets the **carry flag C**, so `JC` can leave the loop.
