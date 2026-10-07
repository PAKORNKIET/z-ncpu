# Register file

Z8 has four general-purpose registers A, B, C, D (numbers 0–3). The register file has two read ports (x = register rd, y = register rs, combinational) and one write port: on the rising clock edge, if write = 1, register rd takes the value of in. reset = 1 clears all four to 0 and wins over write. Outputs a, b, c, d expose each register for debugging. rd selects both the x read and the write target because Z8 instructions like `ADD rd, src` read rd and write the result back to it.
