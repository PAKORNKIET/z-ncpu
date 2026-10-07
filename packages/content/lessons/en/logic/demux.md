# Build DEMUX

A demultiplexer does the reverse of a MUX: it routes the single input **in** to output **a** (sel = 0) or **b** (sel = 1); the unselected output is 0. Writing to RAM uses this so that only the addressed cell is written.
