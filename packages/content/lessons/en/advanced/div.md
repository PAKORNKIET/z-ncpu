# Division with remainder

The dividend comes from the **switches** and the divisor from the **keyboard** (never 0). Show the **quotient** on the display and the **remainder** on the LEDs.

Division is repeated subtraction: subtract while A ≥ B (`CMP A, B`, `JC`), counting each time.
