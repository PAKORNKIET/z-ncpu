# SR Latch

Your first circuit that **remembers**. s = 1 sets q to 1, r = 1 resets q to 0, and with both at 0 the latch keeps its last value. Never set both to 1.

This level is tested as a **sequence** over time. The trick is **feedback**: wire an output back into an input. The simulator handles loops like this.
